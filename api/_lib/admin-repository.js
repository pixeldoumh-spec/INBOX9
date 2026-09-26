import { getPool, withTransaction } from './db.js';
import crypto from 'node:crypto';
import { listProviderAdapters } from './provider-registry.js';

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    active: row.active,
    displayName: row.display_name || '',
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).getTime() : null,
    balancePaise: Number(row.balance_paise || 0),
    rechargeCount: Number(row.recharge_count || 0),
    activationCount: Number(row.activation_count || 0),
  };
}

function mapService(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    country: row.country,
    currency: row.currency,
    pricePaise: Number(row.price_paise),
    availability: row.availability,
    stock: Number(row.stock),
    active: Boolean(row.active),
    routedProviders: Number(row.routed_providers || 0),
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function mapActivation(row) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    serviceId: row.service_id,
    service: row.service_name,
    number: row.phone_number,
    country: row.country,
    pricePaise: Number(row.price_paise),
    status: row.status,
    otp: row.otp,
    providerId: row.provider_id,
    providerActivationId: row.provider_activation_id,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function audit(client, adminUserId, action, targetType, targetId, metadata = {}) {
  await client.query(
    `INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id('AUD'), adminUserId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

export async function getAdminOverview() {
  const pool = await getPool();
  const [users, activations, recharges, wallets, approved, debits] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE active=TRUE`),
    pool.query(`SELECT COUNT(*)::int AS count FROM activations WHERE status='Active'`),
    pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paise) FILTER (WHERE status='Pending'),0)::bigint AS pending_paise FROM recharge_requests`),
    pool.query(`SELECT COALESCE(SUM(balance_paise),0)::bigint AS balance_paise FROM wallets`),
    pool.query(`SELECT COALESCE(SUM(amount_paise),0)::bigint AS amount_paise FROM recharge_requests WHERE status='Approved'`),
    pool.query(`SELECT COALESCE(SUM(amount_paise),0)::bigint AS amount_paise FROM wallet_ledger WHERE entry_type='debit'`),
  ]);
  return {
    users: users.rows[0].count,
    activeActivations: activations.rows[0].count,
    rechargeRequests: recharges.rows[0].count,
    pendingRechargePaise: Number(recharges.rows[0].pending_paise),
    walletBalancePaise: Number(wallets.rows[0].balance_paise),
    approvedRechargePaise: Number(approved.rows[0].amount_paise),
    totalDebitsPaise: Number(debits.rows[0].amount_paise),
  };
}

export async function listAdminUsers(filters = {}) {
  const input = typeof filters === 'number' ? { limit: filters } : (filters || {});
  const safeLimit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const safeOffset = Math.min(Math.max(Number(input.offset) || 0, 0), 100_000);
  const query = String(input.query || '').trim().slice(0, 120);
  const role = ['all','user','admin'].includes(String(input.role)) ? String(input.role) : 'all';
  const status = ['all','active','disabled'].includes(String(input.status)) ? String(input.status) : 'all';
  const escapedQuery = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escapedQuery + '%';
  const where = `($1='' OR u.email ILIKE $2 ESCAPE '\\' OR COALESCE(u.display_name,'') ILIKE $2 ESCAPE '\\' OR u.id ILIKE $2 ESCAPE '\\')
    AND ($3='all' OR u.role=$3)
    AND ($4='all' OR ($4='active' AND u.active=TRUE) OR ($4='disabled' AND u.active=FALSE))`;
  const pool = await getPool();
  const [summary,result] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE u.active=TRUE)::int AS active,
      COUNT(*) FILTER (WHERE u.active=FALSE)::int AS disabled,
      COUNT(*) FILTER (WHERE u.role='admin')::int AS admins
      FROM users u WHERE ${where}`, [query,pattern,role,status]),
    pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at,u.updated_at,u.display_name,
              COALESCE(w.balance_paise,0) AS balance_paise,
              (SELECT MAX(COALESCE(s.last_used_at,s.created_at)) FROM sessions s WHERE s.user_id=u.id) AS last_activity_at,
              (SELECT COUNT(*) FROM recharge_requests r WHERE r.user_id=u.id)::int AS recharge_count,
              (SELECT COUNT(*) FROM activations a WHERE a.user_id=u.id)::int AS activation_count
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id
       WHERE ${where}
       ORDER BY u.active DESC,u.created_at DESC,u.id
       LIMIT $5 OFFSET $6`, [query,pattern,role,status,safeLimit,safeOffset])
  ]);
  const total = Number(summary.rows[0].total || 0);
  return {
    users: result.rows.map(mapUser),
    summary: {
      total,
      active: Number(summary.rows[0].active||0),
      disabled: Number(summary.rows[0].disabled||0),
      admins: Number(summary.rows[0].admins||0)
    },
    pagination: { limit: safeLimit, offset: safeOffset, hasMore: safeOffset + result.rows.length < total }
  };
}
function adminUserNotFound(){return Object.assign(new Error('User not found'),{statusCode:404});}

export async function getAdminUser(userId) {
  const pool=await getPool();
  const target=String(userId||'').trim();
  const userResult=await pool.query(`SELECT u.id,u.email,u.role,u.active,u.created_at,u.updated_at,u.display_name,u.password_changed_at,
    COALESCE(w.balance_paise,0) AS balance_paise,
    (SELECT COUNT(*) FROM recharge_requests r WHERE r.user_id=u.id)::int AS recharge_count,
    (SELECT COUNT(*) FROM activations a WHERE a.user_id=u.id)::int AS activation_count,
    (SELECT COUNT(*) FROM support_requests s WHERE s.user_id=u.id)::int AS support_count
    FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE u.id=$1`,[target]);
  if(!userResult.rowCount)throw adminUserNotFound();
  const [sessions,recharges,activations,support]=await Promise.all([
    pool.query(`SELECT session_id,created_at,last_used_at,expires_at,revoked_at FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[target]),
    pool.query(`SELECT id,amount_paise,utr,payment_method,status,submitted_at,reviewed_at,rejection_reason,external_reference FROM recharge_requests WHERE user_id=$1 ORDER BY submitted_at DESC LIMIT 8`,[target]),
    pool.query(`SELECT a.id,a.service_id,s.name AS service_name,a.status,a.price_paise,a.phone_number,a.otp,a.created_at,a.expires_at,a.updated_at
      FROM activations a LEFT JOIN services s ON s.id=a.service_id WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 8`,[target]),
    pool.query(`SELECT id,category,subject,status,created_at,updated_at FROM support_requests WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 6`,[target])
  ]);
  const row=userResult.rows[0];
  return {
    user:mapUser(row),
    summary:{supportCount:Number(row.support_count||0),activeSessions:sessions.rows.filter(s=>!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now()).length},
    sessions:sessions.rows.map(s=>({id:s.session_id,createdAt:new Date(s.created_at).getTime(),lastUsedAt:s.last_used_at?new Date(s.last_used_at).getTime():null,expiresAt:new Date(s.expires_at).getTime(),revokedAt:s.revoked_at?new Date(s.revoked_at).getTime():null,active:!s.revoked_at&&new Date(s.expires_at).getTime()>Date.now()})),
    recharges:recharges.rows.map(r=>({id:r.id,amountPaise:Number(r.amount_paise),utr:r.utr,paymentMethod:r.payment_method,status:r.status,submittedAt:new Date(r.submitted_at).getTime(),reviewedAt:r.reviewed_at?new Date(r.reviewed_at).getTime():null,rejectionReason:r.rejection_reason,externalReference:r.external_reference})),
    activations:activations.rows.map(a=>({id:a.id,serviceId:a.service_id,service:a.service_name,status:a.status,pricePaise:Number(a.price_paise),number:a.phone_number,otp:a.otp,createdAt:new Date(a.created_at).getTime(),expiresAt:new Date(a.expires_at).getTime(),updatedAt:new Date(a.updated_at).getTime()})),
    support:support.rows.map(s=>({id:s.id,category:s.category,subject:s.subject,status:s.status,createdAt:new Date(s.created_at).getTime(),updatedAt:new Date(s.updated_at).getTime()}))
  };
}

export async function setAdminUserActive(adminUserId,targetUserId,active){
  return withTransaction(async client=>{
    const targetId=String(targetUserId||'').trim();
    const current=await client.query('SELECT id,email,role,active,session_version FROM users WHERE id=$1 FOR UPDATE',[targetId]);
    if(!current.rowCount)throw adminUserNotFound();
    const row=current.rows[0];
    if(row.id===adminUserId)throw Object.assign(new Error('You cannot change your own admin account status'),{statusCode:400});
    const next=Boolean(active);
    if(!next && row.role==='admin') {
      const adminCount = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND active=TRUE AND id<>$1`, [row.id]);
      if(Number(adminCount.rows[0].count || 0) < 1) {
        throw Object.assign(new Error('At least one active admin account must remain enabled'), { statusCode: 400 });
      }
    }
    if(row.active===next)return {id:row.id,email:row.email,role:row.role,active:row.active,changed:false,revokedSessions:0};
    const updated=await client.query('UPDATE users SET active=$2,session_version=$3,updated_at=NOW() WHERE id=$1 RETURNING id,email,role,active',[row.id,next,Number(row.session_version||1)+1]);
    let revokedSessions=0;
    if(!next){const deleted=await client.query('DELETE FROM sessions WHERE user_id=$1',[row.id]);revokedSessions=deleted.rowCount;}
    await audit(client,adminUserId,next?'user.enabled':'user.disabled','user',row.id,{email:row.email,beforeActive:row.active,afterActive:next,revokedSessions});
    return {...updated.rows[0],changed:true,revokedSessions};
  });
}

export async function revokeAdminUserSessions(adminUserId,targetUserId){
  return withTransaction(async client=>{
    const targetId=String(targetUserId||'').trim();
    const current=await client.query('SELECT id,email,session_version FROM users WHERE id=$1 FOR UPDATE',[targetId]);
    if(!current.rowCount)throw adminUserNotFound();
    const row=current.rows[0];
    if(row.id===adminUserId)throw Object.assign(new Error('Use your own sign out controls to revoke your admin session'),{statusCode:400});
    await client.query('UPDATE users SET session_version=$2,updated_at=NOW() WHERE id=$1',[row.id,Number(row.session_version||1)+1]);
    const deleted=await client.query('DELETE FROM sessions WHERE user_id=$1',[row.id]);
    await audit(client,adminUserId,'user.sessions_revoked','user',row.id,{email:row.email,revokedSessions:deleted.rowCount});
    return {revokedSessions:deleted.rowCount};
  });
}

export async function listAdminServices(filters = {}) {
  const input = typeof filters === 'number' ? { limit: filters } : (filters || {});
  const safeLimit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const safeOffset = Math.min(Math.max(Number(input.offset) || 0, 0), 100_000);
  const query = String(input.query || '').trim().slice(0, 120);
  const status = ['all', 'active', 'inactive'].includes(String(input.status)) ? String(input.status) : 'active';
  const escapedQuery = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escapedQuery + '%';
  const where = `($1='' OR s.name ILIKE $2 ESCAPE '\\\\' OR s.id ILIKE $2 ESCAPE '\\\\' OR s.category ILIKE $2 ESCAPE '\\\\')
    AND ($3='all' OR ($3='active' AND s.active=TRUE) OR ($3='inactive' AND s.active=FALSE))`;
  const pool = await getPool();
  const [summary, result] = await Promise.all([
    pool.query(`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s.active=TRUE)::int AS active,
      COUNT(*) FILTER (WHERE s.active=FALSE)::int AS inactive
      FROM services s WHERE ${where}`, [query, pattern, status]),
    pool.query(`SELECT s.id,s.name,s.category,s.country,s.currency,s.price_paise,s.availability,s.stock,s.active,s.catalog_position,s.created_at,s.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'providerId',p.id,
              'providerName',p.name,
              'adapterKey',p.adapter_key,
              'providerActive',p.active,
              'providerPriority',p.priority,
              'priority',r.priority,
              'active',r.active
            )
            ORDER BY r.active DESC,r.priority,p.priority,p.id
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS routes
      FROM services s
      LEFT JOIN service_provider_routes r ON r.service_id=s.id
      LEFT JOIN providers p ON p.id=r.provider_id
      WHERE ${where}
      GROUP BY s.id
      ORDER BY s.active DESC, s.catalog_position NULLS LAST, s.name, s.id
      LIMIT $4 OFFSET $5`, [query, pattern, status, safeLimit, safeOffset]),
  ]);
  return {
    services: result.rows.map(row => ({
      ...mapService(row),
      catalogPosition: row.catalog_position == null ? null : Number(row.catalog_position),
      routes: Array.isArray(row.routes) ? row.routes : [],
    })),
    summary: {
      total: Number(summary.rows[0].total || 0),
      active: Number(summary.rows[0].active || 0),
      inactive: Number(summary.rows[0].inactive || 0),
    },
    pagination: { limit: safeLimit, offset: safeOffset, hasMore: safeOffset + result.rows.length < Number(summary.rows[0].total || 0) },
  };
}

async function readServiceRoutes(client, serviceId) {
  const result = await client.query(
    `SELECT r.service_id,r.provider_id,r.priority,r.active,
            p.name AS provider_name,p.adapter_key,p.active AS provider_active,p.priority AS provider_priority
     FROM service_provider_routes r
     JOIN providers p ON p.id=r.provider_id
     WHERE r.service_id=$1
     ORDER BY r.active DESC,r.priority,p.priority,p.id`,
    [serviceId],
  );
  return result.rows.map(row => ({
    serviceId: row.service_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    adapterKey: row.adapter_key,
    providerActive: Boolean(row.provider_active),
    providerPriority: Number(row.provider_priority || 0),
    priority: Number(row.priority),
    active: Boolean(row.active),
  }));
}

async function validateAndNormalizeRoutes(client, routes) {
  if (!Array.isArray(routes)) throw new Error('Routes must be an array');
  if (routes.length > 25) throw new Error('A service can have at most 25 provider routes');
  const seen = new Set();
  const normalized = routes.map((route, index) => {
    const providerId = String(route?.providerId || '').trim();
    if (!providerId) throw new Error(`Route ${index + 1}: provider id is required`);
    if (seen.has(providerId)) throw new Error(`Route ${index + 1}: provider is duplicated`);
    seen.add(providerId);
    const priority = route?.priority === undefined ? 100 + index : Number(route.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 10000) {
      throw new Error(`Route ${index + 1}: priority must be an integer between 1 and 10000`);
    }
    return { providerId, priority, active: Boolean(route?.active) };
  });
  if (!normalized.length) return normalized;
  const ids = normalized.map(route => route.providerId);
  const providerResult = await client.query(
    `SELECT id,name,adapter_key,active,priority FROM providers WHERE id = ANY($1::text[])`,
    [ids],
  );
  const providers = new Map(providerResult.rows.map(row => [row.id, row]));
  const installed = new Set(listProviderAdapters());
  for (const route of normalized) {
    const provider = providers.get(route.providerId);
    if (!provider) throw new Error(`Provider not found: ${route.providerId}`);
    if (!installed.has(provider.adapter_key)) throw new Error(`Provider adapter is not installed: ${provider.adapter_key}`);
    if (route.active && !provider.active) throw new Error(`Provider is inactive: ${provider.name}`);
  }
  return normalized;
}

export async function updateService(adminUserId, serviceId, patch = {}) {
  const allowedAvailability = new Set(['high', 'medium', 'low']);
  return withTransaction(async client => {
    const current = await client.query('SELECT * FROM services WHERE id=$1 FOR UPDATE', [serviceId]);
    if (!current.rowCount) throw new Error('Service not found');
    const row = current.rows[0];
    const beforeRoutes = await readServiceRoutes(client, serviceId);
    const pricePaise = patch.pricePaise === undefined ? row.price_paise : Number(patch.pricePaise);
    const stock = patch.stock === undefined ? row.stock : Number(patch.stock);
    const active = patch.active === undefined ? Boolean(row.active) : Boolean(patch.active);
    const availability = patch.availability === undefined ? String(row.availability) : String(patch.availability);
    if (!Number.isInteger(pricePaise) || pricePaise < 0 || pricePaise > 100000000) throw new Error('Price must be an integer between ₹0 and ₹1,000,000');
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Stock must be an integer between 0 and 1,000,000');
    if (!allowedAvailability.has(availability)) throw new Error('Availability must be high, medium or low');

    let afterRoutes = beforeRoutes;
    if (Object.prototype.hasOwnProperty.call(patch, 'routes')) {
      const desiredRoutes = await validateAndNormalizeRoutes(client, patch.routes);
      await client.query('UPDATE service_provider_routes SET active=FALSE WHERE service_id=$1', [serviceId]);
      for (const route of desiredRoutes) {
        await client.query(
          `INSERT INTO service_provider_routes (service_id,provider_id,priority,active)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (service_id,provider_id)
           DO UPDATE SET priority=EXCLUDED.priority,active=EXCLUDED.active`,
          [serviceId, route.providerId, route.priority, route.active],
        );
      }
      afterRoutes = await readServiceRoutes(client, serviceId);
    }

    const usableRoutes = afterRoutes.filter(route => route.active && route.providerActive);
    if (active && usableRoutes.length === 0) {
      throw new Error('An active service must have at least one active route to an active provider');
    }

    const updated = await client.query(
      `UPDATE services SET price_paise=$2, stock=$3, active=$4, availability=$5, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [serviceId, pricePaise, stock, active, availability],
    );
    const auditAction = Object.prototype.hasOwnProperty.call(patch, 'routes') ? 'service.routing_updated' : 'service.updated';
    await audit(client, adminUserId, auditAction, 'service', serviceId, {
      before: {
        pricePaise: Number(row.price_paise),
        stock: Number(row.stock),
        active: Boolean(row.active),
        availability: row.availability,
        routes: beforeRoutes,
      },
      after: {
        pricePaise,
        stock,
        active,
        availability,
        routes: afterRoutes,
      },
    });
    return {
      ...mapService(updated.rows[0]),
      catalogPosition: updated.rows[0].catalog_position == null ? null : Number(updated.rows[0].catalog_position),
      routes: afterRoutes,
    };
  });
}
export async function listAdminActivations(filters = {}) {
  const input = typeof filters === 'number' ? { limit: filters } : (filters || {});
  const safeLimit = Math.min(Math.max(Number(input.limit) || 40, 1), 100);
  const safeOffset = Math.min(Math.max(Number(input.offset) || 0, 0), 100000);
  const query = String(input.query || '').trim().slice(0, 120);
  const allowedStatuses = ['all','Active','CancellationPending','ExpirationPending','Completed','Expired','Refunded','Cancelled'];
  const status = allowedStatuses.includes(String(input.status)) ? String(input.status) : 'all';
  const escapedQuery = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escapedQuery + '%';
  const where = "($1='' OR a.id ILIKE $2 ESCAPE '\\\\' OR a.service_name ILIKE $2 ESCAPE '\\\\' OR a.phone_number ILIKE $2 ESCAPE '\\\\' OR u.email ILIKE $2 ESCAPE '\\\\' OR u.id ILIKE $2 ESCAPE '\\\\') AND ($3='all' OR a.status=$3)";
  const pool = await getPool();
  const summarySql = 'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE a.status=\'Active\')::int AS active, COUNT(*) FILTER (WHERE a.status=\'CancellationPending\')::int AS cancellation_pending, COUNT(*) FILTER (WHERE a.status=\'ExpirationPending\')::int AS expiration_pending, COUNT(*) FILTER (WHERE a.status=\'Completed\')::int AS completed, COUNT(*) FILTER (WHERE a.status=\'Expired\')::int AS expired, COUNT(*) FILTER (WHERE a.status=\'Refunded\')::int AS refunded, COUNT(*) FILTER (WHERE a.status=\'Cancelled\')::int AS cancelled FROM activations a LEFT JOIN users u ON u.id=a.user_id WHERE ' + where;
  const rowsSql = 'SELECT a.*,u.email,u.display_name,p.name AS provider_name,p.adapter_key,COALESCE(po.pending_operations,0)::int AS pending_operations,COALESCE(po.failed_operations,0)::int AS failed_operations,po.latest_operation_type,po.latest_operation_status,po.latest_operation_error,po.latest_operation_updated_at FROM activations a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN providers p ON p.id=a.provider_id LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE x.status=\'Pending\') AS pending_operations,COUNT(*) FILTER (WHERE x.status=\'Failed\') AS failed_operations,(array_agg(x.operation_type ORDER BY x.updated_at DESC))[1] AS latest_operation_type,(array_agg(x.status ORDER BY x.updated_at DESC))[1] AS latest_operation_status,(array_agg(x.last_error ORDER BY x.updated_at DESC))[1] AS latest_operation_error,(array_agg(x.updated_at ORDER BY x.updated_at DESC))[1] AS latest_operation_updated_at FROM provider_operations x WHERE x.activation_id=a.id) po ON TRUE WHERE ' + where + ' ORDER BY CASE WHEN a.status IN (\'Active\',\'CancellationPending\',\'ExpirationPending\') THEN 0 ELSE 1 END,a.created_at DESC,a.id LIMIT $4 OFFSET $5';
  const [summary,result] = await Promise.all([pool.query(summarySql,[query,pattern,status]),pool.query(rowsSql,[query,pattern,status,safeLimit,safeOffset])]);
  const total = Number(summary.rows[0].total || 0);
  return {
    activations: result.rows.map(row => ({
      ...mapActivation(row), userId: row.user_id, email: row.email || null, displayName: row.display_name || '',
      providerName: row.provider_name || null, adapterKey: row.adapter_key || null,
      pendingOperations: Number(row.pending_operations || 0), failedOperations: Number(row.failed_operations || 0),
      latestOperation: row.latest_operation_type ? { type: row.latest_operation_type, status: row.latest_operation_status, error: row.latest_operation_error || null, updatedAt: row.latest_operation_updated_at ? new Date(row.latest_operation_updated_at).getTime() : null } : null,
    })),
    summary: { total, active: Number(summary.rows[0].active || 0), cancellationPending: Number(summary.rows[0].cancellation_pending || 0), expirationPending: Number(summary.rows[0].expiration_pending || 0), completed: Number(summary.rows[0].completed || 0), expired: Number(summary.rows[0].expired || 0), refunded: Number(summary.rows[0].refunded || 0), cancelled: Number(summary.rows[0].cancelled || 0) },
    pagination: { limit: safeLimit, offset: safeOffset, hasMore: safeOffset + result.rows.length < total },
  };
}

export async function getAdminActivation(activationId) {
  const pool = await getPool();
  const target = String(activationId || '').trim();
  const result = await pool.query('SELECT a.*,u.email,u.display_name,p.name AS provider_name,p.adapter_key FROM activations a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN providers p ON p.id=a.provider_id WHERE a.id=$1',[target]);
  if (!result.rowCount) throw Object.assign(new Error('Activation not found'),{statusCode:404});
  const row=result.rows[0];
  const operations=await pool.query('SELECT id,operation_type,status,provider_id,provider_activation_id,attempts,last_error,created_at,updated_at,completed_at FROM provider_operations WHERE activation_id=$1 ORDER BY created_at DESC LIMIT 20',[target]);
  return {
    activation:{...mapActivation(row),userId:row.user_id,email:row.email||null,displayName:row.display_name||'',providerName:row.provider_name||null,adapterKey:row.adapter_key||null},
    operations:operations.rows.map(op=>({id:op.id,type:op.operation_type,status:op.status,providerId:op.provider_id,providerActivationId:op.provider_activation_id,attempts:Number(op.attempts||0),error:op.last_error||null,createdAt:new Date(op.created_at).getTime(),updatedAt:new Date(op.updated_at).getTime(),completedAt:op.completed_at?new Date(op.completed_at).getTime():null})),
  };
}
export async function listAdminLedger(filters = {}) {
  const input = typeof filters === 'number' ? { limit: filters } : (filters || {});
  const safeLimit = Math.min(Math.max(Number(input.limit) || 40, 1), 100);
  const safeOffset = Math.min(Math.max(Number(input.offset) || 0, 0), 100000);
  const query = String(input.query || '').trim().slice(0, 120);
  const type = ['all','credit','debit'].includes(String(input.type)) ? String(input.type) : 'all';
  const escapedQuery = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escapedQuery + '%';
  const where = "($1='' OR l.id ILIKE $2 ESCAPE '\\\\' OR l.user_id ILIKE $2 ESCAPE '\\\\' OR u.email ILIKE $2 ESCAPE '\\\\' OR l.reference_id ILIKE $2 ESCAPE '\\\\' OR l.description ILIKE $2 ESCAPE '\\\\') AND ($3='all' OR l.entry_type=$3)";
  const pool = await getPool();
  const [summary,result] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE l.entry_type=\'credit\')::int AS credits, COUNT(*) FILTER (WHERE l.entry_type=\'debit\')::int AS debits, COALESCE(SUM(l.amount_paise) FILTER (WHERE l.entry_type=\'credit\'),0)::bigint AS credit_paise, COALESCE(SUM(l.amount_paise) FILTER (WHERE l.entry_type=\'debit\'),0)::bigint AS debit_paise FROM wallet_ledger l JOIN users u ON u.id=l.user_id WHERE ' + where,[query,pattern,type]),
    pool.query('SELECT l.*,u.email FROM wallet_ledger l JOIN users u ON u.id=l.user_id WHERE ' + where + ' ORDER BY l.created_at DESC,l.id DESC LIMIT $4 OFFSET $5',[query,pattern,type,safeLimit,safeOffset])
  ]);
  const total=Number(summary.rows[0].total||0);
  return {
    ledger:result.rows.map(row=>({
      id:row.id,email:row.email,userId:row.user_id,type:row.entry_type,amountPaise:Number(row.amount_paise),
      referenceType:row.reference_type,referenceId:row.reference_id,description:row.description,createdAt:new Date(row.created_at).getTime()
    })),
    summary:{
      total,credits:Number(summary.rows[0].credits||0),debits:Number(summary.rows[0].debits||0),
      creditPaise:Number(summary.rows[0].credit_paise||0),debitPaise:Number(summary.rows[0].debit_paise||0)
    },
    pagination:{limit:safeLimit,offset:safeOffset,hasMore:safeOffset+result.rows.length<total}
  };
}
export async function listAuditLogs(filters = {}) {
  const input = typeof filters === 'number' ? { limit: filters } : (filters || {});
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(input.limit) || 100, 1), 250);
  const safeOffset = Math.min(Math.max(Number(input.offset) || 0, 0), 100000);
  const query = String(input.query || '').trim().slice(0, 120);
  const action = String(input.action || 'all').trim().slice(0, 160) || 'all';
  const targetType = String(input.targetType || 'all').trim().slice(0, 80) || 'all';
  const escaped = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escaped + '%';
  const where = `($1='' OR a.id ILIKE $2 ESCAPE '\\\\' OR COALESCE(u.email,'') ILIKE $2 ESCAPE '\\\\' OR a.action ILIKE $2 ESCAPE '\\\\' OR a.target_type ILIKE $2 ESCAPE '\\\\' OR COALESCE(a.target_id,'') ILIKE $2 ESCAPE '\\\\')
    AND ($3='all' OR a.action=$3)
    AND ($4='all' OR a.target_type=$4)`;
  const [summary,result] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE ${where}`, [query,pattern,action,targetType]),
    pool.query(`SELECT a.*, u.email AS actor_email
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_user_id
      WHERE ${where}
      ORDER BY a.created_at DESC,a.id DESC LIMIT $5 OFFSET $6`, [query,pattern,action,targetType,safeLimit,safeOffset])
  ]);
  const total = Number(summary.rows[0].total || 0);
  return {
    logs: result.rows.map(row => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_email,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at).getTime(),
    })),
    pagination:{limit:safeLimit,offset:safeOffset,hasMore:safeOffset+result.rows.length<total,total}
  };
}

export async function recordAuditTx(client, adminUserId, action, targetType, targetId, metadata = {}) {
  await client.query(
    `INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id('AUD'), adminUserId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

export async function recordAudit(adminUserId, action, targetType, targetId, metadata = {}) {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id('AUD'), adminUserId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

export async function getProviderOperationsMonitor(limit = 50) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 250);
  const [summary, recent] = await Promise.all([
    pool.query(`SELECT
      COUNT(*) FILTER (WHERE status='Pending')::int AS pending_count,
      COUNT(*) FILTER (WHERE status='Succeeded')::int AS succeeded_count,
      COUNT(*) FILTER (WHERE status='Failed')::int AS failed_count,
      MIN(created_at) FILTER (WHERE status='Pending') AS oldest_pending_at
      FROM provider_operations`),
    pool.query(`SELECT po.id, po.activation_id, po.operation_type, po.status, po.provider_id,
             po.provider_activation_id, po.attempts, po.last_error, po.created_at, po.updated_at, po.completed_at,
             p.adapter_key,
             a.phone_number, a.status AS activation_status,
             s.name AS service_name,
             u.email
      FROM provider_operations po
      LEFT JOIN providers p ON p.id=po.provider_id
      LEFT JOIN activations a ON a.id=po.activation_id
      LEFT JOIN services s ON s.id=a.service_id
      LEFT JOIN users u ON u.id=a.user_id
      ORDER BY po.created_at DESC
      LIMIT $1`, [safeLimit]),
  ]);
  return {
    summary: {
      pending: Number(summary.rows[0].pending_count || 0),
      succeeded: Number(summary.rows[0].succeeded_count || 0),
      failed: Number(summary.rows[0].failed_count || 0),
      oldestPendingAt: summary.rows[0].oldest_pending_at ? new Date(summary.rows[0].oldest_pending_at).getTime() : null,
    },
    operations: recent.rows.map(row => ({
      id: row.id,
      activationId: row.activation_id,
      operationType: row.operation_type,
      status: row.status,
      providerId: row.provider_id,
      providerActivationId: row.provider_activation_id,
      attempts: Number(row.attempts || 0),
      lastError: row.last_error,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
      adapterKey: row.adapter_key,
      activationStatus: row.activation_status,
      service: row.service_name,
      email: row.email,
      number: row.phone_number,
    })),
  };
}
