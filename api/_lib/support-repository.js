import crypto from 'node:crypto';
import { getPool, withTransaction, dbEnabled } from './db.js';
import { recordAuditTx } from './admin-repository.js';

const mockTickets = new Map();
export const SUPPORT_CATEGORIES = new Set(['activation','recharge','wallet','account','other']);
export const SUPPORT_STATUSES = new Set(['Open','In Progress','Resolved','Closed']);

function makeId() { return 'SUP-' + crypto.randomUUID(); }

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function validateInput(input = {}) {
  const category = cleanText(input.category, 32).toLowerCase();
  const subject = cleanText(input.subject, 120);
  const message = cleanText(input.message, 2000);
  if (!SUPPORT_CATEGORIES.has(category)) throw new Error('Choose a valid support category');
  if (subject.length < 4) throw new Error('Subject must be at least 4 characters');
  if (message.length < 10) throw new Error('Message must be at least 10 characters');
  return {
    category,
    subject,
    message,
    activationId: input.activationId ? cleanText(input.activationId, 120) : null,
    rechargeId: input.rechargeId ? cleanText(input.rechargeId, 120) : null
  };
}

function mapMessage(row) {
  return { id:row.id, authorRole:row.author_role, authorUserId:row.author_user_id, body:row.body, createdAt:new Date(row.created_at).getTime() };
}
function mapRow(row) {
  return {
    id: row.id, category: row.category, subject: row.subject, message: row.message, status: row.status,
    activationId: row.activation_id || null, rechargeId: row.recharge_id || null,
    activation: row.activation_id ? {id:row.activation_id,status:row.activation_status||null,number:row.activation_number||null,service:row.activation_service||null} : null,
    recharge: row.recharge_id ? {id:row.recharge_id,status:row.recharge_status||null,amountPaise:row.recharge_amount_paise==null?null:Number(row.recharge_amount_paise)} : null,
    createdAt: new Date(row.created_at).getTime(), updatedAt: new Date(row.updated_at).getTime(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
    adminNote: row.admin_note || null, messages:[]
  };
}
async function attachMessages(poolLike,tickets){
  if(!tickets.length) return tickets;
  const result=await poolLike.query(`SELECT id,ticket_id,author_user_id,author_role,body,created_at FROM support_messages WHERE ticket_id=ANY($1::text[]) ORDER BY created_at ASC,id ASC`,[tickets.map((t)=>t.id)]);
  const grouped=new Map(tickets.map((t)=>[t.id,[]]));
  for(const row of result.rows) grouped.get(row.ticket_id)?.push(mapMessage(row));
  return tickets.map((t)=>({...t,messages:grouped.get(t.id)||[]}));
}

function mapMock(ticket) {
  return { ...ticket };
}

export async function createSupportTicket(user, input) {
  const clean = validateInput(input);
  if (!dbEnabled()) {
    const ticket = {
      id: makeId(),
      userId: user.id,
      email: user.email,
      ...clean,
      status: 'Open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resolvedAt: null,
      adminNote: null
    };
    mockTickets.set(ticket.id, ticket);
    return mapMock(ticket);
  }
  return withTransaction(async (client) => {
    if (clean.activationId) {
      const activation = await client.query('SELECT id FROM activations WHERE id=$1 AND user_id=$2', [clean.activationId, user.id]);
      if (!activation.rowCount) throw new Error('The selected activation was not found for your account');
    }
    if (clean.rechargeId) {
      const recharge = await client.query('SELECT id FROM recharge_requests WHERE id=$1 AND user_id=$2', [clean.rechargeId, user.id]);
      if (!recharge.rowCount) throw new Error('The selected recharge was not found for your account');
    }
    const id = makeId();
    const result = await client.query(
      `INSERT INTO support_requests (id,user_id,category,subject,message,activation_id,recharge_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, user.id, clean.category, clean.subject, clean.message, clean.activationId, clean.rechargeId]
    );
    await client.query(`INSERT INTO support_messages (id,ticket_id,author_user_id,author_role,body) VALUES ($1,$2,$3,'customer',$4)`,
      ['SUPMSG-' + crypto.randomUUID(),id,user.id,clean.message]);
    const ticket=mapRow(result.rows[0]);
    ticket.messages=[{id:'initial-'+id,authorRole:'customer',authorUserId:user.id,body:clean.message,createdAt:Date.now()}];
    return ticket;
  });
}

export async function listSupportTickets(user) {
  if (!dbEnabled()) {
    return [...mockTickets.values()]
      .filter((ticket) => ticket.userId === user.id || ticket.email === String(user.email).toLowerCase())
      .sort((a,b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(mapMock);
  }
  const pool = await getPool();
  const result = await pool.query(
    `SELECT s.*,a.status AS activation_status,a.phone_number AS activation_number,sv.name AS activation_service,
            r.status AS recharge_status,r.amount_paise AS recharge_amount_paise
     FROM support_requests s
     LEFT JOIN activations a ON a.id=s.activation_id
     LEFT JOIN services sv ON sv.id=a.service_id
     LEFT JOIN recharge_requests r ON r.id=s.recharge_id
     WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 50`,
    [user.id]
  );
  return attachMessages(pool,result.rows.map(mapRow));
}


function cleanAdminNote(value) {
  if (value == null) return null;
  const note = String(value).trim();
  if (!note) return null;
  if (note.length > 1000) throw new Error('Support note must be 1000 characters or fewer');
  return note;
}

function mapAdminRow(row) {
  const ticket = mapRow(row);
  return {
    ...ticket,
    email: row.email || null,
    assignedAdminId: row.assigned_admin_id || null,
    assignedAdminEmail: row.assigned_admin_email || null,
    activation: row.activation_id ? {
      id: row.activation_id,
      status: row.activation_status || null,
      number: row.activation_number || null,
      service: row.activation_service || null
    } : null,
    recharge: row.recharge_id ? {
      id: row.recharge_id,
      status: row.recharge_status || null,
      amountPaise: row.recharge_amount_paise == null ? null : Number(row.recharge_amount_paise)
    } : null
  };
}

export async function listAdminSupportTickets(filters = {}) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(filters.limit) || 250, 1), 500);
  const query = String(filters.query || '').trim().slice(0, 120);
  const status = ['all', ...SUPPORT_STATUSES].includes(String(filters.status)) ? String(filters.status) : 'all';
  const escaped = query.replace(/[%_]/g, '\\$&');
  const pattern = '%' + escaped + '%';
  const where = `($1='' OR s.id ILIKE $2 ESCAPE '\\\\' OR u.email ILIKE $2 ESCAPE '\\\\' OR s.subject ILIKE $2 ESCAPE '\\\\' OR s.category ILIKE $2 ESCAPE '\\\\' OR COALESCE(s.activation_id,'') ILIKE $2 ESCAPE '\\\\' OR COALESCE(s.recharge_id,'') ILIKE $2 ESCAPE '\\\\')
    AND ($3='all' OR s.status=$3)`;
  const result = await pool.query(
    `SELECT s.*,
            u.email,
            a.status AS activation_status,
            a.phone_number AS activation_number,
            sv.name AS activation_service,
            r.status AS recharge_status,
            r.amount_paise AS recharge_amount_paise,
            au.email AS assigned_admin_email
     FROM support_requests s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN users au ON au.id=s.assigned_admin_id
     LEFT JOIN activations a ON a.id=s.activation_id
     LEFT JOIN services sv ON sv.id=a.service_id
     LEFT JOIN recharge_requests r ON r.id=s.recharge_id
     WHERE ${where}
     ORDER BY CASE s.status
       WHEN 'Open' THEN 0
       WHEN 'In Progress' THEN 1
       WHEN 'Resolved' THEN 2
       ELSE 3
     END, s.created_at ASC, s.id
     LIMIT $4`,
    [query, pattern, status, safeLimit]
  );
  return attachMessages(pool,result.rows.map(mapAdminRow));
}
export async function updateAdminSupportTicket(adminUserId, ticketId, patch = {}) {
  const requestedStatus = patch.status == null ? null : String(patch.status).trim();
  if (requestedStatus && !SUPPORT_STATUSES.has(requestedStatus)) {
    throw new Error('Choose a valid support status');
  }
  const nextNote = patch.adminNote === undefined ? undefined : cleanAdminNote(patch.adminNote);
  const reply = String(patch.reply || '').trim();
  if (reply && (reply.length < 2 || reply.length > 4000)) throw new Error('Support reply must be between 2 and 4000 characters');
  const hasAssignmentPatch = Object.prototype.hasOwnProperty.call(patch, 'assignedAdminId');
  const nextAssignedAdminId = hasAssignmentPatch
    ? (patch.assignedAdminId == null || String(patch.assignedAdminId).trim() === '' ? null : String(patch.assignedAdminId).trim())
    : undefined;

  return withTransaction(async (client) => {
    const current = await client.query(
      `SELECT * FROM support_requests WHERE id=$1 FOR UPDATE`,
      [ticketId]
    );
    if (!current.rowCount) {
      const error = new Error('Support ticket not found');
      error.statusCode = 404;
      throw error;
    }
    const row = current.rows[0];
    const nextStatus = requestedStatus || row.status;
    const adminNote = nextNote === undefined ? (row.admin_note || null) : nextNote;
    let assignedAdminId = nextAssignedAdminId === undefined ? (row.assigned_admin_id || null) : nextAssignedAdminId;
    if (assignedAdminId) {
      const assigned = await client.query('SELECT id FROM users WHERE id=$1 AND role=$2 AND active=TRUE', [assignedAdminId, 'admin']);
      if (!assigned.rowCount) throw new Error('Assigned admin was not found');
    }
    let resolvedAt = row.resolved_at;
    if (nextStatus === 'Resolved' && row.status !== 'Resolved') resolvedAt = new Date();
    if (nextStatus === 'Open' || nextStatus === 'In Progress') resolvedAt = null;

    const changed = row.status !== nextStatus
      || (row.admin_note || null) !== adminNote
      || (row.assigned_admin_id || null) !== assignedAdminId
      || Boolean(reply);
    if (!changed) return mapAdminRow(row);

    const updated = await client.query(
      `UPDATE support_requests
       SET status=$2, admin_note=$3, assigned_admin_id=$4, resolved_at=$5, updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [ticketId, nextStatus, adminNote, assignedAdminId, resolvedAt]
    );
    if (reply) {
      await client.query(`INSERT INTO support_messages (id,ticket_id,author_user_id,author_role,body) VALUES ($1,$2,$3,'admin',$4)`,
        ['SUPMSG-' + crypto.randomUUID(),ticketId,adminUserId,reply]);
    }
    await recordAuditTx(client, adminUserId, 'support.ticket_updated', 'support_ticket', ticketId, {
      before: { status: row.status, notePresent: Boolean(row.admin_note), assignedAdminId: row.assigned_admin_id || null },
      after: { status: nextStatus, notePresent: Boolean(adminNote), assignedAdminId },
      noteChanged: (row.admin_note || null) !== adminNote,
      assignmentChanged: (row.assigned_admin_id || null) !== assignedAdminId
    });

    const related = await client.query(
      `SELECT s.*,
              u.email,
              a.status AS activation_status,
              a.phone_number AS activation_number,
              sv.name AS activation_service,
              r.status AS recharge_status,
              r.amount_paise AS recharge_amount_paise,
              au.email AS assigned_admin_email
       FROM support_requests s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN users au ON au.id=s.assigned_admin_id
       LEFT JOIN activations a ON a.id=s.activation_id
       LEFT JOIN services sv ON sv.id=a.service_id
       LEFT JOIN recharge_requests r ON r.id=s.recharge_id
       WHERE s.id=$1`,
      [ticketId]
    );
    return mapAdminRow(related.rows[0] || updated.rows[0]);
  });
}

export async function replySupportTicket(user,ticketId,body){
  const text=String(body||'').trim();
  if(text.length<2||text.length>4000) throw Object.assign(new Error('Reply must be between 2 and 4000 characters'),{statusCode:400});
  return withTransaction(async(client)=>{
    const current=await client.query(`SELECT * FROM support_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,[ticketId,user.id]);
    if(!current.rowCount) throw Object.assign(new Error('Support ticket not found'),{statusCode:404});
    const row=current.rows[0];
    if(row.status==='Closed') throw Object.assign(new Error('Closed tickets cannot receive new replies'),{statusCode:409});
    await client.query(`INSERT INTO support_messages (id,ticket_id,author_user_id,author_role,body) VALUES ($1,$2,$3,'customer',$4)`,['SUPMSG-'+crypto.randomUUID(),ticketId,user.id,text]);
    const nextStatus=row.status==='Resolved'?'Open':row.status;
    await client.query(`UPDATE support_requests SET status=$2,resolved_at=NULL,updated_at=NOW() WHERE id=$1`,[ticketId,nextStatus]);
    const messages=await client.query(`SELECT id,author_user_id,author_role,body,created_at FROM support_messages WHERE ticket_id=$1 ORDER BY created_at ASC,id ASC`,[ticketId]);
    const related=await client.query(`SELECT s.*,a.status AS activation_status,a.phone_number AS activation_number,sv.name AS activation_service,r.status AS recharge_status,r.amount_paise AS recharge_amount_paise
      FROM support_requests s LEFT JOIN activations a ON a.id=s.activation_id LEFT JOIN services sv ON sv.id=a.service_id LEFT JOIN recharge_requests r ON r.id=s.recharge_id WHERE s.id=$1`,[ticketId]);
    const ticket=mapRow(related.rows[0]); ticket.messages=messages.rows.map(mapMessage); return ticket;
  });
}
