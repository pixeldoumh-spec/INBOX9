import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminSystemHealth, type HealthStatus } from '../../api/admin-system-health';

function when(value:number|null|undefined){return value?new Date(value).toLocaleString():'—';}
function duration(seconds:number){const s=Math.max(0,Number(seconds||0));const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);return h?String(h)+'h '+String(m)+'m':String(m)+'m';}
function pillClass(status:HealthStatus|string){return 'admin-provider-pill '+(status==='healthy'?'is-on':'');}
const labels:Record<string,string>={database:'Database',runtime:'Runtime',productionConfiguration:'Configuration',providers:'Providers',providerOperations:'Provider operations',walletReconciliation:'Wallet reconciliation',serviceRouting:'Service routing',support:'Support queue',notifications:'Notifications'};
function detail(key:string,check:any){
 if(key==='database')return (check.reachable?'Reachable':'Unreachable')+' · '+check.latencyMs+'ms';
 if(key==='runtime')return check.mode+' · uptime '+duration(check.uptimeSeconds);
 if(key==='productionConfiguration')return 'Postgres '+(check.persistentRuntime?'enabled':'off')+' · app origin '+(check.appOrigin?'set':'missing')+' · cron auth '+(check.cronAuth?'set':'missing');
 if(key==='providers')return check.total+' active provider(s) · '+check.failures+' failed health check(s)';
 if(key==='providerOperations')return check.pending+' pending · '+check.failed+' failed';
 if(key==='walletReconciliation')return check.latestStatus+' · '+check.walletsChecked+' wallets checked · '+check.mismatches+' mismatches · '+check.openIssues+' open issues';
 if(key==='serviceRouting')return check.activeServices+' active / '+check.totalServices+' total · '+check.activeServicesWithoutUsableRoute+' active without usable route';
 if(key==='support')return check.open+' open · '+check.inProgress+' in progress';
 return check.unread+' unread';
}

export function AdminSystemHealthPage(){
 const q=useQuery({queryKey:['admin-system-health'],queryFn:getAdminSystemHealth,staleTime:5000,refetchInterval:15000,refetchOnReconnect:true});
 const d=q.data;
 const statusCounts=useMemo(()=>{if(!d)return {critical:0,degraded:0,healthy:0};return Object.values(d.checks).reduce((a:any,c:any)=>{a[c.status]++;return a;},{critical:0,degraded:0,healthy:0});},[d]);
 return <section className='admin-page'>
  <div className='admin-page-heading'><div><span className='admin-eyebrow'>OPERATIONS</span><h1>System health</h1><p>Live readiness, dependencies, routing integrity and runtime telemetry for the isolated admin control room.</p></div><button className='outline-button' type='button' onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Refreshing…':'Refresh'}</button></div>
  {q.isPending?<div className='admin-overview-grid'>{Array.from({length:4},(_,i)=><div className='admin-metric admin-metric-skeleton' key={i}/>)}</div>:null}
  {q.isError?<div className='admin-alert' role='alert'><strong>System health unavailable.</strong><span>The health aggregation endpoint could not complete.</span><button className='outline-button' type='button' onClick={()=>void q.refetch()}>Retry</button></div>:null}
  {d?<><div className='admin-overview-grid'><div className='admin-metric'><span>Overall</span><strong>{d.overall}</strong><small>Current aggregated state</small></div><div className='admin-metric'><span>Healthy checks</span><strong>{statusCounts.healthy}</strong><small>Passing signals</small></div><div className='admin-metric'><span>Attention</span><strong>{statusCounts.degraded}</strong><small>Degraded signals</small></div><div className='admin-metric'><span>Critical</span><strong>{statusCounts.critical}</strong><small>Immediate investigation</small></div></div>
  <section className='admin-panel'><div className='admin-panel-heading'><div><span className='admin-eyebrow'>CHECKS</span><h2>Dependency & control status</h2></div><span className={pillClass(d.overall.toLowerCase())}>{d.overall}</span></div><div className='admin-mini-list'>{Object.entries(d.checks).map(([key,check])=><div key={key}><div><strong>{labels[key]||key}</strong><span className={pillClass((check as any).status)}>{(check as any).status}</span></div><small>{detail(key,check)}</small></div>)}</div></section>
  <div className='admin-dashboard-grid'><section className='admin-panel'><div className='admin-panel-heading'><div><span className='admin-eyebrow'>RUNTIME TELEMETRY</span><h2>Process signals</h2></div></div><div className='admin-boundary-grid'><span>Uptime</span><strong>{duration(d.observability.uptimeSeconds)}</strong><span>Requests</span><strong>{d.observability.counters.requests.toLocaleString('en-IN')}</strong><span>HTTP 4xx</span><strong>{d.observability.counters.http4xx}</strong><span>HTTP 5xx</span><strong>{d.observability.counters.http5xx}</strong><span>Application errors</span><strong>{d.observability.counters.errors}</strong><span>Browser errors</span><strong>{d.observability.counters.clientErrors}</strong><span>Slow requests</span><strong>{d.observability.counters.slowRequests}</strong><span>Sentry</span><strong>{d.observability.sentryConfigured?'Configured':'Not configured'}</strong></div></section>
   <section className='admin-panel'><div className='admin-panel-heading'><div><span className='admin-eyebrow'>RELEASE</span><h2>Runtime identity</h2></div></div><div className='admin-boundary-grid'><span>Commit</span><strong className='admin-service-id'>{d.deployment.commit}</strong><span>Environment</span><strong>{d.deployment.environment}</strong><span>Region</span><strong>{d.deployment.region}</strong><span>Generated</span><strong>{when(d.generatedAt)}</strong></div></section></div>
  <section className='admin-panel'><div className='admin-panel-heading'><div><span className='admin-eyebrow'>TRAFFIC</span><h2>Top routes</h2></div><span className='admin-status-badge'>{d.observability.topRoutes.length}</span></div>{d.observability.topRoutes.length?<div className='admin-mini-list'>{d.observability.topRoutes.map(route=><div key={route.path}><div><strong>{route.path}</strong><span>{route.count.toLocaleString('en-IN')} requests</span></div></div>)}</div>:<div className='empty-state compact-empty'><h3>No requests recorded yet</h3></div>}</section></>:null}
 </section>;
}