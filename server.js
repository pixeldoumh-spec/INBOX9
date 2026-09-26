import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import health from './api/_health.js';
import services from './api/_services.js';
import authRegister from './api/auth/_register.js';
import authLogin from './api/auth/_login.js';
import authLogout from './api/auth/_logout.js';
import authMe from './api/auth/_me.js';
import authLogoutAll from './api/auth/_logout-all.js';
import authChangePassword from './api/auth/_change-password.js';
import authSessions from './api/auth/_sessions.js';
import authSessionById from './api/auth/_sessions/_id.js';
import authProfile from './api/auth/_profile.js';
import authRecoveryCode from './api/auth/_recovery-code.js';
import authRecover from './api/auth/_recover.js';
import wallet from './api/wallet/_index.js';
import recharges from './api/recharges/_index.js';
import support from './api/support/_index.js';
import supportReply from './api/support/_id/_replies.js';
import notifications from './api/notifications/_index.js';
import notificationById from './api/notifications/_id.js';
import activations from './api/activations/_index.js';
import activationById from './api/activations/_id.js';
import activationCancel from './api/activations/_id/_cancel.js';
import serviceServers from './api/services/_id/_servers.js';
import adminOverview from './api/admin/_overview.js';
import adminRecharges from './api/admin/recharges/_index.js';
import adminRechargeById from './api/admin/recharges/_id.js';
import adminUsers from './api/admin/_users.js';
import adminUserById from './api/admin/users/_id.js';
import adminServices from './api/admin/_services.js';
import adminServiceById from './api/admin/services/_id.js';
import adminActivations from './api/admin/_activations.js';
import adminActivationById from './api/admin/activations/_id.js';
import adminLedger from './api/admin/_ledger.js';
import adminProviders from './api/admin/_providers.js';
import adminProvidersHealth from './api/admin/_providers-health.js';
import adminProviderQualification from './api/admin/_provider-qualification.js';
import adminProviderReadiness from './api/admin/_provider-readiness.js';
import adminAudit from './api/admin/_audit.js';
import adminSupport from './api/admin/support/_index.js';
import adminNotifications from './api/admin/_notifications.js';
import adminSupportById from './api/admin/support/_id.js';
import adminWalletReconciliation from './api/admin/_wallet-reconciliation.js';
import adminPaymentReconciliation from './api/admin/_payment-reconciliation.js';
import adminPaymentSettings from './api/admin/_payment-settings.js';
import adminSystemHealth from './api/admin/_system-health.js';
import adminProviderOperations from './api/admin/_provider-operations.js';
import internalProviderReconcile from './api/_internal-provider-reconcile.js';
import { assertProductionConfiguration } from './api/_lib/runtime-config.js';
import { applySecurityHeaders, requestId } from './api/_lib/security.js';
import { captureException, finishRequestObservation, installProcessHandlers, markServerStarted, startRequestObservation } from './api/_lib/observability.js';
import clientErrors from './api/observability/_client-errors.js';
import paymentWebhook from './api/payments/_webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 32_000;
const MAX_PAYMENT_SETTINGS_BODY_BYTES = 512_000;

const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
const FRONTEND_INDEX = path.join(FRONTEND_DIST, 'index.html');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon']
]);

class RuntimeResponse {
  constructor(nodeResponse) {
    this.nodeResponse = nodeResponse;
    this.statusCode = 200;
  }

  status(code) {
    this.statusCode = Number(code) || 200;
    return this;
  }

  setHeader(name, value) {
    this.nodeResponse.setHeader(name, value);
    return this;
  }

  getHeader(name) {
    return this.nodeResponse.getHeader(name);
  }

  removeHeader(name) {
    this.nodeResponse.removeHeader(name);
  }

  get headersSent() {
    return this.nodeResponse.headersSent;
  }

  json(body) {
    if (this.nodeResponse.headersSent) return this;
    if (!this.nodeResponse.hasHeader('content-type')) {
      this.nodeResponse.setHeader('content-type', 'application/json; charset=utf-8');
    }
    this.nodeResponse.writeHead(this.statusCode);
    this.nodeResponse.end(JSON.stringify(body));
    return this;
  }

  end(body = '') {
    if (this.nodeResponse.headersSent) return this;
    this.nodeResponse.writeHead(this.statusCode);
    this.nodeResponse.end(body);
    return this;
  }
}

function sendNodeJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return Promise.resolve('');

  return new Promise((resolve, reject) => {
    let raw = '';
    let total = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error('Payload too large');
        error.statusCode = 413;
        settled = true;
        req.resume();
        reject(error);
        return;
      }
      raw += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(raw);
    });

    req.on('error', fail);
  });
}

async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const raw = await readRawBody(req, maxBytes);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function routeFor(method, pathname) {
  if (pathname === '/api/health') return { handler: health, query: {} };
  if (pathname === '/api/services') return { handler: services, query: {} };

  const exact = new Map([
    ['POST /api/auth/register', authRegister],
    ['POST /api/auth/login', authLogin],
    ['POST /api/auth/logout', authLogout],
    ['GET /api/auth/me', authMe],
    ['POST /api/auth/logout-all', authLogoutAll],
    ['POST /api/auth/change-password', authChangePassword],
    ['GET /api/auth/sessions', authSessions],
    ['POST /api/auth/profile', authProfile],
    ['POST /api/auth/recovery-code', authRecoveryCode],
    ['POST /api/auth/recover', authRecover],
    ['GET /api/notifications', notifications],
    ['POST /api/notifications/read-all', notifications],
    ['GET /api/wallet', wallet],
    ['GET /api/recharges', recharges],
    ['POST /api/recharges', recharges],
    ['GET /api/support', support],
    ['POST /api/support', support],
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
    ['GET /api/admin/provider-qualification', adminProviderQualification],
    ['POST /api/admin/provider-qualification', adminProviderQualification],
    ['GET /api/admin/provider-readiness', adminProviderReadiness],
    ['POST /api/admin/provider-readiness', adminProviderReadiness],
    ['GET /api/admin/audit', adminAudit],
    ['GET /api/admin/support', adminSupport],
    ['GET /api/admin/notifications', adminNotifications],
    ['POST /api/admin/notifications', adminNotifications],
    ['GET /api/admin/wallet-reconciliation', adminWalletReconciliation],
    ['POST /api/admin/wallet-reconciliation', adminWalletReconciliation],
    ['PATCH /api/admin/wallet-reconciliation', adminWalletReconciliation],
    ['GET /api/admin/payment-reconciliation', adminPaymentReconciliation],
    ['GET /api/admin/payment-settings', adminPaymentSettings],
    ['PATCH /api/admin/payment-settings', adminPaymentSettings],
    ['GET /api/admin/provider-operations', adminProviderOperations],
    ['GET /api/admin/system-health', adminSystemHealth],
    ['POST /api/internal-provider-reconcile', internalProviderReconcile],
    ['POST /api/client-errors', clientErrors],
    ['POST /api/payments/webhook', paymentWebhook],
  ]);

  const exactHandler = exact.get(`${method} ${pathname}`);
  if (exactHandler) return { handler: exactHandler, query: {} };

  let match = pathname.match(/^\/api\/auth\/sessions\/([^/]+)$/);
  if (match) return { handler: authSessionById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/notifications\/([^/]+)$/);
  if (match) return { handler: notificationById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/support\/([^/]+)\/replies$/);
  if (match) return { handler: supportReply, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/activations\/([^/]+)\/cancel$/);
  if (match) return { handler: activationCancel, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/activations\/([^/]+)$/);
  if (match) return { handler: activationById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/services\/([^/]+)\/servers$/);
  if (match) return { handler: serviceServers, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (match) return { handler: adminUserById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/recharges\/([^/]+)$/);
  if (match) return { handler: adminRechargeById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/support\/([^/]+)$/);
  if (match) return { handler: adminSupportById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/services\/([^/]+)$/);
  if (match) return { handler: adminServiceById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/activations\/([^/]+)$/);
  if (match) return { handler: adminActivationById, query: { id: decodeURIComponent(match[1]) } };

  return null;
}

async function dispatchApi(req, nodeRes, url) {
  const route = routeFor(req.method || 'GET', url.pathname);
  if (!route) return sendNodeJson(nodeRes, 404, { error: 'API route not found' });

  try {
    if (url.pathname === '/api/payments/webhook' && req.method === 'POST') {
      req.rawBody = await readRawBody(req);
      req.body = req.rawBody.trim() ? JSON.parse(req.rawBody) : {};
    } else {
      const maxBodyBytes = url.pathname === '/api/admin/payment-settings'
        ? MAX_PAYMENT_SETTINGS_BODY_BYTES
        : MAX_BODY_BYTES;
      req.body = await readJsonBody(req, maxBodyBytes);
    }
  } catch (error) {
    return sendNodeJson(nodeRes, error.statusCode || 400, { error: error.message });
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  Object.assign(req.query, route.query);

  const res = new RuntimeResponse(nodeRes);
  try {
    await route.handler(req, res);
    if (!nodeRes.writableEnded) res.end();
  } catch (error) {
    captureException(error, { requestId: req.requestId, method: req.method, path: url.pathname, statusCode: 500 });
    if (!nodeRes.headersSent) {
      sendNodeJson(nodeRes, 500, { error: 'Internal server error' });
    }
  }
}

function staticCacheHeaders(pathname, stats) {
  const etag = '"' + Math.round(stats.mtimeMs).toString(16) + '-' + stats.size.toString(16) + '"';
  return {
    'Cache-Control': pathname === '/' || pathname === '/index.html' ? 'private, no-cache' : 'public, no-cache',
    ETag: etag,
    'Last-Modified': stats.mtime.toUTCString()
  };
}

function isStaticNotModified(req, etag, lastModified) {
  const ifNoneMatch = String(req.headers?.['if-none-match'] || '').trim();
  if (ifNoneMatch && ifNoneMatch.split(',').map((value) => value.trim()).includes(etag)) return true;
  const ifModifiedSince = String(req.headers?.['if-modified-since'] || '').trim();
  if (ifModifiedSince) {
    const since = Date.parse(ifModifiedSince);
    const modified = Date.parse(lastModified);
    if (Number.isFinite(since) && Number.isFinite(modified) && modified <= since) return true;
  }
  return false;
}

function applyStaticResponseHeaders(nodeRes, pathname, stats) {
  const headers = staticCacheHeaders(pathname, stats);
  for (const [key, value] of Object.entries(headers)) nodeRes.setHeader(key, value);
  return headers;
}

function frontendFilePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(FRONTEND_DIST, relative || 'index.html');
  if (candidate !== FRONTEND_DIST && !candidate.startsWith(FRONTEND_DIST + path.sep)) return null;
  return { candidate, relative };
}

function contentTypeFor(pathname) {
  return MIME_TYPES.get(path.extname(pathname).toLowerCase()) || 'application/octet-stream';
}

function serveFrontend(nodeRes, pathname, req) {
  const info = frontendFilePath(pathname);
  if (!info) return sendNodeJson(nodeRes, 404, { error: 'Not found' });

  fs.stat(info.candidate, (statError, stats) => {
    let file = info.candidate;
    let contentType = contentTypeFor(info.relative || 'index.html');
    let servedPath = pathname;

    if (statError || !stats.isFile()) {
      // Vite's SPA entry handles application routes such as /apps and /active/:id.
      if (path.extname(info.relative)) return sendNodeJson(nodeRes, 404, { error: 'Not found' });
      file = FRONTEND_INDEX;
      contentType = 'text/html; charset=utf-8';
      servedPath = '/index.html';
      fs.stat(file, (indexError, indexStats) => {
        if (!indexError && indexStats.isFile()) return sendFrontendFile(nodeRes, file, contentType, servedPath, req, indexStats);
        // Backend-only test/dev environments may not have a Vite build yet.
        const fallback = path.join(__dirname, 'index.html');
        fs.stat(fallback, (fallbackError, fallbackStats) => {
          if (fallbackError || !fallbackStats.isFile()) return sendNodeJson(nodeRes, 503, { error: 'Frontend build unavailable' });
          sendFrontendFile(nodeRes, fallback, contentType, servedPath, req, fallbackStats);
        });
      });
      return;
    }

    sendFrontendFile(nodeRes, file, contentType, servedPath, req, stats);
  });
}

function sendFrontendFile(nodeRes, file, contentType, pathname, req, stats) {
  const headers = applyStaticResponseHeaders(nodeRes, pathname, stats);
  if (isStaticNotModified(req, headers.ETag, headers['Last-Modified'])) {
    nodeRes.statusCode = 304;
    nodeRes.removeHeader('content-type');
    return nodeRes.end();
  }
  nodeRes.statusCode = 200;
  nodeRes.setHeader('content-type', contentType);
  // Keep the application shell rendered in mobile browsers instead of treating
  // the HTML entry document as a file download.
  if (contentType === 'text/html; charset=utf-8') {
    nodeRes.setHeader('content-disposition', 'inline; filename="index.html"');
    nodeRes.setHeader('content-length', String(stats.size));
  }
  if (req.method === 'HEAD') {
    nodeRes.setHeader('content-length', stats.size);
    return nodeRes.end();
  }
  fs.createReadStream(file).on('error', (error) => {
    captureException(error, { requestId: nodeRes.getHeader?.('x-request-id'), method: 'GET', path: pathname, statusCode: 500 });
    if (!nodeRes.headersSent) sendNodeJson(nodeRes, 500, { error: 'Static asset unavailable' });
    else nodeRes.destroy();
  }).pipe(nodeRes);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    applySecurityHeaders(res);
    req.requestId = requestId(req, res);
    const observation = startRequestObservation(req, req.requestId);
    res.once('finish', () => finishRequestObservation(observation, res.statusCode));
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      return dispatchApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendNodeJson(res, 405, { error: 'Method not allowed' });
    }

    return serveFrontend(res, url.pathname, req);
  });
}

export function startServer({ port = DEFAULT_PORT, host = process.env.HOST || '0.0.0.0' } = {}) {
  assertProductionConfiguration();
  installProcessHandlers();
  const server = createServer();
  server.listen(Number(port), host, () => {
    const address = server.address();
    const shownHost = host === '0.0.0.0' ? 'localhost' : host;
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`INBOX9 runtime: http://${shownHost}:${actualPort}`);
    markServerStarted({ host, port: actualPort });
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer();
}
