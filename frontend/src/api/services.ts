import { apiRequest } from './client';
import type { ServiceCatalogResponse } from './types';

export function getServices() {
  return apiRequest<ServiceCatalogResponse>('/api/services');
}
