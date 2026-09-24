import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../_lib/security.js';
import { getSessionUser, requireUser, issueRecoveryCode } from '../_lib/auth.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'auth-recovery-code',3,3600000) || !enforceSameOrigin(req,res)) return;
  const user=await getSessionUser(req);
  try { requireUser(user); } catch(e){ return res.status(e.statusCode||401).json({error:e.message}); }
  try { return res.status(201).json(await issueRecoveryCode(req)); }
  catch(error){ return res.status(error.statusCode||503).json({error:error.message||'Recovery code unavailable'}); }
}