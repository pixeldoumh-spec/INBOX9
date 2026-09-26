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
  assert.match(source, /const all=Array\.isArray\(q\.data\?\.services\)\?q\.data\.services:\[\];/);
});

test('admin service console guards service selection against malformed catalog payloads', async () => {
  const source = await fs.readFile(new URL('../frontend/src/features/admin/AdminServices.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /services\.data\?\.services\.find\(/);
  assert.match(source, /Array\.isArray\(services\.data\?\.services\)/);
});

test('app router defines explicit runtime error handlers', async () => {
  const source = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /class AppErrorBoundary extends Component/);
  assert.match(source, /function RouteErrorScreen\(\)/);
  assert.match(source, /errorElement:<RouteErrorScreen\/>/);
  assert.match(source, /<AppErrorBoundary>/);
  assert.match(source, /Reload INBOX9/);
});
