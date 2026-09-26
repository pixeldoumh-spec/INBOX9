import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const manifestPath=path.join(root,'frontend/public/manifest.webmanifest');
const indexPath=path.join(root,'frontend/index.html');
const mainPath=path.join(root,'frontend/src/main.tsx');
const swPath=path.join(root,'frontend/public/sw.js');

function pngDimensions(file){
  const b=fs.readFileSync(file);
  assert.equal(b.readUInt32BE(0),0x89504e47);
  assert.equal(b.toString('ascii',1,4),'PNG');
  return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
}

test('PWA manifest is install-ready',()=>{
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.start_url,'/apps');
  assert.equal(manifest.scope,'/');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.icons.length,2);
  assert.deepEqual(manifest.icons.map(x=>x.sizes),['192x192','512x512']);
  for(const icon of manifest.icons) assert.equal(fs.existsSync(path.join(root,'frontend/public',icon.src.slice(1))),true);
});

test('PWA icons have declared dimensions',()=>{
  assert.deepEqual(pngDimensions(path.join(root,'frontend/public/icons/icon-192.png')),{width:192,height:192});
  assert.deepEqual(pngDimensions(path.join(root,'frontend/public/icons/icon-512.png')),{width:512,height:512});
});

test('mobile metadata is wired and stale service-worker caching is retired',()=>{
  const index=fs.readFileSync(indexPath,'utf8');
  const main=fs.readFileSync(mainPath,'utf8');
  const sw=fs.readFileSync(swPath,'utf8');
  assert.match(index,/apple-mobile-web-app-capable/);
  assert.match(index,/apple-touch-icon/);
  assert.match(index,/manifest\.webmanifest/);
  assert.match(main,/serviceWorker\.getRegistrations\(\)/);
  assert.match(main,/registration\.unregister\(\)/);
  assert.match(main,/key\.startsWith\('inbox9-shell-'\)/);
  assert.doesNotMatch(main,/serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(sw,/CACHE_NAME='inbox9-shell-v2'/);
  assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
});
