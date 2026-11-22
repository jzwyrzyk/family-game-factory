import assert from 'node:assert/strict';
import {test} from 'node:test';
import {metadataIdentityToken} from '../server/coach/private-bridge';
import {privateGoogleAccessToken} from '../server/coach/cloud-token';

const audience='https://factory-coach-private-fixture.run.app';
const identity='a'.repeat(40)+'.'+'b'.repeat(40)+'.'+'c'.repeat(40);
const access='x'.repeat(80);
const cases=[
 {name:'identity',max:12000,error:'COACH_UNAVAILABLE',read:(transport:typeof fetch,signal:AbortSignal)=>metadataIdentityToken(transport)(audience,signal)},
 {name:'access',max:4000,error:'AUDIO_PROVIDER_FAILED',read:(transport:typeof fetch,signal:AbortSignal)=>privateGoogleAccessToken(signal,transport)},
];
function chunks(parts:Uint8Array[],cancelled:()=>void=()=>{}){
 return new ReadableStream<Uint8Array>({start(controller){for(const part of parts)controller.enqueue(part);controller.close();},cancel:cancelled});
}
const bytes=(text:string)=>new TextEncoder().encode(text);

test('metadata tokens preserve exact request scopes and valid split UTF-8 responses',async()=>{
 const signal=new AbortController().signal;
 const id=await metadataIdentityToken(async(url,init)=>{
  assert.equal(String(url),'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience='+encodeURIComponent(audience)+'&format=full');
  assert.equal(init?.redirect,'error');assert.equal((init?.headers as any)['Metadata-Flavor'],'Google');assert.equal(init?.signal,signal);
  return new Response(chunks([bytes(identity.slice(0,47)),bytes(identity.slice(47))]));
 })(audience,signal);
 assert.equal(id,identity);
 const json=JSON.stringify({access_token:access,expires_in:3600,note:'é'}),data=bytes(json),split=data.indexOf(0xc3)+1;
 const token=await privateGoogleAccessToken(signal,async(url,init)=>{
  assert.equal(String(url),'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
  assert.equal(init?.redirect,'error');assert.equal((init?.headers as any)['Metadata-Flavor'],'Google');assert.equal(init?.signal,signal);
  return new Response(chunks([data.slice(0,split),data.slice(split)]));
 });
 assert.equal(token,access);
});

for(const item of cases){
 test(`${item.name} metadata rejects excessive declared size before reading the body`,async()=>{
  let cancelled=false,pulls=0;
  const body=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(bytes('secret-body'));},cancel(){cancelled=true;}});
  await assert.rejects(item.read(async()=>new Response(body,{headers:{'Content-Length':String(item.max+1)}}),new AbortController().signal),new RegExp(item.error));
  assert.equal(cancelled,true);assert.ok(pulls<=1,'an oversized declaration must not drain the response');
 });

 test(`${item.name} metadata streaming limit bounds responses without a length header`,async()=>{
  let cancelled=false,pulls=0;
  const body=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(Math.ceil(item.max/2)+1));},cancel(){cancelled=true;}});
  await assert.rejects(item.read(async()=>new Response(body),new AbortController().signal),new RegExp(item.error));
  assert.equal(cancelled,true);assert.ok(pulls<=3,'oversized streams stop without reading the remaining body');
 });

 test(`${item.name} metadata rejects malformed UTF-8 with a stable content-free error`,async()=>{
  await assert.rejects(item.read(async()=>new Response(chunks([new Uint8Array([0xc3])])),new AbortController().signal),error=>{
   assert.equal((error as Error).message,item.error);return true;
  });
 });

 test(`${item.name} metadata non-OK responses are cancelled without consuming provider details`,async()=>{
  let cancelled=false,pulls=0;
  const body=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(bytes('private-error-detail'));},cancel(){cancelled=true;}});
  await assert.rejects(item.read(async()=>new Response(body,{status:503}),new AbortController().signal),error=>{
   assert.equal((error as Error).message,item.error);return true;
  });
  assert.equal(cancelled,true);assert.ok(pulls<=1);
 });

 test(`${item.name} metadata cancellation closes a stalled read without awaiting stalled cleanup`,async()=>{
  let cancelled=false,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const cancel=new AbortController();
  const body=new ReadableStream<Uint8Array>({pull(){entered();},cancel(){cancelled=true;return new Promise(()=>{});}});
  const pending=item.read(async()=>new Response(body),cancel.signal);
  const rejected=assert.rejects(pending,new RegExp(item.error));
  await started;cancel.abort();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([rejected,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('token read did not cancel')),1000);})]);}
  finally{if(timeout)clearTimeout(timeout);}
  assert.equal(cancelled,true);
 });

 test(`${item.name} metadata performs no transport call after an already cancelled operation`,async()=>{
  let calls=0;const cancel=new AbortController();cancel.abort();
  await assert.rejects(item.read(async()=>{calls++;return new Response('unreachable');},cancel.signal));
  assert.equal(calls,0);
 });
}
