/**
 * Optional, parent-authorized PRIVATE speech fallback for tablets without
 * verified browser on-device recognition. Entirely dormant unless the gateway
 * explicitly reports a separately reviewed/consented private STT service.
 *
 * No always-on microphone, playback recording, file upload, localStorage,
 * service-worker cache, audio analytics, or silent provider switch. The
 * child explicitly chooses Speak and reviews the draft before pressing Send.
 */
interface RecorderChunkEvent { data:Blob }
interface RecorderLike {
 state:string;mimeType:string;
 ondataavailable:((event:RecorderChunkEvent)=>void)|null;
 onstop:(()=>void)|null;onerror:(()=>void)|null;
 start(timeslice?:number):void;stop():void;
}
interface RecorderCtor {
 new(stream:MediaStream,options:{mimeType:string}):RecorderLike;
 isTypeSupported(mime:string):boolean;
}
export interface PrivateSpeechHooks {
 button:HTMLButtonElement;status:HTMLElement;
 scope:()=>string;canListen:()=>boolean;
 available:(signal:AbortSignal)=>Promise<boolean>;
 transcribe:(blob:Blob,signal:AbortSignal)=>Promise<string>;
 onTranscript:(message:string)=>void|Promise<void>;
 onRecordingStart?():void;
 onAvailability?(ready:boolean):void;
}
export function installStudioPrivateSpeech(h:PrivateSpeechHooks){
 let allowUntil=0,allowedScope='',seq=0,approved=false,finishing=false;
 let stream:MediaStream|null=null,recorder:RecorderLike|null=null;
 let chunks:Blob[]=[],bytes=0,timeout:ReturnType<typeof setTimeout>|undefined;
 let request:AbortController|null=null,recording=false;
 const status=(text:string)=>{h.status.textContent=text;};
 const button=(active:boolean)=>{
  h.button.setAttribute('aria-pressed',String(active));
  h.button.textContent=active?(finishing?'Cancel transcription':'■ Finish speaking'):'🎙 Speak';
 };
 const mime=()=>{
  const Ctor=(window as any).MediaRecorder as RecorderCtor|undefined;
  if(!Ctor||typeof Ctor.isTypeSupported!=='function')return '';
  return ['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/ogg;codecs=opus'].find(type=>Ctor.isTypeSupported(type))||'';
 };
 function cleanup(){
  clearTimeout(timeout);timeout=undefined;
  for(const track of stream?.getTracks()||[])try{track.stop();}catch{/* device already stopped */}
  stream=null;recorder=null;chunks=[];bytes=0;recording=false;finishing=false;button(false);
 }
 function cancel(){
  seq++;request?.abort();request=null;
  const active=recorder;
  active&&(active.onstop=null);
  try{if(active?.state==='recording')active.stop();}catch{/* already stopped */}
  cleanup();
 }
 async function refresh(){
  if(recording||request)return;
  const at=++seq,scope=h.scope(),controller=new AbortController();
  if(!scope||!h.canListen()){
   approved=false;h.button.hidden=true;h.onAvailability?.(false);return;
  }
  try{
   const access=await h.available(AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]));
   if(at!==seq||h.scope()!==scope||!h.canListen())return;
   approved=access===true;allowedScope=scope;allowUntil=Date.now()+30000;
   h.button.hidden=!approved||!mime();h.onAvailability?.(!h.button.hidden);
  }catch{if(at===seq){approved=false;h.button.hidden=true;h.onAvailability?.(false);}}
 }
 async function begin(){
  if(!h.canListen()){status('Finish the current learning activity first.');return;}
  const scope=h.scope();
  if(!approved||allowedScope!==scope||Date.now()>allowUntil){
   status('Private voice needs approval. Ask a grown-up, then try again.');
   void refresh();return;
  }
  const selectedMime=mime();
  if(!selectedMime||!navigator.mediaDevices?.getUserMedia){
   status('Private speech recording is unavailable on this device. You can type or use keyboard dictation.');return;
  }
  const current=++seq;
  try{
   // Cached UI visibility is not authorization. Check the live family scope
   // immediately before requesting microphone access; revocation must win.
   const fresh=await h.available(AbortSignal.timeout(5000));
   if(current!==seq||scope!==h.scope()||!h.canListen())return;
   if(fresh!==true){
    approved=false;h.button.hidden=true;h.onAvailability?.(false);
    status('Private speech permission is no longer active. Nothing was recorded.');
    return;
   }
   allowUntil=Date.now()+30000;
   h.onRecordingStart?.();
   const media=await navigator.mediaDevices.getUserMedia({video:false,
    audio:{echoCancellation:true,noiseSuppression:true}});
   if(current!==seq||scope!==h.scope()||!h.canListen()){
    for(const t of media.getTracks())t.stop();return;
   }
   const Recorder=(window as any).MediaRecorder as RecorderCtor;
   let next:RecorderLike;
   try{next=new Recorder(media,{mimeType:selectedMime});}
   catch{media.getTracks().forEach(t=>t.stop());status('Recording is not supported on this device.');return;}
   stream=media;recorder=next;recording=true;finishing=false;chunks=[];bytes=0;button(true);
   status('Recording this one thought. Tap Finish speaking to review your words. Nothing is sent to jems yet.');
   next.ondataavailable=event=>{
    if(current!==seq||recorder!==next)return;
    if(event.data.size){bytes+=event.data.size;if(bytes>320000){cancel();status('Recording is too large. Try a shorter sentence.');return;}chunks.push(event.data);}
   };
   next.onerror=()=>{if(current!==seq)return;cancel();status('The microphone stopped. Nothing was sent.');};
   next.onstop=()=>{if(current!==seq||recorder!==next)return;
    const blob=new Blob(chunks,{type:selectedMime}),captured=scope;cleanup();
    if(blob.size<100||blob.size>320000){status('Could not hear a short sentence. Nothing was sent.');return;}
    const controller=new AbortController();request=controller;
    h.button.textContent='Cancel transcription';h.button.setAttribute('aria-pressed','false');
    status('Transcribing through the parent-approved private speech service…');
    void h.transcribe(blob,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]))
     .then(async text=>{
      if(current!==seq||captured!==h.scope()||!h.canListen())return;
      if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('INVALID_TRANSCRIPT');
      status('Words ready. Edit them, then choose Send to jems.');
      await h.onTranscript(text);
     }).catch(()=>{
      if(current===seq)status('Private speech could not finish. No new message was sent. You can type instead.');
     }).finally(()=>{if(request===controller){request=null;button(false);}});
   };
   next.start(300);
   timeout=setTimeout(()=>{if(current===seq&&recording)finish();},12000);
  }catch{
   if(current===seq){cleanup();status('Microphone permission was not granted or this device cannot record.');}
  }
 }
 function finish(){
  if(!recorder||!recording)return;
  if(finishing){cancel();status('Transcription canceled. Your draft is unchanged.');return;}
  finishing=true;button(true);
  try{recorder.stop();}catch{cancel();status('Recording stopped. No message was sent.');}
 }
 h.button.hidden=true;button(false);
 if(typeof window.addEventListener==='function')window.addEventListener('pagehide',cancel);
 if(typeof document!=='undefined'&&typeof document.addEventListener==='function')
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 h.button.onclick=()=>{if(recording)finish();else if(request){cancel();status('Transcription canceled.');}else void begin();};
 return {refresh,cancel,active:()=>recording||!!request};
}
