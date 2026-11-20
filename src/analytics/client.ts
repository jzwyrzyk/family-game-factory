/** Optional product observations. No SDK, autocapture, browser persistence or replay.
 * Analytics never renews a session, retries a request or changes game/auth state.
 */
import type {BuilderConfig} from '../builder/client';
import {adultRequestSession,adultSessionVersion} from '../adult-pilot/session';
import {
  ANALYTICS_NOTICE_VERSION, ANALYTICS_SCHEMA_VERSION, analyticsReference,
  validateClientAnalyticsEvent, type AnalyticsBuildContext, type AnalyticsStatus,
  type ClientAnalyticsEvent, type ClientAnalyticsEventName,
} from './contract';

export type AnalyticsDetails = Omit<ClientAnalyticsEvent, 'schemaVersion' | 'event' | 'eventId' | 'choiceId'>;
interface Dependencies {
  owner():string | undefined;
  adult(base:string):{profileId:string;sessionToken:string} | null;
  sessionVersion():number;
  fetch(input:string,init:RequestInit):Promise<Response>;
  now():number;
  uuid():string;
  changed?():void;
}

export class ProductAnalyticsClient {
  private base='';
  private enabled=false;
  private suspended=false;
  private generation=0;
  private permission:AnalyticsStatus|null=null;
  private permissionOwner:string|undefined;
  private permissionSession=0;
  private queue:ClientAnalyticsEvent[]=[];
  private scheduled=false;
  private controllers=new Set<AbortController>();
  private checking:Promise<AnalyticsStatus|null>|null=null;

  constructor(private readonly deps:Dependencies){}
  private changed():void {try{this.deps.changed?.();}catch{/* Optional status observers cannot stop the application. */}}

  configure(config:BuilderConfig):void {
    this.reset();
    this.suspended=false;
    this.enabled=config.mode==='remote'&&config.analytics?.version===1&&config.analytics.enabled===true;
    this.base=this.enabled?config.apiBaseUrl||'':'';
    if(this.enabled&&this.base)void this.refresh();
  }

  reset():void {
    ++this.generation;
    this.permission=null;
    this.permissionOwner=undefined;
    this.queue=[];
    this.scheduled=false;
    this.checking=null;
    for(const controller of this.controllers)controller.abort();
    this.controllers.clear();
    this.changed();
  }

  configured():boolean {return this.enabled&&!!this.base;}
  status():AnalyticsStatus|null {return this.permission?{...this.permission}:null;}
  pause():void {this.suspended=true;this.reset();}
  resume():Promise<AnalyticsStatus|null> {this.suspended=false;return this.refresh();}

  private headers():Record<string,string> {
    const adult=this.deps.adult(this.base);
    return adult?{'X-Factory-Adult-Session':adult.sessionToken}:{};
  }

  async refresh():Promise<AnalyticsStatus|null> {
    if(!this.configured()||this.suspended)return null;
    if(this.checking)return this.checking;
    const generation=this.generation,owner=this.deps.owner(),session=this.deps.sessionVersion();
    if(!owner)return null;
    this.permission=null;this.queue=[];
    const controller=new AbortController();this.controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),1500);
    const work=(async()=>{
      try {
        const response=await this.deps.fetch(this.base+'/v1/analytics/status',{
          credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,headers:this.headers(),
        });
        if(generation!==this.generation||owner!==this.deps.owner()||session!==this.deps.sessionVersion()||controller.signal.aborted)return null;
        if(!response.ok){this.permission=null;return null;}
        const value=await response.json() as AnalyticsStatus;
        if(generation!==this.generation||owner!==this.deps.owner()||session!==this.deps.sessionVersion()||controller.signal.aborted)return null;
        if(value.noticeVersion!==ANALYTICS_NOTICE_VERSION||typeof value.enabled!=='boolean'||typeof value.permitted!=='boolean'
          ||!['adult','child'].includes(value.audience)||!['disabled','not-requested','pending','enabled','revoked','expired'].includes(value.status)
          ||value.permitted&&(value.status!=='enabled'||!value.enabled||typeof value.choiceId!=='string'
            ||!/^[a-f0-9-]{36}$/i.test(value.choiceId)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt!<=this.deps.now()))return null;
        const adult=this.deps.adult(this.base);
        if(value.audience==='adult'?(adult?.profileId!==owner):!!adult)return null;
        this.permission=value;this.permissionOwner=owner;this.permissionSession=session;
        this.changed();return {...value};
      } catch {return null;}
      finally {clearTimeout(timeout);this.controllers.delete(controller);if(generation===this.generation)this.checking=null;}
    })();
    this.checking=work;return work;
  }

  private authorized(ownerId:string):boolean {
    const status=this.permission;
    return this.configured()&&!this.suspended&&this.deps.owner()===ownerId&&this.permissionOwner===ownerId
      &&this.permissionSession===this.deps.sessionVersion()&&status?.enabled===true&&status.permitted===true
      &&status.status==='enabled'&&!!status.choiceId&&typeof status.expiresAt==='number'&&status.expiresAt>this.deps.now();
  }

  buildContext(ownerId:string,creationId:string):AnalyticsBuildContext|undefined {
    try {
      if(!this.authorized(ownerId)||!analyticsReference(ownerId)||!analyticsReference(creationId))return undefined;
      return {schemaVersion:ANALYTICS_SCHEMA_VERSION,choiceId:this.permission!.choiceId!,ownerId,creationId};
    } catch {return undefined;}
  }

  track(event:ClientAnalyticsEventName,details:AnalyticsDetails):void {
    try {
      if(!this.authorized(details.ownerId))return;
      const record=validateClientAnalyticsEvent({...details,event,schemaVersion:ANALYTICS_SCHEMA_VERSION,
        eventId:this.deps.uuid(),choiceId:this.permission!.choiceId!});
      if(this.queue.length>=20)return; // Drop excess observations; never slow or block play.
      this.queue.push(record);
      if(this.scheduled)return;
      this.scheduled=true;
      const generation=this.generation;
      queueMicrotask(()=>{if(generation===this.generation){this.scheduled=false;void this.flush();}});
    } catch {/* A malformed observation cannot fail a saved action. */}
  }

  async flush():Promise<void> {
    const events=this.queue.splice(0,20);
    if(!events.length)return;
    const owner=events[0].ownerId,choiceId=events[0].choiceId,generation=this.generation,session=this.deps.sessionVersion();
    if(!this.authorized(owner)||choiceId!==this.permission?.choiceId||events.some(event=>event.ownerId!==owner||event.choiceId!==choiceId))return;
    const controller=new AbortController();this.controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),1500);
    try {
      const response=await this.deps.fetch(this.base+'/v1/analytics/events',{
        method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,
        headers:{...this.headers(),'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({events}),
      });
      if(generation!==this.generation||owner!==this.deps.owner()||session!==this.deps.sessionVersion())return;
      if(!response.ok){this.permission=null;this.queue=[];this.changed();}
    } catch {/* Best-effort observations have no offline retry or keepalive. */}
    finally {clearTimeout(timeout);this.controllers.delete(controller);}
  }
}

const client=new ProductAnalyticsClient({
  owner:()=>{try{return (globalThis as any).FG?.store?.current()?.id;}catch{return undefined;}},
  adult:adultRequestSession,sessionVersion:adultSessionVersion,
  fetch:(url,init)=>fetch(url,init),now:()=>Date.now(),uuid:()=>crypto.randomUUID(),
  changed:()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('jems-analytics-status'));},
});
let installed=false;
export function configureAnalytics(config:BuilderConfig):void {
  client.configure(config);
  if(installed||typeof window==='undefined')return;
  installed=true;
  window.addEventListener('factory-profile-before-change',()=>client.reset());
  window.addEventListener('factory-profile',()=>{client.reset();void client.refresh();});
  window.addEventListener('factory-session-restored',()=>{void client.refresh();});
  window.addEventListener('focus',()=>{void client.refresh();});
  window.addEventListener('pagehide',()=>client.reset());
}
export const trackAnalytics=(event:ClientAnalyticsEventName,details:AnalyticsDetails):void=>client.track(event,details);
export const analyticsBuildContext=(ownerId:string,creationId:string)=>client.buildContext(ownerId,creationId);
export const refreshAnalyticsPermission=()=>client.resume();
export const resetAnalyticsPermission=()=>client.pause();
export const analyticsConfigured=()=>client.configured();
export const analyticsPermission=()=>client.status();
