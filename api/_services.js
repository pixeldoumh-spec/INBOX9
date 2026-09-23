import { applySecurityHeaders, requestId, rateLimitAsync } from './_lib/security.js';
import { services as localServices } from './_lib/catalog.js';
import { listPersistedServices } from './_lib/service-repository.js';
import { getNumberOtpIndiaInventory, matchNumberOtpService } from './_lib/numberotp-public.js';
import { isProduction, isSyntheticProduction } from './_lib/runtime-config.js';

function attachNumberOtpAvailability(services, inventory) {
  return services.map((service) => {
    const match = inventory ? matchNumberOtpService(inventory, service) : null;
    return {
      ...service,
      liveAvailability: match ? {
        numberotp: {
          provider: 'numberotp',
          code: match.code,
          available: match.available,
          costUsd: match.costUsd,
          fetchedAt: inventory.fetchedAt,
          source: 'public',
        },
      } : {},
    };
  });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  requestId(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimitAsync(req, res, 'services-list', 120, 60_000)) return;

  const persisted = await listPersistedServices();
  if (!persisted && isProduction() && !isSyntheticProduction()) {
    return res.status(503).json({ error: 'Service catalog database is not configured' });
  }

  const sourceServices = persisted ?? localServices;
  let numberOtp = null;
  let numberOtpError = null;
  try {
    numberOtp = await getNumberOtpIndiaInventory();
  } catch (error) {
    numberOtpError = 'NumberOTP availability unavailable';
    console.error('numberotp.catalog_attach_failed', error);
  }

  const services = attachNumberOtpAvailability(sourceServices, numberOtp);
  res.status(200).json({
    country: 'IN',
    currency: 'INR',
    services,
    liveProviders: {
      numberotp: numberOtp
        ? {
            provider: 'numberotp',
            healthy: true,
            country: 'IN',
            countryId: numberOtp.countryId,
            availableServices: numberOtp.services.length,
            fetchedAt: numberOtp.fetchedAt,
            mode: 'availability-only',
          }
        : {
            provider: 'numberotp',
            healthy: false,
            country: 'IN',
            error: numberOtpError || 'NumberOTP availability unavailable',
            fetchedAt: null,
            mode: 'availability-only',
          },
    },
  });
}
