const DEFAULT_BASE_URL = 'https://otp-api.shelex.dev/api';
const TIMEOUT_MS = 8000;

export function shelexBaseUrl() {
  return String(process.env.SHELEX_TEST_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export async function shelexGetJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${shelexBaseUrl()}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) throw new Error(`Shelex diagnostic API returned HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function listShelexCountries() {
  return shelexGetJson('/countries');
}

export async function listShelexIndiaNumbers() {
  return shelexGetJson('/list/India');
}
