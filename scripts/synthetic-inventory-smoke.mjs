import fs from 'node:fs/promises';
import { generateSyntheticIdentity, generateSyntheticInventory, generateSyntheticOtp, normalizeCapacity } from '../api/_lib/synthetic-otp.js';

const services = JSON.parse(await fs.readFile(new URL('../data/services.json', import.meta.url), 'utf8'));
const capacity = normalizeCapacity(process.env.SYNTHETIC_CAPACITY || 5000);
const serviceNames = services.map((row) => row[0]);

if (serviceNames.length !== 76) throw new Error(`Expected 76 services, found ${serviceNames.length}`);

let identities = 0;
let otpMismatches = 0;
const seen = new Set();

for (const service of serviceNames) {
  const sample = generateSyntheticInventory(service, capacity);
  if (sample.length !== capacity) throw new Error(`Capacity mismatch for ${service}`);
  identities += sample.length;
  for (const item of sample) {
    if (seen.has(item.identity)) throw new Error(`Duplicate synthetic identity: ${item.identity}`);
    seen.add(item.identity);
    const expected = generateSyntheticOtp(service, item.index);
    if (expected !== item.otp) otpMismatches += 1;
  }
}

const expected = serviceNames.length * capacity;
console.log(JSON.stringify({
  ok: otpMismatches === 0 && identities === expected,
  services: serviceNames.length,
  capacityPerService: capacity,
  syntheticIdentities: identities,
  otpMismatches,
  reproducibility: generateSyntheticIdentity(serviceNames[0], 1, capacity) === generateSyntheticIdentity(serviceNames[0], 1, capacity),
}));
