import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function migrationSemanticName(fileName) {
  return String(fileName).replace(/\.sql$/, '').replace(/^\d{12}_/, '').replace(/^\d+_/, '');
}

test('db and supabase migration trees stay semantically aligned', async () => {
  const [dbFiles, supabaseFiles] = await Promise.all([
    fs.readdir(path.join(repoRoot, 'db', 'migrations')),
    fs.readdir(path.join(repoRoot, 'supabase', 'migrations'))
  ]);
  const dbNames = [...new Set(dbFiles.filter(name => /^\d+_.+\.sql$/.test(name)).map(migrationSemanticName))].sort();
  const supabaseNames = [...new Set(supabaseFiles.filter(name => /^\d+_.+\.sql$/.test(name)).map(migrationSemanticName))].sort();
  assert.deepEqual(dbNames, supabaseNames);
});

function testDb() {
  return process.env.INBOX9_TEST_DATABASE_URL;
}

test('persistent cancellation lock executes against PostgreSQL', async () => {
  if (!testDb()) return;
  process.env.DATABASE_URL = testDb();
  process.env.DATABASE_SSL = 'false';

  const { getPool } = await import('../api/_lib/db.js');
  const { beginCancellation } = await import('../api/_lib/provider-operations.js');
  const pool = await getPool();
  const suffix = crypto.randomUUID();
  const userId = 'TEST-CANCEL-USER-' + suffix;
  const serviceId = 'TEST-CANCEL-SVC-' + suffix;
  const activationId = 'TEST-CANCEL-ACT-' + suffix;

  try {
    await pool.query(
      'INSERT INTO users (id,email,password_hash,role,active) VALUES ($1,$2,$3,\'user\',TRUE)',
      [userId, 'cancel-' + suffix + '@example.test', 'test-only']
    );
    await pool.query(
      'INSERT INTO services (id,name,category,currency,price_paise,country,availability,stock,active) VALUES ($1,$2,\'Test\',\'INR\',100,\'IN\',\'high\',1,TRUE)',
      [serviceId, 'Cancellation SQL Test ' + suffix]
    );
    await pool.query(
      'INSERT INTO activations (id,user_id,service_id,service_name,country,phone_number,price_paise,currency,status,otp,created_at,expires_at,provider_id,provider_activation_id,provider_metadata) VALUES ($1,$2,$3,$4,\'IN\',\'+919900000000\',100,\'INR\',\'Active\',NULL,NOW(),NOW()+INTERVAL \'20 minutes\',\'provider-mock\',$5,\'{}\'::jsonb)',
      [activationId, userId, serviceId, 'Cancellation SQL Test ' + suffix, 'TEST-CANCEL-PROVIDER-' + suffix]
    );

    const begun = await beginCancellation(activationId, userId);
    assert.equal(begun?.operation?.operation_type, 'cancel');
    assert.equal(begun?.adapterKey, 'synthetic');

    const row = await pool.query('SELECT status FROM activations WHERE id=$1', [activationId]);
    assert.equal(row.rows[0]?.status, 'CancellationPending');
  } finally {
    await pool.query('DELETE FROM provider_operations WHERE activation_id=$1', [activationId]).catch(() => {});
    await pool.query('DELETE FROM activations WHERE id=$1', [activationId]).catch(() => {});
    await pool.query('DELETE FROM services WHERE id=$1', [serviceId]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
  }
});

test('persistent expiration claim lock executes against PostgreSQL', async () => {
  if (!testDb()) return;
  process.env.DATABASE_URL = testDb();
  process.env.DATABASE_SSL = 'false';

  const { getPool } = await import('../api/_lib/db.js');
  const pool = await getPool();
  const client = await pool.connect();
  const suffix = crypto.randomUUID();
  const userId = 'TEST-EXPIRE-USER-' + suffix;
  const serviceId = 'TEST-EXPIRE-SVC-' + suffix;
  const activationId = 'TEST-EXPIRE-ACT-' + suffix;

  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id,email,password_hash,role,active) VALUES ($1,$2,$3,\'user\',TRUE)',
      [userId, 'expire-' + suffix + '@example.test', 'test-only']
    );
    await client.query(
      'INSERT INTO services (id,name,category,currency,price_paise,country,availability,stock,active) VALUES ($1,$2,\'Test\',\'INR\',100,\'IN\',\'high\',1,TRUE)',
      [serviceId, 'Expiration SQL Test ' + suffix]
    );
    await client.query(
      'INSERT INTO activations (id,user_id,service_id,service_name,country,phone_number,price_paise,currency,status,otp,created_at,expires_at,provider_id,provider_activation_id,provider_metadata) VALUES ($1,$2,$3,$4,\'IN\',\'+919900000001\',100,\'INR\',\'Active\',NULL,NOW()-INTERVAL \'30 minutes\',NOW()-INTERVAL \'1 minute\',\'provider-mock\',$5,\'{}\'::jsonb)',
      [activationId, userId, serviceId, 'Expiration SQL Test ' + suffix, 'TEST-EXPIRE-PROVIDER-' + suffix]
    );

    const claim = await client.query(
      'SELECT a.*, p.adapter_key ' +
      'FROM activations a ' +
      'LEFT JOIN providers p ON p.id=a.provider_id ' +
      'WHERE a.id=$1 ' +
      'AND a.expires_at <= NOW() ' +
      'AND a.status IN (\'Active\',\'ExpirationPending\') ' +
      'AND NOT EXISTS (' +
      '  SELECT 1 FROM provider_operations o ' +
      '  WHERE o.activation_id=a.id ' +
      '    AND o.operation_type=\'status_sync\' ' +
      '    AND o.status=\'Pending\'' +
      ') ' +
      'ORDER BY a.expires_at ASC, a.created_at ASC ' +
      'LIMIT 1 ' +
      'FOR UPDATE OF a SKIP LOCKED',
      [activationId]
    );

    assert.equal(claim.rowCount, 1);
    assert.equal(claim.rows[0]?.id, activationId);
    assert.equal(claim.rows[0]?.adapter_key, 'synthetic');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});
