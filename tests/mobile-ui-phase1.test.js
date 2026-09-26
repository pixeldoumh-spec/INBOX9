import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const css=fs.readFileSync(path.join(root,'frontend/src/styles/globals.css'),'utf8');
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');

test('phase 1 establishes a constrained mobile app shell',()=>{
  assert.match(css,/\.app-shell\s*\{[\s\S]*?max-width:\s*720px/);
  assert.match(css,/\.top-header\s*\{[\s\S]*?height:\s*78px/);
  assert.match(css,/\.catalog-apps\s+\.catalog-heading\s*\{\s*display:\s*none/);
  assert.match(css,/\.catalog-apps\s+\.search-field\s*\{[\s\S]*?min-height:\s*62px/);
  assert.match(css,/\.bottom-nav\s*\{[\s\S]*?min-height:\s*72px/);
});

test('phase 1 launcher keeps the four-column mobile contract',()=>{
  assert.match(css,/\.service-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)/);
  assert.match(app, /\{categories\.length>1\?<div className="category-scroll"/);
});

test('phase 4 logo implementation is covered by the dedicated logo regression suite',()=>{
  assert.doesNotMatch(app,/const logoMask/);
  assert.match(app,/from '\.\/customer-ui-shared'/);
});


test('customer wallet and recharge surfaces cannot fall back to the legacy light theme',()=>{
  assert.match(css,/Phase 10.1 — authoritative customer wallet/recharge theme/);
  for (const selector of [
    '.app-shell \.wallet-overview',
    '.app-shell \.wallet-recharge-shell \.recharge-card',
    '.app-shell \.wallet-help-card',
    '.app-shell \.wallet-amount-panel',
    '.app-shell \.wallet-qr-panel',
    '.app-shell \.wallet-payment-destination',
    '.app-shell \.payment-paid-button',
    '.app-shell \.wallet-recharge-form \.field input',
    '.app-shell \.wallet-recharge-row',
    '.app-shell \.wallet-detail-card',
    '.app-shell \.wallet-detail-grid > div',
    '.app-shell \.wallet-activity-row'
  ]) assert.match(css,new RegExp(selector+'\\s*\\{[\\s\\S]*?background:\\s*(?:var\\(--i9-surface|var\\(--i9-surface-subtle|#0d110d|rgb\\()'));
  assert.match(css,/.app-shell .wallet-payment-qrs*{[sS]*?background:s*#fffs*!important/);
});
