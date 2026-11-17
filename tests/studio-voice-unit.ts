import assert from 'node:assert/strict';
import {installStudioVoice} from '../src/studio/voice';

class Button {
  textContent='';hidden=false;disabled=false;onclick:(()=>void)|null=null;
  attrs:Record<string,string>={};
  setAttribute(k:string,v:string){this.attrs[k]=v;}
}
class Status {textContent='';}
let active:FakeRecognition|null=null,mode:'available'|'downloadable'|'unavailable'='available';
let starts=0,stops=0,scope='child-a:game-one',allowed=true;
let delayedAvailability=false,finishAvailability:((value:'available')=>void)|null=null;
function releaseAvailability(){const release=finishAvailability;if(!release)throw Error('Missing delayed speech result');release('available');}
const spoken:string[]=[];
class FakeRecognition {
  static async available(options:{langs:string[];processLocally:boolean}){
    assert.deepEqual(options,{langs:['en-US'],processLocally:true});
    if(delayedAvailability)return await new Promise<'available'>(resolve=>{finishAvailability=resolve;});
    return mode;
  }
  static async install(options:{processLocally:boolean}){
    assert.equal(options.processLocally,true);mode='available';return true;
  }
  lang='';continuous=true;interimResults=false;processLocally=false;
  onresult:((event:any)=>void)|null=null;onerror:((event:any)=>void)|null=null;onend:(()=>void)|null=null;
  constructor(){active=this;}
  start(){starts++;}
  abort(){stops++;this.onend?.();}
}
const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
const savedUtterance=Object.getOwnPropertyDescriptor(globalThis,'SpeechSynthesisUtterance');
(globalThis as any).window={
  SpeechRecognition:FakeRecognition,
  speechSynthesis:{
    getVoices:()=>[{name:'Local English',lang:'en-US',localService:true}],
    speak:(utterance:any)=>spoken.push(utterance.text),
    cancel:()=>{}
  }
};
(globalThis as any).SpeechSynthesisUtterance=class {
  voice:any=null;lang='';rate=1;
  constructor(public text:string){}
};
function current(){if(!active)throw Error('Recognition did not start');return active;}
async function run(){
  const microphone=new Button(),installPack=new Button(),hearReply=new Button(),status=new Status();
  const transcripts:string[]=[];
  let deliverFirstReply:(()=>void)|undefined;
  const voice=installStudioVoice({
    microphone:microphone as unknown as HTMLButtonElement,
    installPack:installPack as unknown as HTMLButtonElement,
    hearReply:hearReply as unknown as HTMLButtonElement,
    status:status as unknown as HTMLElement,
    scope:()=>scope,canListen:()=>allowed,
    onTranscript:message=>{transcripts.push(message);if(message.includes('spaghetti'))deliverFirstReply?.();}
  });
  deliverFirstReply=()=>voice.reply('Would the spaghetti be a funny surprise?');
  assert.equal(microphone.attrs['aria-pressed'],'false');
  assert.equal(hearReply.disabled,true);

  await voice.listen();
  assert.equal(starts,1);
  assert.equal(current().processLocally,true,'microphone must require local processing');
  assert.equal(microphone.attrs['aria-pressed'],'true');
  current().onresult?.({results:[{isFinal:true,0:{transcript:'What if the dragon sneezes spaghetti?'}}]});
  current().onend?.();
  await Promise.resolve();
  assert.deepEqual(transcripts,['What if the dragon sneezes spaghetti?']);
  assert.equal(microphone.attrs['aria-pressed'],'false');
  assert.deepEqual(spoken,['Would the spaghetti be a funny surprise?'],'a spoken child turn may receive a verified local spoken reply');
  assert.equal(hearReply.disabled,false);
  voice.cancel();assert.equal(hearReply.disabled,true,'a previous child reply must not survive navigation');

  await voice.listen();assert.equal(starts,2);
  current().onresult?.({results:[{isFinal:true,0:{transcript:'Secret from another child'}}]});
  scope='child-b:game-two';current().onend?.();
  await Promise.resolve();
  assert.equal(transcripts.length,1,'late voice from another player must not cross profiles');
  await Promise.resolve();
  voice.reply('A typed turn should not be spoken automatically');
  assert.deepEqual(spoken,['Would the spaghetti be a funny surprise?']);
  voice.cancel();

  await voice.listen();
  assert.equal(starts,3);
  current().onresult?.({results:[{isFinal:true,0:{transcript:'Do not send this'}}]});
  current().onerror?.({error:'not-allowed'});current().onend?.();
  await Promise.resolve();
  assert.equal(transcripts.length,1,'permission failure must not submit a transcript');

  await voice.listen();
  assert.equal(starts,4);
  voice.cancel();
  assert.ok(stops>=1,'stop revokes the active microphone');
  assert.equal(microphone.attrs['aria-pressed'],'false');

  allowed=false;
  await voice.listen();assert.equal(starts,4,'learning/activity lock prevents microphone');
  allowed=true;
  // A late speech-support answer cannot bypass a learning overlay or navigation.
  delayedAvailability=true;
  const pendingListen=voice.listen();
  await Promise.resolve();
  allowed=false;
  releaseAvailability();
  await pendingListen;
  assert.equal(starts,4,'a stale availability answer must not activate the microphone');
  assert.match(status.textContent,/Finish your current activity/);
  allowed=true;delayedAvailability=false;
  mode='downloadable';
  await voice.listen();assert.equal(starts,4,'do not start microphone before local speech pack');
  assert.equal(installPack.hidden,false);
  installPack.onclick?.();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(status.textContent,/installed/);
  await voice.listen();assert.equal(starts,5,'on-device pack enables voice');

  voice.cancel();
  (window as any).SpeechRecognition=class {
    processLocally=false;start(){throw Error('Must never use off-device recognition');}
  };
  await voice.listen();assert.match(status.textContent,/not supported/);

  (window as any).SpeechRecognition=FakeRecognition;
  (window as any).speechSynthesis.getVoices=()=>[{lang:'en-US',localService:false}];
  const speechCount=spoken.length;
  voice.reply('Another reply');
  hearReply.onclick?.();
  assert.equal(spoken.length,speechCount,'off-device text-to-speech is not permitted');
  console.log('PASS local-only microphone, child speech -> chat, spoken reply, stop, profile isolation, microphone denial, local pack and off-device refusal');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
  if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else delete (globalThis as any).window;
  if(savedUtterance)Object.defineProperty(globalThis,'SpeechSynthesisUtterance',savedUtterance);else delete (globalThis as any).SpeechSynthesisUtterance;
});
