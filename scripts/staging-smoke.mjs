import http from 'node:http';
import { services as localCatalog } from '../api/_lib/catalog.js';

const base = process.env.STAGING_URL || 'http://localhost:4173';
const suppliedEmail = String(process.env.STAGING_EMAIL || '').trim().toLowerCase();
const password = String(process.env.STAGING_PASSWORD || 'StagingTest!123');
const email = suppliedEmail || ('staging-smoke-' + Date.now() + '@example.test');
const fullFlow = String(process.env.STAGING_FULL_FLOW || 'true').toLowerCase() !== 'false';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const req = http.request(url, { method: options.method || 'GET', headers: { ...(options.headers || {}), ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}) } }, res => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', c => { raw += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}
function parse(response) { try { return response.body ? JSON.parse(response.body) : {}; } catch { return {}; } }
function updateCookie(response, current = '') { const setCookie = response.headers['set-cookie']; const next = Array.isArray(setCookie) ? setCookie[0] : setCookie; return next ? String(next).split(';',1)[0] : current; }
function assertStatus(response, expected, label) { if (response.status !== expected) throw new Error(label + ' failed: expected HTTP ' + expected + ', got ' + response.status + ': ' + response.body.slice(0,500)); }
async function sleep(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }

const healthResponse = await request('/api/health');
assertStatus(healthResponse, 200, 'health');
const health = parse(healthResponse);
const serviceResponse = await request('/api/services');
assertStatus(serviceResponse, 200, 'services');
const servicePayload = parse(serviceResponse);
if (servicePayload.country !== 'IN' || servicePayload.currency !== 'INR' || !Array.isArray(servicePayload.services) || servicePayload.services.length !== localCatalog.length) throw new Error('service catalog integrity check failed');

let cookie = '';
const register = await request('/api/auth/register', { method: 'POST', body: { email, password } });
if (register.status === 201) cookie = updateCookie(register);
else if (register.status === 409) { const login = await request('/api/auth/login', { method: 'POST', body: { email, password } }); assertStatus(login, 200, 'login'); cookie = updateCookie(login); }
else assertStatus(register, 201, 'register');
if (!cookie) throw new Error('authentication cookie was not returned');

const me = await request('/api/auth/me', { headers: { cookie } }); assertStatus(me, 200, 'auth/me');
const walletResponse = await request('/api/wallet', { headers: { cookie } }); assertStatus(walletResponse, 200, 'wallet');
const wallet = parse(walletResponse);
const result = { ok: true, base, mode: health.mode, ready: health.ready, serviceCount: servicePayload.services.length, email, balancePaise: Number(wallet.balancePaise || 0), activationId: null, otp: null };

if (fullFlow) {
  const target = servicePayload.services[0];
  const pricePaise = Number(target.pricePaise || 0);
  if (health.mode === 'postgres' && result.balancePaise < pricePaise) throw new Error('persistent staging account needs at least ₹' + (pricePaise / 100).toFixed(2) + ' balance; fund STAGING_EMAIL before running STAGING_FULL_FLOW');
  const activationResponse = await request('/api/activations', { method:'POST', headers:{cookie,'idempotency-key':'staging-smoke-'+Date.now()}, body:{serviceId:target.id} });
  assertStatus(activationResponse, 201, 'activation create');
  const activation = parse(activationResponse);
  if (activation.status !== 'Active' || activation.country !== 'IN' || !activation.number) throw new Error('activation lifecycle shape failed');
  result.activationId=activation.id;
  const deadline=Date.now()+28_000; let latest=activation;
  while(Date.now()<deadline){ await sleep(2_000); const statusResponse=await request('/api/activations/'+encodeURIComponent(activation.id),{headers:{cookie}}); assertStatus(statusResponse,200,'activation status'); latest=parse(statusResponse); if(latest.status==='Completed') break; if(['Expired','Refunded','Cancelled'].includes(latest.status)) throw new Error('activation reached terminal state '+latest.status+' before OTP arrival'); }
  if(latest.status!=='Completed'||!/^\d{6}$/.test(String(latest.otp||'').replace(/\s/g,''))) throw new Error('synthetic OTP did not arrive within the 20-second lifecycle window');
  result.otp=String(latest.otp).replace(/\s/g,'');
}
const logout=await request('/api/auth/logout',{method:'POST',headers:{cookie}}); assertStatus(logout,200,'logout');
console.log(JSON.stringify(result,null,2));
