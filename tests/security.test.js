import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { passwordHash, verifyPassword } from '../api/_lib/auth.js';
import { rateLimit, rateLimitAsync } from '../api/_lib/security.js';

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

test('production rate limiter uses the shared PostgreSQL bucket store when configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabase = process.env.DATABASE_URL;
  const previousMode = process.env.INBOX9_RUNTIME_MODE;
  const testDatabase = process.env.INBOX9_TEST_DATABASE_URL;
  if (!testDatabase) return;
  process.env.DATABASE_URL = testDatabase;
  process.env.NODE_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'postgres';
  try {
    const req = { headers: { 'x-forwarded-for': `prod-${crypto.randomUUID()}` }, socket: {} };
    const makeRes = () => ({
      headers: {},
      statusCode: 200,
      setHeader(k,v){ this.headers[k]=v; },
      status(code){ this.statusCode=code; return this; },
      json(body){ this.body=body; return this; },
    });
    const first = makeRes();
    const second = makeRes();
    const third = makeRes();
    assert.equal(await rateLimitAsync(req, first, 'prod-test', 2, 60_000), true);
    assert.equal(await rateLimitAsync(req, second, 'prod-test', 2, 60_000), true);
    assert.equal(await rateLimitAsync(req, third, 'prod-test', 2, 60_000), false);
    assert.equal(third.statusCode, 429);
    assert.ok(third.headers['Retry-After']);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousMode === undefined) delete process.env.INBOX9_RUNTIME_MODE; else process.env.INBOX9_RUNTIME_MODE = previousMode;
  }
});

test('production rate limiter fails closed when the database store is unavailable', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabase = process.env.DATABASE_URL;
  const previousMode = process.env.INBOX9_RUNTIME_MODE;
  process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
  process.env.NODE_ENV = 'production';
  process.env.INBOX9_RUNTIME_MODE = 'postgres';
  try {
    const req = { headers: { 'x-forwarded-for': `prod-down-${crypto.randomUUID()}` }, socket: {} };
    const res = { headers: {}, statusCode: 200, setHeader(k,v){ this.headers[k]=v; }, status(code){ this.statusCode=code; return this; }, json(body){ this.body=body; return this; } };
    assert.equal(await rateLimitAsync(req, res, 'prod-down-test', 2, 60_000), false);
    assert.equal(res.statusCode, 503);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousMode === undefined) delete process.env.INBOX9_RUNTIME_MODE; else process.env.INBOX9_RUNTIME_MODE = previousMode;
  }
});
