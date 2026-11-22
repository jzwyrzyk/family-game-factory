import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {chooseFriendlyVoice, createFriendlyNarrator, stopReadAloud,
  configureNaturalNarration, FRIENDLY_READING_PITCH, FRIENDLY_READING_RATE, VOICE_LOADING_TIMEOUT_MS} from '../src/speech/friendly-narrator';

const voice = (name: string, lang = 'en-US', localService = true): SpeechSynthesisVoice =>
  ({name, lang, localService, voiceURI: name, default: false});
class Utterance {
  voice: SpeechSynthesisVoice | null = null; lang = ''; rate = 1; pitch = 1;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: ((event?: {error: string}) => void) | null = null;
  constructor(public text: string) {}
}
class Synth extends EventTarget {
  voices: SpeechSynthesisVoice[] = []; spoken: Utterance[] = []; cancellations = 0;
  getVoices() { return this.voices; }
  speak(utterance: Utterance) { this.spoken.push(utterance); }
  cancel() { this.cancellations++; }
  load(voices: SpeechSynthesisVoice[]) { this.voices = voices; this.dispatchEvent(new Event('voiceschanged')); }
}
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, 'SpeechSynthesisUtterance');
function setup(voices: SpeechSynthesisVoice[] = []) {
  const synth = new Synth(); synth.voices = voices;
  Object.defineProperty(globalThis, 'window', {value: {speechSynthesis: synth}, configurable: true});
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {value: Utterance, configurable: true});
  return synth;
}
afterEach(() => {
  stopReadAloud();configureNaturalNarration(null);
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete (globalThis as any).window;
  if (originalUtterance) Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', originalUtterance); else delete (globalThis as any).SpeechSynthesisUtterance;
});

test('automatic device voice refuses unknown, remote, male and known robotic legacy voices', () => {
  const zira = voice('Microsoft Zira Desktop - English (United States)');
  const voices = [voice('Microsoft David'), voice('Microsoft Jenny Online (Natural)', 'en-US', false),
    voice('Default English'), voice('Samantha', 'fr-FR'), zira];
  assert.equal(chooseFriendlyVoice(voices), null);
  assert.equal(chooseFriendlyVoice(voices,zira.voiceURI), zira, 'a grown-up can deliberately preview and select an installed legacy voice');
  assert.equal(chooseFriendlyVoice(voices.slice(0, -1)), null);
});

test('enhanced female voices rank ahead of basic voices consistently across browser list order', () => {
  const premium = voice('Samantha (Enhanced)'), natural = voice('Microsoft Jenny (Natural)');
  const voices = [voice('Microsoft Zira'), premium, voice('Samantha'), natural];
  assert.equal(chooseFriendlyVoice(voices), natural);
  assert.equal(chooseFriendlyVoice([...voices].reverse()), natural);
  assert.equal(chooseFriendlyVoice(voices.slice(0, -1)), premium);
});

test('speech remains explicit, uses modest natural settings and records only a real start once', () => {
  const preferred = voice('Samantha (Enhanced)'), synth = setup([preferred]);
  const reader = createFriendlyNarrator(() => true);
  let starts = 0, finishes = 0;
  assert.equal(synth.spoken.length, 0, 'creating a narrator must not autoplay');
  reader.speak('Which word has three letters?', {onStarted: () => starts++, onFinished: () => finishes++});
  const utterance = synth.spoken[0];
  assert.equal(utterance.voice, preferred); assert.equal(utterance.lang, 'en-US');
  assert.equal(utterance.rate, FRIENDLY_READING_RATE); assert.equal(utterance.pitch, FRIENDLY_READING_PITCH);
  assert.equal(starts, 0, 'queueing speech alone is not listening evidence');
  utterance.onstart?.(); utterance.onstart?.(); assert.equal(starts, 1);
  utterance.onend?.(); assert.equal(finishes, 1); assert.equal(reader.active, false);
});

test('an initially empty browser voice list is loaded without silently selecting a default', () => {
  const synth = setup(), reader = createFriendlyNarrator(() => true);
  reader.speak('Read the clue.');
  assert.equal(synth.spoken.length, 0); assert.equal(reader.active, true);
  synth.load([voice('David'), voice('Samantha')]);
  assert.equal(synth.spoken.length, 1); assert.equal(synth.spoken[0].voice?.name, 'Samantha');
  synth.dispatchEvent(new Event('voiceschanged')); assert.equal(synth.spoken.length, 1);
});

test('leaving or stopping while voices load prevents delayed speech and support credit', () => {
  const synth = setup(), reader = createFriendlyNarrator(() => true); let starts = 0;
  reader.speak('Private words.', {onStarted: () => starts++}); reader.cancel();
  synth.load([voice('Samantha')]);
  assert.equal(synth.spoken.length, 0); assert.equal(starts, 0); assert.equal(reader.active, false);
});

test('changing owner or activity before queued audio starts prevents stale playback and evidence', () => {
  const synth = setup([voice('Samantha')]); let current = true, starts = 0;
  const reader = createFriendlyNarrator(() => current);
  reader.speak('First child question.', {onStarted: () => starts++});
  current = false; synth.spoken[0].onstart?.();
  assert.equal(starts, 0); assert.equal(reader.active, false); assert.ok(synth.cancellations >= 2);
});

test('a new reader replaces the prior request, and stale callbacks cannot cancel the new voice', () => {
  const synth = setup([voice('Samantha')]), first = createFriendlyNarrator(() => true), second = createFriendlyNarrator(() => true);
  let oldStarts = 0, newStarts = 0;
  first.speak('Old question.', {onStarted: () => oldStarts++});
  const stale = synth.spoken[0].onstart;
  second.speak('New question.', {onStarted: () => newStarts++});
  const cancelCount = synth.cancellations;
  stale?.();
  assert.equal(synth.cancellations, cancelCount, 'late old events must not cancel the new request');
  synth.spoken[1].onstart?.();
  assert.equal(oldStarts, 0); assert.equal(newStarts, 1); assert.equal(second.active, true);
});

test('no known local female voice produces an honest fallback with no speech or support', async () => {
  const synth = setup([voice('David'), voice('Jenny Online', 'en-US', false)]);
  const reader = createFriendlyNarrator(() => true); let starts = 0, unavailable = '';
  reader.speak('Question.', {onStarted: () => starts++, onUnavailable: reason => unavailable = reason});
  await new Promise(resolve => setTimeout(resolve, VOICE_LOADING_TIMEOUT_MS + 20));
  assert.equal(unavailable, 'voice'); assert.equal(synth.spoken.length, 0); assert.equal(starts, 0); assert.equal(reader.active, false);
});

test('a synthesis failure before start produces no support credit and is recoverable', () => {
  const synth = setup([voice('Samantha')]), reader = createFriendlyNarrator(() => true); let starts = 0, unavailable = '';
  reader.speak('Question.', {onStarted: () => starts++, onUnavailable: reason => unavailable = reason});
  synth.spoken[0].onerror?.();
  assert.equal(starts, 0); assert.equal(unavailable, 'audio'); assert.equal(reader.active, false);
  reader.speak('Try again.'); assert.equal(synth.spoken.length, 2);
});


test('natural narration checks availability before sending text and records only media playback', async () => {
  const synth=setup([voice('Samantha')]);
  const originalAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio');
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  const order:string[]=[],revoked:string[]=[];let media:FakeAudio|undefined,starts=0,finishes=0;
  class FakeAudio {
    preload='';src='';onplaying:(()=>void)|null=null;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;paused=false;
    constructor(){media=this;}
    async play(){order.push('play');}
    pause(){this.paused=true;}
    removeAttribute(){this.src='';}
  }
  Object.defineProperty(globalThis,'Audio',{value:FakeAudio,configurable:true});
  URL.createObjectURL=()=> 'blob:test-narration';URL.revokeObjectURL=url=>revoked.push(url);
  try{
    configureNaturalNarration({async available(signal){assert.equal(signal.aborted,false);order.push('status');return true;},
      async read(text,signal){assert.equal(signal.aborted,false);assert.equal(text,'Take your time.');order.push('read');return new Blob(['audio'],{type:'audio/mpeg'});}});
    const narrator=createFriendlyNarrator(()=>true);
    narrator.speak('Take your time.',{onStarted:()=>starts++,onFinished:()=>finishes++});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(order,['status','read','play']);assert.equal(synth.spoken.length,0);assert.equal(starts,0);
    media!.onplaying?.();media!.onplaying?.();assert.equal(starts,1);
    narrator.cancel();assert.equal(media!.paused,true);assert.deepEqual(revoked,['blob:test-narration']);assert.equal(finishes,1);
  }finally{
    if(originalAudio)Object.defineProperty(globalThis,'Audio',originalAudio);else delete(globalThis as any).Audio;
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
  }
});

test('cancelled or foreign natural-voice status never sends child text', async () => {
  const synth=setup([voice('Samantha')]);let complete:(value:boolean)=>void=()=>{},reads=0;let signal:AbortSignal|undefined;
  configureNaturalNarration({available(activeSignal){signal=activeSignal;return new Promise(resolve=>{complete=resolve;});},
    async read(){reads++;return new Blob();}});
  const narrator=createFriendlyNarrator(()=>true);narrator.speak('Private draft.');narrator.cancel();complete(true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);assert.equal(signal!.aborted,true);assert.equal(synth.spoken.length,0);
  let allowed=true;const another=createFriendlyNarrator(()=>allowed);another.speak('Another private draft.');allowed=false;complete(true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);assert.equal(signal!.aborted,true);
});

test('disabled natural narration uses the reviewed local voice with no synthesis request', async () => {
  const synth=setup([voice('Samantha')]);let reads=0;
  configureNaturalNarration({async available(){return false;},async read(){reads++;return new Blob();}});
  const narrator=createFriendlyNarrator(()=>true);narrator.speak('Read my question.');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);assert.equal(synth.spoken.length,1);
});

test('a device voice denied after status discovery can start on the next tap without another status or paid read', async () => {
  const synth=setup([voice('Samantha')]);let statuses=0,reads=0,starts=0,waiting=0;
  configureNaturalNarration({async available(){statuses++;return false;},async read(){reads++;return new Blob();}});
  const narrator=createFriendlyNarrator(()=>true);
  narrator.speak('Read my complete question.',{onStarted:()=>starts++,onPlayRequired:()=>waiting++});
  await new Promise(resolve=>setImmediate(resolve));
  const denied=synth.spoken[0],staleStart=denied.onstart;
  denied.onerror?.({error:'not-allowed'});
  assert.equal(waiting,1);assert.equal(narrator.waitingToPlay,true);assert.equal(starts,0);
  staleStart?.();assert.equal(starts,0,'cancelled local speech cannot start while the button requests another tap');
  narrator.resume();
  assert.equal(synth.spoken.length,2,'the new tap queues a fresh utterance synchronously');
  assert.equal(synth.spoken[1].text,'Read my complete question.');assert.equal(synth.spoken[1].voice,denied.voice);
  assert.equal(statuses,1);assert.equal(reads,0);assert.equal(starts,0);
  staleStart?.();assert.equal(starts,0,'an old utterance cannot mark the resumed one as started');
  synth.spoken[1].onstart?.();assert.equal(starts,1);assert.equal(narrator.waitingToPlay,false);
});

test('a queued device gesture retry is discarded when the current child changes', () => {
  const synth=setup([voice('Samantha')]);let current=true,starts=0;
  const narrator=createFriendlyNarrator(()=>current);
  narrator.speak('Private child wording.',{onStarted:()=>starts++});
  synth.spoken[0].onerror?.({error:'not-allowed'});assert.equal(narrator.waitingToPlay,true);
  current=false;narrator.resume();
  assert.equal(synth.spoken.length,1);assert.equal(narrator.active,false);assert.equal(starts,0);
});

test('a failed natural synthesis does not retry or silently replay with a device voice', async () => {
  const synth=setup([voice('Samantha')]);let reads=0,unavailable=0;
  configureNaturalNarration({async available(){return true;},async read(){reads++;throw Error('unavailable');}});
  const narrator=createFriendlyNarrator(()=>true);narrator.speak('Question.',{onUnavailable:()=>unavailable++});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);assert.equal(synth.spoken.length,0);assert.equal(unavailable,1);assert.equal(narrator.active,false);
});

test('device voice previews cannot invoke natural status or synthesis', () => {
  const synth=setup([voice('Samantha')]);let calls=0;
  configureNaturalNarration({async available(){calls++;return true;},async read(){calls++;return new Blob();}});
  createFriendlyNarrator(()=>true).speak('Preview.',{}, {deviceOnly:true});
  assert.equal(calls,0);assert.equal(synth.spoken.length,1);
});


test('mobile playback permission reuses the fetched audio on the next tap without a second synthesis', async () => {
  setup([voice('Samantha')]);const originalAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio');
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  let media:FakeAudio|undefined,reads=0,plays=0,starts=0,waiting=0;const revoked:string[]=[];
  class FakeAudio {
    preload='';src='';onplaying:(()=>void)|null=null;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;paused=false;
    constructor(){media=this;}
    async play(){plays++;if(plays===1)throw new DOMException('Tap required','NotAllowedError');}
    pause(){this.paused=true;}removeAttribute(){this.src='';}
  }
  Object.defineProperty(globalThis,'Audio',{value:FakeAudio,configurable:true});
  URL.createObjectURL=()=> 'blob:one-request';URL.revokeObjectURL=url=>revoked.push(url);
  try{
    configureNaturalNarration({async available(){return true;},async read(){reads++;return new Blob(['audio'],{type:'audio/mpeg'});}});
    const narrator=createFriendlyNarrator(()=>true);
    narrator.speak('A caring reply.',{onStarted:()=>starts++,onPlayRequired:()=>waiting++});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(reads,1);assert.equal(plays,1);assert.equal(starts,0);assert.equal(waiting,1);assert.equal(narrator.waitingToPlay,true);assert.equal(narrator.active,true);
    narrator.resume();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(reads,1,'a new gesture must not resubmit synthesis');assert.equal(plays,2);assert.equal(starts,0);
    media!.onplaying?.();assert.equal(starts,1);assert.equal(narrator.waitingToPlay,false);
    narrator.cancel();assert.deepEqual(revoked,['blob:one-request']);assert.equal(media!.paused,true);
    narrator.resume();assert.equal(plays,2,'disposed audio cannot be resumed');
  }finally{
    if(originalAudio)Object.defineProperty(globalThis,'Audio',originalAudio);else delete(globalThis as any).Audio;
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
  }
});

test('a profile transition revokes waiting natural audio before it can be resumed', async () => {
  const synth=setup([voice('Samantha')]),windowTarget=new EventTarget();
  Object.defineProperty(windowTarget,'speechSynthesis',{value:synth});
  Object.defineProperty(globalThis,'window',{value:windowTarget,configurable:true});
  const originalAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio');
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  let plays=0,reads=0,starts=0;const revoked:string[]=[];
  class FakeAudio {
    preload='';src='';onplaying:(()=>void)|null=null;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;
    async play(){plays++;throw new DOMException('Tap required','NotAllowedError');}
    pause(){}removeAttribute(){this.src='';}
  }
  Object.defineProperty(globalThis,'Audio',{value:FakeAudio,configurable:true});
  URL.createObjectURL=()=> 'blob:former-profile';URL.revokeObjectURL=url=>revoked.push(url);
  try{
    configureNaturalNarration({async available(){return true;},async read(){reads++;return new Blob(['audio'],{type:'audio/mpeg'});}});
    const narrator=createFriendlyNarrator(()=>true);
    narrator.speak('The former child’s message.',{onStarted:()=>starts++});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(narrator.waitingToPlay,true);
    windowTarget.dispatchEvent(new Event('factory-profile-before-change'));
    narrator.resume();
    assert.equal(narrator.active,false);assert.deepEqual(revoked,['blob:former-profile']);
    assert.equal(reads,1);assert.equal(plays,1);assert.equal(starts,0);
  }finally{
    if(originalAudio)Object.defineProperty(globalThis,'Audio',originalAudio);else delete(globalThis as any).Audio;
    URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
  }
});

test('long passages use the complete local text without splitting into paid requests', () => {
  const synth=setup([voice('Samantha')]);let calls=0;
  configureNaturalNarration({async available(){calls++;return true;},async read(){calls++;return new Blob();}});
  const text='A complete long passage. '.repeat(100);createFriendlyNarrator(()=>true).speak(text);
  assert.equal(calls,0);assert.equal(synth.spoken[0].text,text);
});
