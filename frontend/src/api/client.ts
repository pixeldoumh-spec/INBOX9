import type { ApiErrorPayload } from './types';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, payload: ApiErrorPayload | null) {
    super(payload?.error || 'Request failed');
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = payload?.code;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const raw = await response.text();
  let payload: unknown = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object' ? (payload as ApiErrorPayload) : null;
    throw new ApiRequestError(response.status, errorPayload);
  }

  return payload as T;
}
