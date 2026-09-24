import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../../_lib/security.js';
import { getSessionUser, requireUser, revokeUserSession } from '../../_lib/auth.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='DELETE') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'auth-session-revoke',30,60000) || !enforceSameOrigin(req,res)) return;
  try { validateBodySize(req,2000); } catch(e){ return res.status(413).json({error:e.message}); }
  const user=await getSessionUser(req);
  try { requireUser(user); } catch(e){ return res.status(e.statusCode||401).json({error:e.message}); }
  try { const result=await revokeUserSession(req,req.query?.id,res); return res.status(200).json({ok:true,...result}); }
  catch(error){ return res.status(error.statusCode||503).json({error:error.message||'Session update unavailable'}); }
}