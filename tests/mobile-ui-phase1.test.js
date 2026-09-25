import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const css=fs.readFileSync(path.join(root,'frontend/src/styles/globals.css'),'utf8');
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');

test('phase 1 establishes a constrained mobile app shell',()=>{
  assert.match(css,/\.app-shell\{[\s\S]*?max-width:720px/);
  assert.match(css,/\.top-header\{[\s\S]*?height:78px/);
  assert.match(css,/\.catalog-apps \.catalog-heading\{display:none\}/);
  assert.match(css,/\.catalog-apps \.search-field\{[\s\S]*?min-height:62px/);
  assert.match(css,/\.bottom-nav\{[\s\S]*?min-height:70px/);
});

test('phase 1 uses a four-column launcher and avoids redundant single-category controls',()=>{
  assert.match(css,/\.service-grid\{[\s\S]*?grid-template-columns: repeat\(4,minmax\(0,1fr\)/);
  assert.match(app,/categories\.length>1\?<div className="category-scroll"/);
  assert.match(app,/size==='lg'\?104:size==='sm'\?52:72/);
});
