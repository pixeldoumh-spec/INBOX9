import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const app=fs.readFileSync(path.join(root,'frontend/src/app/App.tsx'),'utf8');
const shared=fs.readFileSync(path.join(root,'frontend/src/app/customer-ui-shared.tsx'),'utf8');
const customerCss=fs.readFileSync(path.join(root,'frontend/src/styles/customer-modern.css'),'utf8');
const globalsCss=fs.readFileSync(path.join(root,'frontend/src/styles/globals.css'),'utf8');
const catalog=fs.readFileSync(path.join(root,'api/_lib/catalog.js'),'utf8');
const services=JSON.parse(fs.readFileSync(path.join(root,'data/services.json'),'utf8'));

test('phase 2 launcher fetches the authoritative service catalog and keeps live name/category search',()=>{
  assert.match(app,/useQuery\(\{queryKey:\['services'\],queryFn:getServices/);
  assert.match(app,/const matchesSearch=!needle||`\$\{item.name\} \$\{item.category\}`.toLowerCase().includes(needle)/);
  assert.match(app,/className="search-field"/);
  assert.match(app,/placeholder="Search services..."/);
});

test('phase 2 launcher renders the fixed four-column mobile grid without changing the 90-service catalog',()=>{
  assert.equal(services.length,90);
  assert.match(catalog,/export const serviceCatalogSize = services.length/);
  assert.match(globalsCss,/\.service-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,minmax\(0,1fr\)/);
  assert.match(app,/className="service-grid"/);
  assert.match(app,/list\.map\(item=><Link className="service-tile"/);
});

test('phase 2 launcher keeps service identity stable and routes by service ID',()=>{
  assert.match(app,/key={item\.id} to={\`\/buy\?serviceId=\$\{encodeURIComponent\(item\.id\)\}\`}/);
  assert.match(shared,/data-service-id={serviceId}/);
  assert.match(app,/const logo=SERVICE_LOGO_MANIFEST\[serviceId\]/);
  assert.match(app,/serviceLogoCropCache/);
});

test('phase 2 launcher preserves app-like navigation and unread notification access',()=>{
  assert.match(app,/function BottomNav\(\)/);
  assert.match(app,/\['\/apps','Apps','apps'\]/);
  assert.match(app,/\['\/buy','Buy','buy'\]/);
  assert.match(app,/\['\/active','Active','active'\]/);
  assert.match(app,/\['\/account','Account','account'\]/);
  assert.match(app,/function TopHeader\(\)/);
  assert.match(app,/const unread=notes\.data\?\.notifications\.filter\(n=>!n\.read\)\.length\?\?0/);
  assert.match(app,/className="wallet-pill"/);
  assert.match(app,/className="notification-button"/);
});

test('phase 2 launcher uses readable Radium Night typography for service names and filters',()=>{
  assert.match(customerCss,/\.app-shell \.catalog-apps \.service-name\s*\{/);
  assert.match(customerCss,/\.app-shell \.catalog-apps \.service-name[\s\S]*?color:\s*var\(--i9-text-muted\)/);
  assert.match(customerCss,/\.app-shell \.catalog-apps \.recent-tile span[\s\S]*?color:\s*var\(--i9-text-muted\)/);
  assert.doesNotMatch(customerCss,/\.admin-[A-Za-z0-9_-]+/);
});
