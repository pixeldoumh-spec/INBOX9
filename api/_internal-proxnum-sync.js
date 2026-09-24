import crypto from 'node:crypto';
import { applySecurityHeaders, requestId } from './_lib/security.js';
import { verifyGithubOidcToken } from './_lib/github-oidc.js';
import { syncProxnumIndiaInventory, proxnumInventoryStatus } from './_lib/proxnum-inventory-repository.js';

function validSharedSecret(req) {
  const expected = String(process.env.CRON_SECRET || '');
  if (!expected) return false;
  const bearer = String(req.headers.authorization || '');
  const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : String(req.headers['x-inbox9-cron-secret'] || '');
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let authorized = validSharedSecret(req);
  if (!authorized && String(process.env.GITHUB_OIDC_RECONCILIATION || '').trim().toLowerCase() === 'true') {
    try {
      const bearer = String(req.headers.authorization || '');
      const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
      await verifyGithubOidcToken(supplied);
      authorized = true;
    } catch {}
  }
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await syncProxnumIndiaInventory({ force: true });
    return res.status(200).json({ ...result, status: proxnumInventoryStatus() });
  } catch (error) {
    console.error('internal.proxnum_inventory_sync_failed', error);
    return res.status(503).json({ error: 'Proxnum inventory synchronization unavailable' });
  }
}
