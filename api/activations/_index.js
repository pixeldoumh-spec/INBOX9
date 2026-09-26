import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { getService } from '../_lib/catalog.js';
import { getSyntheticServer } from '../_lib/synthetic-servers.js';
import { getPersistedService } from '../_lib/service-repository.js';
import { dbEnabled } from '../_lib/db.js';
import { isSyntheticProduction } from '../_lib/runtime-config.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { createActivation, listActivations } from '../_lib/activation-repository.js';
import { reserveMock, claimMockActivationIdempotency, completeMockActivationIdempotency, debitMockWallet, listMockActivations } from '../_lib/mock.js';
import { validateIdempotencyKey, hashActivationRequest, claimActivationKey, completeActivationKey, failActivationKey, markActivationKeyStuckSafe } from '../_lib/idempotency.js';

async function currentUser(req) {
  return dbEnabled() ? getSessionUser(req) : getMockSession(req);
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  const user = await currentUser(req);
  try { requireUser(user); } catch (e) { return res.status(401).json({ error: e.message }); }

  if (process.env.NODE_ENV === 'production' && !dbEnabled() && !isSyntheticProduction()) return res.status(503).json({ error: 'Activation database is not configured' });
  if (req.method === 'GET') {
    if (!await rateLimitAsync(req, res, 'activation-list', 60, 60_000, user.id)) return;
    if (dbEnabled()) return res.status(200).json({ activations: await listActivations(user.id), persistent: true });
    return res.status(200).json({ activations: listMockActivations(user), persistent: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'activation-create', 30, 60_000) || !enforceSameOrigin(req, res)) return;
  try { validateBodySize(req); } catch (e) { return res.status(413).json({ error: e.message }); }
  const serviceId = req.body?.serviceId;
  if (!serviceId) return res.status(400).json({ error: 'Service id is required' });
  const serverId = req.body?.serverId ? String(req.body.serverId).trim().toLowerCase() : null;
  if (serverId && !getSyntheticServer(serverId)) {
    return res.status(400).json({ error: 'Unknown server', code: 'UNKNOWN_SYNTHETIC_SERVER' });
  }
  let idempotencyKey = null;
  if (dbEnabled()) {
    try { idempotencyKey = validateIdempotencyKey(req.headers?.['idempotency-key']); }
    catch (error) { return res.status(400).json({ error: error.message, code: error.code }); }
  }
  if (!dbEnabled()) {
    const service = getService(serviceId);
    if (!service) return res.status(400).json({ error: 'Unknown service' });
    let mockClaim = null;
    const requestHash = JSON.stringify({ serviceId, serverId });
    if (req.headers?.['idempotency-key']) {
      try {
        mockClaim = claimMockActivationIdempotency(user, req.headers['idempotency-key'], requestHash);
        if (mockClaim.state === 'completed') {
          res.setHeader('X-Idempotent-Replay', 'true');
          return res.status(201).json(mockClaim.response);
        }
        if (mockClaim.state === 'processing') return res.status(409).json({ error: 'An activation request with this Idempotency-Key is already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' });
      } catch (error) {
        return res.status(409).json({ error: error.message, code: error.code });
      }
    }
    try {
      const activation = reserveMock({ ...service, serverId, userId: user.id, userEmail: user.email });
      const balancePaise = debitMockWallet(user, Number(service.pricePaise || 0), activation.id, `Activation • ${service.name}`);
      const response = { ...activation, userId: user.id, walletBalancePaise: balancePaise };
      if (req.headers?.['idempotency-key']) completeMockActivationIdempotency(user, req.headers['idempotency-key'], response);
      return res.status(201).json(response);
    } catch (error) {
      if (req.headers?.['idempotency-key']) {
        // Keep a failed mock claim usable for a later request with a new key.
      }
      if (error.code === 'INSUFFICIENT_BALANCE') return res.status(402).json({ error: error.message, code: error.code });
      return res.status(409).json({ error: error.message, code: error.code });
    }
  }
  const persistedService = await getPersistedService(serviceId);
  if (!persistedService || persistedService.active === false) return res.status(409).json({ error: 'Service is unavailable' });
  if (dbEnabled()) {
    const requestHash = hashActivationRequest({ serviceId, serverId });
    try {
      const claim = await claimActivationKey(user.id, idempotencyKey, requestHash);
      if (claim.state === 'completed') {
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.status(201).json(claim.response);
      }
      if (claim.state === 'processing') {
        res.setHeader('Retry-After', '2');
        return res.status(409).json({ error: 'An activation request with this Idempotency-Key is already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' });
      }
      try {
        const result = await createActivation(persistedService, user.id, { idempotencyKey, requestHash }, { serverId });
        return res.status(201).json({ ...result.activation, walletBalancePaise: result.balancePaise });
      } catch (error) {
        if (error.code && ['INSUFFICIENT_BALANCE','OUT_OF_STOCK','SERVICE_UNAVAILABLE','NO_PROVIDER','ACTIVATION_QUOTA_EXCEEDED'].includes(error.code)) {
          await failActivationKey(user.id, idempotencyKey, error.code, error.message);
        }
        throw error;
      }
    } catch (error) {
      console.error('activation.create_failed', error);
      if (error.code === 'IDEMPOTENCY_KEY_REUSED' || error.code === 'IDEMPOTENCY_KEY_UNUSABLE') return res.status(409).json({ error: error.message, code: error.code });
      if (error.code === 'INSUFFICIENT_BALANCE') return res.status(402).json({ error: error.message, code: error.code });
      if (error.code === 'OUT_OF_STOCK' || error.code === 'SERVICE_UNAVAILABLE') return res.status(409).json({ error: error.message, code: error.code });
      if (error.code === 'NO_PROVIDER') return res.status(503).json({ error: error.message, code: error.code });
      if (error.code === 'ACTIVATION_QUOTA_EXCEEDED') return res.status(429).json({ error: error.message, code: error.code });
      return res.status(503).json({ error: 'Activation service unavailable' });
    }
  }
  try {
    const result = await createActivation(persistedService, user.id);
    return res.status(201).json({ ...result.activation, walletBalancePaise: result.balancePaise });
  } catch (error) {
    console.error('activation.create_failed', error);
    if (error.code === 'INSUFFICIENT_BALANCE') return res.status(402).json({ error: error.message, code: error.code });
    if (error.code === 'OUT_OF_STOCK' || error.code === 'SERVICE_UNAVAILABLE') return res.status(409).json({ error: error.message, code: error.code });
    if (error.code === 'NO_PROVIDER') return res.status(503).json({ error: error.message, code: error.code });
    return res.status(503).json({ error: 'Activation service unavailable' });
  }
}
