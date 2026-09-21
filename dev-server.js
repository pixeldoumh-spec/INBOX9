import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { services, getService } from './api/_lib/catalog.js';
import { reserveMock, getMock, cancelMock } from './api/_lib/mock.js';
import { setMockSession, getMockSession, mockUser, passwordHash, verifyPassword } from './api/_lib/auth.js';
import { applySecurityHeaders, requestId } from './api/_lib/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const demoWallets = new Map();
const demoRecharges = new Map();
const demoLedger = new Map();
const demoUsers = new Map();
const demoActivationIdempotency = new Map();
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/upi-qr.jpg': ['public/upi-qr.jpg', 'image/jpeg'],
  '/payment-qr.jpg': ['public/upi-qr.jpg', 'image/jpeg']
};

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.setHeader('content-type', type);
  applySecurityHeaders(res);
  requestId({}, res);
  res.writeHead(code);
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 32_000) { reject(new Error('Payload too large')); req.destroy(); return; }
      raw += chunk;
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function demoKey(req) { return getMockSession(req)?.email || 'demo@inbox9.local'; }
function demoBalance(req) { const key = demoKey(req); if (!demoWallets.has(key)) demoWallets.set(key, 0); return demoWallets.get(key); }
function setDemoBalance(req, value) { demoWallets.set(demoKey(req), Math.max(0, value)); }

async function apiRoute(req, res, url) {

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return send(res, 400, { error: 'Enter a valid email and a password of at least 8 characters' });
      if (demoUsers.has(email)) return send(res, 409, { error: 'An account with this email already exists' });
      demoUsers.set(email, passwordHash(password));
      setMockSession(res, email);
      return send(res, 201, { user: mockUser(email), mode: 'mock' });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || password.length < 8) return send(res, 400, { error: 'Enter your email and password' });
      if (!demoUsers.has(email)) return send(res, 401, { error: 'Account not found. Please sign up first.' });
      if (!verifyPassword(password, demoUsers.get(email))) return send(res, 401, { error: 'Invalid email or password' });
      setMockSession(res, email);
      return send(res, 200, { user: mockUser(email), mode: 'mock' });
    } catch (error) { return send(res, 400, { error: error.message }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = getMockSession(req);
    return user ? send(res, 200, { authenticated: true, user }) : send(res, 401, { authenticated: false, error: 'Authentication required' });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    res.setHeader('Set-Cookie', 'inbox9_demo=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/wallet') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, { balancePaise: demoBalance(req), currency: 'INR', ledger: [], recharges: demoRecharges.get(demoKey(req)) || [], persistent: false });
  }
  if (req.method === 'GET' && url.pathname === '/api/recharges') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, { recharges: demoRecharges.get(demoKey(req)) || [], persistent: false, minPaise: 10000, maxPaise: 500000, upiId: '8106204597@ptyes' });
  }
  if (req.method === 'POST' && url.pathname === '/api/recharges') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    try {
      const body = await readBody(req);
      const amount = Math.round(Number(body.amount || 0) * 100);
      const utr = String(body.utr || '').trim();
      if (!Number.isInteger(amount) || amount < 10000 || amount > 500000) return send(res, 400, { error: 'Recharge amount must be between ₹100 and ₹5,000' });
      if (!/^[A-Za-z0-9._-]{4,64}$/.test(utr)) return send(res, 400, { error: 'Enter a valid UTR / transaction reference' });
      const all = demoRecharges.get(demoKey(req)) || [];
      if (all.some(x => x.utr.toLowerCase() === utr.toLowerCase())) return send(res, 409, { error: 'This UTR has already been submitted' });
      const item = { id: `RCH-DEMO-${Date.now()}`, amountPaise: amount, utr, paymentMethod: 'UPI', upiId: '8106204597@ptyes', status: 'Pending', submittedAt: Date.now() };
      all.unshift(item); demoRecharges.set(demoKey(req), all);
      return send(res, 201, item);
    } catch (error) { return send(res, 400, { error: error.message }); }
  }

  const admin = getMockSession(req);
  if (url.pathname.startsWith('/api/admin/')) {
    if (!admin || admin.role !== 'admin') return send(res, 403, { error: 'Admin access required' });
    if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
      const allRecharges = [...demoRecharges.values()].flat();
      const pending = allRecharges.filter(r => r.status === 'Pending');
      const users = demoUsers.size;
      const balance = [...demoWallets.values()].reduce((a,b)=>a+b,0);
      const approved = allRecharges.filter(r=>r.status==='Approved').reduce((a,r)=>a+r.amountPaise,0);
      const debits = [...demoLedger.values()].flat().filter(e=>e.type==='debit').reduce((a,e)=>a+e.amountPaise,0);
      return send(res, 200, { users, activeActivations: 0, rechargeRequests: allRecharges.length, pendingRechargePaise: pending.reduce((a,r)=>a+r.amountPaise,0), walletBalancePaise: balance, approvedRechargePaise: approved, totalDebitsPaise: debits, persistent:false });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/recharges') {
      const pending = [...demoRecharges.entries()].flatMap(([email, rows]) => rows.filter(r=>r.status==='Pending').map(r=>({ ...r, email })));
      return send(res, 200, { recharges: pending, persistent:false });
    }
    const adminRechargeMatch = url.pathname.match(/^\/api\/admin\/recharges\/([^/]+)$/);
    if (adminRechargeMatch && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const decision = String(body.decision || '').toLowerCase();
        if (!['approve','reject'].includes(decision)) return send(res, 400, { error:'Decision must be approve or reject' });
        let found = null;
        for (const [email, rows] of demoRecharges.entries()) {
          const item = rows.find(r=>r.id===adminRechargeMatch[1]);
          if (item) { found={email, item}; break; }
        }
        if (!found) return send(res, 404, { error:'Recharge request not found' });
        if (found.item.status !== 'Pending') return send(res, 400, { error:'Recharge request has already been reviewed' });
        if (decision === 'approve') {
          setDemoBalance({headers:{cookie:`inbox9_demo=${encodeURIComponent(found.email)}`} }, demoBalance({headers:{cookie:`inbox9_demo=${encodeURIComponent(found.email)}`} }) + found.item.amountPaise);
          found.item.status='Approved';
          const ledger=demoLedger.get(found.email)||[];
          ledger.unshift({id:`LED-DEMO-${Date.now()}`,email:found.email,type:'credit',amountPaise:found.item.amountPaise,referenceType:'recharge',referenceId:found.item.id,description:`UPI recharge approved • ${found.item.utr}`,createdAt:Date.now()});
          demoLedger.set(found.email, ledger);
        } else {
          found.item.status='Rejected';
          found.item.rejectionReason=String(body.reason||'Payment could not be verified').slice(0,250);
        }
        found.item.reviewedAt=Date.now();
        found.item.reviewedBy=admin.email;
        return send(res,200,{recharge:found.item,persistent:false});
      } catch (error) { return send(res,400,{error:error.message}); }
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      const users=[...demoUsers.keys()].map(email=>({id:email===admin.email?'USR-DEMO-ADMIN':'USR-DEMO',email,role:mockUser(email).role,active:true,createdAt:Date.now(),balancePaise:demoWallets.get(email)||0,rechargeCount:(demoRecharges.get(email)||[]).length,activationCount:0}));
      return send(res,200,{users,persistent:false});
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/services') {
      return send(res,200,{services:services.map(s=>({...s,routedProviders:1,updatedAt:Date.now(),createdAt:Date.now()})),persistent:false});
    }
    const adminServiceMatch=url.pathname.match(/^\/api\/admin\/services\/([^/]+)$/);
    if (adminServiceMatch && req.method === 'PATCH') {
      try {
        const body=await readBody(req); const svc=services.find(s=>s.id===adminServiceMatch[1]);
        if(!svc) return send(res,404,{error:'Service not found'});
        if(body.pricePaise!==undefined){ const p=Number(body.pricePaise); if(!Number.isInteger(p)||p<0||p>100000000) return send(res,400,{error:'Price must be an integer between ₹0 and ₹1,000,000'}); svc.pricePaise=p; }
        if(body.stock!==undefined){ const st=Number(body.stock); if(!Number.isInteger(st)||st<0||st>1000000) return send(res,400,{error:'Stock must be an integer between 0 and 1,000,000'}); svc.stock=st; }
        if(body.active!==undefined) svc.active=Boolean(body.active);
        if(body.availability!==undefined){ if(!['high','medium','low'].includes(String(body.availability))) return send(res,400,{error:'Availability must be high, medium or low'}); svc.availability=String(body.availability); }
        return send(res,200,{service:{...svc,routedProviders:1,updatedAt:Date.now(),createdAt:Date.now()},persistent:false});
      } catch(error){return send(res,400,{error:error.message});}
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/activations') return send(res,200,{activations:[],persistent:false});
    if (req.method === 'GET' && url.pathname === '/api/admin/ledger') return send(res,200,{ledger:[...demoLedger.values()].flat().sort((a,b)=>b.createdAt-a.createdAt),persistent:false});
    if (req.method === 'GET' && url.pathname === '/api/admin/providers') return send(res,200,{providers:[{id:'provider-mock',name:'INBOX9 Synthetic Engine',adapterKey:'synthetic',active:true,priority:10,routedServices:services.length}],health:[{id:'provider-mock',name:'INBOX9 Synthetic Engine',adapterKey:'synthetic',healthy:true,message:'Synthetic engine ready'}],installedAdapters:['synthetic'],persistent:false});
    if (req.method === 'GET' && url.pathname === '/api/admin/providers-health') return send(res,200,{health:[{id:'provider-mock',name:'INBOX9 Synthetic Engine',adapterKey:'synthetic',healthy:true,message:'Synthetic engine ready'}],persistent:false});
    if (req.method === 'GET' && url.pathname === '/api/admin/audit') return send(res,200,{logs:[],persistent:false});
    return send(res,404,{error:'Admin route not found'});
  }

  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, mode: 'synthetic-local', timestamp: new Date().toISOString() });
  if (req.method === 'GET' && url.pathname === '/api/services') return send(res, 200, { country: 'IN', currency: 'INR', services });
  if (url.pathname === '/api/activations' && req.method === 'GET') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, { activations: [], persistent: false });
  }
  if (url.pathname === '/api/activations' && req.method === 'POST') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    try {
      const body = await readBody(req);
      const service = getService(body.serviceId);
      if (!service) return send(res, 400, { error: 'Unknown service' });
      const serverId = body.serverId ? String(body.serverId).trim().toLowerCase() : null;
      const idemKey = String(req.headers['idempotency-key'] || '').trim();
      if (idemKey) {
        const cacheKey = `${demoKey(req)}:${idemKey}`;
        const requestHash = JSON.stringify({ serviceId: service.id });
        const prior = demoActivationIdempotency.get(cacheKey);
        if (prior && prior.requestHash !== requestHash) return send(res, 409, { error: 'This Idempotency-Key was already used for a different activation request.', code: 'IDEMPOTENCY_KEY_REUSED' });
        if (prior?.response) { res.setHeader('X-Idempotent-Replay', 'true'); return send(res, 201, prior.response); }
        demoActivationIdempotency.set(cacheKey, { requestHash, processing: true });
      }
      const balance = demoBalance(req);
    if (balance < service.pricePaise) return send(res, 402, { error: 'Insufficient wallet balance. Please recharge first.', code: 'INSUFFICIENT_BALANCE' });
    const activation = reserveMock({ ...service, serverId });
    setDemoBalance(req, balance - service.pricePaise);
    const email = demoKey(req); const ledger = demoLedger.get(email) || []; ledger.unshift({ id:`LED-DEMO-${Date.now()}`, email, type:'debit', amountPaise:service.pricePaise, referenceType:'activation', referenceId:activation.id, description:`Activation • ${service.name}`, createdAt:Date.now() }); demoLedger.set(email, ledger);
    const response = { ...activation, walletBalancePaise: balance - service.pricePaise };
    if (req.headers['idempotency-key']) demoActivationIdempotency.set(`${demoKey(req)}:${String(req.headers['idempotency-key']).trim()}`, { requestHash: JSON.stringify({ serviceId: service.id }), response });
    return send(res, 201, response);
    } catch (error) { return send(res, error.message === 'Payload too large' ? 413 : 400, { error: error.message }); }
  }
  const activationMatch = url.pathname.match(/^\/api\/activations\/([^/]+)$/);
  if (activationMatch && req.method === 'GET') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    const item = getMock(activationMatch[1]);
    return item ? send(res, 200, item) : send(res, 404, { error: 'Activation not found' });
  }
  const cancelMatch = url.pathname.match(/^\/api\/activations\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    if (!getMockSession(req)) return send(res, 401, { error: 'Authentication required' });
    const item = cancelMock(cancelMatch[1]);
    if (!item) return send(res, 404, { error: 'Activation not found' });
    const balance = demoBalance(req) + Number(item.pricePaise || 0);
    setDemoBalance(req, balance);
    const email = demoKey(req); const ledger = demoLedger.get(email) || []; ledger.unshift({ id:`LED-DEMO-${Date.now()}`, email, type:'credit', amountPaise:Number(item.pricePaise||0), referenceType:'activation_refund', referenceId:item.id, description:`Activation refund • ${item.service||''}`, createdAt:Date.now() }); demoLedger.set(email, ledger);
    return send(res, 200, { ...item, refundPaise: item.refundPaise ?? item.pricePaise, walletBalancePaise: balance });
  }
  return send(res, 405, { error: 'Method not allowed' });
}

function serveStatic(req, res, url) {
  const fileInfo = staticFiles[url.pathname];
  if (!fileInfo) return send(res, 404, { error: 'Not found' });
  const file = path.join(__dirname, fileInfo[0]);
  res.writeHead(200, { 'content-type': fileInfo[1] });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) return apiRoute(req, res, url);
  return serveStatic(req, res, url);
});

server.listen(PORT, () => console.log(`INBOX9 local preview: http://localhost:${PORT}`));
