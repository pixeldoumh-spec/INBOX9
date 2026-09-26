import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('Phase 10 Buy workspace keeps allocation and OTP recovery safe', async () => {
  const source = await fs.readFile(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const [online,setOnline]=useState(true);'));
  assert.ok(source.includes('const [allocationElapsed,setAllocationElapsed]=useState(0);'));
  assert.ok(source.includes('allocation-delay-banner'));
  assert.ok(source.includes('refetchOnReconnect:true'));
  assert.ok(source.includes('refetchOnWindowFocus:true'));
  assert.ok(source.includes("window.addEventListener('online',onReconnect)"));
  assert.ok(source.includes('Buy this service again'));
  assert.ok(source.includes('Retry wallet check'));
});
