import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../db/migrations');

export async function migrate() {
  const pool = await getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const files = (await fs.readdir(migrationsDir))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort();
  const applied = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (exists.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    applied.push(version);
  }
  return { ok: true, applied };
}
