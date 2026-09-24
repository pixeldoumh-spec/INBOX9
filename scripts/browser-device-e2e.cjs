const assert = require('node:assert/strict');
const { chromium, firefox, webkit, devices } = require('playwright');

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const ARTIFACT_DIR = process.env.E2E_ARTIFACT_DIR || 'artifacts/browser-e2e';
const PASSWORD = 'BrowserE2E!123';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visible(page, selector, timeout = 10000) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function heading(page, name, timeout = 10000) {
  const locator = page.getByRole('heading', { name, exact: true }).first();
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

async function register(page, email) {
  const switchButton = page.getByRole('button', { name: 'Create account', exact: true }).first();
  if (await switchButton.isVisible().catch(() => false) && !await page.locator('#auth-form input[name="confirm"]').count()) {
    await switchButton.click();
  }
  await visible(page, '#auth-form input[name="email"]');
  await page.locator('#auth-form input[name="email"]').fill(email);
  await page.locator('#auth-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-form input[name="confirm"]').fill(PASSWORD);
  await page.locator('#auth-form button.auth-submit').click();
  await visible(page, '#marketplace-services', 12000);
  await heading(page, 'Choose a service', 12000);
}

async function login(page, email) {
  await heading(page, 'Welcome back', 10000);
  await page.locator('#auth-form input[name="email"]').fill(email);
  await page.locator('#auth-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-form button.auth-submit').click();
  await heading(page, 'Choose a service', 12000);
}

async function logout(page) {
  await page.locator('[data-action="logout"]').click();
  await heading(page, 'Welcome back', 10000);
}

async function createMockRecharge(page, amount, utr) {
  const result = await page.evaluate(async ({ amount, utr }) => {
    const response = await fetch('/api/recharges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ amount, utr })
    });
    return { status: response.status, body: await response.text() };
  }, { amount, utr });
  assert.equal(result.status, 201, 'test fixture recharge should be accepted');
  return JSON.parse(result.body);
}

async function assertAccessibleButtons(page) {
  const unnamed = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => {
    const name = button.getAttribute('aria-label') || button.textContent || button.getAttribute('title') || '';
    return !String(name).trim();
  }).map((button) => button.outerHTML.slice(0, 250)));
  assert.deepEqual(unnamed, [], 'every visible button should have an accessible name');
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(metrics.scrollWidth <= metrics.viewport + 1, 'page should not overflow horizontally');
}

function attachErrorCapture(page) {
  const errors = [];
  const expectedConsoleText = new Set();
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = String(message.text() || message);
    if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(text)) return;
    errors.push(text);
  });
  page.on('response', (response) => {
    if (response.status() === 401 && /\/api\/auth\/me(?:\?|$)/.test(response.url())) return;
  });
  return errors;
}

async function runFullChromium() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let offlineExpected = false;
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error' || offlineExpected) return;
    const text = String(message.text() || message);
    if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(text)) return;
    errors.push(text);
  });
  const customerEmail = 'browser-e2e-' + Date.now() + '@example.test';
  const adminEmail = 'admin-browser-e2e@example.test';
  const utr = 'BROWSER-E2E-' + Date.now();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await heading(page, 'Welcome back');
    assert.equal(await page.title(), 'INBOX9 — OTP Marketplace');

    await register(page, customerEmail);
    // Session continuity must survive a real browser reload after authentication.
    await page.reload({ waitUntil: 'networkidle' });
    await heading(page, 'Choose a service', 12000);
    await assertAccessibleButtons(page);
    await assertNoHorizontalOverflow(page);
    assert.ok(await page.locator('[data-buy-service]:visible').count() > 0, 'marketplace should render service actions');

    await page.locator('#service-search').fill('whatsapp');
    await sleep(500);
    assert.match(page.url(), /[?&]search=whatsapp(?:&|$)/i, 'marketplace search should sync to the URL');
    await page.locator('#service-search').fill('');
    await sleep(350);

    await createMockRecharge(page, 5000, utr);
    await logout(page);

    await register(page, adminEmail);
    await page.locator('[data-page="admin"]').click();
    await heading(page, 'Admin control center');
    await page.locator('[data-admin-tab="recharges"]').click();
    await visible(page, '[data-admin-approve]');
    const rechargeRow = page.locator('tr').filter({ hasText: utr }).first();
    await rechargeRow.waitFor({ state: 'visible', timeout: 8000 });
    await rechargeRow.locator('[data-admin-approve]').click();
    await sleep(300);
    assert.ok(await page.getByText('No pending recharge requests.', { exact: true }).isVisible().catch(() => false), 'approved recharge should leave the pending queue');
    await logout(page);

    await login(page, customerEmail);
    // Reproduce the reported failure path: authenticated customer reloads the app.
    await page.reload({ waitUntil: 'networkidle' });
    await heading(page, 'Choose a service', 12000);
    await page.locator('[data-page="wallet"]').first().click();
    await heading(page, 'Wallet');
    await page.getByText('Wallet recharge', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    const rechargeTransaction = page.locator('[data-wallet-detail]').filter({ hasText: 'Wallet recharge' }).first();
    await rechargeTransaction.waitFor({ state: 'visible', timeout: 10000 });
    await rechargeTransaction.click();
    await rechargeTransaction.waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('[data-wallet-detail][aria-expanded="true"]').first().waitFor({ state: 'visible', timeout: 5000 });
    const transactionDetail = page.locator('.wallet-transaction-detail').filter({ hasText: 'UTR' }).first();
    await transactionDetail.waitFor({ state: 'visible', timeout: 5000 });
    await transactionDetail.getByText(utr, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('[data-page="buy"]').first().click();
    await heading(page, 'Choose a service');
    const firstBuy = page.locator('[data-buy-service]:visible').first();
    await firstBuy.click();
    await page.getByRole('heading', { name: 'Review your number', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Get number/ }).click();
    await heading(page, 'Active numbers', 12000);

    const cancelButton = page.locator('[data-cancel]:visible').first();
    await cancelButton.waitFor({ state: 'visible', timeout: 5000 });
    await cancelButton.click();
    await page.locator('[data-cancel-confirm]:visible').first().click();
    await page.getByText('Refunded', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });

    await page.locator('[data-page="buy"]').first().click();
    await heading(page, 'Choose a service');
    await page.locator('[data-buy-service]:visible').first().click();
    await page.getByRole('heading', { name: 'Review your number', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Get number/ }).click();
    await heading(page, 'Active numbers', 12000);

    await page.getByText('Ready to use', { exact: true }).waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForFunction(() => {
      const text = document.querySelector('.received-code-value strong')?.textContent || '';
      return text.replace(/\D/g, '').length === 6;
    }, null, { timeout: 5000 });
    assert.equal((await page.locator('.received-code-value strong').first().textContent()).replace(/\D/g, '').length, 6, 'completed activation should display a six-digit OTP');

    await page.locator('[data-page="orders"]').first().click();
    await heading(page, 'Orders');
    await visible(page, '.order-card');
    assert.ok((await page.locator('.order-card').count()) >= 1, 'orders should contain the completed activation');

    await page.locator('[aria-label="Notifications"]').click();
    await page.getByText('All caught up', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('[data-page="support"]').first().click();
    await heading(page, 'Help & Support');
    const subject = 'Browser E2E support ticket';
    await page.locator('#support-form input[name="subject"]').fill(subject);
    await page.locator('#support-form textarea[name="message"]').fill('Browser end-to-end support flow verification.');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('#support-form input[name="subject"]').inputValue(), subject, 'Support subject must survive background refresh');
    assert.equal(await page.locator('#support-form textarea[name="message"]').inputValue(), 'Browser end-to-end support flow verification.', 'Support message must survive background refresh');
    await page.locator('#support-form button[type="submit"]').click();
    await page.getByRole('heading', { name: 'Support threads', exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    const ticket = page.locator('.support-ticket-head').filter({ hasText: subject }).first();
    await ticket.click();
    await page.getByText('Browser end-to-end support flow verification.', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });

    await page.locator('[data-page="account"]').first().click();
    await heading(page, 'Account');
    await visible(page, '#profile-form input[name="displayName"]');
    await visible(page, '[data-generate-recovery]');

    await page.evaluate(() => {
      const securityButton = document.querySelector('[data-action="security"]');
      if (!securityButton) throw new Error('Account security control not found');
      securityButton.click();
    });
    await visible(page, '[role="dialog"]');
    await page.evaluate(() => {
      const close = document.querySelector('[data-action="close-security"]');
      if (!close) throw new Error('Security close control not found');
      close.click();
    });

    offlineExpected = true;
    await context.setOffline(true);
    await page.getByText('You are offline. Live updates are paused.', { exact: true }).waitFor({ state: 'visible', timeout: 4000 });
    offlineExpected = false;
    await context.setOffline(false);
    await page.getByText('Connection restored', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });

    await assertAccessibleButtons(page);
    await assertNoHorizontalOverflow(page);
    assert.deepEqual(errors, [], 'browser run should finish without page errors or console errors');

    return { name: 'Chromium desktop full customer flow', ok: true };
  } finally {
    await page.screenshot({ path: ARTIFACT_DIR + '/chromium-desktop-final.png', fullPage: true }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runCompatibility(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const email = name.toLowerCase().replace(/[^a-z]+/g, '-') + '-' + Date.now() + '@example.test';
  let errors;

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await register(page, email);
    errors = attachErrorCapture(page);
    for (const target of ['active', 'orders', 'wallet', 'support', 'account']) {
      await page.evaluate((next) => { window.location.hash = '#' + next; }, target);
      const labels = { active: 'Active numbers', orders: 'Orders', wallet: 'Wallet', support: 'Help & Support', account: 'Account' };
      const pageRoot = {
        active: '.active-list, .active-empty',
        orders: '.orders-table, .order-summary-strip',
        wallet: '.wallet-summary-grid',
        support: '.support-page',
        account: '.account-page'
      }[target];
      await page.locator(pageRoot).first().waitFor({ state: 'visible', timeout: 12000 });
      await heading(page, labels[target]);
    }
    await page.locator('[data-page="buy"]').first().click();
    await heading(page, 'Choose a service');
    await assertAccessibleButtons(page);
    await assertNoHorizontalOverflow(page);
    assert.deepEqual(errors, [], name + ' should finish without page errors or console errors');
    return { name, ok: true };
  } finally {
    await page.screenshot({ path: ARTIFACT_DIR + '/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-final.png', fullPage: true }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runMobileChromium() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 15'] });
  const page = await context.newPage();
  const email = 'mobile-e2e-' + Date.now() + '@example.test';
  let errors;

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await register(page, email);
    errors = attachErrorCapture(page);
    await page.locator('button[aria-label="Open menu"]').click();
    await visible(page, '.sidebar.open');
    await page.locator('.sidebar [data-page="wallet"]').click();
    await heading(page, 'Wallet');
    await page.locator('button[aria-label="Open menu"]').click();
    await visible(page, '.sidebar.open');
    const mobileSupportNav = page.locator('.sidebar [data-page="support"]').first();
    await mobileSupportNav.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await mobileSupportNav.click();
    await heading(page, 'Help & Support');
    await page.locator('button[aria-label="Open menu"]').click();
    await assertNoHorizontalOverflow(page);
    await assertAccessibleButtons(page);
    assert.deepEqual(errors, [], 'mobile Chromium should finish without page errors or console errors');
    return { name: 'Chromium iPhone 15 emulation', ok: true };
  } finally {
    await page.screenshot({ path: ARTIFACT_DIR + '/chromium-iphone15-final.png', fullPage: true }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

(async () => {
  const results = [];
  const run = async (fn) => {
    try {
      results.push(await fn());
    } catch (error) {
      results.push({ name: fn.name, ok: false, error: error.stack || String(error) });
    }
  };

  await run(runFullChromium);
  await run(() => runMobileChromium());
  await run(() => runCompatibility(firefox, 'Firefox desktop compatibility'));
  await run(() => runCompatibility(webkit, 'WebKit desktop compatibility'));

  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, base: BASE_URL, results }, null, 2));
  if (failed.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
