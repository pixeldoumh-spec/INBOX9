import { apiRequest } from './client';

export type HealthStatus='healthy'|'degraded'|'critical';
export type AdminSystemHealth={
  overall:'Healthy'|'Degraded'|'Critical';
  generatedAt:number;
  deployment:{commit:string;environment:string;region:string};
  checks:{
    database:{status:HealthStatus;reachable:boolean;latencyMs:number;name:string};
    runtime:{status:HealthStatus;mode:string;uptimeSeconds:number};
    productionConfiguration:{status:HealthStatus;database:boolean;appOrigin:boolean;cronAuth:boolean;persistentRuntime:boolean;syntheticRuntime:boolean};
    providers:{status:HealthStatus;total:number;failures:number;items:Array<{id:string;name:string;adapterKey:string;healthy:boolean;latencyMs?:number;error?:string;message?:string}>};
    providerOperations:{status:HealthStatus;pending:number;failed:number;oldestPendingAt:number|null};
    walletReconciliation:{status:HealthStatus;latestStatus:string;walletsChecked:number;mismatches:number;openIssues:number};
    serviceRouting:{status:HealthStatus;totalServices:number;activeServices:number;activeServicesWithoutUsableRoute:number};
    support:{status:HealthStatus;open:number;inProgress:number};
    notifications:{status:HealthStatus;unread:number};
  };
  observability:{uptimeSeconds:number;counters:{requests:number;apiRequests:number;errors:number;http4xx:number;http5xx:number;slowRequests:number;clientErrors:number};statuses:Record<string,number>;topRoutes:Array<{path:string;count:number}>;slowRequestThresholdMs:number;sentryConfigured:boolean};
};
export function getAdminSystemHealth(){return apiRequest<AdminSystemHealth>('/api/admin/system-health');}
