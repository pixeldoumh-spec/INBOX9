import crypto from 'node:crypto';
import { getPool, withTransaction, dbEnabled } from './db.js';

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
