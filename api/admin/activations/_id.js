import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { getAdminActivation, recordAudit } from '../../_lib/admin-repository.js';
import { cancelActivation } from '../../_lib/activation-repository.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'admin-activation-detail', 40, 60_000)) return;
  if (!dbEnabled()) return res.status(503).json({ error: 'Activation operations require PostgreSQL' });

  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }

  const id = String(req.query?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Activation id is required' });

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await getAdminActivation(id));
    } catch (error) {
      if (Number(error?.statusCode) === 404) return res.status(404).json({ error: 'Activation not found' });
      console.error('admin.activation_detail_failed', error);
      return res.status(503).json({ error: 'Activation detail unavailable' });
    }
  }

  if (!enforceSameOrigin(req, res)) return;
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (action !== 'cancel') return res.status(400).json({ error: 'Action must be cancel' });

  try {
    const current = await getAdminActivation(id);
    const currentStatus = current.activation.status;
    if (currentStatus !== 'Active') {
      return res.status(409).json({ error: 'Only an active activation can be cancelled from admin operations', status: currentStatus });
    }

    const result = await cancelActivation(id, current.activation.userId);
    if (!result) return res.status(404).json({ error: 'Activation not found' });

    await recordAudit(user.id, 'activation.admin_cancel_requested', 'activation', id, {
      userId: current.activation.userId,
      email: current.activation.email,
      previousStatus: currentStatus,
      resultStatus: result.activation?.status || null,
      pending: Boolean(result.pending),
    });

    return res.status(result.pending ? 202 : 200).json({
      ...result,
      activation: result.activation ? {
        id: result.activation.id,
        status: result.activation.status,
        refundPaise: result.activation.refundPaise ?? result.activation.pricePaise,
      } : null,
    });
  } catch (error) {
    try {
      await recordAudit(user.id, 'activation.admin_cancel_failed', 'activation', id, { error: String(error?.message || 'Admin cancellation failed').slice(0,500) });
    } catch {}
    if (error?.code === 'PROVIDER_CANCEL_FAILED') return res.status(503).json({ error: error.message, code: error.code });
    console.error('admin.activation_cancel_failed', error);
    return res.status(503).json({ error: 'Unable to cancel activation safely' });
  }
}
