import { apiRequest } from './client';
import type { Session, User } from './types';
export function getSessions(){return apiRequest<{sessions:Session[];policy:{absoluteDays:number;maxSessionsPerUser:number}}>('/api/auth/sessions');}
export function revokeSession(id:string){return apiRequest<{ok:true;revoked:boolean;current:boolean}>('/api/auth/sessions/'+encodeURIComponent(id),{method:'DELETE'});}
export function updateProfile(displayName:string){return apiRequest<{user:User}>('/api/auth/profile',{method:'POST',body:JSON.stringify({displayName})});}
export function changePassword(currentPassword:string,newPassword:string){return apiRequest<{ok:true;user:User;sessionsInvalidated:boolean}>('/api/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});}
export function issueRecoveryCode(){return apiRequest<{code:string;createdAt?:number}>('/api/auth/recovery-code',{method:'POST'});}
export function recoverPassword(email:string,recoveryCode:string,password:string){return apiRequest<{ok:true;user:User;sessionsInvalidated:boolean}>('/api/auth/recover',{method:'POST',body:JSON.stringify({email,recoveryCode,password})});}
export function logoutAll(){return apiRequest<{ok:true;revoked:number;current:boolean}>('/api/auth/logout-all',{method:'POST'});}
