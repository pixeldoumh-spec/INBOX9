import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { login, loginMockUser, setMockSession, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'auth-login', 10, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  const { email, password } = req.body || {};
  try {
    if (!dbEnabled() && process.env.NODE_ENV === 'production' && !isSyntheticProduction()) return res.status(503).json({ error: 'Authentication database is not configured' });
    if (!dbEnabled()) {
      const user = loginMockUser(email, password);
      setMockSession(res, user.email);
      return res.status(200).json({ user, mode: 'mock' });
    }
    const session = await login(email, password);
    setSessionCookie(res, session.token);
    return res.status(200).json({ user: session.user });
  } catch (error) {
    if (error.message === 'AUTH_DATABASE_REQUIRED') {
      return res.status(503).json({ error: 'Authentication database is not configured' });
    }
    if (error.code === 'INVALID_CREDENTIALS' || error.code === 'ACCOUNT_DISABLED') {
      return res.status(401).json({ error: error.message });
    }
    if (/^(Enter a valid email address|Password must be at least 8 characters|Password is too long)$/.test(String(error.message || ''))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('auth.login_failed', error);
    return res.status(503).json({ error: 'Authentication service unavailable' });
  }
}
