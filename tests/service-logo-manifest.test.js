import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const manifest=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoManifest.ts'),'utf8');
const spriteModule=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoSprite.ts'),'utf8');
const prepareScript=fs.readFileSync(path.join(root,'frontend/scripts/prepare-service-logo-sprite.mjs'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('ZIP sprite is built from the supplied icon pack and not processed at runtime',()=>{
  assert.match(spriteModule,/SERVICE_LOGO_SPRITE_PATH/);
  assert.match(prepareScript,/service-icons-sprite\.webp/);
  assert.equal([...prepareScript.matchAll(/import p\d+ from '\.\/service-logo-sprite-parts\/part-\d{2}\.mjs';/g)].length,16);
  assert.match(prepareScript,/bytes\.length !== 353142/);
  assert.doesNotMatch(spriteModule,/data:image\/webp;base64/);
  assert.doesNotMatch(shared,/cropServiceLogo|detectSafeCrop|getImageData|toBlob|createObjectURL/);
});

test('ZIP manifest contains exactly 71 supplied icon mappings',()=>{
  const matches=[...manifest.matchAll(/'([^']+)':\s*\{\s*spriteIndex:\s*(\d+)\s*\}/g)];
  assert.equal(matches.length,71);
  assert.equal(new Set(matches.map(m=>m[1])).size,71);
  assert.equal(new Set(matches.map(m=>Number(m[2]))).size,71);
  assert.deepEqual(matches.map(m=>Number(m[2])).sort((a,b)=>a-b),Array.from({length:71},(_,i)=>i));
  assert.match(manifest,/tileSize: 128/);
  assert.match(manifest,/columns: 9/);
  assert.match(manifest,/rows: 10/);
});

test('missing service icons render as black blanks',()=>{
  assert.match(shared,/data-logo-source=\{has\?'zip-sprite':'blank'\}/);
  assert.match(shared,/service-logo-blank-art/);
  assert.doesNotMatch(shared,/service-logo-fallback-content|const initials/);
  assert.match(css,/service-logo-blank-art/);
  assert.match(css,/background:\s*#000/);
});

test('Apps page sorts supplied-icon services before missing-icon services',()=>{
  assert.match(app,/import \{ SERVICE_LOGO_MANIFEST \} from '\.\/serviceLogoManifest';/);
  assert.match(app,/filtered\.sort\(\(a,b\)=>Number\(Boolean\(SERVICE_LOGO_MANIFEST\[b\.id\]\)\)-Number\(Boolean\(SERVICE_LOGO_MANIFEST\[a\.id\]\)\)\)/);
});
