import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAdminSupport, updateAdminSupport, type AdminSupportTicket } from '../../api/admin-support';
import { getAdminUsers } from '../../api/admin';

const statuses = ['All','Open','In Progress','Resolved','Closed'] as const;

function when(value:number|null|undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

function money(paise:number|null|undefined) {
  return '₹' + (Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TicketStatus({ status }:{status:string}) {
  return <span className={'admin-provider-pill ' + (status==='Open' || status==='In Progress' ? 'is-on' : '')}>{status}</span>;
}

export function AdminSupportPage() {
  const client = useQueryClient();
  const [status,setStatus] = useState<(typeof statuses)[number]>('All');
  const [query,setQuery] = useState('');
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [reply,setReply] = useState('');
  const [note,setNote] = useState('');
  const [assigned,setAssigned] = useState('');
  const [actionError,setActionError] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);

  const adminsQ = useQuery({queryKey:['admin-support-admins'],queryFn:()=>getAdminUsers({role:'admin',status:'active',limit:100}),staleTime:30000,refetchOnReconnect:true});

  const q = useQuery({
    queryKey:['admin-support',query,status],
    queryFn:()=>getAdminSupport({q:query,status:status==='All'?'all':status}),
    staleTime:5_000,
    refetchInterval:15_000,
    refetchOnReconnect:true
  });

  const tickets = q.data?.tickets ?? [];
  const selected = tickets.find(t=>t.id===selectedId) ?? null;

  useEffect(()=>{
    if (!tickets.length) { setSelectedId(null); return; }
    if (!selectedId || !tickets.some(t=>t.id===selectedId)) setSelectedId(tickets[0].id);
  },[tickets,selectedId]);

  useEffect(()=>{
    if (!selected) return;
    setNote(selected.adminNote || '');
    setAssigned(selected.assignedAdminId || '');
    setReply('');
    setActionError(null);
    setMessage(null);
  },[selectedId]);

  const admins = useMemo(()=>(
    adminsQ.data?.users?.map(admin=>[admin.id,admin.email] as [string,string]) ?? []
  ),[adminsQ.data?.users]);

  const mutation = useMutation({
    mutationFn:()=> {
      if(!selected) throw new Error('Select a support ticket first');
      return updateAdminSupport(selected.id,{
        status:selected.status,
        adminNote:note.trim() || null,
        assignedAdminId:assigned || null,
        reply:reply.trim() || undefined
      });
    },
    onSuccess:async()=>{
      setActionError(null); setMessage('Support ticket updated.'); setReply('');
      await client.invalidateQueries({queryKey:['admin-support']});
      await client.invalidateQueries({queryKey:['notifications']});
    },
    onError:e=>{setMessage(null);setActionError(e instanceof Error?e.message:'Support update failed');}
  });

  function setStatusOnTicket(next:string) {
    if(!selected) return;
    updateAdminSupport(selected.id,{status:next,adminNote:note.trim()||null,assignedAdminId:assigned||null})
      .then(async()=>{
        setMessage('Ticket status updated.'); setActionError(null);
        await client.invalidateQueries({queryKey:['admin-support']});
        await client.invalidateQueries({queryKey:['notifications']});
      })
      .catch(e=>{setMessage(null);setActionError(e instanceof Error?e.message:'Status update failed')});
  }

  const open = tickets.filter(t=>t.status==='Open').length;
  const inProgress = tickets.filter(t=>t.status==='In Progress').length;
  const resolved = tickets.filter(t=>t.status==='Resolved').length;

  return <section className="admin-page admin-support-page">
    <div className="admin-page-heading">
      <div><span className="admin-eyebrow">CUSTOMER CARE</span><h1>Support operations</h1><p>Handle customer conversations without entering the customer application.</p></div>
      <button className="outline-button" type="button" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Refreshing…':'Refresh'}</button>
    </div>

    <div className="admin-overview-grid admin-support-summary-grid">
      <div className="admin-metric"><span>Open</span><strong>{open}</strong><small>Awaiting handling</small></div>
      <div className="admin-metric"><span>In progress</span><strong>{inProgress}</strong><small>Being worked</small></div>
      <div className="admin-metric"><span>Resolved</span><strong>{resolved}</strong><small>Waiting for closure/history</small></div>
      <div className="admin-metric"><span>Total loaded</span><strong>{tickets.length}</strong><small>Current queue window</small></div>
    </div>

    <div className="admin-services-toolbar">
      <input className="admin-search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ticket, customer, subject or reference" aria-label="Search support tickets" />
      <select className="admin-filter-select" value={status} onChange={e=>setStatus(e.target.value as typeof status)} aria-label="Filter support status">
        {statuses.map(s=><option key={s} value={s}>{s==='All'?'All statuses':s}</option>)}
      </select>
    </div>

    {q.isError?<div className="admin-alert" role="alert"><strong>Support queue unavailable.</strong><span>The backend could not load customer support.</span><button className="outline-button" type="button" onClick={()=>void q.refetch()}>Retry</button></div>:null}

    <div className="admin-support-layout">
      <section className="admin-panel admin-support-list-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">QUEUE</span><h2>Customer tickets</h2></div><span className="admin-status-badge">{tickets.length}</span></div>
        {q.isPending?<div className="admin-service-list">{Array.from({length:6},(_,i)=><div className="admin-service-skeleton" key={i}/>)}</div>:null}
        {tickets.length?<div className="admin-service-list">
          {tickets.map(ticket=><button key={ticket.id} type="button" className={'admin-service-row'+(ticket.id===selectedId?' is-selected':'')} onClick={()=>setSelectedId(ticket.id)}>
            <span className="admin-service-main"><strong>{ticket.subject}</strong><span>{ticket.email || ticket.userId} · {ticket.category}</span><small>{ticket.id} · updated {when(ticket.updatedAt)}</small></span>
            <span className="admin-service-side"><TicketStatus status={ticket.status}/>{ticket.activation?<small>Activation · {ticket.activation.service || ticket.activation.id}</small>:null}{ticket.recharge?<small>Recharge · {money(ticket.recharge.amountPaise)} · {ticket.recharge.status}</small>:null}</span>
          </button>)}
        </div>:!q.isPending?<div className="empty-state compact-empty"><h3>No support tickets</h3><p>New customer tickets will appear here.</p></div>:null}
      </section>

      <section className="admin-panel admin-support-detail-panel">
        {!selected?<div className="admin-user-detail-empty"><div className="admin-detail-mark">S</div><h2>Select a ticket</h2><p>Choose a conversation to inspect and respond.</p></div>:<>
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">TICKET</span><h2>{selected.subject}</h2><span className="admin-service-id">{selected.id}</span></div><TicketStatus status={selected.status}/></div>
          <div className="admin-detail-meta"><span>Customer {selected.email || selected.userId}</span><span>Category {selected.category}</span><span>Created {when(selected.createdAt)}</span><span>Updated {when(selected.updatedAt)}</span></div>
          {selected.activation||selected.recharge?<div className="admin-detail-section"><div className="admin-mini-list">
            {selected.activation?<div><strong>Activation</strong><small>{selected.activation.service||selected.activation.id} · {selected.activation.status} · {selected.activation.number||'No number'}</small></div>:null}
            {selected.recharge?<div><strong>Recharge</strong><small>{money(selected.recharge.amountPaise)} · {selected.recharge.status} · {selected.recharge.id}</small></div>:null}
          </div></div>:null}

          <div className="message-thread admin-support-thread">
            {(selected.messages?.length?selected.messages:[{id:'initial',authorRole:'customer',body:selected.message,createdAt:selected.createdAt}]).map(m=><div className={'thread-message '+(m.authorRole==='admin'?'from-admin':'from-customer')} key={m.id}><div className="thread-message-head"><span>{m.authorRole==='admin'?'INBOX9 Support':'Customer'}</span><time>{when(m.createdAt)}</time></div><p>{m.body}</p></div>)}
          </div>

          <div className="admin-detail-section">
            <div className="admin-panel-heading"><div><span className="admin-eyebrow">WORKFLOW</span><h3>Assignment & status</h3></div></div>
            <div className="admin-service-form-grid">
              <label className="field"><span>Status</span><select value={selected.status} onChange={e=>setStatusOnTicket(e.target.value)}>{statuses.filter(s=>s!=='All').map(s=><option key={s} value={s}>{s}</option>)}</select></label>
              <label className="field"><span>Assigned admin</span><select value={assigned} onChange={e=>setAssigned(e.target.value)}><option value="">Unassigned</option>{admins.map(([id,email])=><option key={id} value={id}>{email}</option>)}</select></label>
              <label className="field"><span>Internal note</span><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} placeholder="Internal context for operations"/></label>
            </div>
          </div>

          <form className="admin-detail-section" onSubmit={e=>{e.preventDefault();void mutation.mutate()}}>
            <div className="admin-panel-heading"><div><span className="admin-eyebrow">REPLY</span><h3>Respond to customer</h3></div></div>
            <textarea className="support-admin-reply-box" value={reply} onChange={e=>setReply(e.target.value)} maxLength={4000} placeholder="Write the support response..." />
            {actionError?<div className="form-error" role="alert">{actionError}</div>:null}
            {message?<div className="success-card" role="status">{message}</div>:null}
            <button className="primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending?'Saving…':'Save update'}</button>
          </form>
        </>}
      </section>
    </div>
  </section>;
}
