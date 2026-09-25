import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('customer shell matches the recorded mobile marketplace structure', async () => {
  const [boot, app] = await Promise.all([read('boot.js'), read('app.js')]);
  assert.match(boot, /inbox9-mobile-header/);
  assert.match(boot, /inbox9-mobile-search/);
  assert.match(boot, /inbox9-mobile-search-input/);
  assert.match(boot, /inbox9-bottom-nav/);
  assert.match(boot, /\[\['apps','Apps'/);
  assert.match(boot, /\['buy','Buy'/);
  assert.match(boot, /\['active','Active'/);
  assert.match(boot, /\['account','Account'/);
  assert.match(boot, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(boot, /marketplace-service-logo/);
  assert.match(app, /data-select-service/);
  assert.match(app, /Number details/);
  assert.match(app, /inbox9-service-detail-sheet/);
  assert.match(boot, /Search services\.\.\./);
  assert.match(app, /SERVICE_LOGO_GLYPHS/);
  assert.match(app, /serviceLogoGlyph\(service, initials\)/);
  assert.match(app, /Get number/);
  assert.doesNotMatch(app, /google\.com\/s2\/favicons/);
  assert.doesNotMatch(app, /onerror=/);
});
