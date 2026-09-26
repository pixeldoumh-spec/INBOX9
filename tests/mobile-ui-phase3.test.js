import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const activity=fs.readFileSync(path.join(root,'frontend/src/app/customer-activity-pages.tsx'),'utf8');
const account=fs.readFileSync(path.join(root,'frontend/src/app/customer-account-pages.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('phase 3 mounts all five customer account surfaces as independent routes',()=>{
  for(const route of ['/wallet','/active','/notifications','/support','/account']){
    assert.match(app,new RegExp("path:'"+route.slice(1)+"'"));
  }
  assert.match(app,/path:'support\/[^']*'/);
  assert.match(app,/path:'active\/[^']*'/);
});

test('phase 3 wallet surface is server-backed and preserves manual recharge rules',()=>{
  assert.match(account,/function WalletPage\(\)/);
  assert.match(account,/queryKey:\['wallet'\],queryFn:getWallet/);
  assert.match(account,/createRecharge\(Number\(amount\),utr\.trim\(\)/);
  assert.match(account,/min="100"/);
  assert.match(account,/max="5000"/);
  assert.match(account,/className="payment-paid-button"/);
  assert.match(account,/manual verification protects the wallet/i);
  assert.match(account,/Wallet credit is applied only after verification/);
});

test('phase 3 Active surface tracks ongoing and historical activations and exposes cancellation/OTP states',()=>{
  assert.match(activity,/function ActivePage\(\)/);
  assert.match(activity,/queryKey:\['activations'\],queryFn:getActivations/);
  assert.match(activity,/className="active-tabs"/);
  assert.match(activity,/No ongoing activations/);
  assert.match(activity,/function ActivationPage\(\)/);
  assert.match(activity,/refetchInterval:query=>.*2_000/);
  assert.match(activity,/className=\{`otp-card/);
  assert.match(activity,/cancelActivation\(activationId!/);
  assert.match(activity,/Cancel & refund/);
});

test('phase 3 Notifications surface persists read state and deep-links related records',()=>{
  assert.match(account,/function NotificationsPage\(\)/);
  assert.match(account,/queryKey:\['notifications'\],queryFn:getNotifications/);
  assert.match(account,/markAllNotificationsRead/);
  assert.match(account,/markNotificationRead/);
  assert.match(account,/n\.kind==='activation'.*sourceId/);
  assert.match(account,/n\.page==='wallet'/);
  assert.match(account,/n\.page==='support'/);
  assert.match(account,/aria-label="Notification filter"/);
});

test('phase 3 Support surface provides categorized tickets, references, threads and replies',()=>{
  assert.match(account,/function SupportPage\(\)/);
  assert.match(account,/getSupportTickets/);
  assert.match(account,/createSupportTicket/);
  assert.match(account,/activationId/);
  assert.match(account,/rechargeId/);
  assert.match(account,/function SupportThreadPage\(\)/);
  assert.match(account,/replySupportTicket\(/);
  assert.match(account,/className="message-thread support-message-thread"/);
  assert.match(account,/Continue the conversation/);
});

test('phase 3 Account surface provides profile, password, recovery, sessions and global sign-out',()=>{
  assert.match(account,/function AccountPage\(\)/);
  assert.match(account,/updateProfile\(name\)/);
  assert.match(account,/changePassword\(currentPassword,newPassword\)/);
  assert.match(account,/issueRecoveryCode/);
  assert.match(account,/getSessions/);
  assert.match(account,/revokeSession\(id\)/);
  assert.match(account,/logoutAll/);
  assert.match(account,/Sign out everywhere/);
  assert.match(account,/Open recovery screen/);
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
