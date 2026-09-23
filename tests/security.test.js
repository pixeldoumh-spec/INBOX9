import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { passwordHash, verifyPassword } from '../api/_lib/auth.js';
import { rateLimit } from '../api/_lib/security.js';

test('password hashes are one-way and verifiable', () => {
  const password = 'Correct Horse Battery 42!';
  const digest = passwordHash(password);
  assert.notEqual(digest, password);
  assert.match(digest, /^scrypt\$/);
  assert.equal(verifyPassword(password, digest), true);
  assert.equal(verifyPassword('wrong-password', digest), false);
});

test('rate limiter blocks after configured threshold', () => {
  const req = { headers: { 'x-forwarded-for': `test-${crypto.randomUUID()}` }, socket: {} };
  const res = { headers: {}, setHeader(k,v){ this.headers[k]=v; }, statusCode: 200, status(code){ this.statusCode=code; return this; }, json(body){ this.body=body; return this; } };
  assert.equal(rateLimit(req,res,'test',2,60_000), true);
  assert.equal(rateLimit(req,res,'test',2,60_000), true);
  assert.equal(rateLimit(req,res,'test',2,60_000), false);
  assert.equal(res.statusCode, 429);
  assert.ok(res.headers['Retry-After']);
});

test('production rate limiter fails closed without shared store', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousMode = process.env.INBOX9_RUNTIME_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.NODE_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'postgres';
  try {
    const { rateLimitAsync } = await import('../api/_lib/security.js');
    const req = { headers: { 'x-forwarded-for': `prod-${crypto.randomUUID()}` }, socket: {} };
    const res = { headers: {}, setHeader(k,v){ this.headers[k]=v; }, statusCode: 200, status(code){ this.statusCode=code; return this; }, json(body){ this.body=body; return this; } };
    assert.equal(await rateLimitAsync(req, res, 'prod-test', 2, 60_000), false);
    assert.equal(res.statusCode, 503);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    if (previousMode === undefined) delete process.env.INBOX9_RUNTIME_MODE; else process.env.INBOX9_RUNTIME_MODE = previousMode;
  }
});
