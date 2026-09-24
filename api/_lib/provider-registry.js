import { syntheticProvider } from './synthetic-provider.js';
import { numberOtpProvider } from './numberotp-provider.js';
import { proxnumProvider } from './proxnum-provider.js';

const adapters = new Map([
  ['synthetic', syntheticProvider],
  ['numberotp', numberOtpProvider],
  ['proxnum', proxnumProvider],
]);

export function getProviderAdapter(adapterKey = 'synthetic') {
  const key = String(adapterKey || 'synthetic');
  const adapter = adapters.get(key);
  if (!adapter) throw new Error(`Fulfillment engine not installed: ${key}`);
  return adapter;
}

export function listProviderAdapters() { return [...adapters.keys()]; }
