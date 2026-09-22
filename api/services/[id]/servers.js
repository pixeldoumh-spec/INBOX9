import { applySecurityHeaders, requestId, rateLimitAsync } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../../_lib/auth.js';
import { getPersistedService } from '../../_lib/service-repository.js';
import { listSyntheticServerStats } from '../../_lib/synthetic-inventory-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'synthetic-server-stats', 120, 60_000, user.id)) return;

  const serviceId = String(req.query?.id || '').trim();
  if (!serviceId) return res.status(400).json({ error: 'Service id is required' });

  if (!dbEnabled()) {
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Synthetic inventory database is not configured' });
    return res.status(200).json({ serviceId, servers: (await import('../../_lib/synthetic-servers.js')).listSyntheticServers().map(server => ({ ...server, reservedCount: 0, availableCount: server.capacity })), persistent: false });
  }

  try {
    const service = await getPersistedService(serviceId);
    if (!service || service.active === false) return res.status(404).json({ error: 'Service not found' });
    return res.status(200).json({ serviceId, servers: await listSyntheticServerStats(serviceId), persistent: true });
  } catch (error) {
    console.error('synthetic.server_stats_failed', error);
    return res.status(503).json({ error: 'Server inventory unavailable' });
  }
}
