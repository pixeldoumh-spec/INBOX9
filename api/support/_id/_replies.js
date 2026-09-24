import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin, validateBodySize } from '../../../_lib/security.js';
import { dbEnabled } from '../../../_lib/db.js';
import { getSessionUser, requireUser } from '../../../_lib/auth.js';
import { replySupportTicket } from '../../../_lib/support-repository.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'support-reply',10,600000) || !enforceSameOrigin(req,res)) return;
  try { validateBodySize(req,6000); } catch(e){ return res.status(413).json({error:e.message}); }
  if(!dbEnabled()) return res.status(503).json({error:'Threaded support requires PostgreSQL'});
  const user=await getSessionUser(req);
  try { requireUser(user); } catch(e){ return res.status(e.statusCode||401).json({error:e.message}); }
  try { return res.status(201).json({ticket:await replySupportTicket(user,req.query?.id,req.body?.message)}); }
  catch(error){ return res.status(error.statusCode||400).json({error:error.message||'Reply could not be sent'}); }
}