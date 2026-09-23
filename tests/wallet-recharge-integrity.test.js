import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizeVerification, isDuplicateUtrError } from '../api/_lib/wallet-repository.js';

test('wallet verification normalization validates amount, UTR and optional external reference', () => {
  assert.deepEqual(
    normalizeVerification({ amountPaise: 500000, utr: 'E2E-UTR-001', externalReference: 'bank-ref-123' }),
    { amountPaise: 500000, utr: 'E2E-UTR-001', externalReference: 'bank-ref-123' }
  );
  assert.equal(normalizeVerification({}).amountPaise, null);
  assert.throws(() => normalizeVerification({ amountPaise: 0 }), /Verified payment amount is invalid/);
  assert.throws(() => normalizeVerification({ amountPaise: 1000, utr: 'bad utr' }), /Verified UTR is invalid/);
});

test('duplicate UTR detection is limited to the authoritative unique constraint', () => {
  assert.equal(isDuplicateUtrError({ code: '23505', constraint: 'uq_recharge_utr' }), true);
  assert.equal(isDuplicateUtrError({ code: '23505', constraint: 'some_other_unique_constraint' }), false);
  assert.equal(isDuplicateUtrError({ code: 'DUPLICATE_UTR' }), true);
});

test('approval requires independent verified amount and UTR and records no fallback evidence', async () => {
  const fs = await import('node:fs/promises');
  const [repo, route] = await Promise.all([
    fs.readFile(new URL('../api/_lib/wallet-repository.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/admin/recharges/[id].js', import.meta.url), 'utf8')
  ]);
  assert.match(repo, /decision === 'approve' && \(normalized\.amountPaise == null \|\| normalized\.utr == null\)/);
  assert.match(repo, /verifiedAmountPaise: observedAmount, verifiedUtr: observedUtr/);
  assert.doesNotMatch(repo, /observedAmount \?\? amount, observedUtr \?\? row\.utr/);
  assert.match(route, /DUPLICATE_UTR/);
  assert.match(route, /status\(409\)/);
});

test('concurrent terminal review decisions serialize to exactly one outcome', { skip: !process.env.INBOX9_TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.INBOX9_TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  const { getPool } = await import('../api/_lib/db.js');
  const { reviewRecharge } = await import('../api/_lib/wallet-repository.js');
  const pool = await getPool();
  const userId = `USR-TEST-${crypto.randomUUID()}`;
  const adminA = `ADM-A-${crypto.randomUUID()}`;
  const adminB = `ADM-B-${crypto.randomUUID()}`;
  const rechargeId = `RCH-TEST-${crypto.randomUUID()}`;
  const utr = `CONC-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, role TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await pool.query('CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY, balance_paise BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    await pool.query("CREATE TABLE IF NOT EXISTS wallet_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entry_type TEXT NOT NULL CHECK (entry_type IN ('credit','debit')), amount_paise BIGINT NOT NULL CHECK (amount_paise > 0), reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, description TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(reference_type, reference_id))");
    await pool.query("CREATE TABLE IF NOT EXISTS recharge_requests (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount_paise BIGINT NOT NULL, utr TEXT NOT NULL UNIQUE, payment_method TEXT NOT NULL DEFAULT 'UPI', upi_id TEXT NOT NULL DEFAULT 'test@upi', status TEXT NOT NULL DEFAULT 'Pending', rejection_reason TEXT, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by TEXT, flagged_at TIMESTAMPTZ, flagged_by TEXT, flag_reason TEXT, verified_amount_paise BIGINT, verified_utr TEXT, external_reference TEXT)");
    await pool.query("CREATE TABLE IF NOT EXISTS payment_reconciliation_events (id TEXT PRIMARY KEY, recharge_id TEXT NOT NULL, event_type TEXT NOT NULL, actor_user_id TEXT, observed_amount_paise BIGINT, observed_utr TEXT, external_reference TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await pool.query("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT, target_type TEXT, target_id TEXT, metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await pool.query('CREATE OR REPLACE FUNCTION test_wallet_balance_invariant() RETURNS trigger AS $fn$ DECLARE recorded BIGINT; calculated BIGINT; BEGIN SELECT balance_paise INTO recorded FROM wallets WHERE user_id=NEW.user_id; SELECT COALESCE(SUM(CASE WHEN entry_type=\'credit\' THEN amount_paise ELSE -amount_paise END),0) INTO calculated FROM wallet_ledger WHERE user_id=NEW.user_id; IF recorded IS NULL OR recorded <> calculated THEN RAISE EXCEPTION \'wallet ledger invariant violated\'; END IF; RETURN NEW; END; $fn$ LANGUAGE plpgsql');
    await pool.query('DROP TRIGGER IF EXISTS test_wallet_balance_ledger_invariant ON wallet_ledger');
    await pool.query('CREATE CONSTRAINT TRIGGER test_wallet_balance_ledger_invariant AFTER INSERT ON wallet_ledger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_wallet_balance_invariant()');
    await pool.query('DELETE FROM recharge_requests WHERE id=$1', [rechargeId]);
    await pool.query('DELETE FROM wallets WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2,$3)', [userId, adminA, adminB]);
    await pool.query('INSERT INTO users (id,email,password_hash,role) VALUES ($1,$2,\'test-fixture-hash\',\'user\'),($3,$4,\'test-fixture-hash\',\'admin\'),($5,$6,\'test-fixture-hash\',\'admin\')', [userId, `${userId}@example.com`, adminA, `${adminA}@example.com`, adminB, `${adminB}@example.com`]);
    await pool.query('INSERT INTO wallets (user_id,balance_paise) VALUES ($1,0)', [userId]);
    await pool.query('INSERT INTO recharge_requests (id,user_id,amount_paise,utr) VALUES ($1,$2,50000,$3)', [rechargeId, userId, utr]);

    const results = await Promise.allSettled([
      reviewRecharge(rechargeId, adminA, 'approve', '', { amountPaise: 50000, utr }),
      reviewRecharge(rechargeId, adminB, 'reject', 'Payment could not be verified')
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const recharge = await pool.query('SELECT status FROM recharge_requests WHERE id=$1', [rechargeId]);
    const ledger = await pool.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_paise) FILTER (WHERE entry_type='credit'),0)::bigint AS credits FROM wallet_ledger WHERE reference_type='recharge' AND reference_id=$1", [rechargeId]);
    const wallet = await pool.query('SELECT balance_paise FROM wallets WHERE user_id=$1', [userId]);
    assert.equal(['Approved', 'Rejected'].includes(recharge.rows[0].status), true);
    assert.equal(Number(ledger.rows[0].count), recharge.rows[0].status === 'Approved' ? 1 : 0);
    assert.equal(Number(ledger.rows[0].credits), recharge.rows[0].status === 'Approved' ? 50000 : 0);
    assert.equal(Number(wallet.rows[0].balance_paise), Number(ledger.rows[0].credits));

    await pool.query('DELETE FROM audit_logs WHERE actor_user_id IN ($1,$2)', [adminA, adminB]);
    await pool.query('DELETE FROM payment_reconciliation_events WHERE recharge_id=$1', [rechargeId]);
    await pool.query('DELETE FROM recharge_requests WHERE id=$1', [rechargeId]);
    await pool.query('DELETE FROM wallet_ledger WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM wallets WHERE user_id=$1', [userId]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [userId, adminA]);
    await pool.query('DELETE FROM users WHERE id=$1', [adminB]);
  } finally {
    await pool.end();
  }
});
