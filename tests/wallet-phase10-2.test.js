import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { normalizeCustomerPaidAt } from '../api/_lib/wallet-repository.js';

const root=process.cwd();
const wallet=fs.readFileSync(path.join(root,'frontend/src/app/customer-account-pages.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');

test('phase 10.2 wallet refreshes after reconnect and browser focus',()=>{
  assert.match(wallet,/queryKey:\['wallet'\],queryFn:getWallet,refetchInterval:10000,refetchOnReconnect:true,refetchOnWindowFocus:true/);
  assert.match(wallet,/window\.addEventListener\('online',on\)/);
  assert.match(wallet,/void q\.refetch\(\)/);
  assert.match(wallet,/setOnline\(typeof navigator==='undefined'\|\|navigator\.onLine\)/);
});

test('phase 10.2 keeps an interrupted recharge draft on the device and clears it after reset',()=>{
  assert.match(wallet,/const draftKey='inbox9:wallet-recharge-draft'/);
  assert.match(wallet,/sessionStorage\.getItem\(draftKey\)/);
  assert.match(wallet,/sessionStorage\.setItem\(draftKey,JSON\.stringify/);
  assert.match(wallet,/sessionStorage\.removeItem\(draftKey\)/);
});

test('phase 10.2 never claims UPI payment time when only opening the UPI app',()=>{
  assert.match(wallet,/function openPaymentConfirm\(\)/);
  assert.match(wallet,/function markPaymentCompleted\(\)\{openPaymentConfirm\(\);if\(!customerPaidAt\)setCustomerPaidAt\(localDateTimeNow\(\)\)\}/);
  assert.match(wallet,/function openUpi\(\)\{if\(!upiIntent\|\|!online\)return;openPaymentConfirm\(\);window\.location\.href=upiIntent\}/);
  assert.doesNotMatch(wallet,/function openUpi\(\).*startPayment\(\)/s);
});

test('phase 10.2 pauses recharge submission while offline and exposes the reason',()=>{
  assert.match(wallet,/if\(!online\)\{setError\("Reconnect before submitting the recharge\."\);return\}/);
  assert.match(wallet,/disabled=\{recharge\.isPending\|\|!online\}/);
  assert.match(wallet,/className="wallet-resilience-banner"/);
  assert.match(css,/\.app-shell \.wallet-resilience-banner/);
});

test('phase 10.2 payment-time validation remains bounded and server-side',()=>{
  assert.equal(normalizeCustomerPaidAt(null),null);
  assert.throws(()=>normalizeCustomerPaidAt('not-a-date'),/Enter a valid payment date and time/);
  assert.throws(()=>normalizeCustomerPaidAt(new Date(Date.now()+6*60*1000).toISOString()),/Payment time cannot be in the future/);
  assert.throws(()=>normalizeCustomerPaidAt(new Date(Date.now()-31*24*60*60*1000).toISOString()),/Payment time must be within the last 30 days/);
});

test('phase 10.2 keeps the server credit gate after manual approval',()=>{
  const repo=fs.readFileSync(path.join(root,'api/_lib/wallet-repository.js'),'utf8');
  assert.match(repo,/if\(decision === ['"]approve['"] && \(normalized\.amountPaise == null \|\| normalized\.utr == null\)\)/);
  assert.match(repo,/await client\.query\('SELECT \* FROM wallets WHERE user_id=\$1 FOR UPDATE'/);
  assert.match(repo,/INSERT INTO wallet_ledger/);
  assert.match(repo,/status='Approved'/);
});
