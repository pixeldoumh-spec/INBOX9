import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const activity=fs.readFileSync(path.join(root,'frontend/src/app/customer-activity-pages.tsx'),'utf8');
const account=fs.readFileSync(path.join(root,'frontend/src/app/customer-account-pages.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');
const index=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');

test('phase 4 route-level code splitting isolates customer account and activation surfaces',()=>{
  assert.match(app,/const ActivePage = lazy\(\(\)=>import\('\.\/customer-activity-pages'\)/);
  assert.match(app,/const WalletPage = lazy\(\(\)=>import\('\.\/customer-account-pages'\)/);
  assert.match(app,/Suspense fallback=\{/);
  for(const fn of ['ActivePage','ActivationPage','WalletPage','NotificationsPage','SupportPage','SupportThreadPage','AccountPage']){
    assert.doesNotMatch(app,new RegExp('function '+fn+'\\('));
  }
  assert.match(activity,/export \{ ActivePage, ActivationPage \}/);
  assert.match(account,/export \{ WalletPage, NotificationsPage, SupportPage, SupportThreadPage, AccountPage \}/);
});

test('phase 4 keeps admin implementations out of customer chunks',()=>{
  assert.doesNotMatch(account,/\.\/admin-payments/);
  assert.doesNotMatch(account,/AdminRecharge|AdminPaymentsPage|reviewAdminRecharge|getAdminRecharges/);
  assert.match(app,/AdminPaymentsPage/);
  assert.match(app,/path:'\/admin'/);
});

test('phase 4 logo pipeline caches duplicate work and uses object URLs',()=>{
  assert.match(shared,/serviceLogoCropPromiseCache/);
  assert.match(shared,/serviceLogoCropPromiseCache\.set\(index,job\)/);
  assert.match(shared,/URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(shared,/output\.toDataURL\('image\/png'\)/);
  assert.match(shared,/decoding="async"/);
});

test('phase 4 customer polish adds containment and restrained motion',()=>{
  assert.match(css,/content-visibility:\s*auto/);
  assert.match(css,/contain-intrinsic-size:\s*900px/);
  assert.match(css,/--i9-motion-fast:\s*120ms/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/hover:\s*none/);
  assert.match(css,/\.app-shell \.top-header,/);
  assert.match(css,/\.app-shell \.empty-state/);
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});

test('phase 4 browser chrome follows the Radium dark surface',()=>{
  assert.match(index,/name="theme-color" content="#080a08"/);
});
