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

function mapRow(row) {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    activationId: row.activation_id || null,
    rechargeId: row.recharge_id || null,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
    adminNote: row.admin_note || null
  };
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
    return mapRow(result.rows[0]);
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
    `SELECT * FROM support_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [user.id]
  );
  return result.rows.map(mapRow);
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

export async function listAdminSupportTickets(limit = 250) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 1), 500);
  const result = await pool.query(
    `SELECT s.*,
            u.email,
            a.status AS activation_status,
            a.phone_number AS activation_number,
            sv.name AS activation_service,
            r.status AS recharge_status,
            r.amount_paise AS recharge_amount_paise
     FROM support_requests s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN activations a ON a.id=s.activation_id
     LEFT JOIN services sv ON sv.id=a.service_id
     LEFT JOIN recharge_requests r ON r.id=s.recharge_id
     ORDER BY CASE s.status
       WHEN 'Open' THEN 0
       WHEN 'In Progress' THEN 1
       WHEN 'Resolved' THEN 2
       ELSE 3
     END, s.created_at ASC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(mapAdminRow);
}

export async function updateAdminSupportTicket(adminUserId, ticketId, patch = {}) {
  const requestedStatus = patch.status == null ? null : String(patch.status).trim();
  if (requestedStatus && !SUPPORT_STATUSES.has(requestedStatus)) {
    throw new Error('Choose a valid support status');
  }
  const nextNote = patch.adminNote === undefined ? undefined : cleanAdminNote(patch.adminNote);

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
    let resolvedAt = row.resolved_at;
    if (nextStatus === 'Resolved' && row.status !== 'Resolved') resolvedAt = new Date();
    if (nextStatus === 'Open' || nextStatus === 'In Progress') resolvedAt = null;

    const changed = row.status !== nextStatus || (row.admin_note || null) !== adminNote;
    if (!changed) return mapAdminRow(row);

    const updated = await client.query(
      `UPDATE support_requests
       SET status=$2, admin_note=$3, resolved_at=$4, updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [ticketId, nextStatus, adminNote, resolvedAt]
    );
    await recordAuditTx(client, adminUserId, 'support.ticket_updated', 'support_ticket', ticketId, {
      before: { status: row.status, notePresent: Boolean(row.admin_note) },
      after: { status: nextStatus, notePresent: Boolean(adminNote) },
      noteChanged: (row.admin_note || null) !== adminNote
    });

    const related = await client.query(
      `SELECT s.*,
              u.email,
              a.status AS activation_status,
              a.phone_number AS activation_number,
              sv.name AS activation_service,
              r.status AS recharge_status,
              r.amount_paise AS recharge_amount_paise
       FROM support_requests s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN activations a ON a.id=s.activation_id
       LEFT JOIN services sv ON sv.id=a.service_id
       LEFT JOIN recharge_requests r ON r.id=s.recharge_id
       WHERE s.id=$1`,
      [ticketId]
    );
    return mapAdminRow(related.rows[0] || updated.rows[0]);
  });
}
