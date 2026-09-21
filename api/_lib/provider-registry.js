import { syntheticProvider } from './synthetic-provider.js';

const adapters = new Map([['synthetic', syntheticProvider]]);

export function getProviderAdapter(adapterKey = 'synthetic') {
  const key = String(adapterKey || 'synthetic');
  const adapter = adapters.get(key);
  if (!adapter) throw new Error(`Fulfillment engine not installed: ${key}`);
  return adapter;
}

export function listProviderAdapters() { return [...adapters.keys()]; }
