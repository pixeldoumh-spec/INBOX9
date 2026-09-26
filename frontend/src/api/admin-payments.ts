import { apiRequest } from './client';
import type { AdminPaymentReconciliation, AdminRecharge, PaymentSettings } from './types';
export function getAdminRecharges(){return apiRequest<{recharges:AdminRecharge[];persistent:boolean}>('/api/admin/recharges');}
export function reviewAdminRecharge(id:string,input:{decision:'approve'|'reject'|'flag';reason?:string;verifiedAmount?:number;verifiedUtr?:string;externalReference?:string}){return apiRequest<{recharge:AdminRecharge}>('/api/admin/recharges/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify(input)});}
export function getAdminPaymentReconciliation(){return apiRequest<AdminPaymentReconciliation>('/api/admin/payment-reconciliation');}
export function updatePaymentSettings(input:Partial<PaymentSettings>){return apiRequest<{paymentSettings:PaymentSettings}>('/api/admin/payment-settings',{method:'PATCH',body:JSON.stringify(input)});}
export type AdminLedgerEntry={id:string;email:string;userId:string;type:'credit'|'debit';amountPaise:number;referenceType:string;referenceId:string;description:string;createdAt:number};
export type AdminLedgerResponse={ledger:AdminLedgerEntry[];summary:{total:number;credits:number;debits:number;creditPaise:number;debitPaise:number};pagination:{limit:number;offset:number;hasMore:boolean}};
export function getAdminLedger(params:{q?:string;type?:'all'|'credit'|'debit';limit?:number;offset?:number}={}){
 const p=new URLSearchParams();
 if(params.q)p.set('q',params.q);
 if(params.type&&params.type!=='all')p.set('type',params.type);
 if(params.limit)p.set('limit',String(params.limit));
 if(params.offset)p.set('offset',String(params.offset));
 return apiRequest<AdminLedgerResponse>('/api/admin/ledger'+(p.toString()?'?'+p.toString():''));
}
