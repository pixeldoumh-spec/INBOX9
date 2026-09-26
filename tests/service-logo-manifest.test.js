import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const manifest=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoManifest.ts'),'utf8');
const spriteModule=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoSprite.ts'),'utf8');
const prepareScript=fs.readFileSync(path.join(root,'frontend/scripts/prepare-service-logo-sprite.mjs'),'utf8');

test('preprocessed service logo pack is build-time local and not runtime canvas work',()=>{
  assert.match(spriteModule,/SERVICE_LOGO_SPRITE_PATH/);
  assert.match(spriteModule,/service-icons-sprite\.webp/);
  assert.match(prepareScript,/service-icons-sprite\.webp/);
  assert.match(prepareScript,/const base64 = '[A-Za-z0-9+/=]+'/);
  const match=prepareScript.match(/const base64 = '([A-Za-z0-9+/=]+)'/);
  assert.ok(match,'embedded prepared sprite payload missing');
  const bytes=Buffer.from(match[1],'base64');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.length,18138);
  assert.doesNotMatch(spriteModule,/data:image\/webp;base64/);
  assert.doesNotMatch(shared,/cropServiceLogo|detectSafeCrop|getImageData|toBlob|createObjectURL/);
});

test('service logo manifest covers all 90 customer services with stable unique sprite indices',()=>{
  const matches=[...manifest.matchAll(/"([^"]+)":\s*\{\s*"spriteIndex":\s*(\d+)\s*\}/g)];
  assert.equal(matches.length,90);
  const ids=matches.map(m=>m[1]);
  const indices=matches.map(m=>Number(m[2]));
  assert.equal(new Set(ids).size,90);
  assert.equal(new Set(indices).size,90);
  assert.deepEqual([...indices].sort((a,b)=>a-b),Array.from({length:90},(_,i)=>i));
  assert.match(manifest,/"svc-game-rummy": \{ "spriteIndex": 71 \}/);
  assert.match(manifest,/"svc-yono-games": \{ "spriteIndex": 80 \}/);
});

test('ServiceLogo uses direct prepared sprite tiles',()=>{
  assert.doesNotMatch(shared,/const logoMask/);
  assert.doesNotMatch(shared,/<ServiceLogo[^>]*position=/);
  assert.match(shared,/SERVICE_LOGO_MANIFEST/);
  assert.match(shared,/data-logo-source=\{has\?'sprite-tile':'fallback'\}/);
  assert.match(shared,/backgroundImage: 'url\(''\+path\+'\)'/);
  assert.doesNotMatch(shared,/cropServiceLogo|detectSafeCrop|getImageData|toBlob|createObjectURL/);
});
