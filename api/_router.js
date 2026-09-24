import health from './_health.js';
import services from './_services.js';
import authRegister from './auth/_register.js';
import authLogin from './auth/_login.js';
import authLogout from './auth/_logout.js';
import authMe from './auth/_me.js';
import authLogoutAll from './auth/_logout-all.js';
import authChangePassword from './auth/_change-password.js';
import wallet from './wallet/_index.js';
import recharges from './recharges/_index.js';
import activations from './activations/_index.js';
import activationById from './activations/_id.js';
import activationCancel from './activations/_id/_cancel.js';
import serviceServers from './services/_id/_servers.js';
import adminOverview from './admin/_overview.js';
import adminRecharges from './admin/recharges/_index.js';
import adminRechargeById from './admin/recharges/_id.js';
import adminUsers from './admin/_users.js';
import adminServices from './admin/_services.js';
import adminServiceById from './admin/services/_id.js';
import adminActivations from './admin/_activations.js';
import adminLedger from './admin/_ledger.js';
import adminProviders from './admin/_providers.js';
import adminProvidersHealth from './admin/_providers-health.js';
import adminAudit from './admin/_audit.js';
import adminWalletReconciliation from './admin/_wallet-reconciliation.js';
import adminPaymentReconciliation from './admin/_payment-reconciliation.js';
import internalProviderReconcile from './_internal-provider-reconcile.js';

const exactRoutes = new Map([
  ['GET /api/health', health],
  ['GET /api/services', services],
  ['POST /api/auth/register', authRegister],
  ['POST /api/auth/login', authLogin],
  ['POST /api/auth/logout', authLogout],
  ['GET /api/auth/me', authMe],
  ['POST /api/auth/logout-all', authLogoutAll],
  ['POST /api/auth/change-password', authChangePassword],
  ['GET /api/wallet', wallet],
  ['GET /api/recharges', recharges],
  ['POST /api/recharges', recharges],
  ['GET /api/activations', activations],
  ['POST /api/activations', activations],
  ['GET /api/admin/overview', adminOverview],
  ['GET /api/admin/recharges', adminRecharges],
  ['POST /api/admin/recharges/:id', adminRechargeById],
  ['GET /api/admin/users', adminUsers],
  ['GET /api/admin/services', adminServices],
  ['PATCH /api/admin/services/:id', adminServiceById],
  ['GET /api/admin/activations', adminActivations],
  ['GET /api/admin/ledger', adminLedger],
  ['GET /api/admin/providers', adminProviders],
  ['GET /api/admin/providers-health', adminProvidersHealth],
  ['GET /api/admin/audit', adminAudit],
  ['GET /api/admin/wallet-reconciliation', adminWalletReconciliation],
  ['GET /api/admin/payment-reconciliation', adminPaymentReconciliation],
  ['GET /api/cron/reconcile', internalProviderReconcile],
  ['POST /api/internal-provider-reconcile', internalProviderReconcile]
]);

function routeFor(method, pathname) {
  const exact = exactRoutes.get(`${method} ${pathname}`);
  if (exact) return { handler: exact, query: {} };

  let match = pathname.match(/^\/api\/activations\/([^/]+)\/cancel$/);
  if (match && method === 'POST') {
    return { handler: activationCancel, query: { id: decodeURIComponent(match[1]) } };
  }

  match = pathname.match(/^\/api\/activations\/([^/]+)$/);
  if (match && method === 'GET') {
    return { handler: activationById, query: { id: decodeURIComponent(match[1]) } };
  }

  match = pathname.match(/^\/api\/services\/([^/]+)\/servers$/);
  if (match && method === 'GET') {
    return { handler: serviceServers, query: { id: decodeURIComponent(match[1]) } };
  }

  match = pathname.match(/^\/api\/admin\/recharges\/([^/]+)$/);
  if (match && method === 'POST') {
    return { handler: adminRechargeById, query: { id: decodeURIComponent(match[1]) } };
  }

  match = pathname.match(/^\/api\/admin\/services\/([^/]+)$/);
  if (match && method === 'PATCH') {
    return { handler: adminServiceById, query: { id: decodeURIComponent(match[1]) } };
  }

  return null;
}

export default async function router(req, res) {
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'https://inbox9.local').pathname;
  } catch {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
  if (!pathname.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });

  const route = routeFor(req.method || 'GET', pathname);
  if (!route) return res.status(404).json({ error: 'API route not found' });

  const routedReq = Object.create(req);
  routedReq.query = { ...(req.query || {}), ...route.query };

  try {
    await route.handler(routedReq, res);
    return undefined;
  } catch (error) {
    console.error('runtime.unhandled_api_error', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    return undefined;
  }
}
