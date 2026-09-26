import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { getActivation as getPersistedActivation } from '../_lib/activation-repository.js';
import { getMock } from '../_lib/mock.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'activation-status', 30, 60_000, `${user.id}:${String(req.query?.id || '')}`)) return;
  const item = dbEnabled() ? await getPersistedActivation(req.query.id, user.id) : getMock(req.query.id, user);
  return item ? res.status(200).json(item) : res.status(404).json({ error: 'Activation not found' });
}
