// Shared with the credential-free capture worker. No model transport and no
// generated-code execution. These hashes bind review to the actual artifact.
const {createHash}=require('node:crypto');
const {assetPackHash,inspectRaster}=require('../agent/game-assets.cjs');
const HASH=/^[a-f0-9]{64}$/,ID=/^[a-z][a-z0-9-]{0,39}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function qualityArtifactHash(game){
 return sha(canonical({kind:game.kind,title:game.title,instructions:game.instructions,source:game.source,controls:game.controls,
  assetsHash:assetPackHash(game.assets)||null,productionPlan:game.productionPlan||null,playthrough:game.playthrough||null}));
}
// A longer observation window changes only how long the isolated tester can
// play. The game receives normal fixed ticks and the same ordinary controls.
const captureLimits=premium=>premium?{actions:128,frames:7200}:{actions:16,frames:600};
const usesPremiumCapture=game=>game.kind==='generated-module-v2'&&game.productionPlan?.version==='game-production-plan-v2';
function captureHorizon(game){
 if(!usesPremiumCapture(game)||!Array.isArray(game.playthrough))return 600;
 // Real gestures, key release and frame captures consume simulation time.
 const limits=captureLimits(true);
 if(game.playthrough.length<1||game.playthrough.length>limits.actions)throw Error('PLAYTHROUGH_INVALID');
 const total=game.playthrough.reduce((ticks,entry)=>ticks+action(entry).frames,0);
 if(total>limits.frames)throw Error('PLAYTHROUGH_INVALID');
 if(total<=600)return 600;
 const planned=total+game.playthrough.length*12+240;
 return Math.max(600,Math.min(captureLimits(true).frames,planned));
}
const qualityEvidenceHash=evidence=>sha(canonical(evidence));
const record=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('QUALITY_EVIDENCE_INVALID');
 return value;
};
const keys=(value,expected)=>{
 if(expected.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!expected.includes(k)))throw Error('QUALITY_EVIDENCE_INVALID');
};
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
function action(value){
 const a=record(value),required=a.type==='tap'?['type','x','y','frames']:a.type==='drag'?['type','x','y','x2','y2','frames']:a.type==='hold'?['type','control','frames']:a.type==='wait'?['type','frames']:[];
 if(!required.length)throw Error('QUALITY_EVIDENCE_INVALID');keys(a,required);
 if(!integer(a.frames,1,180))throw Error('QUALITY_EVIDENCE_INVALID');
 for(const k of ['x','x2'])if(Object.hasOwn(a,k)&&(!Number.isFinite(a[k])||a[k]<0||a[k]>720))throw Error('QUALITY_EVIDENCE_INVALID');
 for(const k of ['y','y2'])if(Object.hasOwn(a,k)&&(!Number.isFinite(a[k])||a[k]<0||a[k]>400))throw Error('QUALITY_EVIDENCE_INVALID');
 if(a.type==='hold'&&!['left','right','up','down','action'].includes(a.control))throw Error('QUALITY_EVIDENCE_INVALID');
 return {...a};
}
function validateQualityEvidence(game,value){
 const e=record(value),c=game.compiled,premium=usesPremiumCapture(game);
 const limits=captureLimits(premium),maxTick=premium?captureHorizon(game):1800;
 keys(e,['version','motion','artifactHash','sourceHash','codeHash','runtimeVersion','runtimeHash','captures','sessions']);
 if(!c||e.version!=='game-quality-evidence-v1'||e.motion!=='normal'||e.artifactHash!==qualityArtifactHash(game)||e.sourceHash!==sha(game.source)||e.sourceHash!==c.sourceHash||e.codeHash!==sha(c.code)||e.codeHash!==c.codeHash||e.runtimeVersion!==(c.runtimeVersion||'legacy-v1')||e.runtimeHash!==(c.runtimeHash||sha('legacy-v1'))||!HASH.test(e.artifactHash)||!HASH.test(e.sourceHash)||!HASH.test(e.codeHash)||!HASH.test(e.runtimeHash))throw Error('QUALITY_EVIDENCE_BINDING_MISMATCH');
 if(c.tests?.desktop!==true||c.tests.mobile!==true||c.tests.replay!==true||c.tests.isolation!==true||game.kind==='generated-module-v2'&&(c.tests.input!==true||c.tests.resources!==true||c.tests.pause!==true))throw Error('QUALITY_TECHNICAL_ATTESTATION_REQUIRED');
 if(!Array.isArray(e.captures)||e.captures.length<4||e.captures.length>8||!Array.isArray(e.sessions)||e.sessions.length!==2)throw Error('QUALITY_EVIDENCE_INCOMPLETE');
 const ids=new Set();let totalBytes=0;
 const captures=e.captures.map(value=>{
  const p=record(value);keys(p,['id','device','phase','tick','width','height','sha256','data']);
  if(typeof p.id!=='string'||!ID.test(p.id)||ids.has(p.id)||!['desktop','tablet'].includes(p.device)||!['initial','interaction','progress','outcome'].includes(p.phase)||!integer(p.tick,0,maxTick)||!integer(p.width,200,1024)||!integer(p.height,150,1200)||typeof p.sha256!=='string'||!HASH.test(p.sha256)||typeof p.data!=='string'||p.data.length>2*1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.data))throw Error('QUALITY_EVIDENCE_INVALID');
  const bytes=Buffer.from(p.data,'base64');totalBytes+=bytes.length;
  // Six full-width illustrated captures need more space than flat fixtures.
  // Keep the actual 720/600px layouts legible within an explicit raw-byte cap.
  if(totalBytes>4*1024*1024||bytes.length<100||bytes.toString('base64')!==p.data)throw Error('QUALITY_EVIDENCE_LIMIT');
  const info=inspectRaster(bytes,'image/png');
  if(info.sha256!==p.sha256||info.width!==p.width||info.height!==p.height)throw Error('QUALITY_EVIDENCE_IMAGE_MISMATCH');
  ids.add(p.id);return {...p};
 });
 const devices=new Set();
 const sessions=e.sessions.map(value=>{
  const s=record(value);keys(s,['device','inputs','visibleChanges','simulatedTicks','outcome','replay','pause','touch','consoleErrors','actionTrace']);
  if(!['desktop','tablet'].includes(s.device)||devices.has(s.device)||!integer(s.inputs,1,1000)||!integer(s.visibleChanges,1,1000)||!integer(s.simulatedTicks,60,maxTick)||!['playing','won','lost'].includes(s.outcome)||s.outcome==='playing'&&s.simulatedTicks<(premium?maxTick:600)||s.replay!==true||s.pause!==true||typeof s.touch!=='boolean'||s.device==='tablet'&&s.touch!==true||s.consoleErrors!==0||!Array.isArray(s.actionTrace)||s.actionTrace.length<1||s.actionTrace.length>limits.actions)throw Error('QUALITY_EVIDENCE_INCOMPLETE');
  let previousTick=-1,totalFrames=0;
  const actionTrace=s.actionTrace.map((value,index)=>{
   const t=record(value);keys(t,['action','index','startTick','endTick','beforeHash','afterHash']);
   if(t.index!==index||!integer(t.startTick,0,s.simulatedTicks)||!integer(t.endTick,t.startTick,s.simulatedTicks)||t.startTick<previousTick||!HASH.test(t.beforeHash)||!HASH.test(t.afterHash))throw Error('QUALITY_EVIDENCE_INVALID');
   const a=action(t.action);
   if(premium&&canonical(a)!==canonical(game.playthrough?.[index]))throw Error('QUALITY_EVIDENCE_BINDING_MISMATCH');
   previousTick=t.endTick;totalFrames+=a.frames;
   return {...t,action:a};
  });
  if(totalFrames>limits.frames||!actionTrace.some(t=>t.action.type!=='wait'&&t.beforeHash!==t.afterHash))throw Error('QUALITY_EVIDENCE_INCOMPLETE');
  const shots=captures.filter(p=>p.device===s.device);
  if(shots.length<2||!shots.some(p=>p.phase==='initial')||!shots.some(p=>p.phase!=='initial')||shots.some(p=>p.tick>s.simulatedTicks)||new Set(shots.map(p=>p.sha256)).size<2)throw Error('QUALITY_EVIDENCE_INCOMPLETE');
  devices.add(s.device);return {...s,actionTrace};
 });
 return {...e,captures,sessions};
}
module.exports={captureLimits,captureHorizon,usesPremiumCapture,qualityArtifactHash,qualityEvidenceHash,validateQualityEvidence};
