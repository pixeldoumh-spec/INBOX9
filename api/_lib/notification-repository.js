import crypto from 'node:crypto';
import { getPool } from './db.js';

function id(prefix='NOT') { return prefix + '-' + crypto.randomUUID(); }

export async function createNotificationTx(client, { userId, kind, sourceType, sourceId, eventKey, title, body, page='apps', tone='info', createdAt=null }) {
  if (!client || !userId || !kind || !sourceType || !sourceId || !eventKey || !title || !body) return;
  await client.query(
    `INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,NOW()))
     ON CONFLICT (user_id,source_type,source_id,event_key) DO NOTHING`,
    [id(),String(userId),String(kind),String(sourceType),String(sourceId),String(eventKey).slice(0,160),String(title).slice(0,160),String(body).slice(0,1000),String(page).slice(0,80),String(tone).slice(0,40),createdAt ? new Date(createdAt) : null]
  );
}

export async function syncUserNotifications(userId) {
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone,created_at)
     SELECT $1 || substr(md5(r.id || r.status || r.user_id),1,18), r.user_id, 'recharge', 'recharge', r.id, 'status:'||r.status,
       CASE r.status WHEN 'Approved' THEN 'Recharge successful' ELSE 'Recharge not credited' END,
       CASE r.status WHEN 'Approved' THEN 'Your recharge of ₹' || to_char(r.amount_paise/100.0,'FM999999990.00') || ' was credited to your wallet successfully.'
                    ELSE 'Your recharge of ₹' || to_char(r.amount_paise/100.0,'FM999999990.00') || ' was not credited.' END,
       'wallet', CASE r.status WHEN 'Approved' THEN 'success' ELSE 'danger' END, COALESCE(r.reviewed_at,r.submitted_at)
     FROM recharge_requests r
     WHERE r.user_id=$2 AND r.status IN ('Approved','Rejected')
     ON CONFLICT DO NOTHING`,
    [id(),userId]
  );
  await pool.query(
    `INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone,created_at)
     SELECT $1 || substr(md5(a.id || a.status || a.user_id),1,18), a.user_id, 'activation', 'activation', a.id, 'status:'||a.status,
       CASE a.status WHEN 'Active' THEN 'Number allocated successfully' WHEN 'Completed' THEN 'OTP received successfully' WHEN 'Expired' THEN 'Number expired' WHEN 'Refunded' THEN 'Activation refunded' ELSE 'Activation closed' END,
       CASE a.status WHEN 'Active' THEN 'Your ' || a.service_name || ' number ' || a.phone_number || ' is ready to use.'
                    WHEN 'Completed' THEN 'Verification code is ready for order ' || a.id || '.'
                    WHEN 'Expired' THEN 'Order ' || a.id || ' reached its validity limit.'
                    WHEN 'Refunded' THEN 'Order ' || a.id || ' was cancelled and refunded.'
                    ELSE 'Order ' || a.id || ' is now closed.' END,
       CASE a.status WHEN 'Active' THEN 'buy' WHEN 'Completed' THEN 'buy' ELSE 'buy' END,
       CASE a.status WHEN 'Active' THEN 'success' WHEN 'Completed' THEN 'success' ELSE 'info' END, a.updated_at
     FROM activations a
     WHERE a.user_id=$2 AND a.status IN ('Active','Completed','Expired','Refunded','Cancelled')
     ON CONFLICT DO NOTHING`,
    [id(),userId]
  );
  await pool.query(
    `INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone,created_at)
     SELECT 'NOT-MSG-' || m.id, s.user_id, 'support', 'support_message', m.id, 'message:'||m.id,
       'Support replied', s.subject || ' has a new response from support.',
       'support', 'success', m.created_at
     FROM support_messages m JOIN support_requests s ON s.id=m.ticket_id
     WHERE s.user_id=$1 AND m.author_role='admin'
     ON CONFLICT DO NOTHING`,
    [userId]
  );
}

export async function listNotifications(userId, limit=50) {
  const pool=await getPool();
  if(!pool) return [];
  await syncUserNotifications(userId);
  const safeLimit=Math.min(Math.max(Number(limit)||50,1),100);
  const result=await pool.query(
    `SELECT id,kind,source_type,source_id,event_key,title,body,page,tone,read_at,created_at
     FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId,safeLimit]
  );
  return result.rows.map((row)=>({
    id:row.id,kind:row.kind,sourceType:row.source_type,sourceId:row.source_id,eventKey:row.event_key,
    title:row.title,body:row.body,page:row.page,tone:row.tone,
    read:Boolean(row.read_at),createdAt:new Date(row.created_at).getTime()
  }));
}

export async function markNotificationRead(userId,notificationId,read=true) {
  const pool=await getPool();
  if(!pool) return null;
  const result=await pool.query(
    `UPDATE notifications SET read_at=${read?'NOW()':'NULL'} WHERE id=$1 AND user_id=$2 RETURNING id`,
    [notificationId,userId]
  );
  return result.rowCount ? {id:result.rows[0].id,read} : null;
}

export async function markAllNotificationsRead(userId) {
  const pool=await getPool();
  if(!pool) return 0;
  const result=await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL',[userId]);
  return result.rowCount;
}


export async function listAdminNotifications(filters = {}) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const safeOffset = Math.min(Math.max(Number(filters.offset) || 0, 0), 100000);
  const query = String(filters.query || '').trim().slice(0, 120);
  const kind = String(filters.kind || 'all').trim().slice(0, 40) || 'all';
  const read = ['all','read','unread'].includes(String(filters.read)) ? String(filters.read) : 'all';
  const escaped = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escaped + '%';
  const where = `($1='' OR n.id ILIKE $2 ESCAPE '\\\\' OR n.title ILIKE $2 ESCAPE '\\\\' OR n.body ILIKE $2 ESCAPE '\\\\' OR u.email ILIKE $2 ESCAPE '\\\\' OR u.id ILIKE $2 ESCAPE '\\\\')
    AND ($3='all' OR n.kind=$3)
    AND ($4='all' OR ($4='read' AND n.read_at IS NOT NULL) OR ($4='unread' AND n.read_at IS NULL))`;
  const [summary,result] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE n.read_at IS NULL)::int AS unread,
      COUNT(*) FILTER (WHERE n.read_at IS NOT NULL)::int AS read
      FROM notifications n JOIN users u ON u.id=n.user_id WHERE ${where}`, [query,pattern,kind,read]),
    pool.query(`SELECT n.id,n.user_id,n.kind,n.title,n.body,n.page,n.tone,n.read_at,n.created_at,u.email
      FROM notifications n JOIN users u ON u.id=n.user_id WHERE ${where}
      ORDER BY n.created_at DESC,n.id DESC LIMIT $5 OFFSET $6`, [query,pattern,kind,read,safeLimit,safeOffset])
  ]);
  const total = Number(summary.rows[0].total || 0);
  return {
    notifications: result.rows.map(n => ({
      id:n.id,userId:n.user_id,email:n.email,kind:n.kind,title:n.title,body:n.body,page:n.page,tone:n.tone,
      read:Boolean(n.read_at),createdAt:new Date(n.created_at).getTime()
    })),
    summary:{total,unread:Number(summary.rows[0].unread||0),read:Number(summary.rows[0].read||0)},
    pagination:{limit:safeLimit,offset:safeOffset,hasMore:safeOffset+result.rows.length<total}
  };
}

export async function createAdminNotification(adminUserId, input = {}) {
  const userId = String(input.userId || '').trim();
  const kind = String(input.kind || 'system').trim().slice(0, 40);
  const title = String(input.title || '').trim().slice(0, 160);
  const body = String(input.body || '').trim().slice(0, 1000);
  const page = String(input.page || 'notifications').trim().slice(0, 80);
  const tone = String(input.tone || 'info').trim().slice(0, 40);
  if (!userId) throw Object.assign(new Error('Customer user id is required'),{statusCode:400});
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(userId)) throw Object.assign(new Error('Invalid customer user id'),{statusCode:400});
  if (!kind) throw Object.assign(new Error('Notification kind is required'),{statusCode:400});
  if (title.length < 3) throw Object.assign(new Error('Notification title must be at least 3 characters'),{statusCode:400});
  if (body.length < 2) throw Object.assign(new Error('Notification message must be at least 2 characters'),{statusCode:400});
  return (await import('./db.js')).withTransaction(async client => {
    const target=await client.query('SELECT id,email,active,role FROM users WHERE id=$1 FOR UPDATE',[userId]);
    if(!target.rowCount) throw Object.assign(new Error('Customer user was not found'),{statusCode:404});
    if(!target.rows[0].active) throw Object.assign(new Error('Disabled customers cannot receive targeted notifications'),{statusCode:409});
    if(target.rows[0].role!=='user') throw Object.assign(new Error('Targeted notifications can only be sent to customer accounts'),{statusCode:400});
    const notificationId=id();
    await client.query(`INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone) VALUES ($1,$2,$3,'admin_message',$4,$5,$6,$7,$8,$9)`,
      [notificationId,userId,kind,notificationId,'admin:'+notificationId,title,body,page,tone]);
    await (await import('./admin-repository.js')).recordAuditTx(client,adminUserId,'notification.targeted_created','notification',notificationId,{userId,email:target.rows[0].email,kind,title});
    const row=await client.query('SELECT id,user_id,kind,title,body,page,tone,read_at,created_at FROM notifications WHERE id=$1',[notificationId]);
    const n=row.rows[0];
    return {id:n.id,userId:n.user_id,email:target.rows[0].email,kind:n.kind,title:n.title,body:n.body,page:n.page,tone:n.tone,read:false,createdAt:new Date(n.created_at).getTime()};
  });
}
