import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { createSupportTicket, listSupportTickets } from '../_lib/support-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }

  if (process.env.NODE_ENV === 'production' && !dbEnabled() && !isSyntheticProduction()) {
    return res.status(503).json({ error: 'Support database is not configured' });
  }

  if (req.method === 'GET') {
    if (!await rateLimitAsync(req, res, 'support-read', 60, 60_000, user.id)) return;
    try {
      return res.status(200).json({ tickets: await listSupportTickets(user) });
    } catch (error) {
      console.error('support.read_failed', error);
      return res.status(503).json({ error: 'Support service unavailable' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'support-create', 5, 600_000, user.id) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req, 16_000); } catch (e) { return res.status(413).json({ error: e.message }); }

  try {
    return res.status(201).json({ ticket: await createSupportTicket(user, req.body || {}) });
  } catch (error) {
    const message = String(error.message || '');
    if (/Choose a valid support category|Subject must be at least|Message must be at least|selected (activation|recharge) was not found/.test(message)) {
      return res.status(400).json({ error: message });
    }
    console.error('support.create_failed', error);
    return res.status(503).json({ error: 'Support service unavailable' });
  }
}
