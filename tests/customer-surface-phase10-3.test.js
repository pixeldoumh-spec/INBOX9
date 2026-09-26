import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root,file),'utf8');

test('customer activation API exposes no provider/server controls',()=>{
 const src=read('api/activations/_index.js');
 assert.doesNotMatch(src,/getSyntheticServer/);
 assert.doesNotMatch(src,/req\.body\?\.serverId/);
 assert.doesNotMatch(src,/UNKNOWN_SYNTHETIC_SERVER/);
 assert.match(src,/hashActivationRequest\(\{ serviceId \}\)/);
 assert.doesNotMatch(src,/createActivation\([^;]*\{ serverId \}/s);
 assert.match(src,/code: 'SERVICE_UNAVAILABLE'/);
});

test('customer cancellation does not expose provider terminology',()=>{
 const src=read('api/activations/_id/_cancel.js');
 assert.match(src,/Cancellation is temporarily unavailable/);
 assert.match(src,/code: 'CANCELLATION_UNAVAILABLE'/);
});

test('customer account and activity surfaces contain no implementation residue',()=>{
 for(const file of ['frontend/src/app/customer-account-pages.tsx','frontend/src/app/customer-activity-pages.tsx','frontend/src/app/customer-ui-shared.tsx']){
  assert.doesNotMatch(read(file),/\b(provider|adapter|debug|development-only|test-only|synthetic|mock|sandbox|staging|qa)\b(?!_[A-Z_]+)/i);
 }
 const app=read('frontend/src/app/App.tsx');
 const start=app.indexOf('function activationErrorMessage');
 const end=app.indexOf('function statusClass',start);
 assert.ok(start>=0&&end>start);
 const mapper=app.slice(start,end);
 assert.doesNotMatch(mapper,/\bprovider\s+(api|adapter|route|service|server|health|credentials|operation)|\badapter\s+(key|route|service)/i);
 assert.match(mapper,/NO_PROVIDER/);
 assert.match(mapper,/CANCELLATION_UNAVAILABLE/);
});

test('customer auth and recharge fallbacks do not expose mock mode markers',()=>{
 assert.doesNotMatch(read('api/auth/_login.js'),/mode:\s*['"]mock['"]/);
 assert.doesNotMatch(read('api/auth/_register.js'),/mode:\s*['"]mock['"]/);
 assert.doesNotMatch(read('api/recharges/_index.js'),/mode:\s*['"]mock['"]/);\n assert.doesNotMatch(read('api/auth/_logout-all.js'),/mode:/);
});
