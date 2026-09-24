export class ApiError extends Error {
  constructor(message, { status = 0, code = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (networkError) {
    throw new ApiError(networkError?.message || 'Network request failed', { status: 0, code: 'NETWORK_ERROR' });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { error: `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw new ApiError(payload.error || `Request failed (${response.status})`, {
      status: response.status,
      code: payload.code || null,
      retryAfter: response.headers.get('Retry-After')
    });
  }

  return payload;
}
