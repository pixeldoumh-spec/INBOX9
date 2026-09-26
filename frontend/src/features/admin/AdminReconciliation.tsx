import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminAudit, getAdminWalletReconciliation, runAdminWalletReconciliation, setAdminReconIssueResolved } from '../../api/admin-reconciliation';

function money(paise:number){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function when(value:number|null|undefined){return value?new Date(value).toLocaleString():'—';}
function signedMoney(paise:number){const n=Number(paise||0);return (n<0?'−':'')+money(Math.abs(n));}

export function AdminReconciliationPage(){
 const client=useQueryClient();
 const [auditQ,setAuditQ]=useState('');
 const [action,setAction]=useState('');
 const [targetType,setTargetType]=useState('');
 const [auditOffset,setAuditOffset]=useState(0);
 const walletQ=useQuery({queryKey:['admin-wallet-reconciliation'],queryFn:()=>getAdminWalletReconciliation(500),staleTime:5000,refetchInterval:15000,refetchOnReconnect:true});
 const auditQy=useQuery({queryKey:['admin-audit',auditQ,action,targetType,auditOffset],queryFn:()=>getAdminAudit({q:auditQ,action,targetType,limit:50,offset:auditOffset}),staleTime:5000,refetchInterval:15000,refetchOnReconnect:true});
 const run=useMutation({mutationFn:()=>runAdminWalletReconciliation(),onSuccess:async()=>{await client.invalidateQueries({queryKey:['admin-wallet-reconciliation']});await client.invalidateQueries({queryKey:['admin-audit']})}});
 const resolve=useMutation({mutationFn:({id,resolved}:{id:string;resolved:boolean})=>setAdminReconIssueResolved(id,resolved),onSuccess:async()=>{await client.invalidateQueries({queryKey:['admin-wallet-reconciliation']});await client.invalidateQueries({queryKey:['admin-audit']})}});
 const latest=walletQ.data?.latest||null;
 const open=walletQ.data?.openIssues||[];
 const auditLogs=auditQy.data?.logs||[];
 return <section className="admin-page">
  <div className="admin-page-heading">
   <div><span className="admin-eyebrow">FINANCIAL CONTROL</span><h1>Reconciliation & audit</h1><p>Verify wallet aggregates against the immutable ledger and inspect the administrative history.</p></div>
   <button className="primary-button" type="button" onClick={()=>void run.mutate()} disabled={run.isPending}>{run.isPending?'Running reconciliation…':'Run reconciliation'}</button>
  </div>

  <div className="admin-overview-grid">
   <div className="admin-metric"><span>Latest status</span><strong>{latest?.status||'No run'}</strong><small>{latest?when(latest.completedAt||latest.startedAt):'No reconciliation recorded yet'}</small></div>
   <div className="admin-metric"><span>Wallets checked</span><strong>{latest?.walletsChecked??0}</strong><small>In latest run</small></div>
   <div className="admin-metric"><span>Mismatches</span><strong>{latest?.mismatchesFound??0}</strong><small>Recorded, not auto-repaired</small></div>
   <div className="admin-metric"><span>Open issues</span><strong>{open.length}</strong><small>Require operational review</small></div>
  </div>

  {run.isError?<div className="admin-alert" role="alert"><strong>Reconciliation failed.</strong><span>{run.error instanceof Error?run.error.message:'The reconciliation request could not be completed.'}</span><button className="outline-button" type="button" onClick={()=>void run.mutate()}>Retry</button></div>:null}
  {walletQ.isError?<div className="admin-alert" role="alert"><strong>Reconciliation data unavailable.</strong><span>Could not load the latest run and open issues.</span><button className="outline-button" type="button" onClick={()=>void walletQ.refetch()}>Retry</button></div>:null}

  <section className="admin-panel">
   <div className="admin-panel-heading"><div><span className="admin-eyebrow">WALLET INTEGRITY</span><h2>Latest reconciliation</h2></div>{latest?<span className={'admin-provider-pill '+(latest.status==='Passed'?'is-on':'')}>{latest.status}</span>:null}</div>
   {!latest?<div className="empty-state compact-empty"><h3>No reconciliation run yet</h3><p>Run the wallet reconciliation check to establish a current integrity snapshot.</p></div>:
    <div className="admin-boundary-grid">
     <span>Run ID</span><strong>{latest.runId}</strong>
     <span>Started</span><strong>{when(latest.startedAt)}</strong>
     <span>Completed</span><strong>{when(latest.completedAt)}</strong>
     <span>Mismatches</span><strong>{latest.mismatchesFound}</strong>
    </div>}
  </section>

  <section className="admin-panel">
   <div className="admin-panel-heading"><div><span className="admin-eyebrow">OPEN ISSUES</span><h2>Wallet mismatches</h2></div><span className="admin-status-badge">{open.length}</span></div>
   {open.length?<div className="admin-mini-list">{open.map(issue=><div key={issue.id}>
    <div><strong>{issue.email||issue.userId}</strong><span>{issue.id}</span></div>
    <small>Recorded {money(issue.recordedBalancePaise)} · Ledger {money(issue.ledgerBalancePaise)} · Difference {signedMoney(issue.differencePaise)}</small>
    <p>Detected {when(issue.createdAt)} · This action only records review status; it does not change wallet balances.</p>
    <button className="outline-button" type="button" onClick={()=>void resolve.mutate({id:issue.id,resolved:true})} disabled={resolve.isPending}>Mark reviewed</button>
   </div>)}</div>:<div className="empty-state compact-empty"><h3>No open reconciliation issues</h3><p>The current issue queue is clear.</p></div>}
  </section>

  <section className="admin-panel">
   <div className="admin-panel-heading"><div><span className="admin-eyebrow">AUDIT LEDGER</span><h2>Administrative history</h2></div><span className="admin-status-badge">{auditQy.data?.pagination.total??0}</span></div>
   <div className="admin-services-toolbar">
    <input className="admin-search-input" value={auditQ} onChange={e=>{setAuditQ(e.target.value);setAuditOffset(0)}} placeholder="Search audit ID, actor, action or target" aria-label="Search audit logs"/>
    <input className="admin-search-input" value={action} onChange={e=>{setAction(e.target.value);setAuditOffset(0)}} placeholder="Action filter" aria-label="Filter by audit action"/>
    <input className="admin-search-input" value={targetType} onChange={e=>{setTargetType(e.target.value);setAuditOffset(0)}} placeholder="Target type" aria-label="Filter by target type"/>
   </div>
   {auditQy.isError?<div className="admin-alert" role="alert"><strong>Audit history unavailable.</strong><span>Could not load the administrative history.</span><button className="outline-button" type="button" onClick={()=>void auditQy.refetch()}>Retry</button></div>:null}
   {auditLogs.length?<div className="admin-mini-list">{auditLogs.map(log=><div key={log.id}>
    <div><strong>{log.action}</strong><span>{log.actorEmail||log.actorUserId||'System'}</span></div>
    <small>{log.targetType}{log.targetId?' · '+log.targetId:''} · {when(log.createdAt)}</small>
    {Object.keys(log.metadata||{}).length?<pre className="admin-audit-json">{JSON.stringify(log.metadata,null,2)}</pre>:null}
   </div>)}</div>:!auditQy.isPending?<div className="empty-state compact-empty"><h3>No audit entries match</h3><p>Administrative actions will appear here.</p></div>:null}
   <div className="admin-refresh-row"><button className="outline-button" type="button" disabled={auditOffset===0} onClick={()=>setAuditOffset(Math.max(0,auditOffset-50))}>Previous</button><span>Showing {auditOffset+1}–{auditOffset+auditLogs.length}</span><button className="outline-button" type="button" disabled={!auditQy.data?.pagination.hasMore} onClick={()=>setAuditOffset(auditOffset+50)}>Next</button></div>
  </section>
 </section>;
}
