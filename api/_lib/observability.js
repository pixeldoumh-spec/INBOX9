import crypto from 'node:crypto';

const startedAtMs = Date.now();
const counters = {
  requests: 0,
  apiRequests: 0,
  errors: 0,
  http4xx: 0,
  http5xx: 0,
  slowRequests: 0,
  clientErrors: 0
};
const statusCounts = new Map();
const routeCounts = new Map();
const MAX_TRACKED_KEYS = 200;
const SLOW_REQUEST_MS = Math.max(250, Number(process.env.OBSERVABILITY_SLOW_REQUEST_MS || 1500));

function nowIso() {
  return new Date().toISOString();
}

function stringValue(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

export function telemetryPath(rawUrl) {
  try {
    return new URL(String(rawUrl || '/'), 'http://inbox9.local').pathname.slice(0, 200) || '/';
  } catch {
    return '/';
  }
}

function incrementMap(map, key) {
  if (!key) return;
  if (!map.has(key) && map.size >= MAX_TRACKED_KEYS) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, (map.get(key) || 0) + 1);
}

function emit(level, event, fields = {}) {
  const payload = {
    ts: nowIso(),
    level,
    event,
    service: 'inbox9',
    ...fields
  };
  try {
    console.log(JSON.stringify(payload));
  } catch {
    console.log(JSON.stringify({ ts: nowIso(), level: 'error', event: 'observability.log_serialization_failed', service: 'inbox9' }));
  }
}

function safeError(error) {
  const value = error instanceof Error ? error : new Error(stringValue(error));
  return {
    type: stringValue(value.name || 'Error', 120),
    message: stringValue(value.message || 'Unknown error', 1000),
    stack: stringValue(value.stack || '', 8000)
  };
}

function sentryConfig() {
  const raw = String(process.env.SENTRY_DSN || '').trim();
  if (!raw) return null;
  try {
    const dsn = new URL(raw);
    if (!['http:', 'https:'].includes(dsn.protocol) || !dsn.username) return null;
    const segments = dsn.pathname.split('/').filter(Boolean);
    const projectId = segments.pop();
    if (!projectId) return null;
    const prefix = segments.length ? '/' + segments.join('/') : '';
    return {
      endpoint: dsn.origin + prefix + '/api/' + projectId + '/envelope/',
      publicKey: decodeURIComponent(dsn.username)
    };
  } catch {
    return null;
  }
}

function stackFrames(stack) {
  const lines = String(stack || '').split('\n').filter(Boolean).slice(0, 60);
  const frames = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^at (.*?) ?\(?(.+?):(\d+):(\d+)\)?$/);
    if (match) {
      frames.push({
        function: stringValue(match[1] || '<anonymous>', 200),
        filename: stringValue(match[2], 500),
        lineno: Number(match[3]),
        colno: Number(match[4])
      });
    }
  }
  return frames.reverse();
}

function buildSentryEvent({ error, context = {}, client = false }) {
  const normalized = error instanceof Error
    ? safeError(error)
    : {
      type: stringValue(error?.type || error?.name || 'Error', 120),
      message: stringValue(error?.message || 'Unknown error', 1000),
      stack: stringValue(error?.stack || '', 8000)
    };
  const eventId = crypto.randomBytes(16).toString('hex');
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    logger: 'inbox9',
    environment: stringValue(process.env.SENTRY_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'production' : 'development'), 100),
    release: stringValue(process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || 'inbox9-local', 200),
    message: normalized.message,
    exception: {
      values: [{
        type: normalized.type,
        value: normalized.message,
        ...(normalized.stack ? { stacktrace: { frames: stackFrames(normalized.stack) } } : {})
      }]
    },
    tags: {
      source: client ? 'browser' : 'server',
      ...(context.path ? { path: telemetryPath(context.path) } : {}),
      ...(context.method ? { method: stringValue(context.method, 16) } : {}),
      ...(context.statusCode ? { status_code: String(Number(context.statusCode) || 0) } : {})
    },
    contexts: {
      runtime: {
        node_version: process.version,
        platform: process.platform
      }
    }
  };
  if (normalized.stack) event.extra = { stack: normalized.stack };
  return { event, eventId };
}

async function sendSentry({ error, context = {}, client = false }) {
  const config = sentryConfig();
  if (!config) return false;
  const { event } = buildSentryEvent({ error, context, client });
  const envelopeHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    sdk: { name: 'inbox9-observability', version: '1.0.0' }
  });
  const itemHeader = JSON.stringify({
    type: 'event',
    content_type: 'application/json',
    length: Buffer.byteLength(JSON.stringify(event))
  });
  const body = envelopeHeader + '\n' + itemHeader + '\n' + JSON.stringify(event);
  try {
    const query = new URLSearchParams({
      sentry_version: '7',
      sentry_key: config.publicKey,
      sentry_client: 'inbox9-observability/1.0.0'
    });
    const response = await fetch(config.endpoint + '?' + query.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body,
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (sendError) {
    emit('warn', 'monitoring.sentry_send_failed', {
      error_type: stringValue(sendError?.name || 'Error', 100),
      http_status: Number(sendError?.status) || 0
    });
    return false;
  }
}

export function startRequestObservation(req, requestIdValue = '') {
  const startedAt = process.hrtime.bigint();
  return {
    startedAt,
    requestId: stringValue(requestIdValue, 100),
    method: stringValue(req?.method || 'GET', 16),
    path: telemetryPath(req?.url || '/'),
    api: String(req?.url || '').startsWith('/api/')
  };
}

export function finishRequestObservation(observation, statusCode) {
  if (!observation) return;
  counters.requests += 1;
  if (observation.api) counters.apiRequests += 1;
  const status = Number(statusCode) || 0;
  incrementMap(statusCounts, String(status));
  incrementMap(routeCounts, observation.path);
  if (status >= 400 && status < 500) counters.http4xx += 1;
  if (status >= 500) counters.http5xx += 1;
  const durationMs = Number(process.hrtime.bigint() - observation.startedAt) / 1e6;
  if (durationMs >= SLOW_REQUEST_MS) counters.slowRequests += 1;
  emit('info', 'http.request_completed', {
    request_id: observation.requestId,
    method: observation.method,
    path: observation.path,
    status_code: status,
    duration_ms: Math.round(durationMs * 100) / 100
  });
}

export function captureException(error, context = {}) {
  counters.errors += 1;
  const normalized = safeError(error);
  emit('error', 'application.error', {
    request_id: stringValue(context.requestId, 100),
    method: stringValue(context.method, 16),
    path: telemetryPath(context.path || '/'),
    status_code: Number(context.statusCode) || 0,
    error_type: normalized.type,
    error_message: normalized.message,
    stack: normalized.stack || undefined
  });
  void sendSentry({ error, context, client: false });
}

export function captureClientError(payload = {}, context = {}) {
  counters.clientErrors += 1;
  const error = {
    name: stringValue(payload.name || 'BrowserError', 120),
    message: stringValue(payload.message || 'Unknown browser error', 1000),
    stack: stringValue(payload.stack || '', 8000)
  };
  emit('error', 'client.error', {
    path: telemetryPath(payload.path || context.path || '/'),
    source: stringValue(payload.source || 'browser', 100),
    error_type: error.name,
    error_message: error.message
  });
  void sendSentry({ error, context: { ...context, path: payload.path || context.path }, client: true });
}

export function observabilitySnapshot() {
  return {
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
    counters: { ...counters },
    statuses: Object.fromEntries(statusCounts),
    topRoutes: [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([path, count]) => ({ path, count })),
    slowRequestThresholdMs: SLOW_REQUEST_MS,
    sentryConfigured: Boolean(sentryConfig())
  };
}

export function markServerStarted({ host, port }) {
  emit('info', 'runtime.started', {
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
    runtime_mode: process.env.INBOX9_RUNTIME_MODE || 'local',
    host: stringValue(host, 100),
    port: Number(port) || 0,
    sentry_configured: Boolean(sentryConfig())
  });
}

export function installProcessHandlers() {
  if (globalThis.__INBOX9_OBSERVABILITY_HANDLERS__) return;
  globalThis.__INBOX9_OBSERVABILITY_HANDLERS__ = true;
  process.on('uncaughtException', (error) => {
    captureException(error, { path: '/__process__/uncaughtException', statusCode: 500 });
    setTimeout(() => process.exit(1), 100);
  });
  process.on('unhandledRejection', (reason) => {
    captureException(reason instanceof Error ? reason : new Error(stringValue(reason)), {
      path: '/__process__/unhandledRejection',
      statusCode: 500
    });
  });
}
