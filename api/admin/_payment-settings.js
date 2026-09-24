import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireAdmin } from '../_lib/auth.js';
import { getPaymentSettings, updatePaymentSettings } from '../_lib/payment-settings.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET','PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const user = dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  if (!await rateLimitAsync(req, res, 'admin-payment-settings', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Payment settings require PostgreSQL' });

  if (req.method === 'GET') {
    try { return res.status(200).json({ paymentSettings: await getPaymentSettings() }); }
    catch (error) { console.error('admin.payment_settings_read_failed', error); return res.status(503).json({ error: 'Payment settings unavailable' }); }
  }

  if (!enforceSameOrigin(req, res)) return;
  try {
    const paymentSettings = await updatePaymentSettings(user.id, req.body || {});
    return res.status(200).json({ paymentSettings });
  } catch (error) {
    const status = Number(error?.statusCode);
    if (status >= 400 && status < 500) return res.status(status).json({ code: error.code, error: error.message });
    console.error('admin.payment_settings_update_failed', error);
    return res.status(503).json({ error: 'Payment settings update unavailable' });
  }
}
