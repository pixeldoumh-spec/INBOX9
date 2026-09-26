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
const partsDir=path.join(root,'frontend/assets/service-logo-sprite');

test('preprocessed service logo pack is build-time local and not runtime canvas work',()=>{
  assert.match(spriteModule,/SERVICE_LOGO_SPRITE_PATH/);
  assert.match(spriteModule,/service-icons-sprite\\.webp/);
  assert.match(prepareScript,/service-icons-sprite\\.webp/);
  const parts=fs.readdirSync(partsDir).filter((name)=>/^part-\\d{2}\\.txt$/.test(name)).sort();
  assert.equal(parts.length,7);
  const base64=parts.map((name)=>fs.readFileSync(path.join(partsDir,name),'utf8')).join('').replace(/\\s+/g,'');
  const bytes=Buffer.from(base64,'base64');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.length,18138);
  assert.doesNotMatch(spriteModule,/data:image\/webp;base64/);
  assert.doesNotMatch(shared,/cropServiceLogo|detectSafeCrop|getImageData|toBlob|createObjectURL/);
});

test('service logo manifest covers all 90 customer services with stable unique sprite indices',()=>{
  const matches=[...manifest.matchAll(/"([^\"]+)":\\s*\\{\\s*"spriteIndex":\\s*(\\d+)\\s*\\}/g)];
  assert.equal(matches.length,90);
  const ids=matches.map(m=>m[1]);
  const indices=matches.map(m=>Number(m[2]));
  assert.equal(new Set(ids).size,90);
  assert.equal(new Set(indices).size,90);
  assert.deepEqual([...indices].sort((a,b)=>a-b),Array.from({length:90},(_,i)=>i));
  assert.match(manifest,/"svc-game-rummy": \{ "spriteIndex": 71 \}/);
  assert.match(manifest,/"svc-yono-games": \{ "spriteIndex": 80 \}/);
});

test('ServiceLogo uses the stable manifest and direct prepared sprite tiles',()=>{
  assert.doesNotMatch(shared,/const logoMask/);
  assert.doesNotMatch(shared,/<ServiceLogo[^>]*position=/);
  assert.match(shared,/SERVICE_LOGO_MANIFEST/);
  assert.match(shared,/data-logo-source=\\{has\\?'sprite-tile':'fallback'\\}/);
  assert.match(shared,/backgroundImage: 'url\\('\\+path\\+'\\)'/);
  assert.doesNotMatch(shared,/cropServiceLogo|detectSafeCrop|getImageData|toBlob|createObjectURL/);
});
