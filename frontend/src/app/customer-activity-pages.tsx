import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelActivation, getActivation, getActivations } from '../api/activations';
import { getServices } from '../api/services';
import { ApiRequestError } from '../api/client';
import { Icon, ServiceLogo, activationStateIsOngoing, activationStateIsTerminal } from './customer-ui-shared';

function activationErrorMessage(reason:unknown){
 if(reason instanceof ApiRequestError){
  switch(reason.code){
   case 'INSUFFICIENT_BALANCE': return 'Your wallet balance is too low for this number.';
   case 'OUT_OF_STOCK': return 'This service is temporarily out of stock. Please try again shortly.';
   case 'SERVICE_UNAVAILABLE': return 'This service is temporarily unavailable. Please try another service.';
   case 'CANCELLATION_UNAVAILABLE': return 'Cancellation is temporarily unavailable. Please try again shortly.';
   case 'IDEMPOTENCY_IN_PROGRESS': return 'This request is already being processed. Please wait a moment.';
   default: return reason.message && !/(provider|adapter|synthetic|mock|debug|test|development)/i.test(reason.message)
    ? reason.message
    : 'We could not complete that request. Please try again.';
  }
 }
 return reason instanceof Error?reason.message:'Could not create activation';
}
function statusClass(status:string){return `status-pill status-${status.toLowerCase()}`}

function ActivePage(){
 const q=useQuery({queryKey:['activations'],queryFn:getActivations,refetchInterval:10_000});
 const catalog=useQuery({queryKey:['services'],queryFn:getServices,staleTime:60_000});
 const [tab,setTab]=useState<'ongoing'|'history'>('ongoing');
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t)},[]);
 const list=useMemo(()=>[...(q.data?.activations??[])].sort((a,b)=>(b.createdAt??0)-(a.createdAt??0)),[q.data?.activations]);
 const ongoing=useMemo(()=>list.filter(a=>activationStateIsOngoing(a.status)),[list]);
 const history=useMemo(()=>list.filter(a=>!activationStateIsOngoing(a.status)),[list]);
 const visible=tab==='ongoing'?ongoing:history;
 return <section className="page-section active-page">
  <div className="catalog-heading"><div><h1>Active</h1><p>{tab==='ongoing'?'Track numbers waiting for an OTP.':'Your completed, expired and cancelled activations.'}</p></div><span className="catalog-chip">{tab==='ongoing'?ongoing.length:history.length}</span></div>
  <div className="active-tabs" role="tablist" aria-label="Activation views">
   <button type="button" role="tab" aria-selected={tab==='ongoing'} className={tab==='ongoing'?'active-tab is-selected':'active-tab'} onClick={()=>setTab('ongoing')}><span>Ongoing</span><b>{ongoing.length}</b></button>
   <button type="button" role="tab" aria-selected={tab==='history'} className={tab==='history'?'active-tab is-selected':'active-tab'} onClick={()=>setTab('history')}><span>History</span><b>{history.length}</b></button>
  </div>
  {q.isError?<div className="error-card">Could not load activations.</div>:null}
  {q.isPending?<div className="list-skeleton">{Array.from({length:4},(_,i)=><div className="row-skeleton" key={i}/>)}</div>:
   visible.length?<div className="activation-list">{visible.map(a=>{
    const remaining=a.expiresAt?Math.max(0,a.expiresAt-now):0;
    const countdown=a.expiresAt?remaining>0?`${Math.floor(remaining/60000)}:${String(Math.floor((remaining%60000)/1000)).padStart(2,'0')}`:'Expired':null;
    const terminal=a.status!=='Active';
    return <Link className={`activation-card ${terminal?'activation-card-history':'activation-card-ongoing'}`} key={a.id} to={`/buy?serviceId=${encodeURIComponent(a.serviceId)}&activationId=${encodeURIComponent(a.id)}`}>
     <ServiceLogo serviceId={a.serviceId} name={a.service||a.serviceId}/>
     <div className="activation-main">
      <div className="activation-title"><strong>{a.service||a.serviceId}</strong><span className={statusClass(a.status)}>{a.status}</span></div>
      <div className="activation-meta"><span>{a.number||'Number pending'}</span><span>₹{(a.pricePaise/100).toFixed(2)}</span></div>
      {a.otp?<div className="mini-otp">OTP <b>{a.otp}</b></div>:null}
      {tab==='ongoing'&&countdown?<div className="activation-validity"><Icon name="clock" size={13}/><span>{countdown} remaining</span></div>:null}
      {tab==='history'?<div className="activation-history-meta">{a.createdAt?new Date(a.createdAt).toLocaleString():'Activation record'}</div>:null}
     </div>
     <Icon name="arrow" size={18}/>
    </Link>
   })}</div>:
   <div className="empty-state activation-empty">
    <div className="empty-icon"><Icon name={tab==='ongoing'?'active':'clock'} size={28}/></div>
    <h3>{tab==='ongoing'?'No ongoing activations':'No activation history'}</h3>
    <p>{tab==='ongoing'?'Choose an app and buy a number to start.':'Completed or cancelled activations will appear here.'}</p>
    {tab==='ongoing'?<Link className="primary-button compact-button" to="/buy">Browse apps <Icon name="arrow" size={17}/></Link>:null}
   </div>}
 </section>
}
function ActivationPage(){
 const {activationId}=useParams();
 const client=useQueryClient();
 const [copied,setCopied]=useState<'number'|'otp'|null>(null);
 const [now,setNow]=useState(Date.now());
 const [cancelError,setCancelError]=useState<string|null>(null);
 const [cancelConfirmOpen,setCancelConfirmOpen]=useState(false);
 const q=useQuery({queryKey:['activation',activationId],queryFn:()=>getActivation(activationId!),enabled:Boolean(activationId),refetchInterval:query=>['Active','CancellationPending','ExpirationPending'].includes(query.state.data?.status||'')?2_000:false});
 const cancel=useMutation({
  mutationFn:()=>cancelActivation(activationId!),
  onSuccess:async()=>{
   setCancelError(null);
   setCancelConfirmOpen(false);
   await Promise.all([
    client.invalidateQueries({queryKey:['activations']}),
    client.invalidateQueries({queryKey:['wallet']}),
    q.refetch()
   ]);
  },
  onError:(reason)=>setCancelError(activationErrorMessage(reason))
 });
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t)},[]);
 if(q.isPending)return <section className="page-section"><div className="page-loading">Loading activation...</div></section>;
 if(q.isError||!q.data)return <section className="page-section"><Link className="back-link" to="/active"><Icon name="back" size={18}/> Active</Link><div className="error-card">Could not load this activation.</div></section>;
 const a=q.data;
 const remaining=a.expiresAt?Math.max(0,a.expiresAt-now):0;
 const countdown=`${Math.floor(remaining/60000)}:${String(Math.floor((remaining%60000)/1000)).padStart(2,'0')}`;
 const terminal=activationStateIsTerminal(a.status);
 const cancellationPending=a.status==='CancellationPending';
 const expirationPending=a.status==='ExpirationPending';
 async function doCopy(kind:'number'|'otp',value:string){
  try{await navigator.clipboard.writeText(value);setCopied(kind);window.setTimeout(()=>setCopied(null),1200)}
  catch{setCancelError('Copy is not available in this browser.');}
 }
 return <section className="page-section activation-page">
  <Link className="back-link" to="/active"><Icon name="back" size={18}/> Active</Link>
  <div className="activation-hero"><ServiceLogo serviceId={a.serviceId} name={a.service||a.serviceId}/><div><h1>{a.service||a.serviceId}</h1><div className="hero-meta"><span className={statusClass(a.status)}>{a.status}</span><span>₹{(a.pricePaise/100).toFixed(2)}</span></div></div></div>
  <div className="number-card"><span className="card-label">Phone number</span><div className="big-number">{a.number||'Waiting for number'}</div>{a.number?<button className="copy-button" onClick={()=>void doCopy('number',a.number!)}><Icon name="copy" size={17}/>{copied==='number'?'Copied':'Copy'}</button>:null}</div>
  <div className={`otp-card ${a.otp?'otp-ready':''}`}><div><span className="card-label">Verification code</span><div className="otp-value">{a.otp||'— — — — — —'}</div></div>{a.otp?<button className="copy-button" onClick={()=>void doCopy('otp',a.otp!)}><Icon name="copy" size={17}/>{copied==='otp'?'Copied':'Copy'}</button>:<div className="otp-wait"><span className="pulse-dot"/>{q.isFetching?'Checking for OTP...':'Waiting for OTP'}</div>}</div>
  {a.status==='Active'?<div className="countdown-card"><Icon name="clock" size={21}/><div><strong>{remaining?countdown:'Expired'}</strong><span>time remaining</span></div></div>:null}
  {expirationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Finalizing expiration</strong><p>The number has reached its expiry time. We’re confirming the number release now.</p></div></div>:null}
  {cancellationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation in progress</strong><p>The number release is being confirmed. Your wallet is credited only after that confirmation.</p></div></div>:null}
  {a.status==='Active'&&a.canCancel===false?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation is unavailable</strong><p>Cancellation is not available for this activation, so it stays active until it completes or expires.</p></div></div>:null}
  {cancelError?<div className="form-error" role="alert">{cancelError}</div>:null}
  {a.status==='Active'&&a.canCancel!==false?<button className="secondary-danger" disabled={cancel.isPending} onClick={()=>{setCancelError(null);setCancelConfirmOpen(true)}}><Icon name="close" size={18}/>{cancel.isPending?'Cancelling...':'Cancel & refund'}</button>:null}
  {cancelConfirmOpen&&a.status==='Active'?<div className="sheet-backdrop" role="presentation" onClick={()=>{if(!cancel.isPending)setCancelConfirmOpen(false)}}><section className="cancel-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-sheet-title" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" type="button" aria-label="Close cancellation confirmation" onClick={()=>setCancelConfirmOpen(false)} disabled={cancel.isPending}><Icon name="close" size={19}/></button><span className="card-label">Confirm cancellation</span><h2 id="cancel-sheet-title">Cancel this activation?</h2><p className="sheet-copy">The active number will stop immediately. The full activation charge will be returned to your wallet when cancellation succeeds.</p><div className="sheet-summary"><div><span>Service</span><strong>{a.service||a.serviceId}</strong></div><div><span>Phone number</span><strong>{a.number||'Waiting for number'}</strong></div><div><span>Refund to wallet</span><strong>₹{((a.refundPaise??a.pricePaise)/100).toFixed(2)}</strong></div></div><div className="cancel-warning"><Icon name="clock" size={17}/><span>Cancellation cannot be undone. Your wallet is only credited after the server confirms the cancellation.</span></div>{cancelError?<div className="form-error" role="alert">{cancelError}</div>:null}<button className="secondary-danger cancel-confirm-button" type="button" onClick={()=>void cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending?'Cancelling and refunding...':'Yes, cancel & refund'}<Icon name="close" size={18}/></button><button className="text-button" type="button" onClick={()=>setCancelConfirmOpen(false)} disabled={cancel.isPending}>Keep activation</button></section></div>:null}
  {a.status==='Completed'?<div className="success-card"><Icon name="check" size={19}/><span>OTP received. You can use this code now.</span></div>:null}
  {a.status==='Expired'?<div className="info-card"><Icon name="clock" size={20}/><div><strong>Activation expired</strong><p>The number is no longer active. You can start another activation.</p></div></div>:null}
  {a.status==='Cancelled'?<div className="info-card"><Icon name="close" size={20}/><div><strong>Activation cancelled</strong><p>The activation was cancelled before completion.</p></div></div>:null}
  {a.status==='Refunded'?<div className="info-card"><Icon name="check" size={20}/><div><strong>Activation refunded</strong><p>₹{((a.refundPaise??a.pricePaise)/100).toFixed(2)} returned to your wallet.</p></div></div>:null}
  {terminal?<Link className="outline-button" to="/buy">Buy another number <Icon name="arrow" size={17}/></Link>:null}
 </section>
}

export { ActivePage, ActivationPage };
