import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import {createPrivateNarration} from '../src/speech/private-narration';
import type {BuilderConfig} from '../src/builder/client';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const config:BuilderConfig={version:1,mode:'remote',apiBaseUrl:'https://gateway.test',previewOrigin:'https://preview.test'};
const audio=()=>{const bytes=new Uint8Array(200);bytes.set([0x49,0x44,0x33]);return bytes;};
const ok=()=>new Response(JSON.stringify({available:true,mode:'natural'}));
test('unconfigured or unapproved natural reading sends no text and no synthesis POST',async()=>{
 let posts=0,gets=0;
 globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;else gets++;return new Response(JSON.stringify({available:false,mode:'unavailable'}));};
 const local=createPrivateNarration(()=>({version:1,mode:'unavailable'}),()=> 'first');
 assert.equal(await local.available(new AbortController().signal),false);assert.equal(gets,0);
 const remote=createPrivateNarration(()=>config,()=> 'first');
 assert.equal(await remote.available(new AbortController().signal),false);
 await assert.rejects(remote.read('Read this.',new AbortController().signal),/NARRATION_UNAVAILABLE/);assert.equal(posts,0);
});
test('one reading tap uses approved status, existing authenticated session check and one bounded audio POST',async()=>{
 const requests:Array<{url:string;method:string;body?:string}>=[];
 globalThis.fetch=async(url,init)=>{
  requests.push({url:String(url),method:init?.method||'GET',body:init?.body as string|undefined});
  if(String(url).endsWith('/narration/status'))return ok();
  if(String(url).endsWith('/sessions/status'))return new Response('{"connected":true}');
  assert.equal(String(url),'https://gateway.test/v1/coach/narration');
  assert.equal(init?.credentials,'include');assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));assert.equal(body.text,'Read this.');assert.match(body.id,/^[a-f\d-]{36}$/);
  return new Response(audio(),{headers:{'Content-Type':'audio/mpeg'}});
 };
 const client=createPrivateNarration(()=>config,()=> 'first'),signal=new AbortController().signal;
 assert.equal(await client.available(signal),true);const result=await client.read('Read this.',signal);
 assert.equal(result.type,'audio/mpeg');assert.equal(result.size,200);
 assert.deepEqual(requests.map(r=>r.method),['GET','GET','POST']);
 assert.ok(requests.filter(r=>r.method==='GET').every(r=>r.body===undefined));
 await assert.rejects(client.read('Read this.',signal),/NARRATION_UNAVAILABLE/);
 assert.equal(requests.filter(r=>r.method==='POST').length,1,'an admitted request is never automatically replayed');
});
test('a profile change during status or before synthesis cannot send the previous child text',async()=>{
 let owner='first',posts=0;
 globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;owner='second';return ok();};
 const client=createPrivateNarration(()=>config,()=>owner),signal=new AbortController().signal;
 assert.equal(await client.available(signal),false);
 await assert.rejects(client.read('Old child text.',signal),/NARRATION_UNAVAILABLE/);assert.equal(posts,0);
 globalThis.fetch=async()=>ok();assert.equal(await client.available(signal),true);owner='third';
 await assert.rejects(client.read('Old child text.',signal),/NARRATION_UNAVAILABLE/);assert.equal(posts,0);
});
test('failed synthesis consumes client admission and never retries a paid POST',async()=>{
 let posts=0;globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/narration/status'))return ok();
  if(String(url).endsWith('/sessions/status'))return new Response('{"connected":true}');
  if(init?.method==='POST')posts++;return new Response('{}',{status:503});
 };
 const client=createPrivateNarration(()=>config,()=> 'first'),signal=new AbortController().signal;
 assert.equal(await client.available(signal),true);await assert.rejects(client.read('Read this.',signal),/NARRATION_UNAVAILABLE/);
 await assert.rejects(client.read('Read this.',signal),/NARRATION_UNAVAILABLE/);assert.equal(posts,1);
});
test('overlong text is rejected intact before POST rather than silently truncated',async()=>{
 let posts=0;globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')posts++;return ok();};
 const client=createPrivateNarration(()=>config,()=> 'first'),signal=new AbortController().signal;
 assert.equal(await client.available(signal),true);
 await assert.rejects(client.read('x'.repeat(2001),signal),/NARRATION_UNAVAILABLE/);assert.equal(posts,0);
});
