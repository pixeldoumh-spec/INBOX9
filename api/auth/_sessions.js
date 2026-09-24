import { applySecurityHeaders, requestId, rateLimitAsync } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { getSessionUser, getMockSession, requireUser, listUserSessionsForRequest } from '../_lib/auth.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'auth-sessions',60,60000)) return;
  const user=dbEnabled() ? await getSessionUser(req) : getMockSession(req);
  try { requireUser(user); } catch(e){ return res.status(e.statusCode||401).json({error:e.message}); }
  if(!dbEnabled()) return res.status(200).json({sessions:[],policy:{absoluteDays:7,maxSessionsPerUser:5}});
  try { return res.status(200).json({sessions:await listUserSessionsForRequest(req),policy:{absoluteDays:7,maxSessionsPerUser:5}}); }
  catch(error){ console.error('auth.sessions_failed',error); return res.status(503).json({error:'Session service unavailable'}); }
}