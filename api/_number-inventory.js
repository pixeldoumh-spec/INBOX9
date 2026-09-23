import crypto from 'node:crypto';
import { applySecurityHeaders, requestId, rateLimitAsync } from './_lib/security.js';
import { dbEnabled } from './_lib/db.js';
import { normalizeSourceKey, syncNumberInventory } from './_lib/number-inventory-repository.js';

function validSecret(req) {
  const expected = String(process.env.NUMBER_INVENTORY_SYNC_SECRET || '').trim();
  const supplied = String(req.headers['x-inbox9-inventory-secret'] || '').trim();
  return Boolean(expected && supplied && expected.length === supplied.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'number-inventory-sync', 20, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Number inventory requires PostgreSQL' });
  if (!validSecret(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sourceKey = normalizeSourceKey(req.body?.sourceKey);
    const result = await syncNumberInventory({
      sourceKey,
      numbers: req.body?.numbers,
      complete: Boolean(req.body?.complete),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('number_inventory.sync_failed', error);
    if (error.code === 'INVALID_SOURCE_KEY' || error.code === 'INVALID_INVENTORY_BATCH' || error.code === 'INVALID_PROVIDER_NUMBER_ID' || error.code === 'INVALID_INDIAN_NUMBER') {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    return res.status(503).json({ error: 'Number inventory sync unavailable' });
  }
}
