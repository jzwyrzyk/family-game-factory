import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PLAN_FIELDS} from '../src/studio/design';
import {assertProductionPlanBinding,bindGameProductionPlan,validateGameProductionPlan,validateSuggestedPlaythrough} from '../server/quality/presentation-plan';
import {bindProviderQualityReview,bindQualityReview,qualityRepairContext,requireQualityPass,validateQualityEvidence} from '../server/quality/game-quality';
import {choiceSources} from '../server/quality/production-design';
import {safeRepairDiagnostic} from '../server/quality/repair-diagnostics';
import {requireProductionCandidate} from '../server/quality/quality-policy';
import {validateGenerated,type GeneratedGame} from '../server/agent/generated';
import {captureHorizon} from '../server/quality/game-quality-evidence.cjs';
import {safeActions} from '../server/sandbox/quality-capture.cjs';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {fixturePremiumPlanProposal,fixturePlanProposal,syntheticPremiumReviewAnswer,syntheticQualityEvidence} from '../server/testing/presentation-quality-fixtures';
import type {AgentInput} from '../server/pipeline/types';
import {compileArtFixture,pixelGame} from './generated-art-fixtures';

const idea='A pixel-art fox runs sideways.\nGame choices in order (newer changes take priority):\naction: Jump over low leaves\nmovement (jems suggested "duck under \\"tall\\" leaves", child chose): crouch for tall leaves\nAlso: Celebrate after 100 leaves!';
const input:AgentInput={gameManifest:{id:'generated',allowedMechanics:[]},baseRevision:{id:'new'},childIntent:idea,allowedCapabilities:[],budget:{maxUnits:1,timeoutMs:60000},signal:new AbortController().signal};
const proposal={...fixturePremiumPlanProposal(),presentationStyle:'pixel'};
const premiumPlan=()=>bindGameProductionPlan(proposal,input,true);
const legacyPlan=()=>bindGameProductionPlan({...fixturePlanProposal({}),presentationStyle:'pixel'},input);
function rawGame():GeneratedGame{
 return {...pixelGame(),controls:['action'],playthrough:[{type:'hold',control:'action',frames:60}],productionPlan:premiumPlan()};
}
test('premium planning binds all required design fields and preserves selected helper wording and chronology',()=>{
 const plan=premiumPlan();
 assert.equal(plan.version,'game-production-plan-v2');
 if(plan.version!=='game-production-plan-v2')throw Error('Expected premium plan');
 assert.deepEqual(plan.choiceSources.map(({origin,start,end})=>[origin,idea.slice(start,end)]),[
  ['request','A pixel-art fox runs sideways.'],['child-choice','action: Jump over low leaves'],
  ['helper-suggested-child-chose','movement (jems suggested "duck under \\"tall\\" leaves", child chose): crouch for tall leaves'],
  ['child-choice','Also: Celebrate after 100 leaves!']
 ]);
 assert.deepEqual(assertProductionPlanBinding(plan,input,true),plan);
 for(const key of Object.keys(proposal.design)){
  const incomplete={...proposal.design};delete incomplete[key as keyof typeof incomplete];
  assert.throws(()=>bindGameProductionPlan({...proposal,design:incomplete},input,true),/PRODUCTION_PLAN_INVALID/);
 }
 assert.throws(()=>bindGameProductionPlan({...proposal,choiceSources:[]},input,true),/PRODUCTION_PLAN_INVALID/);
 assert.throws(()=>assertProductionPlanBinding({...plan,choiceSources:plan.choiceSources.slice(1)},input,true),/BINDING/);
 assert.throws(()=>assertProductionPlanBinding(plan,{...input,baseRevision:{id:'other'}},true),/BINDING/);
 assert.throws(()=>assertProductionPlanBinding(legacyPlan(),input,true),/BINDING/);
 assert.throws(()=>assertProductionPlanBinding(plan,input,false),/BINDING/);
 assert.throws(()=>validateGameProductionPlan({...plan,openEnded:true,design:{...plan.design,payoffState:'won'}}),/INVALID/);
 assert.throws(()=>validateGameProductionPlan({...plan,design:{...plan.design,controls:'x'.repeat(321)}}),/INVALID/);
 for(const field of PLAN_FIELDS){
  const source='My idea\nGame choices in order (newer changes take priority):\n'+field+' (jems suggested "offer one" + "offer two", child chose): my selection';
  assert.equal(choiceSources(source).at(-1)?.origin,'helper-suggested-child-chose',field);
 }
 assert.deepEqual(choiceSources('An ordinary edit, no provenance stated.'),[{origin:'request',start:0,end:39}]);
});
test('only a request-bound premium job may use the longer schema; ordinary source and sandbox limits still apply',()=>{
 const game=rawGame(),job={qualityRequired:'game-quality-v1' as const,baseRevisionId:null,prompt:idea};
 assert.throws(()=>requireProductionCandidate(job,game),/BINDING/);
 assert.throws(()=>requireProductionCandidate({...job,qualityRequired:undefined},game),/BINDING/);
 const pin={...job,premiumPolicy:{version:'adult-astra-high-v1' as const,fingerprint:'a'.repeat(64),workerSha:'a'.repeat(40)}};
 requireProductionCandidate(pin,game);
 assert.throws(()=>requireProductionCandidate({...pin,prompt:idea+' edit'},game),/BINDING/);
 assert.throws(()=>requireProductionCandidate(pin,{...game,productionPlan:legacyPlan()}),/BINDING/);
 const long=Array.from({length:120},()=>({type:'hold' as const,control:'action' as const,frames:60}));
 const rich=validateGenerated({...game,playthrough:long});
 assert.equal(safeActions(rich).length,120);
 assert.equal(captureHorizon(rich),7200);
 assert.equal(captureHorizon(game),600);
 assert.throws(()=>validateGenerated({...rich,source:'x'.repeat(30001)}),/ARTIFACT_REJECTED/);
 assert.throws(()=>validateSuggestedPlaythrough([...long,{type:'wait',frames:1}],true),/PLAYTHROUGH_INVALID/);
 assert.throws(()=>validateSuggestedPlaythrough(Array.from({length:129},()=>({type:'wait',frames:1})),true),/PLAYTHROUGH_INVALID/);
 assert.throws(()=>validateGenerated({...rich,productionPlan:legacyPlan()}),/PLAYTHROUGH_INVALID/);
 assert.throws(()=>safeActions({...rich,productionPlan:legacyPlan()}),/PLAYTHROUGH_INVALID/);
 assert.throws(()=>renderGeneratedV2(compileArtFixture(rich),'test','test-channel',{auditTicks:7201}),/AUDIT_TICK_LIMIT/);
 assert.throws(()=>renderGeneratedV2(compileArtFixture({...rich,productionPlan:legacyPlan()}),'test','test-channel',{auditTicks:601}),/AUDIT_TICK_LIMIT/);
});
test('an interaction pass cites a changed matching ordinary receipt and actual resulting capture on each device',()=>{
 const game=compileArtFixture(rawGame()),e=syntheticQualityEvidence(game),answer=syntheticPremiumReviewAnswer();
 const review=bindQualityReview(game,e,answer);
 assert.equal(requireQualityPass(game,e,review).version,'game-quality-review-v2');
 const [desktop,tablet]=answer.observations;
 for(const observations of [[],[desktop],[desktop,desktop],[desktop,{...tablet,captureId:'desktop-progress'}],[desktop,{...tablet,captureId:'tablet-initial'}],
  [desktop,{...tablet,actionIndex:1}],[desktop,{...tablet,actionIndex:0.5}]]){
  assert.throws(()=>bindQualityReview(game,e,{...answer,observations}),/UNGROUNDED|INVALID/);
 }
 assert.throws(()=>bindQualityReview(game,e,{...answer,evidenceByAxis:{...answer.evidenceByAxis,gameplay:['desktop-initial','tablet-initial']}}),/UNGROUNDED/);
 assert.throws(()=>validateQualityEvidence(game,{...e,sessions:e.sessions.map(s=>({...s,actionTrace:s.actionTrace.map(t=>({...t,action:{...t.action,type:'tap',x:1,y:2}}))}))}));
 assert.throws(()=>requireQualityPass(game,e,{...review,observations:[]}),/UNGROUNDED/);
 const expired={...e,captures:e.captures.map(c=>c.phase==='progress'?{...c,tick:1}:c)};
 assert.throws(()=>bindQualityReview(game,expired,answer),/UNGROUNDED/);
});
test('jump evidence cannot stand in for duck, a terminal payoff or two different tap interactions',()=>{
 const plan=premiumPlan();
 if(plan.version!=='game-production-plan-v2')throw Error('Expected premium plan');
 const interactions=[...plan.design.interactions,{action:'Crouch.',input:'down' as const,consequence:'The fox slides beneath a leaf.'}];
 const game=compileArtFixture({...rawGame(),productionPlan:{...plan,design:{...plan.design,interactions}}});
 const e=syntheticQualityEvidence(game),answer=syntheticPremiumReviewAnswer();
 const unsupported=[...answer.observations,...answer.observations.map(o=>({...o,interaction:1}))];
 assert.throws(()=>bindQualityReview(game,e,{...answer,observations:unsupported}),/UNGROUNDED/);
 const unknown=bindQualityReview(game,e,{...answer,axes:{...answer.axes,intent:'not-tested'}});
 assert.equal(unknown.verdict,'unverified');
 const diagnostic=safeRepairDiagnostic('QUALITY_REVIEW_FAILED',undefined,qualityRepairContext(game,unknown));
 assert.match(diagnostic.feedback,/indices 1 on desktop/);
 assert.match(diagnostic.feedback,/indices 1 on tablet/);
 assert.throws(()=>requireQualityPass(game,e,unknown),/QUALITY_REVIEW_FAILED/);
 const sharedInput=compileArtFixture({...game,productionPlan:{...plan,design:{...plan.design,interactions:interactions.map(i=>({...i,input:'action'}))}}});
 assert.throws(()=>bindQualityReview(sharedInput,syntheticQualityEvidence(sharedInput),{...answer,observations:unsupported}),/UNGROUNDED/);
 const final=compileArtFixture({...game,productionPlan:{...plan,design:{...plan.design,payoffState:'won'}}});
 assert.throws(()=>bindQualityReview(final,syntheticQualityEvidence(final),answer),/UNGROUNDED/);
});

test('a final scene after another ordinary input cannot attest an earlier transient action',()=>{
 const base=rawGame(),plan=base.productionPlan!;
 if(plan.version!=='game-production-plan-v2')throw Error('Expected premium plan');
 const game=compileArtFixture({...base,controls:['action','down'],playthrough:[...base.playthrough!,{type:'hold',control:'down',frames:60}]});
 const e=syntheticQualityEvidence(game);
 for(const session of e.sessions)session.actionTrace.push({...session.actionTrace[0],action:{type:'hold',control:'down',frames:60},index:1,startTick:80,endTick:140});
 assert.throws(()=>bindQualityReview(game,e,syntheticPremiumReviewAnswer()),/QUALITY_REVIEW_UNGROUNDED/);
});

test('an unsupported provider pass enters bounded repair, while malformed or cross-artifact reviews stay invalid',()=>{
 const game=compileArtFixture(rawGame()),e=syntheticQualityEvidence(game),answer=syntheticPremiumReviewAnswer();
 const unsupported={...answer,observations:[]};
 const review=bindProviderQualityReview(game,e,unsupported);
 assert.equal(review.verdict,'unverified');
 assert.deepEqual(review.findings,['QUALITY_EVIDENCE_INCOMPLETE']);
 assert.ok(Object.values(review.axes).every(status=>status==='not-tested'));
 assert.deepEqual(review.observations,[]);
 assert.throws(()=>bindQualityReview(game,e,unsupported),/UNGROUNDED/);
 const wrongFirst={...answer.observations[0],captureId:'desktop-initial'};
 assert.throws(()=>bindProviderQualityReview(game,e,{...answer,observations:[wrongFirst,{...wrongFirst,actionIndex:128}]}),/INVALID/);
 assert.throws(()=>bindProviderQualityReview(game,e,{...unsupported,findings:['QUALITY_EVIDENCE_INCOMPLETE']}),/CONTRADICTORY/);
 assert.throws(()=>bindProviderQualityReview(game,{...e,artifactHash:'0'.repeat(64)},unsupported),/BINDING/);
});
