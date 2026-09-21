import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { listAdminUsers } from '../../_lib/admin-repository.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!dbEnabled()) return res.status(503).json({ error: 'Admin users require PostgreSQL' });
  const user = await getSessionUser(req);
  try { requireAdmin(user); } catch (e) { return res.status(e.statusCode || 401).json({ error: e.message }); }
  try { return res.status(200).json({ users: await listAdminUsers(req.query?.limit) }); }
  catch (error) { console.error('admin.users_failed', error); return res.status(503).json({ error: 'Users unavailable' }); }
}
