import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');

test('every runtime migration records itself in schema_migrations', async () => {
  const files = (await fs.readdir(migrationsDir)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  assert.ok(files.length >= 28, 'expected the current production migration tree');
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    assert.match(sql, /INSERT\s+INTO\s+(?:public\.)?schema_migrations\s*\(version\)/i, file + ' is missing its schema_migrations INSERT');
    assert.ok(sql.includes("VALUES ('" + version + "')") || sql.includes('VALUES (\'' + version + '\')'), file + ' is missing a marker for ' + version);
  }
});