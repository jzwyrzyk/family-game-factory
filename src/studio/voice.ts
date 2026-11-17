/**
 * Explicit tap-to-talk for a child-directed Studio.
 *
 * IMPORTANT: Some browser SpeechRecognition implementations upload audio to a
 * platform service. This adapter deliberately refuses those implementations:
 * it requires both an on-device availability check and processLocally=true.
 * No MediaRecorder, remote STT endpoint, raw audio, or persistent microphone
 * state is used. System-keyboard dictation remains a separate OS choice.
 */
type VoiceAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
interface RecognitionResult {isFinal:boolean;[index:number]:{transcript:string}}
interface RecognitionLike {
  lang:string;continuous:boolean;interimResults:boolean;processLocally?:boolean;
  onresult:((event:{results:ArrayLike<RecognitionResult>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  start():void;abort():void;
}
interface RecognitionCtor {
  new():RecognitionLike;
  available?(options:{langs:string[];processLocally:true}):Promise<VoiceAvailability>;
  install?(options:{langs:string[];processLocally:true}):Promise<boolean>;
}
export interface StudioVoiceOptions {
  microphone:HTMLButtonElement;installPack:HTMLButtonElement;hearReply:HTMLButtonElement;
  status:HTMLElement;scope:()=>string;canListen:()=>boolean;
  onTranscript:(text:string)=>void|Promise<void>;
}
export function installStudioVoice(ui:StudioVoiceOptions){
 let recognition:RecognitionLike|null=null;
 let generation=0,finalWords='',listening=false,failed=false;
 let spokenReply='',speakAfterVoice=false,voiceScope='';
 const getCtor=():RecognitionCtor|undefined=>(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
 const announce=(message:string)=>{ui.status.textContent=message;};
 const buttons=()=>{
  ui.microphone.textContent=listening?'■ Stop listening':'🎙 Speak';
  ui.microphone.setAttribute('aria-pressed',String(listening));
  ui.installPack.hidden=true;
 };
 const voiceOptions={langs:['en-US'],processLocally:true as const};
 function cancel(){
  generation++;speakAfterVoice=false;voiceScope='';finalWords='';spokenReply='';ui.hearReply.disabled=true;failed=true;
  const active=recognition;recognition=null;listening=false;buttons();
  try{active?.abort();}catch{/* The browser may already have stopped. */}
  try{window.speechSynthesis?.cancel();}catch{/* Speech output is optional. */}
 }
 async function listen(){
  if(recognition){cancel();announce('Microphone stopped. Nothing was sent.');return;}
  if(!ui.canListen()){announce('Finish your current activity before talking.');return;}
  // Avoid the coach's last spoken response being recognized as a new child turn.
  try{window.speechSynthesis?.cancel();}catch{/* Speech output is optional. */}
  speakAfterVoice=false;
  const Ctor=getCtor(),scope=ui.scope(),seq=++generation;
  if(!Ctor||typeof Ctor.available!=='function'){
   announce('Private on-device speech is not supported here. Tap the text box and use your device keyboard microphone, or type.');return;
  }
  announce('Checking for private on-device speech…');
  let availability:VoiceAvailability;
  try{availability=await Ctor.available(voiceOptions);}
  catch{announce('Could not check private speech support. You can use keyboard dictation or type.');return;}
  if(seq!==generation||scope!==ui.scope())return;
  if(availability==='downloadable'){
   ui.installPack.hidden=false;announce('An on-device English speech pack is available. Choose Install voice pack, then tap Speak.');return;
  }
  if(availability!=='available'){
   announce('On-device speech is not ready on this browser. You can use keyboard dictation or type.');return;
  }
  const next=new Ctor();
  if(!('processLocally' in next)){
   announce('This browser cannot guarantee private speech recognition. Use keyboard dictation or type.');return;
  }
  next.processLocally=true;next.lang='en-US';next.continuous=false;next.interimResults=true;
  next.onresult=event=>{
   if(seq!==generation||recognition!==next)return;
   const words:string[]=[];
   for(let i=0;i<event.results.length;i++){
    const item=event.results[i];if(item.isFinal)words.push(item[0]?.transcript||'');
   }
   finalWords=words.join(' ').trim().slice(0,2000);
   if(finalWords)announce('Heard you. Finishing your turn…');
  };
  next.onerror=event=>{
   if(seq!==generation)return;
   failed=true;
   const reason=event.error==='not-allowed'?'Microphone permission was not granted.':
    event.error==='no-speech'?'I did not hear words. Tap Speak to try again.':
    'Speech recognition stopped. Use keyboard dictation or type.';
   announce(reason);
  };
  next.onend=()=>{
   if(recognition!==next||seq!==generation)return;
   recognition=null;listening=false;buttons();
   const transcript=finalWords;finalWords='';
   if(failed||!transcript){if(!failed)announce('Nothing was sent. Tap Speak to try again.');return;}
   if(scope!==ui.scope()||!ui.canListen())return;
   voiceScope=scope;speakAfterVoice=true;
   announce('You said: '+transcript);
   try{void Promise.resolve(ui.onTranscript(transcript)).catch(()=>{
    speakAfterVoice=false;announce('Your message could not be sent. You can type instead.');
   });}catch{speakAfterVoice=false;announce('Your message could not be sent.');}
  };
  finalWords='';failed=false;recognition=next;listening=true;buttons();
  announce('Listening on this device. Speak one thought, then pause.');
  try{next.start();}
  catch{recognition=null;listening=false;buttons();announce('Could not start on-device speech. Use keyboard dictation or type.');}
 }
 async function installPack(){
  if(recognition||!ui.canListen())return;
  const Ctor=getCtor(),scope=ui.scope(),seq=++generation;
  if(typeof Ctor?.install!=='function'){announce('Voice pack installation is unavailable on this browser.');return;}
  announce('Installing a local speech language pack…');
  try{
   const installed=await Ctor.install(voiceOptions);
   if(seq!==generation||scope!==ui.scope())return;
   announce(installed?'Voice pack installed. Tap Speak to talk.':'Could not install the voice pack. You can type or use keyboard dictation.');
   ui.installPack.hidden=true;
  }catch{if(seq===generation)announce('Voice pack installation is unavailable. Use keyboard dictation or type.');}
 }
 function localVoice():SpeechSynthesisVoice|null {
  try{return window.speechSynthesis?.getVoices().find(v=>v.localService&&/^en(?:-|$)/i.test(v.lang))||null;}
  catch{return null;}
 }
 function speak(text:string){
  const voice=localVoice();
  if(!voice||typeof SpeechSynthesisUtterance==='undefined'){
   announce('This device has no verified local speaking voice. The coach reply is shown as text.');return;
  }
  try{
   const utterance=new SpeechSynthesisUtterance(text.slice(0,1800));utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=0.95;
   window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
  }catch{announce('Could not read this reply aloud. It is still shown as text.');}
 }
 function reply(text:string){
  spokenReply=text.slice(0,1800);ui.hearReply.disabled=!spokenReply;
  if(speakAfterVoice&&voiceScope===ui.scope())speak(spokenReply);
  speakAfterVoice=false;
 }
 ui.microphone.onclick=()=>{void listen();};
 ui.installPack.onclick=()=>{void installPack();};
 ui.hearReply.onclick=()=>{if(spokenReply)speak(spokenReply);};
 ui.hearReply.disabled=true;buttons();
 return {cancel,reply,listen};
}
