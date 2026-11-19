/**
 * Cosmetic progress from saved making evidence, never chat volume, game points
 * or an academic proficiency claim. The notebook remains the only source.
 */
import type { StudioSession, KeptExperiment } from '../studio/notebook';
import type { Experiment } from '../studio/design';

export type GemStage = 'none' | 'rough' | 'cut' | 'polished';
type Evidence = Pick<StudioSession, 'experiments' | 'design' | 'keptExperiments' | 'verifiedRemoteExperiments'>;

export const GEM_STAGE_LABELS: Record<Exclude<GemStage, 'none'>, string> = {
  rough: 'Rough jem', cut: 'Cut jem', polished: 'Polished jem'
};
export const GEM_MASTER_TARGET = 3;

const meaningful = (value:unknown):value is string => typeof value==='string'&&value.trim().length>0;
/** A saved game-design decision has provenance; an arbitrary chat message does not. */
export function hasAuthoredGemIdea(s:Evidence):boolean {
  return !!s.design?.ideas.some(i=>i.origin==='child'&&i.adopted&&meaningful(i.text)) ||
    Object.values(s.design?.plan||{}).some(p=>p?.origin==='child'&&p.accepted&&!p.delegated&&meaningful(p.value)) ||
    !!s.experiments?.some(e=>e.origin==='child'&&meaningful(e.candidate?.prompt));
}

function realTest(s:Evidence,e:Experiment):boolean {
  return !!e.candidate?.config || !!e.candidate?.remoteId&&!!s.verifiedRemoteExperiments?.includes(e.id);
}
function hasReflection(s:Evidence,e:Experiment):boolean {
  // Notes are typed by the child in the saved test card; runtime outcomes alone
  // are not reflection. Both interfaces refer to the same exact experiment.
  return meaningful(e.notes) || !!s.design?.observations.some(o=>
    o.source==='child'&&o.experimentId===e.id&&meaningful(o.text));
}
function matchingKeep(e:Experiment,k:KeptExperiment):boolean {
  return k.experimentId===e.id&&meaningful(k.baseId)&&k.baseId===e.baseId&&
    k.baseId===e.candidate.baseId&&meaningful(k.revisionId)&&k.revisionId!==k.baseId&&
    (k.kind==='remote'?k.revisionId===e.candidate.remoteId:k.kind==='local'&&!!e.candidate.config);
}
function polishedEvidence(s:Evidence):KeptExperiment[] {
  return (s.keptExperiments||[]).filter(k=>(s.experiments||[]).some(e=>
    realTest(s,e)&&hasReflection(s,e)&&matchingKeep(e,k)));
}

/**
 * A cut needs a real saved test plus the child's linked reflection. A polished
 * jem additionally needs an explicit receipt for keeping THAT test. The old
 * boolean argument is tolerated during migration but never authorizes credit.
 */
export function gemStage(s:Evidence,_legacyKeptVersion?:boolean):GemStage {
  if(!hasAuthoredGemIdea(s))return 'none';
  if(!(s.experiments||[]).some(e=>realTest(s,e)&&hasReflection(s,e)))return 'rough';
  return polishedEvidence(s).length?'polished':'cut';
}

export type BuilderLevel = {level:0|1|2|3|4;name:string;description:string};
/** Call builderJourney for notebook data so duplicate projects cannot count. */
export function builderLevel(stages:readonly GemStage[]):BuilderLevel {
  if(stages.filter(s=>s==='polished').length>=GEM_MASTER_TARGET)
    return {level:4,name:'Gem Master',description:'Three jems, made yours.'};
  if(stages.includes('polished'))return {level:3,name:'Gem Polisher',description:'You kept an improvement.'};
  if(stages.includes('cut'))return {level:2,name:'Gem Cutter',description:'You tested and noticed.'};
  if(stages.includes('rough'))return {level:1,name:'Gem Maker',description:'Your idea is taking shape.'};
  return {level:0,name:'Ready to create',description:'Your adventure starts with an idea.'};
}
export type BuilderJourney = BuilderLevel & {
  polishedCount:number;
  masterTarget:typeof GEM_MASTER_TARGET;
  projectCount:number;
  stageCounts:Record<GemStage,number>;
  nextAction:string;
};
const rank:Record<GemStage,number>={none:0,rough:1,cut:2,polished:3};

/**
 * One owner's journey, derived afresh. Archives keep their truthful evidence;
 * erased evidence loses dependent credit. Session/project aliases and copied
 * test/keep receipts count once. A fork starts with an empty test shelf, so it
 * must complete its own new cycle before it contributes a polished project.
 */
export function builderJourney(sessions:readonly StudioSession[],owner=sessions[0]?.owner):BuilderJourney {
  const projects=new Map<string,{stage:GemStage;receipts:KeptExperiment[]}>();
  const seenSessions=new Set<string>();
  for(const s of sessions){
    if(s.owner!==owner||seenSessions.has(s.id))continue;
    seenSessions.add(s.id);
    const key=s.projectId?'local:'+s.projectId:'session:'+s.id;
    const stage=gemStage(s),previous=projects.get(key),receipts=stage==='polished'?polishedEvidence(s):[];
    if(!previous)projects.set(key,{stage,receipts});
    else{
      if(rank[stage]>rank[previous.stage])previous.stage=stage;
      previous.receipts.push(...receipts);
    }
  }
  // Collapse overlapping receipt sets before counting. A restored copy may
  // contain only one of the original project's tests; greedy reservation would
  // wrongly award both depending on which project sorted first.
  const entries=[...projects.values()],roots=entries.map((_,i)=>i);
  const root=(i:number):number=>roots[i]===i?i:(roots[i]=root(roots[i]));
  const tests=new Map<string,number>(),revisions=new Map<string,number>();
  entries.forEach((project,i)=>{
    for(const kept of project.receipts){
      for(const [map,key] of [[tests,kept.experimentId],[revisions,kept.kind+':'+kept.revisionId]] as const){
        const prior=map.get(key);if(prior!==undefined)roots[root(i)]=root(prior);else map.set(key,i);
      }
    }
  });
  const credited=new Set<number>();
  const counts:Record<GemStage,number>={none:0,rough:0,cut:0,polished:0};
  entries.forEach((project,i)=>{
    if(project.stage==='polished'){
      const credit=root(i);
      if(credited.has(credit))counts.cut++;
      else{credited.add(credit);counts.polished++;}
    }else counts[project.stage]++;
  });
  const stages=(Object.keys(counts) as GemStage[]).flatMap(stage=>Array<GemStage>(counts[stage]).fill(stage));
  const level=builderLevel(stages);
  const nextAction=[
    'Save your first idea',
    'Try a change. Share what you notice.',
    'Keep a tested improvement',
    `Polish ${Math.max(0,GEM_MASTER_TARGET-counts.polished)} more ${GEM_MASTER_TARGET-counts.polished===1?'jem':'jems'}`,
    'Keep making something wonderful'
  ][level.level];
  return {...level,polishedCount:counts.polished,masterTarget:GEM_MASTER_TARGET,projectCount:projects.size,stageCounts:counts,nextAction};
}
