import { getPool } from './db.js';
import {
  PROXNUM_INDIA_COUNTRY_ID,
  getProxnumIndiaInventory,
  isProxnumEnabled,
} from './proxnum-provider.js';

export const PROXNUM_MIN_STOCK = Math.max(
  1,
  Math.min(Number(process.env.PROXNUM_MIN_STOCK || 10) || 10, 100)
);
export const PROXNUM_ROUTE_TTL_MS = 12 * 60 * 1000;

const BLOCKED_PATTERNS = [
  /casino/i,
  /rummy/i,
  /matka/i,
  /jackpot/i,
  /poker/i,
  /slot/i,
  /\bbet\b/i,
  /\bbet\d*/i,
];

const BUILTIN_CODES = new Map([
  ['whatsapp', 'wa'],
  ['whatsappbusiness', 'wa'],
  ['instagram', 'ig'],
  ['instagramthreads', 'ig'],
  ['facebook', 'fb'],
  ['telegram', 'tg'],
  ['gmail', 'go'],
  ['google', 'go'],
  ['youtube', 'go'],
  ['tiktok', 'lf'],
  ['tiktokdouyin', 'lf'],
  ['snapchat', 'fu'],
  ['twitter', 'tw'],
  ['x', 'tw'],
  ['discord', 'ds'],
  ['microsoft', 'mm'],
  ['amazon', 'am'],
  ['tinder', 'oi'],
  ['apple', 'wx'],
  ['linkedin', 'tn'],
  ['signal', 'bw'],
  ['viber', 'vi'],
  ['line', 'me'],
  ['uber', 'ub'],
  ['swiggy', 'jx'],
  ['myntra', 'nl'],
  ['flipkart', 'xt'],
  ['zepto', 'adi'],
  ['zoho', 'zh'],
  ['steam', 'mt'],
  ['netflix', 'nf'],
  ['fiverr', 'cn'],
  ['upwork', 'abq'],
  ['binance', 'aon'],
  ['wise', 'bo'],
  ['payoneer', 'nc'],
  ['coinbase', 're'],
  ['airbnb', 'uk'],
  ['ebay', 'dh'],
  ['shopify', 'ano'],
  ['kfc', 'fz'],
  ['tata neu', 'ace'],
  ['tataneu', 'ace'],
  ['olx', 'sn'],
  ['magicbricks', 'hq'],
  ['angel one', 'aha'],
  ['angelone', 'aha'],
  ['1mg', 'ot'],
]);

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function customCodeMap() {
  const raw = String(process.env.PROXNUM_SERVICE_MAP_JSON || '').trim();
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('map must be an object');
    return new Map(
      Object.entries(parsed)
        .map(([key, value]) => [normalize(key), String(value || '').trim().toLowerCase()])
        .filter(([, value]) => value)
    );
  } catch (error) {
    const err = new Error('PROXNUM_SERVICE_MAP_JSON must be valid JSON');
    err.code = 'PROXNUM_INVALID_SERVICE_MAP';
    err.cause = error;
    throw err;
  }
}

export function isProxnumServiceBlocked(service) {
  const textValue = String(service?.name || '') + ' ' + String(service?.category || '');
  return BLOCKED_PATTERNS.some(pattern => pattern.test(textValue));
}

export function getProxnumServiceCode(service) {
  if (!service || isProxnumServiceBlocked(service)) return null;

  const custom = customCodeMap();
  const byId = custom.get(normalize(service.id));
  if (byId) return byId;
  const nameKey = normalize(service.name);
  return custom.get(nameKey) || BUILTIN_CODES.get(nameKey) || null;
}

export async function listProxnumInventoryForServices() {
  const pool = await getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT i.service_id,i.external_service_code,i.available,i.base_price_usd,
            i.sell_price_usd,i.synced_at,i.active
       FROM provider_service_inventory i
       JOIN providers p ON p.id=i.provider_id
      WHERE p.adapter_key='proxnum' AND i.country=$1
      ORDER BY i.service_id`,
    [PROXNUM_INDIA_COUNTRY_ID]
  );
  return result.rows.map(row => ({
    serviceId: row.service_id,
    code: row.external_service_code,
    available: row.available == null ? null : Number(row.available),
    basePriceUsd: row.base_price_usd == null ? null : Number(row.base_price_usd),
    sellPriceUsd: row.sell_price_usd == null ? null : Number(row.sell_price_usd),
    fetchedAt: row.synced_at ? new Date(row.synced_at).getTime() : null,
    active: Boolean(row.active),
  }));
}

export async function syncProxnumIndiaInventory({ force = true } = {}) {
  if (!isProxnumEnabled()) {
    return {
      ok: true,
      enabled: false,
      routed: 0,
      eligible: 0,
      unmatched: 0,
      blocked: 0,
      belowMinimum: 0,
      message: 'Proxnum real stock is disabled or not authorized',
    };
  }

  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  const inventory = await getProxnumIndiaInventory({ force });
  const providerResult = await pool.query(
    'SELECT id FROM providers WHERE adapter_key=\'proxnum\' LIMIT 1'
  );
  if (!providerResult.rowCount) {
    const error = new Error('Proxnum provider is not registered');
    error.code = 'PROXNUM_PROVIDER_MISSING';
    throw error;
  }
  const providerId = providerResult.rows[0].id;
  const byCode = new Map(inventory.services.map(item => [item.code, item]));

  const servicesResult = await pool.query(
    "SELECT id,name,category,country,stock FROM services WHERE active=TRUE AND country='IN' ORDER BY id"
  );
  const currentRoutes = await pool.query(
    'SELECT service_id,active,fallback_stock FROM service_provider_routes WHERE provider_id=$1',
    [providerId]
  );
  const routes = new Map(currentRoutes.rows.map(row => [row.service_id, row]));

  const client = await pool.connect();
  const summary = {
    ok: true,
    enabled: true,
    fetchedAt: inventory.fetchedAt,
    providerServices: inventory.services.length,
    eligible: 0,
    routed: 0,
    unmatched: 0,
    blocked: 0,
    belowMinimum: 0,
  };

  try {
    await client.query('BEGIN');
    const claimedCodes = new Set();

    await client.query(
      'UPDATE provider_service_inventory SET active=FALSE WHERE provider_id=$1 AND country=$2',
      [providerId, PROXNUM_INDIA_COUNTRY_ID]
    );

    for (const item of inventory.services) {
      await client.query(
        `INSERT INTO provider_service_inventory
          (provider_id,country,external_service_code,available,base_price_usd,sell_price_usd,synced_at,active)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),TRUE)
         ON CONFLICT (provider_id,country,external_service_code) DO UPDATE SET
           available=EXCLUDED.available,
           base_price_usd=EXCLUDED.base_price_usd,
           sell_price_usd=EXCLUDED.sell_price_usd,
           synced_at=EXCLUDED.synced_at,
           active=TRUE`,
        [providerId, PROXNUM_INDIA_COUNTRY_ID, item.code, item.available, item.basePriceUsd, item.sellPriceUsd]
      );
    }

    await client.query(
      'UPDATE providers SET active=TRUE, updated_at=NOW() WHERE id=$1',
      [providerId]
    );

    for (const service of servicesResult.rows) {
      const code = getProxnumServiceCode(service);
      const match = code ? byCode.get(code) : null;
      const route = routes.get(service.id);
      const blocked = isProxnumServiceBlocked(service);
      const duplicateProviderCode = code ? claimedCodes.has(code) : false;

      if (blocked) summary.blocked += 1;
      else if (!match || duplicateProviderCode) summary.unmatched += 1;
      else if (match.available == null || match.available < PROXNUM_MIN_STOCK) summary.belowMinimum += 1;
      else summary.eligible += 1;

      if (!match || blocked || duplicateProviderCode || match.available == null || match.available < PROXNUM_MIN_STOCK) {
        if (route?.active) {
          await client.query(
            `UPDATE service_provider_routes
                SET active=FALSE, inventory_expires_at=NULL,
                    fallback_stock=COALESCE(fallback_stock,$2)
              WHERE service_id=$1 AND provider_id=$3`,
            [service.id, Number(route.fallback_stock ?? service.stock), providerId]
          );
          if (route.fallback_stock != null) {
            await client.query(
              'UPDATE services SET stock=$2,updated_at=NOW() WHERE id=$1',
              [service.id, Number(route.fallback_stock)]
            );
          }
        }
        continue;
      }

      let fallbackStock = route?.fallback_stock;
      if (!route?.active || fallbackStock == null) fallbackStock = Number(service.stock);

      await client.query(
        `INSERT INTO service_provider_routes
          (service_id,provider_id,priority,active,inventory_expires_at,fallback_stock)
         VALUES ($1,$2,5,TRUE,NOW()+$3,$4)
         ON CONFLICT (service_id,provider_id) DO UPDATE SET
           priority=5,
           active=TRUE,
           inventory_expires_at=EXCLUDED.inventory_expires_at,
           fallback_stock=COALESCE(service_provider_routes.fallback_stock,EXCLUDED.fallback_stock)`,
        [service.id, providerId, PROXNUM_ROUTE_TTL_MS + ' milliseconds', fallbackStock]
      );

      await client.query(
        'UPDATE provider_service_inventory SET service_id=$4 WHERE provider_id=$1 AND country=$2 AND external_service_code=$3',
        [providerId, PROXNUM_INDIA_COUNTRY_ID, code, service.id]
      );
      await client.query(
        'UPDATE services SET stock=$2,updated_at=NOW() WHERE id=$1',
        [service.id, Math.max(0, Math.trunc(match.available))]
      );
      claimedCodes.add(code);
      summary.routed += 1;
    }

    await client.query('COMMIT');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function proxnumInventoryStatus() {
  return {
    enabled: isProxnumEnabled(),
    minStock: PROXNUM_MIN_STOCK,
    country: 'IN',
    countryId: PROXNUM_INDIA_COUNTRY_ID,
    routeTtlMs: PROXNUM_ROUTE_TTL_MS,
  };
}
