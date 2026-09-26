import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');

test('customer logo crop uses adaptive safety margins',()=>{
  assert.match(shared,/const LOGO_SAFE_INSET=7/);
  assert.match(shared,/const inset=Math\.max\(/);
  assert.match(shared,/LOGO_SAFE_INSET/);
  assert.match(shared,/tileSize\*0\.12/);
});

test('customer logo crop rejects unstable detections instead of clipping artwork',()=>{
  assert.match(shared,/if\(rawRatio<0\.55\)return null/);
  assert.match(shared,/if\(cropCoverage<LOGO_MAX_CROP_RATIO&&cropRatio<0\.78\)return null/);
  assert.match(shared,/if\(asymmetry>LOGO_MAX_ASYMMETRY\)return null/);
});

test('customer logo crop falls back to the complete supplied tile when uncertain',()=>{
  assert.match(shared,/const sourceX=crop\?\.minX\?\?0/);
  assert.match(shared,/const sourceY=crop\?\.minY\?\?0/);
  assert.match(shared,/const sourceW=crop\?\.cropW\?\?tileSize/);
  assert.match(shared,/const sourceH=crop\?\.cropH\?\?tileSize/);
  assert.match(shared,/When detection is uncertain, preserve the complete supplied tile/);
});

test('customer logo renderer remains shared across customer surfaces',()=>{
  assert.match(shared,/data-service-id=\{serviceId\}/);
  assert.match(shared,/className="service-logo-frame"/);
});
