import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '../api/client';
import { SERVICE_LOGO_MANIFEST, SERVICE_LOGO_SPRITE } from './serviceLogoManifest';

export type IconName='apps'|'buy'|'active'|'account'|'bell'|'wallet'|'search'|'back'|'copy'|'plus'|'clock'|'close'|'arrow'|'support'|'check';
const ONGOING_ACTIVATION_STATUSES=new Set(['Active','CancellationPending','ExpirationPending']);
const TERMINAL_ACTIVATION_STATUSES=new Set(['Completed','Expired','Refunded','Cancelled']);
export const activationStateIsOngoing=(status:string)=>ONGOING_ACTIVATION_STATUSES.has(String(status||''));
const activationStateIsTerminal=(status:string)=>TERMINAL_ACTIVATION_STATUSES.has(String(status||''));

const iconPaths:Record<IconName,ReactNode>={
 apps:<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
 buy:<><path d="M5 7h14l-1.2 12H6.2L5 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M8 11h8"/></>,
 active:<><rect x="6" y="3.5" width="12" height="17" rx="3"/><path d="m9 14 2 2 4-5"/></>,
 account:<><circle cx="12" cy="8" r="3"/><path d="M5 20c.9-3 3.4-5 7-5s6.1 2 7 5"/></>,
 bell:<><path d="M6 10a6 6 0 0 1 12 0c0 7 3 6 3 8H3c0-2 3-1 3-8"/><path d="M10 21h4"/></>,
 wallet:<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M4 8h15"/><path d="M15 12h5"/><circle cx="16" cy="12" r=".7"/></>,
 search:<><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></>,
 back:<path d="m15 18-6-6 6-6"/>,
 copy:<><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
 plus:<><path d="M12 5v14M5 12h14"/></>,
 clock:<><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
 close:<><path d="m6 6 12 12M18 6 6 18"/></>,
 arrow:<><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></>,
 support:<><path d="M5 12a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2h-3"/><path d="M5 12h3v6H6a1 1 0 0 1-1-1v-5ZM19 12h-3v6h2a1 1 0 0 0 1-1v-5ZM12 19v2"/></>,
 check:<path d="m5 12 4 4L19 6"/>,
};
export function Icon({name,size=20}:{name:IconName;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>}

import { SERVICE_LOGO_MANIFEST, SERVICE_LOGO_SPRITE } from './serviceLogoManifest';

const serviceLogoCropCache=new Map<number,string>();
const serviceLogoCropPromiseCache=new Map<number,Promise<string>>();
let serviceLogoSpritePromise:Promise<HTMLImageElement>|null=null;

function getServiceLogoSpriteImage(path:string){
 if(!serviceLogoSpritePromise){
  serviceLogoSpritePromise=new Promise((resolve,reject)=>{
   const image=new Image();
   image.decoding='async';
   image.onload=()=>resolve(image);
   image.onerror=reject;
   image.src=path;
  });
 }
 return serviceLogoSpritePromise;
}

export function cropServiceLogo(path:string,index:number,tileSize:number,columns:number,outputSize:number){
 const cached=serviceLogoCropCache.get(index);
 if(cached)return Promise.resolve(cached);
 const inflight=serviceLogoCropPromiseCache.get(index);
 if(inflight)return inflight;
 const job=getServiceLogoSpriteImage(path).then(image=>{
  const source=document.createElement('canvas');
  source.width=tileSize;
  source.height=tileSize;
  const ctx=source.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas unavailable');
  const sx=(index%columns)*tileSize;
  const sy=Math.floor(index/columns)*tileSize;
  ctx.clearRect(0,0,tileSize,tileSize);
  ctx.drawImage(image,sx,sy,tileSize,tileSize,0,0,tileSize,tileSize);

  const pixels=ctx.getImageData(0,0,tileSize,tileSize).data;
  const corners=[[0,0],[tileSize-1,0],[0,tileSize-1],[tileSize-1,tileSize-1]];
  let opaqueCorners=0,bgR=0,bgG=0,bgB=0;
  for(const point of corners){
   const p=(point[1]*tileSize+point[0])*4;
   if(pixels[p+3]>220){opaqueCorners++;bgR+=pixels[p];bgG+=pixels[p+1];bgB+=pixels[p+2];}
  }
  if(opaqueCorners){bgR/=opaqueCorners;bgG/=opaqueCorners;bgB/=opaqueCorners;}

  const isArtwork=(x:number,y:number)=>{
   const p=(y*tileSize+x)*4;
   if(pixels[p+3]<18)return false;
   if(!opaqueCorners)return true;
   return Math.max(Math.abs(pixels[p]-bgR),Math.abs(pixels[p+1]-bgG),Math.abs(pixels[p+2]-bgB))>18;
  };

  let minX=tileSize,minY=tileSize,maxX=-1,maxY=-1;
  for(let y=0;y<tileSize;y++){
   for(let x=0;x<tileSize;x++){
    if(isArtwork(x,y)){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   }
  }
  if(maxX<0||maxY<0){minX=0;minY=0;maxX=tileSize-1;maxY=tileSize-1;}

  const margin=1;
  minX=Math.max(0,minX-margin);
  minY=Math.max(0,minY-margin);
  maxX=Math.min(tileSize-1,maxX+margin);
  maxY=Math.min(tileSize-1,maxY+margin);

  const cropW=maxX-minX+1,cropH=maxY-minY+1;
  const output=document.createElement('canvas');
  output.width=outputSize;output.height=outputSize;
  const out=output.getContext('2d');
  if(!out)throw new Error('Canvas unavailable');
  const pad=5,box=outputSize-pad*2;
  const scale=Math.min(box/cropW,box/cropH);
  const dw=cropW*scale,dh=cropH*scale;
  out.imageSmoothingEnabled=true;
  out.imageSmoothingQuality='high';
  out.clearRect(0,0,outputSize,outputSize);
  out.drawImage(source,minX,minY,cropW,cropH,(outputSize-dw)/2,(outputSize-dh)/2,dw,dh);

  const blob=await new Promise<Blob>((resolve,reject)=>{
   output.toBlob(value=>value?resolve(value):reject(new Error('Logo encoding failed')),'image/png');
  });
  const url=URL.createObjectURL(blob);
  serviceLogoCropCache.set(index,url);
  return url;
 }).finally(()=>{serviceLogoCropPromiseCache.delete(index)});
 serviceLogoCropPromiseCache.set(index,job);
 return job;
}

export function ServiceLogo({serviceId,name}:{serviceId:string;name:string}){
 const d=72;
 const {tileSize,columns,path}=SERVICE_LOGO_SPRITE;
 const logo=SERVICE_LOGO_MANIFEST[serviceId];
 const index=logo?.spriteIndex ?? -1;
 const has=Boolean(logo&&index>=0&&index<columns*9);
 const [src,setSrc]=useState<string|null>(()=>has?serviceLogoCropCache.get(index)??null:null);
 const token=useRef(0);

 useEffect(()=>{
  if(!has){setSrc(null);return;}
  const current=++token.current;
  cropServiceLogo(path,index,tileSize,columns,d).then(data=>{
   if(current===token.current)setSrc(data);
  }).catch(()=>{});
  return()=>{token.current++;};
 },[has,index,path,tileSize,columns]);

 const initials=name.trim().split(/\\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'I9';
 return <div className={['service-logo',has?'':'service-logo-fallback'].filter(Boolean).join(' ')} data-service-id={serviceId} data-logo-source={src?'cropped-sprite':has?'sprite':'fallback'} style={{width:d,height:d}}>
   <div className="service-logo-art">
    {src?<img src={src} alt="" aria-hidden="true" decoding="async" draggable="false"/>:<div className="service-logo-fallback-content"><span>{initials}</span><Icon name="apps" size={21}/></div>}
   </div>
 </div>;
}

export function activationErrorMessage(reason:unknown){
 if(reason instanceof ApiRequestError){
  switch(reason.code){
   case 'INSUFFICIENT_BALANCE': return 'Your wallet balance is too low for this number.';
   case 'OUT_OF_STOCK': return 'This service is temporarily out of stock. Please try again shortly.';
   case 'SERVICE_UNAVAILABLE': return 'This service is temporarily unavailable. Please try another service.';
   case 'REAL_PROVIDER_REQUIRED':
   case 'PROVIDER_RESELLER_AUTHORIZATION_REQUIRED':
   case 'PROVIDER_CANARY_DISABLED':
   case 'VIRTUALSMS_SERVICE_MAPPING_MISSING':
   case 'VIRTUALSMS_SERVICE_NOT_ALLOWLISTED':
     return 'Live purchase is not enabled for this service yet.';
   default: return reason.message;
  }
 }
 return reason instanceof Error?reason.message:'Could not create activation';
}
export function statusClass(status:string){return `status-pill status-${status.toLowerCase()}`}

