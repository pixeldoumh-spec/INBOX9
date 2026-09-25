import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const manifest=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoManifest.ts'),'utf8');
const spriteModule=fs.readFileSync(path.join(root,'frontend/src/app/serviceLogoSprite.ts'),'utf8');
const legacySpritePath=path.join(root,'frontend/public/service-icons-sprite.webp');

function readEmbeddedSprite(){
  const match=spriteModule.match(/base64,([A-Za-z0-9+/=]+)'/);
  assert.ok(match,'embedded sprite data URI missing');
  const b=Buffer.from(match[1],'base64');
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
  const chunkType=b.toString('ascii',12,16);
  assert.ok(chunkType==='VP8X'||chunkType==='VP8 ');
  const width=chunkType==='VP8X'
    ? 1+(b[24]|(b[25]<<8)|(b[26]<<16))
    : (b[26]|(b[27]<<8)) & 0x3fff;
  const height=chunkType==='VP8X'
    ? 1+(b[27]|(b[28]<<8)|(b[29]<<16))
    : (b[28]|(b[29]<<8)) & 0x3fff;
  return {width,height};
}

test('HD service logo sprite is embedded with the expected tile grid',()=>{
  assert.equal(fs.existsSync(legacySpritePath),false);
  assert.deepEqual(readEmbeddedSprite(),{width:1152,height:864});
  assert.match(manifest,/SERVICE_LOGO_SPRITE_DATA_URL/);
  assert.match(manifest,/tileSize: 96/);
  assert.match(manifest,/columns": 12/);
  assert.match(manifest,/rows": 9/);
});

test('service logo manifest uses stable unique service IDs and sprite tiles',()=>{
  const matches=[...manifest.matchAll(/"([^"]+)":\s*\{\s*"spriteIndex":\s*(\d+)\s*\}/g)];
  assert.equal(matches.length,108);
  const ids=matches.map(m=>m[1]);
  const indices=matches.map(m=>Number(m[2]));
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(indices).size,indices.length);
  for(const id of ids) assert.match(id,/^svc-[a-z0-9-]+$/);
  for(const index of indices) assert.ok(index>=0&&index<108);
  for(const removed of [
    'svc-yono-bonus-51','svc-all-yono-games','svc-yono-all-games','svc-rani-slots','svc-yono-app',
    'svc-new-yono-app','svc-yono-game','svc-all-rummy-apps','svc-all-yono-slots','svc-yono-arcade',
    'svc-download-rummy-365','svc-koko-slots','svc-download-yono-rummy'
  ]) assert.doesNotMatch(manifest,new RegExp('"'+removed+'"'));
  assert.doesNotMatch(manifest,/"svc-diva[^"]*"/i);
  assert.doesNotMatch(spriteModule,/service-icons-sprite\.webp/);
});

test('ServiceLogo uses the stable manifest and no legacy positional mask',()=>{
  assert.doesNotMatch(app,/const logoMask/);
  assert.doesNotMatch(app,/<ServiceLogo[^>]*position=/);
  assert.match(app,/SERVICE_LOGO_MANIFEST/);
  assert.match(app,/data-logo-source=/);
});
