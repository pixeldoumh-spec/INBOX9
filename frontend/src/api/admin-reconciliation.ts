import { apiRequest } from './client';

export type WalletReconIssue={id:string;runId:string;userId:string;email:string|null;recordedBalancePaise:number;ledgerBalancePaise:number;differencePaise:number;createdAt:number;resolvedAt:number|null};
export type WalletReconRun={runId:string;status:'Passed'|'Mismatch'|'Failed';walletsChecked:number;mismatchesFound:number;startedAt:number;completedAt:number|null;errorMessage:string|null;issues:WalletReconIssue[]};
export type WalletReconResponse={latest:WalletReconRun|null;openIssues:WalletReconIssue[]};
export type AuditLog={id:string;actorUserId:string|null;actorEmail:string|null;action:string;targetType:string;targetId:string|null;metadata:Record<string,unknown>;createdAt:number};
export type AuditResponse={logs:AuditLog[];pagination:{limit:number;offset:number;hasMore:boolean;total:number}};
export function getAdminWalletReconciliation(limit=100){return apiRequest<WalletReconResponse>('/api/admin/wallet-reconciliation?limit='+encodeURIComponent(String(limit)));}
export function runAdminWalletReconciliation(limit=10000){return apiRequest<WalletReconRun>('/api/admin/wallet-reconciliation',{method:'POST',body:JSON.stringify({limit})});}
export function setAdminReconIssueResolved(issueId:string,resolved=true){return apiRequest<{issue:WalletReconIssue}>('/api/admin/wallet-reconciliation',{method:'PATCH',body:JSON.stringify({issueId,resolved})});}
export function getAdminAudit(params:{q?:string;action?:string;targetType?:string;limit?:number;offset?:number}={}) {
 const p=new URLSearchParams();
 if(params.q)p.set('q',params.q);
 if(params.action)p.set('action',params.action);
 if(params.targetType)p.set('targetType',params.targetType);
 if(params.limit)p.set('limit',String(params.limit));
 if(params.offset)p.set('offset',String(params.offset));
 return apiRequest<AuditResponse>('/api/admin/audit'+(p.toString()?'?'+p.toString():''));
}
