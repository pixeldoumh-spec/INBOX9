import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizePaymentWebhook, signPaymentWebhook, verifyPaymentWebhookSignature, paymentWebhookToleranceSeconds } from '../api/_lib/payment-webhook.js';

test('payment webhook signatures use timestamped HMAC', () => {
  const secret = 'test-payment-webhook-secret-123456';
  const raw = JSON.stringify({ eventId: 'evt_test_001', eventType: 'payment.succeeded', data: { rechargeId: 'RCH-TEST-001', amountPaise: 15000, currency: 'INR' } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPaymentWebhook(raw, timestamp, secret);
  assert.match(signature, /^t=\d+,v1=[a-f0-9]{64}$/);
  const verified = verifyPaymentWebhookSignature(raw, signature, secret);
  assert.equal(verified.timestamp, timestamp);
  assert.ok(Number.isFinite(verified.ageMs));
});

test('invalid and replayed webhook signatures fail closed', () => {
  const secret = 'test-payment-webhook-secret-123456';
  const raw = '{}';
  const timestamp = Math.floor(Date.now() / 1000);
  const valid = signPaymentWebhook(raw, timestamp, secret);
  assert.throws(() => verifyPaymentWebhookSignature(raw + 'x', valid, secret), /Invalid payment webhook signature/);
  assert.throws(() => verifyPaymentWebhookSignature(raw, valid, secret, (timestamp - paymentWebhookToleranceSeconds() - 1) * 1000), /expired/);
});

test('webhook normalization enforces event, recharge, amount and INR', () => {
  assert.deepEqual(normalizePaymentWebhook({ eventId: 'evt_test_002', eventType: 'payment.succeeded', data: { rechargeId: 'RCH-12345678', amountPaise: 20000, currency: 'INR', utr: 'BANK-1234', externalReference: 'pay_123' } }), {
    eventId: 'evt_test_002', eventType: 'payment.succeeded', rechargeId: 'RCH-12345678', amountPaise: 20000, currency: 'INR', utr: 'BANK-1234', externalReference: 'pay_123'
  });
  assert.throws(() => normalizePaymentWebhook({ eventId: 'evt_test_003', eventType: 'payment.succeeded', data: { rechargeId: 'RCH-12345678', amountPaise: 20000, currency: 'USD' } }), /INR/);
});

test('Postgres settlement is exactly-once and rejects a reused event ID with another payload', { skip: !process.env.INBOX9_TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const { getPool } = await import('../api/_lib/db.js');
  const { processPaymentWebhook } = await import('../api/_lib/payment-webhook.js');
  const pool = await getPool();
  const userId = 'WH-USER-' + crypto.randomUUID();
  const adminId = 'WH-ADMIN-' + crypto.randomUUID();
  const rechargeId = 'WH-RCH-' + crypto.randomUUID();
  const utr = 'WHUTR-' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  const eventId = 'evt_' + crypto.randomUUID();
  const provider = 'sandbox';
  try {
    await pool.query('INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [userId, userId + '@example.invalid', 'fixture', 'user', adminId, adminId + '@example.invalid', 'fixture', 'admin']);
    await pool.query('INSERT INTO wallets (user_id,balance_paise) VALUES ($1,0)', [userId]);
    await pool.query('INSERT INTO recharge_requests (id,user_id,amount_paise,utr,payment_method,upi_id) VALUES ($1,$2,50000,$3,\'UPI\',\'sandbox@upi\')', [rechargeId, userId, utr]);
    const payload = { eventId, eventType: 'payment.succeeded', data: { rechargeId, amountPaise: 50000, currency: 'INR', utr, externalReference: 'sandbox-pay-1' } };
    const rawBody = JSON.stringify(payload);
    const normalized = normalizePaymentWebhook(payload);
    const [first, second] = await Promise.all([
      processPaymentWebhook({ rawBody, normalized, provider }),
      processPaymentWebhook({ rawBody, normalized, provider })
    ]);
    assert.equal([first, second].filter(item => item.outcome === 'approved').length, 1);
    assert.equal([first, second].filter(item => item.duplicate === true).length, 1);
    const wallet = await pool.query('SELECT balance_paise FROM wallets WHERE user_id=$1', [userId]);
    const credits = await pool.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paise),0)::bigint AS amount FROM wallet_ledger WHERE reference_type='recharge' AND reference_id=$1", [rechargeId]);
    const event = await pool.query('SELECT status,outcome FROM payment_webhook_events WHERE provider=$1 AND event_id=$2', [provider, eventId]);
    assert.equal(Number(wallet.rows[0].balance_paise), 50000);
    assert.equal(Number(credits.rows[0].count), 1);
    assert.equal(Number(credits.rows[0].amount), 50000);
    assert.deepEqual(event.rows[0], { status: 'Processed', outcome: 'approved' });
    const conflictingPayload = { ...payload, data: { ...payload.data, amountPaise: 40000 } };
    const mismatch = await processPaymentWebhook({ rawBody: JSON.stringify(conflictingPayload), normalized: normalizePaymentWebhook(conflictingPayload), provider });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'PAYMENT_WEBHOOK_EVENT_CONFLICT');
    assert.equal(Number((await pool.query('SELECT balance_paise FROM wallets WHERE user_id=$1', [userId])).rows[0].balance_paise), 50000);
  } finally {
    // The wallet ledger is intentionally immutable and its user foreign key is
    // cascading, so deleting the fixture user would invoke the ledger mutation guard.
    // The CI database is recreated for every run; UUID-scoped fixtures are therefore
    // intentionally retained to preserve the production invariant.
    await pool.end();
  }
});