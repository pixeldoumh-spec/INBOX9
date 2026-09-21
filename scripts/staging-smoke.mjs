import http from 'node:http';

const base = process.env.STAGING_URL || 'http://localhost:4173';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers || {} }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const health = await request('/api/health');
if (health.status !== 200) throw new Error(`health failed: HTTP ${health.status}`);
const services = await request('/api/services');
if (services.status !== 200) throw new Error(`services failed: HTTP ${services.status}`);
const parsed = JSON.parse(services.body);
if (parsed.country !== 'IN' || parsed.currency !== 'INR' || !Array.isArray(parsed.services) || parsed.services.length !== 76) {
  throw new Error('service catalog integrity check failed');
}
console.log(JSON.stringify({ ok: true, base, serviceCount: parsed.services.length, health: JSON.parse(health.body) }, null, 2));
