import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { resetMocks } from '../api/_lib/mock.js';

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const url = new URL(path, `http://127.0.0.1:${address.port}`);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {})
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    if (options.body !== undefined) {
      req.setHeader('content-type', 'application/json');
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

function json(response) {
  return response.body ? JSON.parse(response.body) : {};
}

function cookieFrom(response, current = '') {
  const value = response.headers['set-cookie']?.[0]?.split(';', 1)[0];
  return value || current;
}

async function withServer(work) {
  resetMocks();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminEmail = process.env.INBOX9_LOCAL_ADMIN_EMAIL;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.INBOX9_LOCAL_ADMIN_EMAIL = 'admin-runtime@example.test';

  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await work(server);
  } finally {
    server.close();
    await once(server, 'close');
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAdminEmail === undefined) delete process.env.INBOX9_LOCAL_ADMIN_EMAIL;
    else process.env.INBOX9_LOCAL_ADMIN_EMAIL = originalAdminEmail;
    resetMocks();
  }
}

await withServer(async (server) => {
  const staticPage = await request(server, '/');
  assert.equal(staticPage.status, 200);
  assert.match(staticPage.body, /id="app"/);

  const health = await request(server, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(json(health).ok, true);

  const services = await request(server, '/api/services');
  assert.equal(services.status, 200);
  assert.equal(json(services).services.length, 832);

  const email = `runtime-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = 'RuntimeTest!123';
  const register = await request(server, '/api/auth/register', {
    method: 'POST',
    body: { email, password }
  });
  assert.equal(register.status, 201);
  assert.equal(json(register).user.email, email);

  let cookie = cookieFrom(register);
  assert.ok(cookie);

  const me = await request(server, '/api/auth/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal(json(me).authenticated, true);
  const userCookie = cookie;

  const recharge = await request(server, '/api/recharges', {
    method: 'POST',
    headers: { cookie, origin: 'http://127.0.0.1' },
    body: { amount: 100, utr: 'RUNTIME-UTR-0001' }
  });
  assert.equal(recharge.status, 201);

  const adminEmail = 'admin-runtime@example.test';
  const adminRegister = await request(server, '/api/auth/register', {
    method: 'POST',
    body: { email: adminEmail, password: 'RuntimeAdmin!123' }
  });
  assert.equal(adminRegister.status, 201);
  const adminCookie = cookieFrom(adminRegister);

  const pending = await request(server, '/api/admin/recharges', { headers: { cookie: adminCookie } });
  assert.equal(pending.status, 200);
  assert.ok(json(pending).recharges.some(item => item.utr === 'RUNTIME-UTR-0001'));
  const pendingRecharge = json(pending).recharges.find(item => item.utr === 'RUNTIME-UTR-0001');
  const approval = await request(server, '/api/admin/recharges/' + encodeURIComponent(pendingRecharge.id), {
    method: 'POST',
    headers: { cookie: adminCookie, origin: 'http://127.0.0.1' },
    body: { decision: 'approve' }
  });
  assert.equal(approval.status, 200);

  cookie = userCookie;
  const wallet = await request(server, '/api/wallet', { headers: { cookie } });
  assert.equal(wallet.status, 200);
  assert.equal(json(wallet).balancePaise, 10000);

  const activation = await request(server, '/api/activations', {
    method: 'POST',
    headers: { cookie, 'idempotency-key': 'runtime-activation-0001', origin: 'http://127.0.0.1' },
    body: { serviceId: 'whatsapp-0' }
  });
  assert.equal(activation.status, 201);
  const activationBody = json(activation);
  assert.equal(activationBody.serviceId, 'whatsapp-0');
  assert.equal(activationBody.country, 'IN');
  assert.equal(activationBody.status, 'Active');
  assert.match(activationBody.number, /^\+91 /);

  const current = await request(server, `/api/activations/${encodeURIComponent(activationBody.id)}`, { headers: { cookie } });
  assert.equal(current.status, 200);
  assert.equal(json(current).id, activationBody.id);

  const logout = await request(server, '/api/auth/logout', { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);

  cookie = cookieFrom(logout, cookie);
  const meAfterLogout = await request(server, '/api/auth/me', { headers: { cookie } });
  assert.equal(meAfterLogout.status, 401);
});
