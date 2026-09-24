import fs from 'node:fs/promises';
import { generateSyntheticIdentity, generateSyntheticOtp, normalizeCapacity } from '../api/_lib/synthetic-otp.js';
import { listSyntheticServers, SYNTHETIC_SERVER_COUNT } from '../api/_lib/synthetic-servers.js';

const services = JSON.parse(await fs.readFile(new URL('../data/services.json', import.meta.url), 'utf8'));
const capacity = normalizeCapacity(process.env.SYNTHETIC_CAPACITY || 5000);
const serviceNames = services.map((row) => row[0]);
const servers = listSyntheticServers(capacity);

const EXPECTED_SERVICES = 832;
if (serviceNames.length !== EXPECTED_SERVICES) throw new Error(`Expected ${EXPECTED_SERVICES} services, found ${serviceNames.length}`);
if (servers.length !== SYNTHETIC_SERVER_COUNT) throw new Error(`Expected ${SYNTHETIC_SERVER_COUNT} synthetic servers, found ${servers.length}`);
if (servers.reduce((sum, server) => sum + server.capacity, 0) !== capacity) throw new Error('Synthetic server chunk capacity mismatch');

const sampleCount = Math.min(25, capacity);
const sampleIndexes = [...new Set(Array.from({ length: sampleCount }, (_, i) =>
  Math.min(capacity, 1 + Math.floor((i * (capacity - 1)) / Math.max(1, sampleCount - 1)))
))];

let identities = 0;
let otpMismatches = 0;
const seen = new Set();

for (const service of serviceNames) {
  for (const index of sampleIndexes) {
    const identity = generateSyntheticIdentity(service, index, capacity);
    identities += 1;
    if (seen.has(identity)) throw new Error(`Duplicate synthetic identity: ${identity}`);
    seen.add(identity);
    const expectedA = generateSyntheticOtp(service, index);
    const expectedB = generateSyntheticOtp(service, index);
    if (expectedA !== expectedB) otpMismatches += 1;
  }
}

const expected = serviceNames.length * sampleIndexes.length;
console.log(JSON.stringify({
  ok: otpMismatches === 0 && identities === expected,
  services: serviceNames.length,
  capacityPerService: capacity,
  syntheticIdentitiesSampled: identities,
  sampleSlotsPerService: sampleIndexes.length,
  serverChunksPerService: servers.length,
  serverChunkCapacityTotal: servers.reduce((sum, server) => sum + server.capacity, 0),
  otpMismatches,
  reproducibility: generateSyntheticIdentity(serviceNames[0], 1, capacity) === generateSyntheticIdentity(serviceNames[0], 1, capacity),
}));
