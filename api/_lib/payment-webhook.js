import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';
import { recordAuditTx } from './admin-repository.js';
import { MAX_RECHARGE_PAISE } from './wallet-repository.js';

const DEFAULT_TOLERANCE_SECONDS = 300;
const PROVIDER_DEFAULT = 'generic';

function id(prefix) {
  return prefix + '-' + crypto.randomUUID();
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function paymentWebhookProvider() {
  return clean(process.env.INBOX9_PAYMENT_WEBHOOK_PROVIDER || PROVIDER_DEFAULT, 80) || PROVIDER_DEFAULT;
}

export function paymentWebhookSecret() {
  return String(process.env.INBOX9_PAYMENT_WEBHOOK_SECRET || '').trim();
}

export function paymentWebhookToleranceSeconds() {
  const value = Number(process.env.INBOX9_PAYMENT_WEBHOOK_TOLERANCE_SECONDS || DEFAULT_TOLERANCE_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_TOLERANCE_SECONDS;
  return Math.min(Math.max(Math.floor(value), 30), 900);
}

export function signPaymentWebhook(rawBody, timestampSeconds, secret = paymentWebhookSecret()) {
  if (!secret) throw new Error('Payment webhook secret is not configured');
  const timestamp = Number(timestampSeconds);
  if (!Number.isInteger(timestamp) || timestamp <= 0) throw new Error('Webhook timestamp is invalid');
  return 't=' + timestamp + ',v1=' + hmacHex(secret, timestamp + '.' + String(rawBody || ''));
}

export function verifyPaymentWebhookSignature(rawBody, signatureHeader, secret = paymentWebhookSecret(), nowMs = Date.now()) {
  if (!secret) {
    const error = new Error('Payment webhook secret is not configured');
    error.code = 'PAYMENT_WEBHOOK_NOT_CONFIGURED';
    error.statusCode = 503;
    throw error;
  }
  const value = String(signatureHeader || '').trim();
  const parts = Object.fromEntries(value.split(',').map(part => {
    const index = part.indexOf('=');
    return index > 0 ? [part.slice(0, index).trim(), part.slice(index + 1).trim()] : ['', ''];
  }).filter(([key, val]) => key && val));
  const timestamp = Number(parts.t);
  const supplied = String(parts.v1 || '');
  if (!Number.isInteger(timestamp) || supplied.length !== 64 || !/^[a-f0-9]{64}$/i.test(supplied)) {
    const error = new Error('Invalid payment webhook signature');
    error.code = 'PAYMENT_WEBHOOK_SIGNATURE_INVALID';
    error.statusCode = 401;
    throw error;
  }
  const ageMs = Math.abs(nowMs - timestamp * 1000);
  if (ageMs > paymentWebhookToleranceSeconds() * 1000) {
    const error = new Error('Payment webhook signature expired');
    error.code = 'PAYMENT_WEBHOOK_SIGNATURE_EXPIRED';
    error.statusCode = 401;
    throw error;
  }
  const expected = hmacHex(secret, timestamp + '.' + String(rawBody || ''));
  const valid = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
  if (!valid) {
    const error = new Error('Invalid payment webhook signature');
    error.code = 'PAYMENT_WEBHOOK_SIGNATURE_INVALID';
    error.statusCode = 401;
    throw error;
  }
  return { timestamp, ageMs };
}

export function normalizePaymentWebhook(body = {}) {
  const eventId = clean(body.eventId || body.id, 200);
  const eventType = clean(body.eventType || body.type, 80);
  const data = body.data && typeof body.data === 'object' ? body.data : body;

  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(eventId)) {
    const error = new Error('Payment webhook eventId is required');
    error.code = 'PAYMENT_WEBHOOK_EVENT_INVALID';
    error.statusCode = 400;
    throw error;
  }
  if (!['payment.succeeded', 'payment.failed'].includes(eventType)) {
    const error = new Error('Unsupported payment webhook event type');
    error.code = 'PAYMENT_WEBHOOK_EVENT_UNSUPPORTED';
    error.statusCode = 400;
    throw error;
  }

  const rechargeId = clean(data.rechargeId || data.recharge_id, 160);
  const amountPaise = Number(data.amountPaise ?? data.amount_paise);
  const currency = clean(data.currency || 'INR', 8).toUpperCase();
  const utr = data.utr == null || data.utr === '' ? null : clean(data.utr, 64);
  const externalReference = data.externalReference == null || data.externalReference === ''
    ? null : clean(data.externalReference, 160);

  if (!rechargeId) {
    const error = new Error('Payment webhook rechargeId is required');
    error.code = 'PAYMENT_WEBHOOK_RECHARGE_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > MAX_RECHARGE_PAISE) {
    const error = new Error('Payment webhook amount is invalid');
    error.code = 'PAYMENT_WEBHOOK_AMOUNT_INVALID';
    error.statusCode = 400;
    throw error;
  }
  if (currency !== 'INR') {
    const error = new Error('Only INR payment webhooks are supported');
    error.code = 'PAYMENT_WEBHOOK_CURRENCY_INVALID';
    error.statusCode = 400;
    throw error;
  }
  if (utr && !/^[A-Za-z0-9._-]{4,64}$/.test(utr)) {
    const error = new Error('Payment webhook UTR is invalid');
    error.code = 'PAYMENT_WEBHOOK_UTR_INVALID';
    error.statusCode = 400;
    throw error;
  }

  return { eventId, eventType, rechargeId, amountPaise, currency, utr, externalReference };
}

function payloadHash(rawBody) {
  return crypto.createHash('sha256').update(String(rawBody || '')).digest('hex');
}

async function updateWebhookEvent(client, eventId, provider, update) {
  const fields = [];
  const params = [];
  for (const [column, value] of Object.entries(update)) {
    params.push(value);
    fields.push(column + '=$' + params.length);
  }
  params.push(provider, eventId);
  await client.query(
    'UPDATE payment_webhook_events SET ' + fields.join(', ') +
      ' WHERE provider=$' + (params.length - 1) + ' AND event_id=$' + params.length,
    params
  );
}

export async function processPaymentWebhook({ rawBody, normalized, provider = paymentWebhookProvider() }) {
  const bodyHash = payloadHash(rawBody);

  return withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO payment_webhook_events
        (id,provider,event_id,event_type,payload_hash,recharge_id,observed_amount_paise,currency,observed_utr,external_reference,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Received')
       ON CONFLICT (provider,event_id) DO NOTHING
       RETURNING *`,
      [id('PWE'), provider, normalized.eventId, normalized.eventType, bodyHash, normalized.rechargeId,
        normalized.amountPaise, normalized.currency, normalized.utr, normalized.externalReference]
    );

    if (!inserted.rowCount) {
      const existing = await client.query(
        'SELECT event_id,payload_hash,status,outcome,error_code,error_message FROM payment_webhook_events WHERE provider=$1 AND event_id=$2 FOR UPDATE',
        [provider, normalized.eventId]
      );
      const row = existing.rows[0];
      if (!row) throw new Error('Webhook idempotency record unavailable');
      if (row.payload_hash !== bodyHash) {
        await updateWebhookEvent(client, normalized.eventId, provider, {
          status: 'Rejected',
          outcome: 'rejected',
          error_code: 'PAYMENT_WEBHOOK_EVENT_CONFLICT',
          error_message: 'Event ID was reused with a different payload',
          processed_at: new Date()
        });
        return { ok: false, duplicate: true, statusCode: 409, code: 'PAYMENT_WEBHOOK_EVENT_CONFLICT', error: 'Event ID was reused with a different payload' };
      }
      return {
        ok: true,
        duplicate: true,
        eventId: normalized.eventId,
        outcome: row.outcome || row.status.toLowerCase()
      };
    }

    const rechargeResult = await client.query('SELECT * FROM recharge_requests WHERE id=$1 FOR UPDATE', [normalized.rechargeId]);
    if (!rechargeResult.rowCount) {
      await updateWebhookEvent(client, normalized.eventId, provider, {
        status: 'Rejected',
        outcome: 'rejected',
        error_code: 'PAYMENT_RECHARGE_NOT_FOUND',
        error_message: 'Recharge request not found',
        processed_at: new Date()
      });
      return { ok: false, statusCode: 404, code: 'PAYMENT_RECHARGE_NOT_FOUND', error: 'Recharge request not found' };
    }

    const recharge = rechargeResult.rows[0];
    if (Number(recharge.amount_paise) !== normalized.amountPaise) {
      await updateWebhookEvent(client, normalized.eventId, provider, {
        status: 'Rejected', outcome: 'rejected', error_code: 'PAYMENT_AMOUNT_MISMATCH',
        error_message: 'Payment amount does not match the recharge', processed_at: new Date()
      });
      return { ok: false, statusCode: 409, code: 'PAYMENT_AMOUNT_MISMATCH', error: 'Payment amount does not match the recharge' };
    }
    if (normalized.utr && normalized.utr.toLowerCase() !== String(recharge.utr).toLowerCase()) {
      await updateWebhookEvent(client, normalized.eventId, provider, {
        status: 'Rejected', outcome: 'rejected', error_code: 'PAYMENT_UTR_MISMATCH',
        error_message: 'Payment UTR does not match the recharge', processed_at: new Date()
      });
      return { ok: false, statusCode: 409, code: 'PAYMENT_UTR_MISMATCH', error: 'Payment UTR does not match the recharge' };
    }

    if (recharge.status !== 'Pending') {
      await updateWebhookEvent(client, normalized.eventId, provider, {
        status: 'Ignored', outcome: 'ignored_terminal_state', processed_at: new Date()
      });
      return {
        ok: true,
        duplicate: false,
        eventId: normalized.eventId,
        outcome: 'ignored_terminal_state',
        rechargeStatus: recharge.status
      };
    }

    if (normalized.eventType === 'payment.failed') {
      const rejectionReason = 'Payment gateway reported a failed settlement';
      await client.query(
        `UPDATE recharge_requests
           SET status='Rejected', rejection_reason=$2, reviewed_at=NOW(), reviewed_by=NULL
           WHERE id=$1`,
        [recharge.id, rejectionReason]
      );
      await client.query(
        `INSERT INTO payment_reconciliation_events
           (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
         VALUES ($1,$2,'rejected',NULL,$3,$4,$5,$6)`,
        [id('PAY'), recharge.id, normalized.amountPaise, normalized.utr, normalized.externalReference,
          'Payment gateway webhook reported failure']
      );
      await recordAuditTx(client, null, 'payment_webhook.reject', 'recharge', recharge.id, {
        provider, eventId: normalized.eventId, amountPaise: normalized.amountPaise,
        externalReference: normalized.externalReference
      });
      await updateWebhookEvent(client, normalized.eventId, provider, {
        status: 'Processed', outcome: 'rejected', processed_at: new Date()
      });
      return { ok: true, eventId: normalized.eventId, outcome: 'rejected', rechargeStatus: 'Rejected' };
    }

    await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [recharge.user_id]);
    await client.query('SELECT balance_paise FROM wallets WHERE user_id=$1 FOR UPDATE', [recharge.user_id]);
    const amount = normalized.amountPaise;
    await client.query(
      'UPDATE wallets SET balance_paise=balance_paise+$2, updated_at=NOW() WHERE user_id=$1',
      [recharge.user_id, amount]
    );
    await client.query(
      `INSERT INTO wallet_ledger
         (id,user_id,entry_type,amount_paise,reference_type,reference_id,description)
       VALUES ($1,$2,'credit',$3,'recharge',$4,$5)`,
      [id('LED'), recharge.user_id, amount, recharge.id,
        'Payment webhook settlement • ' + (normalized.externalReference || normalized.eventId)]
    );
    await client.query(
      `UPDATE recharge_requests
         SET status='Approved', reviewed_at=NOW(), reviewed_by=NULL,
             verified_amount_paise=$2, verified_utr=$3, external_reference=$4
       WHERE id=$1`,
      [recharge.id, amount, normalized.utr, normalized.externalReference]
    );
    await client.query(
      `INSERT INTO payment_reconciliation_events
         (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
       VALUES ($1,$2,'verified',NULL,$3,$4,$5,'Payment gateway webhook details verified')`,
      [id('PAY'), recharge.id, amount, normalized.utr, normalized.externalReference]
    );
    await client.query(
      `INSERT INTO payment_reconciliation_events
         (id,recharge_id,event_type,actor_user_id,observed_amount_paise,observed_utr,external_reference,notes)
       VALUES ($1,$2,'approved',NULL,$3,$4,$5,'Wallet credited after payment settlement verification')`,
      [id('PAY'), recharge.id, amount, normalized.utr, normalized.externalReference]
    );
    await recordAuditTx(client, null, 'payment_webhook.approve', 'recharge', recharge.id, {
      provider, eventId: normalized.eventId, amountPaise: amount,
      externalReference: normalized.externalReference
    });
    await updateWebhookEvent(client, normalized.eventId, provider, {
      status: 'Processed', outcome: 'approved', processed_at: new Date()
    });

    return { ok: true, eventId: normalized.eventId, outcome: 'approved', rechargeStatus: 'Approved', amountPaise: amount };
  });
}

export async function listPaymentWebhookEvents(limit = 100) {
  const pool = await getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const result = await pool.query(
    `SELECT provider,event_id,event_type,recharge_id,observed_amount_paise,currency,observed_utr,
            external_reference,status,outcome,error_code,error_message,received_at,processed_at
       FROM payment_webhook_events
       ORDER BY received_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(row => ({
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    rechargeId: row.recharge_id,
    amountPaise: Number(row.observed_amount_paise),
    currency: row.currency,
    observedUtr: row.observed_utr,
    externalReference: row.external_reference,
    status: row.status,
    outcome: row.outcome,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    receivedAt: new Date(row.received_at).getTime(),
    processedAt: row.processed_at ? new Date(row.processed_at).getTime() : null
  }));
}
