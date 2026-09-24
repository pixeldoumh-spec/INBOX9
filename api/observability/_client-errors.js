import { enforceSameOrigin, rateLimitAsync } from '../_lib/security.js';
import { captureClientError } from '../_lib/observability.js';

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

export default async function handler(req, res) {
  if (!enforceSameOrigin(req, res)) return;
  if (!(await rateLimitAsync(req, res, 'client-errors', 10, 60_000))) return;

  const message = clean(req.body?.message, 1000);
  if (!message) return res.status(400).json({ error: 'Error message is required' });

  captureClientError({
    name: clean(req.body?.name || 'BrowserError', 120),
    message,
    stack: clean(req.body?.stack, 8000),
    path: clean(req.body?.path || '/', 400),
    source: clean(req.body?.source || 'browser', 100)
  });
  return res.status(202).json({ accepted: true });
}
