import { getPool } from '../api/_lib/db.js';

const pool = await getPool();
if (!pool) {
  console.error('DATABASE_URL is not configured');
  process.exit(2);
}

const requiredTables = ['users','sessions','services','activations','wallets','wallet_ledger','recharge_requests','providers','service_provider_routes','audit_logs','wallet_reconciliation_runs','wallet_reconciliation_issues'];
const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [requiredTables]);
const found = new Set(tables.rows.map(r => r.table_name));
const missing = requiredTables.filter(t => !found.has(t));
const migrations = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
const activationNulls = await pool.query('SELECT COUNT(*)::int AS count FROM activations WHERE user_id IS NULL');
const adminCount = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin'");
const result = {
  ok: missing.length === 0 && Number(activationNulls.rows[0].count) === 0,
  tables: { required: requiredTables.length, found: found.size, missing },
  migrations: migrations.rows.map(r => r.version),
  activationRowsWithoutOwner: Number(activationNulls.rows[0].count),
  adminUsers: Number(adminCount.rows[0].count),
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
await pool.end();
