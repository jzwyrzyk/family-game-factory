import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import type {AddressInfo} from 'node:net';
import {processDeletion} from '../server/beta/erase';
import {betaFixture,fixtureKey} from './beta-fixture';
import {requirePlay} from '../server/beta/access';
import {signSession} from '../server/pipeline/auth';
import {familyOrigin} from '../server/beta/model';
import {betaRouter} from '../server/beta/router';

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
  runTransaction:async(fn:any)=>fn({get:async(ref:any)=>row(ref.path),set:(ref:any,value:any)=>records.set(ref.path,copy(value))})};
 const storage:any={bucket:()=>({getFiles:async({prefix,versions,autoPaginate,maxResults}:any)=>{assert.equal(versions,true);assert.equal(autoPaginate,false);listed.push(prefix);return [objects.filter(path=>path.startsWith(prefix)).slice(0,maxResults).map(name=>({name,metadata:{generation:'7'},delete:async({ifGenerationMatch}:any)=>{assert.equal(ifGenerationMatch,'7');deleted.push(name);objects.splice(objects.indexOf(name),1);}}))];}})};
 return {db,storage,deleted,listed,interrupt:(path:string)=>{failPath=path;}};
}

test('verified erasure waits for unsettled storage writes, then removes all scoped backup roots and tolerates retry',async()=>{
 const {d,enroll,mutate}=await betaFixture(),a=await enroll('privacy-completion');
 await mutate('request-deletion',a.id);const requestId=(await d.withFamily(a.id,async(_tx,f)=>f)).request!.id;
 await mutate('confirm-deletion',a.id,{requestId,receipt:'synthetic-approved-erasure'});
 const family=await d.withFamily(a.id,async(_tx,f)=>f),path=d.path(a.id),workspace=family.workspace;
 const metadata=['acknowledgments','metadata','usage','continuity','storage-consents','backup-scans'];
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
 const kinds=['storage-consents','backup-scans','backup-schedules','backup-operations'];
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
