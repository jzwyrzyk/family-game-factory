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
const spoken:string[]=[];
class FakeRecognition {
  static async available(options:{langs:string[];processLocally:boolean}){
    assert.deepEqual(options,{langs:['en-US'],processLocally:true});
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
async function run(){
  const microphone=new Button(),installPack=new Button(),hearReply=new Button(),status=new Status();
  const transcripts:string[]=[];
  const voice=installStudioVoice({
    microphone:microphone as unknown as HTMLButtonElement,
    installPack:installPack as unknown as HTMLButtonElement,
    hearReply:hearReply as unknown as HTMLButtonElement,
    status:status as unknown as HTMLElement,
    scope:()=>scope,canListen:()=>allowed,
    onTranscript:message=>{transcripts.push(message);}
  });
  assert.equal(microphone.attrs['aria-pressed'],'false');
  assert.equal(hearReply.disabled,true);

  await voice.listen();
  assert.equal(starts,1);
  assert.equal(active?.processLocally,true,'microphone must require local processing');
  assert.equal(microphone.attrs['aria-pressed'],'true');
  active!.onresult?.({results:[{isFinal:true,0:{transcript:'What if the dragon sneezes spaghetti?'}}]});
  active!.onend?.();
  await Promise.resolve();
  assert.deepEqual(transcripts,['What if the dragon sneezes spaghetti?']);
  assert.equal(microphone.attrs['aria-pressed'],'false');
  voice.reply('Would the spaghetti be a funny surprise?');
  assert.deepEqual(spoken,['Would the spaghetti be a funny surprise?'],'a spoken child turn may receive a verified local spoken reply');
  assert.equal(hearReply.disabled,false);

  await voice.listen();assert.equal(starts,2);
  active!.onresult?.({results:[{isFinal:true,0:{transcript:'Secret from another child'}}]});
  scope='child-b:game-two';active!.onend?.();
  await Promise.resolve();
  assert.equal(transcripts.length,1,'late voice from another player must not cross profiles');
  voice.cancel();

  await voice.listen();
  assert.equal(starts,3);
  active!.onresult?.({results:[{isFinal:true,0:{transcript:'Do not send this'}}]});
  active!.onerror?.({error:'not-allowed'});active!.onend?.();
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
