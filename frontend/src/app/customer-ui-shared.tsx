import type { ReactNode } from 'react';
import { SERVICE_LOGO_MANIFEST, SERVICE_LOGO_SPRITE } from './serviceLogoManifest';

export type IconName='apps'|'buy'|'active'|'account'|'bell'|'wallet'|'search'|'back'|'copy'|'plus'|'clock'|'close'|'arrow'|'support'|'check';
const ONGOING_ACTIVATION_STATUSES=new Set(['Active','CancellationPending','ExpirationPending']);
const TERMINAL_ACTIVATION_STATUSES=new Set(['Completed','Expired','Refunded','Cancelled']);
export const activationStateIsOngoing=(status:string)=>ONGOING_ACTIVATION_STATUSES.has(String(status||''));
export const activationStateIsTerminal=(status:string)=>TERMINAL_ACTIVATION_STATUSES.has(String(status||''));

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




export function ServiceLogo({serviceId,name}:{serviceId:string;name:string}){
 const {columns,rows,path}=SERVICE_LOGO_SPRITE;
 const logo=SERVICE_LOGO_MANIFEST[serviceId];
 const index=logo?.spriteIndex ?? -1;
 const has=Boolean(logo&&index>=0&&index<columns*rows);
 const column=has?index%columns:0;
 const row=has?Math.floor(index/columns):0;
 const backgroundPosition=has
  ? `${column/(Math.max(columns-1,1))*100}% ${row/(Math.max(rows-1,1))*100}%`
  : '0% 0%';
 return <div className={['service-logo',has?'':'service-logo-blank'].filter(Boolean).join(' ')} data-service-id={serviceId} data-logo-source={has?'zip-sprite':'blank'} style={{width:72,height:72}}>
   <span className="service-logo-aura" aria-hidden="true"/>
   <span className="service-logo-frame">
    <span
      className={['service-logo-art',has?'':'service-logo-blank-art'].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={has ? {
        backgroundImage: 'url('+path+')',
        backgroundSize: (columns*100)+'% '+(rows*100)+'%',
        backgroundPosition,
      } : undefined}
    />
   </span>
   <span className="service-logo-sheen" aria-hidden="true"/>
 </div>;
}
