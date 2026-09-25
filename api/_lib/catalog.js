import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'services.json'), 'utf8'));

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const seenIds = new Set();

export const services = raw.map(([name, category, price], index) => {
  const id = `svc-${slugify(name)}`;
  if (!id || seenIds.has(id)) throw new Error(`Duplicate or invalid service ID at catalog row ${index + 1}: ${name}`);
  seenIds.add(id);
  const seed = stableSeed(id);
  return {
    id,
    name,
    category,
    pricePaise: Math.round(Number(price) * 100),
    currency: 'INR',
    country: 'IN',
    availability: seed % 5 === 0 ? 'medium' : 'high',
    stock: 24 + (seed % 90)
  };
});

export const serviceCatalogVersion = '2026-09-25';
export const serviceCatalogSize = services.length;

export function getService(id) {
  return services.find((service) => service.id === id) ?? null;
}
