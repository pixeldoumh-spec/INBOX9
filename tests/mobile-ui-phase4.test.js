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

test('phase 4 lazy-loads customer activation and account surfaces',()=>{
  assert.match(app,/const ActivePage = lazy\(\(\)=>import\('\.\/customer-activity-pages'\)/);
  assert.match(app,/const WalletPage = lazy\(\(\)=>import\('\.\/customer-account-pages'\)/);
  assert.match(app,/Suspense fallback=\{/);
  for(const fn of ['ActivePage','ActivationPage','WalletPage','NotificationsPage','SupportPage','SupportThreadPage','AccountPage']){
    assert.doesNotMatch(app,new RegExp('function '+fn+'\\('));
  }
  assert.match(activity,/export \{ ActivePage, ActivationPage \}/);
  assert.match(account,/export \{ WalletPage, NotificationsPage, SupportPage, SupportThreadPage, AccountPage \}/);
});

test('phase 4 preserves admin implementations outside customer chunks',()=>{
  assert.match(app,/AdminPaymentsPage/);
  assert.match(app,/AdminSystemHealthPage/);
  assert.match(app,/path:'\/admin'/);
  assert.doesNotMatch(account,/admin-payments|AdminPaymentsPage|AdminRecharge|reviewAdminRecharge|getAdminRecharges/);
});

test('phase 4 logo rendering uses direct prepared sprite tiles with no runtime crop work',()=>{
  assert.match(shared,/backgroundPosition/);
  assert.match(shared,/backgroundImage: 'url\('\+path\+'\)'/);
  assert.match(shared,/backgroundSize: \(columns\*100\)\+'% '\+\(rows\*100\)\+'%'/);
  assert.doesNotMatch(shared,/output\.toDataURL\('image\/png'\)/);
  assert.doesNotMatch(shared,/getImageData|toBlob|createObjectURL|cropServiceLogo|detectSafeCrop/);
});

test('phase 4 customer motion and offscreen containment are scoped to customer/auth UI',()=>{
  assert.match(css,/--i9-motion-fast:\s*120ms/);
  assert.match(css,/content-visibility:\s*auto/);
  assert.match(css,/contain-intrinsic-size:\s*900px/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/hover:\s*none/);
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});

test('phase 4 browser chrome uses the Radium dark theme',()=>{
  assert.match(index,/name="theme-color" content="#080a08"/);
});
