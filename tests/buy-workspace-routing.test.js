import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('customer navigation keeps Buy as the canonical number/OTP workspace', async () => {
  const source = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('/buy?serviceId=${encodeURIComponent(item.id)}'));
  assert.ok(source.includes('/buy?serviceId=${encodeURIComponent(a.serviceId)}&activationId=${encodeURIComponent(a.id)}'));
  assert.ok(source.includes('function BuyPage()'));
  assert.ok(!source.includes('function BuyPage(){return <Catalog mode="buy"'));
  assert.ok(source.includes('function BuyActivationWorkspace({activationId,serviceId}'));
  assert.ok(source.includes("n.kind==='activation'&&n.sourceId?'/buy?activationId='"));
});
