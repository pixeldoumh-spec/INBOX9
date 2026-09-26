import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = path.join(frontendRoot, 'assets', 'service-logo-sprite');
const publicDir = path.join(frontendRoot, 'public');
const outputPath = path.join(publicDir, 'service-icons-sprite.webp');

const parts = (await readdir(partsDir))
  .filter((name) => /^part-\\d{2}\\.txt$/.test(name))
  .sort();
if (parts.length !== 7) throw new Error('Expected exactly 7 prepared sprite parts, found ' + parts.length);

const base64 = (await Promise.all(parts.map((name) => readFile(path.join(partsDir, name), 'utf8'))))
  .join('')
  .replace(/\\s+/g, '');
const bytes = Buffer.from(base64, 'base64');
if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF' || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') {
  throw new Error('Prepared service sprite is not a valid WebP');
}
if (bytes.length !== 18138) throw new Error('Unexpected prepared service sprite size: ' + bytes.length);
await mkdir(publicDir, { recursive: true });
await writeFile(outputPath, bytes);
console.log('Prepared service logo sprite:', outputPath, bytes.length + ' bytes');
