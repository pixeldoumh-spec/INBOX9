import { virtualSmsProvider } from '../api/_lib/virtualsms-provider.js';

const health = await virtualSmsProvider.health();
console.log(JSON.stringify(health, null, 2));

if (!health.healthy) process.exit(2);
if (!health.indiaListed) {
  console.error('VirtualSMS authenticated account did not report India (+91) in the country list.');
  process.exit(3);
}
if (!health.purchaseEnabled) {
  console.error('VirtualSMS purchase remains disabled until authorization and canary settings are enabled.');
  process.exit(4);
}
console.log('Preflight passed: authenticated access, India visibility and purchase gates are configured.');
