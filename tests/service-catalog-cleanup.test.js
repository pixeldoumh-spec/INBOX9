import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dbMigration = fs.readFileSync(
  path.join(root, 'db/migrations/040_remove_unused_inactive_service_routes.sql'),
  'utf8',
);
const supabaseMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260926102000_remove_unused_inactive_service_routes.sql'),
  'utf8',
);

test('service catalog cleanup only removes inactive provider routes', () => {
  for (const migration of [dbMigration, supabaseMigration]) {
    assert.match(migration, /DELETE FROM public\.service_provider_routes/);
    assert.match(migration, /r\.active = FALSE/);
    assert.match(migration, /s\.active = FALSE/);
    assert.doesNotMatch(migration, /DELETE FROM public\.services/);
    assert.match(migration, /040_remove_unused_inactive_service_routes/);
  }
});
