import { mockProvider } from './mock-provider.js';
import { shelexTestProvider } from './shelex-test-provider.js';
const adapters = new Map([['mock', mockProvider], ['shelex-test', shelexTestProvider]]);
export function getProviderAdapter(adapterKey = 'mock') {
  const adapter = adapters.get(String(adapterKey));
  if (!adapter) throw new Error(`Provider adapter not installed: ${adapterKey}`);
  return adapter;
}
export function listProviderAdapters() { return [...adapters.keys()]; }
