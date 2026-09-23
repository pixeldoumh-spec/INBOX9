import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeMode, isProduction, isSyntheticProduction } from '../api/_lib/runtime-config.js';

test('synthetic runtime is not accepted as a production mode', () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    mode: process.env.INBOX9_RUNTIME_MODE,
  };
  process.env.NODE_ENV = 'production';
  process.env.VERCEL_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'synthetic';
  try {
    assert.equal(isProduction(), true);
    assert.equal(runtimeMode(), 'unconfigured');
    assert.equal(isSyntheticProduction(), false);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.vercelEnv;
    if (previous.mode === undefined) delete process.env.INBOX9_RUNTIME_MODE; else process.env.INBOX9_RUNTIME_MODE = previous.mode;
  }
});
