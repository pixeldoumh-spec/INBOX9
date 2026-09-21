import { services as localServices } from './_lib/catalog.js';
import { listPersistedServices } from './_lib/service-repository.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const persisted = await listPersistedServices();
  res.status(200).json({ country: 'IN', currency: 'INR', services: persisted ?? localServices });
}
