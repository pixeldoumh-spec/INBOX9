import { shelexTestProvider } from './shelex-test-provider.js';
const adapters = new Map([['shelex-test', shelexTestProvider]]);
export function getProviderAdapter(adapterKey = 'shelex-test') {
  const adapter = adapters.get(String(adapterKey));
  if (!adapter) throw new Error(`Provider adapter not installed: ${adapterKey}`);
  return adapter;
}
export function listProviderAdapters() { return [...adapters.keys()]; }
