import { apiRequest } from './client';

export type AdminOverview = {
  users: number;
  activeActivations: number;
  rechargeRequests: number;
  pendingRechargePaise: number;
  walletBalancePaise: number;
  approvedRechargePaise: number;
  totalDebitsPaise: number;
  persistent: boolean;
};

export function getAdminOverview(){
  return apiRequest<AdminOverview>('/api/admin/overview');
}
