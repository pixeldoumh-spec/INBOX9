import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getAdminUser, getAdminUsers, updateAdminUser } from '../../api/admin';

function money(paise:number){return '₹'+(Number(paise||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function when(value:number|null|undefined){return value?new Date(value).toLocaleString():'—';}
function statusClass(active:boolean){return active?'admin-user-status is-active':'admin-user-status is-disabled';}

export function AdminUsersPage(){
  const {userId}=useParams();
  const client=useQueryClient();
  const [input,setInput]=useState('');
  const [q,setQ]=useState('');
  const [role,setRole]=useState('all');
  const [status,setStatus]=useState('all');
  const [offset,setOffset]=useState(0);
  const pageSize=40;
  const list=useQuery({queryKey:['admin-users',q,role,status,offset],queryFn:()=>getAdminUsers({q,role,status,limit:pageSize,offset}),staleTime:5_000,refetchInterval:15_000,refetchOnReconnect:true});
  const detail=useQuery({queryKey:['admin-user',userId],queryFn:()=>getAdminUser(userId!),enabled:Boolean(userId),staleTime:5_000,refetchInterval:15_000,refetchOnReconnect:true});
  const action=useMutation({mutationFn:({id,kind}:{id:string;kind:'enable'|'disable'|'logout_all'})=>updateAdminUser(id,kind),onSuccess:async()=>{await Promise.all([client.invalidateQueries({queryKey:['admin-users']}),client.invalidateQueries({queryKey:['admin-user',userId]})])}});
  useEffect(()=>{const timer=window.setTimeout(()=>{setQ(input.trim());setOffset(0)},250);return()=>window.clearTimeout(timer)},[input]);

  function runAction(kind:'enable'|'disable'|'logout_all'){
    if(!userId)return;
    const message=kind==='disable'?'Disable this account? The user will be signed out and unable to log in until re-enabled.':kind==='logout_all'?'Sign out every active session for this user?':'Re-enable this account?';
    if(window.confirm(message))action.mutate({id:userId,kind});
  }
  const selected=detail.data;
  return <section className="admin-page admin-users-page">
    <div className="admin-page-heading"><div><span className="admin-eyebrow">ACCOUNT OPERATIONS</span><h1>Users</h1><p>Search and inspect customer accounts without entering the customer application.</p></div><span className="admin-live-pill"><span/> Live</span></div>
    <div className="admin-users-summary">
      <div><span>Total</span><strong>{list.data?.summary.total??'—'}</strong></div><div><span>Active</span><strong>{list.data?.summary.active??'—'}</strong></div><div><span>Disabled</span><strong>{list.data?.summary.disabled??'—'}</strong></div><div><span>Admins</span><strong>{list.data?.summary.admins??'—'}</strong></div>
    </div>
    <div className="admin-users-toolbar"><input className="admin-search-input" value={input} onChange={e=>setInput(e.target.value)} placeholder="Search email, name or user ID" aria-label="Search users"/><select className="admin-filter-select" value={role} onChange={e=>{setRole(e.target.value);setOffset(0)}} aria-label="Filter by role"><option value="all">All roles</option><option value="user">Customers</option><option value="admin">Admins</option></select><select className="admin-filter-select" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}} aria-label="Filter by account status"><option value="all">All status</option><option value="active">Active</option><option value="disabled">Disabled</option></select></div>
    {list.isError?<div className="admin-alert" role="alert"><strong>Users unavailable.</strong><span>Could not load the account directory.</span><button className="outline-button" type="button" onClick={()=>void list.refetch()}>Retry</button></div>:null}
    <div className="admin-users-layout">
      <section className="admin-panel admin-user-list-panel"><div className="admin-panel-heading"><div><span className="admin-eyebrow">DIRECTORY</span><h2>Accounts</h2></div><span className="admin-status-badge">{list.data?.users.length??0}</span></div>{list.isPending?<div className="admin-user-list">{Array.from({length:7},(_,i)=><div className="admin-user-skeleton" key={i}/>)}</div>:list.data?.users.length?<div className="admin-user-list">{list.data.users.map(u=><Link key={u.id} to={'/admin/users/'+encodeURIComponent(u.id)} className={'admin-user-row'+(u.id===userId?' is-selected':'')}><div className="admin-user-avatar">{(u.displayName||u.email).slice(0,1).toUpperCase()}</div><div className="admin-user-main"><strong>{u.displayName||u.email}</strong><span>{u.email}</span><small>{u.id}</small></div><div className="admin-user-side"><span className={statusClass(u.active)}>{u.active?'Active':'Disabled'}</span><strong>{money(u.balancePaise)}</strong><small>{u.lastActivityAt?'Last active '+when(u.lastActivityAt):'No session activity'} · {u.activationCount} activations · {u.rechargeCount} recharges</small></div></Link>)}</div>:<div className="empty-state compact-empty"><h3>No users found</h3><p>Adjust the search or filters.</p></div>}</section>
      <section className="admin-panel admin-user-detail-panel">
        {!userId?<div className="admin-user-detail-empty"><div className="admin-detail-mark">U</div><h2>Select an account</h2><p>Choose a user from the directory to inspect account activity and session state.</p></div>:detail.isPending?<div className="admin-user-detail-empty"><div className="admin-detail-mark">…</div><h2>Loading account</h2><p>Fetching the latest account state.</p></div>:detail.isError?<div className="admin-user-detail-empty"><div className="admin-detail-mark">!</div><h2>User unavailable</h2><p>The account could not be loaded.</p><Link className="outline-button" to="/admin/users">Back to users</Link></div>:selected?<div className="admin-user-detail">
          <div className="admin-user-detail-head"><div className="admin-user-detail-identity"><div className="admin-user-detail-avatar">{(selected.user.displayName||selected.user.email).slice(0,1).toUpperCase()}</div><div><span className="admin-eyebrow">ACCOUNT</span><h2>{selected.user.displayName||'Unnamed account'}</h2><p>{selected.user.email}</p><small>{selected.user.id}</small></div></div><Link className="text-button" to="/admin/users">Clear selection</Link></div>
          <div className="admin-detail-meta"><span className={statusClass(selected.user.active)}>{selected.user.active?'Active':'Disabled'}</span><span>{selected.user.role==='admin'?'Admin':'Customer'}</span><span>Joined {when(selected.user.createdAt)}</span><span>Last activity {when(selected.user.lastActivityAt)}</span></div>
          <div className="admin-user-detail-metrics"><div><span>Wallet</span><strong>{money(selected.user.balancePaise)}</strong></div><div><span>Activations</span><strong>{selected.user.activationCount}</strong></div><div><span>Recharges</span><strong>{selected.user.rechargeCount}</strong></div><div><span>Support</span><strong>{selected.summary.supportCount}</strong></div><div><span>Sessions</span><strong>{selected.summary.activeSessions}</strong></div></div>
          <div className="admin-user-actions"><button className={selected.user.active?'secondary-danger':'primary-button'} type="button" disabled={action.isPending||selected.user.id===undefined} onClick={()=>runAction(selected.user.active?'disable':'enable')}>{action.isPending?'Working…':selected.user.active?'Disable account':'Enable account'}</button><button className="outline-button" type="button" disabled={action.isPending||!selected.summary.activeSessions} onClick={()=>runAction('logout_all')}>Sign out sessions</button></div>
          {action.isError?<div className="form-error" role="alert">{action.error instanceof Error?action.error.message:'User operation failed'}</div>:null}
          <div className="admin-detail-section"><div className="admin-panel-heading"><div><span className="admin-eyebrow">SESSIONS</span><h3>Access history</h3></div></div>{selected.sessions.length?<div className="admin-mini-list">{selected.sessions.map(s=><div key={s.id}><div><strong>{s.active?'Active session':'Session ended'}</strong><span>{s.id}</span></div><small>Created {when(s.createdAt)} · Last used {when(s.lastUsedAt)}</small></div>)}</div>:<p className="admin-muted-copy">No sessions recorded.</p>}</div>
          <div className="admin-detail-section"><div className="admin-panel-heading"><div><span className="admin-eyebrow">RECENT ACTIVITY</span><h3>Recharges</h3></div></div>{selected.recharges.length?<div className="admin-mini-list">{selected.recharges.map(r=><div key={r.id}><div><strong>{money(r.amountPaise)}</strong><span>{r.status} · {r.utr}</span></div><small>Submitted {when(r.submittedAt)}</small></div>)}</div>:<p className="admin-muted-copy">No recharge records.</p>}</div>
          <div className="admin-detail-section"><div className="admin-panel-heading"><div><span className="admin-eyebrow">RECENT ACTIVITY</span><h3>Activations</h3></div></div>{selected.activations.length?<div className="admin-mini-list">{selected.activations.map(a=><div key={a.id}><div><strong>{a.service||a.serviceId}</strong><span>{a.status} · {money(a.pricePaise)}</span></div><small>{a.number||'Number not present'} · {when(a.createdAt)}</small></div>)}</div>:<p className="admin-muted-copy">No activation records.</p>}</div>
          <div className="admin-detail-section"><div className="admin-panel-heading"><div><span className="admin-eyebrow">SUPPORT</span><h3>Recent tickets</h3></div></div>{selected.support.length?<div className="admin-mini-list">{selected.support.map(s=><div key={s.id}><div><strong>{s.subject}</strong><span>{s.status} · {s.category}</span></div><small>Updated {when(s.updatedAt)}</small></div>)}</div>:<p className="admin-muted-copy">No support tickets.</p>}</div>
        </div>:null}
      </section>
    </div>
  </section>;
}
