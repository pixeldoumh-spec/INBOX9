import { services as localCatalog } from '../api/_lib/catalog.js';

const BASE_URL = String(process.env.E2E_BASE_URL || process.env.PRODUCTION_BASE_URL || 'https://inbox9.onrender.com').replace(/\/$/,'');
async function check(path, expectedStatus=200){ const started=performance.now(); const response=await fetch(BASE_URL+path,{redirect:'manual',headers:{'user-agent':'INBOX9-production-observability/1.0'}}); const durationMs=Math.round((performance.now()-started)*100)/100; const body=await response.text(); if(response.status!==expectedStatus) throw new Error(path+' expected HTTP '+expectedStatus+' but received '+response.status); return {path,status:response.status,durationMs,requestId:response.headers.get('x-request-id')||'',body}; }
function assertJson(text,label){ try{return JSON.parse(text);}catch(error){throw new Error(label+' returned invalid JSON: '+error.message);} }

const results=[]; results.push(await check('/'));
const health=await check('/api/health'); const healthBody=assertJson(health.body,'/api/health');
if(healthBody.ok!==true||healthBody.ready!==true||healthBody.mode!=='postgres') throw new Error('/api/health is not production-ready: '+JSON.stringify({ok:healthBody.ok,ready:healthBody.ready,mode:healthBody.mode}));
if(!health.requestId) throw new Error('/api/health did not return X-Request-Id'); results.push(health);
const services=await check('/api/services'); const servicesBody=assertJson(services.body,'/api/services');
if(!Array.isArray(servicesBody.services)||servicesBody.services.length!==90) throw new Error('/api/services catalog invariant failed: '+JSON.stringify({count:servicesBody.services?.length,expected:90}));
if(servicesBody.services.at(-1)?.id!=='svc-diwa-play' || servicesBody.services.at(-1)?.name!=='Diwa Play') throw new Error('/api/services cutoff invariant failed: final service must be Diwa Play');
if(localCatalog.length!==90 || localCatalog.at(-1)?.id!=='svc-diwa-play') throw new Error('local catalog contract drifted from 90-service Diwa Play cutoff');
if(!services.requestId) throw new Error('/api/services did not return X-Request-Id'); results.push(services);
const me=await check('/api/auth/me',401); if(!me.requestId) throw new Error('/api/auth/me did not return X-Request-Id'); results.push(me);
const wallet=await check('/api/wallet',401); if(!wallet.requestId) throw new Error('/api/wallet did not return X-Request-Id'); results.push(wallet);
const burst=await Promise.all(Array.from({length:5},()=>check('/api/health'))); for(const item of burst){const body=assertJson(item.body,item.path); if(body.ready!==true) throw new Error('health burst not ready'); if(!item.requestId) throw new Error('health burst missing request id');}
results.push(...burst);
console.log(JSON.stringify({ok:true,baseUrl:BASE_URL,checked:results.length,maxDurationMs:Math.max(...results.map(item=>item.durationMs)),checks:results.map(({path,status,durationMs})=>({path,status,durationMs})),timestamp:new Date().toISOString()},null,2));
