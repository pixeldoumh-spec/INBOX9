import { asmsProvider } from './asms-provider.js';
import { pvapinsProvider } from './pvapins-provider.js';
import { smsVerificationNumberProvider } from './sms-verification-number-provider.js';
import { syntheticProvider } from './synthetic-provider.js';

const adapters = new Map([
  ['synthetic', syntheticProvider],
  ['asms', asmsProvider],
  ['pvapins', pvapinsProvider],
  ['sms-verification-number', smsVerificationNumberProvider],
]);

export function getProviderAdapter(adapterKey = 'synthetic') {
  const key = String(adapterKey || 'synthetic');
  const adapter = adapters.get(key);
  if (!adapter) throw new Error(`Fulfillment engine not installed: ${key}`);
  return adapter;
}

export function listProviderAdapters() { return [...adapters.keys()]; }
