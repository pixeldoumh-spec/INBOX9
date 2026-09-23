import crypto from 'node:crypto';
import { generateSyntheticOtp, syntheticOtpTiming } from './synthetic-otp.js';
import { getSyntheticServer, getServerForSlot, SYNTHETIC_CAPACITY } from './synthetic-servers.js';

const activations = new Map();
const activationIdempotency = new Map();
const recharges = new Map();
const wallets = new Map();
const ledgers = new Map();
const TTL_MS = 3 * 60 * 1000;
const SYNTHETIC_STARTING_BALANCE_PAISE = 0;

export function makeId(prefix = 'ORD') {
  return `${prefix}-${crypto.randomInt(10000, 100000)}`;
}

export function reserveMock(service) {
  const now = Date.now();
  const requestedServerId = String(service?.serverId || '').trim().toLowerCase();
  const server = requestedServerId ? getSyntheticServer(requestedServerId, SYNTHETIC_CAPACITY) : null;
  if (requestedServerId && !server) {
    const error = new Error('Unknown synthetic server');
    error.code = 'UNKNOWN_SYNTHETIC_SERVER';
    throw error;
  }
  const index = server
    ? crypto.randomInt(server.startSlot, server.endSlot + 1)
    : crypto.randomInt(1, SYNTHETIC_CAPACITY + 1);
  const assignedServer = server || getServerForSlot(index, SYNTHETIC_CAPACITY);
  const providerActivationId = `SYN-LOCAL-${crypto.randomUUID()}`;
  const mockOtpAt = now + syntheticOtpTiming(service.id || service.name, index, providerActivationId);
  const activation = {
    id: makeId(),
    userId: service.userId || null,
    userEmail: userKey(service.userEmail || ''),
    serviceId: service.id,
    service: service.name,
    country: 'IN',
    number: `+91 00000 ${String(index).padStart(5, '0')}`,
    pricePaise: service.pricePaise,
    currency: 'INR',
    status: 'Active',
    otp: null,
    createdAt: now,
    expiresAt: now + TTL_MS,
    mockOtpAt,
    serverId: assignedServer?.id || null,
    providerActivationId,
    syntheticOtp: generateSyntheticOtp(service.id || service.name, index, providerActivationId),
    metadata: {
      engine: 'synthetic-local',
      slot: index,
      serverId: assignedServer?.id || null,
      serverName: assignedServer?.name || null,
      serverCapacity: assignedServer?.capacity || null
    }
  };
  activations.set(activation.id, activation);
  return activation;
}

export function getMock(id) {
  const item = activations.get(id);
  if (!item) return null;
  transition(item);
  return item;
}

export function listMockActivations(user) {
  const email = userKey(user);
  return [...activations.values()]
    .filter(item => item.userEmail === email)
    .map(item => {
      transition(item);
      return item;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function cancelMock(id) {
  const item = activations.get(id);
  if (!item) return null;
  transition(item);
  if (item.status === 'Active') {
    item.status = 'Refunded';
    item.refundPaise = item.pricePaise;
    item.refundCredited = false;
  }
  return item;
}


function userKey(userOrEmail) {
  return String(userOrEmail?.email || userOrEmail || '').trim().toLowerCase();
}

function ensureMockWallet(email) {
  const key = userKey(email);
  if (!wallets.has(key)) wallets.set(key, SYNTHETIC_STARTING_BALANCE_PAISE);
  if (!ledgers.has(key)) ledgers.set(key, []);
  return key;
}

export function getMockWallet(email) {
  const key = ensureMockWallet(email);
  return {
    balancePaise: Number(wallets.get(key) || 0),
    currency: 'INR',
    ledger: [...ledgers.get(key)].sort((a, b) => b.createdAt - a.createdAt),
    recharges: [...recharges.values()]
      .filter(item => item.email === key)
      .sort((a, b) => b.submittedAt - a.submittedAt),
  };
}

function addLedger(email, entryType, amountPaise, referenceType, referenceId, description) {
  const key = ensureMockWallet(email);
  const entries = ledgers.get(key);
  entries.unshift({
    id: makeId('LED'),
    type: entryType,
    amountPaise: Number(amountPaise),
    referenceType,
    referenceId,
    description,
    createdAt: Date.now()
  });
}

export function createMockRecharge(user, amountPaise, utr, upiId) {
  const email = ensureMockWallet(user);
  const normalizedUtr = String(utr || '').trim();
  const duplicate = [...recharges.values()].find(item => item.utr.toLowerCase() === normalizedUtr.toLowerCase());
  if (duplicate) {
    const error = new Error('This UTR has already been submitted');
    error.code = 'DUPLICATE_UTR';
    throw error;
  }
  const recharge = {
    id: makeId('RCH'),
    userId: user.id,
    email,
    amountPaise: Number(amountPaise),
    utr: normalizedUtr,
    paymentMethod: 'UPI',
    upiId,
    status: 'Pending',
    rejectionReason: null,
    submittedAt: Date.now(),
    reviewedAt: null,
    reviewedBy: null
  };
  recharges.set(recharge.id, recharge);
  return recharge;
}

export function listMockRecharges(user) {
  const email = userKey(user);
  return [...recharges.values()]
    .filter(item => item.email === email)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export function listPendingMockRecharges() {
  return [...recharges.values()]
    .filter(item => item.status === 'Pending')
    .sort((a, b) => a.submittedAt - b.submittedAt);
}

export function reviewMockRecharge(id, admin, decision, reason = '') {
  const recharge = recharges.get(String(id));
  if (!recharge) {
    const error = new Error('Recharge request not found');
    error.statusCode = 404;
    throw error;
  }
  if (recharge.status !== 'Pending') throw new Error('Recharge request has already been reviewed');
  if (!['approve', 'reject'].includes(decision)) throw new Error('Decision must be approve or reject');
  recharge.reviewedAt = Date.now();
  recharge.reviewedBy = userKey(admin);
  if (decision === 'reject') {
    recharge.status = 'Rejected';
    recharge.rejectionReason = String(reason || 'Payment could not be verified').slice(0, 250);
    return recharge;
  }
  const key = ensureMockWallet(recharge.email);
  wallets.set(key, Number(wallets.get(key) || 0) + recharge.amountPaise);
  recharge.status = 'Approved';
  addLedger(key, 'credit', recharge.amountPaise, 'recharge', recharge.id, `UPI recharge approved • ${recharge.utr}`);
  return recharge;
}

export function debitMockWallet(user, amountPaise, activationId, description) {
  const email = ensureMockWallet(user);
  const balance = Number(wallets.get(email) || 0);
  if (balance < amountPaise) {
    const error = new Error('Insufficient wallet balance. Please recharge your account.');
    error.code = 'INSUFFICIENT_BALANCE';
    throw error;
  }
  wallets.set(email, balance - amountPaise);
  addLedger(email, 'debit', amountPaise, 'activation', activationId, description);
  return wallets.get(email);
}

export function creditMockWallet(user, amountPaise, activationId, description) {
  const email = ensureMockWallet(user);
  wallets.set(email, Number(wallets.get(email) || 0) + amountPaise);
  addLedger(email, 'credit', amountPaise, 'activation_refund', activationId, description);
  return wallets.get(email);
}

export function claimMockActivationIdempotency(user, key, requestHash) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return { state: 'disabled' };
  const storageKey = `${userKey(user)}:${normalizedKey}`;
  const prior = activationIdempotency.get(storageKey);
  if (!prior) {
    activationIdempotency.set(storageKey, { requestHash, response: null });
    return { state: 'claimed', storageKey };
  }
  if (prior.requestHash !== requestHash) {
    const error = new Error('This Idempotency-Key was already used for a different activation request.');
    error.code = 'IDEMPOTENCY_KEY_REUSED';
    throw error;
  }
  if (prior.response) return { state: 'completed', response: prior.response };
  return { state: 'processing' };
}

export function completeMockActivationIdempotency(user, key, response) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;
  const storageKey = `${userKey(user)}:${normalizedKey}`;
  const current = activationIdempotency.get(storageKey);
  if (current) activationIdempotency.set(storageKey, { ...current, response });
}

function transition(item) {
  if (item.status === 'Active' && Date.now() >= item.mockOtpAt) {
    item.status = 'Completed';
    const slot = Number(item.metadata?.slot || 1);
    const key = item.serviceId || item.service || 'service';
    item.otp = generateSyntheticOtp(key, slot, item.providerActivationId).replace(/(\d{3})(\d{3})/, '$1 $2');
  } else if (item.status === 'Active' && Date.now() >= item.expiresAt) {
    item.status = 'Expired';
  }
}

export function resetMocks() {
  activations.clear();
  activationIdempotency.clear();
  recharges.clear();
  wallets.clear();
  ledgers.clear();
}
