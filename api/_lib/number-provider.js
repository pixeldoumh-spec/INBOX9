/**
 * Provider contract for real inbound-number inventory.
 * Implementations must return only numbers the provider has assigned to INBOX9
 * under an agreement that permits the intended customer-facing use.
 */
export function createNumberInventoryProvider({ listNumbers, health }) {
  if (typeof listNumbers !== 'function') throw new TypeError('Number provider requires listNumbers()');
  if (typeof health !== 'function') throw new TypeError('Number provider requires health()');
  return Object.freeze({ listNumbers, health });
}

export function normalizeProviderNumber(value) {
  if (!value?.providerNumberId || !value?.phoneNumber) {
    throw new Error('Number provider returned an invalid number');
  }
  return {
    providerNumberId: String(value.providerNumberId),
    phoneNumber: String(value.phoneNumber),
    country: String(value.country || 'IN'),
    region: value.region == null ? null : String(value.region),
    numberType: value.numberType == null ? null : String(value.numberType),
    smsCapable: Boolean(value.smsCapable),
    voiceCapable: Boolean(value.voiceCapable),
    status: value.status || 'available',
    providerMetadata: value.providerMetadata && typeof value.providerMetadata === 'object' ? value.providerMetadata : {},
  };
}
