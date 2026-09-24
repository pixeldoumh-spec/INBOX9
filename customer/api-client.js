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
  const method = String(options.method || 'GET').toUpperCase();
  const retryable = method === 'GET';
  const attempts = retryable ? 3 : 1;
  let response;
  let lastNetworkError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(url, {
        ...options,
        // Keep authenticated same-origin requests explicitly cookie-aware.
        // The browser default is same-origin, but making it explicit protects
        // session bootstrap/login continuity across reloads and environments.
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
    throw new ApiError(payload.error || `Request failed (${response.status})`, {
      status: response.status,
      code: payload.code || null,
      retryAfter: response.headers.get('Retry-After')
    });
  }

  return payload;
}
