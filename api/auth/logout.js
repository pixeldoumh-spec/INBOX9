import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { logout } from '../_lib/auth.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'auth-logout', 20, 60_000) || !enforceSameOrigin(req, res)) return;
  await logout(req, res);
  return res.status(200).json({ ok: true });
}
