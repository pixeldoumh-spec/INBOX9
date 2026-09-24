import crypto from 'node:crypto';

const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const OIDC_JWKS_URL = OIDC_ISSUER + '/.well-known/jwks';
const OIDC_AUDIENCE = 'inbox9';
const TRUSTED_REPOSITORY = 'pixeldoumh-spec/INBOX9';
const TRUSTED_REPOSITORY_ID = '1379257300';
const TRUSTED_REF = 'refs/heads/main';
const TRUSTED_WORKFLOWS = new Set([
  'INBOX9 scheduled reconciliation',
  'INBOX9 Proxnum inventory sync',
]);
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

let jwksCache = null;
let jwksExpiresAt = 0;

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, 'base64');
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid GitHub OIDC token');
  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new Error('Invalid GitHub OIDC token');
  }
  if (!header || !payload || typeof header !== 'object' || typeof payload !== 'object') {
    throw new Error('Invalid GitHub OIDC token');
  }
  return {
    encodedHeader: parts[0],
    encodedPayload: parts[1],
    signature: parts[2],
    header,
    payload,
  };
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache && now < jwksExpiresAt) return jwksCache;
  const response = await fetch(OIDC_JWKS_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('GitHub OIDC key service unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload?.keys) || !payload.keys.length) throw new Error('GitHub OIDC keys unavailable');
  jwksCache = payload;
  jwksExpiresAt = now + JWKS_CACHE_TTL_MS;
  return payload;
}

function claimEquals(actual, expected) {
  return String(actual || '') === expected;
}

export function isTrustedGithubOidcClaims(claims) {
  if (!claims || typeof claims !== 'object') return false;
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp);
  const nbf = claims.nbf == null ? null : Number(claims.nbf);
  if (!Number.isFinite(exp) || exp <= now) return false;
  if (nbf != null && (!Number.isFinite(nbf) || nbf > now + 30)) return false;
  if (!claimEquals(claims.iss, OIDC_ISSUER)) return false;
  if (!claimEquals(claims.aud, OIDC_AUDIENCE)) return false;
  if (!claimEquals(claims.repository, TRUSTED_REPOSITORY)) return false;
  if (!claimEquals(claims.repository_id, TRUSTED_REPOSITORY_ID)) return false;
  if (!claimEquals(claims.ref, TRUSTED_REF)) return false;
  if (!TRUSTED_WORKFLOWS.has(String(claims.workflow || ''))) return false;
  if (!['schedule', 'workflow_dispatch'].includes(String(claims.event_name || ''))) return false;
  if (claims.repository_visibility && claims.repository_visibility !== 'public') return false;
  return true;
}

export async function verifyGithubOidcToken(token) {
  const jwt = parseJwt(token);
  if (jwt.header.alg !== 'RS256' || !jwt.header.kid) throw new Error('Unsupported GitHub OIDC token');

  const keys = await getJwks();
  const jwk = keys.keys.find(item => item.kid === jwt.header.kid && item.kty === 'RSA' && item.use === 'sig' && item.alg === 'RS256');
  if (!jwk) throw new Error('GitHub OIDC signing key unavailable');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(jwt.encodedHeader + '.' + jwt.encodedPayload),
    publicKey,
    base64UrlDecode(jwt.signature)
  );
  if (!verified || !isTrustedGithubOidcClaims(jwt.payload)) throw new Error('Invalid GitHub OIDC credentials');
  return jwt.payload;
}

export const githubOidcConfig = {
  issuer: OIDC_ISSUER,
  audience: OIDC_AUDIENCE,
  repository: TRUSTED_REPOSITORY,
  repositoryId: TRUSTED_REPOSITORY_ID,
  ref: TRUSTED_REF,
  workflow: 'INBOX9 scheduled reconciliation',
  workflows: [...TRUSTED_WORKFLOWS],
};
