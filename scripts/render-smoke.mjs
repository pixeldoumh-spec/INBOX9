import assert from 'node:assert/strict';

const base = String(process.env.RENDER_SMOKE_URL || process.argv[2] || '').trim().replace(/\/$/, '');

if (!base) {
  console.error('Usage: RENDER_SMOKE_URL=https://inbox9.onrender.com npm run render:smoke');
  process.exit(2);
}

const checks = [];
async function get(path, options = {}) {
  const response = await fetch(base + path, {
    redirect: 'manual',
    ...options,
    headers: { accept: 'application/json,text/html,*/*', ...(options.headers || {}) },
  });
  const text = await response.text();
  checks.push({ path, status: response.status, contentType: response.headers.get('content-type') || '' });
  return { response, text };
}

const root = await get('/');
assert.equal(root.response.status, 200, 'root must load');
assert.match(root.response.headers.get('content-type') || '', /text\/html/i, 'root must be HTML');
assert.match(root.text, /INBOX9/);

const manifest = await get('/manifest.webmanifest');
assert.equal(manifest.response.status, 200, 'app manifest must load');
assert.match(manifest.response.headers.get('content-type') || '', /manifest|json/i, 'manifest must be JSON');

const health = await get('/api/health');
assert.equal(health.response.status, 200, 'health endpoint must respond');
const healthJson = JSON.parse(health.text);
assert.equal(healthJson.ok, true, 'health endpoint must report ok');

const services = await get('/api/services');
assert.equal(services.response.status, 200, 'service catalog endpoint must respond');
const serviceJson = JSON.parse(services.text);
assert.equal(serviceJson.country, 'IN', 'catalog must be India market data');
assert.equal(serviceJson.currency, 'INR', 'catalog must be INR');
assert.ok(Array.isArray(serviceJson.services), 'catalog must return services');
assert.ok(serviceJson.services.length > 0, 'catalog must not be empty');

const me = await get('/api/auth/me');
assert.equal(me.response.status, 401, 'unauthenticated session check must return 401');

const wallet = await get('/api/wallet');
assert.equal(wallet.response.status, 401, 'wallet must require authentication');

console.log(JSON.stringify({ ok: true, base, checks }, null, 2));
