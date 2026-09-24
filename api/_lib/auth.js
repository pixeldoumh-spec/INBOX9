import crypto from 'node:crypto';
import { getPool, withTransaction, dbEnabled } from './db.js';

const SESSION_DAYS = 7;
const SESSION_MAX_PER_USER = 5;
const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-inbox9_session' : 'inbox9_session';
const mockAccounts = new Map();
const mockProfiles = new Map();
const mockRecoveryCodes = new Map();

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

function syntheticMode() {
  return process.env.NODE_ENV === 'production' && String(process.env.INBOX9_RUNTIME_MODE || 'synthetic').trim().toLowerCase() === 'synthetic';
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
  const entries = [];
  for (const part of String(header || '').split(';')) {
    const value = part.trim();
    if (!value) continue;
    const i = value.indexOf('=');
    if (i < 0) {
      entries.push([value, '']);
      continue;
    }
    const name = value.slice(0, i);
    const raw = value.slice(i + 1);
    try {
      entries.push([name, decodeURIComponent(raw)]);
    } catch {
      // Ignore malformed cookie values rather than turning a bad request into a 500.
    }
  }
  return Object.fromEntries(entries);
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
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name || '',
    createdAt: new Date(row.created_at).getTime()
  };
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
  const sessionId = 'SES-' + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await client.query(
    `INSERT INTO sessions (session_id,token_hash,user_id,session_version,expires_at,last_used_at,revoked_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),NULL)`,
    [sessionId, tokenHash, userId, sessionVersion, expiresAt]
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
    `SELECT s.session_id,s.token_hash,s.user_id,s.session_version,s.expires_at,s.created_at,s.last_used_at,
            u.id,u.email,u.role,u.display_name,u.created_at,u.session_version AS user_session_version
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
      `SELECT id,email,password_hash,role,display_name,created_at,active,session_version
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
      `SELECT id,email,role,display_name,created_at,password_hash,active,session_version
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
       RETURNING id,email,role,display_name,created_at,session_version`,
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
  if (syntheticMode()) return mockUser(email);
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
  const stableId = `USR-SYN-${hash(normalized).slice(0, 16).toUpperCase()}`;
  const adminEmail = String(process.env.INBOX9_LOCAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const role = process.env.NODE_ENV !== 'production' && adminEmail && normalized === adminEmail ? 'admin' : 'user';
  const profile = mockProfiles.get(normalized);
  return { id: role === 'admin' ? 'USR-DEMO-ADMIN' : stableId, email: normalized, role, displayName: profile?.displayName || '', createdAt: profile?.createdAt || Date.now() };
}

export function setMockSession(res, email = 'demo@inbox9.local') {
  const encoded = encodeURIComponent(String(email).trim().toLowerCase());
  res.setHeader('Set-Cookie', `inbox9_demo=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
}

export function getMockSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  if (!cookies.inbox9_demo) return null;
  const email = normalizeEmail(decodeURIComponent(cookies.inbox9_demo));
  return syntheticMode() || mockAccounts.has(email) ? mockUser(email) : null;
}

export function resetMockAuth() {
  mockAccounts.clear();
  mockProfiles.clear();
  mockRecoveryCodes.clear();
}

function recoveryCodeValue() {
  return 'REC-' + crypto.randomBytes(10).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase();
}

export async function listUserSessions(userId, currentTokenHash = null) {
  if (!dbEnabled()) return [];
  const pool = await getPool();
  const result = await pool.query(
    `SELECT session_id,created_at,last_used_at,expires_at,token_hash
     FROM sessions
     WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW()
     ORDER BY CASE WHEN token_hash=$2 THEN 0 ELSE 1 END, last_used_at DESC NULLS LAST, created_at DESC
     LIMIT 20`,
    [userId, currentTokenHash || '']
  );
  return result.rows.map((row) => ({
    id: row.session_id,
    current: currentTokenHash ? row.token_hash === currentTokenHash : false,
    createdAt: new Date(row.created_at).getTime(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).getTime() : null,
    expiresAt: new Date(row.expires_at).getTime()
  }));
}

export async function revokeUserSession(req, sessionId, res) {
  if (!dbEnabled()) {
    clearSessionCookie(res);
    return { revoked: false, current: false };
  }
  const context = await getSessionRecord(req);
  if (!context) {
    clearSessionCookie(res);
    return { revoked: false, current: false };
  }
  const target = String(sessionId || '').trim();
  if (!target) throw Object.assign(new Error('Session id is required'), { statusCode: 400 });
  const pool = await getPool();
  const result = await pool.query(
    `DELETE FROM sessions WHERE session_id=$1 AND user_id=$2 RETURNING token_hash`,
    [target, context.user.id]
  );
  if (!result.rowCount) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  const current = result.rows[0].token_hash === context.tokenHash;
  if (current) clearSessionCookie(res);
  return { revoked: true, current };
}

export async function updateProfile(req, displayName) {
  if (!dbEnabled()) {
    const user = getMockSession(req);
    if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    const value = String(displayName || '').trim();
    if (value.length > 64) throw Object.assign(new Error('Display name must be 64 characters or fewer'), { statusCode: 400 });
    mockProfiles.set(user.email, { displayName: value, createdAt: user.createdAt });
    return mockUser(user.email);
  }
  const context = await getSessionRecord(req);
  if (!context) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const value = String(displayName || '').trim();
  if (value.length > 64) throw Object.assign(new Error('Display name must be 64 characters or fewer'), { statusCode: 400 });
  const pool = await getPool();
  const result = await pool.query(
    `UPDATE users SET display_name=$2,updated_at=NOW() WHERE id=$1 RETURNING id,email,role,display_name,created_at`,
    [context.user.id, value]
  );
  return publicUser(result.rows[0]);
}

export async function issueRecoveryCode(req) {
  if (!dbEnabled()) {
    const user = getMockSession(req);
    if (!user) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    const code = recoveryCodeValue();
    mockRecoveryCodes.set(user.email, { code, createdAt: Date.now(), used: false });
    return { code };
  }
  const context = await getSessionRecord(req);
  if (!context) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  return withTransaction(async (client) => {
    await client.query('DELETE FROM recovery_codes WHERE user_id=$1 AND used_at IS NULL', [context.user.id]);
    const code = recoveryCodeValue();
    await client.query(
      `INSERT INTO recovery_codes (id,user_id,code_hash) VALUES ($1,$2,$3)`,
      ['REC-' + crypto.randomUUID(), context.user.id, hash(code)]
    );
    return { code, createdAt: Date.now() };
  });
}

export async function recoverPassword(emailInput, recoveryCode, newPassword) {
  if (!dbEnabled()) throw new Error('AUTH_DATABASE_REQUIRED');
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address'), { statusCode: 400 });
  if (String(newPassword || '').length < 8) throw Object.assign(new Error('New password must be at least 8 characters'), { statusCode: 400 });
  if (String(newPassword).length > 128) throw Object.assign(new Error('New password is too long'), { statusCode: 400 });
  const code = String(recoveryCode || '').trim().toUpperCase();
  if (!/^REC-[A-Z0-9]{8,32}$/.test(code)) throw Object.assign(new Error('Recovery code is invalid or expired'), { statusCode: 400 });
  return withTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT id,email,role,display_name,created_at,active,session_version FROM users WHERE email=$1 FOR UPDATE`,
      [email]
    );
    if (!userResult.rowCount || !userResult.rows[0].active) throw Object.assign(new Error('Recovery code is invalid or expired'), { statusCode: 400 });
    const user = userResult.rows[0];
    const codes = await client.query(
      `SELECT id,code_hash FROM recovery_codes WHERE user_id=$1 AND used_at IS NULL AND created_at > NOW() - INTERVAL '90 days' ORDER BY created_at DESC LIMIT 5 FOR UPDATE`,
      [user.id]
    );
    const codeHash = Buffer.from(hash(code));
    const valid = codes.rows.find((row) => {
      const stored = Buffer.from(row.code_hash);
      return stored.length === codeHash.length && crypto.timingSafeEqual(stored, codeHash);
    });
    if (!valid) throw Object.assign(new Error('Recovery code is invalid or expired'), { statusCode: 400 });
    const nextDigest = passwordHash(newPassword);
    const updated = await client.query(
      `UPDATE users SET password_hash=$2,password_changed_at=NOW(),session_version=session_version+1,updated_at=NOW() WHERE id=$1 RETURNING id,email,role,display_name,created_at,session_version`,
      [user.id, nextDigest]
    );
    await client.query('UPDATE recovery_codes SET used_at=NOW() WHERE id=$1', [valid.id]);
    await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
    const { token } = await createSession(client, user.id, updated.rows[0].session_version);
    return { user: publicUser(updated.rows[0]), token };
  });
}


export async function listUserSessionsForRequest(req) {
  const context = await getSessionRecord(req);
  if (!context) return [];
  return listUserSessions(context.user.id, context.tokenHash);
}
