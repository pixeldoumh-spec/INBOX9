import { getPool } from '../api/_lib/db.js';

const pool = await getPool();
if (!pool) { console.error('DATABASE_URL is not configured'); process.exit(2); }
const scalar = async (sql) => Number((await pool.query(sql)).rows[0].count);
const required = ['users','sessions','services','activations','wallets','wallet_ledger','recharge_requests','providers','service_provider_routes','audit_logs','provider_operations','activation_idempotency','wallet_reconciliation_runs','wallet_reconciliation_issues','payment_reconciliation_events','support_requests','support_messages','notifications','recovery_codes','rate_limit_buckets','synthetic_slot_reservations'];
const tableRows = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, [required]);
const found = new Set(tableRows.rows.map(r => r.table_name));
const missing = required.filter(name => !found.has(name));
const rowCounts = {};
for (const table of required) { if (found.has(table)) rowCounts[table] = await scalar('SELECT COUNT(*)::bigint AS count FROM public.' + table); }
const serviceCount = await scalar('SELECT COUNT(*) FROM services');
const activeRouteCount = await scalar("SELECT COUNT(*) FROM service_provider_routes r JOIN providers p ON p.id=r.provider_id WHERE r.active=TRUE AND p.active=TRUE AND p.adapter_key IN ('mock','synthetic')");
const orphanActivations = await scalar('SELECT COUNT(*) FROM activations WHERE user_id IS NULL');
const invalidChecks = await scalar("SELECT COUNT(*) FROM pg_constraint WHERE contype='c' AND convalidated=FALSE AND conrelid='public.activations'::regclass AND conname='activations_user_required'");
const unvalidatedRequiredFks = await scalar("SELECT COUNT(*) FROM pg_constraint WHERE contype='f' AND convalidated=FALSE AND connamespace='public'::regnamespace");
const ledgerMismatch = await scalar("SELECT COUNT(*) FROM wallets w LEFT JOIN LATERAL (SELECT COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount_paise ELSE -amount_paise END),0) AS ledger_balance FROM wallet_ledger l WHERE l.user_id=w.user_id) l ON TRUE WHERE w.balance_paise <> l.ledger_balance");
const migrationCount = await scalar('SELECT COUNT(*) FROM schema_migrations');
const schemaVersion = (await pool.query("SELECT COALESCE(MAX(version), 'none') AS version FROM schema_migrations")).rows[0].version;
const result = { ok: missing.length === 0 && serviceCount === 832 && activeRouteCount === 832 && orphanActivations === 0 && invalidChecks === 0 && unvalidatedRequiredFks === 0 && ledgerMismatch === 0 && migrationCount >= 28, requiredTables: { expected: required.length, found: found.size, missing }, rowCounts, invariants: { services: serviceCount, activeProviderRoutes: activeRouteCount, orphanActivations, activationsUserConstraintUnvalidated: invalidChecks, unvalidatedForeignKeys: unvalidatedRequiredFks, walletLedgerMismatches: ledgerMismatch, schemaMigrationCount: migrationCount, latestMigration: schemaVersion } };
console.log(JSON.stringify(result, null, 2));
await pool.end();
if (!result.ok) process.exit(1);