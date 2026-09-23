import crypto from 'node:crypto';
import { applySecurityHeaders, requestId, rateLimitAsync } from './_lib/security.js';
import { dbEnabled } from './_lib/db.js';
import { ingestInboundSms } from './_lib/number-inventory-repository.js';

function validSecret(req) {
  const expected = String(process.env.INBOUND_SMS_WEBHOOK_SECRET || '').trim();
  const supplied = String(req.headers['x-inbox9-webhook-secret'] || '').trim();
  return Boolean(expected && supplied && expected.length === supplied.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)));
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'inbound-sms-webhook', 120, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Inbound SMS requires PostgreSQL' });
  if (!validSecret(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await ingestInboundSms({
      sourceKey: req.body?.sourceKey,
      providerMessageId: req.body?.providerMessageId ?? req.body?.messageId,
      toNumber: req.body?.toNumber ?? req.body?.to ?? req.body?.recipient,
      fromNumber: req.body?.fromNumber ?? req.body?.from ?? req.body?.sender,
      body: req.body?.body ?? req.body?.message ?? '',
      receivedAt: req.body?.receivedAt ?? Date.now(),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('inbound_sms.ingest_failed', error);
    const clientCodes = new Set([
      'INVALID_SOURCE_KEY','INVALID_PROVIDER_MESSAGE_ID','INVALID_INDIAN_NUMBER',
      'INVALID_SMS_BODY','NUMBER_INVENTORY_NOT_FOUND',
    ]);
    if (clientCodes.has(error.code)) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    return res.status(503).json({ error: 'Inbound SMS unavailable' });
  }
}
