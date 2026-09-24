import { syntheticProvider } from './synthetic-provider.js';
import { numberOtpProvider } from './numberotp-provider.js';

const adapters = new Map([
  ['synthetic', syntheticProvider],
  ['numberotp', numberOtpProvider],
]);

export function getProviderAdapter(adapterKey = 'synthetic') {
  const key = String(adapterKey || 'synthetic');
  const adapter = adapters.get(key);
  if (!adapter) throw new Error(`Fulfillment engine not installed: ${key}`);
  return adapter;
}

export function listProviderAdapters() { return [...adapters.keys()]; }
