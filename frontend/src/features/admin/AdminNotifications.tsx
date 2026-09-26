import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAdminNotification, getAdminNotifications } from '../../api/admin-notifications';

function when(value:number){ return new Date(value).toLocaleString(); }

export function AdminNotificationsPage(){
  const client=useQueryClient();
  const [query,setQuery]=useState('');
  const [read,setRead]=useState<'all'|'unread'|'read'>('all');
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [userId,setUserId]=useState('');
  const [kind,setKind]=useState('system');
  const [error,setError]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);

  const q=useQuery({queryKey:['admin-notifications',query,read],queryFn:()=>getAdminNotifications({q:query,read}),staleTime:5000,refetchInterval:15000,refetchOnReconnect:true});
  const send=useMutation({
    mutationFn:()=>createAdminNotification({userId:userId.trim(),kind,title:title.trim(),body:body.trim(),page:'notifications',tone:'info'}),
    onSuccess:async()=>{setError(null);setMessage('Notification created.');setTitle('');setBody('');await Promise.all([q.refetch(),client.invalidateQueries({queryKey:['notifications']})])},
    onError:e=>{setMessage(null);setError(e instanceof Error?e.message:'Notification creation failed')}
  });

  return <section className="admin-page admin-notifications-page">
    <div className="admin-page-heading"><div><span className="admin-eyebrow">CUSTOMER MESSAGING</span><h1>Notifications</h1><p>Inspect persistent customer notifications and send an audited targeted message.</p></div><button className="outline-button" type="button" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Refreshing…':'Refresh'}</button></div>
    <div className="admin-overview-grid">
      <div className="admin-metric"><span>Loaded</span><strong>{q.data?.summary.total??0}</strong><small>Current result set</small></div>
      <div className="admin-metric"><span>Unread</span><strong>{q.data?.summary.unread??0}</strong><small>Still unread</small></div>
      <div className="admin-metric"><span>Read</span><strong>{q.data?.summary.read??0}</strong><small>Already opened</small></div>
    </div>
    <div className="admin-services-toolbar"><input className="admin-search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customer, title, message or notification ID" aria-label="Search notifications"/><select className="admin-filter-select" value={read} onChange={e=>setRead(e.target.value as typeof read)}><option value="all">All notifications</option><option value="unread">Unread</option><option value="read">Read</option></select></div>
    {q.isError?<div className="admin-alert" role="alert"><strong>Notification center unavailable.</strong><span>Could not load persistent notifications.</span><button className="outline-button" type="button" onClick={()=>void q.refetch()}>Retry</button></div>:null}
    {q.data?.notifications.length?<div className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-eyebrow">DELIVERY LEDGER</span><h2>Recent notifications</h2></div><span className="admin-status-badge">{q.data.notifications.length}</span></div><div className="admin-mini-list">{q.data.notifications.map(n=><div key={n.id}><div><strong>{n.title}</strong><span>{n.email}</span></div><small>{n.kind} · {n.tone} · {n.read?'Read':'Unread'} · {when(n.createdAt)}</small><p>{n.body}</p></div>)}</div></div>:<div className="empty-state compact-empty"><h3>No notifications found</h3><p>Persistent customer notifications will appear here.</p></div>}
    <div className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">TARGETED MESSAGE</span><h2>Send one notification</h2><span className="section-subtle">No broadcast control is exposed in this phase.</span></div></div>
      <form className="form-stack" onSubmit={e=>{e.preventDefault();setError(null);setMessage(null);void send.mutate()}}>
        <label className="field"><span>Customer user ID</span><input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="USR-..." required/></label>
        <label className="field"><span>Kind</span><input value={kind} onChange={e=>setKind(e.target.value)} maxLength={40} required/></label>
        <label className="field"><span>Title</span><input value={title} onChange={e=>setTitle(e.target.value)} minLength={3} maxLength={160} required/></label>
        <label className="field"><span>Message</span><textarea value={body} onChange={e=>setBody(e.target.value)} minLength={2} maxLength={1000} required/></label>
        {error?<div className="form-error" role="alert">{error}</div>:null}{message?<div className="success-card" role="status">{message}</div>:null}
        <button className="primary-button" disabled={send.isPending}>{send.isPending?'Creating…':'Create targeted notification'}</button>
      </form>
    </div>
  </section>;
}
