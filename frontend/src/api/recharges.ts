import { apiRequest } from './client';
import type { Recharge } from './types';
export function getRecharges(){return apiRequest<{recharges:Recharge[];persistent:boolean;rechargeEnabled:boolean;minPaise:number;maxPaise:number;upiId:string|null}>('/api/recharges');}
export function createRecharge(amount:number,utr:string,customerPaidAt?:string){return apiRequest<Recharge>('/api/recharges',{method:'POST',body:JSON.stringify({amount,utr,customerPaidAt})});}
