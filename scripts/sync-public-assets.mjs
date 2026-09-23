import { copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await copyFile(resolve(root, 'index.html'), resolve(root, 'public/index.html'));
await copyFile(resolve(root, 'app.js'), resolve(root, 'public/app.js'));
console.log('Synced canonical browser assets into public/.');
