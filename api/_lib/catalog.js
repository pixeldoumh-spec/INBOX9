import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'services.json'), 'utf8'));

export const services = raw.map(([name, category, price], i) => ({
  id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
  name,
  category,
  pricePaise: Math.round(Number(price) * 100),
  currency: 'INR',
  country: 'IN',
  availability: i % 5 === 0 ? 'medium' : 'high',
  stock: 24 + ((i * 17) % 90)
}));

export function getService(id) {
  return services.find((service) => service.id === id) ?? null;
}
