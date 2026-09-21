/**
 * Provider boundary. Upstream integrations must be explicitly authorized and
 * implemented server-side. The browser never talks to a provider directly.
 */
export function createProviderAdapter({ listServices, reserveNumber, getActivation, cancelActivation, health }) {
  const methods = { listServices, reserveNumber, getActivation, cancelActivation, health };
  for (const [name, fn] of Object.entries(methods)) {
    if (typeof fn !== 'function') throw new TypeError(`Provider adapter requires ${name}()`);
  }
  return Object.freeze(methods);
}

export function normalizeProviderActivation(value) {
  if (!value?.providerActivationId || !value?.number || !value?.status) {
    throw new Error('Provider returned an invalid activation');
  }
  return {
    providerActivationId: String(value.providerActivationId),
    number: String(value.number),
    status: String(value.status),
    otp: value.otp == null ? null : String(value.otp),
    createdAt: Number(value.createdAt),
    expiresAt: Number(value.expiresAt),
      metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : {},
  };
}
