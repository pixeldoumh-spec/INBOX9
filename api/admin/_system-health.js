import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled, getPool } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { observabilitySnapshot } from '../_lib/observability.js';
import { providerHealth } from '../_lib/provider-repository.js';
import { getProviderOperationsMonitor } from '../_lib/admin-repository.js';
import { getLatestWalletReconciliation, listOpenWalletReconciliationIssues } from '../_lib/wallet-reconciliation.js';
import { productionConfiguration, runtimeMode } from '../_lib/runtime-config.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-system-health', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'System health requires PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  const pool = await getPool();
  const startedAt = process.hrtime.bigint();
  try {
    const database = await pool.query('SELECT NOW() AS now, current_database() AS database_name');
    const databaseLatencyMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6 * 100) / 100;
    const [providers, providerOperations, walletRecon, openReconIssues, services, routing, support, notifications] = await Promise.all([
      providerHealth(),
      getProviderOperationsMonitor(20),
      getLatestWalletReconciliation(),
      listOpenWalletReconciliationIssues(100),
      pool.query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active=TRUE)::int AS active FROM services'),
      pool.query("SELECT COUNT(*) FILTER (WHERE s.active=TRUE)::int AS active_services_without_route FROM services s LEFT JOIN service_provider_routes r ON r.service_id=s.id AND r.active=TRUE LEFT JOIN providers p ON p.id=r.provider_id AND p.active=TRUE WHERE s.active=TRUE GROUP BY s.id HAVING COUNT(p.id)=0"),
      pool.query("SELECT COUNT(*) FILTER (WHERE status='Open')::int AS open_count, COUNT(*) FILTER (WHERE status='In Progress')::int AS in_progress_count FROM support_requests"),
      pool.query('SELECT COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread_count FROM notifications')
    ]);
    const config = productionConfiguration();
    const runtime = observabilitySnapshot();
    const providerFailures = providers.filter(item => item.healthy === false).length;
    const routingGaps = Number(routing.rows.reduce((sum, row) => sum + Number(row.active_services_without_route || 0), 0));
    const supportOpen = Number(support.rows[0].open_count || 0);
    const supportInProgress = Number(support.rows[0].in_progress_count || 0);
    const unreadNotifications = Number(notifications.rows[0].unread_count || 0);
    const runtimeStatus = runtime.counters.http5xx > 0 ? 'degraded' : 'healthy';
    const databaseStatus = databaseLatencyMs > 3000 ? 'critical' : (databaseLatencyMs > 1000 ? 'degraded' : 'healthy');
    const checks = {
      database: { status: databaseStatus, reachable: true, latencyMs: databaseLatencyMs, name: database.rows[0].database_name },
      runtime: { status: runtimeStatus, mode: runtimeMode(), uptimeSeconds: runtime.uptimeSeconds },
      productionConfiguration: { status: config.database && config.appOrigin && config.cronAuth ? 'healthy' : 'critical', database: config.database, appOrigin: config.appOrigin, cronAuth: config.cronAuth, persistentRuntime: config.persistentRuntime, syntheticRuntime: config.syntheticRuntime },
      providers: { status: providerFailures ? 'critical' : 'healthy', total: providers.length, failures: providerFailures, items: providers },
      providerOperations: { status: providerOperations.summary.failed > 0 ? 'degraded' : (providerOperations.summary.pending > 5 ? 'degraded' : 'healthy'), pending: providerOperations.summary.pending, failed: providerOperations.summary.failed, oldestPendingAt: providerOperations.summary.oldestPendingAt },
      walletReconciliation: { status: walletRecon?.status === 'Passed' && openReconIssues.length === 0 ? 'healthy' : 'critical', latestStatus: walletRecon?.status || 'No run', walletsChecked: walletRecon?.walletsChecked || 0, mismatches: walletRecon?.mismatchesFound || 0, openIssues: openReconIssues.length },
      serviceRouting: { status: routingGaps ? 'critical' : 'healthy', totalServices: Number(services.rows[0].total || 0), activeServices: Number(services.rows[0].active || 0), activeServicesWithoutUsableRoute: routingGaps },
      support: { status: supportOpen > 25 ? 'degraded' : 'healthy', open: supportOpen, inProgress: supportInProgress },
      notifications: { status: unreadNotifications > 1000 ? 'degraded' : 'healthy', unread: unreadNotifications }
    };
    const criticals = Object.values(checks).filter(check => check.status === 'critical').length;
    const degraded = Object.values(checks).filter(check => check.status === 'degraded').length;
    const overall = criticals ? 'Critical' : (degraded ? 'Degraded' : 'Healthy');
    return res.status(200).json({ overall, generatedAt: Date.now(), deployment: { commit: process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || 'unknown', environment: process.env.NODE_ENV || 'unknown', region: process.env.RENDER_REGION || 'unknown' }, checks, observability: runtime });
  } catch (error) {
    console.error('admin.system_health_failed', error);
    return res.status(503).json({ error: 'System health unavailable' });
  }
}
