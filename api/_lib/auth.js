import crypto from 'node:crypto';
import { getPool, withTransaction, dbEnabled } from './db.js';

const SESSION_DAYS = 7;
const SESSION_MAX_PER_USER = 5;
const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-inbox9_session' : 'inbox9_session';
const mockAccounts = new Map();

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  if (String(password || '').length < 8) return 'Password must be at least 8 characters';
  if (String(password).length > 128) return 'Password is too long';
  return null;
}

export function validatePasswordPair(currentPassword, newPassword) {
  if (String(currentPassword || '').length < 8) return 'Current password is required';
  if (String(newPassword || '').length < 8) return 'New password must be at least 8 characters';
  if (String(newPassword).length > 128) return 'New password is too long';
  if (String(currentPassword) === String(newPassword)) return 'New password must be different from your current password';
  return null;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return i < 0 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_DAYS * 86400}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookieOptions(0));
}

function publicUser(row) {
  return { id: row.id, email: row.email, role: row.role, createdAt: new Date(row.created_at).getTime() };
}

function sessionToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hash(token) };
}

function maxSessionsPerUser() {
  const configured = Number(process.env.INBOX9_MAX_SESSIONS || SESSION_MAX_PER_USER);
  if (!Number.isFinite(configured)) return SESSION_MAX_PER_USER;
  return Math.min(Math.max(Math.floor(configured), 1), 20);
}

async function createSession(client, userId, sessionVersion) {
  const { token, tokenHash } = sessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await client.query(
    `INSERT INTO sessions (token_hash,user_id,session_version,expires_at,last_used_at,revoked_at)
     VALUES ($1,$2,$3,$4,NOW(),NULL)`,
    [tokenHash, userId, sessionVersion, expiresAt]
  );

  const keep = maxSessionsPerUser();
  await client.query(
    `DELETE FROM sessions
     WHERE user_id=$1
       AND token_hash IN (
         SELECT token_hash FROM sessions
         WHERE user_id=$1
         ORDER BY created_at DESC, token_hash DESC
         OFFSET $2
       )`,
    [userId, keep]
  );

  return { token, tokenHash };
}

async function getSessionRecord(req) {
  if (!dbEnabled()) return null;
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE];
  if (!token) return null;
  const tokenHash = hash(token);
  const pool = await getPool();
  const result = await pool.query(
    `SELECT s.token_hash,s.user_id,s.session_version,s.expires_at,s.created_at,s.last_used_at,
            u.id,u.email,u.role,u.created_at,u.session_version AS user_session_version
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1
       AND s.expires_at>NOW()
       AND s.revoked_at IS NULL
       AND u.active=TRUE
       AND s.session_version=u.session_version`,
    [tokenHash]
  );
  if (!result.rowCount) return null;

  // Session activity is informative and intentionally throttled to avoid a write
  // on every authenticated API request.
  await pool.query(
    `UPDATE sessions SET last_used_at=NOW()
     WHERE token_hash=$1
       AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '5 minutes')`,
    [tokenHash]
  );

  return { token, tokenHash, session: result.rows[0], user: publicUser(result.rows[0]) };
}

export async function register(emailInput, password) {
  if (!dbEnabled()) throw new Error('AUTH_DATABASE_REQUIRED');
  const email = normalizeEmail(emailInput);
  const error = validateCredentials(email, password);
  if (error) throw new Error(error);
  return withTransaction(async (client) => {
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rowCount) throw new Error('An account with this email already exists');
    const id = `USR-${crypto.randomUUID()}`;
    const passwordDigest = passwordHash(password);
    const result = await client.query(
      `INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,'user') RETURNING id,email,role,created_at`,
      [id, email, passwordDigest]
    );
    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [id]);
    return publicUser(result.rows[0]);
  });
}

export async function login(emailInput, password) {
  if (!dbEnabled()) throw new Error('AUTH_DATABASE_REQUIRED');
  const email = normalizeEmail(emailInput);
  const error = validateCredentials(email, password);
  if (error) throw new Error(error);

  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id,email,password_hash,role,created_at,active,session_version
       FROM users WHERE email=$1 FOR UPDATE`,
      [email]
    );
    if (!result.rowCount) {
      const invalid = new Error('Invalid email or password');
      invalid.code = 'INVALID_CREDENTIALS';
      throw invalid;
    }
    const row = result.rows[0];
    if (!row.active) {
      const disabled = new Error('This account is disabled. Please contact support.');
      disabled.code = 'ACCOUNT_DISABLED';
      throw disabled;
    }
    if (!verifyPassword(password, row.password_hash)) {
      const invalid = new Error('Invalid email or password');
      invalid.code = 'INVALID_CREDENTIALS';
      throw invalid;
    }
    const { token } = await createSession(client, row.id, row.session_version);
    return { user: publicUser(row), token };
  });
}

export async function getSessionUser(req) {
  const context = await getSessionRecord(req);
  return context?.user || null;
}

export async function logout(req, res) {
  if (!dbEnabled()) {
    clearSessionCookie(res);
    return;
  }
  const context = await getSessionRecord(req);
  if (context) {
    const pool = await getPool();
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [context.tokenHash]);
  }
  clearSessionCookie(res);
}

export async function logoutAllSessions(req, res) {
  if (!dbEnabled()) {
    clearSessionCookie(res);
    return { count: 0, mode: 'mock' };
  }
  const context = await getSessionRecord(req);
  if (!context) {
    clearSessionCookie(res);
    return { count: 0 };
  }
  const result = await withTransaction(async (client) => {
    const locked = await client.query('SELECT id,session_version FROM users WHERE id=$1 AND active=TRUE FOR UPDATE', [context.user.id]);
    if (!locked.rowCount) return 0;
    await client.query('UPDATE users SET session_version=session_version+1,updated_at=NOW() WHERE id=$1', [context.user.id]);
    const deleted = await client.query('DELETE FROM sessions WHERE user_id=$1', [context.user.id]);
    return deleted.rowCount;
  });
  clearSessionCookie(res);
  return { count: result };
}

export async function changePassword(req, currentPassword, newPassword) {
  if (!dbEnabled()) throw new Error('AUTH_DATABASE_REQUIRED');
  const context = await getSessionRecord(req);
  if (!context) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
  const validation = validatePasswordPair(currentPassword, newPassword);
  if (validation) throw new Error(validation);

  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT id,email,role,created_at,password_hash,active,session_version
       FROM users WHERE id=$1 FOR UPDATE`,
      [context.user.id]
    );
    if (!locked.rowCount || !locked.rows[0].active) {
      const error = new Error('This account is disabled. Please contact support.');
      error.statusCode = 403;
      throw error;
    }
    const row = locked.rows[0];
    if (!verifyPassword(currentPassword, row.password_hash)) {
      const error = new Error('Current password is incorrect');
      error.statusCode = 400;
      throw error;
    }

    const nextDigest = passwordHash(newPassword);
    const updated = await client.query(
      `UPDATE users
       SET password_hash=$2,password_changed_at=NOW(),session_version=session_version+1,updated_at=NOW()
       WHERE id=$1
       RETURNING id,email,role,created_at,session_version`,
      [row.id, nextDigest]
    );
    const freshUser = updated.rows[0];
    await client.query('DELETE FROM sessions WHERE user_id=$1', [row.id]);
    const { token } = await createSession(client, row.id, freshUser.session_version);
    return { user: publicUser(freshUser), token };
  });
}

export async function cleanupExpiredSessions({ limit = 500 } = {}) {
  if (!dbEnabled()) return { deleted: 0, mode: 'mock' };
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 5000);
  const result = await pool.query(
    `WITH doomed AS (
       SELECT token_hash FROM sessions
       WHERE expires_at <= NOW() OR revoked_at IS NOT NULL
       ORDER BY expires_at ASC, created_at ASC
       LIMIT $1
     )
     DELETE FROM sessions s USING doomed d
     WHERE s.token_hash=d.token_hash`,
    [safeLimit]
  );
  return { deleted: result.rowCount };
}

export function requireAdmin(user) {
  requireUser(user);
  if (user.role !== 'admin') {
    const error = new Error('Admin access required');
    error.statusCode = 403;
    throw error;
  }
  return user;
}

export function requireUser(user) {
  if (!user) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

export function authCookieName() {
  return COOKIE;
}

export function sessionPolicy() {
  return { absoluteDays: SESSION_DAYS, maxSessionsPerUser: maxSessionsPerUser() };
}

export function registerMockUser(emailInput, password) {
  const email = normalizeEmail(emailInput);
  const error = validateCredentials(email, password);
  if (error) throw new Error(error);
  if (mockAccounts.has(email)) throw new Error('An account with this email already exists');
  mockAccounts.set(email, { passwordHash: passwordHash(password), createdAt: Date.now() });
  return mockUser(email);
}

export function loginMockUser(emailInput, password) {
  const email = normalizeEmail(emailInput);
  const error = validateCredentials(email, password);
  if (error) throw new Error(error);
  const account = mockAccounts.get(email);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    const invalid = new Error(['Account not found.', 'Please sign up first.'].join(' '));
    invalid.code = 'INVALID_MOCK_CREDENTIALS';
    throw invalid;
  }
  return mockUser(email);
}

export function mockUser(email = 'demo@inbox9.local') {
  const normalized = String(email || 'demo@inbox9.local').trim().toLowerCase();
  const adminEmail = String(process.env.INBOX9_LOCAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const role = process.env.NODE_ENV !== 'production' && adminEmail && normalized === adminEmail ? 'admin' : 'user';
  return { id: role === 'admin' ? 'USR-DEMO-ADMIN' : 'USR-DEMO', email: normalized, role, createdAt: Date.now() };
}

export function setMockSession(res, email = 'demo@inbox9.local') {
  const encoded = encodeURIComponent(String(email).trim().toLowerCase());
  res.setHeader('Set-Cookie', `inbox9_demo=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
}

export function getMockSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (!cookies.inbox9_demo) return null;
  const email = normalizeEmail(decodeURIComponent(cookies.inbox9_demo));
  return mockAccounts.has(email) ? mockUser(email) : null;
}

export function resetMockAuth() {
  mockAccounts.clear();
}
