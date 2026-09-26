import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('customer notifications summary uses Radium surfaces with readable text',()=>{
  assert.match(css,/\.app-shell \.notification-summary > div\s*\{[\s\S]*?background:\s*var\(--i9-surface\)/);
  assert.match(css,/\.app-shell \.notification-summary strong\s*\{[\s\S]*?color:\s*var\(--i9-text\)/);
  assert.match(css,/\.app-shell \.notification-summary small\s*\{[\s\S]*?color:\s*var\(--i9-text-subtle\)/);
});

test('customer manual-wallet controls keep text readable on dark surfaces',()=>{
  assert.match(css,/\.app-shell \.wallet-payment-destination\s*\{[\s\S]*?background:\s*#0f140f/);
  assert.match(css,/\.app-shell \.copy-button\s*\{[\s\S]*?color:\s*var\(--i9-text-muted\)/);
  assert.match(css,/\.app-shell \.money-input\s*\{[\s\S]*?background:\s*#0b0f0b/);
  assert.match(css,/\.app-shell \.money-input input\s*\{[\s\S]*?color:\s*var\(--i9-text\) !important/);
  assert.match(css,/\.app-shell \.payment-paid-button\s*\{[\s\S]*?background:\s*#0f140f/);
  assert.doesNotMatch(css,/^\.notification-summary > div\s*\{[\s\S]*?background:\s*#fff/m);
});

test('contrast repairs remain customer-scoped and do not add admin selectors',()=>{
  assert.doesNotMatch(css,/\.admin-[A-Za-z0-9_-]+/);
  assert.match(css,/\.app-shell \.wallet-help-card/);
});
