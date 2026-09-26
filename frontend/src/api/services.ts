import { apiRequest } from './client';
import type { Service, ServiceCatalogResponse } from './types';

function isService(value: unknown): value is Service {
  return Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as Service).id === 'string' &&
    typeof (value as Service).name === 'string';
}

/**
 * Normalize the catalog response at the API boundary.
 *
 * Production previously crashed when a cached/legacy payload exposed
 * `services` as a non-array value. The UI expects an array everywhere,
 * so malformed/legacy shapes are converted here instead of reaching
 * React components.
 */
function normalizeCatalog(payload: unknown): ServiceCatalogResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid service catalog response');
  }

  const record = payload as Record<string, unknown>;
  const raw = record.services;
  let rows: unknown[] = [];

  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === 'object') {
    const nested = (raw as Record<string, unknown>).data;
    if (Array.isArray(nested)) {
      rows = nested;
    } else {
      rows = Object.values(raw);
    }
  } else if (Array.isArray(record.data)) {
    rows = record.data;
  } else if (record.data && typeof record.data === 'object') {
    const nested = (record.data as Record<string, unknown>).services;
    if (Array.isArray(nested)) rows = nested;
  }

  const services = rows.filter(isService);

  if (raw != null && services.length === 0 && rows.length > 0) {
    throw new Error('Invalid service catalog payload');
  }

  return {
    country: typeof record.country === 'string' ? record.country : 'IN',
    currency: typeof record.currency === 'string' ? record.currency : 'INR',
    services,
  };
}

export async function getServices() {
  const payload = await apiRequest<unknown>('/api/services');
  return normalizeCatalog(payload);
}
