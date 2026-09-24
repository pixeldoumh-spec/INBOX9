export class ApiError extends Error {
  constructor(message, { status = 0, code = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function shouldSignalSessionExpiry(url, method) {
  const path = String(url || '').split('?')[0];
  if (method === 'GET' && path === '/api/auth/me') return false;
  return !['/api/auth/login', '/api/auth/register', '/api/auth/recover'].includes(path);
}

function signalSessionExpiry() {
  try { window.dispatchEvent(new CustomEvent('inbox9:session-expired')); } catch {}
}

export async function api(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const retryable = method === 'GET';
  const attempts = retryable ? 3 : 1;
  let response;
  let lastNetworkError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(url, {
        ...options,
        credentials: options.credentials ?? 'same-origin',
        headers: {
          accept: 'application/json',
          ...(options.headers || {})
        }
      });
      lastNetworkError = null;
      break;
    } catch (networkError) {
      lastNetworkError = networkError;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  if (!response) {
    throw new ApiError(lastNetworkError?.message || 'Network request failed', { status: 0, code: 'NETWORK_ERROR' });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { error: `HTTP ${response.status}` };
  }

  if (!response.ok) {
    if (response.status === 401 && shouldSignalSessionExpiry(url, method)) signalSessionExpiry();
    throw new ApiError(payload.error || `Request failed (${response.status})`, {
      status: response.status,
      code: payload.code || null,
      retryAfter: response.headers.get('Retry-After')
    });
  }

  return payload;
}
