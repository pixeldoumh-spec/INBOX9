import { createProviderAdapter, normalizeProviderActivation } from './provider.js';

const BASE_URL = 'https://proxnum.com/api/v1';
export const PROXNUM_INDIA_COUNTRY_ID = String(process.env.PROXNUM_INDIA_COUNTRY_ID || '6').trim() || '6';
const REQUEST_TIMEOUT_MS = 10_000;
const INVENTORY_CACHE_TTL_MS = 90_000;

let cachedInventory = null;
let cacheExpiresAt = 0;
let inflight = null;

const BLOCKED_PATTERNS = [/casino/i,/rummy/i,/matka/i,/jackpot/i,/poker/i,/slot/i,/\bbet\b/i,/\bbet\d*/i];
const BUILTIN_CODES = new Map([
  ['whatsapp','wa'],['whatsappbusiness','wa'],['instagram','ig'],['instagramthreads','ig'],
  ['facebook','fb'],['telegram','tg'],['gmail','go'],['google','go'],['youtube','go'],
  ['tiktok','lf'],['tiktokdouyin','lf'],['snapchat','fu'],['twitter','tw'],['x','tw'],
  ['discord','ds'],['microsoft','mm'],['amazon','am'],['tinder','oi'],['apple','wx'],
  ['linkedin','tn'],['signal','bw'],['viber','vi'],['line','me'],['uber','ub'],
  ['swiggy','jx'],['myntra','nl'],['flipkart','xt'],['zepto','adi'],['zoho','zh'],
  ['steam','mt'],['netflix','nf'],['fiverr','cn'],['upwork','abq'],['binance','aon'],
  ['wise','bo'],['payoneer','nc'],['coinbase','re'],['airbnb','uk'],['ebay','dh'],
  ['shopify','ano'],['kfc','fz'],['tataneu','ace'],['olx','sn'],['magicbricks','hq'],
  ['angelone','aha'],['1mg','ot'],
]);

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
}

function configuredCustomCodes() {
  const raw = String(process.env.PROXNUM_SERVICE_MAP_JSON || '').trim();
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('map must be an object');
    return new Map(Object.entries(parsed).map(([key,value]) => [normalize(key),String(value||'').trim().toLowerCase()]).filter(([,value])=>value));
  } catch {
    const error=new Error('PROXNUM_SERVICE_MAP_JSON must be valid JSON');
    error.code='PROXNUM_INVALID_SERVICE_MAP';
    throw error;
  }
}

function resolveProviderCode(service) {
  const textValue=String(service?.name||'')+' '+String(service?.category||'');
  if (BLOCKED_PATTERNS.some(pattern=>pattern.test(textValue))) return null;
  const custom=configuredCustomCodes();
  return custom.get(normalize(service?.id)) || custom.get(normalize(service?.name))
    || BUILTIN_CODES.get(normalize(service?.name)) || null;
}

export function isProxnumEnabled() {
  return String(process.env.PROXNUM_REAL_STOCK_ENABLED||'').trim().toLowerCase()==='true'
    && String(process.env.PROXNUM_RESELLER_AUTHORIZED||'').trim().toLowerCase()==='true'
    && Boolean(String(process.env.PROXNUM_API_KEY||'').trim());
}

function apiKey(){ return String(process.env.PROXNUM_API_KEY||'').trim(); }
function parseNumber(value){ const n=Number(value); return Number.isFinite(n)?n:null; }

function extractPrices(payload){
  return payload?.prices?.[PROXNUM_INDIA_COUNTRY_ID]
    || payload?.data?.prices?.[PROXNUM_INDIA_COUNTRY_ID]
    || payload?.data?.[PROXNUM_INDIA_COUNTRY_ID] || {};
}

function normalizeServiceCode(value){ return String(value??'').trim().toLowerCase(); }

export function normalizeProxnumPrices(payload){
  const prices=extractPrices(payload);
  if(!prices || typeof prices!=='object' || Array.isArray(prices)) throw new Error('Proxnum returned an invalid India prices payload');
  return Object.entries(prices).map(([serviceCode,raw])=>{
    const code=normalizeServiceCode(serviceCode);
    if(!code || !raw || typeof raw!=='object') return null;
    const available=raw.available==null?null:Math.max(0,Math.trunc(parseNumber(raw.available)??0));
    return {
      code,
      available,
      basePriceUsd:parseNumber(raw.base_price??raw.basePrice),
      sellPriceUsd:parseNumber(raw.sell_price??raw.sellPrice),
    };
  }).filter(Boolean);
}

async function request(path,{method='GET',body=null}={}){
  const key=apiKey();
  if(!key){const e=new Error('Proxnum API key is not configured');e.code='PROXNUM_NOT_CONFIGURED';e.status=503;throw e;}
  const response=await fetch(BASE_URL+path,{
    method,
    headers:{accept:'application/json',authorization:'Bearer '+key,...(body==null?{}:{'content-type':'application/json'})},
    ...(body==null?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let payload=null; try{payload=await response.json();}catch{}
  if(!response.ok || payload?.success===false){
    const e=new Error(payload?.message||payload?.error||('Proxnum returned HTTP '+response.status));
    e.code=payload?.code||('PROXNUM_HTTP_'+response.status); e.status=response.status; throw e;
  }
  return payload;
}

async function fetchIndiaInventory(){
  const payload=await request('/prices?country='+encodeURIComponent(PROXNUM_INDIA_COUNTRY_ID));
  const services=normalizeProxnumPrices(payload);
  const fetchedAt=Date.now();
  return {provider:'proxnum',providerName:'Proxnum',country:'IN',countryId:PROXNUM_INDIA_COUNTRY_ID,healthy:true,fetchedAt,services};
}

export async function getProxnumIndiaInventory({force=false}={}){
  if(!isProxnumEnabled()){const e=new Error('Proxnum real stock is not enabled');e.code='PROXNUM_NOT_ENABLED';e.status=503;throw e;}
  const now=Date.now();
  if(!force && cachedInventory && now<cacheExpiresAt)return cachedInventory;
  if(inflight)return inflight;
  inflight=fetchIndiaInventory().then(result=>{cachedInventory=result;cacheExpiresAt=Date.now()+INVENTORY_CACHE_TTL_MS;return result;}).finally(()=>{inflight=null;});
  return inflight;
}

function normalizeStatus(raw){
  const status=String(raw??'').trim().toLowerCase();
  if(['completed','success','done'].includes(status))return 'Completed';
  if(['expired','timeout','timed_out'].includes(status))return 'Expired';
  if(['cancelled','canceled','refunded'].includes(status))return 'Refunded';
  return 'Active';
}

export function normalizeProxnumActivation(value){
  const raw=value?.data?.activation||value?.activation||value?.data||value||{};
  const id=raw.activation_id||raw.activationId||raw.id;
  const number=raw.phone||raw.phone_number||raw.phoneNumber||raw.number;
  if(!id||!number){const e=new Error('Proxnum returned an invalid activation');e.code='PROXNUM_INVALID_ACTIVATION';throw e;}
  const createdAtValue=raw.date_created||raw.created_at||raw.createdAt;
  const createdAt=createdAtValue?new Date(createdAtValue).getTime():Date.now();
  const expiresAt=Number.isFinite(createdAt)?createdAt+21*60*1000:Date.now()+21*60*1000;
  const status=normalizeStatus(value?.status||raw.status||raw.state);
  const otp=raw.code||raw.otp||value?.code||value?.otp||null;
  return normalizeProviderActivation({
    providerActivationId:String(id),number:String(number),status,otp,
    createdAt:Number.isFinite(createdAt)?createdAt:Date.now(),expiresAt,mockOtpAt:null,
    metadata:{engine:'proxnum',country:'IN',countryId:PROXNUM_INDIA_COUNTRY_ID,serviceCode:raw.service||raw.service_code||null,upstreamActivationId:String(id)},
  });
}

export async function reserveProxnumNumber(service,providerCode){
  if(!isProxnumEnabled()){const e=new Error('Proxnum real stock is not enabled');e.code='PROXNUM_NOT_ENABLED';e.status=503;throw e;}
  const code=normalizeServiceCode(providerCode||resolveProviderCode(service));
  if(!code){const e=new Error('Proxnum service code is not configured');e.code='PROXNUM_SERVICE_CODE_MISSING';throw e;}
  const payload=await request('/resell/virtual/buy',{method:'POST',body:{service:code,country:Number(PROXNUM_INDIA_COUNTRY_ID)}});
  const normalized=normalizeProxnumActivation(payload);
  normalized.metadata.serviceId=service?.id||null;
  normalized.metadata.serviceName=service?.name||null;
  normalized.metadata.providerCode=code;
  return normalized;
}

export async function getProxnumActivation(activation){
  const id=String(activation?.providerActivationId||'').trim();
  if(!id){const e=new Error('Proxnum activation id is missing');e.code='PROXNUM_ACTIVATION_ID_MISSING';throw e;}
  return normalizeProxnumActivation(await request('/resell/virtual/'+encodeURIComponent(id)+'/status'));
}

export async function cancelProxnumActivation(activation){
  const id=String(activation?.providerActivationId||'').trim();
  if(!id){const e=new Error('Proxnum activation id is missing');e.code='PROXNUM_ACTIVATION_ID_MISSING';throw e;}
  await request('/resell/virtual/cancel',{method:'POST',body:{activation_id:id}});
  return normalizeProxnumActivation({...activation,status:'Refunded',otp:activation.otp||null});
}

export async function proxnumHealth(){
  if(!isProxnumEnabled())return {
    provider:'proxnum',healthy:false,country:'IN',countryId:PROXNUM_INDIA_COUNTRY_ID,
    authenticated:Boolean(apiKey()),resellerAuthorized:String(process.env.PROXNUM_RESELLER_AUTHORIZED||'').trim().toLowerCase()==='true',
    mode:'disabled',error:'Proxnum real stock is not enabled',checkedAt:Date.now()
  };
  try{
    const inventory=await getProxnumIndiaInventory();
    return {provider:'proxnum',healthy:true,country:'IN',countryId:PROXNUM_INDIA_COUNTRY_ID,authenticated:true,resellerAuthorized:true,mode:'live',availableServices:inventory.services.length,fetchedAt:inventory.fetchedAt};
  }catch{
    return {provider:'proxnum',healthy:false,country:'IN',countryId:PROXNUM_INDIA_COUNTRY_ID,authenticated:true,resellerAuthorized:true,mode:'live',error:'Proxnum availability unavailable',checkedAt:Date.now()};
  }
}

export const proxnumProvider=createProviderAdapter({
  async listServices(){return proxnumHealth();},
  async reserveNumber(service){return reserveProxnumNumber(service,service?.providerCode);},
  async getActivation({activation}){return getProxnumActivation(activation);},
  async cancelActivation({activation}){return cancelProxnumActivation(activation);},
  async health(){return proxnumHealth();},
});
