import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('shared customer service icon renders the supplied sprite cell directly and centers it by exact cell coordinates',()=>{
  assert.match(shared,/data-service-id={serviceId}/);
  assert.match(shared,/SERVICE_LOGO_MANIFEST\[serviceId\]/);
  assert.match(shared,/data-logo-source={has\?'zip-sprite':'blank'}/);
  assert.doesNotMatch(shared,/service-logo-frame|service-logo-sprite-canvas/);
  assert.match(shared,/backgroundImage: 'url\('\+path\+'\)'/);
  assert.match(shared,/backgroundSize/);
  assert.match(shared,/backgroundPosition/);
  assert.match(shared,/Math\.max\(columns-1,1\)/);
  assert.match(shared,/Math\.max\(rows-1,1\)/);
  assert.doesNotMatch(shared,/getImageData|toBlob|createObjectURL|cropServiceLogo|detectSafeCrop/);
});

test('customer icon is full-bleed: no padding or nested frame can offset the supplied logo',()=>{
  assert.match(css,/\.app-shell \.service-logo\s*\{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden/);
  assert.match(css,/\.app-shell \.service-logo-art\s*\{[\s\S]*?inset: 0;[\s\S]*?background-repeat: no-repeat/);
  assert.doesNotMatch(css,/\.service-logo-frame/);
});

test('customer icon geometry remains fixed four-column and responsive',()=>{
  assert.match(css,/\.app-shell \.catalog-apps \.service-grid\s*\{[\s\S]*?border-radius: 28px/);
  assert.match(css,/@media \(max-width: 720px\)[\s\S]*?\.app-shell \.service-logo\s*\{[\s\S]*?width: 74px !important/);
  assert.match(css,/@media \(max-width: 380px\)[\s\S]*?\.app-shell \.service-logo\s*\{[\s\S]*?width: 70px !important/);
});

test('service icon treatment is customer-only and does not add admin selectors',()=>{
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});
