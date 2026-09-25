import { apiRequest } from './client';
import type { SupportTicket } from './types';
export function getSupportTickets(){return apiRequest<{tickets:SupportTicket[]}>('/api/support');}
export function createSupportTicket(input:{category:string;subject:string;message:string;activationId?:string;rechargeId?:string}){return apiRequest<{ticket:SupportTicket}>('/api/support',{method:'POST',body:JSON.stringify(input)});}
export function replySupportTicket(ticketId:string,message:string){return apiRequest<{ticket:SupportTicket}>('/api/support/'+encodeURIComponent(ticketId)+'/replies',{method:'POST',body:JSON.stringify({message})});}
