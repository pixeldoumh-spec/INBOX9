import test from 'node:test';
import assert from 'node:assert/strict';
import { githubOidcConfig, isTrustedGithubOidcClaims } from '../api/_lib/github-oidc.js';

function claims(overrides = {}) {
  return {
    iss: githubOidcConfig.issuer,
    aud: githubOidcConfig.audience,
    repository: githubOidcConfig.repository,
    repository_id: githubOidcConfig.repositoryId,
    ref: githubOidcConfig.ref,
    workflow: githubOidcConfig.workflow,
    workflow_ref: githubOidcConfig.repository + '/.github/workflows/reconcile.yml@' + githubOidcConfig.ref,
    event_name: 'schedule',
    repository_visibility: 'public',
    iat: Math.floor(Date.now() / 1000) - 30,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}

test('GitHub OIDC trust policy accepts only the approved INBOX9 scheduled workflows on main', () => {
  assert.equal(isTrustedGithubOidcClaims(claims()), true);
});

test('GitHub OIDC trust policy rejects wrong repository, id, ref, workflow, audience and event', () => {
  for (const [key, value] of [
    ['repository', 'attacker/repo'],
    ['repository_id', '1'],
    ['ref', 'refs/heads/dev'],
    ['workflow', 'other workflow'],
    ['aud', 'other-audience'],
    ['event_name', 'push'],
    ['workflow', 'untrusted workflow'],
  ]) {
    assert.equal(isTrustedGithubOidcClaims(claims({ [key]: value })), false, key);
  }
});

test('GitHub OIDC trust policy rejects expired and not-yet-valid credentials', () => {
  assert.equal(isTrustedGithubOidcClaims(claims({ exp: Math.floor(Date.now() / 1000) - 1 })), false);
  assert.equal(isTrustedGithubOidcClaims(claims({ nbf: Math.floor(Date.now() / 1000) + 60 })), false);
});

test('OIDC config exposes only the scheduled reconciliation workflow', () => {
  assert.equal(githubOidcConfig.workflow, 'INBOX9 scheduled reconciliation');
  assert.deepEqual(githubOidcConfig.workflows, ['INBOX9 scheduled reconciliation']);
});

test('reconciliation implementation contains both shared-secret fallback and scoped OIDC authentication', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../api/_internal-provider-reconcile.js', import.meta.url), 'utf8');
  assert.match(src, /CRON_SECRET/);
  assert.match(src, /verifyGithubOidcToken/);
  assert.match(src, /GITHUB_OIDC_RECONCILIATION/);
});
