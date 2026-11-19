import assert from 'node:assert/strict';
import {test} from 'node:test';
import {familyFetch} from '../src/builder/session';
import {BuilderClient} from '../src/builder/client';
import {activateAdultSession,adultRequestSession,clearAdultSession} from '../src/adult-pilot/session';
import {profileStorage,setAdultWorkspace} from '../src/adult-pilot/storage';

const base='https://adult-api.example',profileId='adult:12345678-1234-4123-8123-123456789abc',token='a'.repeat(43);
const active=()=>({active:true,profileId,sessionToken:token,expiresAt:Date.now()+3_600_000});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function network(handler:(url:string,init:RequestInit)=>Promise<Response>|Response,run:()=>Promise<void>){
 const saved=globalThis.fetch;
 globalThis.fetch=(input,init={})=>Promise.resolve(handler(String(input),init));
 try{await run();}finally{clearAdultSession('test',false);globalThis.fetch=saved;setAdultWorkspace(null);}
}
test('adult profile attaches its memory proof to readiness and paid actions only at the matching API',async()=>{
 const seen:{url:string;proof:string|null}[]=[];
 await network((url,init)=>{
  seen.push({url,proof:new Headers(init.headers).get('X-Factory-Adult-Session')});
  return json(url.endsWith('/v1/sessions/status')?{connected:true,adultPilot:{active:true}}:{available:true});
 },async()=>{
  activateAdultSession(base,active());
  await familyFetch(base,'/v1/coach/status');
  await familyFetch(base,'/v1/coach',{method:'POST',body:'{}'});
  await familyFetch('https://other-api.example','/v1/coach/status');
  assert.equal(seen.find(x=>x.url===base+'/v1/coach/status')?.proof,token);
  assert.equal(seen.find(x=>x.url===base+'/v1/coach')?.proof,token);
  assert.equal(seen.at(-1)?.proof,null,'never forward the adult proof to a different API');
 });
});
test('a revoked adult status blocks the paid body before admission, even if family access is connected',async()=>{
 let paid=0;
 await network((url)=>{
  if(url.endsWith('/v1/sessions/status'))return json({connected:true,adultPilot:{active:false}});
  paid++;return json({ok:true});
 },async()=>{
  activateAdultSession(base,active());
  assert.equal((await familyFetch(base,'/v1/coach',{method:'POST',body:'adult context'})).status,403);
  assert.equal(paid,0);assert.equal(adultRequestSession(base),null);
 });
});
test('an old caller header cannot retain adult authority after the tab switches to a family profile',async()=>{
 let proof:string|null='not-checked';
 await network((_url,init)=>{proof=new Headers(init.headers).get('X-Factory-Adult-Session');return json({available:false});},async()=>{
  activateAdultSession(base,active());clearAdultSession('profile-switch',false);
  await familyFetch(base,'/v1/coach/status',{headers:{'X-Factory-Adult-Session':token}});
  assert.equal(proof,null);
 });
});
test('a builder disconnected after registering a revision cannot submit the old profile prompt',async()=>{
 let release!:(value:unknown)=>void,started!:(value:void)=>void;
 const reached=new Promise<void>(resolve=>{started=resolve;});let jobs=0;
 const client=new BuilderClient({version:1,mode:'remote',apiBaseUrl:base,previewOrigin:'https://preview.example'},()=>{});
 client.api=async path=>{
  if(path==='/v1/revisions'){started();return new Promise(resolve=>{release=resolve;});}
  jobs++;return {jobId:'unexpected',status:'failed'};
 };
 const work=client.submit({gameId:'gum',baseRevisionId:'old-child-base',prompt:'Child saved context',config:{gumBudget:12}});
 await reached;client.disconnect();release({revisionId:'seeded'});await work;
 assert.equal(jobs,0);
});
test('a child action waiting on preflight cannot acquire adult privileges when the profile changes',async()=>{
 let release!:(response:Response)=>void,paid=0;
 await network((url)=>{
  if(url.endsWith('/v1/sessions/status'))return new Promise<Response>(resolve=>{release=resolve;});
  paid++;return json({ok:true});
 },async()=>{
  const response=familyFetch(base,'/v1/coach',{method:'POST',body:'child saved context'});
  activateAdultSession(base,active());release(json({connected:true}));
  assert.equal((await response).status,409);assert.equal(paid,0);
 });
});
test('switching to a family profile aborts adult requests and suppresses a late provider reply',async()=>{
 let release!:(response:Response)=>void,signal:AbortSignal|null|undefined;
 await network((_url,init)=>{signal=init.signal;return new Promise<Response>(resolve=>{release=resolve;});},async()=>{
  activateAdultSession(base,active());const response=familyFetch(base,'/v1/coach/status');
  clearAdultSession('profile-switch',false);assert.equal(signal?.aborted,true);
  release(json({privateReply:'must not display'}));
  const result=await response;assert.equal(result.status,409);
  assert.deepEqual(await result.json(),{errorCode:'PROFILE_CHANGED'});
  assert.equal(adultRequestSession(base),null);
 });
});
test('invalid or expired unlock responses cannot activate a profile and rejection ends adult access',async()=>{
 for(const invalid of [{...active(),expiresAt:Date.now()-1},{...active(),profileId:'player1'},{...active(),sessionToken:'fake'},{...active(),expiresAt:Date.now()+7_200_000}])
  assert.throws(()=>activateAdultSession(base,invalid),/ADULT_SESSION_UNAVAILABLE/);
 await network(()=>json({errorCode:'ADULT_PILOT_ACCESS_REQUIRED'},403),async()=>{
  activateAdultSession(base,active());assert.equal((await familyFetch(base,'/v1/coach/status')).status,403);
  assert.equal(adultRequestSession(base),null);
 });
});
test('adult notebook and game data are stored separately and a fresh locked context reads only family data',()=>{
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}} as Storage;
 const scoped=profileStorage(storage);
 scoped.setItem('notebook','child draft');setAdultWorkspace(profileId);
 assert.equal(scoped.getItem('notebook'),null);scoped.setItem('notebook','adult test');
 assert.equal(values.get('notebook'),'child draft');setAdultWorkspace(null);
 assert.equal(scoped.getItem('notebook'),'child draft');
 assert.equal([...values.values()].includes(token),false);
});
