import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserRouter, isRouteErrorResponse, Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useRouteError, useSearchParams } from 'react-router-dom';
import { RouterProvider } from 'react-router-dom';
import { getMe, login, logout, register } from '../api/auth';
import { cancelActivation, createActivation, getActivation, getActivations } from '../api/activations';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications';
import { getServices } from '../api/services';
import { getWallet } from '../api/wallet';
import { createRecharge } from '../api/recharges';
import { getAdminRecharges, reviewAdminRecharge, getAdminPaymentReconciliation, updatePaymentSettings, getAdminLedger } from '../api/admin-payments';
import { getSessions, revokeSession, updateProfile, changePassword, issueRecoveryCode, recoverPassword, logoutAll } from '../api/account';
import { createSupportTicket, getSupportTickets, replySupportTicket } from '../api/support';
import { ApiRequestError } from '../api/client';
import type { AdminRecharge, Notification } from '../api/types';
import { useSessionStore } from '../state/session';
import '../styles/globals.css';
import { AdminAccessGate } from '../features/admin/AdminShell';
import { AdminDashboardPage } from '../features/admin/AdminDashboard';
import { AdminUsersPage } from '../features/admin/AdminUsers';
import { AdminServicesPage } from '../features/admin/AdminServices';
import { AdminActivationsPage } from '../features/admin/AdminActivations';

type IconName='apps'|'buy'|'active'|'account'|'bell'|'wallet'|'search'|'back'|'copy'|'plus'|'clock'|'close'|'arrow'|'support'|'check';
const ONGOING_ACTIVATION_STATUSES=new Set(['Active','CancellationPending','ExpirationPending']);
const TERMINAL_ACTIVATION_STATUSES=new Set(['Completed','Expired','Refunded','Cancelled']);
const activationStateIsOngoing=(status:string)=>ONGOING_ACTIVATION_STATUSES.has(String(status||''));
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


const activationStateIsTerminal=(status:string)=>TERMINAL_ACTIVATION_STATUSES.has(String(status||''));

const iconPaths:Record<IconName,ReactNode>={
 apps:<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
 buy:<><path d="M5 7h14l-1.2 12H6.2L5 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M8 11h8"/></>,
 active:<><rect x="6" y="3.5" width="12" height="17" rx="3"/><path d="m9 14 2 2 4-5"/></>,
 account:<><circle cx="12" cy="8" r="3"/><path d="M5 20c.9-3 3.4-5 7-5s6.1 2 7 5"/></>,
 bell:<><path d="M6 10a6 6 0 0 1 12 0c0 7 3 6 3 8H3c0-2 3-1 3-8"/><path d="M10 21h4"/></>,
 wallet:<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 8h15"/><path d="M15 12h5"/><circle cx="16" cy="12" r=".7"/></>,
 search:<><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></>,
 back:<path d="m15 18-6-6 6-6"/>,
 copy:<><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
 plus:<><path d="M12 5v14M5 12h14"/></>,
 clock:<><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
 close:<><path d="m6 6 12 12M18 6 6 18"/></>,
 arrow:<><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
 support:<><path d="M5 12a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2h-3"/><path d="M5 12h3v6H6a1 1 0 0 1-1-1v-5ZM19 12h-3v6h2a1 1 0 0 0 1-1v-5ZM12 19v2"/></>,
 check:<path d="m5 12 4 4L19 6"/>,
};
function Icon({name,size=20}:{name:IconName;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>}

import { SERVICE_LOGO_MANIFEST, SERVICE_LOGO_SPRITE } from './serviceLogoManifest';

const serviceLogoCropCache=new Map<number,string>();
let serviceLogoSpritePromise:Promise<HTMLImageElement>|null=null;

function getServiceLogoSpriteImage(path:string){
 if(!serviceLogoSpritePromise){
  serviceLogoSpritePromise=new Promise((resolve,reject)=>{
   const image=new Image();
   image.decoding='async';
   image.onload=()=>resolve(image);
   image.onerror=reject;
   image.src=path;
  });
 }
 return serviceLogoSpritePromise;
}

function cropServiceLogo(path:string,index:number,tileSize:number,columns:number,outputSize:number){
 const cached=serviceLogoCropCache.get(index);
 if(cached)return Promise.resolve(cached);
 return getServiceLogoSpriteImage(path).then(image=>{
  const source=document.createElement('canvas');
  source.width=tileSize;
  source.height=tileSize;
  const ctx=source.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas unavailable');
  const sx=(index%columns)*tileSize;
  const sy=Math.floor(index/columns)*tileSize;
  ctx.clearRect(0,0,tileSize,tileSize);
  ctx.drawImage(image,sx,sy,tileSize,tileSize,0,0,tileSize,tileSize);

  const pixels=ctx.getImageData(0,0,tileSize,tileSize).data;
  const corners=[[0,0],[tileSize-1,0],[0,tileSize-1],[tileSize-1,tileSize-1]];
  let opaqueCorners=0,bgR=0,bgG=0,bgB=0;
  for(const point of corners){
   const p=(point[1]*tileSize+point[0])*4;
   if(pixels[p+3]>220){opaqueCorners++;bgR+=pixels[p];bgG+=pixels[p+1];bgB+=pixels[p+2];}
  }
  if(opaqueCorners){bgR/=opaqueCorners;bgG/=opaqueCorners;bgB/=opaqueCorners;}

  const isArtwork=(x:number,y:number)=>{
   const p=(y*tileSize+x)*4;
   if(pixels[p+3]<18)return false;
   if(!opaqueCorners)return true;
   return Math.max(Math.abs(pixels[p]-bgR),Math.abs(pixels[p+1]-bgG),Math.abs(pixels[p+2]-bgB))>18;
  };

  let minX=tileSize,minY=tileSize,maxX=-1,maxY=-1;
  for(let y=0;y<tileSize;y++){
   for(let x=0;x<tileSize;x++){
    if(isArtwork(x,y)){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   }
  }
  if(maxX<0||maxY<0){minX=0;minY=0;maxX=tileSize-1;maxY=tileSize-1;}

  const margin=1;
  minX=Math.max(0,minX-margin);
  minY=Math.max(0,minY-margin);
  maxX=Math.min(tileSize-1,maxX+margin);
  maxY=Math.min(tileSize-1,maxY+margin);

  const cropW=maxX-minX+1,cropH=maxY-minY+1;
  const output=document.createElement('canvas');
  output.width=outputSize;output.height=outputSize;
  const out=output.getContext('2d');
  if(!out)throw new Error('Canvas unavailable');
  const pad=5,box=outputSize-pad*2;
  const scale=Math.min(box/cropW,box/cropH);
  const dw=cropW*scale,dh=cropH*scale;
  out.imageSmoothingEnabled=true;
  out.imageSmoothingQuality='high';
  out.clearRect(0,0,outputSize,outputSize);
  out.drawImage(source,minX,minY,cropW,cropH,(outputSize-dw)/2,(outputSize-dh)/2,dw,dh);

  const data=output.toDataURL('image/png');
  serviceLogoCropCache.set(index,data);
  return data;
 });
}

function ServiceLogo({serviceId,name}:{serviceId:string;name:string}){
 const d=72;
 const {tileSize,columns,path}=SERVICE_LOGO_SPRITE;
 const logo=SERVICE_LOGO_MANIFEST[serviceId];
 const index=logo?.spriteIndex ?? -1;
 const has=Boolean(logo&&index>=0&&index<columns*9);
 const [src,setSrc]=useState<string|null>(()=>has?serviceLogoCropCache.get(index)??null:null);
 const token=useRef(0);

 useEffect(()=>{
  if(!has){setSrc(null);return;}
  const current=++token.current;
  cropServiceLogo(path,index,tileSize,columns,d).then(data=>{
   if(current===token.current)setSrc(data);
  }).catch(()=>{});
  return()=>{token.current++;};
 },[has,index,path,tileSize,columns]);

 const initials=name.trim().split(/\\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'I9';
 return <div className={['service-logo',has?'':'service-logo-fallback'].filter(Boolean).join(' ')} data-service-id={serviceId} data-logo-source={src?'cropped-sprite':has?'sprite':'fallback'} style={{width:d,height:d}}>
   <div className="service-logo-art">
    {src?<img src={src} alt="" aria-hidden="true"/>:<div className="service-logo-fallback-content"><span>{initials}</span><Icon name="apps" size={21}/></div>}
   </div>
 </div>;
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
  return all.filter(item=>{
   const matchesSearch=!needle||`${item.name} ${item.category}`.toLowerCase().includes(needle);
   const matchesCategory=category==='all'||(item.category||'Other')===category;
   return matchesSearch&&matchesCategory;
  });
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
   case 'REAL_PROVIDER_REQUIRED':
   case 'PROVIDER_RESELLER_AUTHORIZATION_REQUIRED':
   case 'PROVIDER_CANARY_DISABLED':
   case 'VIRTUALSMS_SERVICE_MAPPING_MISSING':
   case 'VIRTUALSMS_SERVICE_NOT_ALLOWLISTED':
     return 'Live purchase is not enabled for this service yet.';
   default: return reason.message;
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
  {expirationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Finalizing expiration</strong><p>The number has reached its expiry time. We’re confirming the provider release now.</p></div></div>:null}
  {cancellationPending?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation in progress</strong><p>The provider is confirming the release. Your wallet is credited only after that confirmation.</p></div></div>:null}
  {a.status==='Active'&&a.canCancel===false?<div className="info-card" role="status"><Icon name="clock" size={20}/><div><strong>Cancellation is unavailable</strong><p>This provider does not expose a safe cancellation operation, so the activation stays active until it completes or expires.</p></div></div>:null}
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
function WalletPage(){
 const client=useQueryClient();
 const q=useQuery({queryKey:['wallet'],queryFn:getWallet,refetchInterval:10000});
 const [amount,setAmount]=useState('500');const [utr,setUtr]=useState('');const [error,setError]=useState<string|null>(null);
 const [sent,setSent]=useState(false);const [upiCopied,setUpiCopied]=useState(false);const [paymentStarted,setPaymentStarted]=useState(false);
 const [filter,setFilter]=useState<'all'|'credit'|'debit'>('all');const [detail,setDetail]=useState<string|null>(null);
 const recharge=useMutation({
  mutationFn:()=>createRecharge(Number(amount),utr.trim()),
  onSuccess:async()=>{setError(null);setSent(true);setUtr('');setPaymentStarted(false);await Promise.all([q.refetch(),client.invalidateQueries({queryKey:['notifications']})])},
  onError:e=>setError(e instanceof Error?e.message:'Recharge could not be submitted')
 });
 const ledger=q.data?.ledger??[];const recharges=q.data?.recharges??[];const settings=q.data?.paymentSettings;
 const filteredLedger=ledger.filter(x=>filter==='all'||x.type===filter);
 const pendingRecharges=recharges.filter(r=>String(r.status).toLowerCase()==='pending').length;
 const pendingAmountPaise=recharges.filter(r=>String(r.status).toLowerCase()==='pending').reduce((sum,r)=>sum+(r.amountPaise||0),0);
 const statusMeta=(status:string)=>{const value=status.replace(/_/g,' ').toLowerCase();if(['verified','approved','credited','completed','success','successful'].includes(value))return {label:'Verified',tone:'success'};if(['rejected','failed','declined','cancelled','canceled'].includes(value))return {label:'Rejected',tone:'danger'};if(['flagged','manual review','under review'].includes(value))return {label:'Review',tone:'review'};return {label:value||'Pending',tone:'pending'}};
 const selectedRecharge=detail?recharges.find(r=>r.id===detail):null;
 const upiIntent=q.data?.upiId?'upi://pay?pa='+encodeURIComponent(q.data.upiId)+'&pn='+encodeURIComponent(settings?.merchantName||'INBOX9')+'&am='+encodeURIComponent((Number(amount||0)).toFixed(2))+'&cu=INR&tn='+encodeURIComponent('INBOX9 Wallet Recharge'):null;
 async function copyUpi(){if(!q.data?.upiId)return;try{await navigator.clipboard.writeText(q.data.upiId);setUpiCopied(true);window.setTimeout(()=>setUpiCopied(false),1400)}catch{setError('Copy is not available in this browser.')}}
 function resetRechargeForm(){setSent(false);setError(null);setUtr('');setPaymentStarted(false)}
 function openUpi(){if(!upiIntent)return;setPaymentStarted(true);window.location.href=upiIntent}
 return <section className="page-section wallet-page">
  <div className="catalog-heading wallet-heading"><div><span className="catalog-eyebrow">WALLET</span><h1>Wallet</h1><p>Recharge securely, track verification, and keep every wallet movement in one place.</p></div><span className="catalog-chip">INR</span></div>
  <div className="wallet-overview">
   <div className="wallet-overview-main wallet-summary-cell wallet-balance-cell"><span>Available balance</span><strong>₹{((q.data?.balancePaise??0)/100).toFixed(2)}</strong><small>{q.isPending?'Refreshing wallet…':q.isError?'Balance unavailable':pendingRecharges?pendingRecharges+' recharge'+(pendingRecharges===1?' is':'s are')+' awaiting verification':'No recharge is awaiting verification'}</small></div>
   <div className="wallet-stat-grid">
    <div className="wallet-summary-cell"><span>Pending amount</span><strong>₹{(pendingAmountPaise/100).toFixed(2)}</strong><small>Manual verification queue</small></div>
    <div className="wallet-summary-cell"><span>Wallet credits</span><strong>{q.data?.summary?.creditCount??ledger.filter(x=>x.type==='credit').length}</strong><small>Posted credit entries</small></div>
    <div className="wallet-summary-cell"><span>Wallet debits</span><strong>{q.data?.summary?.debitCount??ledger.filter(x=>x.type==='debit').length}</strong><small>Service and account movements</small></div>
   </div>
  </div>
  {q.isError?<div className="error-card">Could not load wallet. Reconnect and try again.</div>:null}
  <div className="wallet-recharge-shell">
   <div className="recharge-card wallet-recharge-card">
    <div className="section-heading"><div><span className="catalog-eyebrow">MANUAL UPI</span><h2>Add funds</h2><span className="section-subtle">Pay the exact amount, then submit the UTR for verification.</span></div>{q.data?.rechargeEnabled?<span className="payment-live-pill"><span/>Enabled</span>:null}</div>
    {q.data?.rechargeEnabled?<><div className="wallet-payment-destination"><div className="wallet-payment-destination-main"><span>Pay to {settings?.merchantName||'INBOX9'}</span><strong>{q.data.upiId}</strong><small>{settings?.instructions||'Pay the exact amount and keep your UTR / transaction reference.'}</small></div><button className="copy-button" type="button" onClick={()=>void copyUpi()}><Icon name="copy" size={16}/>{upiCopied?'Copied':'Copy UPI ID'}</button></div>
      <div className="wallet-payment-tools"><div className="wallet-amount-panel"><span className="card-label">1 · Choose amount</span><div className="quick-amounts">{[100,250,500,1000,2500,5000].map(v=><button key={v} type="button" className={amount===String(v)?'amount-chip is-selected':'amount-chip'} onClick={()=>{setAmount(String(v));setSent(false);setError(null)}}>₹{v}</button>)}</div><label className="field"><span>Custom amount</span><div className="money-input"><span>₹</span><input type="number" min="100" max="5000" step="1" value={amount} onChange={e=>{setAmount(e.target.value);setSent(false);setError(null)}} required/></div></label></div><div className="wallet-qr-panel"><span className="card-label">2 · Pay by UPI</span>{settings?.qrImage?<img className="wallet-payment-qr" src={settings.qrImage} alt="INBOX9 UPI payment QR code"/>:<div className="wallet-payment-qr-placeholder"><Icon name="wallet" size={24}/><span>Use the UPI ID shown above.</span></div>}{upiIntent?<button type="button" className="outline-button compact-button wallet-upi-open-button" onClick={openUpi}>Open UPI app <Icon name="arrow" size={15}/></button>:null}</div></div>
      {!paymentStarted?<button type="button" className="payment-paid-button" onClick={()=>setPaymentStarted(true)}><span className="payment-step-number">3</span><span><strong>I’ve completed the payment</strong><small>Continue to enter the bank UTR / transaction reference.</small></span><Icon name="arrow" size={17}/></button>:null}
      {paymentStarted?<form className="recharge-form wallet-recharge-form" onSubmit={e=>{e.preventDefault();setSent(false);setError(null);void recharge.mutate()}}><div className="payment-utr-head"><div><span className="card-label">3 · Submit UTR</span><strong>₹{(Number(amount||0)||0).toFixed(2)} payment</strong></div><button type="button" className="text-button compact-button" onClick={()=>setPaymentStarted(false)} disabled={recharge.isPending}>Back</button></div><label className="field"><span>UTR / transaction reference</span><input value={utr} onChange={e=>{setUtr(e.target.value);setSent(false)}} placeholder="Enter the UTR from your UPI payment" minLength={4} maxLength={64} autoComplete="off" required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}{sent&&!error?<div className="success-card"><Icon name="check" size={18}/><div><strong>Recharge submitted</strong><span>Wallet credit is applied only after verification. Your recharge status will update automatically.</span></div></div>:null}<div className="recharge-form-actions"><button type="submit" className="primary-button primary-button-large" disabled={recharge.isPending}>{recharge.isPending?'Submitting…':'Submit for verification'}<Icon name="arrow" size={18}/></button><button type="button" className="text-button" onClick={resetRechargeForm} disabled={recharge.isPending}>Reset</button></div></form>:null}
      <div className="wallet-payment-note"><Icon name="check" size={15}/><span>Manual verification protects the wallet from false client-side payment confirmations.</span></div></>:<div className="info-card"><Icon name="clock" size={20}/><div><strong>Manual recharge is not enabled.</strong><p>No payment destination is shown until UPI recharge is configured for this deployment.</p></div></div>}
   </div><aside className="wallet-help-card"><span className="catalog-eyebrow">HOW IT WORKS</span><h3>Pay → verify → credit</h3><div className="wallet-help-step"><b>01</b><span>Choose an amount between ₹100 and ₹5,000.</span></div><div className="wallet-help-step"><b>02</b><span>Pay the exact amount to the INBOX9 UPI destination.</span></div><div className="wallet-help-step"><b>03</b><span>Submit the UTR and keep the recharge reference for support.</span></div><div className="wallet-help-step"><b>04</b><span>Wallet balance changes only after server-side/admin verification.</span></div></aside>
  </div>
  <div className="wallet-section-heading"><div><span className="catalog-eyebrow">RECHARGES</span><h2>Recharge history</h2><span>{recharges.length?`${recharges.length} request${recharges.length===1?'':'s'}`:'No recharge requests yet'}</span></div>{pendingRecharges?<span className="wallet-pending-pill">{pendingRecharges} pending</span>:<button type="button" className="text-button compact-button" onClick={()=>void q.refetch()} disabled={q.isFetching}>Refresh</button>}</div>
  {selectedRecharge?<div className="wallet-detail-card"><div className="wallet-detail-head"><div><span className="card-label">Recharge detail</span><h3>₹{(selectedRecharge.amountPaise/100).toFixed(2)}</h3></div><button className="sheet-close wallet-detail-close" type="button" aria-label="Close recharge details" onClick={()=>setDetail(null)}><Icon name="close" size={18}/></button></div><div className="wallet-detail-grid"><div><span>Status</span><strong className={'wallet-status-text wallet-status-'+statusMeta(selectedRecharge.status).tone}>{statusMeta(selectedRecharge.status).label}</strong></div><div><span>Submitted</span><strong>{new Date(selectedRecharge.submittedAt).toLocaleString()}</strong></div><div><span>UTR</span><strong>{selectedRecharge.utr}</strong></div>{selectedRecharge.reviewedAt?<div><span>Reviewed</span><strong>{new Date(selectedRecharge.reviewedAt).toLocaleString()}</strong></div>:null}{selectedRecharge.verifiedAmountPaise!=null?<div><span>Verified amount</span><strong>₹{(selectedRecharge.verifiedAmountPaise/100).toFixed(2)}</strong></div>:null}{selectedRecharge.verifiedUtr?<div><span>Verified UTR</span><strong>{selectedRecharge.verifiedUtr}</strong></div>:null}{selectedRecharge.externalReference?<div><span>External reference</span><strong>{selectedRecharge.externalReference}</strong></div>:null}{selectedRecharge.rejectionReason?<div className="wallet-detail-wide"><span>Reason</span><strong>{selectedRecharge.rejectionReason}</strong></div>:null}</div><Link className="wallet-support-link" to={'/support?category=recharge&rechargeId='+encodeURIComponent(selectedRecharge.id)}>Need help with this recharge <Icon name="arrow" size={15}/></Link></div>:null}
  {recharges.length?<div className="ledger-list wallet-recharge-list">{recharges.map(r=>{const meta=statusMeta(r.status);return <button className={'ledger-row ledger-row-button wallet-recharge-row'+(detail===r.id?' is-open':'')} type="button" key={r.id} onClick={()=>setDetail(previous=>previous===r.id?null:r.id)}><div><strong>₹{(r.amountPaise/100).toFixed(2)} recharge</strong><span>{new Date(r.submittedAt).toLocaleString()} · {r.utr}</span></div><b className={'wallet-status-pill wallet-status-'+meta.tone}>{meta.label}</b></button>})}</div>:<div className="empty-state compact-empty"><h3>No recharge requests</h3><p>Submitted UPI recharge requests will appear here.</p></div>}
  <div className="wallet-section-heading"><div><span className="catalog-eyebrow">LEDGER</span><h2>Wallet activity</h2><span>Immutable credits and debits from your account</span></div><button type="button" className="text-button compact-button" onClick={()=>void q.refetch()} disabled={q.isFetching}>Refresh</button></div>
  <div className="wallet-filter-tabs" role="tablist" aria-label="Wallet activity filter">{([['all','All'],['credit','Credits'],['debit','Debits']] as const).map(([value,label])=><button type="button" role="tab" aria-selected={filter===value} className={filter===value?'wallet-filter-tab is-selected':'wallet-filter-tab'} onClick={()=>setFilter(value)} key={value}>{label}</button>)}</div>
  {filteredLedger.length?<div className="ledger-list">{filteredLedger.slice(0,50).map(i=><div className="ledger-row wallet-activity-row" key={i.id}><div><strong>{i.description||'Wallet transaction'}</strong><span>{new Date(i.createdAt ?? Date.now()).toLocaleString()} · {i.referenceType||'ledger'}</span></div><b className={i.type==='debit'?'ledger-debit':'ledger-credit'}>{i.type==='debit'?'−':'+'}₹{((i.amountPaise ?? 0)/100).toFixed(2)}</b></div>)}</div>:<div className="empty-state compact-empty"><h3>No {filter==='all'?'wallet activity':filter==='credit'?'credit':'debit'} transactions</h3><p>Transactions matching this filter will appear here.</p></div>}
 </section>
}
function NotificationsPage(){
 const client=useQueryClient();const q=useQuery({queryKey:['notifications'],queryFn:getNotifications,refetchInterval:15000});
 const markAll=useMutation({mutationFn:markAllNotificationsRead,onSuccess:async()=>{await client.invalidateQueries({queryKey:['notifications']})}});
 const markOne=useMutation({mutationFn:(id:string)=>markNotificationRead(id),onSuccess:async()=>{await client.invalidateQueries({queryKey:['notifications']})}});
 const [filter,setFilter]=useState<'all'|'unread'>('all');const items=q.data?.notifications??[];
 const unread=items.filter(n=>!n.read).length;const visible=filter==='unread'?items.filter(n=>!n.read):items;
 const target=(n:Notification)=>n.kind==='activation'&&n.sourceId?'/buy?activationId='+encodeURIComponent(n.sourceId):n.page==='wallet'?'/wallet':n.page==='support'?'/support':'/apps';
 function ago(t:number){const ms=Math.max(0,Date.now()-t);const m=Math.floor(ms/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const d=Math.floor(h/24);return d<30?d+'d ago':new Date(t).toLocaleDateString()}
 function toneClass(n:Notification){return ['success','danger','warning','info'].includes(String(n.tone))?' notification-tone-'+n.tone:' notification-tone-info'}
 function iconFor(n:Notification):IconName{return n.kind==='activation'?'active':n.kind==='recharge'?'wallet':n.kind==='support'?'support':'bell'}
 return <section className="page-section notifications-page">
  <div className="catalog-heading notifications-heading"><div><h1>Notifications</h1><p>Account, wallet, activation and support updates in one place.</p></div>{unread?<span className="catalog-chip">{unread} unread</span>:<span className="catalog-chip">All caught up</span>}</div>
  <div className="notification-summary">
   <div><span>Inbox</span><strong>{items.length}</strong><small>{items.length===1?'update':'updates'}</small></div>
   <div><span>Unread</span><strong>{unread}</strong><small>{unread?'needs attention':'nothing pending'}</small></div>
   {unread?<button type="button" className="notification-mark-all" disabled={markAll.isPending} onClick={()=>void markAll.mutate()}>{markAll.isPending?'Marking...':'Mark all read'}</button>:null}
  </div>
  <div className="notification-filter-tabs" role="tablist" aria-label="Notification filter">
   <button type="button" role="tab" aria-selected={filter==='all'} className={filter==='all'?'notification-filter-tab is-selected':'notification-filter-tab'} onClick={()=>setFilter('all')}>All<span>{items.length}</span></button>
   <button type="button" role="tab" aria-selected={filter==='unread'} className={filter==='unread'?'notification-filter-tab is-selected':'notification-filter-tab'} onClick={()=>setFilter('unread')}>Unread<span>{unread}</span></button>
  </div>
  {q.isError?<div className="error-card">Notifications could not be loaded. Reconnect and retry.</div>:null}
  {visible.length?<div className="notification-list">{visible.map(n=><Link key={n.id} className={'notification-row'+(n.read?'':' unread')+toneClass(n)} to={target(n)} onClick={()=>{if(!n.read)void markOne.mutate(n.id)}}>
    <span className="notification-icon"><Icon name={iconFor(n)} size={19}/></span>
    <div className="notification-main"><div className="notification-title"><strong>{n.title}</strong><time dateTime={new Date(n.createdAt).toISOString()}>{ago(n.createdAt)}</time></div><p>{n.body}</p><span className="notification-link-label">Open {n.page==='active'?'activation':n.page==='wallet'?'wallet':n.page==='support'?'support':'app'} <Icon name="arrow" size={12}/></span></div>
    {!n.read?<span className="unread-dot" aria-label="Unread"/>:null}
  </Link>)}</div>:<div className="empty-state notification-empty"><div className="empty-icon"><Icon name="bell" size={28}/></div><h3>{filter==='unread'?'No unread notifications':'You’re all caught up'}</h3><p>{filter==='unread'?'Read updates stay in your notification history.':'New account, recharge, activation and support updates will appear here.'}</p>{filter==='unread'?<button type="button" className="outline-button compact-button" onClick={()=>setFilter('all')}>View all notifications</button>:null}</div>}
 </section>
}

function AccountPage(){
 const user=useSessionStore(s=>s.user);const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const navigate=useNavigate();const queryClient=useQueryClient();
 const [name,setName]=useState(user?.displayName||'');const [profileMsg,setProfileMsg]=useState<string|null>(null);const [profileError,setProfileError]=useState<string|null>(null);
 const [currentPassword,setCurrentPassword]=useState('');const [newPassword,setNewPassword]=useState('');const [confirmPassword,setConfirmPassword]=useState('');const [securityError,setSecurityError]=useState<string|null>(null);const [securityMsg,setSecurityMsg]=useState<string|null>(null);
 const [recoveryCode,setRecoveryCode]=useState<string|null>(null);const [recoveryMsg,setRecoveryMsg]=useState<string|null>(null);const [copyMsg,setCopyMsg]=useState(false);const [accountRefresh,setAccountRefresh]=useState(false);
 const profile=useMutation({mutationFn:()=>updateProfile(name),onSuccess:r=>{setUser(r.user);setProfileMsg('Profile saved.');setProfileError(null)},onError:e=>setProfileError(e instanceof Error?e.message:'Profile update failed')});
 const password=useMutation({mutationFn:()=>changePassword(currentPassword,newPassword),onSuccess:r=>{setUser(r.user);setBootstrap('ready');setCurrentPassword('');setNewPassword('');setConfirmPassword('');setSecurityMsg('Password changed; previous sessions were invalidated.');setSecurityError(null)},onError:e=>setSecurityError(e instanceof Error?e.message:'Password change failed')});
 const recovery=useMutation({mutationFn:issueRecoveryCode,onSuccess:r=>{setRecoveryCode(r.code);setRecoveryMsg('One-time code generated. Store it somewhere safe before leaving this page.')},onError:e=>setRecoveryMsg(e instanceof Error?e.message:'Could not generate recovery code')});
 const sessions=useQuery({queryKey:['sessions'],queryFn:getSessions,staleTime:15000});
 const revoke=useMutation({mutationFn:(id:string)=>revokeSession(id),onSuccess:async()=>{await sessions.refetch()}});
 const all=useMutation({mutationFn:logoutAll,onSuccess:()=>{setUser(null);setBootstrap('signed-out');navigate('/login',{replace:true})}});
 async function refreshAccount(){setAccountRefresh(true);try{await Promise.all([sessions.refetch(),queryClient.invalidateQueries({queryKey:['wallet']}),queryClient.invalidateQueries({queryKey:['notifications']})])}finally{setAccountRefresh(false)}}
 async function copyRecovery(){if(!recoveryCode)return;try{await navigator.clipboard.writeText(recoveryCode);setCopyMsg(true);window.setTimeout(()=>setCopyMsg(false),1400)}catch{setRecoveryMsg('Copy is not available in this browser.')}}
 const sessionCount=sessions.data?.sessions.length??0;const policy=sessions.data?.policy;const currentSession=sessions.data?.sessions.find(s=>s.current);
 return <section className="page-section account-page">
  <div className="account-hero account-hero-rich"><div className="account-avatar">{(user?.displayName||user?.email||'I').slice(0,1).toUpperCase()}</div><div className="account-hero-copy"><h1>Account</h1><p>{user?.email}</p><span><span className="account-online-dot"/> Signed-in account</span></div><button className="account-refresh" type="button" onClick={()=>void refreshAccount()} disabled={accountRefresh} aria-label="Refresh account data"><Icon name="clock" size={17}/>{accountRefresh?'Refreshing…':'Refresh'}</button></div>
  <div className="account-security-banner"><div><span>Account security</span><strong>{sessionCount>1?'Multiple active sessions':'One active session'}</strong><small>{currentSession?'This device is signed in.':'Session status is currently unavailable.'}</small></div><span className="security-state"><Icon name="check" size={15}/> Protected</span></div>
  <div className="account-panels">
   <div className="account-panel account-panel-profile"><div className="section-heading"><div><h2>Profile</h2><span className="section-subtle">How your account is shown</span></div></div><form className="form-stack" onSubmit={e=>{e.preventDefault();void profile.mutate()}}><label className="field"><span>Display name</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={64} placeholder="Add a display name"/></label>{profileError?<div className="form-error" role="alert">{profileError}</div>:null}{profileMsg?<div className="success-card" role="status"><Icon name="check" size={17}/><span>{profileMsg}</span></div>:null}<button className="primary-button" disabled={profile.isPending}>{profile.isPending?'Saving…':'Save profile'}</button></form></div>
   <div className="account-panel"><div className="section-heading"><div><h2>Password</h2><span className="section-subtle">Change your sign-in password</span></div></div><form className="form-stack" onSubmit={e=>{e.preventDefault();setSecurityError(null);if(newPassword!==confirmPassword){setSecurityError('New passwords do not match.');return}void password.mutate()}}><label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" required/></label><label className="field"><span>New password</span><input type="password" minLength={8} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" required/></label><label className="field"><span>Confirm new password</span><input type="password" minLength={8} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required/></label>{securityError?<div className="form-error" role="alert">{securityError}</div>:null}{securityMsg?<div className="success-card" role="status"><Icon name="check" size={17}/><span>{securityMsg}</span></div>:null}<button className="primary-button" disabled={password.isPending}>{password.isPending?'Updating…':'Change password'}</button></form></div>
   <div className="account-panel"><div className="section-heading"><div><h2>Recovery</h2><span className="section-subtle">Emergency password reset</span></div></div><p className="panel-copy">Generate a one-time recovery code while signed in. Use it from the recovery screen if you lose access to your password.</p>{recoveryCode?<div className="recovery-code"><code>{recoveryCode}</code><button className="copy-button" type="button" onClick={()=>void copyRecovery()}>{copyMsg?'Copied':'Copy'}</button></div>:null}{recoveryMsg?<div className="info-card" role="status">{recoveryMsg}</div>:null}<button className="outline-button" type="button" disabled={recovery.isPending} onClick={()=>void recovery.mutate()}>{recovery.isPending?'Generating…':'Generate recovery code'}</button><Link className="text-button compact-button" to="/recover">Open recovery screen <Icon name="arrow" size={14}/></Link></div>
   <div className="account-panel account-session-panel"><div className="section-heading"><div><h2>Sessions</h2><span className="section-subtle">Devices with access to your account</span></div><span className="catalog-chip">{sessionCount}</span></div>{sessions.isPending?<div className="session-list"><div className="session-skeleton"/><div className="session-skeleton"/></div>:null}{sessions.isError?<div className="error-card" role="alert">Could not load sessions. <button type="button" className="inline-retry" onClick={()=>void sessions.refetch()}>Retry</button></div>:null}{sessions.data?.sessions.length?<div className="session-list">{sessions.data.sessions.map(s=><div className={'session-row'+(s.current?' session-row-current':'')} key={s.id}><div><strong>{s.current?'This device':'Other session'}</strong><span>Created {new Date(s.createdAt).toLocaleString()}</span><span>Last used {s.lastUsedAt?new Date(s.lastUsedAt).toLocaleString():'—'}</span>{s.expiresAt?<span>Expires {new Date(s.expiresAt).toLocaleString()}</span>:null}</div>{!s.current?<button className="text-button" type="button" disabled={revoke.isPending} onClick={()=>void revoke.mutate(s.id)}>Revoke</button>:<span className="current-session">Current</span>}</div>)}</div>:sessions.isSuccess?<div className="empty-state compact-empty"><h3>No additional sessions</h3><p>Only this device currently has access.</p></div>:null}<div className="session-policy">{policy?<span>Session limit {policy.maxSessionsPerUser} · Absolute lifetime {policy.absoluteDays} days</span>:<span>Session policy is managed securely by INBOX9.</span>}<button type="button" className="inline-retry" onClick={()=>void sessions.refetch()} disabled={sessions.isFetching}>Refresh</button></div><button className="secondary-danger" type="button" disabled={all.isPending} onClick={()=>void all.mutate()}>{all.isPending?'Signing out…':'Sign out everywhere'}</button></div>
   <div className="account-panel"><div className="section-heading"><div><h2>Account tools</h2><span className="section-subtle">Keep the important actions close</span></div></div><div className="menu-card"><Link to="/wallet" className="menu-row"><span><Icon name="wallet" size={20}/><b>Wallet & recharge</b></span><Icon name="arrow" size={18}/></Link><Link to="/notifications" className="menu-row"><span><Icon name="bell" size={20}/><b>Notifications</b></span><Icon name="arrow" size={18}/></Link><Link to="/support" className="menu-row"><span><Icon name="support" size={20}/><b>Support</b></span><Icon name="arrow" size={18}/></Link></div></div>
   <div className="account-panel account-resilience-panel"><div className="section-heading"><div><h2>Resilience</h2><span className="section-subtle">Connection and account-data recovery</span></div></div><div className="resilience-row"><span className="resilience-indicator is-online"/><div><strong>Connection available</strong><small>INBOX9 refreshes account data when connectivity returns.</small></div></div><button className="outline-button" type="button" onClick={()=>void refreshAccount()} disabled={accountRefresh}>{accountRefresh?'Refreshing account data…':'Refresh account data'}<Icon name="clock" size={16}/></button></div>
   <div className="account-panel"><button className="secondary-danger" type="button" disabled={all.isPending} onClick={()=>void all.mutate()}>{all.isPending?'Signing out…':'Sign out'}</button><p className="panel-copy">Your profile, sessions, password and recovery controls are handled server-side.</p></div>
  </div>
 </section>
}
function AdminPaymentsPage(){
 const user=useSessionStore(s=>s.user);const pendingQ=useQuery({queryKey:['admin-recharges'],queryFn:getAdminRecharges,refetchInterval:10000});const reconQ=useQuery({queryKey:['admin-payment-reconciliation'],queryFn:getAdminPaymentReconciliation,refetchInterval:15000});const [ledgerQuery,setLedgerQuery]=useState('');const [ledgerType,setLedgerType]=useState<'all'|'credit'|'debit'>('all');const [ledgerOffset,setLedgerOffset]=useState(0);const ledgerPageSize=30;const ledgerQ=useQuery({queryKey:['admin-ledger',ledgerQuery,ledgerType,ledgerOffset],queryFn:()=>getAdminLedger({q:ledgerQuery,type:ledgerType,limit:ledgerPageSize,offset:ledgerOffset}),refetchInterval:15000});const ledger=Array.isArray(ledgerQ.data?.ledger)?ledgerQ.data.ledger:[];const ledgerSummary=ledgerQ.data?.summary??{total:0,credits:0,debits:0,creditPaise:0,debitPaise:0};const ledgerHasMore=ledgerQ.data?.pagination?.hasMore??false;const client=useQueryClient();
 const [selectedId,setSelectedId]=useState<string|null>(null);const [decision,setDecision]=useState<'approve'|'reject'|'flag'>('approve');const [verifiedAmount,setVerifiedAmount]=useState('');const [verifiedUtr,setVerifiedUtr]=useState('');const [externalReference,setExternalReference]=useState('');const [reason,setReason]=useState('');
 const [settings,setSettings]=useState({upiId:'',merchantName:'INBOX9',instructions:'Pay the exact amount and keep the UTR / transaction reference.',qrImage:''});const [settingsMsg,setSettingsMsg]=useState<string|null>(null);const [settingsError,setSettingsError]=useState<string|null>(null);const [reviewError,setReviewError]=useState<string|null>(null);
 useEffect(()=>{const s=reconQ.data?.paymentSettings;if(s)setSettings({upiId:s.upiId||'',merchantName:s.merchantName||'INBOX9',instructions:s.instructions||'Pay the exact amount and keep the UTR / transaction reference.',qrImage:s.qrImage||''})},[reconQ.data?.paymentSettings]);
 const review=useMutation({mutationFn:()=>reviewAdminRecharge(selectedId||'',{decision,verifiedAmount:verifiedAmount.trim()?Number(verifiedAmount):undefined,verifiedUtr:verifiedUtr.trim()||undefined,externalReference:externalReference.trim()||undefined,reason:reason.trim()||undefined}),onSuccess:async()=>{setReviewError(null);setSelectedId(null);setReason('');setExternalReference('');setVerifiedAmount('');setVerifiedUtr('');await Promise.all([pendingQ.refetch(),reconQ.refetch(),client.invalidateQueries({queryKey:['wallet']}),client.invalidateQueries({queryKey:['notifications']})])},onError:e=>setReviewError(e instanceof Error?e.message:'Recharge review failed')});
 const saveSettings=useMutation({mutationFn:()=>updatePaymentSettings(settings),onSuccess:async r=>{if(r.paymentSettings)setSettings({upiId:r.paymentSettings.upiId||'',merchantName:r.paymentSettings.merchantName,instructions:r.paymentSettings.instructions,qrImage:r.paymentSettings.qrImage||''});setSettingsMsg('Payment settings saved.');setSettingsError(null);await reconQ.refetch()},onError:e=>{setSettingsMsg(null);setSettingsError(e instanceof Error?e.message:'Payment settings update failed')}});
 if(!user||user.role!=='admin')return <section className="page-section"><div className="error-card">Admin access required.</div></section>;
 const pending=pendingQ.data?.recharges??[];const flagged=reconQ.data?.flagged??[];const events=reconQ.data?.webhookEvents??[];const summary=reconQ.data?.summary;
 const openReview=(r:AdminRecharge,nextDecision:'approve'|'reject'|'flag')=>{setSelectedId(r.id);setDecision(nextDecision);setVerifiedAmount((r.amountPaise/100).toFixed(2));setVerifiedUtr(r.utr||'');setExternalReference('');setReason('');setReviewError(null)};
 return <section className="page-section admin-payments-page"><div className="catalog-heading"><div><span className="catalog-eyebrow">ADMIN · PAYMENTS</span><h1>Payment operations</h1><p>Review manual UPI recharges, maintain the payment destination, and reconcile settlement activity.</p></div><span className="catalog-chip">{pending.length} pending</span></div>
  <div className="admin-payment-summary"><div><span>Total requests</span><strong>{summary?.totals.count??0}</strong><small>All recharge requests</small></div><div><span>Submitted value</span><strong>₹{((summary?.totals.amountPaise??0)/100).toFixed(2)}</strong><small>Total requested value</small></div><div><span>Flagged</span><strong>{summary?.totals.flaggedCount??0}</strong><small>Manual investigation signals</small></div></div>
  <div className="admin-payment-panel admin-wallet-ledger-panel"><div className="section-heading"><div><span className="catalog-eyebrow">WALLET LEDGER</span><h2>Balance movements</h2><span className="section-subtle">Read-only accounting trail for customer wallet credits and debits.</span></div><button className="text-button compact-button" type="button" onClick={()=>void ledgerQ.refetch()} disabled={ledgerQ.isFetching}>{ledgerQ.isFetching?'Refreshing…':'Refresh'}</button></div><div className="admin-wallet-ledger-summary"><div><span>Entries</span><strong>{ledgerSummary.total}</strong></div><div><span>Credits</span><strong>₹{((ledgerSummary.creditPaise)/100).toFixed(2)}</strong></div><div><span>Debits</span><strong>₹{((ledgerSummary.debitPaise)/100).toFixed(2)}</strong></div></div><div className="admin-wallet-ledger-toolbar"><input className="admin-search-input" value={ledgerQuery} onChange={e=>{setLedgerQuery(e.target.value);setLedgerOffset(0)}} placeholder="Search user, reference or description" aria-label="Search wallet ledger"/><select className="admin-filter-select" value={ledgerType} onChange={e=>{setLedgerType(e.target.value as typeof ledgerType);setLedgerOffset(0)}} aria-label="Filter wallet ledger type"><option value="all">All movements</option><option value="credit">Credits</option><option value="debit">Debits</option></select></div>{ledgerQ.isError?<div className="error-card">Wallet ledger unavailable. Retry the request.</div>:ledger.length?<div className="admin-ledger-list">{ledger.map(entry=><div className="admin-ledger-row" key={entry.id}><div><strong>{entry.email}</strong><span>{entry.description}</span><small>{entry.referenceType} · {entry.referenceId} · {new Date(entry.createdAt).toLocaleString()}</small></div><b className={entry.type==='credit'?'is-credit':'is-debit'}>{entry.type==='credit'?'+':'−'}₹{(entry.amountPaise/100).toFixed(2)}</b></div>)}</div>:<div className="empty-state compact-empty"><h3>No ledger entries</h3><p>Wallet movements will appear here after a recorded credit or debit.</p></div>}<div className="admin-pagination"><button className="outline-button" type="button" disabled={ledgerOffset===0||ledgerQ.isFetching} onClick={()=>setLedgerOffset(v=>Math.max(0,v-ledgerPageSize))}>Previous</button><span>{ledger.length?ledgerOffset+1+'–'+Math.min(ledgerOffset+ledger.length,ledgerSummary.total)+' of '+ledgerSummary.total:'No results'}</span><button className="outline-button" type="button" disabled={!ledgerHasMore||ledgerQ.isFetching} onClick={()=>setLedgerOffset(v=>v+ledgerPageSize)}>Next</button></div></div>
  <div className="admin-payment-grid"><div className="admin-payment-panel"><div className="section-heading"><div><span className="catalog-eyebrow">QUEUE</span><h2>Pending recharge requests</h2><span className="section-subtle">Verify amount + UTR before crediting.</span></div><button className="text-button compact-button" type="button" onClick={()=>void pendingQ.refetch()} disabled={pendingQ.isFetching}>Refresh</button></div>{pendingQ.isError?<div className="error-card">Recharge queue unavailable. Retry the request.</div>:null}{pending.length?<div className="admin-recharge-list">{pending.map(r=><div className={'admin-recharge-row'+(selectedId===r.id?' is-selected':'')} key={r.id}><div className="admin-recharge-main"><div><strong>{r.email||r.userId}</strong><span>{new Date(r.submittedAt).toLocaleString()}</span></div><div className="admin-recharge-money">₹{(r.amountPaise/100).toFixed(2)}</div><span className="admin-recharge-utr">UTR · {r.utr}</span>{r.recentPayments?.length?<span className="admin-recharge-history">{r.recentPayments.length} prior recharge request{r.recentPayments.length===1?'':'s'} on this account</span>:null}</div><div className="admin-recharge-actions"><button type="button" className="primary-button compact-button" onClick={()=>openReview(r,'approve')}>Review</button><button type="button" className="text-button compact-button" onClick={()=>openReview(r,'flag')}>Flag</button></div>
       {selectedId===r.id?<div className="admin-review-form"><div className="admin-review-switch"><button type="button" className={decision==='approve'?'is-selected':''} onClick={()=>setDecision('approve')}>Approve</button><button type="button" className={decision==='flag'?'is-selected':''} onClick={()=>setDecision('flag')}>Flag</button><button type="button" className={decision==='reject'?'is-selected':''} onClick={()=>setDecision('reject')}>Reject</button></div>{decision!=='reject'?<><label className="field"><span>Verified amount</span><div className="money-input"><span>₹</span><input value={verifiedAmount} onChange={e=>setVerifiedAmount(e.target.value)} type="number" min="100" max="5000" step="1" required={decision==='approve'}/></div></label><label className="field"><span>Verified UTR</span><input value={verifiedUtr} onChange={e=>setVerifiedUtr(e.target.value)} maxLength={64} required={decision==='approve'}/></label><label className="field"><span>External reference <small>(optional)</small></span><input value={externalReference} onChange={e=>setExternalReference(e.target.value)} maxLength={120} placeholder="Bank statement / provider reference"/></label></>:null}<label className="field"><span>{decision==='approve'?'Review note':decision==='flag'?'Flag reason':'Rejection reason'}</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder={decision==='approve'?'Optional internal note':'Explain what was verified or why this needs review'} required={decision!=='approve'}/></label>{reviewError?<div className="form-error" role="alert">{reviewError}</div>:null}<div className="admin-review-actions"><button type="button" className={decision==='reject'?'secondary-danger':'primary-button'} disabled={review.isPending} onClick={()=>void review.mutate()}>{review.isPending?'Saving…':decision==='approve'?'Approve & credit':decision==='flag'?'Flag for review':'Reject recharge'}<Icon name={decision==='reject'?'close':'check'} size={16}/></button><button type="button" className="text-button" onClick={()=>setSelectedId(null)} disabled={review.isPending}>Cancel</button></div></div>:null}
      </div>)}</div>:<div className="empty-state compact-empty"><h3>No pending recharges</h3><p>New manual UPI requests will appear here.</p></div>}</div>
   <div className="admin-payment-panel"><div className="section-heading"><div><span className="catalog-eyebrow">SETTINGS</span><h2>Manual payment destination</h2><span className="section-subtle">Customers see these details in Wallet.</span></div></div><form className="form-stack" onSubmit={e=>{e.preventDefault();setSettingsMsg(null);setSettingsError(null);void saveSettings.mutate()}}><label className="field"><span>Merchant UPI ID</span><input value={settings.upiId} onChange={e=>setSettings(s=>({...s,upiId:e.target.value}))} placeholder="merchant@upi" required/></label><label className="field"><span>Merchant name</span><input value={settings.merchantName} onChange={e=>setSettings(s=>({...s,merchantName:e.target.value}))} maxLength={80}/></label><label className="field"><span>Customer instructions</span><textarea value={settings.instructions} onChange={e=>setSettings(s=>({...s,instructions:e.target.value}))} maxLength={500}/></label><label className="field"><span>QR image URL or image data</span><textarea value={settings.qrImage} onChange={e=>setSettings(s=>({...s,qrImage:e.target.value}))} maxLength={350000} placeholder="https://.../qr.png or image data URI"/></label>{settingsError?<div className="form-error" role="alert">{settingsError}</div>:null}{settingsMsg?<div className="success-card" role="status"><Icon name="check" size={17}/><span>{settingsMsg}</span></div>:null}<button type="submit" className="primary-button" disabled={saveSettings.isPending}>{saveSettings.isPending?'Saving…':'Save payment settings'}<Icon name="check" size={16}/></button></form><div className="admin-payment-note"><Icon name="wallet" size={16}/><span>Manual recharge is separate from automatic gateway settlement. Customer balance changes only through verified server-side review.</span></div></div></div>
  <div className="admin-payment-panel admin-payment-history-panel"><div className="section-heading"><div><span className="catalog-eyebrow">RECONCILIATION</span><h2>Flags & webhook events</h2><span className="section-subtle">Investigate exceptions without directly editing wallet balances.</span></div></div>{flagged.length?<div className="admin-signal-list">{flagged.slice(0,20).map(r=><div className="admin-signal-row" key={'f-'+r.id}><div><strong>{r.email}</strong><span>₹{(r.amountPaise/100).toFixed(2)} · {r.status}</span><span>{r.flagReason||'Flagged for review'}</span></div><span>{r.utr}</span></div>)}</div>:<div className="empty-state compact-empty"><h3>No flagged requests</h3><p>Requests that need investigation will appear here.</p></div>}{events.length?<div className="admin-signal-list admin-webhook-list">{events.slice(0,20).map(event=><div className="admin-signal-row" key={event.provider+'-'+event.eventId}><div><strong>{event.eventType}</strong><span>{event.provider} · {event.outcome||event.status}</span><span>{event.rechargeId}</span></div><span>{event.amountPaise?`₹${(event.amountPaise/100).toFixed(2)}`:'—'}</span></div>)}</div>:<div className="empty-state compact-empty"><h3>No webhook events</h3><p>Verified gateway events will appear here when an automated gateway is connected.</p></div>}</div>
 </section>
}
function SupportPage(){
 const [params]=useSearchParams();const q=useQuery({queryKey:['support'],queryFn:getSupportTickets,refetchInterval:30000});
 const [view,setView]=useState<'open'|'history'>('open');const [category,setCategory]=useState(params.get('category')||'activation');
 const [subject,setSubject]=useState('');const [message,setMessage]=useState('');const [activationId,setActivationId]=useState(params.get('activationId')||'');const [rechargeId,setRechargeId]=useState(params.get('rechargeId')||'');const [error,setError]=useState<string|null>(null);const [sent,setSent]=useState(false);
 const create=useMutation({mutationFn:()=>createSupportTicket({category,subject,message,activationId:activationId||undefined,rechargeId:rechargeId||undefined}),onSuccess:async()=>{setSent(true);setError(null);setSubject('');setMessage('');await q.refetch()},onError:e=>setError(e instanceof Error?e.message:'Could not submit support request')});
 const tickets=q.data?.tickets??[];const openTickets=tickets.filter(t=>t.status==='Open'||t.status==='In Progress');const historyTickets=tickets.filter(t=>!openTickets.includes(t));const visible=view==='open'?openTickets:historyTickets;
 const categories=[['activation','Activation'],['recharge','Recharge'],['wallet','Wallet'],['account','Account'],['other','Other']] as const;
 const linked=activationId||rechargeId;
 return <section className="page-section support-page">
  <div className="catalog-heading"><div><h1>Support</h1><p>Get help, keep references attached, and continue every conversation in one thread.</p></div><span className="catalog-chip">{tickets.length} {tickets.length===1?'ticket':'tickets'}</span></div>
  <div className="support-quick-grid">
   <Link to="/support?category=activation" className="support-quick-card"><span className="support-quick-icon"><Icon name="active" size={18}/></span><div><strong>Activation help</strong><small>Number, OTP or cancellation</small></div><Icon name="arrow" size={15}/></Link>
   <Link to="/support?category=recharge" className="support-quick-card"><span className="support-quick-icon"><Icon name="wallet" size={18}/></span><div><strong>Recharge help</strong><small>UTR, verification or wallet credit</small></div><Icon name="arrow" size={15}/></Link>
  </div>
  <div className="support-view-tabs" role="tablist" aria-label="Support ticket views"><button type="button" role="tab" aria-selected={view==='open'} className={view==='open'?'support-view-tab is-selected':'support-view-tab'} onClick={()=>setView('open')}>Open<span>{openTickets.length}</span></button><button type="button" role="tab" aria-selected={view==='history'} className={view==='history'?'support-view-tab is-selected':'support-view-tab'} onClick={()=>setView('history')}>History<span>{historyTickets.length}</span></button></div>
  <div className="support-layout">
   <div className="support-panel support-compose">
    <div className="section-heading"><div><h2>New request</h2><span className="section-subtle">Start with the issue type</span></div></div>
    <div className="support-category-grid" aria-label="Support category">{categories.map(([value,label])=><button key={value} type="button" className={category===value?'support-category-chip is-selected':'support-category-chip'} onClick={()=>setCategory(value)}>{label}</button>)}</div>
    {linked?<div className="support-linked-context">{activationId?<Link to={'/active/'+encodeURIComponent(activationId)}><Icon name="active" size={14}/> Linked activation <span>{activationId}</span></Link>:null}{rechargeId?<Link to="/wallet"><Icon name="wallet" size={14}/> Linked recharge <span>{rechargeId}</span></Link>:null}</div>:null}
    <form className="support-form" onSubmit={e=>{e.preventDefault();setSent(false);setError(null);void create.mutate()}}>
     <label className="field"><span>Subject</span><input value={subject} onChange={e=>setSubject(e.target.value)} minLength={4} maxLength={120} placeholder="What do you need help with?" required/></label>
     <label className="field"><span>Message</span><textarea value={message} onChange={e=>setMessage(e.target.value)} minLength={10} maxLength={2000} placeholder="Give us the details and we’ll keep the conversation here." required/></label>
     <details className="support-reference-details"><summary>Add reference</summary><div className="support-reference-fields"><label className="field"><span>Activation reference</span><input value={activationId} onChange={e=>setActivationId(e.target.value)} placeholder="Activation ID"/></label><label className="field"><span>Recharge reference</span><input value={rechargeId} onChange={e=>setRechargeId(e.target.value)} placeholder="Recharge ID"/></label></div></details>
     {error?<div className="form-error" role="alert">{error}</div>:null}{sent?<div className="success-card"><Icon name="check" size={18}/><span>Ticket created. Open it below to continue the thread.</span></div>:null}
     <button className="primary-button" disabled={create.isPending}>{create.isPending?'Sending...':'Open support ticket'}<Icon name="arrow" size={17}/></button>
    </form>
   </div>
   <div className="support-panel support-ticket-panel"><div className="section-heading"><div><h2>{view==='open'?'Open tickets':'Ticket history'}</h2><span className="section-subtle">{view==='open'?'Replies and active conversations first.':'Resolved and closed conversations.'}</span></div></div>
    {q.isError?<div className="error-card">Support could not be loaded. Reconnect and retry.</div>:null}
    {visible.length?<div className="ticket-list">{visible.map(t=>{const last=t.messages?.[t.messages.length-1];const hasAdminReply=last?.authorRole==='admin';return <Link key={t.id} to={'/support/'+encodeURIComponent(t.id)} className="ticket-row ticket-row-rich"><span className="ticket-status-icon"><Icon name={t.category==='activation'?'active':t.category==='recharge'||t.category==='wallet'?'wallet':'support'} size={17}/></span><div className="ticket-row-copy"><div className="ticket-row-title"><strong>{t.subject}</strong><span className={'support-status support-status-'+t.status.toLowerCase().replace(/\s+/g,'-')}>{t.status}</span></div><span>{hasAdminReply?'Support replied · ':''}{new Date(t.updatedAt).toLocaleString()}</span>{t.activation?<span>Activation · {t.activation.service||t.activation.id}</span>:null}{t.recharge?<span>Recharge · ₹{((t.recharge.amountPaise ?? 0)/100).toFixed(2)} · {t.recharge.status}</span>:null}</div><Icon name="arrow" size={17}/></Link>})}</div>:<div className="empty-state compact-empty"><div className="empty-icon"><Icon name="support" size={24}/></div><h3>{view==='open'?'No open tickets':'No ticket history'}</h3><p>{view==='open'?'Start a request and your conversation will appear here.':'Resolved and closed requests will remain available here.'}</p></div>}
   </div>
  </div>
 </section>
}
function SupportThreadPage(){
 const {ticketId}=useParams();const q=useQuery({queryKey:['support'],queryFn:getSupportTickets,refetchInterval:15000});const [message,setMessage]=useState('');const [error,setError]=useState<string|null>(null);const client=useQueryClient();
 const ticket=q.data?.tickets.find(t=>t.id===ticketId);
 const reply=useMutation({mutationFn:()=>replySupportTicket(ticketId ?? '',message),onSuccess:async()=>{setMessage('');setError(null);await client.invalidateQueries({queryKey:['support']})},onError:e=>setError(e instanceof Error?e.message:'Reply failed')});
 if(q.isPending)return <section className="page-section"><div className="page-loading">Loading ticket...</div></section>;
 if(!ticket)return <section className="page-section"><Link className="back-link" to="/support"><Icon name="back" size={18}/> Support</Link><div className="error-card">Ticket not found.</div></section>;
 const messages=ticket.messages?.length?ticket.messages:[{id:'initial',authorRole:'customer',body:ticket.message,createdAt:ticket.createdAt}];
 const canReply=ticket.status!=='Closed';
 return <section className="page-section support-thread-page"><Link className="back-link" to="/support"><Icon name="back" size={18}/> Support</Link>
  <div className="ticket-thread-hero"><div><span className="card-label">Support ticket</span><h1>{ticket.subject}</h1><div className="ticket-thread-meta"><span className={'support-status support-status-'+ticket.status.toLowerCase().replace(/\s+/g,'-')}>{ticket.status}</span><span>{ticket.category}</span><span>{messages.length} {messages.length===1?'message':'messages'}</span><span>Updated {new Date(ticket.updatedAt).toLocaleString()}</span></div></div></div>
  {ticket.activation||ticket.recharge?<div className="reference-strip">{ticket.activation?<Link to={'/active/'+encodeURIComponent(ticket.activation.id)}><Icon name="active" size={14}/> Activation · {ticket.activation.service||ticket.activation.id}</Link>:null}{ticket.recharge?<Link to="/wallet"><Icon name="wallet" size={14}/> Recharge · ₹{((ticket.recharge.amountPaise ?? 0)/100).toFixed(2)} · {ticket.recharge.status}</Link>:null}</div>:null}
  <div className="message-thread support-message-thread">{messages.map(m=><div className={'thread-message '+(m.authorRole==='admin'?'from-admin':'from-customer')} key={m.id}><div className="thread-message-head"><span>{m.authorRole==='admin'?'INBOX9 Support':'You'}</span><time>{new Date(m.createdAt).toLocaleString()}</time></div><p>{m.body}</p></div>)}</div>
  {canReply?<form className="reply-form support-reply-form" onSubmit={e=>{e.preventDefault();setError(null);if(message.trim().length<2){setError('Reply must be at least 2 characters.');return}void reply.mutate()}}><div className="reply-form-heading"><div><strong>Continue the conversation</strong><span>Keep the original ticket reference attached.</span></div></div><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a reply..." maxLength={4000} required/>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={reply.isPending}>{reply.isPending?'Sending...':'Send reply'}<Icon name="arrow" size={18}/></button></form>:<div className="info-card"><Icon name="check" size={19}/><div><strong>This ticket is closed.</strong><p>Create a new ticket for further help.</p></div></div>}
 </section>
}

function AuthLayout({title,subtitle,children,footer}:{title:string;subtitle:string;children:ReactNode;footer:ReactNode}){return <div className="auth-page"><div className="auth-card"><Link className="auth-brand" to="/apps"><span className="brand-mark">I9</span><strong>INBOX9</strong></Link><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}<div className="auth-footer">{footer}</div></div></div>}
function resolvePostLoginPath(next:string|null,role?:string){const candidate=String(next||'').trim();if(role==='admin'){return candidate==='/admin'||candidate.startsWith('/admin/')?candidate:'/admin';}if(!candidate.startsWith('/')||candidate.startsWith('//'))return '/apps';if(candidate==='/admin'||candidate.startsWith('/admin/'))return '/apps';return candidate;}
function LoginPage(){const navigate=useNavigate();const [params]=useSearchParams();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);async function submit(e:FormEvent){e.preventDefault();setPending(true);setError(null);try{const r=await login(email.trim(),password);setUser(r.user);setBootstrap('ready');navigate(resolvePostLoginPath(params.get('next'),r.user.role),{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Sign in failed')}finally{setPending(false)}}return <AuthLayout title="Welcome back" subtitle="Sign in to use INBOX9 services." footer={<>New here? <Link to="/register">Create account</Link> · <Link to="/recover">Recover password</Link></>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Signing in...':'Sign in'}</button></form></AuthLayout>}
function RegisterPage(){const navigate=useNavigate();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);async function submit(e:FormEvent){e.preventDefault();setError(null);if(password!==confirm){setError('Passwords do not match.');return}setPending(true);try{const r=await register(email.trim(),password);setUser(r.user);setBootstrap('ready');navigate('/apps',{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Registration failed')}finally{setPending(false)}}return <AuthLayout title="Create your account" subtitle="One account for all INBOX9 services." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={10} required/></label><label className="field"><span>Confirm password</span><input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={10} required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Creating account...':'Create account'}</button></form></AuthLayout>}
function RecoverPage(){
 const navigate=useNavigate();const setUser=useSessionStore(s=>s.setUser);const setBootstrap=useSessionStore(s=>s.setBootstrap);const [email,setEmail]=useState('');const [code,setCode]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState<string|null>(null);const [pending,setPending]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setError(null);if(password!==confirm){setError('Passwords do not match.');return}setPending(true);try{const r=await recoverPassword(email.trim(),code.trim(),password);setUser(r.user);setBootstrap('ready');navigate('/apps',{replace:true})}catch(reason){setError(reason instanceof Error?reason.message:'Password recovery failed')}finally{setPending(false)}}
 return <AuthLayout title="Recover password" subtitle="Use a recovery code generated from your signed-in account." footer={<Link to="/login">Back to sign in</Link>}><form className="form-stack" onSubmit={submit}><label className="field"><span>Email</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/></label><label className="field"><span>Recovery code</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="REC-..." required/></label><label className="field"><span>New password</span><input value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={8} maxLength={128} required/></label><label className="field"><span>Confirm password</span><input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={8} maxLength={128} required/></label>{error?<div className="form-error" role="alert">{error}</div>:null}<button className="primary-button" disabled={pending}>{pending?'Resetting...':'Reset password'}</button></form></AuthLayout>
}
const router=createBrowserRouter([{path:'/login',Component:LoginPage},{path:'/register',Component:RegisterPage},{path:'/recover',Component:RecoverPage},{path:'/',Component:AppShell,errorElement:<RouteErrorScreen/>,children:[{index:true,element:<Navigate to="/apps" replace/>},{path:'apps',Component:AppsPage},{path:'apps/service/:serviceId',Component:ServicePage},{path:'buy',Component:BuyPage},{path:'active',Component:ActivePage},{path:'active/:activationId',Component:ActivationPage},{path:'wallet',Component:WalletPage},{path:'notifications',Component:NotificationsPage},{path:'support',Component:SupportPage},{path:'account',Component:AccountPage},{path:'support/:ticketId',Component:SupportThreadPage}]},{path:'/admin',Component:AdminAccessGate,errorElement:<RouteErrorScreen/>,children:[{index:true,Component:AdminDashboardPage},{path:'users',children:[{index:true,Component:AdminUsersPage},{path:':userId',Component:AdminUsersPage}]},{path:'services',Component:AdminServicesPage},{path:'activations',Component:AdminActivationsPage},{path:'payments',Component:AdminPaymentsPage}]}]);
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
export function App(){return <AppErrorBoundary><QueryClientProvider client={queryClient}><SessionBootstrap/><RouterProvider router={router}/></QueryClientProvider></AppErrorBoundary>}