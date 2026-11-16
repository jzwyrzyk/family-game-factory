/** Test-only browser instrumentation. Bundle this file before injection: serializing a tsx
 * callback containing classes can omit the keepNames helper and silently disable the probe.
 */
export function installAudioProbe(){
 type ContextObservation={events:string[];resumeCalls:number;resumeDone:number;suspendCalls:number;suspendDone:number;state:string};
 type VoiceObservation={id:number;hz:number|null;started:boolean;ended:boolean;stops:{immediate:boolean}[]};
 const Native=window.AudioContext,liveContexts:AudioContext[]=[],probe={installed:false,available:!!Native,attempts:0,created:0,active:0,peak:0,contexts:[] as ContextObservation[],workerFrames:[] as unknown[],records:[] as VoiceObservation[]};(window as any).__qualityAudio=probe;
 (window as any).__qualityAudioSnapshot=()=>({...probe,contexts:probe.contexts.map((entry,index)=>({...entry,liveState:liveContexts[index]?.state,currentTime:liveContexts[index]?.currentTime})),records:probe.records.slice(-12),workerFrames:probe.workerFrames.slice(-4)});
 const NativeWorker=window.Worker;
 class ObservedWorker extends NativeWorker{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{const packet=event.data;probe.workerFrames.push({status:packet?.outcome?.status,failed:packet?.failed,ticks:packet?.presentation?.ticks,sounds:Array.isArray(packet?.presentation?.sounds)?packet.presentation.sounds.slice(0,8):[]});if(probe.workerFrames.length>8)probe.workerFrames.shift();});}}
 window.Worker=ObservedWorker;
 if(!Native)return;
 class ObservedAudio extends Native{
  private observed:ContextObservation;
  constructor(){probe.attempts++;super();this.observed={events:[],resumeCalls:0,resumeDone:0,suspendCalls:0,suspendDone:0,state:this.state};probe.contexts.push(this.observed);liveContexts.push(this);this.addEventListener('statechange',()=>this.event('state'));}
  private event(name:string){this.observed.state=this.state;this.observed.events.push(name+':'+this.state);if(this.observed.events.length>12)this.observed.events.shift();}
  resume(){this.observed.resumeCalls++;this.event('resume');return super.resume().then(()=>{this.observed.resumeDone++;this.event('resume-done');},error=>{this.event('resume-error-'+String(error?.name));throw error;});}
  suspend(){this.observed.suspendCalls++;this.event('suspend');return super.suspend().then(()=>{this.observed.suspendDone++;this.event('suspend-done');});}
  createOscillator(){const oscillator=super.createOscillator(),record:VoiceObservation={id:probe.created++,hz:null,started:false,ended:false,stops:[]};probe.records.push(record);const start=oscillator.start.bind(oscillator),stop=oscillator.stop.bind(oscillator),frequency=oscillator.frequency.setValueAtTime.bind(oscillator.frequency);oscillator.frequency.setValueAtTime=(value,time)=>{record.hz=value;return frequency(value,time);};oscillator.start=(when=0)=>{start(when);record.started=true;probe.active++;probe.peak=Math.max(probe.peak,probe.active);};oscillator.stop=(when?:number)=>{if(when===undefined)stop();else stop(when);record.stops.push({immediate:when===undefined||when<=this.currentTime});};oscillator.addEventListener('ended',()=>{if(record.started&&!record.ended)probe.active--;record.ended=true;},{once:true});return oscillator;}
 }
 window.AudioContext=ObservedAudio;probe.installed=true;
}
