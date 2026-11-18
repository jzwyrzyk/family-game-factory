import assert from 'node:assert/strict';
import {installStudioPrivateSpeech} from '../src/studio/private-speech';

class Button {
 hidden=false;textContent='';onclick:(()=>void)|null=null;attrs:Record<string,string>={};
 setAttribute(k:string,v:string){this.attrs[k]=v;}
}
class Status {textContent='';}
let mediaStarts=0,trackStops=0,captureAllowed=true,availability=true,scope='player:game-one';
let learning=false,privateUploads=0,drafts:string[]=[];
let resolveTranscript:((text:string)=>void)|undefined;
const audio=new Uint8Array(150);audio.set([0x1a,0x45,0xdf,0xa3],0);
const saved=new Map<string,PropertyDescriptor|undefined>();
for(const key of ['window','navigator','document'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
const windowEvents=new Map<string,()=>void>(),documentEvents=new Map<string,()=>void>();
class FakeRecorder {
 state='inactive';mimeType='audio/webm;codecs=opus';ondataavailable:((event:{data:Blob})=>void)|null=null;
 onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
 static isTypeSupported(type:string){return type==='audio/webm;codecs=opus';}
 constructor(_stream:MediaStream,options:{mimeType:string}){assert.equal(options.mimeType,this.mimeType);}
 start(){mediaStarts++;this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([audio],{type:this.mimeType})});this.onstop?.();}
}
const stream={getTracks:()=>[{stop(){trackStops++;}}]};
Object.defineProperty(globalThis,'window',{configurable:true,value:{
 MediaRecorder:FakeRecorder,addEventListener:(name:string,cb:()=>void)=>windowEvents.set(name,cb)
}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
 mediaDevices:{getUserMedia:async()=>{if(!captureAllowed)throw Error('PERMISSION_DENIED');return stream;}}
}});
Object.defineProperty(globalThis,'document',{configurable:true,value:{
 hidden:false,addEventListener:(name:string,cb:()=>void)=>documentEvents.set(name,cb)
}});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
let count=0;async function test(name:string,fn:()=>Promise<void>){
 await fn();count++;console.log('PASS '+name);
}
async function main(){
 const button=new Button(),status=new Status();
 const speech=installStudioPrivateSpeech({
  button:button as unknown as HTMLButtonElement,status:status as unknown as HTMLElement,
  scope:()=>scope,canListen:()=>!learning,
  available:async()=>availability,
  transcribe:async(blob,signal)=>{
   privateUploads++;assert.equal(blob.type,'audio/webm;codecs=opus');
   assert.ok(blob.size>=100&&blob.size<=320000);
   return new Promise<string>((resolve,reject)=>{
    resolveTranscript=resolve;signal.addEventListener('abort',()=>reject(Error('ABORTED')),{once:true});
   });
  },
  onTranscript:async text=>{drafts.push(text);},
  onRecordingStart:()=>{}
 });
 await test('opt-in private mic starts hidden and only appears after approved status',async()=>{
  assert.equal(button.hidden,true);
  await speech.refresh();assert.equal(button.hidden,false);
  assert.equal(button.attrs['aria-pressed'],'false');
 });
 await test('guardian revocation after status display denies microphone at the moment of tap',async()=>{
  availability=false;
  button.onclick?.();await tick();
  assert.equal(mediaStarts,0,'no audio capture after live permission withdrawal');
  assert.equal(privateUploads,0);
  assert.equal(button.hidden,true);
  availability=true;await speech.refresh();assert.equal(button.hidden,false);
 });
 await test('explicit tap records one thought; transcription enters editable draft only',async()=>{
  button.onclick?.();await tick();
  assert.equal(mediaStarts,1);assert.equal(button.attrs['aria-pressed'],'true');
  assert.match(status.textContent,/recording/);
  button.onclick?.();await tick();assert.equal(trackStops,1);
  assert.equal(privateUploads,1);
  resolveTranscript?.('The dragon sneezes spaghetti!');await tick();
  assert.deepEqual(drafts,['The dragon sneezes spaghetti!']);
  assert.match(status.textContent,/Send to jems/);
 });
 await test('profile switch aborts request and prevents late child transcript',async()=>{
  button.onclick?.();await tick();button.onclick?.();await tick();
  assert.equal(privateUploads,2);
  scope='other-player:game-two';speech.cancel();
  resolveTranscript?.('Private words from another child');await tick();
  assert.equal(drafts.length,1);
 });
 await test('active learning guard blocks audio and the private mic cannot open again',async()=>{
  learning=true;await speech.refresh();assert.equal(button.hidden,true);
  button.onclick?.();await tick();assert.equal(mediaStarts,2);
  learning=false;scope='player:game-one';availability=false;
  await speech.refresh();assert.equal(button.hidden,true);
  button.onclick?.();await tick();assert.equal(mediaStarts,2);
 });
 await test('permission denial cannot send audio or leave a microphone open',async()=>{
  availability=true;captureAllowed=false;await speech.refresh();
  button.onclick?.();await tick();
  assert.equal(mediaStarts,2);assert.equal(privateUploads,2);
  assert.match(status.textContent,/permission/);
  captureAllowed=true;
 });
 await test('pagehide and background tab release active private recording',async()=>{
  await speech.refresh();button.onclick?.();await tick();
  assert.equal(mediaStarts,3);windowEvents.get('pagehide')?.();
  assert.equal(button.attrs['aria-pressed'],'false');
  assert.ok(trackStops>=3);
  await speech.refresh();button.onclick?.();await tick();
  (globalThis as any).document.hidden=true;documentEvents.get('visibilitychange')?.();
  assert.equal(button.attrs['aria-pressed'],'false');
  assert.ok(trackStops>=4);
 });
 assert.equal(drafts.length,1,'no cross-child audio transcript; no automatic chat turn or build');
 console.log(count+' private voice interaction tests passed; no live microphone or cloud STT was used.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
});
