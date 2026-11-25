import {SignJWT,jwtVerify} from 'jose';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {BuiltRevision} from '../pipeline/types';
import type {VerifiedSession} from '../contracts/api';
import {requireResourceAudience} from '../pipeline/audience';
import {isGeneratedGame} from '../agent/generated';
import {renderGenerated} from '../sandbox/preview.cjs';
import {renderPreview} from '../pipeline/artifacts';
import {readWorkspace} from '../pipeline/workspace-state';
import type {PrivateArtifacts} from '../storage/artifacts';
import type {AtomicStore} from './documents';
import {uuid} from './model';
import {previewForm,sendPreview} from './preview-form';
export interface OwnerPreview {workspace:string;familyId:string;appOrigin:string;previewKey:string}
export async function ownerPreviewGrant(config:{appOrigin:string;previewOrigin:string;previewKey:string},session:VerifiedSession,r:BuiltRevision){
 if(!session.deviceId||!r.game||r.familyId!==session.familyId)throw Error('TRUSTED_DEVICE_REQUIRED');
 const expiresAt=Math.min(Date.now()+120000,session.expiresAt);
 const grant=await new SignJWT({family:session.familyId,device:session.deviceId,revision:r.id,adultSession:session.adultSessionId,adultProfile:session.adultProfileId})
  .setProtectedHeader({alg:'HS256',typ:'jems-household-preview'}).setIssuer(config.appOrigin).setAudience(config.previewOrigin).setIssuedAt()
  .setExpirationTime(Math.floor(expiresAt/1000)).sign(new TextEncoder().encode(config.previewKey));
 return {artifactId:r.id,projectId:r.projectId,expiresAt,url:config.previewOrigin+'/household-preview',grant,adapter:r.adapter,kind:r.game.kind,title:isGeneratedGame(r.game)?r.game.title:'Catch the Stars'};
}
export function ownerPreview(config:OwnerPreview,origin:string,db:AtomicStore,artifacts:(w:string)=>PrivateArtifacts|undefined){
 if(Object.keys(config).sort().join(',')!=='appOrigin,familyId,previewKey,workspace'||config.previewKey.length<32||
    ![config.workspace,config.familyId].every(v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v)&&!v.startsWith('beta-'))||
    ![origin,config.appOrigin].every(v=>/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v))||
    config.appOrigin===origin||/^https:\/\/f-[a-f0-9-]{36}\./.test(config.appOrigin))throw Error('HOUSEHOLD_PREVIEW_CONFIGURATION_REQUIRED');
 return async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   if(req.url!=='/household-preview'||req.headers.host!==new URL(origin).host||req.headers.origin!==config.appOrigin)throw Error();
   const {channel,grant}=await previewForm(req);
   const {payload:p}=await jwtVerify(grant,new TextEncoder().encode(config.previewKey),{algorithms:['HS256'],typ:'jems-household-preview',issuer:config.appOrigin,audience:origin,maxTokenAge:'2m'});
   if(p.family!==config.familyId||!uuid(p.device)||typeof p.revision!=='string'||!/^[\w-]{1,100}$/.test(p.revision)||
    p.adultSession!==undefined&&(!uuid(p.adultSession)||typeof p.adultProfile!=='string'))throw Error();
   const session:VerifiedSession={subject:'household-preview',role:'designer',familyId:config.familyId,deviceId:p.device,expiresAt:p.exp!*1000,
    adultSessionId:p.adultSession as string|undefined,adultProfileId:p.adultProfile as string|undefined};
   const result=await db.run(async tx=>{
    const {state}=await readWorkspace(tx,config.workspace,artifacts(config.workspace));
    const r=state.revisions.find(r=>r.id===p.revision&&r.familyId===config.familyId);
    if(!r?.game)throw Error();requireResourceAudience(state,session,r);
    return isGeneratedGame(r.game)?renderGenerated(r.game,r.id,channel):renderPreview(r.game,r.id,channel);
   },true);
   sendPreview(res,config.appOrigin,result);
  }catch{res.writeHead(403,{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});res.end('Private preview unavailable');}
 };
}
