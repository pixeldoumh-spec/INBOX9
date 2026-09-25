import { apiRequest } from './client';
import type { Notification } from './types';

export type { Notification };

export function getNotifications() {
  return apiRequest<{ notifications: Notification[]; persistent: boolean }>(
    '/api/notifications',
  );
}

export function markAllNotificationsRead() {
  return apiRequest<{ ok: true; updated: number }>(
    '/api/notifications/read-all',
    { method: 'POST' },
  );
}

export function markNotificationRead(id:string) {
 return apiRequest<{id:string;read:boolean}>('/api/notifications/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({read:true})});
}
