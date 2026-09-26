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
