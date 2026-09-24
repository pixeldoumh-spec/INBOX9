import { getPool, withTransaction } from './db.js';
import crypto from 'node:crypto';

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
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

export async function listAdminUsers(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const result = await pool.query(
    `SELECT u.*, COALESCE(w.balance_paise,0) AS balance_paise,
            (SELECT COUNT(*) FROM recharge_requests r WHERE r.user_id=u.id)::int AS recharge_count,
            (SELECT COUNT(*) FROM activations a WHERE a.user_id=u.id)::int AS activation_count
     FROM users u
     LEFT JOIN wallets w ON w.user_id=u.id
     ORDER BY u.created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(mapUser);
}

export async function listAdminServices(limit = 250) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 500);
  const result = await pool.query(
    `SELECT s.*, COUNT(r.provider_id)::int AS routed_providers
     FROM services s
     LEFT JOIN service_provider_routes r ON r.service_id=s.id AND r.active=TRUE
     GROUP BY s.id
     ORDER BY s.active DESC, s.category, s.name
     LIMIT $1`, [safeLimit]
  );
  return result.rows.map(mapService);
}

export async function updateService(adminUserId, serviceId, patch = {}) {
  const allowedAvailability = new Set(['high', 'medium', 'low']);
  return withTransaction(async client => {
    const current = await client.query('SELECT * FROM services WHERE id=$1 FOR UPDATE', [serviceId]);
    if (!current.rowCount) throw new Error('Service not found');
    const row = current.rows[0];
    const pricePaise = patch.pricePaise === undefined ? row.price_paise : Number(patch.pricePaise);
    const stock = patch.stock === undefined ? row.stock : Number(patch.stock);
    const active = patch.active === undefined ? row.active : Boolean(patch.active);
    const availability = patch.availability === undefined ? row.availability : String(patch.availability);
    if (!Number.isInteger(pricePaise) || pricePaise < 0 || pricePaise > 100000000) throw new Error('Price must be an integer between ₹0 and ₹1,000,000');
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Stock must be an integer between 0 and 1,000,000');
    if (!allowedAvailability.has(availability)) throw new Error('Availability must be high, medium or low');
    const updated = await client.query(
      `UPDATE services SET price_paise=$2, stock=$3, active=$4, availability=$5, updated_at=NOW()
       WHERE id=$1 RETURNING *`, [serviceId, pricePaise, stock, active, availability]
    );
    await audit(client, adminUserId, 'service.updated', 'service', serviceId, {
      before: { pricePaise: Number(row.price_paise), stock: Number(row.stock), active: row.active, availability: row.availability },
      after: { pricePaise, stock, active, availability },
    });
    const result = updated.rows[0];
    return mapService(result);
  });
}

export async function listAdminActivations(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const result = await pool.query(
    `SELECT a.*, u.email
     FROM activations a
     LEFT JOIN users u ON u.id=a.user_id
     ORDER BY a.created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(mapActivation);
}

export async function listAdminLedger(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const result = await pool.query(
    `SELECT l.*, u.email
     FROM wallet_ledger l
     JOIN users u ON u.id=l.user_id
     ORDER BY l.created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(row => ({
    id: row.id,
    email: row.email,
    userId: row.user_id,
    type: row.entry_type,
    amountPaise: Number(row.amount_paise),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function listAuditLogs(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  const result = await pool.query(
    `SELECT a.*, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id=a.actor_user_id
     ORDER BY a.created_at DESC LIMIT $1`, [safeLimit]
  );
  return result.rows.map(row => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata || {},
    createdAt: new Date(row.created_at).getTime(),
  }));
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
