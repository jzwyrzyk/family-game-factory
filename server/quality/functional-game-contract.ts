/**
 * O3: small, source-traceable functional acceptance plans.
 * They describe required input -> observable effects; no game code is executed
 * by this module. The "authored" status NEVER implies that a game passed.
 * O4–O7 must run equivalent checks on real isolated generated previews.
 */
import {
  exactIntentSpan, validateChildIntentContract,
  type IntentSpan,type ChildIntentContract
} from './child-intent';
import {
  chooseGameForm,validateGameFormDecision,
  type GameFormDecision,type TrustedExistingForm
} from './game-form';

export const FUNCTIONAL_CONTRACT_VERSION='jems-working-game-v1' as const;
export type GameButton='left'|'right'|'up'|'down'|'action';
export type FunctionalAction=
  |{kind:'press';button:GameButton}
  |{kind:'hold';button:GameButton;frames:number}
  |{kind:'drag';from:{x:number;y:number};to:{x:number;y:number}}
  |{kind:'tap';at:{x:number;y:number}}
  |{kind:'wait';frames:number};
export type GameObservation=
  |{kind:'visible';key:string}
  |{kind:'hidden';key:string}
  |{kind:'coordinate';key:string;axis:'x'|'y';operator:'lt'|'gt';value:number}
  |{kind:'changed';key:string;axis:'x'|'y';minDelta:number}
  |{kind:'world';metric:'bodies'|'joints';operator:'eq'|'gte';value:number};
export interface RequirementDraft {
  id:string;
  /** Literal source quote: required to be unique or explicit occurrence. */
  quote:string;
  occurrence?:number;
}
export interface WorkingRequirement {
  id:string;source:IntentSpan;
  classification:'authored-proposal-not-child-confirmed';
}
export interface FunctionalCheckpoint {
  after:number; // 0 = initial state; otherwise number of actions completed
  outcome:'playing'|'won'|'lost';
  observations:GameObservation[];
}
export interface FunctionalProbe {
  id:string;covers:string[];
  actions:FunctionalAction[];
  checkpoints:FunctionalCheckpoint[];
  /** Re-instantiate a fresh game and replay the whole sequence identically. */
  deterministicReplay:true;
}
export interface FunctionalGameContract {
  version:typeof FUNCTIONAL_CONTRACT_VERSION;
  status:'authored-unverified-not-release-approved';
  sourceSha256:string;
  formVersion:GameFormDecision['version'];
  expectedSimulation:'rule-driven'|'physics-2d';
  requirements:WorkingRequirement[];
  probes:FunctionalProbe[];
  remainingGates:readonly [
    'real-isolated-browser-preview',
    'learning-and-revision-integration',
    'objective-repair-and-retest'
  ];
}
const ERROR='WORKING_GAME_CONTRACT_';
const abort=(code:string):never=>{throw Error(ERROR+code);};
const LIMITS={requirements:12,probes:12,actions:24,checkpoints:26,observations:12,totalFrames:1400};
const ID=/^[a-z][a-z0-9-]{0,39}$/;
const KEY=/^[a-z][A-Za-z0-9_-]{0,59}$/;
const sourceEqual=(a:IntentSpan,b:IntentSpan)=>a.start===b.start&&a.end===b.end&&a.quote===b.quote;
const point=(p:unknown):boolean=>!!p&&typeof p==='object'&&
  !Array.isArray(p)&&Object.keys(p).sort().join(',')==='x,y'&&
  Number.isFinite((p as {x:number}).x)&&Number.isFinite((p as {y:number}).y)&&
  (p as {x:number}).x>=0&&(p as {x:number}).x<=720&&
  (p as {y:number}).y>=0&&(p as {y:number}).y<=400;
const plain=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const only=(v:Record<string,unknown>,fields:readonly string[])=>Object.keys(v).every(k=>fields.includes(k));
const positiveInt=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&
 typeof v==='number'&&v>=min&&v<=max;

export function validateFunctionalGameContract(
  data:unknown, rawIntent:unknown, gameForm:unknown, verifiedBase?:TrustedExistingForm
):FunctionalGameContract {
  const intent=validateChildIntentContract(rawIntent);
  const form=validateGameFormDecision(gameForm,intent,verifiedBase);
  if(form.disposition!=='candidate'||form.simulation==='unresolved')abort('FORM_NOT_SUPPORTED');
  if(!plain(data)||!only(data,['version','status','sourceSha256','formVersion','expectedSimulation','requirements','probes','remainingGates'])||
     Object.keys(data).length!==8||
     data.version!==FUNCTIONAL_CONTRACT_VERSION||
     data.status!=='authored-unverified-not-release-approved'||
     data.sourceSha256!==intent.source.sha256||data.formVersion!==form.version||
     data.expectedSimulation!==form.simulation)abort('SCHEMA');
  if(!Array.isArray(data.requirements)||data.requirements.length===0||data.requirements.length>LIMITS.requirements||
     !Array.isArray(data.probes)||data.probes.length===0||data.probes.length>LIMITS.probes)abort('BOUNDS');

  const requirements:WorkingRequirement[]=[];
  const ids=new Set<string>();
  for(const req of data.requirements){
    if(!plain(req)||!only(req,['id','source','classification'])||Object.keys(req).length!==3||
      typeof req.id!=='string'||!ID.test(req.id)||ids.has(req.id)||
      req.classification!=='authored-proposal-not-child-confirmed'||!plain(req.source)||
      !only(req.source,['start','end','quote'])||Object.keys(req.source).length!==3||
      typeof req.source.quote!=='string')abort('REQUIREMENT');
    const {start,end,quote}=req.source;
    if(!positiveInt(start,0,intent.source.raw.length)||!positiveInt(end,1,intent.source.raw.length)||
       end<=start||intent.source.raw.slice(start,end)!==quote||
       quote.trim().length===0||
       // Do not allow UTF-16 source spans to split an emoji/surrogate.
       (start>0&&/[\uDC00-\uDFFF]/.test(intent.source.raw[start])&&/[\uD800-\uDBFF]/.test(intent.source.raw[start-1]))||
       (end<intent.source.raw.length&&/[\uDC00-\uDFFF]/.test(intent.source.raw[end])&&/[\uD800-\uDBFF]/.test(intent.source.raw[end-1]))
       )abort('SOURCE_EVIDENCE');
    ids.add(req.id);
    requirements.push({id:req.id,source:{start,end,quote},classification:'authored-proposal-not-child-confirmed'});
  }
  const seenProbes=new Set<string>();
  const covered=new Set<string>();
  const probes:FunctionalProbe[]=[];
  for(const probe of data.probes){
    if(!plain(probe)||!only(probe,['id','covers','actions','checkpoints','deterministicReplay'])||
       Object.keys(probe).length!==5||typeof probe.id!=='string'||!ID.test(probe.id)||
       seenProbes.has(probe.id)||probe.deterministicReplay!==true||
       !Array.isArray(probe.covers)||probe.covers.length===0||
       probe.covers.length>LIMITS.requirements||
       new Set(probe.covers).size!==probe.covers.length||
       probe.covers.some(id=>typeof id!=='string'||!ids.has(id))||
       !Array.isArray(probe.actions)||probe.actions.length===0||probe.actions.length>LIMITS.actions||
       !Array.isArray(probe.checkpoints)||probe.checkpoints.length===0||
       probe.checkpoints.length>LIMITS.checkpoints)abort('PROBE');
    probe.covers.forEach((id:string)=>covered.add(id));
    seenProbes.add(probe.id);
    let totalFrames=0;
    const actions:FunctionalAction[]=probe.actions.map((a:unknown)=>{
      if(!plain(a)||typeof a.kind!=='string')abort('ACTION');
      if(a.kind==='press'){
        if(!only(a,['kind','button'])||typeof a.button!=='string'||
           !['left','right','up','down','action'].includes(a.button))abort('ACTION');
        totalFrames+=2;return {kind:'press',button:a.button as GameButton};
      }
      if(a.kind==='hold'){
        if(!only(a,['kind','button','frames'])||typeof a.button!=='string'||
           !['left','right','up','down','action'].includes(a.button)||
           !positiveInt(a.frames,1,500))abort('ACTION');
        totalFrames+=a.frames+1;return {kind:'hold',button:a.button as GameButton,frames:a.frames};
      }
      if(a.kind==='drag'){
        if(!only(a,['kind','from','to'])||!point(a.from)||!point(a.to))abort('ACTION');
        totalFrames+=3;return {kind:'drag',from:{...(a.from as {x:number;y:number})},to:{...(a.to as {x:number;y:number})}};
      }
      if(a.kind==='tap'){
        if(!only(a,['kind','at'])||!point(a.at))abort('ACTION');
        totalFrames+=2;return {kind:'tap',at:{...(a.at as {x:number;y:number})}};
      }
      if(a.kind==='wait'){
        if(!only(a,['kind','frames'])||!positiveInt(a.frames,1,600))abort('ACTION');
        totalFrames+=a.frames;return {kind:'wait',frames:a.frames};
      }
      abort('ACTION');
    });
    if(totalFrames>LIMITS.totalFrames)abort('FRAME_BUDGET');
    let prev=-1;
    const checkpoints:FunctionalCheckpoint[]=probe.checkpoints.map((c:unknown)=>{
      if(!plain(c)||!only(c,['after','outcome','observations'])||Object.keys(c).length!==3||
         !positiveInt(c.after,0,actions.length)||c.after<=prev||
         !['playing','won','lost'].includes(c.outcome as string)||
         !Array.isArray(c.observations)||c.observations.length===0||
         c.observations.length>LIMITS.observations)abort('CHECKPOINT');
      prev=c.after;
      const observations:GameObservation[]=c.observations.map((o:unknown)=>{
        if(!plain(o)||typeof o.kind!=='string')abort('OBSERVATION');
        if(o.kind==='visible'||o.kind==='hidden'){
          if(!only(o,['kind','key'])||typeof o.key!=='string'||!KEY.test(o.key))abort('OBSERVATION');
          return {kind:o.kind,key:o.key};
        }
        if(o.kind==='coordinate'){
          if(!only(o,['kind','key','axis','operator','value'])||typeof o.key!=='string'||
             !KEY.test(o.key)||!['x','y'].includes(o.axis as string)||
             !['lt','gt'].includes(o.operator as string)||typeof o.value!=='number'||
             !Number.isFinite(o.value)||Math.abs(o.value)>10000)abort('OBSERVATION');
          return {kind:'coordinate',key:o.key,axis:o.axis as 'x'|'y',operator:o.operator as 'lt'|'gt',value:o.value};
        }
        if(o.kind==='changed'){
          if(!only(o,['kind','key','axis','minDelta'])||
             typeof o.key!=='string'||!KEY.test(o.key)||
             !['x','y'].includes(o.axis as string)||
             typeof o.minDelta!=='number'||!Number.isFinite(o.minDelta)||
             o.minDelta<=0||o.minDelta>10000)abort('OBSERVATION');
          return {kind:'changed',key:o.key,axis:o.axis as 'x'|'y',minDelta:o.minDelta};
        }
        if(o.kind==='world'){
          if(!only(o,['kind','metric','operator','value'])||
             !['bodies','joints'].includes(o.metric as string)||
             !['eq','gte'].includes(o.operator as string)||!positiveInt(o.value,0,60))abort('OBSERVATION');
          return {kind:'world',metric:o.metric as 'bodies'|'joints',operator:o.operator as 'eq'|'gte',value:o.value};
        }
        abort('OBSERVATION');
      });
      return {after:c.after,outcome:c.outcome as FunctionalCheckpoint['outcome'],observations};
    });
    probes.push({id:probe.id,covers:[...probe.covers],actions,checkpoints,deterministicReplay:true});
  }
  if([...ids].some(id=>!covered.has(id)))abort('UNCOVERED_REQUIREMENT');
  const gates=[
    'real-isolated-browser-preview',
    'learning-and-revision-integration',
    'objective-repair-and-retest'
  ] as const;
  if(JSON.stringify(data.remainingGates)!==JSON.stringify(gates))abort('GATES');
  return {
    version:FUNCTIONAL_CONTRACT_VERSION,status:'authored-unverified-not-release-approved',
    sourceSha256:intent.source.sha256,formVersion:form.version,
    expectedSimulation:form.simulation,
    requirements,probes,remainingGates:gates
  };
}

/** Caller-authored expectations are proposals, not an inferred child demand. */
export function createFunctionalGameContract(
  rawIntent:unknown,gameForm:unknown,
  requirements:readonly RequirementDraft[],
  probes:readonly FunctionalProbe[],
  verifiedBase?:TrustedExistingForm
):FunctionalGameContract {
  const intent=validateChildIntentContract(rawIntent);
  const form=validateGameFormDecision(gameForm,intent,verifiedBase);
  if(form.disposition!=='candidate'||form.simulation==='unresolved')abort('FORM_NOT_SUPPORTED');
  const entries=requirements.map(r=>({
    id:r.id,source:exactIntentSpan(intent.source.raw,r.quote,r.occurrence),
    classification:'authored-proposal-not-child-confirmed' as const
  }));
  return validateFunctionalGameContract({
    version:FUNCTIONAL_CONTRACT_VERSION,
    status:'authored-unverified-not-release-approved',
    sourceSha256:intent.source.sha256,formVersion:form.version,
    expectedSimulation:form.simulation,requirements:entries,
    probes,remainingGates:[
      'real-isolated-browser-preview',
      'learning-and-revision-integration',
      'objective-repair-and-retest'
    ]
  },intent,form,verifiedBase);
}
