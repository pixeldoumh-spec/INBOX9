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
  assert.match(app,/size==='lg'\?104:size==='sm'\?52:72/);
});
