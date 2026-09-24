import { getPool } from './db.js';

function id() { return 'NOT-' + crypto.randomUUID(); }

export async function syncUserNotifications(userId) {
  const pool = await getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO notifications (id,user_id,kind,source_type,source_id,event_key,title,body,page,tone,created_at)
     SELECT $1 || substr(md5(r.id || r.status || r.user_id),1,18), r.user_id, 'recharge', 'recharge', r.id, 'status:'||r.status,
       CASE r.status WHEN 'Approved' THEN 'Recharge verified' ELSE 'Recharge not credited' END,
       CASE r.status WHEN 'Approved' THEN 'Your recharge of ₹' || to_char(r.amount_paise/100.0,'FM999999990.00') || ' was verified and credited.'
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
       CASE a.status WHEN 'Completed' THEN 'OTP received' WHEN 'Expired' THEN 'Number expired' WHEN 'Refunded' THEN 'Activation refunded' ELSE 'Activation closed' END,
       CASE a.status WHEN 'Completed' THEN 'Verification code is ready for order ' || a.id || '.'
                    WHEN 'Expired' THEN 'Order ' || a.id || ' reached its validity limit.'
                    WHEN 'Refunded' THEN 'Order ' || a.id || ' was cancelled and refunded.'
                    ELSE 'Order ' || a.id || ' is now closed.' END,
       CASE a.status WHEN 'Completed' THEN 'active' ELSE 'orders' END,
       CASE a.status WHEN 'Completed' THEN 'success' ELSE 'info' END, a.updated_at
     FROM activations a
     WHERE a.user_id=$2 AND a.status IN ('Completed','Expired','Refunded','Cancelled')
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
    `SELECT id,kind,source_type,source_id,title,body,page,tone,read_at,created_at
     FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [userId,safeLimit]
  );
  return result.rows.map((row)=>({
    id:row.id,kind:row.kind,sourceType:row.source_type,sourceId:row.source_id,
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
