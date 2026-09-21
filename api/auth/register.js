import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { register, login, setMockSession, mockUser, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'auth-register', 8, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  const { email, password } = req.body || {};
  try {
    if (!dbEnabled() && process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Authentication database is not configured' });
    if (!dbEnabled()) {
      if (!email || !password || String(password).length < 8) return res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters' });
      setMockSession(res, email);
      return res.status(201).json({ user: { ...mockUser(), email: String(email).trim().toLowerCase() }, mode: 'mock' });
    }
    const user = await register(email, password);
    const session = await login(email, password);
    setSessionCookie(res, session.token);
    return res.status(201).json({ user });
  } catch (error) {
    const duplicate = error.message.includes('already exists');
    return res.status(duplicate ? 409 : 400).json({ error: error.message });
  }
}
