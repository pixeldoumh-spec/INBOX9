import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { listProviders, providerHealth } from '../_lib/provider-repository.js';
import { listProviderAdapters } from '../_lib/provider-registry.js';
import { providerGatewayTimeouts } from '../_lib/provider-gateway.js';
import { externalRoutingEnabled, listProviderRouteAttempts, listProviderRouteHealth } from '../_lib/provider-routing.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-providers', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Provider registry requires PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try {
    return res.status(200).json({
      providers: await listProviders(),
      health: await providerHealth(),
      installedAdapters: listProviderAdapters(),
      gateway: {
        version: 1,
        timeoutsMs: providerGatewayTimeouts(),
        metrics: 'process-local',
        safeReserveRetry: 'disabled by default to prevent duplicate provider allocations',
        externalRoutingEnabled: externalRoutingEnabled(),
      },
      routeHealth: await listProviderRouteHealth({ limit: 100 }),
      routeAttempts: await listProviderRouteAttempts({ limit: 100 }),
    });
  } catch (error) {
    console.error('admin.providers_failed', error);
    return res.status(503).json({ error: 'Provider registry unavailable' });
  }
}
