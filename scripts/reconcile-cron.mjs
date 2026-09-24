const url = process.env.RECONCILE_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error('RECONCILE_URL and CRON_SECRET are required');
  process.exit(1);
}
const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, accept: 'application/json' },
});
const text = await response.text();
if (!response.ok) {
  console.error(`Reconcile request failed: HTTP ${response.status}`);
  console.error(text.slice(0, 1000));
  process.exit(1);
}
console.log(text);
