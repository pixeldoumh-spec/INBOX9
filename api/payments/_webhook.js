import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import {
  normalizePaymentWebhook,
  paymentWebhookProvider,
  paymentWebhookSecret,
  processPaymentWebhook,
  verifyPaymentWebhookSignature
} from '../_lib/payment-webhook.js';
import { captureException } from '../_lib/observability.js';

function responseError(res, error) {
  const status = Number(error?.statusCode);
  if (status >= 400 && status < 600) {
    return res.status(status).json({ code: error?.code || undefined, error: error.message });
  }
  captureException(error, { method: 'POST', path: '/api/payments/webhook', statusCode: 503 });
  return res.status(503).json({ error: 'Payment webhook temporarily unavailable' });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!paymentWebhookSecret()) {
    return res.status(503).json({
      code: 'PAYMENT_WEBHOOK_NOT_CONFIGURED',
      error: 'Payment webhook is not configured'
    });
  }

  if (!await rateLimitAsync(req, res, 'payment-webhook', 120, 60_000)) return;

  try {
    verifyPaymentWebhookSignature(
      String(req.rawBody || ''),
      String(req.headers['x-inbox9-signature'] || ''),
      paymentWebhookSecret()
    );
    const normalized = normalizePaymentWebhook(req.body || {});
    const providerHeader = String(req.headers['x-inbox9-provider'] || '').trim();
    const provider = providerHeader || paymentWebhookProvider();
    if (providerHeader && providerHeader !== paymentWebhookProvider()) {
      const error = new Error('Payment webhook provider mismatch');
      error.code = 'PAYMENT_WEBHOOK_PROVIDER_MISMATCH';
      error.statusCode = 401;
      throw error;
    }
    const result = await processPaymentWebhook({
      rawBody: String(req.rawBody || ''),
      normalized,
      provider
    });
    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return responseError(res, error);
  }
}
