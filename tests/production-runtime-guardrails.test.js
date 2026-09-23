import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createServer } from '../server.js';

async function request(server, path) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(new URL(path, 'http://127.0.0.1:' + address.port), (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('persistent production startup fails closed without required runtime configuration', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    database: process.env.DATABASE_URL,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    origin: process.env.APP_ORIGIN,
    cron: process.env.CRON_SECRET,
    mode: process.env.INBOX9_RUNTIME_MODE,
  };
  delete process.env.DATABASE_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.APP_ORIGIN;
  delete process.env.CRON_SECRET;
  process.env.INBOX9_RUNTIME_MODE = 'postgres';
  process.env.NODE_ENV = 'production';
  try {
    const { startServer } = await import('../server.js');
    assert.throws(() => startServer({ port: 0, host: '127.0.0.1' }), /Production configuration incomplete/);
  } finally {
    const restore = {
      NODE_ENV: previous.nodeEnv,
      DATABASE_URL: previous.database,
      UPSTASH_REDIS_REST_URL: previous.redisUrl,
      UPSTASH_REDIS_REST_TOKEN: previous.redisToken,
      APP_ORIGIN: previous.origin,
      CRON_SECRET: previous.cron,
      INBOX9_RUNTIME_MODE: previous.mode,
    };
    for (const key of Object.keys(restore)) {
      const value = restore[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('persistent production catalog does not fall back to bundled local data', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabase = process.env.DATABASE_URL;
  const previousMode = process.env.INBOX9_RUNTIME_MODE;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'postgres';
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await request(server, '/api/services');
    assert.equal(response.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousMode === undefined) delete process.env.INBOX9_RUNTIME_MODE; else process.env.INBOX9_RUNTIME_MODE = previousMode;
  }
});
