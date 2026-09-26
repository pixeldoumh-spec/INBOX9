import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireAdmin } from '../_lib/auth.js';
import { createAdminNotification, listAdminNotifications } from '../_lib/notification-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!await rateLimitAsync(req, res, 'admin-notifications', 30, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin notifications require PostgreSQL' });

  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await listAdminNotifications({
        query: req.query?.q,
        kind: req.query?.kind,
        read: req.query?.read,
        limit: req.query?.limit,
        offset: req.query?.offset
      }));
    } catch (error) {
      console.error('admin.notifications_failed', error);
      return res.status(503).json({ error: 'Notification center unavailable' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceSameOrigin(req, res)) return;
  try { validateBodySize(req, 8_000); } catch (e) { return res.status(413).json({ error: e.message }); }

  try {
    const notification = await createAdminNotification(user.id, req.body || {});
    return res.status(201).json({ notification });
  } catch (error) {
    const status = Number(error?.statusCode);
    if (status >= 400 && status < 500) return res.status(status).json({ error: error.message });
    console.error('admin.notification_create_failed', error);
    return res.status(503).json({ error: 'Notification could not be created' });
  }
}
