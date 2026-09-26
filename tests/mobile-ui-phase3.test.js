import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('phase 3 mounts all five customer account surfaces as independent routes',()=>{
  for(const route of ['/wallet','/active','/notifications','/support','/account']){
    assert.match(app,new RegExp("path:'"+route.slice(1)+"'"));
  }
  assert.match(app,/path:'support\/[^']*'/);
  assert.match(app,/path:'active\/[^']*'/);
});

test('phase 3 wallet surface is server-backed and preserves manual recharge rules',()=>{
  assert.match(app,/function WalletPage\(\)/);
  assert.match(app,/queryKey:\['wallet'\],queryFn:getWallet/);
  assert.match(app,/createRecharge\(Number\(amount\),utr\.trim\(\)/);
  assert.match(app,/min="100"/);
  assert.match(app,/max="5000"/);
  assert.match(app,/className="payment-paid-button"/);
  assert.match(app,/manual verification protects the wallet/i);
  assert.match(app,/Wallet credit is applied only after verification/);
});

test('phase 3 Active surface tracks ongoing and historical activations and exposes cancellation/OTP states',()=>{
  assert.match(app,/function ActivePage\(\)/);
  assert.match(app,/queryKey:\['activations'\],queryFn:getActivations/);
  assert.match(app,/className="active-tabs"/);
  assert.match(app,/No ongoing activations/);
  assert.match(app,/function ActivationPage\(\)/);
  assert.match(app,/refetchInterval:query=>.*2_000/);
  assert.match(app,/className=\{`otp-card/);
  assert.match(app,/cancelActivation\(activationId!/);
  assert.match(app,/Cancel & refund/);
});

test('phase 3 Notifications surface persists read state and deep-links related records',()=>{
  assert.match(app,/function NotificationsPage\(\)/);
  assert.match(app,/queryKey:\['notifications'\],queryFn:getNotifications/);
  assert.match(app,/markAllNotificationsRead/);
  assert.match(app,/markNotificationRead/);
  assert.match(app,/n\.kind==='activation'.*sourceId/);
  assert.match(app,/n\.page==='wallet'/);
  assert.match(app,/n\.page==='support'/);
  assert.match(app,/aria-label="Notification filter"/);
});

test('phase 3 Support surface provides categorized tickets, references, threads and replies',()=>{
  assert.match(app,/function SupportPage\(\)/);
  assert.match(app,/getSupportTickets/);
  assert.match(app,/createSupportTicket/);
  assert.match(app,/activationId/);
  assert.match(app,/rechargeId/);
  assert.match(app,/function SupportThreadPage\(\)/);
  assert.match(app,/replySupportTicket\(/);
  assert.match(app,/className="message-thread support-message-thread"/);
  assert.match(app,/Continue the conversation/);
});

test('phase 3 Account surface provides profile, password, recovery, sessions and global sign-out',()=>{
  assert.match(app,/function AccountPage\(\)/);
  assert.match(app,/updateProfile\(name\)/);
  assert.match(app,/changePassword\(currentPassword,newPassword\)/);
  assert.match(app,/issueRecoveryCode/);
  assert.match(app,/getSessions/);
  assert.match(app,/revokeSession\(id\)/);
  assert.match(app,/logoutAll/);
  assert.match(app,/Sign out everywhere/);
  assert.match(app,/Open recovery screen/);
});

test('phase 3 Radium surface styling keeps the five account areas customer-scoped',()=>{
  const required=[
    '.app-shell .wallet-payment-destination',
    '.app-shell .wallet-amount-panel',
    '.app-shell .wallet-qr-panel',
    '.app-shell .notification-summary > div',
    '.app-shell .notification-filter-tabs',
    '.app-shell .session-row',
    '.app-shell .buy-empty-workspace',
    '.app-shell .thread-message',
    '.app-shell .support-quick-card',
    '.app-shell .account-panel'
  ];
  for(const selector of required) assert.ok(css.includes(selector),selector);
  assert.doesNotMatch(css,/^[.]admin-[A-Za-z0-9_-]+/m);
});
