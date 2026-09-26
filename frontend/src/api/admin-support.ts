import { apiRequest } from './client';

export type AdminSupportMessage={id:string;authorRole:'customer'|'admin';authorUserId?:string;body:string;createdAt:number};
export type AdminSupportTicket={
 id:string;userId:string;email?:string|null;category:string;subject:string;message:string;status:'Open'|'In Progress'|'Resolved'|'Closed';
 activationId?:string|null;rechargeId?:string|null;createdAt:number;updatedAt:number;resolvedAt?:number|null;adminNote?:string|null;
 assignedAdminId?:string|null;assignedAdminEmail?:string|null;
 activation?:{id:string;status?:string|null;number?:string|null;service?:string|null}|null;
 recharge?:{id:string;status?:string|null;amountPaise?:number|null}|null;
 messages:AdminSupportMessage[];
};
export type AdminSupportResponse={tickets:AdminSupportTicket[]};
export function getAdminSupport(params:{q?:string;status?:string;limit?:number}={}) {
 const p=new URLSearchParams();
 if(params.q)p.set('q',params.q);
 if(params.status&&params.status!=='all')p.set('status',params.status);
 if(params.limit)p.set('limit',String(params.limit));
 return apiRequest<AdminSupportResponse>('/api/admin/support'+(p.toString()?'?'+p.toString():''));
}
export function updateAdminSupport(id:string,input:{status?:string;adminNote?:string|null;assignedAdminId?:string|null;reply?:string}) {
 return apiRequest<{ticket:AdminSupportTicket}>('/api/admin/support/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(input)});
}
