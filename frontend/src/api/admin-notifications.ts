import { apiRequest } from './client';

export type AdminNotification={id:string;userId:string;email:string;kind:string;title:string;body:string;page?:string|null;tone:string;read:boolean;createdAt:number};
export type AdminNotificationsResponse={notifications:AdminNotification[];summary:{total:number;unread:number;read:number};pagination:{limit:number;offset:number;hasMore:boolean}};
export function getAdminNotifications(params:{q?:string;kind?:string;read?:'all'|'read'|'unread';limit?:number;offset?:number}={}) {
 const p=new URLSearchParams();
 if(params.q)p.set('q',params.q);
 if(params.kind)p.set('kind',params.kind);
 if(params.read&&params.read!=='all')p.set('read',params.read);
 if(params.limit)p.set('limit',String(params.limit));
 if(params.offset)p.set('offset',String(params.offset));
 return apiRequest<AdminNotificationsResponse>('/api/admin/notifications'+(p.toString()?'?'+p.toString():''));
}
export function createAdminNotification(input:{userId:string;kind:string;title:string;body:string;page?:string;tone?:string}) {
 return apiRequest<{notification:AdminNotification}>('/api/admin/notifications',{method:'POST',body:JSON.stringify(input)});
}
