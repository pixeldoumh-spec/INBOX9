import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('shared customer service icon uses one enhanced Android-style frame everywhere',()=>{
  assert.match(shared,/className="service-logo-aura"/);
  assert.match(shared,/className="service-logo-frame"/);
  assert.match(shared,/className="service-logo-sheen"/);
  assert.match(shared,/data-service-id={serviceId}/);
  assert.match(shared,/SERVICE_LOGO_MANIFEST/);
  assert.match(shared,/SERVICE_LOGO_MANIFEST\[serviceId\]/);
  assert.doesNotMatch(shared,/service-logo-sprite-canvas/);
  assert.match(shared,/backgroundSize/);
  assert.match(shared,/column\/Math\.max\(columns-1,1\)/);
  assert.match(shared,/row\/Math\.max\(rows-1,1\)/);
  assert.doesNotMatch(shared,/getImageData|toBlob|createObjectURL|cropServiceLogo|detectSafeCrop/);
});

test('customer service icon polish preserves normalized 72px base geometry and scales only on mobile',()=>{
  assert.match(css,/\.app-shell \.service-logo\s*\{[\s\S]*?width: 72px !important;[\s\S]*?height: 72px !important/);
  assert.match(css,/\.app-shell \.service-logo-frame\s*\{[\s\S]*?border-radius: 18px/);
  assert.match(css,/\.app-shell \.service-logo-sheen\s*\{[\s\S]*?height: 34%/);
  assert.match(css,/@media \(max-width: 720px\)[\s\S]*?\.app-shell \.service-logo\s*\{[\s\S]*?width: 74px !important/);
});

test('customer Apps launcher gets a layered icon-grid backdrop and remains four columns',()=>{
  assert.match(css,/\.app-shell \.catalog-apps::before\s*\{[\s\S]*?radial-gradient\(/);
  assert.match(css,/\.app-shell \.catalog-apps::after\s*\{[\s\S]*?background-size: 22px 22px/);
  assert.match(css,/\.app-shell \.catalog-apps \.service-grid\s*\{[\s\S]*?border-radius: 28px[\s\S]*?background:/);
  assert.match(css,/\.app-shell \.service-tile,[\s\S]*?background: transparent/);
  assert.match(css,/\.app-shell \.service-tile:hover \.service-logo,[\s\S]*?rgb\(182 255 59 \/ 30%\)/);
});

test('service icon treatment is customer-only and does not add admin selectors',()=>{
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});
