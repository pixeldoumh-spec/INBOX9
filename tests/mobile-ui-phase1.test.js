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

test('phase 1 uses a four-column launcher and avoids redundant single-category controls',()=>{
  assert.match(css,/\.service-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)/);
  assert.match(app,/\{categories\.length>1\?<div className="category-scroll"/);
  assert.match(app,/const d=72/);
});

test('phase 2 keeps launcher tiles inside narrow mobile columns',()=>{
  assert.match(css,/\.catalog-apps \.service-logo-md\s*\{[\s\S]*?width:min\(72px,100%\)\s*!important/);
  assert.match(css,/\.catalog-apps \.service-logo-md\s*\{[\s\S]*?height:auto\s*!important/);
  assert.match(css,/@media \(max-width:380px\)\{[\s\S]*?\.catalog-apps \.service-logo-md\s*\{[\s\S]*?width:min\(64px,100%\)\s*!important/);
});

test('phase 2.1 normalizes the shared logo frame and bottom-nav optical icon sizing',()=>{
  assert.match(app,/className="service-logo-art"/);
  assert.match(app,/cropServiceLogo/);
  assert.match(app,/backgroundSize:\`\$\{columns\*inner\}px \$\{rows\*inner\}px\`/);
  assert.match(css,/\.service-logo\s*\{[\s\S]*?position:relative/);
  assert.match(css,/\.service-logo-art\s*\{[\s\S]*?inset:1px/);
  assert.match(css,/\.bottom-nav-item > svg\s*\{[\s\S]*?width:21px;\s*height:21px/);
  assert.match(css,/\.bottom-nav-item:nth-child\(2\) > svg,.bottom-nav-item:nth-child\(4\) > svg\s*\{[\s\S]*?scale\(1\.08\)/);
});

test('phase 2.2 uses one service-logo size across customer surfaces',()=>{
  assert.match(app,/const d=72/);
  assert.match(css,/\.service-logo-sm,\.service-logo-md,\.service-logo-lg\s*\{[\s\S]*?width:72px !important;\s*height:72px !important/);
  assert.match(css,/@media \(max-width:380px\)[\s\S]*?\.catalog-apps \.service-logo-md,[\s\S]*?\.catalog-apps \.service-logo-sm,[\s\S]*?\.catalog-apps \.service-logo-lg[\s\S]*?width:64px !important;[\s\S]*?height:64px !important/);
});


test('phase 2.4 crops logo artwork to visible bounds then contains the full image',()=>{
  assert.match(app,/cropServiceLogo/);
  assert.match(app,/output\.toDataURL\('image\/png'\)/);
  assert.match(app,/data-logo-source=\{src\?'cropped-sprite'/);
  assert.match(css,/\.service-logo-art img\s*\{[\s\S]*?object-fit:contain/);
});
