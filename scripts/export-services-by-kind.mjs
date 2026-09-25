import fs from 'node:fs';

const inputPath = new URL('../data/services.json', import.meta.url);
const outputPath = new URL('../data/services-by-kind.csv', import.meta.url);

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (!Array.isArray(raw)) throw new Error('data/services.json must be an array');
if (raw.length !== 832) throw new Error(`Expected 832 services, found ${raw.length}`);

const rows = raw.map(([name, category, price], index) => {
  const cleanName = String(name ?? '').trim();
  const cleanCategory = String(category ?? 'Other').trim() || 'Other';
  const numericPrice = Number(price);
  if (!cleanName) throw new Error(`Missing service name at index ${index}`);
  if (!Number.isFinite(numericPrice)) throw new Error(`Invalid price for ${cleanName}`);
  return {
    kind: cleanCategory,
    service: cleanName,
    price_inr: numericPrice,
    service_id: `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
  };
});

rows.sort((a, b) =>
  a.kind.localeCompare(b.kind, undefined, { sensitivity: 'base' }) ||
  a.service.localeCompare(b.service, undefined, { sensitivity: 'base' }) ||
  a.price_inr - b.price_inr ||
  a.service_id.localeCompare(b.service_id)
);

const esc = (value) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const lines = [
  ['Kind', 'Service', 'Price (INR)', 'Service ID'].map(esc).join(','),
  ...rows.map((row) => [row.kind, row.service, row.price_inr.toFixed(2), row.service_id].map(esc).join(','))
];

fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');

const counts = new Map();
for (const row of rows) counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
console.log(JSON.stringify({
  total: rows.length,
  kinds: [...counts.entries()].map(([kind, count]) => ({ kind, count })),
  output: 'data/services-by-kind.csv'
}, null, 2));
