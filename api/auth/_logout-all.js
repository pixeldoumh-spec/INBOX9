import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser, logoutAllSessions } from '../_lib/auth.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'auth-logout-all', 5, 60_000) || !enforceSameOrigin(req, res)) return;
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try {
    const result = await logoutAllSessions(req, res);
    return res.status(200).json({ ok: true, invalidated: result.count });
  } catch (error) {
    console.error('auth.logout_all_failed', error);
    return res.status(503).json({ error: 'Unable to sign out all sessions' });
  }
}
