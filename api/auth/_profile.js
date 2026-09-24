import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../_lib/security.js';
import { getSessionUser, requireUser, updateProfile } from '../_lib/auth.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'auth-profile',20,60000) || !enforceSameOrigin(req,res)) return;
  try { validateBodySize(req,4000); } catch(e){ return res.status(413).json({error:e.message}); }
  const user=await getSessionUser(req);
  try { requireUser(user); } catch(e){ return res.status(e.statusCode||401).json({error:e.message}); }
  try { return res.status(200).json({user:await updateProfile(req,req.body?.displayName)}); }
  catch(error){ return res.status(error.statusCode||503).json({error:error.message||'Profile update unavailable'}); }
}