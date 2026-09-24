import { getPool, withTransaction } from './db.js';
import { recordAuditTx } from './admin-repository.js';

const SETTINGS_ID = 'default';
const DEFAULT_MERCHANT = 'INBOX9';
const DEFAULT_INSTRUCTIONS = 'Pay the exact amount and keep the UTR / transaction reference.';
const MAX_QR_CHARS = 350_000;

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function normalizeUpiId(value) {
  const raw = clean(value, 128);
  if (!raw) return null;
  if (!/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9._-]{2,64}$/.test(raw)) {
    const error = new Error('Enter a valid merchant UPI ID');
    error.code = 'INVALID_UPI_ID';
    error.statusCode = 400;
    throw error;
  }
  return raw;
}

function normalizeQrImage(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (raw.length > MAX_QR_CHARS) {
    const error = new Error('QR image is too large');
    error.code = 'QR_IMAGE_TOO_LARGE';
    error.statusCode = 400;
    throw error;
  }
  if (/^https:\/\/[^\s]+$/i.test(raw) && raw.length <= 2048) return raw;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw)) return raw;
  const error = new Error('QR must be an HTTPS image URL or PNG/JPEG/WebP image data');
  error.code = 'INVALID_QR_IMAGE';
  error.statusCode = 400;
  throw error;
}

export function normalizePaymentSettings(input = {}) {
  return {
    upiId: normalizeUpiId(input.upiId),
    merchantName: clean(input.merchantName || DEFAULT_MERCHANT, 80) || DEFAULT_MERCHANT,
    instructions: clean(input.instructions || DEFAULT_INSTRUCTIONS, 500) || DEFAULT_INSTRUCTIONS,
    qrImage: normalizeQrImage(input.qrImage),
  };
}

function mapSettings(row) {
  return {
    id: row.id,
    upiId: row.upi_id || null,
    merchantName: row.merchant_name || DEFAULT_MERCHANT,
    instructions: row.instructions || DEFAULT_INSTRUCTIONS,
    qrImage: row.qr_image || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : null,
  };
}

export async function getPaymentSettings() {
  const pool = await getPool();
  const result = await pool.query(
    'SELECT id,upi_id,merchant_name,instructions,qr_image,updated_at FROM payment_settings WHERE id=$1',
    [SETTINGS_ID]
  );
  if (!result.rowCount) {
    return { id: SETTINGS_ID, upiId: null, merchantName: DEFAULT_MERCHANT, instructions: DEFAULT_INSTRUCTIONS, qrImage: null, updatedAt: null };
  }
  return mapSettings(result.rows[0]);
}

export async function updatePaymentSettings(adminUserId, input = {}) {
  return withTransaction(async client => {
    const currentResult = await client.query(
      'SELECT id,upi_id,merchant_name,instructions,qr_image FROM payment_settings WHERE id=$1 FOR UPDATE',
      [SETTINGS_ID]
    );
    const current = currentResult.rows[0] || {
      id: SETTINGS_ID,
      upi_id: null,
      merchant_name: DEFAULT_MERCHANT,
      instructions: DEFAULT_INSTRUCTIONS,
      qr_image: null
    };
    const merged = normalizePaymentSettings({
      upiId: Object.prototype.hasOwnProperty.call(input, 'upiId') ? input.upiId : current.upi_id,
      merchantName: Object.prototype.hasOwnProperty.call(input, 'merchantName') ? input.merchantName : current.merchant_name,
      instructions: Object.prototype.hasOwnProperty.call(input, 'instructions') ? input.instructions : current.instructions,
      qrImage: Object.prototype.hasOwnProperty.call(input, 'qrImage') ? input.qrImage : current.qr_image
    });
    const result = await client.query(
      `INSERT INTO payment_settings (id,upi_id,merchant_name,instructions,qr_image,updated_at,updated_by)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6)
       ON CONFLICT (id) DO UPDATE SET
         upi_id=EXCLUDED.upi_id,
         merchant_name=EXCLUDED.merchant_name,
         instructions=EXCLUDED.instructions,
         qr_image=EXCLUDED.qr_image,
         updated_at=NOW(),
         updated_by=EXCLUDED.updated_by
       RETURNING id,upi_id,merchant_name,instructions,qr_image,updated_at`,
      [SETTINGS_ID, merged.upiId, merged.merchantName, merged.instructions, merged.qrImage, adminUserId]
    );
    await recordAuditTx(client, adminUserId, 'payment.settings.update', 'payment_settings', SETTINGS_ID, {
      upiChanged: String(current.upi_id || '') !== String(merged.upiId || ''),
      qrChanged: String(current.qr_image || '') !== String(merged.qrImage || ''),
      merchantNameChanged: String(current.merchant_name || '') !== merged.merchantName,
      instructionsChanged: String(current.instructions || '') !== merged.instructions
    });
    return mapSettings(result.rows[0]);
  });
}
