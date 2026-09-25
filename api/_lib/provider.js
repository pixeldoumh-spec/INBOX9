/**
 * Internal fulfillment-engine contract.
 * INBOX9 uses this interface for its deterministic synthetic number/OTP engine.
 * No external provider or SMS network is called by these methods.
 */
export function createProviderAdapter({
  listServices,
  reserveNumber,
  getActivation,
  cancelActivation,
  health,
  capabilities = {},
}) {
  const methods = { listServices, reserveNumber, getActivation, cancelActivation, health };
  for (const [name, fn] of Object.entries(methods)) {
    if (typeof fn !== 'function') throw new TypeError(`Fulfillment engine requires ${name}()`);
  }
  const providerCapabilities = Object.freeze({
    listServices: capabilities.listServices !== false,
    reserveNumber: capabilities.reserveNumber !== false,
    getActivation: capabilities.getActivation !== false,
    cancelActivation: capabilities.cancelActivation === true,
    health: capabilities.health !== false,
    safeToRetryReserve: capabilities.safeToRetryReserve === true,
  });
  return Object.freeze({ ...methods, capabilities: providerCapabilities });
}

export function normalizeProviderActivation(value) {
  if (!value?.providerActivationId || !value?.number || !value?.status) {
    throw new Error('Fulfillment engine returned an invalid activation');
  }
  return {
    providerActivationId: String(value.providerActivationId),
    serviceId: value.serviceId ?? value.metadata?.serviceId ?? null,
    serviceName: value.serviceName ?? value.metadata?.serviceName ?? null,
    number: String(value.number),
    status: String(value.status),
    otp: value.otp == null ? null : String(value.otp),
    createdAt: Number(value.createdAt),
    expiresAt: Number(value.expiresAt),
    mockOtpAt: value.mockOtpAt == null ? null : Number(value.mockOtpAt),
    metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : {},
  };
}
