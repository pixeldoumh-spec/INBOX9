import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

test('phase 11.1 keeps admin routing outside the customer shell', async()=>{
  const source=await fs.readFile(new URL('../frontend/src/app/App.tsx',import.meta.url),'utf8');
  assert.match(source,/AdminAccessGate/);
  assert.match(source,/AdminDashboardPage/);
  assert.match(source,/path:'\/admin',Component:AdminAccessGate/);
  assert.match(source,/path:'payments',Component:AdminPaymentsPage/);
  assert.doesNotMatch(source,/path:'admin\/payments',Component:AdminPaymentsPage/);
  assert.match(source,/function resolvePostLoginPath\(next:string\|null,role\?:string\)/);
  assert.match(source,/if\(role==='admin'\)/);
  assert.match(source,/candidate==='\/admin'\|\|candidate\.startsWith\('\/admin\/'\)\?candidate:'\/admin'/);
  assert.match(source,/if\(candidate==='\/admin'\|\|candidate\.startsWith\('\/admin\/'\)\)return '\/apps'/);
});

test('phase 11.1 admin guard is role-bound and customer UI is not mounted in admin shell', async()=>{
  const shell=await fs.readFile(new URL('../frontend/src/features/admin/AdminShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/if\(user\.role!=='admin'\)return <AdminDenied\/>/);
  assert.match(shell,/className="admin-shell"/);
  assert.match(shell,/No Buy, service marketplace, wallet or OTP workspace is mounted in this console/);
  assert.match(shell,/logout\(\)/);
});
