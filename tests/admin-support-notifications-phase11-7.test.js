import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function read(path) {
  return fs.readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('phase 11.7 admin support is filtered, threaded, assigned, audited and isolated', async () => {
  const [route, byId, repo, ui, shell, app] = await Promise.all([
    read('api/admin/support/_index.js'),
    read('api/admin/support/_id.js'),
    read('api/_lib/support-repository.js'),
    read('frontend/src/features/admin/AdminSupport.tsx'),
    read('frontend/src/features/admin/AdminShell.tsx'),
    read('frontend/src/app/App.tsx')
  ]);
  assert.match(route, /requireAdmin/);
  assert.match(route, /listAdminSupportTickets/);
  assert.match(repo, /assigned_admin_id/);
  assert.match(repo, /support\.ticket_updated/);
  assert.match(repo, /support_messages/);
  assert.match(repo, /ILIKE/);
  assert.match(repo, /s\.status=\$3/);
  assert.match(byId, /requireAdmin/);
  assert.match(byId, /enforceSameOrigin/);
  assert.match(byId, /validateBodySize/);
  assert.match(ui, /getAdminUsers/);
  assert.match(ui, /updateAdminSupport/);
  assert.match(shell, /Support/);
  assert.match(app, /AdminSupportPage/);
  assert.match(app, /path:'support'/);
});

test('phase 11.7 admin notifications are authenticated, targeted, audited and customer-only', async () => {
  const [route, repo, ui, client, server] = await Promise.all([
    read('api/admin/_notifications.js'),
    read('api/_lib/notification-repository.js'),
    read('frontend/src/features/admin/AdminNotifications.tsx'),
    read('frontend/src/api/admin-notifications.ts'),
    read('server.js')
  ]);
  assert.match(route, /requireAdmin/);
  assert.match(route, /enforceSameOrigin/);
  assert.match(route, /createAdminNotification/);
  assert.match(repo, /notification\.targeted_created/);
  assert.match(repo, /role!==['"]user['"]/);
  assert.match(repo, /INSERT INTO notifications/);
  assert.match(ui, /Create targeted notification/);
  assert.match(client, /POST/);
  assert.match(server, /adminNotifications/);
  assert.match(server, /GET \/api\/admin\/notifications/);
  assert.match(server, /POST \/api\/admin\/notifications/);
});
