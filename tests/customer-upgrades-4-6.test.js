import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('Customer UI upgrades 4-6 are wired end-to-end', async () => {
  const files = await Promise.all([
    'app.js','customer/state.js','customer/customer-data.js','customer/navigation.js','customer/api-client.js',
    'api/_lib/support-repository.js','api/_lib/notification-repository.js','api/_lib/auth.js','server.js'
  ].map((path) => fs.readFile(new URL('../'+path, import.meta.url), 'utf8')));
  const [app,state,data,client,support,notifications,auth,server]=files;
  assert.match(app,/function accountPage\(\)/);
  assert.match(app,/walletActivityItems/);
  assert.match(app,/data-wallet-detail/);
  assert.match(app,/data-support-reply/);
  assert.match(app,/handleConnectivityChange/);
  assert.match(app,/data-generate-recovery/);
  assert.match(app,/data-revoke-session/);
  assert.match(state,/walletFilter/);
  assert.match(state,/expandedSupportTicketId/);
  assert.match(data,/\/api\/notifications/);
  assert.match(client,/const attempts = retryable \? 3 : 1/);
  assert.match(support,/support_messages/);
  assert.match(support,/replySupportTicket/);
  assert.match(notifications,/syncUserNotifications/);
  assert.match(auth,/recoverPassword/);
  assert.match(auth,/listUserSessionsForRequest/);
  assert.match(server,/\/api\/notifications/);
  assert.match(server,/\/api\/auth\/sessions/);
});

test('account security helpers expose stable password/session policy', async () => {
  const auth = await import('../api/_lib/auth.js');
  assert.deepEqual(auth.sessionPolicy(), { absoluteDays: 7, maxSessionsPerUser: 5 });
  assert.equal(auth.validatePasswordPair('', 'StrongPass123!'), 'Current password is required');
  assert.equal(auth.validatePasswordPair('StrongPass123!', 'StrongPass123!'), 'New password must be different from your current password');
});
