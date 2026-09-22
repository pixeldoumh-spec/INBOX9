import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('TASK-003 dialog accessibility contracts are present', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /function focusableInDialog\(/);
  assert.match(app, /function focusActiveDialog\(/);
  assert.match(app, /event\.key === 'Tab'/);
  assert.match(app, /restoreDialogFocus/);
  assert.match(app, /aria-modal="true"/);
});

test('TASK-003 overlay lock and purchase return state are present', async () => {
  const [app, css] = await Promise.all([
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(app, /returnAfterWallet/);
  assert.match(app, /data-return-purchase/);
  assert.match(css, /html\.overlay-open,body\.overlay-open/);
  assert.match(app, /state\.page === 'buy' && \['review', 'activation'\]/);
  assert.match(app, /function renderBuyCatalog\(\)[\s\S]*?syncOverlayScrollLock\(\)/);
});

test('TASK-003 polling is bounded and non-overlapping', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /activationSyncInFlight/);
  assert.match(app, /Promise\.all\(batch\.map/);
  assert.doesNotMatch(app, /for \(const item of current\) \{/);
  assert.match(app, /window\.matchMedia\('\(pointer: fine\)'\)/);
});

test('TASK-003 mobile order cards and auth short-height rules are present', async () => {
  const [app, css] = await Promise.all([
    fs.readFile(new URL('../app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(app, /class="orders-table"/);
  assert.match(css, /\.orders-table\s*\{min-width:0\}/);
  assert.match(css, /content:attr\(data-label\)/);
  assert.match(css, /max-height:600px/);
});

test('TASK-003 application bootstrap is installed exactly once', async () => {
  const app = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.equal((app.match(/^boot\(\);$/gm) || []).length, 1);
});
