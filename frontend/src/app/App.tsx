import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserRouter, isRouteErrorResponse, Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useRouteError, useSearchParams } from 'react-router-dom';
import { RouterProvider } from 'react-router-dom';
import { getMe, login, logout, register } from '../api/auth';
import { cancelActivation, createActivation, getActivation, getActivations } from '../api/activations';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications';
import { getServices } from '../api/services';
import { getWallet } from '../api/wallet';
import { getAdminRecharges, reviewAdminRecharge, getAdminPaymentReconciliation, updatePaymentSettings, getAdminLedger } from '../api/admin-payments';
import { getSessions, revokeSession, updateProfile, changePassword, issueRecoveryCode, recoverPassword, logoutAll } from '../api/account';
import { createSupportTicket, getSupportTickets, replySupportTicket } from '../api/support';
import { ApiRequestError } from '../api/client';
import type { AdminRecharge, Notification } from '../api/types';
import { useSessionStore } from '../state/session';
import '../styles/customer-modern.css';
import { AdminAccessGate } from '../features/admin/AdminShell';
import { AdminDashboardPage } from '../features/admin/AdminDashboard';
import { AdminUsersPage } from '../features/admin/AdminUsers';
import { AdminServicesPage } from '../features/admin/AdminServices';
import { AdminActivationsPage } from '../features/admin/AdminActivations';
import { AdminSupportPage } from '../features/admin/AdminSupport';
import { AdminNotificationsPage } from '../features/admin/AdminNotifications';
import { AdminReconciliationPage } from '../features/admin/AdminReconciliation';
import { AdminSystemHealthPage } from '../features/admin/AdminSystemHealth';
import { Icon, ServiceLogo, activationStateIsOngoing, activationStateIsTerminal } from './customer-ui-shared';
import { SERVICE_LOGO_MANIFEST } from './serviceLogoManifest';
const ActivePage = lazy(()=>import('./customer-activity-pages').then(m=>({default:m.ActivePage})));
const ActivationPage = lazy(()=>import('./customer-activity-pages').then(m=>({default:m.ActivationPage})));
const WalletPage = lazy(()=>import('./customer-account-pages').then(m=>({default:m.WalletPage})));
const NotificationsPage = lazy(()=>import('./customer-account-pages').then(m=>({default:m.NotificationsPage})));
const SupportPage = lazy(()=>import('./customer-account-pages').then(m=>({default:m.SupportPage})));
const SupportThreadPage = lazy(()=>import('./customer-account-pages').then(m=>({default:m.SupportThreadPage})));
const AccountPage = lazy(()=>import('./customer-account-pages').then(m=>({default:m.AccountPage})));

type RuntimeErrorBoundaryState = { hasError: boolean };

class AppErrorBoundary extends Component<{ children: ReactNode }, RuntimeErrorBoundaryState> {
 state: RuntimeErrorBoundaryState = { hasError: false };

 static getDerivedStateFromError(): RuntimeErrorBoundaryState {
  return { hasError: true };
 }

 componentDidCatch(error: unknown) {
  try {
   console.error('INBOX9 runtime error', error);
  } catch {}
 }

 render() {
  if (this.state.hasError) return <RuntimeErrorScreen />;
  return this.props.children;
 }
}

function RuntimeErrorScreen() {
 return <main className="runtime-error-page">
  <div className="runtime-error-card">
   <div className="runtime-error-mark">I9</div>
   <span className="catalog-eyebrow">INBOX9</span>
   <h1>Something went wrong</h1>
   <p>The page hit an unexpected error. Your account and data are safe. Reload the app to continue.</p>
   <div className="runtime-error-actions">
    <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reload INBOX9</button>
    <button type="button" className="outline-button" onClick={() => { window.location.assign('/apps'); }}>Go to Apps</button>
   </div>
  </div>
 </main>;
}

function RouteErrorScreen() {
 const error = useRouteError();
 const detail = isRouteErrorResponse(error)
  ? (error.status === 404 ? 'That page could not be found.' : 'INBOX9 could not load this page.')
  : 'INBOX9 could not load this page.';
 return <main className="runtime-error-page">
  <div className="runtime-error-card">
   <div className="runtime-error-mark">I9</div>
   <span className="catalog-eyebrow">INBOX9</span>
   <h1>We couldn’t open this page</h1>
   <p>{detail} Try again or return to Apps.</p>
   <div className="runtime-error-actions">
    <button type="button" className="primary-button" onClick={() => window.location.reload()}>Retry</button>
    <button type="button" className="outline-button" onClick={() => { window.location.assign('/apps'); }}>Go to Apps</button>
   </div>
  </div>
 </main>;
}


function SearchField({value,onChange}:{value:string;onChange:(v:string)=>void}){return <label className="search-field"><Icon name="search" size={22}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder="Search services..." aria-label="Search services"/>{value?<button type="button" onClick={()=>onChange('')} aria-label="Clear search"><Icon name="close" size={18}/></button>:null}</label>}
function BottomNav(){const items=[['/apps','Apps','apps'],['/buy','Buy','buy'],['/active','Active','active'],['/account','Account','account']] as const; return <nav className="bottom-nav">{items.map(([to,label,icon])=><NavLink key={to} to={to} className={({isActive})=>`bottom-nav-item${isActive?' is-active':''}`}><span className="bottom-nav-icon"><Icon name={icon} size={21}/></span><span>{label}</span></NavLink>)}</nav>}
function TopHeader(){const user=useSessionStore(s=>s.user); const notes=useQuery({queryKey:['notifications'],queryFn:getNotifications,staleTime:20_000,refetchInterval:30_000}); const wallet=useQuery({queryKey:['wallet'],queryFn:getWallet,enabled:Boolean(user),staleTime:10_000}); const unread=notes.data?.notifications.filter(n=>!n.read).length??0; return <header className="top-header"><Link className="brand" to="/apps"><span className="brand-mark">I9</span><span>INBOX9</span></Link><div className="header-actions"><Link className="wallet-pill" to="/wallet"><Icon name="wallet" size={18}/><span>₹{((wallet.data?.balancePaise??0)/100).toFixed(2)}</span><span className="wallet-add"><Icon name="plus" size={14}/></span></Link><Link className="notification-button" to="/notifications" aria-label="Notifications"><Icon name="bell" size={20}/>{unread?<span className="notification-badge">{unread>99?'99+':unread}</span>:<span className="notification-dot"/>}</Link><Link className="profile-button" to="/account"><span>{(user?.displayName||user?.email||'I').slice(0,1).toUpperCase()}</span></Link></div></header>}
function AppShell(){
 const bootstrap=useSessionStore(s=>s.bootstrap);const user=useSessionStore(s=>s.user);const location=useLocation();
 const [online,setOnline]=useState(navigator.onLine);const [reconnecting,setReconnecting]=useState(false);const queryClient=useQueryClient();
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);
 useEffect(()=>{if(online)void queryClient.invalidateQueries({type:'active'})},[online,queryClient]);
 async function reconnect(){setReconnecting(true);try{await queryClient.refetchQueries({type:'active'});setOnline(navigator.onLine)}finally{setReconnecting(false)}}
 if(bootstrap==='idle'||bootstrap==='loading')return <div className="splash" role="status" aria-live="polite"><div className="splash-mark">I9</div><span>Loading INBOX9...</span></div>;
 if(!user)return <Navigate to={`/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
 if(user.role==='admin')return <Navigate to="/admin" replace/>;
 return <div className="app-shell"><TopHeader/>{!online?<div className="offline-banner" role="status"><span>You’re offline. Reconnect to refresh your account data.</span><button type="button" onClick={()=>void reconnect()} disabled={reconnecting}>{reconnecting?'Retrying…':'Retry'}</button></div>:null}<main className="page-content"><Outlet/></main><BottomNav/></div>
}
function SessionBootstrap(){const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);useEffect(()=>{let live=true;setBootstrap('loading');void getMe().then(r=>{if(!live)return;setUser(r.authenticated?r.user??null:null);setBootstrap(r.authenticated?'ready':'signed-out')}).catch(()=>{if(!live)return;setUser(null);setBootstrap('signed-out')});return()=>{live=false}},[setUser,setBootstrap]);return null}
function NotificationStrip(){
 const q=useQuery({queryKey:['notifications'],queryFn:getNotifications,staleTime:20_000,refetchInterval:30_000});
 const items=q.data?.notifications??[];
 const unread=items.filter(n=>!n.read).length;
 const latest=items[0];
 return <Link className="notification-strip" to="/notifications" aria-label="Open notifications">
  <span className="notification-glow"><span className="notification-strip-count">{unread>99?'99+':unread||'0'}</span></span>
  <span className="notification-strip-copy"><strong>{unread?'You have new updates':'Notifications'}</strong><span>{latest?.title||'Account, recharge and activation updates appear here.'}</span></span>
  <Icon name="arrow" size={18}/>
 </Link>
}
function Catalog(){
 const q=useQuery({queryKey:['services'],queryFn:getServices,staleTime:60_000});
 const [search,setSearch]=useState('');
 const [category,setCategory]=useState('all');
 const [recentIds,setRecentIds]=useState<string[]>([]);
 useEffect(()=>{
  try{
   const raw=localStorage.getItem('inbox9_recent_services');
   const parsed=raw?JSON.parse(raw):[];
   if(Array.isArray(parsed))setRecentIds(parsed.filter((id):id is string=>typeof id==='string').slice(0,8));
  }catch{}
 },[]);
 const all=Array.isArray(q.data?.services)?q.data.services:[];
 const categories=useMemo(()=>{
  const counts=new Map<string,number>();
  for(const item of all){const c=(item.category||'Other').trim()||'Other';counts.set(c,(counts.get(c)||0)+1);}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count}));
 },[all]);
 const list=useMemo(()=>{
  const needle=search.trim().toLowerCase();
  const filtered=all.filter(item=>{
   const matchesSearch=!needle||`${item.name} ${item.category}`.toLowerCase().includes(needle);
   const matchesCategory=category==='all'||(item.category||'Other')===category;
   return matchesSearch&&matchesCategory;
  });
  return filtered.sort((a,b)=>Number(Boolean(SERVICE_LOGO_MANIFEST[b.id]))-Number(Boolean(SERVICE_LOGO_MANIFEST[a.id])));
 },[all,search,category]);
 const recentServices=useMemo(()=>recentIds.map(id=>all.find(item=>item.id===id)).filter(Boolean),[all,recentIds]);
 function remember(id:string){
  setRecentIds(previous=>{
   const next=[id,...previous.filter(item=>item!==id)].slice(0,8);
   try{localStorage.setItem('inbox9_recent_services',JSON.stringify(next));}catch{}
   return next;
  });
 }
 const helper=q.isPending?'Loading services...':search||category!=='all'?`${list.length} of ${all.length} services`:`${all.length} services available`;
 return <section className="page-section catalog-page catalog-apps">
  <div className="catalog-heading"><div><span className="catalog-eyebrow">SERVICE LAUNCHER</span><h1>Services</h1><p>Choose a service to start a number purchase.</p></div><span className="catalog-chip">{helper}</span></div>
  <SearchField value={search} onChange={setSearch}/>
  {categories.length>1?<div className="category-scroll" aria-label="Service categories">
   <button type="button" className={category==='all'?'category-chip is-selected':'category-chip'} onClick={()=>setCategory('all')}>All</button>
   {categories.map(item=><button type="button" className={category===item.value?'category-chip is-selected':'category-chip'} key={item.value} onClick={()=>setCategory(item.value)}>{item.value}<span>{item.count}</span></button>)}
  </div>:null}
  {!search.trim()&&category==='all'&&recentServices.length?<div className="recent-section"><div className="section-heading-row"><div><h2>Recent</h2><span className="section-subtle">Your latest services</span></div></div><div className="recent-row">{recentServices.map(item=><Link className="recent-tile" key={item!.id} to={`/buy?serviceId=${encodeURIComponent(item!.id)}`} onClick={()=>remember(item!.id)}><ServiceLogo serviceId={item!.id} name={item!.name}/><span>{item!.name}</span></Link>)}</div></div>:null}
  {q.isError?<div className="error-card">Service catalog is temporarily unavailable.</div>:null}
  {!q.isPending&&list.length?<div className="catalog-section-title"><div><h2>{search||category!=='all'?'Search results':'All services'}</h2><span>{search||category!=='all'?list.length+' matching services':all.length+' services in the launcher'}</span></div>{search||category!=='all'?<button type="button" className="text-button compact-button" onClick={()=>{setSearch('');setCategory('all')}}>Clear</button>:null}</div>:null}
  {q.isPending?<div className="service-grid-placeholder">{Array.from({length:16},(_,i)=><div className="tile-skeleton" key={i}/>)}</div>:list.length?<div className="service-grid">{list.map(item=><Link className="service-tile" key={item.id} to={`/buy?serviceId=${encodeURIComponent(item.id)}`} onClick={()=>remember(item.id)}><ServiceLogo serviceId={item.id} name={item.name}/><span className="service-name">{item.name}</span></Link>)}</div>:<div className="empty-state"><div className="empty-icon">⌕</div><h3>No services found</h3><p>{search||category!=='all'?'Try another search or category.':'No services are available right now.'}</p>{search||category!=='all'?<button type="button" className="outline-button compact-button" onClick={()=>{setSearch('');setCategory('all')}}>Reset filters</button>:null}</div>}
  <NotificationStrip/>
 </section>
}
function AppsPage(){return <Catalog/>}

function ServicePage(){
 const {serviceId}=useParams();
 return <Navigate to={serviceId?`/buy?serviceId=${encodeURIComponent(serviceId)}`:'/buy'} replace/>;
}

function BuyServiceWorkspace({serviceId}:{serviceId:string}){
 const navigate=useNavigate();
 const client=useQueryClient();
 const [pending,setPending]=useState(false);
 const [confirmOpen,setConfirmOpen]=useState(false);
 const [idempotencyKey]=useState(()=>`i9-${serviceId}-${crypto.randomUUID()}`);
 const [error,setError]=useState<string|null>(null);
 const [online,setOnline]=useState(true);
 const [allocationElapsed,setAllocationElapsed]=useState(0);
 const services=useQuery({queryKey:['services'],queryFn:getServices,staleTime:60_000});
 const wallet=useQuery({queryKey:['wallet'],queryFn:getWallet,staleTime:10_000,refetchOnReconnect:true,refetchOnWindowFocus:true});
 const service=Array.isArray(services.data?.services)?services.data.services.find(s=>s.id===serviceId):undefined;
 useEffect(()=>{
  const update=()=>setOnline(navigator.onLine);
  update();
  const onReconnect=()=>{setOnline(true);void wallet.refetch();};
  const onOffline=()=>setOnline(false);
  window.addEventListener('online',onReconnect);window.addEventListener('offline',onOffline);
  return()=>{window.removeEventListener('online',onReconnect);window.removeEventListener('offline',onOffline)};
 },[wallet.refetch]);
 useEffect(()=>{
  if(!pending){setAllocationElapsed(0);return;}
  const started=Date.now();
  const timer=window.setInterval(()=>setAllocationElapsed(Date.now()-started),1000);
  setAllocationElapsed(0);
  return()=>window.clearInterval(timer);
 },[pending]);
 if(services.isPending)return <section className="page-section"><div className="page-loading">Preparing Buy workspace...</div></section>;
 if(!service)return <section className="page-section buy-workspace"><Link className="back-link" to="/apps"><Icon name="back" size={18}/> Apps</Link><div className="error-card">Service not found.</div></section>;
 const selected=service;
 const price=selected.pricePaise/100;
 const balancePaise=wallet.data?.balancePaise??0;
 const insufficient=wallet.isSuccess && balancePaise<selected.pricePaise;
 async function buy(){
  if(!selected.purchasable||pending||insufficient||!online)return;
  setPending(true);setError(null);
  try{
   const act=await createActivation(selected.id,idempotencyKey);
   await Promise.all([client.invalidateQueries({queryKey:['wallet']}),client.invalidateQueries({queryKey:['activations']})]);
   setConfirmOpen(false);
   navigate(`/buy?serviceId=${encodeURIComponent(selected.id)}&activationId=${encodeURIComponent(act.id)}`,{replace:true});
  }catch(reason){setError(activationErrorMessage(reason));}
  finally{setPending(false);}
 }
 return <section className="page-section service-detail buy-workspace">
  <Link className="back-link" to="/apps"><Icon name="back" size={18}/> Change service</Link>
  <div className="buy-workspace-title"><span className="catalog-eyebrow">BUY WORKSPACE</span><h1>Buy number</h1><p>Review the selected service, allocate a number, and continue to OTP.</p></div>
  {!online?<div className="offline-banner" role="status"><span className="offline-dot"/><div><strong>You’re offline</strong><small>Reconnect before starting a new number. Your wallet and service selection are kept safe.</small></div></div>:null}
  {online&&pending&&allocationElapsed>=8000?<div className="allocation-delay-banner" role="status"><Icon name="clock" size={18}/><div><strong>Still allocating</strong><small>The request is still in progress. Don’t tap Buy again; INBOX9 is protecting this purchase from duplicates.</small></div></div>:null}
  <div className="service-hero"><ServiceLogo serviceId={selected.id} name={selected.name}/><div><h2>{selected.name}</h2><p>{selected.category}</p></div></div>
  <div className="detail-grid">
   <div className="detail-card"><span>Price</span><strong>₹{price.toFixed(2)}</strong><small>Per activation</small></div>
   <div className="detail-card"><span>Availability</span><strong>{selected.availability||'—'}</strong><small>{selected.stock==null?'Live inventory':`${selected.stock} shown in catalog`}</small></div>
   <div className="detail-card"><span>Wallet</span><strong>₹{(balancePaise/100).toFixed(2)}</strong><small>{wallet.isPending?'Loading balance':'Current balance'}</small></div>
  </div>
  {!selected.purchasable?<div className="info-card"><Icon name="clock" size={20}/><div><strong>Buying is not enabled for this service yet.</strong><p>The catalog is connected; live provider purchasing is enabled separately.</p></div></div>:null}
  {insufficient?<div className="info-card"><Icon name="wallet" size={20}/><div><strong>Not enough wallet balance.</strong><p>You need ₹{((selected.pricePaise-balancePaise)/100).toFixed(2)} more to buy this number.</p><Link className="text-button compact-button" to="/wallet">Add funds <Icon name="arrow" size={16}/></Link></div></div>:null}
  {error?<div className="form-error" role="alert">{error}</div>:null}
  {wallet.isError?<div className="error-card" role="alert"><strong>Wallet balance could not be verified.</strong><p>Buying stays disabled until the balance can be confirmed.</p><button type="button" className="outline-button compact-button" onClick={()=>void wallet.refetch()} disabled={wallet.isFetching}>{wallet.isFetching?'Refreshing wallet…':'Retry wallet check'}</button></div>:null}
  <button className="primary-button primary-button-large" onClick={()=>setConfirmOpen(true)} disabled={!selected.purchasable||pending||insufficient||wallet.isPending||wallet.isError||!online}>{pending?(allocationElapsed>=8000?'Allocation still in progress…':'Allocating number...'):`Buy number · ₹${price.toFixed(2)}`}<Icon name="arrow" size={19}/></button>
  {confirmOpen?<div className="sheet-backdrop" role="presentation" onClick={()=>{if(!pending)setConfirmOpen(false)}}><section className="purchase-sheet" role="dialog" aria-modal="true" aria-labelledby="purchase-sheet-title" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" type="button" aria-label="Close" onClick={()=>setConfirmOpen(false)}><Icon name="close" size={19}/></button><span className="card-label">Confirm purchase</span><h2 id="purchase-sheet-title">{selected.name}</h2><p className="sheet-copy">This starts the number allocation and charges your wallet.</p><div className="sheet-summary"><div><span>Service</span><strong>{selected.name}</strong></div><div><span>Price</span><strong>₹{price.toFixed(2)}</strong></div><div><span>Wallet after purchase</span><strong>₹{((balancePaise-selected.pricePaise)/100).toFixed(2)}</strong></div></div>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button primary-button-large" type="button" onClick={()=>void buy()} disabled={pending||!online}>{pending?'Allocating...':'Confirm & buy'}<Icon name="arrow" size={18}/></button><button className="text-button" type="button" onClick={()=>setConfirmOpen(false)} disabled={pending}>Keep this service</button></section></div>:null}
  <div className="trust-row"><span><Icon name="check" size={16}/> Secure session</span><span><Icon name="check" size={16}/> India · +91</span><span><Icon name="clock" size={16}/> Live OTP updates</span></div>
 </section>
}

function BuyActivationWorkspace({activationId,serviceId}:{activationId:string;serviceId:string|null}){
 const client=useQueryClient();
 const [copied,setCopied]=useState<'number'|'otp'|null>(null);
 const [now,setNow]=useState(Date.now());
 const [cancelError,setCancelError]=useState<string|null>(null);
 const [cancelConfirmOpen,setCancelConfirmOpen]=useState(false);
 const [online,setOnline]=useState(true);
 const q=useQuery({queryKey:['activation',activationId],queryFn:()=>getActivation(activationId),enabled:Boolean(activationId),retry:3,retryDelay:attempt=>Math.min(1000*(attempt+1),4000),refetchOnReconnect:true,refetchOnWindowFocus:true,refetchInterval:query=>['Active','CancellationPending','ExpirationPending'].includes(query.state.data?.status||'')?2_000:false});
 const cancel=useMutation({
  mutationFn:()=>cancelActivation(activationId),
  onSuccess:async()=>{setCancelError(null);setCancelConfirmOpen(false);await Promise.all([client.invalidateQueries({queryKey:['activations']}),client.invalidateQueries({queryKey:['wallet']}),q.refetch()])},
  onError:(reason)=>setCancelError(activationErrorMessage(reason))
 });
 useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t)},[]);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();const onReconnect=()=>{setOnline(true);void q.refetch()};const onOffline=()=>setOnline(false);window.addEventListener('online',onReconnect);window.addEventListener('offline',onOffline);return()=>{window.removeEventListener('online',onReconnect);window.removeEventListener('offline',onOffline)}},[q.refetch]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')void q.refetch()};document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);return()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh)}},[q.refetch]);
 if(q.isPending)return <section className="page-section"><div className="page-loading">Loading number allocation...</div></section>;
 if(q.isError||!q.data)return <section className="page-section buy-workspace"><Link className="back-link" to={serviceId?`/buy?serviceId=${encodeURIComponent(serviceId)}`:'/buy'}><Icon name="back" size={18}/> Buy</Link><div className="error-card"><strong>Could not load this activation.</strong><p>The Buy workspace will retry automatically when the connection returns.</p><button type="button" className="outline-button compact-button" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Retrying…':'Retry now'}</button></div></section>;
 const a=q.data;
 const remaining=a.expiresAt?Math.max(0,a.expiresAt-now):0;
 const countdown=`${Math.floor(remaining/60000)}:${String(Math.floor((remaining%60000)/1000)).padStart(2,'0')}`;
 const terminal=activationStateIsTerminal(a.status);
 const cancellationPending=a.status==='CancellationPending';
 const expirationPending=a.status==='ExpirationPending';
 async function doCopy(kind:'number'|'otp',value:string){try{await navigator.clipboard.writeText(value);setCopied(kind);window.setTimeout(()=>setCopied(null),1200)}catch{setCancelError('Copy is not available in this browser.');}}
 return <section className="page-section activation-page buy-activation-workspace">
  <Link className="back-link" to={serviceId?`/buy?serviceId=${encodeURIComponent(serviceId)}`:'/buy'}><Icon name="back" size={18}/> Buy workspace</Link>
  <div className="buy-workspace-title"><span className="catalog-eyebrow">NUMBER + OTP</span><h1>Activation</h1><p>Number allocation and incoming verification code stay here while you wait.</p></div>
  {!online?<div className="offline-banner" role="status"><span className="offline-dot"/><div><strong>You’re offline</strong><small>OTP refresh is paused until the connection returns. Your activation remains unchanged on the server.</small></div></div>:null}
  <div className="activation-hero"><ServiceLogo serviceId={a.serviceId} name={a.service||a.serviceId}/><div><h2>{a.service||a.serviceId}</h2><div className="hero-meta"><span className={statusClass(a.status)}>{a.status}</span><span>₹{(a.pricePaise/100).toFixed(2)}</span></div></div></div>
  <div className="workspace-live-row"><span className="workspace-live-dot"/><span>{q.isFetching?'Refreshing activation status…':activationStateIsOngoing(a.status)?'Live status · updates automatically':'Activation status is final'}</span></div>
  <div className="number-card"><span className="card-label">Phone number</span><div className="big-number">{a.number||'Waiting for number'}</div>{a.number?<button className="copy-button" onClick={()=>void doCopy('number',a.number!)}><Icon name="copy" size={17}/>{copied==='number'?'Copied':'Copy'}</button>:null}</div>
  <div className={`otp-card ${a.otp?'otp-ready':''}`}><div><span className="card-label">Verification code</span><div className="otp-value">{a.otp||'— — — — — —'}</div></div>{a.otp?<button className="copy-button" onClick={()=>void doCopy('otp',a.otp!)}><Icon name="copy" size={17}/>{copied==='otp'?'Copied':'Copy'}</button>:<div className="otp-wait"><span className="pulse-dot"/>{q.isFetching?'Checking for OTP...':'Waiting for OTP'}</div>}</div>
  {a.status==='Active'?<div className="countdown-card"><Icon name="clock" size={21}/><div><strong>{remaining?countdown:'Expired'}</strong><span>time remaining</span></div></div>:null}
  {expirationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Finalizing expiration</strong><p>The number has reached its expiry time. We’re confirming the provider release now.</p></div></div>:null}
  {cancellationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation in progress</strong><p>The provider is confirming the release. Your wallet is credited only after that confirmation.</p></div></div>:null}
  {a.status==='Active'&&a.canCancel===false?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation is unavailable</strong><p>This provider does not expose a safe cancellation operation, so the activation stays active until it completes or expires.</p></div></div>:null}
  {cancelError?<div className="form-error" role="alert">{cancelError}</div>:null}
  {a.status==='Active'&&a.canCancel!==false?<button className="secondary-danger" disabled={cancel.isPending||!online} onClick={()=>{setCancelError(null);setCancelConfirmOpen(true)}}><Icon name="close" size={18}/>{cancel.isPending?'Cancelling...':'Cancel & refund'}</button>:null}
  {cancelConfirmOpen&&a.status==='Active'?<div className="sheet-backdrop" role="presentation" onClick={()=>{if(!cancel.isPending)setCancelConfirmOpen(false)}}><section className="cancel-sheet" role="dialog" aria-modal="true" aria-labelledby="cancel-sheet-title" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close" type="button" aria-label="Close cancellation confirmation" onClick={()=>setCancelConfirmOpen(false)} disabled={cancel.isPending}><Icon name="close" size={19}/></button><span className="card-label">Confirm cancellation</span><h2 id="cancel-sheet-title">Cancel this activation?</h2><p className="sheet-copy">The active number will stop immediately. The full activation charge will be returned to your wallet when cancellation succeeds.</p><div className="sheet-summary"><div><span>Service</span><strong>{a.service||a.serviceId}</strong></div><div><span>Phone number</span><strong>{a.number||'Waiting for number'}</strong></div><div><span>Refund to wallet</span><strong>₹{((a.refundPaise??a.pricePaise)/100).toFixed(2)}</strong></div></div><div className="cancel-warning"><Icon name="clock" size={17}/><span>Cancellation cannot be undone. Your wallet is only credited after the server confirms the cancellation.</span></div>{cancelError?<div className="form-error" role="alert">{cancelError}</div>:null}<button className="secondary-danger cancel-confirm-button" type="button" onClick={()=>void cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending?'Cancelling and refunding...':'Yes, cancel & refund'}<Icon name="close" size={18}/></button><button className="text-button" type="button" onClick={()=>setCancelConfirmOpen(false)} disabled={cancel.isPending}>Keep activation</button></section></div>:null}
  {a.status==='Completed'?<div className="success-card"><Icon name="check" size={19}/><span>OTP received. You can use this code now.</span></div>:null}
  {a.status==='Expired'?<div className="info-card"><Icon name="clock" size={20}/><div><strong>Activation expired</strong><p>The number is no longer active. You can start another activation.</p></div></div>:null}
  {a.status==='Cancelled'?<div className="info-card"><Icon name="close" size={20}/><div><strong>Activation cancelled</strong><p>The activation was cancelled before completion.</p></div></div>:null}
  {a.status==='Refunded'?<div className="info-card"><Icon name="check" size={20}/><div><strong>Activation refunded</strong><p>₹{((a.refundPaise??a.pricePaise)/100).toFixed(2)} returned to your wallet.</p></div></div>:null}
  {terminal?<div className="terminal-action-row"><Link className="primary-button" to={`/buy?serviceId=${encodeURIComponent(a.serviceId)}`}>Buy this service again <Icon name="arrow" size={17}/></Link><Link className="outline-button" to="/apps">Choose another service <Icon name="arrow" size={17}/></Link></div>:null}
 </section>
}

function BuyPage(){
 const [params]=useSearchParams();
 const serviceId=params.get('serviceId');
 const activationId=params.get('activationId');
 if(activationId)return <BuyActivationWorkspace activationId={activationId} serviceId={serviceId}/>;
 if(serviceId)return <BuyServiceWorkspace serviceId={serviceId}/>;
 return <section className="page-section buy-workspace">
  <div className="buy-workspace-title"><span className="catalog-eyebrow">BUY WORKSPACE</span><h1>Buy</h1><p>Choose a service from Apps to allocate a number and receive its OTP here.</p></div>
  <div className="buy-empty-workspace"><div className="empty-icon"><Icon name="buy" size={25}/></div><h2>Select a service</h2><p>The Buy tab is your number allocation and OTP workspace. Pick a service from Apps to begin.</p><Link className="primary-button" to="/apps">Choose from Apps <Icon name="arrow" size={17}/></Link></div>
 </section>
}

function activationErrorMessage(reason:unknown){
 if(reason instanceof ApiRequestError){
  switch(reason.code){
   case 'INSUFFICIENT_BALANCE': return 'Your wallet balance is too low for this number.';
   case 'OUT_OF_STOCK': return 'This service is temporarily out of stock. Please try again shortly.';
   case 'SERVICE_UNAVAILABLE': return 'This service is temporarily unavailable. Please try another service.';
   default: return reason.message;
  }
 }
 return reason instanceof Error?reason.message:'Could not create activation';
}
function statusClass(status:string){return `status-pill status-${status.toLowerCase()}`}
function AdminPaymentsPage(){
 const user=useSessionStore(s=>s.user);
 const pendingQ=useQuery({queryKey:['admin-recharges'],queryFn:getAdminRecharges,refetchInterval:10000,refetchOnReconnect:true});
 const reconQ=useQuery({queryKey:['admin-payment-reconciliation'],queryFn:getAdminPaymentReconciliation,refetchInterval:15000,refetchOnReconnect:true});
 const [ledgerQuery,setLedgerQuery]=useState('');const [ledgerType,setLedgerType]=useState<'all'|'credit'|'debit'>('all');const [ledgerOffset,setLedgerOffset]=useState(0);const ledgerPageSize=30;const ledgerQ=useQuery({queryKey:['admin-ledger',ledgerQuery,ledgerType,ledgerOffset],queryFn:()=>getAdminLedger({q:ledgerQuery,type:ledgerType,limit:ledgerPageSize,offset:ledgerOffset}),refetchInterval:15000,refetchOnReconnect:true});const ledger=Array.isArray(ledgerQ.data?.ledger)?ledgerQ.data.ledger:[];const ledgerSummary=ledgerQ.data?.summary??{total:0,credits:0,debits:0,creditPaise:0,debitPaise:0};const ledgerHasMore=ledgerQ.data?.pagination?.hasMore??false;const client=useQueryClient();
 const [selectedId,setSelectedId]=useState<string|null>(null);const [decision,setDecision]=useState<'approve'|'reject'|'flag'>('approve');const [verifiedAmount,setVerifiedAmount]=useState('');const [verifiedUtr,setVerifiedUtr]=useState('');const [externalReference,setExternalReference]=useState('');const [reason,setReason]=useState('');const [reviewConfirmed,setReviewConfirmed]=useState(false);
 const [settings,setSettings]=useState({enabled:null as boolean|null,upiId:'',merchantName:'INBOX9',instructions:'Pay the exact amount and keep the UTR / transaction reference.',qrImage:''});const [settingsMsg,setSettingsMsg]=useState<string|null>(null);const [settingsError,setSettingsError]=useState<string|null>(null);const [reviewError,setReviewError]=useState<string|null>(null);
 useEffect(()=>{const s=reconQ.data?.paymentSettings;if(s)setSettings({enabled:s.enabled??null,upiId:s.upiId||'',merchantName:s.merchantName||'INBOX9',instructions:s.instructions||'Pay the exact amount and keep the UTR / transaction reference.',qrImage:s.qrImage||''})},[reconQ.data?.paymentSettings]);
 const review=useMutation({mutationFn:()=>reviewAdminRecharge(selectedId||'',{decision,verifiedAmount:verifiedAmount.trim()?Number(verifiedAmount):undefined,verifiedUtr:verifiedUtr.trim()||undefined,externalReference:externalReference.trim()||undefined,reason:reason.trim()||undefined}),onSuccess:async()=>{setReviewError(null);setSelectedId(null);setReason('');setExternalReference('');setVerifiedAmount('');setVerifiedUtr('');setReviewConfirmed(false);await Promise.all([pendingQ.refetch(),reconQ.refetch(),client.invalidateQueries({queryKey:['wallet']}),client.invalidateQueries({queryKey:['notifications']})])},onError:e=>setReviewError(e instanceof Error?e.message:'Recharge review failed')});
 const saveSettings=useMutation({mutationFn:(nextSettings?:typeof settings)=>updatePaymentSettings(nextSettings??settings),onSuccess:async r=>{if(r.paymentSettings)setSettings({enabled:r.paymentSettings.enabled??null,upiId:r.paymentSettings.upiId||'',merchantName:r.paymentSettings.merchantName,instructions:r.paymentSettings.instructions,qrImage:r.paymentSettings.qrImage||''});setSettingsMsg('Payment settings saved.');setSettingsError(null);await reconQ.refetch()},onError:e=>{setSettingsMsg(null);setSettingsError(e instanceof Error?e.message:'Payment settings update failed')}});
 if(!user||user.role!=='admin')return <section className="page-section"><div className="error-card">Admin access required.</div></section>;
 const pending=[...(pendingQ.data?.recharges??[])].sort((a,b)=>Number(Boolean(b.flaggedAt))-Number(Boolean(a.flaggedAt))||a.submittedAt-b.submittedAt);
 const flagged=reconQ.data?.flagged??[];const manualEvents=reconQ.data?.manualEvents??[];const summary=reconQ.data?.summary;const configReady=Boolean(settings.upiId)&&Boolean(settings.instructions.trim());const manualMode=settings.enabled===true?'Enabled':settings.enabled===false?'Disabled':'Deployment controlled';
 const pendingAmountPaise=pending.reduce((sum,r)=>sum+(r.amountPaise||0),0);const oldestPendingAt=pending.length?pending.reduce((oldest,r)=>Math.min(oldest,r.submittedAt),pending[0].submittedAt):null;
 const queueAge=(timestamp:number)=>{const minutes=Math.max(0,Math.floor((Date.now()-timestamp)/60000));if(minutes<1)return 'just now';if(minutes<60)return minutes+'m old';const hours=Math.floor(minutes/60);if(hours<24)return hours+'h old';return Math.floor(hours/24)+'d old'};
 const openReview=(r:AdminRecharge,nextDecision:'approve'|'reject'|'flag')=>{setSelectedId(r.id);setDecision(nextDecision);setVerifiedAmount((r.amountPaise/100).toFixed(2));setVerifiedUtr(r.utr||'');setExternalReference('');setReason('');setReviewConfirmed(false);setReviewError(null)};
 return <section className="page-section admin-payments-page">
  <div className="catalog-heading"><div><span className="catalog-eyebrow">ADMIN · MANUAL PAYMENTS</span><h1>Manual payment operations</h1><p>Review manual UPI recharges, maintain the customer payment destination, and keep the verification trail. No gateway settlement is used here.</p></div><span className="catalog-chip">{pending.length} pending</span></div>
  <div className="admin-payment-summary"><div><span>Manual mode</span><strong>{manualMode}</strong><small>{settings.enabled==null?'Deployment setting':'Admin controlled'}</small></div><div><span>Pending requests</span><strong>{pending.length}</strong><small>{oldestPendingAt?'Oldest · '+queueAge(oldestPendingAt):'Queue is clear'}</small></div><div><span>Pending value</span><strong>₹{(pendingAmountPaise/100).toFixed(2)}</strong><small>Awaiting manual verification</small></div><div><span>Flagged</span><strong>{summary?.totals.flaggedCount??0}</strong><small>Investigation signals</small></div></div>
  <div className="admin-payment-panel admin-wallet-ledger-panel"><div className="section-heading"><div><span className="catalog-eyebrow">WALLET LEDGER</span><h2>Balance movements</h2><span className="section-subtle">Read-only accounting trail for customer wallet credits and debits.</span></div><button className="text-button compact-button" type="button" onClick={()=>void ledgerQ.refetch()} disabled={ledgerQ.isFetching}>{ledgerQ.isFetching?'Refreshing…':'Refresh'}</button></div><div className="admin-wallet-ledger-summary"><div><span>Entries</span><strong>{ledgerSummary.total}</strong></div><div><span>Credits</span><strong>₹{((ledgerSummary.creditPaise)/100).toFixed(2)}</strong></div><div><span>Debits</span><strong>₹{((ledgerSummary.debitPaise)/100).toFixed(2)}</strong></div></div><div className="admin-wallet-ledger-toolbar"><input className="admin-search-input" value={ledgerQuery} onChange={e=>{setLedgerQuery(e.target.value);setLedgerOffset(0)}} placeholder="Search user, reference or description" aria-label="Search wallet ledger"/><select className="admin-filter-select" value={ledgerType} onChange={e=>{setLedgerType(e.target.value as typeof ledgerType);setLedgerOffset(0)}} aria-label="Filter wallet ledger type"><option value="all">All movements</option><option value="credit">Credits</option><option value="debit">Debits</option></select></div>{ledgerQ.isError?<div className="error-card">Wallet ledger unavailable. Retry the request.</div>:ledger.length?<div className="admin-ledger-list">{ledger.map(entry=><div className="admin-ledger-row" key={entry.id}><div><strong>{entry.email}</strong><span>{entry.description}</span><small>{entry.referenceType} · {entry.referenceId} · {new Date(entry.createdAt).toLocaleString()}</small></div><b className={entry.type==='credit'?'is-credit':'is-debit'}>{entry.type==='credit'?'+':'−'}₹{(entry.amountPaise/100).toFixed(2)}</b></div>)}</div>:<div className="empty-state compact-empty"><h3>No ledger entries</h3><p>Wallet movements will appear here after a recorded credit or debit.</p></div>}<div className="admin-pagination"><button className="outline-button" type="button" disabled={ledgerOffset===0||ledgerQ.isFetching} onClick={()=>setLedgerOffset(v=>Math.max(0,v-ledgerPageSize))}>Previous</button><span>{ledger.length?ledgerOffset+1+'–'+Math.min(ledgerOffset+ledger.length,ledgerSummary.total)+' of '+ledgerSummary.total:'No results'}</span><button className="outline-button" type="button" disabled={!ledgerHasMore||ledgerQ.isFetching} onClick={()=>setLedgerOffset(v=>v+ledgerPageSize)}>Next</button></div></div>
  <div className="admin-payment-grid">
   <div className="admin-payment-panel"><div className="section-heading"><div><span className="catalog-eyebrow">QUEUE</span><h2>Pending recharge requests</h2><span className="section-subtle">Verify the bank/UPI transaction before crediting the wallet.</span></div><button className="text-button compact-button" type="button" onClick={()=>void pendingQ.refetch()} disabled={pendingQ.isFetching}>{pendingQ.isFetching?'Refreshing…':'Refresh'}</button></div>
    {pendingQ.isError?<div className="error-card">Recharge queue unavailable. Retry the request.</div>:null}
    {pending.length?<div className="admin-recharge-list">{pending.map(r=><div className={'admin-recharge-row'+(selectedId===r.id?' is-selected':'')} key={r.id}>
      <div className="admin-recharge-main"><div><strong>{r.email||r.userId}</strong><span>{new Date(r.submittedAt).toLocaleString()} · {queueAge(r.submittedAt)}</span></div><div className="admin-recharge-money">₹{(r.amountPaise/100).toFixed(2)}</div><span className="admin-recharge-utr">UTR · {r.utr}</span>{r.customerPaidAt?<span className="admin-recharge-history">Customer marked paid · {new Date(r.customerPaidAt).toLocaleString()}</span>:<span className="admin-recharge-history">Customer did not provide a payment time</span>}{r.flaggedAt?<span className="admin-recharge-history">Flagged · {new Date(r.flaggedAt).toLocaleString()} · {r.flagReason||'Additional verification required'}</span>:null}{r.recentPayments?.length?<span className="admin-recharge-history">{r.recentPayments.length} prior recharge request{r.recentPayments.length===1?'':'s'} on this account</span>:null}{r.sessionContext?<span className="admin-recharge-history">{r.sessionContext.activeCount??0} active session{(r.sessionContext.activeCount??0)===1?'':'s'} · submission session {r.sessionContext.currentMatchesSubmission?'matches current':'differs from current'}</span>:null}</div>
      <div className="admin-recharge-actions"><button type="button" className="primary-button compact-button" onClick={()=>openReview(r,'approve')}>Review</button><button type="button" className="text-button compact-button" onClick={()=>openReview(r,'flag')}>Flag</button></div>
      {selectedId===r.id?<div className="admin-review-form"><div className="admin-review-switch"><button type="button" className={decision==='approve'?'is-selected':''} onClick={()=>{setDecision('approve');setReviewConfirmed(false)}}>Approve</button><button type="button" className={decision==='flag'?'is-selected':''} onClick={()=>{setDecision('flag');setReviewConfirmed(false)}}>Flag</button><button type="button" className={decision==='reject'?'is-selected':''} onClick={()=>{setDecision('reject');setReviewConfirmed(false)}}>Reject</button></div><div className="admin-payment-note"><Icon name="clock" size={15}/><span><strong>Review evidence</strong><br/>Customer UTR: {r.utr} · Requested: ₹{(r.amountPaise/100).toFixed(2)} · Customer paid at: {r.customerPaidAt?new Date(r.customerPaidAt).toLocaleString():'Not provided'}. Confirm the actual bank/UPI record before approval.</span></div>{r.recentPayments?.length?<div className="admin-payment-note"><Icon name="wallet" size={15}/><span><strong>Account history</strong><br/>{r.recentPayments.slice(0,3).map(item=>'₹'+(item.amountPaise/100).toFixed(2)+' · '+item.status+' · '+new Date(item.submittedAt||Date.now()).toLocaleString()).join(' | ')}</span></div>:null}{decision!=='reject'?<><label className="field"><span>Verified amount</span><div className="money-input"><span>₹</span><input value={verifiedAmount} onChange={e=>setVerifiedAmount(e.target.value)} type="number" min="100" max="5000" step="1" required={decision==='approve'}/></div></label><label className="field"><span>Verified UTR</span><input value={verifiedUtr} onChange={e=>setVerifiedUtr(e.target.value)} maxLength={64} required={decision==='approve'}/></label><label className="field"><span>External reference <small>(optional)</small></span><input value={externalReference} onChange={e=>setExternalReference(e.target.value)} maxLength={120} placeholder="Bank statement / provider reference"/></label></>:null}<label className="field"><span>{decision==='approve'?'Review note':decision==='flag'?'Flag reason':'Rejection reason'}</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder={decision==='approve'?'Optional internal note':'Explain what was verified or why this needs review'} required={decision!=='approve'}/></label>{decision==='approve'?<label className="admin-payment-note"><input type="checkbox" checked={reviewConfirmed} onChange={e=>setReviewConfirmed(e.target.checked)}/><span><strong>I verified the payment record</strong><br/>I matched the actual bank/UPI transaction amount and UTR to this recharge before crediting the wallet.</span></label>:null}{reviewError?<div className="form-error" role="alert">{reviewError}</div>:null}<div className="admin-review-actions"><button type="button" className={decision==='reject'?'secondary-danger':'primary-button'} disabled={review.isPending||(decision==='approve'&&!reviewConfirmed)} onClick={()=>void review.mutate()}>{review.isPending?'Saving…':decision==='approve'?'Approve & credit':decision==='flag'?'Flag for review':'Reject recharge'}<Icon name={decision==='reject'?'close':'check'} size={16}/></button><button type="button" className="text-button" onClick={()=>setSelectedId(null)} disabled={review.isPending}>Cancel</button></div></div>:null}
      </div>)}</div>:<div className="empty-state compact-empty"><h3>No pending recharges</h3><p>New manual UPI requests will appear here.</p></div>}</div>
   <div className="admin-payment-panel"><div className="section-heading"><div><span className="catalog-eyebrow">SETTINGS</span><h2>Manual payment destination</h2><span className="section-subtle">Customers see these details in Wallet. Keep this configuration limited to the manual UPI flow.</span></div><button type="button" className={settings.enabled===true?'secondary-danger':'primary-button'} disabled={saveSettings.isPending||(settings.enabled!==true&&!configReady)} onClick={()=>{const nextEnabled=settings.enabled===true?false:true;const nextSettings={...settings,enabled:nextEnabled};setSettings(nextSettings);setSettingsMsg(null);setSettingsError(null);void saveSettings.mutate(nextSettings)}}>{settings.enabled===true?'Disable manual recharge':'Enable manual recharge'}</button></div><form className="form-stack" onSubmit={e=>{e.preventDefault();setSettingsMsg(null);setSettingsError(null);void saveSettings.mutate()}}><label className="field"><span>Merchant UPI ID</span><input value={settings.upiId} onChange={e=>setSettings(s=>({...s,upiId:e.target.value}))} placeholder="merchant@upi" required/></label><label className="field"><span>Merchant name</span><input value={settings.merchantName} onChange={e=>setSettings(s=>({...s,merchantName:e.target.value}))} maxLength={80}/></label><label className="field"><span>Customer instructions</span><textarea value={settings.instructions} onChange={e=>setSettings(s=>({...s,instructions:e.target.value}))} maxLength={500}/></label><label className="field"><span>QR image URL or image data</span><textarea value={settings.qrImage} onChange={e=>setSettings(s=>({...s,qrImage:e.target.value}))} maxLength={350000} placeholder="https://.../qr.png or image data URI"/></label>{settingsError?<div className="form-error" role="alert">{settingsError}</div>:null}{settingsMsg?<div className="success-card" role="status"><Icon name="check" size={17}/><span>{settingsMsg}</span></div>:null}<button type="submit" className="primary-button" disabled={saveSettings.isPending}>{saveSettings.isPending?'Saving…':'Save payment settings'}<Icon name="check" size={16}/></button></form><div className="admin-payment-note"><Icon name="wallet" size={16}/><span>No gateway settlement is used. Wallet credits are posted only after a server-side admin verification of the transaction.</span></div></div>
  </div>
  <div className="admin-payment-panel admin-payment-history-panel"><div className="section-heading"><div><span className="catalog-eyebrow">MANUAL REVIEW HISTORY</span><h2>Payment events & flags</h2><span className="section-subtle">Review history is the operational source of truth for manual recharges.</span></div><button type="button" className="text-button compact-button" onClick={()=>void reconQ.refetch()} disabled={reconQ.isFetching}>{reconQ.isFetching?'Refreshing…':'Refresh'}</button></div>{manualEvents.length?<div className="admin-signal-list">{manualEvents.slice(0,50).map(event=><div className="admin-signal-row" key={'m-'+event.id}><div><strong>{({submitted:'Submitted',verified:'Verified',approved:'Approved',rejected:'Rejected',flagged:'Flagged'} as Record<string,string>)[event.eventType]||event.eventType} · {event.customerEmail}</strong><span>₹{(event.amountPaise/100).toFixed(2)} · {event.rechargeStatus}</span><span>{event.utr?'UTR · '+event.utr:'No UTR'} · {new Date(event.createdAt).toLocaleString()}</span>{event.externalReference?<span>Ref · {event.externalReference}</span>:null}{event.notes?<span>{event.notes}</span>:null}</div><span>{event.actorEmail||'System'}</span></div>)}</div>:<div className="empty-state compact-empty"><h3>No manual payment events</h3><p>The trail will appear as customers submit and admins review recharges.</p></div>}{flagged.length?<div className="admin-signal-list">{flagged.slice(0,20).map(r=><div className="admin-signal-row" key={'f-'+r.id}><div><strong>{r.email}</strong><span>₹{(r.amountPaise/100).toFixed(2)} · {r.status}</span><span>{r.flagReason||'Flagged for review'}</span></div><span>{r.utr}</span></div>)}</div>:<div className="empty-state compact-empty"><h3>No flagged requests</h3><p>Requests that need investigation will appear here.</p></div>}</div>
 </section>
}
function AuthLayout({title,subtitle,children,footer}:{title:string;subtitle:string;children:ReactNode;footer:ReactNode}){return <div className="auth-page"><div className="auth-card"><Link className="auth-brand" to="/login"><span className="brand-mark">I9</span><strong>INBOX9</strong></Link><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}<div className="auth-footer">{footer}</div></div></div>}
function resolvePostLoginPath(next:string|null,role?:string){const candidate=String(next||'').trim();if(role==='admin'){return candidate==='/admin'||candidate.startsWith('/admin/')?candidate:'/admin';}if(!candidate.startsWith('/')||candidate.startsWith('//'))return '/apps';if(candidate==='/admin'||candidate.startsWith('/admin/'))return '/apps';return candidate;}
function LoginPage(){const navigate=useNavigate();const [params]=useSearchParams();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);async function submit(e:FormEvent){e.preventDefault();setPending(true);setError(null);try{const r=await login(email.trim(),password);setUser(r.user);setBootstrap('ready');navigate(resolvePostLoginPath(params.get('next'),r.user.role),{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Sign in failed')}finally{setPending(false)}}return <AuthLayout title="Welcome back" subtitle="Sign in to use INBOX9 services." footer={<>New here? <Link to="/register">Create account</Link> · <Link to="/recover">Recover password</Link></>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Signing in...':'Sign in'}</button></form></AuthLayout>}
function RegisterPage(){const navigate=useNavigate();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);async function submit(e:FormEvent){e.preventDefault();setError(null);if(password!==confirm){setError('Passwords do not match.');return}setPending(true);try{const r=await register(email.trim(),password);setUser(r.user);setBootstrap('ready');navigate('/apps',{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Registration failed')}finally{setPending(false)}}return <AuthLayout title="Create your account" subtitle="One account for all INBOX9 services." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={10} required/></label><label className="field"><span>Confirm password</span><input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={10} required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Creating account...':'Create account'}</button></form></AuthLayout>}
function RecoverPage(){
 const navigate=useNavigate();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [code,setCode]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState<string|null>(null);const [pending,setPending]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError(null);if(password!==confirm){setError('Passwords do not match.');return}setPending(true);try{const r=await recoverPassword(email.trim(),code.trim(),password);setUser(r.user);setBootstrap('ready');navigate('/apps',{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Password recovery failed')}finally{setPending(false)}}
 return <AuthLayout title="Recover password" subtitle="Use a recovery code generated from your signed-in account." footer={<Link to="/login">Back to sign in</Link>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Recovery code</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="REC-..." required/></label><label className="field"><span>New password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={8} maxLength={128} required/></label><label className="field"><span>Confirm password</span><input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={8} maxLength={128} required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Resetting...':'Reset password'}</button></form></AuthLayout>
}
const router=createBrowserRouter([{path:'/login',Component:LoginPage},{path:'/register',Component:RegisterPage},{path:'/recover',Component:RecoverPage},{path:'/',Component:AppShell,errorElement:<RouteErrorScreen/>,children:[{index:true,element:<Navigate to="/apps" replace/>},{path:'apps',Component:AppsPage},{path:'apps/service/:serviceId',Component:ServicePage},{path:'buy',Component:BuyPage},{path:'active',Component:ActivePage},{path:'active/:activationId',Component:ActivationPage},{path:'wallet',Component:WalletPage},{path:'notifications',Component:NotificationsPage},{path:'support',Component:SupportPage},{path:'account',Component:AccountPage},{path:'support/:ticketId',Component:SupportThreadPage}]},{path:'/admin',Component:AdminAccessGate,errorElement:<RouteErrorScreen/>,children:[{index:true,Component:AdminDashboardPage},{path:'users',children:[{index:true,Component:AdminUsersPage},{path:':userId',Component:AdminUsersPage}]},{path:'services',Component:AdminServicesPage},{path:'activations',Component:AdminActivationsPage},{path:'payments',Component:AdminPaymentsPage},{path:'support',Component:AdminSupportPage},{path:'notifications',Component:AdminNotificationsPage},{path:'reconciliation',Component:AdminReconciliationPage},{path:'health',Component:AdminSystemHealthPage}]}]);
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
export function App(){return <AppErrorBoundary><QueryClientProvider client={queryClient}><SessionBootstrap/><Suspense fallback={<div className="route-loading" role="status" aria-live="polite"><div className="splash-mark">I9</div><span>Loading…</span></div>}><RouterProvider router={router}/></Suspense></QueryClientProvider></AppErrorBoundary>}