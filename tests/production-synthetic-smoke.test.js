import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { resetMocks } from '../api/_lib/mock.js';

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(new URL(path, `http://127.0.0.1:${address.port}`), {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
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

function json(response) { return JSON.parse(response.body); }
function cookie(response, current = '') { return response.headers['set-cookie']?.[0]?.split(';', 1)[0] || current; }

test('synthetic production supports register, session, wallet and activation without external stores', async () => {
  const saved = {};
  for (const key of ['NODE_ENV','INBOX9_RUNTIME_MODE','DATABASE_URL','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','APP_ORIGIN','CRON_SECRET']) {
    saved[key] = process.env[key];
  }
  process.env.NODE_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'synthetic';
  process.env.APP_ORIGIN = 'http://127.0.0.1';
  delete process.env.DATABASE_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.CRON_SECRET;
  resetMocks();

  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const health = await request(server, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(json(health).ready, true);
    assert.equal(json(health).mode, 'synthetic');

    const services = await request(server, '/api/services');
    assert.equal(services.status, 200);
    assert.equal(json(services).services.length, 832);

    const email = 'synthetic-runtime@example.test';
    const password = 'SyntheticTest!123';
    const register = await request(server, '/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1' },
      body: { email, password },
    });
    assert.equal(register.status, 201);
    let session = cookie(register);
    assert.ok(session);

    const me = await request(server, '/api/auth/me', { headers: { cookie: session } });
    assert.equal(me.status, 200);
    assert.equal(json(me).user.email, email);

    const wallet = await request(server, '/api/wallet', { headers: { cookie: session } });
    assert.equal(wallet.status, 200);
    assert.equal(json(wallet).balancePaise, 100000);

    const activation = await request(server, '/api/activations', {
      method: 'POST',
      headers: { cookie: session, origin: 'http://127.0.0.1', 'idempotency-key': 'synthetic-production-activation-001' },
      body: { serviceId: 'whatsapp-0' },
    });
    assert.equal(activation.status, 201);
    const activationBody = json(activation);
    assert.equal(activationBody.status, 'Active');
    assert.equal(activationBody.country, 'IN');
    assert.match(activationBody.number, /^\+91 /);
    assert.match(String(activationBody.syntheticOtp), /^\d{6}$/);
    assert.ok(activationBody.mockOtpAt >= Date.now() + 19_000);

    const logout = await request(server, '/api/auth/logout', { method: 'POST', headers: { cookie: session, origin: 'http://127.0.0.1' } });
    assert.equal(logout.status, 200);

    const login = await request(server, '/api/auth/login', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1' },
      body: { email, password },
    });
    assert.equal(login.status, 200);
    session = cookie(login, session);

    const meAfterLogin = await request(server, '/api/auth/me', { headers: { cookie: session } });
    assert.equal(meAfterLogin.status, 200);
    assert.equal(json(meAfterLogin).user.email, email);
  } finally {
    server.close();
    await once(server, 'close');
    resetMocks();
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
