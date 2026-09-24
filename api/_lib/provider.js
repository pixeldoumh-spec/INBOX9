/**
 * Internal fulfillment-engine contract.
 * INBOX9 uses this interface for its deterministic synthetic number/OTP engine.
 * No external provider or SMS network is called by these methods.
 */
export function createProviderAdapter({ listServices, reserveNumber, getActivation, cancelActivation, health }) {
  const methods = { listServices, reserveNumber, getActivation, cancelActivation, health };
  for (const [name, fn] of Object.entries(methods)) {
    if (typeof fn !== 'function') throw new TypeError(`Fulfillment engine requires ${name}()`);
  }
  return Object.freeze(methods);
}

export function normalizeProviderActivation(value) {
  if (!value?.providerActivationId || !value?.number || !value?.status) {
    throw new Error('Fulfillment engine returned an invalid activation');
  }
  return {
    providerActivationId: String(value.providerActivationId),
    number: String(value.number),
    status: String(value.status),
    otp: value.otp == null ? null : String(value.otp),
    createdAt: Number(value.createdAt),
    expiresAt: Number(value.expiresAt),
    mockOtpAt: value.mockOtpAt == null ? null : Number(value.mockOtpAt),
    metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : {},
  };
}
