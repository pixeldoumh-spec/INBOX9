import {
  validateVirtualSmsPreflightPurchaseBlock,
  virtualSmsProvider,
} from '../api/_lib/virtualsms-provider.js';

// Defense in depth: this process can never invoke the provider purchase endpoint.
process.env.VIRTUALSMS_PREFLIGHT_ONLY = 'true';

function parseJsonObject(raw, name) {
  const value = String(raw || '').trim();
  if (!value) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(name + ' is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(name + ' must be a JSON object');
  }
  return parsed;
}

function parseJsonArray(raw, name) {
  const value = String(raw || '').trim();
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(name + ' is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error(name + ' must be a JSON array');
  return parsed.map((item) => String(item).trim()).filter(Boolean);
}

function providerServiceCode(service) {
  return String(
    service?.service ??
    service?.service_code ??
    service?.serviceCode ??
    service?.code ??
    service?.id ??
    service?.service_id ??
    service?.serviceId ??
    service?.slug ??
    ''
  ).trim();
}

function providerServiceName(service) {
  return String(service?.name ?? service?.title ?? '').trim();
}

function fail(message, code=1) {
  console.error(message);
  process.exit(code);
}

async function main() {
  validateVirtualSmsPreflightPurchaseBlock(process.env.VIRTUALSMS_PREFLIGHT_ONLY);

  const apiKeyConfigured = Boolean(String(process.env.VIRTUALSMS_API_KEY || '').trim());
  if (!apiKeyConfigured) fail('FAIL: VIRTUALSMS_API_KEY is missing. No provider request was attempted.', 10);

  const health = await virtualSmsProvider.health();
  console.log(JSON.stringify({
    stage: 'authenticated-health',
    provider: health.provider,
    healthy: health.healthy,
    indiaListed: health.indiaListed,
    balanceUsd: health.balanceUsd,
    purchaseEnabled: health.purchaseEnabled,
    checkedAt: health.checkedAt,
  }, null, 2));

  if (!health.healthy) fail('FAIL: authenticated provider health check failed. No purchase was attempted.', 11);
  if (!health.indiaListed) fail('FAIL: authenticated account did not report India (+91). No purchase was attempted.', 12);

  let catalog;
  try {
    catalog = await virtualSmsProvider.listServices();
  } catch (error) {
    fail('FAIL: provider services endpoint could not be verified: ' + (error.code || error.message), 13);
  }

  const services = Array.isArray(catalog.services) ? catalog.services : [];
  if (services.length === 0) fail('FAIL: provider returned an empty service catalog. No purchase was attempted.', 14);

  const mode = String(process.env.VIRTUALSMS_PREFLIGHT_MODE || 'inventory').trim().toLowerCase();
  if (!['inventory','canary-ready'].includes(mode)) {
    fail('FAIL: VIRTUALSMS_PREFLIGHT_MODE must be inventory or canary-ready.', 15);
  }

  const map = parseJsonObject(process.env.VIRTUALSMS_SERVICE_MAP_JSON, 'VIRTUALSMS_SERVICE_MAP_JSON');
  const allowlist = parseJsonArray(process.env.VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON, 'VIRTUALSMS_ALLOWED_SERVICE_IDS_JSON');
  const requestedServiceId = String(process.env.VIRTUALSMS_PREFLIGHT_SERVICE_ID || '').trim();

  const providerCodes = new Set(services.map(providerServiceCode).filter(Boolean));
  const providerNames = new Set(services.map(providerServiceName).filter(Boolean).map((name) => name.toLowerCase()));

  const readiness = {
    mode,
    providerServices: services.length,
    providerServiceCodes: providerCodes.size,
    allowlistedServices: allowlist.length,
    mappedServices: Object.keys(map).length,
    requestedServiceId: requestedServiceId || null,
    purchaseEndpointCalled: false,
  };

  if (mode === 'canary-ready') {
    const authorized = String(process.env.VIRTUALSMS_RESELLER_AUTHORIZED || '').trim().toLowerCase() === 'true';
    const canaryEnabled = String(process.env.VIRTUALSMS_CANARY_ENABLED || '').trim().toLowerCase() === 'true';

    if (!authorized) fail('FAIL: written resale authorization flag is not enabled. No purchase was attempted.', 16);
    if (!canaryEnabled) fail('FAIL: canary mode is not enabled. No purchase was attempted.', 17);
    if (allowlist.length === 0) fail('FAIL: canary-ready mode requires at least one allowlisted INBOX9 service ID. No purchase was attempted.', 18);
    if (Object.keys(map).length === 0) fail('FAIL: canary-ready mode requires explicit VIRTUALSMS_SERVICE_MAP_JSON. No purchase was attempted.', 19);

    for (const serviceId of allowlist) {
      const mappedCode = String(map[serviceId] || '').trim();
      if (!mappedCode) fail('FAIL: no provider service mapping exists for allowlisted INBOX9 service ' + serviceId + '. No purchase was attempted.', 20);
      const exactCodeMatch = providerCodes.has(mappedCode);
      const caseInsensitiveNameMatch = providerNames.has(mappedCode.toLowerCase());
      if (!exactCodeMatch && !caseInsensitiveNameMatch) {
        fail('FAIL: mapped provider service "' + mappedCode + '" was not found in the authenticated provider service catalog for INBOX9 service ' + serviceId + '. No purchase was attempted.', 21);
      }
    }
  }

  if (requestedServiceId) {
    const mappedCode = String(map[requestedServiceId] || '').trim();
    if (!mappedCode) fail('FAIL: requested INBOX9 service ' + requestedServiceId + ' has no explicit provider mapping. No purchase was attempted.', 22);
    if (!allowlist.includes(requestedServiceId)) fail('FAIL: requested INBOX9 service ' + requestedServiceId + ' is not in the canary allowlist. No purchase was attempted.', 23);
    if (!providerCodes.has(mappedCode) && !providerNames.has(mappedCode.toLowerCase())) {
      fail('FAIL: requested mapping "' + mappedCode + '" is absent from the provider service catalog. No purchase was attempted.', 24);
    }
    readiness.requestedProviderService = mappedCode;
  }

  console.log(JSON.stringify({
    stage: 'service-readiness',
    ...readiness,
    result: mode === 'canary-ready' ? 'CANARY-READY (purchase still blocked in this workflow)' : 'INVENTORY-VERIFIED (purchase still blocked in this workflow)',
  }, null, 2));

  console.log('PASS: provider credentials, authenticated account access, India visibility and requested service configuration were verified without purchasing a number.');
}

main().catch((error) => {
  console.error('FAIL: preflight crashed safely before any purchase operation:', error.message);
  process.exit(30);
});
