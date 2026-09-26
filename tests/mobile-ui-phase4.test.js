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

test('phase 4 code-splits customer account and activation surfaces',()=>{
  assert.match(app,/lazy\(\(\)=>import\('\.\/customer-activity-pages'\)/);
  assert.match(app,/lazy\(\(\)=>import\('\.\/customer-account-pages'\)/);
  assert.match(app,/Suspense fallback=\{/);
  assert.doesNotMatch(app,/function ActivePage\(\)/);
  assert.doesNotMatch(app,/function WalletPage\(\)/);
  assert.doesNotMatch(app,/function NotificationsPage\(\)/);
  assert.doesNotMatch(app,/function SupportPage\(\)/);
  assert.doesNotMatch(app,/function AccountPage\(\)/);
  assert.match(activity,/export \{ ActivePage, ActivationPage \}/);
  assert.match(account,/export \{ WalletPage, NotificationsPage, SupportPage, SupportThreadPage, AccountPage \}/);
});

test('phase 4 logo pipeline deduplicates work and avoids base64 data URLs',()=>{
  assert.match(shared,/serviceLogoCropPromiseCache/);
  assert.match(shared,/serviceLogoCropPromiseCache\.set\(index,job\)/);
  assert.match(shared,/URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(shared,/output\.toDataURL\('image\/png'\)/);
  assert.match(shared,/decoding="async"/);
});

test('phase 4 customer polish adds restrained motion and offscreen containment',()=>{
  assert.match(css,/--i9-motion-fast:\s*120ms/);
  assert.match(css,/content-visibility:\s*auto/);
  assert.match(css,/contain-intrinsic-size:\s*900px/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/hover:\s*none/);
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});

test('phase 4 customer browser chrome uses Radium dark metadata',()=>{
  assert.match(index,/name="theme-color" content="#080a08"/);
});

test('phase 4 preserves canonical customer architecture boundaries',()=>{
  assert.match(app,/from '\.\/customer-ui-shared'/);
  assert.match(app,/AdminDashboardPage/);
  assert.match(app,/path:'\/admin'/);
});
