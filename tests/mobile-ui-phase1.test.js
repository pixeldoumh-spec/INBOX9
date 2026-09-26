import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const css=fs.readFileSync(path.join(root,'frontend/src/styles/globals.css'),'utf8');
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');

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
  assert.match(shared,/const d=72/);
});

test('phase 2 keeps launcher tiles inside narrow mobile columns',()=>{
  assert.match(css,/\.service-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)/);
  assert.match(css,/\.service-tile\s*\{[\s\S]*?min-width:0/);
  assert.match(css,/\.service-logo\s*\{[\s\S]*?width:72px !important/);
});
test('phase 2.1 normalizes the shared logo frame and bottom-nav icon sizing',()=>{
  assert.match(shared,/className="service-logo-art"/);
  assert.match(shared,/cropServiceLogo/);
  assert.match(app,/data-logo-source=\{src\?'cropped-sprite'/);
  assert.match(css,/\.service-logo\s*\{[\s\S]*?position:relative/);
  assert.match(css,/\.service-logo-art\s*\{[\s\S]*?inset:1px/);
  assert.match(css,/\.bottom-nav-icon\s*\{[\s\S]*?width:24px/);
});

test('phase 2.2 uses one canonical service-logo size across customer surfaces',()=>{
  assert.match(shared,/function ServiceLogo\(\{serviceId,name\}/);
  assert.doesNotMatch(app,/size="sm"/);
  assert.doesNotMatch(app,/size="lg"/);
  assert.match(css,/\.service-logo\s*\{[\s\S]*?width:72px !important;[\s\S]*?height:72px !important/);
  assert.match(css,/\.service-logo-art img\s*\{[\s\S]*?object-fit:contain/);
});

test('phase 2.4 crops logo artwork to visible bounds then contains the full image',()=>{
  assert.match(app,/cropServiceLogo/);
  assert.match(shared,/URL\.createObjectURL\(blob\)/);
  assert.match(app,/data-logo-source=\{src\?'cropped-sprite'/);
  assert.match(css,/\.service-logo-art img\s*\{[\s\S]*?object-fit:contain/);
});


test('phase 2.6 uses one canonical logo frame and matched bottom navigation icon geometry',()=>{
  assert.match(app,/function ServiceLogo\(\{serviceId,name\}/);
  assert.doesNotMatch(app,/size="sm"/);
  assert.doesNotMatch(app,/size="lg"/);
  assert.match(css,/\.service-logo\s*\{[\s\S]*?width:72px !important;[\s\S]*?height:72px !important/);
  assert.match(css,/\.service-logo-art img\s*\{[\s\S]*?object-fit:contain/);
  assert.match(app,/className="bottom-nav-icon"/);
  assert.match(css,/\.bottom-nav-icon\s*\{[\s\S]*?width:24px/);
  assert.doesNotMatch(css,/bottom-nav-item:nth-child\(2\)[^}]*scale\(/);
  assert.doesNotMatch(css,/bottom-nav-item:nth-child\(4\)[^}]*scale\(/);
});
