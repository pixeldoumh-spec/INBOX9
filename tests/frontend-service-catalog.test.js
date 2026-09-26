import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

const file = new URL('../frontend/src/api/services.ts', import.meta.url);

test('service catalog client normalizes services into an array', async () => {
  const source = await fs.readFile(file, 'utf8');

  assert.match(source, /function normalizeCatalog\(payload: unknown\)/);
  assert.match(source, /if \(Array\.isArray\(raw\)\)/);
  assert.match(source, /rows = Object\.values\(raw\)/);
  assert.match(source, /const services = rows\.filter\(isService\)/);
  assert.match(source, /return normalizeCatalog\(payload\)/);
  assert.doesNotMatch(source, /apiRequest<ServiceCatalogResponse>\('\/api\/services'\)/);
});

test('service purchase code cannot call find directly on an unchecked catalog payload', async () => {
  const source = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /services\.data\?\.services\.find\(/);
  assert.match(source, /const all=q\.data\?\.services\?\?\[\]/);
});
