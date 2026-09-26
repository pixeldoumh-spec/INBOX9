import { apiRequest } from './client';

export type AdminOverview={users:number;activeActivations:number;rechargeRequests:number;pendingRechargePaise:number;walletBalancePaise:number;approvedRechargePaise:number;totalDebitsPaise:number;persistent:boolean};
export type AdminUser={id:string;email:string;role:string;active:boolean;displayName:string;createdAt:number;updatedAt?:number;lastActivityAt:number|null;balancePaise:number;rechargeCount:number;activationCount:number};
export type AdminUsersResponse={users:AdminUser[];summary:{total:number;active:number;disabled:number;admins:number};pagination:{limit:number;offset:number;hasMore:boolean}};
export type AdminUserDetailResponse={user:AdminUser;summary:{supportCount:number;activeSessions:number};sessions:Array<{id:string;createdAt:number;lastUsedAt:number|null;expiresAt:number;revokedAt:number|null;active:boolean}>;recharges:Array<{id:string;amountPaise:number;utr:string;paymentMethod:string;status:string;submittedAt:number;reviewedAt:number|null;rejectionReason:string|null;externalReference:string|null}>;activations:Array<{id:string;serviceId:string;service:string|null;status:string;pricePaise:number;number:string|null;otp:string|null;createdAt:number;expiresAt:number;updatedAt:number}>;support:Array<{id:string;category:string;subject:string;status:string;createdAt:number;updatedAt:number}>};
export function getAdminOverview(){return apiRequest<AdminOverview>('/api/admin/overview');}
export function getAdminUsers(params:{q?:string;role?:string;status?:string;limit?:number;offset?:number}={}){const p=new URLSearchParams();if(params.q)p.set('q',params.q);if(params.role&&params.role!=='all')p.set('role',params.role);if(params.status&&params.status!=='all')p.set('status',params.status);if(params.limit)p.set('limit',String(params.limit));if(params.offset)p.set('offset',String(params.offset));return apiRequest<AdminUsersResponse>('/api/admin/users'+(p.toString()?'?'+p.toString():''));}
export function getAdminUser(id:string){return apiRequest<AdminUserDetailResponse>('/api/admin/users/'+encodeURIComponent(id));}
export function updateAdminUser(id:string,action:'enable'|'disable'|'logout_all'){return apiRequest<{active?:boolean;changed?:boolean;revokedSessions?:number}>('/api/admin/users/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({action})});}

export type AdminServiceRoute={serviceId?:string;providerId:string;providerName:string;adapterKey:string;providerActive:boolean;providerPriority:number;priority:number;active:boolean};
export type AdminService={id:string;name:string;category:string;country:string;currency:string;pricePaise:number;availability:'high'|'medium'|'low';stock:number;active:boolean;routedProviders:number;catalogPosition:number|null;createdAt:number;updatedAt:number;routes:AdminServiceRoute[]};
export type AdminServicesResponse={services:AdminService[];summary:{total:number;active:number;inactive:number};pagination:{limit:number;offset:number;hasMore:boolean}};
export type AdminProvider={id:string;name:string;adapterKey:string;active:boolean;priority:number;routedServices:number};
export type AdminProviderHealth={id:string;name:string;adapterKey:string;healthy:boolean;latencyMs?:number;error?:string;message?:string};
export type AdminProvidersResponse={providers:AdminProvider[];health:AdminProviderHealth[];installedAdapters:string[];gateway:{version:number;timeoutsMs:Record<string,number>;metrics:string;safeReserveRetry:string}};
export function getAdminServices(params:{q?:string;status?:'all'|'active'|'inactive';limit?:number;offset?:number}={}){
  const p=new URLSearchParams();
  if(params.q)p.set('q',params.q);
  if(params.status&&params.status!=='active')p.set('status',params.status);
  if(params.limit)p.set('limit',String(params.limit));
  if(params.offset)p.set('offset',String(params.offset));
  return apiRequest<AdminServicesResponse>('/api/admin/services'+(p.toString()?'?'+p.toString():''));
}
export function updateAdminService(id:string,patch:{pricePaise?:number;stock?:number;active?:boolean;availability?:'high'|'medium'|'low';routes?:Array<{providerId:string;priority:number;active:boolean}>}){
  return apiRequest<{service:AdminService}>('/api/admin/services/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(patch)});
}
export function getAdminProviders(){return apiRequest<AdminProvidersResponse>('/api/admin/providers');}
export type ProviderQualificationProvider={id:string;name:string;adapterKey:string;active:boolean;priority:number;status:string;configured:boolean;catalogCount:number;verifiedMappings:number;candidateMappings:number;staleMappings:number;error?:string|null};
export type ProviderQualificationService={id:string;name:string;country:string;currency:string;pricePaise:number;providers:Record<string,{status:string;mapping:string|null;candidate:string|null;candidateName?:string|null;error?:string}>};
export type ProviderQualificationResponse={generatedAt:number;activeServiceCount:number;providers:ProviderQualificationProvider[];services:ProviderQualificationService[];rules:{externalMappingsMustMatchLiveProviderCode:boolean;externalRoutesRemainInactiveUntilQualified:boolean;publicSharedSourcesExcluded:boolean}};
export function getProviderQualification(){return apiRequest<ProviderQualificationResponse>('/api/admin/provider-qualification');}
export function verifyAdminProviderMapping(input:{providerId:string;serviceId:string;providerServiceCode:string}){return apiRequest<{providerId:string;serviceId:string;providerServiceCode:string;providerServiceName:string;verified:boolean}>('/api/admin/provider-qualification',{method:'POST',body:JSON.stringify({action:'verify-mapping',...input})});}

export type AdminActivation={
  id:string; serviceId:string; service?:string; country:string; number?:string|null; pricePaise:number; currency:string; status:string;
  otp?:string|null; createdAt?:number; expiresAt?:number; refundPaise?:number;
  userId?:string; email?:string|null; displayName?:string;
  providerId?:string|null; providerActivationId?:string|null; providerName?:string|null; adapterKey?:string|null;
  pendingOperations?:number; failedOperations?:number;
  latestOperation?:{type:string;status:string;error?:string|null;updatedAt?:number|null}|null;
};
export type AdminActivationsResponse={
  activations:AdminActivation[];
  summary:{total:number;active:number;cancellationPending:number;expirationPending:number;completed:number;expired:number;refunded:number;cancelled:number};
  pagination:{limit:number;offset:number;hasMore:boolean};
};
export type AdminActivationDetailResponse={
  activation:AdminActivation;
  operations:Array<{id:string;type:string;status:string;providerId?:string|null;providerActivationId?:string|null;attempts:number;error?:string|null;createdAt:number;updatedAt:number;completedAt?:number|null}>;
};
export function getAdminActivations(params:{q?:string;status?:string;limit?:number;offset?:number}={}){
  const p=new URLSearchParams();
  if(params.q)p.set('q',params.q);
  if(params.status&&params.status!=='all')p.set('status',params.status);
  if(params.limit)p.set('limit',String(params.limit));
  if(params.offset)p.set('offset',String(params.offset));
  return apiRequest<AdminActivationsResponse>('/api/admin/activations'+(p.toString()?'?'+p.toString():''));
}
export function getAdminActivation(id:string){
  return apiRequest<AdminActivationDetailResponse>('/api/admin/activations/'+encodeURIComponent(id));
}
export function cancelAdminActivation(id:string){
  return apiRequest<{activation:{id:string;status:string;refundPaise?:number}|null}>('/api/admin/activations/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({action:'cancel'})});
}
