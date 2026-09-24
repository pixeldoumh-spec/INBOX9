import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, requireUser } from '../_lib/auth.js';
import { markNotificationRead } from '../_lib/notification-repository.js';

export default async function handler(req,res) {
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='PATCH') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'notifications-write',60,60000)) return;
  if(!enforceSameOrigin(req,res)) return;
  const user=await getSessionUser(req);
  try { requireUser(user); } catch(e) { return res.status(e.statusCode||401).json({error:e.message}); }
  if(!dbEnabled()) return res.status(503).json({error:'Notifications require PostgreSQL'});
  try {
    const result=await markNotificationRead(user.id,req.query?.id,req.body?.read!==false);
    if(!result) return res.status(404).json({error:'Notification not found'});
    return res.status(200).json(result);
  } catch(error){ return res.status(503).json({error:'Notification update unavailable'}); }
}