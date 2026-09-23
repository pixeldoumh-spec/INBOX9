import crypto from 'node:crypto';
import { isSyntheticProduction, isProduction } from './runtime-config.js';

const buckets = new Map();
const WINDOW_MS = 60_000;

function sharedLimiterConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstashCommand(commandPath) {
  const base = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const response = await fetch(`${base}/${commandPath}`, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Rate-limit store returned HTTP ${response.status}`);
  return response.json();
}

export function clientIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

export function applySecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'");
  if (isProduction()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function requestId(req, res) {
  const supplied = String(req.headers?.['x-request-id'] || '').trim();
  const id = /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export function rateLimit(req, res, name, limit, windowMs = WINDOW_MS, scopeKey = '') {
  const now = Date.now();
  const suffix = scopeKey ? `:${crypto.createHash('sha256').update(String(scopeKey)).digest('hex').slice(0, 24)}` : '';
  const key = `${name}:${clientIp(req)}${suffix}`;
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size > 10000) {
      for (const [storedKey, stored] of buckets) {
        if (stored.resetAt <= now) buckets.delete(storedKey);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) {
    const retry = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retry));
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return false;
  }
  bucket.count += 1;
  return true;
}


export async function rateLimitAsync(req, res, name, limit, windowMs = WINDOW_MS, scopeKey = '') {
  if (!sharedLimiterConfigured()) {
    if (isProduction() && !isSyntheticProduction()) {
      res.status(503).json({ error: 'Shared rate-limit service is not configured' });
      return false;
    }
    return rateLimit(req, res, name, limit, windowMs, scopeKey);
  }
  const safeWindow = Math.max(1000, Math.floor(windowMs));
  const windowSeconds = Math.max(1, Math.ceil(safeWindow / 1000));
  const bucket = Math.floor(Date.now() / safeWindow);
  const scoped = scopeKey ? `:${crypto.createHash('sha256').update(String(scopeKey)).digest('hex').slice(0, 24)}` : '';
  const rawKey = `${name}:${clientIp(req)}${scoped}:${bucket}`;
  const key = encodeURIComponent(rawKey);
  try {
    const result = await upstashCommand(`incr/${key}`);
    const count = Number(result?.result);
    if (count === 1) await upstashCommand(`expire/${key}/${windowSeconds}`);
    if (count > limit) {
      res.setHeader('Retry-After', String(windowSeconds));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return false;
    }
    return true;
  } catch (error) {
    console.error('rate_limit_store_failed', error);
    if (process.env.NODE_ENV === 'production' && !isSyntheticProduction()) {
      res.status(503).json({ error: 'Rate-limit service unavailable' });
      return false;
    }
    return rateLimit(req, res, name, limit, windowMs, scopeKey);
  }
}

export function enforceSameOrigin(req, res) {
  if (!isProduction()) return true;
  const expected = String(process.env.APP_ORIGIN || '').replace(/\/$/, '') || `https://${String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim()}`.replace(/\/$/, '');
  if (!expected || expected === 'https://') {
    if (isSyntheticProduction()) return true;
    res.status(503).json({ error: 'Application origin is not configured' });
    return false;
  }
  const origin = String(req.headers?.origin || '').replace(/\/$/, '');
  const referer = String(req.headers?.referer || '');
  if (origin) {
    if (origin !== expected) {
      res.status(403).json({ error: 'Cross-origin request blocked' });
      return false;
    }
    return true;
  }
  if (referer.startsWith(`${expected}/`) || referer === expected) return true;
  res.status(403).json({ error: 'Origin verification required' });
  return false;
}

export function validateBodySize(req, maxBytes = 32_000) {
  const raw = req.headers?.['content-length'];
  if (raw && Number(raw) > maxBytes) {
    const error = new Error('Payload too large');
    error.statusCode = 413;
    throw error;
  }
}
