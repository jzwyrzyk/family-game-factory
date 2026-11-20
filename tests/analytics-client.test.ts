import test from 'node:test';
import assert from 'node:assert/strict';
import {ProductAnalyticsClient} from '../src/analytics/client';
import {ANALYTICS_NOTICE_VERSION,type AnalyticsStatus} from '../src/analytics/contract';
import {BuilderClient,type BuilderConfig} from '../src/builder/client';

const choiceId='11111111-1111-4111-8111-111111111111';
const config:BuilderConfig={version:1,mode:'remote',apiBaseUrl:'https://gateway.example',previewOrigin:'https://preview.example',analytics:{version:1,enabled:true}};
const details={ownerId:'profile-a',creationId:'idea-a',creationMode:'generated' as const,surface:'studio' as const};
function harness(){
  let owner='profile-a',version=0,now=1_000_000;
  let status:AnalyticsStatus={enabled:true,permitted:true,audience:'child',noticeVersion:ANALYTICS_NOTICE_VERSION,status:'enabled',choiceId,expiresAt:now+86_400_000};
  let responseCode=202;
  const requests:Array<{url:string;init:RequestInit}>=[];
  let intercept:((url:string,init:RequestInit)=>Promise<Response>)|undefined;
  const client=new ProductAnalyticsClient({owner:()=>owner,adult:()=>null,sessionVersion:()=>version,now:()=>now,
    uuid:()=>crypto.randomUUID(),fetch:async(url,init)=>{requests.push({url,init});if(intercept)return intercept(url,init);return new Response(JSON.stringify(url.endsWith('/status')?status:{}),{status:url.endsWith('/status')?200:responseCode});}});
  return {client,requests,setOwner(value:string){owner=value;version++;},setNow(value:number){now=value;},setStatus(value:Partial<AnalyticsStatus>){status={...status,...value};},fail(code:number){responseCode=code;},intercept(fn:typeof intercept){intercept=fn;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('unconfigured/default-off analytics makes no requests or build context',async()=>{
  const h=harness();h.client.configure({...config,analytics:undefined});
  h.client.track('jems_journey_started',details);await h.client.refresh();await settle();
  assert.equal(h.requests.length,0);assert.equal(h.client.buildContext('profile-a','idea-a'),undefined);
});
test('throwing optional status observers cannot fail application setup or collection',async()=>{
  const requests:string[]=[];
  const client=new ProductAnalyticsClient({owner:()=>details.ownerId,adult:()=>null,sessionVersion:()=>0,now:()=>1000,
    uuid:()=>crypto.randomUUID(),changed:()=>{throw Error('broken optional UI');},fetch:async url=>{
      requests.push(url);return new Response(JSON.stringify({enabled:true,permitted:true,audience:'child',noticeVersion:ANALYTICS_NOTICE_VERSION,
        status:'enabled',choiceId,expiresAt:100000}),{status:200});}});
  assert.doesNotThrow(()=>client.configure(config));await client.refresh();client.track('jems_journey_started',details);await settle();
  assert.equal(requests.filter(url=>url.endsWith('/events')).length,1);assert.doesNotThrow(()=>client.pause());
});
test('builder attempts retain the same permitted creation context across explicit failed-job retry',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();
  const builder=new BuilderClient(config,()=>{}),requests:any[]=[];
  builder.api=async(path,body)=>{assert.equal(path,'/v1/jobs');requests.push(body);return {jobId:'job-'+requests.length,status:'failed'};};
  const analytics=h.client.buildContext(details.ownerId,details.creationId)!;
  await builder.submit({gameId:'new',baseRevisionId:null,prompt:'A synthetic game idea',analytics});await builder.retry();
  assert.deepEqual(requests[0].analytics,analytics);assert.deepEqual(requests[1].analytics,analytics);
  assert.notEqual(requests[1].clientRequestId,requests[0].clientRequestId);assert.equal(requests[1].retryOf,'job-1');
  assert.equal(Object.hasOwn(analytics,'prompt'),false);
});
test('pending separate consent permits no capture or context',async()=>{
  const h=harness();h.setStatus({permitted:false,status:'pending'});h.client.configure(config);await h.client.refresh();
  h.client.track('jems_journey_started',details);await settle();
  assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,0);
  assert.equal(h.client.buildContext('profile-a','idea-a'),undefined);
});
test('explicit observations bind owner/choice and never export free text',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();
  h.client.track('jems_journey_started',details);
  h.client.track('jems_journey_started',{...details,prompt:'private child idea'} as any);
  h.client.track('jems_journey_started',{...details,ownerId:'profile-b'});
  await settle();
  const posts=h.requests.filter(x=>x.url.endsWith('/events'));assert.equal(posts.length,1);
  const body=JSON.parse(String(posts[0].init.body));assert.equal(body.events.length,1);
  assert.equal(body.events[0].choiceId,choiceId);assert.equal(body.events[0].creationId,'idea-a');
  assert.equal(String(posts[0].init.body).includes('private child idea'),false);
  assert.equal(posts[0].init.keepalive,undefined);assert.equal(posts[0].init.redirect,'error');
  assert.deepEqual(h.client.buildContext('profile-a','idea-a'),{schemaVersion:1,choiceId,ownerId:'profile-a',creationId:'idea-a'});
});
test('profile change drops pending observations rather than sending as another child',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();
  h.client.track('jems_journey_started',details);h.setOwner('profile-b');h.client.reset();await settle();
  assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,0);
});
test('profile change cancels in-flight capture and stale status cannot authorize replacement profile',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();
  let signal:AbortSignal|undefined;
  h.intercept(async(_url,init)=>{signal=init.signal as AbortSignal;return new Promise<Response>((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(Error('aborted'))));});
  h.client.track('jems_journey_started',details);await settle();h.setOwner('profile-b');h.client.reset();await settle();
  assert.equal(signal?.aborted,true);assert.equal(h.client.buildContext('profile-b','idea-b'),undefined);
});
test('collection failure never renews auth or retries and stops new observations',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();h.fail(403);
  h.client.track('jems_journey_started',details);await settle();h.client.track('jems_journey_started',details);await settle();
  assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,1);
  assert.equal(h.requests.some(x=>x.url.includes('/sessions/')),false);
});
test('bounded batch drops excess events without persistent queues',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();
  for(let i=0;i<100;i++)h.client.track('jems_journey_started',{...details,creationId:'idea-'+i});await settle();
  const posts=h.requests.filter(x=>x.url.endsWith('/events'));assert.equal(posts.length,1);
  assert.equal(JSON.parse(String(posts[0].init.body)).events.length,20);
});
test('expired consent sends nothing and no late opt-in backfills dropped actions',async()=>{
  const h=harness();h.setStatus({permitted:false,status:'not-requested'});h.client.configure(config);await h.client.refresh();
  h.client.track('jems_journey_started',details);h.setStatus({permitted:true,status:'enabled'});await h.client.refresh();await settle();
  assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,0);
  h.setNow(100_000_000);h.client.track('jems_journey_started',details);await settle();assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,0);
});
test('failed withdrawal keeps this tab paused through automatic status refresh',async()=>{
  const h=harness();h.client.configure(config);await h.client.refresh();h.client.pause();
  const count=h.requests.length;await h.client.refresh();h.client.track('jems_journey_started',details);await settle();
  assert.equal(h.requests.length,count);
  await h.client.resume();h.client.track('jems_journey_started',details);await settle();
  assert.equal(h.requests.filter(x=>x.url.endsWith('/events')).length,1);
});
