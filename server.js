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
import wallet from './api/wallet/_index.js';
import recharges from './api/recharges/_index.js';
import activations from './api/activations/_index.js';
import activationById from './api/activations/_id.js';
import activationCancel from './api/activations/_id/_cancel.js';
import serviceServers from './api/services/_id/_servers.js';
import adminOverview from './api/admin/_overview.js';
import adminRecharges from './api/admin/recharges/_index.js';
import adminRechargeById from './api/admin/recharges/_id.js';
import adminUsers from './api/admin/_users.js';
import adminServices from './api/admin/_services.js';
import adminServiceById from './api/admin/services/_id.js';
import adminActivations from './api/admin/_activations.js';
import adminLedger from './api/admin/_ledger.js';
import adminProviders from './api/admin/_providers.js';
import adminProvidersHealth from './api/admin/_providers-health.js';
import adminAudit from './api/admin/_audit.js';
import adminWalletReconciliation from './api/admin/_wallet-reconciliation.js';
import adminPaymentReconciliation from './api/admin/_payment-reconciliation.js';
import internalProviderReconcile from './api/_internal-provider-reconcile.js';
import { assertProductionConfiguration } from './api/_lib/runtime-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 32_000;

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/upi-qr.jpg', ['public/upi-qr.jpg', 'image/jpeg']],
  ['/payment-qr.jpg', ['public/upi-qr.jpg', 'image/jpeg']]
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

function readJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return Promise.resolve({});

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
      if (total > MAX_BODY_BYTES) {
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
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on('error', fail);
  });
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
    ['POST /api/internal-provider-reconcile', internalProviderReconcile]
  ]);

  const exactHandler = exact.get(`${method} ${pathname}`);
  if (exactHandler) return { handler: exactHandler, query: {} };

  let match = pathname.match(/^\/api\/activations\/([^/]+)\/cancel$/);
  if (match) return { handler: activationCancel, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/activations\/([^/]+)$/);
  if (match) return { handler: activationById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/services\/([^/]+)\/servers$/);
  if (match) return { handler: serviceServers, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/recharges\/([^/]+)$/);
  if (match) return { handler: adminRechargeById, query: { id: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/admin\/services\/([^/]+)$/);
  if (match) return { handler: adminServiceById, query: { id: decodeURIComponent(match[1]) } };

  return null;
}

async function dispatchApi(req, nodeRes, url) {
  const route = routeFor(req.method || 'GET', url.pathname);
  if (!route) return sendNodeJson(nodeRes, 404, { error: 'API route not found' });

  try {
    req.body = await readJsonBody(req);
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
    console.error('runtime.unhandled_api_error', error);
    if (!nodeRes.headersSent) {
      sendNodeJson(nodeRes, 500, { error: 'Internal server error' });
    }
  }
}

function serveStatic(nodeRes, pathname) {
  const fileInfo = staticFiles.get(pathname);
  if (!fileInfo) return sendNodeJson(nodeRes, 404, { error: 'Not found' });

  const file = path.join(__dirname, fileInfo[0]);
  fs.stat(file, (statError, stats) => {
    if (statError || !stats.isFile()) return sendNodeJson(nodeRes, 404, { error: 'Not found' });
    nodeRes.statusCode = 200;
    nodeRes.setHeader('content-type', fileInfo[1]);
    fs.createReadStream(file).on('error', () => {
      if (!nodeRes.headersSent) sendNodeJson(nodeRes, 500, { error: 'Static asset unavailable' });
      else nodeRes.destroy();
    }).pipe(nodeRes);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      return dispatchApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendNodeJson(res, 405, { error: 'Method not allowed' });
    }

    if (req.method === 'HEAD') {
      const fileInfo = staticFiles.get(url.pathname);
      if (!fileInfo) return sendNodeJson(res, 404, { error: 'Not found' });
      return fs.stat(path.join(__dirname, fileInfo[0]), (error, stats) => {
        if (error || !stats.isFile()) return sendNodeJson(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'content-type': fileInfo[1], 'content-length': stats.size });
        res.end();
      });
    }

    return serveStatic(res, url.pathname);
  });
}

export function startServer({ port = DEFAULT_PORT, host = process.env.HOST || '0.0.0.0' } = {}) {
  assertProductionConfiguration();
  const server = createServer();
  server.listen(Number(port), host, () => {
    const address = server.address();
    const shownHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`INBOX9 runtime: http://${shownHost}:${typeof address === 'object' && address ? address.port : port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer();
}
