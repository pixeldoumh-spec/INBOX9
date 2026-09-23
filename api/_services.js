import { services as localServices } from './_lib/catalog.js';
import { listPersistedServices } from './_lib/service-repository.js';
import { isProduction } from './_lib/runtime-config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const persisted = await listPersistedServices();
  if (!persisted && isProduction()) {
    return res.status(503).json({ error: 'Service catalog database is not configured' });
  }
  res.status(200).json({ country: 'IN', currency: 'INR', services: persisted ?? localServices });
}
