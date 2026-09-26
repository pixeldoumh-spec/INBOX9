import { applySecurityHeaders, requestId, rateLimitAsync, enforceSameOrigin } from '../../_lib/security.js';
import { dbEnabled } from '../../_lib/db.js';
import { getSessionUser, requireAdmin } from '../../_lib/auth.js';
import { getAdminUser, revokeAdminUserSessions, setAdminUserActive } from '../../_lib/admin-repository.js';

export default async function handler(req,res){
  applySecurityHeaders(res); requestId(req,res);
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await rateLimitAsync(req,res,'admin-user-detail',60,60_000))return;
  if(!dbEnabled())return res.status(503).json({error:'Admin user operations require PostgreSQL'});
  const user=await getSessionUser(req);
  try{requireAdmin(user);}catch(e){return res.status(e.statusCode||401).json({error:e.message});}
  const id=req.query?.id?String(req.query.id):'';
  if(!id)return res.status(400).json({error:'User id is required'});
  if(req.method==='GET'){
    try{return res.status(200).json(await getAdminUser(id));}
    catch(error){
      if(Number(error?.statusCode)===404)return res.status(404).json({error:'User not found'});
      console.error('admin.user_detail_failed',error);
      return res.status(503).json({error:'User detail unavailable'});
    }
  }
  if(!enforceSameOrigin(req,res))return;
  const action=String(req.body?.action||'').trim().toLowerCase();
  if(!['enable','disable','logout_all'].includes(action))return res.status(400).json({error:'Action must be enable, disable or logout_all'});
  try{
    if(action==='logout_all')return res.status(200).json(await revokeAdminUserSessions(user.id,id));
    return res.status(200).json(await setAdminUserActive(user.id,id,action==='enable'));
  }catch(error){
    const status=Number(error?.statusCode);
    if(status>=400&&status<500)return res.status(status).json({error:error.message});
    console.error('admin.user_operation_failed',error);
    return res.status(503).json({error:'User operation unavailable'});
  }
}
