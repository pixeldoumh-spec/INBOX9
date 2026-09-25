import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const manifest=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoManifest.ts'),'utf8');
const spritePath=path.join(root,'frontend/public/service-icons-sprite.webp');

function readSpriteDimensions(file){
  const b=fs.readFileSync(file);
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
  assert.equal(b.toString('ascii',12,16),'VP8X');
  const width=1+(b[24]|(b[25]<<8)|(b[26]<<16));
  const height=1+(b[27]|(b[28]<<8)|(b[29]<<16));
  return {width,height};
}

test('service logo sprite has the expected 48px tile grid',()=>{
  assert.equal(fs.existsSync(spritePath),true);
  assert.deepEqual(readSpriteDimensions(spritePath),{width:576,height:864});
});

test('service logo manifest uses stable service IDs with unique sprite tiles',()=>{
  assert.match(manifest,/SERVICE_LOGO_SPRITE/);
  assert.match(manifest,/SERVICE_LOGO_MANIFEST/);
  const matches=[...manifest.matchAll(/"([^"]+)":\s*\{\s*"spriteIndex":\s*(\d+)\s*\}/g)];
  assert.equal(matches.length,155);
  const ids=matches.map(m=>m[1]);
  const indices=matches.map(m=>Number(m[2]));
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(indices).size,indices.length);
  for(const id of ids) assert.match(id,/^svc-[a-z0-9-]+$/);
  for(const index of indices) assert.ok(index>=0&&index<216);
});

test('ServiceLogo no longer depends on the legacy positional mask',()=>{
  assert.doesNotMatch(app,/const logoMask/);
  assert.doesNotMatch(app,/<ServiceLogo[^>]*position=/);
  assert.match(app,/SERVICE_LOGO_MANIFEST/);
  assert.match(app,/data-logo-source=/);
});
