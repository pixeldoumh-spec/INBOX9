import crypto from 'node:crypto';

const activations = new Map();
const TTL_MS = 3 * 60 * 1000;

export function makeId(prefix = 'ORD') {
  return `${prefix}-${crypto.randomInt(10000, 100000)}`;
}

export function reserveMock(service) {
  const now = Date.now();
  const activation = {
    id: makeId(),
    serviceId: service.id,
    service: service.name,
    country: 'IN',
    number: `+91 ${crypto.randomInt(7, 10)}•••• ${crypto.randomInt(1000, 10000)}`,
    pricePaise: service.pricePaise,
    currency: 'INR',
    status: 'Active',
    otp: null,
    createdAt: now,
    expiresAt: now + TTL_MS,
    mockOtpAt: now + crypto.randomInt(12000, 28000)
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

export function cancelMock(id) {
  const item = activations.get(id);
  if (!item) return null;
  transition(item);
  if (item.status === 'Active') {
    item.status = 'Refunded';
    item.refundPaise = item.pricePaise;
  }
  return item;
}

function transition(item) {
  if (item.status === 'Active' && Date.now() >= item.mockOtpAt) {
    item.status = 'Completed';
    item.otp = String(crypto.randomInt(100000, 1000000)).replace(/(\d{3})(\d{3})/, '$1 $2');
  } else if (item.status === 'Active' && Date.now() >= item.expiresAt) {
    item.status = 'Expired';
  }
}

export function resetMocks() {
  activations.clear();
}
