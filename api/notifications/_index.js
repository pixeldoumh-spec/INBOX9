import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser } from '../_lib/auth.js';
import { listNotifications, markAllNotificationsRead } from '../_lib/notification-repository.js';

export default async function handler(req,res) {
  applySecurityHeaders(res); requestId(req,res);
  const user=dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch(e) { return res.status(e.statusCode||401).json({error:e.message}); }
  if(req.method==='GET'){
    if(!await rateLimitAsync(req,res,'notifications-read',120,60000,user.id)) return;
    if(!dbEnabled()) return res.status(200).json({notifications:[],persistent:false});
    try { return res.status(200).json({notifications:await listNotifications(user.id),persistent:true}); }
    catch(error){ console.error('notifications.read_failed',error); return res.status(503).json({error:'Notification service unavailable'}); }
  }
  if(req.method==='POST'){
    if(!await rateLimitAsync(req,res,'notifications-write',30,60000,user.id) || !enforceSameOrigin(req,res)) return;
    if(!dbEnabled()) return res.status(200).json({ok:true,updated:0});
    try { return res.status(200).json({ok:true,updated:await markAllNotificationsRead(user.id)}); }
    catch(error){ return res.status(503).json({error:'Notification update unavailable'}); }
  }
  return res.status(405).json({error:'Method not allowed'});
}