import { useQuery } from '@tanstack/react-query';
import { getAdminOverview } from '../../api/admin';

function money(paise:number){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}

export function AdminDashboardPage(){
  const q=useQuery({queryKey:['admin-overview'],queryFn:getAdminOverview,staleTime:10_000,refetchInterval:15_000,refetchOnReconnect:true});
  if(q.isPending)return <section className="admin-page"><div className="admin-page-heading"><span className="admin-eyebrow">CONTROL ROOM</span><h1>Admin dashboard</h1><p>Preparing live operational metrics…</p></div><div className="admin-overview-grid">{Array.from({length:6},(_,i)=><div className="admin-metric admin-metric-skeleton" key={i}/>)}</div></section>;
  if(q.isError)return <section className="admin-page"><div className="admin-page-heading"><span className="admin-eyebrow">CONTROL ROOM</span><h1>Admin dashboard</h1><p>Live operational metrics could not be loaded.</p></div><div className="admin-alert" role="alert"><strong>Admin overview unavailable.</strong><span>The backend rejected or could not complete the dashboard query.</span><button className="outline-button" type="button" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Retrying…':'Retry now'}</button></div></section>;
  const d=q.data;
  return <section className="admin-page">
    <div className="admin-page-heading"><div><span className="admin-eyebrow">CONTROL ROOM</span><h1>Admin dashboard</h1><p>Operational visibility without the customer marketplace or Buy/OTP workspace.</p></div><span className="admin-live-pill"><span/> Live</span></div>
    <div className="admin-overview-grid">
      <div className="admin-metric"><span>Active users</span><strong>{d.users.toLocaleString('en-IN')}</strong><small>Enabled accounts</small></div>
      <div className="admin-metric"><span>Active activations</span><strong>{d.activeActivations.toLocaleString('en-IN')}</strong><small>Currently running</small></div>
      <div className="admin-metric"><span>Recharge requests</span><strong>{d.rechargeRequests.toLocaleString('en-IN')}</strong><small>All recorded requests</small></div>
      <div className="admin-metric"><span>Pending recharge</span><strong>{money(d.pendingRechargePaise)}</strong><small>Awaiting review</small></div>
      <div className="admin-metric"><span>Wallet balance</span><strong>{money(d.walletBalancePaise)}</strong><small>Customer wallets combined</small></div>
      <div className="admin-metric"><span>Approved recharge</span><strong>{money(d.approvedRechargePaise)}</strong><small>Recorded approved amount</small></div>
    </div>
    <div className="admin-dashboard-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-eyebrow">BOUNDARY</span><h2>Separated application</h2></div><span className="admin-status-badge">Isolated</span></div><p>The admin console has its own route tree and shell. Customer Apps, Buy, Active, Wallet, Notifications and Support are not rendered inside this panel.</p><div className="admin-boundary-grid"><span>Customer navigation</span><strong>Not mounted</strong><span>Admin authorization</span><strong>Server enforced</strong><span>Admin session</span><strong>Authenticated</strong></div></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-eyebrow">NEXT</span><h2>Operations modules</h2></div></div><div className="admin-module-list"><div><strong>Users</strong><span>User/account operations</span></div><div><strong>Services</strong><span>Catalog and routing controls</span></div><div><strong>Activations</strong><span>Lifecycle monitoring</span></div><div><strong>Providers</strong><span>Health and operations</span></div><div><strong>Reconciliation</strong><span>Wallet/payment integrity</span></div><div><strong>Audit</strong><span>Administrative history</span></div></div><small className="admin-module-note">These operational screens remain behind this isolated shell and are implemented in the subsequent Phase 11 stages.</small></section>
    </div>
    <div className="admin-refresh-row">Auto refresh every 15 seconds <button type="button" className="inline-retry" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Refreshing…':'Refresh now'}</button></div>
  </section>;
}
