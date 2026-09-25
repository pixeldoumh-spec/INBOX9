import { apiRequest } from './client';

export type Notification = {
  id: string;
  title: string;
  body: string;
  read?: boolean;
  page?: string | null;
  createdAt?: number;
};

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
