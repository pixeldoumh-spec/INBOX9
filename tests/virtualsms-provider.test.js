import test from 'node:test';
import assert from 'node:assert/strict';

const KEYS=['VIRTUALSMS_API_KEY','VIRTUALSMS_RESELLER_AUTHORIZED','VIRTUALSMS_CANARY_ENABLED','VIRTUALSMS_SERVICE_MAP_JSON','VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON','VIRTUALSMS_BASE_URL'];
const save=()=>Object.fromEntries(KEYS.map(k=>[k,process.env[k]]));
const restore=(e)=>KEYS.forEach(k=>e[k]===undefined?delete process.env[k]:(process.env[k]=e[k]));

test('VirtualSMS adapter fails closed without credentials',{concurrency:false},async()=>{
  const prev=save();
  try {
    process.env.VIRTUALSMS_API_KEY='';
    const {virtualSmsProvider}=await import('../api/_lib/virtualsms-provider.js?guard='+Date.now());
    await assert.rejects(()=>virtualSmsProvider.reserveNumber({id:'whatsapp-0',name:'WhatsApp'}),e=>e.code==='PROVIDER_CREDENTIALS_MISSING');
  } finally { restore(prev); }
});

test('VirtualSMS purchase requires written authorization and canary allowlist',{concurrency:false},async()=>{
  const prev=save();
  try {
    process.env.VIRTUALSMS_API_KEY='test-key';
    delete process.env.VIRTUALSMS_RESELLER_AUTHORIZED;
    process.env.VIRTUALSMS_CANARY_ENABLED='true';
    process.env.VIRTUALSMS_SERVICE_MAP_JSON=JSON.stringify({'whatsapp-0':'wa'});
    process.env.VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON=JSON.stringify(['whatsapp-0']);
    const {virtualSmsProvider}=await import('../api/_lib/virtualsms-provider.js?auth='+Date.now());
    await assert.rejects(()=>virtualSmsProvider.reserveNumber({id:'whatsapp-0',name:'WhatsApp'}),e=>e.code==='PROVIDER_RESELLER_AUTHORIZATION_REQUIRED');
  } finally { restore(prev); }
});

test('VirtualSMS normalizes purchase and SMS responses',{concurrency:false},async()=>{
  const prev=save(), originalFetch=globalThis.fetch;
  try {
    process.env.VIRTUALSMS_API_KEY='test-key';
    process.env.VIRTUALSMS_RESELLER_AUTHORIZED='true';
    process.env.VIRTUALSMS_CANARY_ENABLED='true';
    process.env.VIRTUALSMS_SERVICE_MAP_JSON=JSON.stringify({'whatsapp-0':'wa'});
    process.env.VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON=JSON.stringify(['whatsapp-0']);
    process.env.VIRTUALSMS_BASE_URL='https://virtualsms.example';
    globalThis.fetch=async(url,options)=>{
      assert.equal(options.headers['X-API-Key'],'test-key');
      if(String(url).endsWith('/purchase')) return new Response(JSON.stringify({success:true,order_id:'VS-1',phone_number:'+919876543210',status:'active',created_at:'2026-09-25T10:00:00Z',expires_at:'2026-09-25T10:20:00Z',service:'wa'}),{status:200});
      return new Response(JSON.stringify({success:true,order_id:'VS-1',phone_number:'+919876543210',status:'completed',messages:[{content:'Your code is 123456'}]}),{status:200});
    };
    const {virtualSmsProvider}=await import('../api/_lib/virtualsms-provider.js?norm='+Date.now());
    const purchased=await virtualSmsProvider.reserveNumber({id:'whatsapp-0',name:'WhatsApp',idempotencyKey:'idem-1'});
    assert.equal(purchased.providerActivationId,'VS-1');
    assert.equal(purchased.number,'+919876543210');
    assert.equal(purchased.status,'Active');
    const completed=await virtualSmsProvider.getActivation({providerActivationId:'VS-1',activation:purchased});
    assert.equal(completed.status,'Completed');
    assert.equal(completed.otp,'123456');
  } finally { globalThis.fetch=originalFetch; restore(prev); }
});
