import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const port = 4199;
const base = `http://127.0.0.1:${port}`;
const adminEmail = 'admin@inbox9.local';
const userEmail = `e2e-${crypto.randomUUID()}@example.com`;
const password = 'StrongPass123!';

const child = spawn(process.execPath, ['dev-server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), INBOX9_LOCAL_ADMIN_EMAIL: adminEmail, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', d => { logs += d.toString(); });
child.stderr.on('data', d => { logs += d.toString(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`server did not start\n${logs}`);
}

let cookie = '';
async function request(path, { method='GET', body, idem, cookieOverride } = {}) {
  const headers = { origin: base };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idem) headers['idempotency-key'] = idem;
  if (cookieOverride || cookie) headers.cookie = cookieOverride || cookie;
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie && !cookieOverride) cookie = setCookie.split(';')[0];
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, headers: r.headers, json };
}

try {
  await waitForServer();

  // Health/catalog gate.
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  const catalog = await request('/api/services');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.json.country, 'IN');
  assert.equal(catalog.json.currency, 'INR');
  assert.equal(catalog.json.services.length, 832);

  // Unknown account must sign up first.
  const unknown = await request('/api/auth/login', { method:'POST', body:{ email:userEmail, password } });
  assert.equal(unknown.status, 401);
  assert.match(unknown.json.error, /sign up first/i);

  // Registration + authenticated session.
  const registered = await request('/api/auth/register', { method:'POST', body:{ email:userEmail, password } });
  assert.equal(registered.status, 201);
  const me = await request('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, userEmail);
  const userSession = cookie;

  // Recharge boundaries and duplicate UTR protection.
  const low = await request('/api/recharges', { method:'POST', body:{ amount:99, utr:'E2E-LOW-001' } });
  assert.equal(low.status, 400);
  const recharge = await request('/api/recharges', { method:'POST', body:{ amount:5000, utr:'E2E-UTR-001' } });
  assert.equal(recharge.status, 201);
  const duplicateUtr = await request('/api/recharges', { method:'POST', body:{ amount:5000, utr:'e2e-utr-001' } });
  assert.equal(duplicateUtr.status, 409);

  // Login must not bypass signup and wrong password must fail.
  const wrong = await request('/api/auth/login', { method:'POST', body:{ email:userEmail, password:'WrongPass123!' } });
  assert.equal(wrong.status, 401);

  // Admin can see the pending recharge; a normal user cannot.
  const forbidden = await request('/api/admin/overview');
  assert.equal(forbidden.status, 403);
  let adminLogin = await request('/api/auth/login', { method:'POST', body:{ email:adminEmail, password } });
  let adminSession = adminLogin.headers.get('set-cookie');
  if (adminLogin.status !== 200) {
    const adminReg = await request('/api/auth/register', { method:'POST', body:{ email:adminEmail, password } });
    assert.equal(adminReg.status, 201);
    adminSession = adminReg.headers.get('set-cookie');
  }
  const admin = await request('/api/admin/recharges', { cookieOverride: adminSession.split(';')[0] });
  assert.equal(admin.status, 200);
  assert.ok(admin.json.recharges.some(r => r.utr === 'E2E-UTR-001'));

  const pending = admin.json.recharges.find(r => r.utr === 'E2E-UTR-001');
  const approval = await request(`/api/admin/recharges/${pending.id}`, {
    method:'POST', cookieOverride:adminSession.split(';')[0], body:{ decision:'approve' }
  });
  assert.equal(approval.status, 200);

  // Activation idempotency: same logical purchase must replay the same result.
  cookie = userSession;
  const wallet = await request('/api/wallet');
  assert.equal(wallet.status, 200);
  const serviceId = catalog.json.services[0].id;
  const idem = `e2e-${crypto.randomUUID()}-purchase`;
  const first = await request('/api/activations', { method:'POST', body:{ serviceId }, idem });
  assert.equal(first.status, 201);
  const replay = await request('/api/activations', { method:'POST', body:{ serviceId }, idem });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('x-idempotent-replay'), 'true');
  assert.equal(replay.json.id, first.json.id);
  assert.equal(replay.json.walletBalancePaise, first.json.walletBalancePaise);

  // Reusing the key for another service must fail.
  const otherService = catalog.json.services.find(s => s.id !== serviceId);
  const reused = await request('/api/activations', { method:'POST', body:{ serviceId:otherService.id }, idem });
  assert.equal(reused.status, 409);
  assert.equal(reused.json.code, 'IDEMPOTENCY_KEY_REUSED');

  // Concurrent identical mock requests: all responses must identify one activation.
  const concurrentKey = `e2e-${crypto.randomUUID()}-concurrent`;
  const results = await Promise.all(Array.from({length:8}, () => request('/api/activations', { method:'POST', body:{ serviceId }, idem:concurrentKey })));
  assert.ok(results.every(r => r.status === 201));
  assert.equal(new Set(results.map(r => r.json.id)).size, 1);

  // Logout removes authentication.
  const logout = await request('/api/auth/logout', { method:'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await request('/api/auth/me');
  assert.equal(afterLogout.status, 401);

  console.log(JSON.stringify({
    ok:true,
    checks:[
      'health/catalog', 'signup-before-login', 'registration/session',
      'recharge-boundaries', 'duplicate-UTR', 'admin-isolation',
      'recharge-approval', 'activation-idempotency', 'idempotency-key-reuse',
      'concurrent-identical-purchases', 'logout'
    ]
  }, null, 2));
} finally {
  child.kill('SIGTERM');
  await sleep(100);
}
