import {createHash} from 'node:crypto';
import {FixtureDocuments,type AtomicStore} from '../server/beta/documents';
import {createHouseholdRecovery,type HouseholdRecoveryConfig} from '../server/storage/household-recovery';
import {MemoryRepository} from '../server/pipeline/repository';
import {readWorkspace,writeWorkspace} from '../server/pipeline/workspace-state';
import {beginAdultPilotSession,grantAdultPilot,authenticateAdultPilotSession} from '../server/adult-pilot';
import {signSession} from '../server/pipeline/auth';
import type {PrivateArtifacts} from '../server/storage/artifacts';
import type {BackupScheduleLedger} from '../server/storage/recovery-scheduler';
import type {VerifiedSession} from '../server/contracts/api';
import {compileArtFixture,pixelGame} from './generated-art-fixtures';
export const signing='synthetic-household-recovery-key-no-production-secret',familyId='household-recovery-fixture',workspace='household-recovery-test',appOrigin='https://owner.example';
const sourceDevice='00000000-0000-0000-0000-000000000111',targetDevice='00000000-0000-0000-0000-000000000222';
export const sourceAudience='adult:'+sourceDevice,targetAudience='adult:'+targetDevice;
export async function fixture(split=false){
 const db:AtomicStore=new FixtureDocuments(),repo=new MemoryRepository(),now=Date.now(),blobs=new Map<string,Buffer>();let calls=0;
 const artifacts:PrivateArtifacts={put:async bytes=>{calls++;const sha256=createHash('sha256').update(bytes).digest('hex');blobs.set(sha256,Buffer.from(bytes));return {storage:'private-artifact-v1',sha256,bytes:bytes.length};},get:async ref=>{const bytes=blobs.get(ref.sha256);if(!bytes)throw Error('ORIGINAL_ASSET_MISSING');return Buffer.from(bytes);}};
 await repo.transaction(s=>{s.devices=[sourceDevice,targetDevice].map(id=>({id,familyId,name:'Synthetic Adult',secretHash:'a'.repeat(64),rotation:0,createdAt:now-1000,lastSeenAt:now,expiresAt:now+86400000}));s.ledgers[familyId]={month:new Date().toISOString().slice(0,7),allowance:50_000_000,used:5_000_000,reserved:1234,paidEnabled:true};return true;});
 const sessions:{browser:VerifiedSession;session:VerifiedSession;proof:string;cookies:string}[]=[];
 for(const deviceId of [sourceDevice,targetDevice]){
  const browser:VerifiedSession={familyId,deviceId,role:'designer',subject:'family-designer',expiresAt:now+86400000};
  await grantAdultPilot(repo,{familyId,deviceId,receipt:'synthetic-review-'+deviceId,operatorConfirmedAdult:true,expiresAt:now+86400000});
  const opened=await repo.transaction(s=>beginAdultPilotSession(s,browser));
  sessions.push({browser,session:authenticateAdultPilotSession(await repo.snapshot(),browser,opened.cookieValue,opened.sessionToken),proof:opened.sessionToken,cookies:'factory_session='+signSession(browser,signing)+'; factory_adult='+opened.cookieValue});
 }
 const original=pixelGame();original.source+='\n/*'+'retained original'.repeat(1000)+'*/';const game=compileArtFixture(original);
 await repo.transaction(s=>{s.revisions.push({id:'source-revision',projectId:'source-project',familyId,parentId:null,game,adultPilotProfileId:sourceAudience,name:'Original Adult game'});s.active['source-project']='source-revision';s.revisions.push({id:'family-original',projectId:'family-project',familyId,parentId:null,game:{kind:'star-catcher-v1',seconds:10,target:3}});s.active['family-project']='family-original';return true;});
 const originalState=await repo.snapshot();await db.run(async tx=>{const loaded=await readWorkspace(tx,workspace,artifacts);loaded.state=originalState;await writeWorkspace(tx,loaded,artifacts,{splitGamePayloads:split});});
 const config:HouseholdRecoveryConfig={platformMode:'HOUSEHOLD',householdPrivateHost:{audience:'/projects/1/global/backendServices/2',subject:'synthetic-owner',sourceOrigin:'https://previous.example'},familyId,workspace,appOrigin,gatewayOrigin:appOrigin,sessionKey:signing,storageEncoding:split?'private-game-v2':undefined,householdRecovery:{enabled:true,domains:['profiles','games','creative','learning','artwork','conversation','rewards','notifications','backups'],adultMappings:[{sourceOrigin:appOrigin,sourceAudience,targetAudience}]}};
 const frozen=new Map<string,{sources:Record<string,string|null>;completed:boolean}>();
 const ledgerFor=(audience:string,authorize:(tx:any)=>Promise<void>):BackupScheduleLedger=>({claim:async(key,make)=>{await db.run(authorize,true);const id=audience+key;if(!frozen.has(id))frozen.set(id,{...await make(),completed:false});return structuredClone(frozen.get(id)!);},complete:async key=>{await db.run(authorize,true);frozen.get(audience+key)!.completed=true;}});
 const route=createHouseholdRecovery(config,db,artifacts,ledgerFor);
 const call=(who:0|1,path:string,body:object={})=>route.request(sessions[who].cookies,sessions[who].proof,path,{profile:sessions[who].session.adultProfileId,...body});
 const mutate=async(fn:(s:any)=>void)=>db.run(async tx=>{const loaded=await readWorkspace(tx,workspace,artifacts);fn(loaded.state);await writeWorkspace(tx,loaded,artifacts,{splitGamePayloads:split});});
 return {db,repo,config,route,artifacts,blobs,sessions,call,mutate,game,originalState,ledgerFor,frozen,writes:()=>calls};
}
