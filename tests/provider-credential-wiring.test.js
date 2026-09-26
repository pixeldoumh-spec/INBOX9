import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('Phase 8.1 declares server-only provider secret slots', () => {
  const render = fs.readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
  for (const key of [
    'INBOX9_ASMS_API_KEY',
    'INBOX9_PVAPINS_API_KEY',
    'INBOX9_SVNUMBER_API_KEY',
  ]) {
    assert.match(render, new RegExp('key: ' + key + '[\\s\\S]{0,80}sync: false'));
  }
  assert.match(render, /key: INBOX9_ENABLE_EXTERNAL_ROUTING\n\s+value: "false"/);
  assert.match(render, /key: INBOX9_ALLOW_NONCANCELLABLE_PROVIDER_RESERVE\n\s+value: "false"/);
});

test('Phase 8.1 adapter credential names are centralized and server-side', async () => {
  const registry = await import('../api/_lib/provider-registry.js');
  assert.deepEqual(registry.listProviderAdapters(), [
    'synthetic',
    'asms',
    'pvapins',
    'sms-verification-number',
  ]);

  const sourceFiles = [
    '../api/_lib/asms-provider.js',
    '../api/_lib/pvapins-provider.js',
    '../api/_lib/sms-verification-number-provider.js',
  ];
  for (const file of sourceFiles) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:sk_live|AKIA[0-9A-Z]{16})/);
    assert.doesNotMatch(source, /(?:NEXT_PUBLIC|VITE)_INBOX9_(?:ASMS|PVAPINS|SVNUMBER)_API_KEY/);
  }
});

test('missing provider credentials fail closed without revealing a secret value', async () => {
  delete process.env.INBOX9_ASMS_API_KEY;
  const { requireProviderSecret } = await import('../api/_lib/external-provider-http.js');
  assert.throws(
    () => requireProviderSecret('ASMS.ai', 'INBOX9_ASMS_API_KEY'),
    (error) => error?.code === 'PROVIDER_NOT_CONFIGURED'
      && error?.providerName === 'ASMS.ai'
      && error?.envName === 'INBOX9_ASMS_API_KEY'
      && !String(error?.message || '').includes('undefined')
  );
});
