import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import {processDeletion} from '../server/beta/erase';
import {betaFixture,fixtureKey,parent,cookieHeader} from './beta-fixture';
import {requirePlay} from '../server/beta/access';
import {signSession} from '../server/pipeline/auth';
import {familyOrigin} from '../server/beta/model';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {trustedDeviceHandler} from '../server/trusted-devices';

/** In-memory executor double: records every destructive call. No provider calls. */
function executor(records:Map<string,any>,objects:string[]){
 const deleted:string[]=[],listed:string[]=[],copy=(x:any)=>structuredClone(x);
 let failPath='';
 const row=(path:string)=>({id:path.split('/').at(-1),ref:doc(path),exists:records.has(path),data:()=>copy(records.get(path))});
 const query=(path:string,limit=100,filter?:[string,unknown]):any=>({path,
  doc:(id:string)=>doc(path+'/'+id),limit:(n:number)=>query(path,n,filter),where:(field:string,op:string,value:unknown)=>{assert.equal(op,'==');return query(path,limit,[field,value]);},
  get:async()=>{const keys=[...records.keys()].filter(key=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&(!filter||records.get(key)?.[filter[0]]===filter[1])).sort().slice(0,limit);return {empty:!keys.length,docs:keys.map(row)};}});
 const doc=(path:string):any=>({path,collection:(name:string)=>query(path+'/'+name),get:async()=>row(path)});
 const db:any={doc,collection:(path:string)=>query(path),recursiveDelete:async(ref:any)=>{if(ref.path===failPath){failPath='';throw Error('SYNTHETIC_INTERRUPTION');}deleted.push(ref.path);for(const path of records.keys())if(path===ref.path||path.startsWith(ref.path+'/'))records.delete(path);},
  batch:()=>{const paths:string[]=[];return {delete:(ref:any)=>paths.push(ref.path),commit:async()=>{for(const path of paths){deleted.push(path);records.delete(path);}}};},
  runTransaction:async(fn:any)=>fn({get:async(ref:any)=>row(ref.path),set:(ref:any,value:any)=>records.set(ref.path,copy(value)),delete:(ref:any)=>{deleted.push(ref.path);records.delete(ref.path);}})};
 const storage:any={bucket:()=>({getFiles:async({prefix,versions,autoPaginate,maxResults}:any)=>{assert.equal(versions,true);assert.equal(autoPaginate,false);listed.push(prefix);return [objects.filter(path=>path.startsWith(prefix)).slice(0,maxResults).map(name=>({name,metadata:{generation:'7'},delete:async({ifGenerationMatch}:any)=>{assert.equal(ifGenerationMatch,'7');deleted.push(name);objects.splice(objects.indexOf(name),1);}}))];}})};
 return {db,storage,deleted,listed,interrupt:(path:string)=>{failPath=path;}};
}

test('verified erasure waits for unsettled storage writes, then removes all scoped backup roots and tolerates retry',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('privacy-completion');
 await mutate('request-deletion',a.id);const requestId=(await d.withFamily(a.id,async(_tx,f)=>f)).request!.id;
 await mutate('confirm-deletion',a.id,{requestId,receipt:'synthetic-approved-erasure'});
 const family=await d.withFamily(a.id,async(_tx,f)=>f),path=d.path(a.id),workspace=family.workspace;
 const metadata=['acknowledgments','metadata','usage','continuity','storage-consents','backup-scans','generated-restores'];
 const operation=`factoryBackupSchedules/${workspace}/activeOperations/${randomUUID()}`;
 const records=new Map<string,any>([[path,family],[operation,{schema:'jems.backup-operation.v1',familyId:a.id,profile:'synthetic',purpose:'artifact-write',startedAt:1}]]);
 for(const root of ['factoryWorkspaces','factoryContinuity','factoryBackupSchedules'])records.set(`${root}/${workspace}/records/synthetic`,{source:'retained until settled'});
 for(const collection of metadata)records.set(path+'/'+collection+'/synthetic',{familyId:a.id});
 records.set(d.root+'/verification/a',{familyId:a.id});records.set(d.root+'/jobs/a',{familyId:a.id});
 const other='factoryBackupSchedules/beta-other/points/synthetic';records.set(other,{familyId:'other'});
 const objects=[`factory/${workspace}/frozen-snapshot`, 'factory/beta-other/untouched'];
 const x=executor(records,objects),config={environment:d.config.environment,artifactBucket:'synthetic-only'};
 assert.deepEqual(await processDeletion(x.db,x.storage,config,a.id,requestId,false),{authorized:true,workspace,apply:false,pendingStorageOperations:true});
 await assert.rejects(processDeletion(x.db,x.storage,config,a.id,requestId,true),/STORAGE_OPERATIONS_PENDING/);
 assert.deepEqual(x.deleted,[]);assert.deepEqual(x.listed,[]);assert.ok(records.has(operation),'An ancient marker is not erasure proof.');
 records.delete(operation); // Positive settlement by the admitted writer, never a timeout.
 x.interrupt('factoryContinuity/'+workspace);
 await assert.rejects(processDeletion(x.db,x.storage,config,a.id,requestId,true),/SYNTHETIC_INTERRUPTION/);
 assert.equal(records.get(path).request.state,'deleting');
 assert.equal((await processDeletion(x.db,x.storage,config,a.id,requestId,true)).apply,true);
 assert.equal(records.get(path).request.state,'completed');assert.equal(records.get(path).status,'revoked');
 for(const root of ['factoryWorkspaces','factoryContinuity','factoryBackupSchedules'])assert.ok(![...records.keys()].some(key=>key.startsWith(root+'/'+workspace+'/')));
 for(const collection of metadata)assert.ok(![...records.keys()].some(key=>key.startsWith(path+'/'+collection+'/')));
 assert.ok(records.has(other));assert.deepEqual(objects,['factory/beta-other/untouched']);
 await processDeletion(x.db,x.storage,config,a.id,requestId,true); // completed-case retry stays scoped and idempotent.
});

test('approved guardian export includes paged storage consent, schedule and unresolved operation metadata only for its family',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('export-all-storage'),b=await enroll('export-other-storage');
 const session=(await requirePlay(d,a.id,a.cookies,fixtureKey,'check')).session;
 const cookies=a.cookies+'; __Host-factory_parent='+signSession({...session,role:'parent'},fixtureKey);
 const kinds=['storage-consents','backup-scans','backup-schedules','backup-operations','generated-restores'];
 const collection=(id:string,kind:string)=>kind==='backup-schedules'?`factoryBackupSchedules/beta-${id}/points`:kind==='backup-operations'?`factoryBackupSchedules/beta-${id}/activeOperations`:d.path(id)+'/'+kind;
 await d.db.run(async tx=>{for(const kind of kinds){for(let i=0;i<5;i++)tx.set(collection(a.id,kind)+'/'+String(i).padStart(64,'0'),{synthetic:kind+'-'+i});tx.set(collection(b.id,kind)+'/'+'a'.repeat(64),{synthetic:'OTHER FAMILY PRIVATE METADATA'});}});
 const handler=betaRouter(d,fixtureKey,{runtime:async()=>async()=>{throw Error('NOT_FOUND');}}),server=createServer((req,res)=>void handler(req,res));await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const call=(familyId:string,body:unknown,cookie=cookies,method='POST')=>new Promise<{status:number;body:any}>((ok,fail)=>{const origin=familyOrigin(d.config,familyId),req=request({host:'127.0.0.1',port:(server.address() as AddressInfo).port,path:'/entry/export-storage-metadata',method,headers:{Host:new URL(origin).host,Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Factory-Request':'1'}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>ok({status:res.statusCode!,body:JSON.parse(text)}));});req.on('error',fail);req.end(method==='POST'?JSON.stringify(body):undefined);});
 try{
  assert.equal((await call(a.id,{kind:kinds[0],after:''})).status,403);
  await mutate('request-export',a.id);const requestId=(await d.withFamily(a.id,async(_tx,f)=>f)).request!.id;await mutate('release-export',a.id,{requestId,receipt:'synthetic-storage-export'});
  for(const kind of kinds){const first=await call(a.id,{kind,after:''});assert.equal(first.status,200);assert.equal(first.body.rows.length,4);const last=await call(a.id,{kind,after:first.body.next});assert.equal(last.body.rows.length,1);assert.equal(last.body.next,null);assert.ok(!JSON.stringify([first,last]).includes('OTHER FAMILY'));}
  assert.ok((await call(b.id,{kind:kinds[0],after:''})).status>=400);
  assert.ok((await call(a.id,{kind:kinds[0],after:''},a.cookies)).status>=400);
  assert.ok((await call(a.id,{kind:'../metadata',after:''})).status>=400);
  assert.ok((await call(a.id,{kind:kinds[0],after:'../'})).status>=400);
  assert.ok((await call(a.id,{},cookies,'GET')).status>=400);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});

test('verified erasure reconciles only the exact committed restore receipt after revocation',async()=>{
 const {d,enroll,mutate}=await betaFixture(),f=await enroll('committed-restore-erasure');await mutate('request-deletion',f.id);const requestId=(await d.withFamily(f.id,async(_tx,f)=>f)).request!.id;await mutate('confirm-deletion',f.id,{requestId,receipt:'synthetic-reviewed-erasure'});
 const family=await d.withFamily(f.id,async(_tx,f)=>f),pointId='scheduled-'+'a'.repeat(48),checksum='b'.repeat(64),identity=createHash('sha256').update(pointId+':'+checksum).digest('hex'),operation='factoryBackupSchedules/'+family.workspace+'/activeOperations/restore-'+identity,receiptPath=d.path(f.id)+'/generated-restores/'+identity;
 const records=new Map<string,any>([[d.path(f.id),family],[operation,{schema:'jems.backup-operation.v1',familyId:f.id,profile:'original-profile',purpose:'generated-restore',attempt:'lost-reply',startedAt:1,completion:{pointId,checksum}}],[receiptPath,{pointId,checksum:'c'.repeat(64),added:1,opened:1,retained:0}]]),objects=[`factory/${family.workspace}/original`],x=executor(records,objects),config={environment:d.config.environment,artifactBucket:'synthetic-only'};
 await assert.rejects(processDeletion(x.db,x.storage,config,f.id,requestId,true),/STORAGE_OPERATIONS_PENDING/);assert.ok(records.has(operation));assert.deepEqual(x.deleted,[]);
 records.set(receiptPath,{pointId,checksum,added:1,opened:1,retained:0});assert.equal((await processDeletion(x.db,x.storage,config,f.id,requestId,false)).pendingStorageOperations,true,'read-only check cannot settle an operation');assert.ok(records.has(operation));
 assert.equal((await processDeletion(x.db,x.storage,config,f.id,requestId,true)).apply,true);assert.equal(records.has(operation),false);assert.deepEqual(objects,[]);assert.equal(records.get(d.path(f.id)).request.state,'completed');
});

test('suspended guardian downloads only its approved privacy case with a separate live-device parent proof',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('paused-privacy'),b=await enroll('other-privacy');
 const session=(await requirePlay(d,a.id,a.cookies,fixtureKey,'check')).session;
 await d.repository(a.id).transaction(s=>s.revisions.push({id:randomUUID(),familyId:a.id,projectId:'preserved',parentId:null,game:{kind:'star-catcher-v1',target:5,seconds:15}}));
 await mutate('suspend',a.id);
 let runtimeCalls=0;
 const route=betaRouter(d,fixtureKey,{runtime:async id=>async(req,res)=>{runtimeCalls++;await trustedDeviceHandler(d.repository(id),{familyId:id,sessionKey:fixtureKey,appOrigin:familyOrigin(d.config,id),firstParty:true})(req,res);},surface:betaHosting('.',d.config,'https://viewer.example')});
 const server=createServer((req,res)=>void route(req,res));await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const call=(path:string,body?:unknown,cookies=a.cookies,id=a.id,originOverride?:string)=>new Promise<{status:number;body:any;text:string;cookies:string[]}>((ok,fail)=>{
  const origin=familyOrigin(d.config,id),req=request({host:'127.0.0.1',port:(server.address() as AddressInfo).port,path,method:body===undefined?'GET':'POST',headers:{Host:new URL(origin).host,Origin:originOverride??origin,Cookie:cookies,'Content-Type':'application/json','X-Factory-Request':'1'}},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{let body;try{body=JSON.parse(text);}catch{}ok({status:res.statusCode!,body,text,cookies:res.headers['set-cookie']??[]});});
  });req.on('error',fail);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const release=async()=>{await mutate('request-export',a.id);const f=await d.withFamily(a.id,async(_tx,f)=>f);await mutate('release-export',a.id,{requestId:f.request!.id,receipt:'synthetic-export-'+randomUUID()});};
 try{
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent})).status,403);
  assert.equal((await call('/privacy-export')).status,403);
  const expired=a.cookies.replace(/__Host-factory_session=[^;]+/,'__Host-factory_session='+signSession({...session,expiresAt:Date.now()-1},fixtureKey));
  assert.equal((await call('/v1/sessions/renew',{},expired)).status,403);
  await release();
  const renewed=await call('/v1/sessions/renew',{},expired);assert.equal(renewed.status,200);assert.equal(runtimeCalls,1);
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent},cookieHeader(renewed.cookies))).status,200);
  assert.equal((await call('/entry/status')).body.exportReady,true);
  const page=await call('/privacy-export');assert.equal(page.status,200);assert.match(page.text,/id="exportUnlock"/);assert.ok(!page.text.includes('id="privacyChoice"'));
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent},a.cookies,a.id,familyOrigin(d.config,b.id))).status,403);
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent},b.cookies)).status,401);
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:'incorrect parent passphrase'})).status,403);
  assert.equal((await d.repository(a.id).snapshot()).parentAuth![a.id].failedAttempts,1);
  assert.equal((await call('/entry/export',{})).status,403);
  const oldParent=a.cookies+'; __Host-factory_parent='+signSession({...session,role:'parent'},fixtureKey);
  assert.equal((await call('/entry/export',{},oldParent)).status,403);
  const unlocked=await call('/entry/privacy-export-unlock',{parentPassphrase:parent});assert.equal(unlocked.status,200);
  assert.equal(unlocked.cookies.length,1);assert.match(unlocked.cookies[0],/^__Host-jems-export=/);assert.match(unlocked.cookies[0],/Secure; HttpOnly; SameSite=Strict/);
  assert.ok(unlocked.body.expiresAt<=Date.now()+15*60000);
  const proof=a.cookies+'; '+cookieHeader(unlocked.cookies);
  const exported=await call('/entry/export',{},proof);assert.equal(exported.status,200);assert.equal(exported.body.familyId,a.id);assert.equal(exported.body.revisions[0].projectId,'preserved');
  assert.ok(!exported.text.includes('secretHash'));assert.ok(!exported.text.includes('family-export:'));
  for(const [path,body] of [['/entry/export-receipts',{kind:'acknowledgments',after:''}],['/entry/export-storage-metadata',{kind:'generated-restores',after:''}],['/entry/export-storage',{after:''}]] as const)assert.equal((await call(path,body,proof)).status,200,path);
  for(const [path,body] of [['/entry/check',undefined],['/play/',undefined],['/entry/profiles',undefined],['/entry/storage-consent',undefined],['/entry/parent-guidance',{}],['/v1/devices/unlock',{parentPassphrase:parent}],['/v1/jobs',{}]] as const)assert.ok((await call(path,body,proof)).status>=400,path);
  assert.equal(runtimeCalls,1);assert.equal((await d.withFamily(a.id,async(_tx,f)=>f)).status,'suspended');
  await d.withFamily(a.id,async(tx,f)=>{f.status='active';tx.set(d.path(a.id),f);});
  const renamed=a.cookies+'; '+cookieHeader(unlocked.cookies).replace('__Host-jems-export=','__Host-factory_parent=');
  assert.equal((await call('/entry/profiles',undefined,renamed)).status,401,'Renaming the export proof cannot mint normal parent authority.');
  await d.withFamily(a.id,async(tx,f)=>{f.status='suspended';tx.set(d.path(a.id),f);});
  assert.ok((await call('/entry/export',{},proof,b.id)).status>=400);
  await d.withFamily(a.id,async(tx,f)=>{f.guardian.noticeVersion='earlier-notice';tx.set(d.path(a.id),f);});
  await mutate('platform','platform',{invitations:false,participation:false,stop:true,monthlyCents:100});
  assert.equal((await call('/entry/export',{},proof)).status,200,'Privacy access does not renew participation or processing notices.');
  await release(); // A new case must not inherit the earlier export-only proof.
  assert.equal((await call('/entry/export',{},proof)).status,403);
  const fresh=await call('/entry/privacy-export-unlock',{parentPassphrase:parent});assert.equal(fresh.status,200);
  const freshProof=a.cookies+'; '+cookieHeader(fresh.cookies);
  await d.withFamily(a.id,async(tx,f)=>{f.request!.approvedAt=Date.now()-86400001;tx.set(d.path(a.id),f);});
  assert.equal((await call('/entry/export',{},freshProof)).status,403);
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent})).status,403);
  await release();
  await d.withFamily(a.id,async(tx,f)=>{delete f.guardian.receiptDigest;tx.set(d.path(a.id),f);});
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent})).status,403);
  await d.withFamily(a.id,async(tx,f)=>{f.guardian.receiptDigest='synthetic-restored-receipt';tx.set(d.path(a.id),f);});
  await mutate('revoke-device',a.id,{deviceId:session.deviceId});
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent})).status,401);
  assert.equal((await call('/entry/export',{},freshProof)).status,401);
  await mutate('revoke',a.id);
  assert.equal((await call('/entry/privacy-export-unlock',{parentPassphrase:parent})).status,403);
  assert.equal((await call('/privacy-export')).status,403);
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
