import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import p1 from './service-logo-sprite-parts/part-01.mjs';
import p2 from './service-logo-sprite-parts/part-02.mjs';
import p3 from './service-logo-sprite-parts/part-03.mjs';
import p4 from './service-logo-sprite-parts/part-04.mjs';
import p5 from './service-logo-sprite-parts/part-05.mjs';
import p6 from './service-logo-sprite-parts/part-06.mjs';
import p7 from './service-logo-sprite-parts/part-07.mjs';
import p8 from './service-logo-sprite-parts/part-08.mjs';
import p9 from './service-logo-sprite-parts/part-09.mjs';
import p10 from './service-logo-sprite-parts/part-10.mjs';
import p11 from './service-logo-sprite-parts/part-11.mjs';
import p12 from './service-logo-sprite-parts/part-12.mjs';
import p13 from './service-logo-sprite-parts/part-13.mjs';
import p14 from './service-logo-sprite-parts/part-14.mjs';
import p15 from './service-logo-sprite-parts/part-15.mjs';
import p16 from './service-logo-sprite-parts/part-16.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(frontendRoot, 'public');
const outputPath = path.join(publicDir, 'service-icons-sprite.webp');

const base64 = [
  p1,
  p2,
  p3,
  p4,
  p5,
  p6,
  p7,
  p8,
  p9,
  p10,
  p11,
  p12,
  p13,
  p14,
  p15,
  p16
].join('').replace(/\s+/g, '');
const bytes = Buffer.from(base64, 'base64');

if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
  throw new Error('ZIP service icon sprite is not a valid WebP');
}
if (bytes.length !== 353142) {
  throw new Error('Unexpected ZIP service icon sprite size: ' + bytes.length);
}

await mkdir(publicDir, { recursive: true });
await writeFile(outputPath, bytes);
console.log('Prepared ZIP service icon sprite:', outputPath, bytes.length + ' bytes');
