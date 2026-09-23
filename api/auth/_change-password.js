import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser, changePassword, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'auth-change-password', 5, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }

  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  if (!dbEnabled()) return res.status(503).json({ error: 'Password changes require PostgreSQL' });

  const currentPassword = req.body?.currentPassword;
  const newPassword = req.body?.newPassword;
  try {
    const result = await changePassword(req, currentPassword, newPassword);
    setSessionCookie(res, result.token);
    return res.status(200).json({ ok: true, user: result.user, sessionsInvalidated: true });
  } catch (error) {
    const status = error.statusCode || (error.message === 'AUTH_DATABASE_REQUIRED' ? 503 : 400);
    return res.status(status).json({ error: error.message === 'AUTH_DATABASE_REQUIRED' ? 'Authentication database is not configured' : error.message });
  }
}
