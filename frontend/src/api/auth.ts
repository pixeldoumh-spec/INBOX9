import { apiRequest } from './client';
import type { MeResponse, User } from './types';

export function getMe() {
  return apiRequest<MeResponse>('/api/auth/me');
}

export function login(email: string, password: string) {
  return apiRequest<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string) {
  return apiRequest<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiRequest<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  });
}
