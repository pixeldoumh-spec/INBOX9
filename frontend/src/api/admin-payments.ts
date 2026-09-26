import { apiRequest } from './client';
import type { AdminPaymentReconciliation, AdminRecharge, PaymentSettings } from './types';
export function getAdminRecharges(){return apiRequest<{recharges:AdminRecharge[];persistent:boolean}>('/api/admin/recharges');}
export function reviewAdminRecharge(id:string,input:{decision:'approve'|'reject'|'flag';reason?:string;verifiedAmount?:number;verifiedUtr?:string;externalReference?:string}){return apiRequest<{recharge:AdminRecharge}>('/api/admin/recharges/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify(input)});}
export function getAdminPaymentReconciliation(){return apiRequest<AdminPaymentReconciliation>('/api/admin/payment-reconciliation');}
export function updatePaymentSettings(input:Partial<PaymentSettings>){return apiRequest<{paymentSettings:PaymentSettings}>('/api/admin/payment-settings',{method:'PATCH',body:JSON.stringify(input)});}