import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { dbEnabled } from '../_lib/db.js';
import { recoverPassword, setSessionCookie } from '../_lib/auth.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'auth-recover',5,3600000) || !enforceSameOrigin(req,res)) return;
  try { validateBodySize(req,5000); } catch(e){ return res.status(413).json({error:e.message}); }
  if(!dbEnabled()) return res.status(503).json({error:'Password recovery requires PostgreSQL'});
  try {
    const result=await recoverPassword(req.body?.email,req.body?.recoveryCode,req.body?.password);
    setSessionCookie(res,result.token);
    return res.status(200).json({ok:true,user:result.user,sessionsInvalidated:true});
  } catch(error){ return res.status(error.statusCode||503).json({error:error.message||'Password recovery unavailable'}); }
}