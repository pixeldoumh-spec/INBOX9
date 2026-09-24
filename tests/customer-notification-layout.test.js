import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('customer topbar keeps notification control at far right', async () => {
  const [app, css] = await Promise.all([
    fs.readFile(path.join(root, 'app.js'), 'utf8'),
    fs.readFile(path.join(root, 'styles.css'), 'utf8')
  ]);

  const topActions = '<div class="top-actions"><button class="wallet-chip"';
  const topbarIndex = app.indexOf(topActions);
  assert.notEqual(topbarIndex, -1);
  const tail = app.slice(topbarIndex, topbarIndex + 1200);
  const walletIndex = tail.indexOf('wallet-chip');
  const liveIndex = tail.indexOf('topbar-live-status');
  const notificationIndex = tail.indexOf('${notificationPanel()}');
  assert.ok(walletIndex < liveIndex, 'wallet should precede live status');
  assert.ok(liveIndex < notificationIndex, 'notification should be the final topbar control');
  assert.match(app, /notification-status-light/);
  assert.match(app, /notification-badge/);
  assert.match(css, /\.top-actions>\.notification-wrap\{order:3\}/);
  assert.match(css, /\.top-actions \.notification\{display:none\}/);
  assert.match(css, /\.top-actions>\.notification-wrap\{order:3;display:flex\}/);
});