import { apiRequest } from './client';
import type { Wallet } from './types';

export function getWallet() {
  return apiRequest<Wallet>('/api/wallet');
}
