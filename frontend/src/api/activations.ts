import { apiRequest } from './client';
import type { Activation, ActivationsResponse } from './types';

export function getActivations() {
  return apiRequest<ActivationsResponse>('/api/activations');
}

export function getActivation(activationId: string) {
  return apiRequest<Activation>(
    '/api/activations/' + encodeURIComponent(activationId),
  );
}

export function createActivation(serviceId: string, idempotencyKey: string) {
  return apiRequest<Activation & { walletBalancePaise: number }>(
    '/api/activations',
    {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ serviceId }),
    },
  );
}

export function cancelActivation(activationId: string) {
  return apiRequest<Activation & { refundPaise?: number }>(
    '/api/activations/' +
      encodeURIComponent(activationId) +
      '/cancel',
    { method: 'POST' },
  );
}
