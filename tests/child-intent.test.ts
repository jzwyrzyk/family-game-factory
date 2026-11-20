import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CHILD_INTENT_VERSION,draftChildIntentContract,validateChildIntentContract,
  exactIntentSpan,type ChildIntentContract
} from '../server/quality/child-intent';

const clone=(value:ChildIntentContract)=>JSON.parse(JSON.stringify(value)) as ChildIntentContract;
const kinds=(value:ChildIntentContract)=>value.facts.map(f=>f.facet);

test('O1: gum-and-socks creation retains original words, assembly action and blast-off payoff in order',()=>{
  const raw='Make a game where you put socks together with bubble gum, then blast off!';
  const c=draftChildIntentContract(raw,{projectId:'family-game-1',baseRevisionId:'rev-9'});
  assert.equal(c.version,CHILD_INTENT_VERSION);
  assert.equal(c.status,'proposed-not-child-confirmed');
  assert.equal(c.source.raw,raw);
  assert.equal(c.source.offsets,'utf16');
  assert.deepEqual(c.revision,{projectId:'family-game-1',baseRevisionId:'rev-9'});
  const action=c.facts.find(f=>f.facet==='player-action');
  const payoff=c.facts.find(f=>f.facet==='payoff');
  assert.ok(action&&payoff);
  assert.match(action.evidence.quote,/put socks together with bubble gum/);
  assert.equal(payoff.evidence.quote,'blast off');
  assert.ok(c.facts.some(f=>f.facet==='entity-mention'&&f.evidence.quote==='socks'));
  assert.ok(c.facts.some(f=>f.facet==='entity-mention'&&f.evidence.quote==='bubble gum'));
  assert.ok(c.relations.some(r=>r.kind==='sequence'&&r.from===action.id&&r.to===payoff.id&&/\bthen\b/.test(r.evidence.quote)));
  for(const f of c.facts)assert.equal(raw.slice(f.evidence.start,f.evidence.end),f.evidence.quote);
  for(const r of c.relations)assert.equal(raw.slice(r.evidence.start,r.evidence.end),r.evidence.quote);
  assert.deepEqual(validateChildIntentContract(c),c);
});

test('O1: cat eats donuts, grows and explodes: distinct proposed action/effect/payoff, no invented win',()=>{
  const raw='Make a game where a cat eats donuts and grows bigger and explodes into stars.';
  const c=draftChildIntentContract(raw);
  const story=c.facts.filter(f=>f.facet!=='entity-mention').map(f=>f.facet);
  assert.deepEqual(story,['player-action','observable-effect','payoff']);
  assert.ok(c.facts.some(f=>f.facet==='entity-mention'&&f.evidence.quote==='cat'));
  assert.ok(c.facts.some(f=>f.facet==='entity-mention'&&f.evidence.quote==='donuts'));
  assert.equal(c.facts.some(f=>f.facet==='goal'),false);
  assert.equal(c.unknowns.some(u=>u.code==='player-action-not-stated'),false);
});

test('O1: route robot and physical car are recorded only as child facts; no premature engine choices',()=>{
  const cases=['Program a robot on a grid to follow a route.','Drive a car over bumpy hills with working suspension.'];
  for(const raw of cases){
    const c=draftChildIntentContract(raw);
    assert.ok(kinds(c).includes('player-action'));
    assert.equal(JSON.stringify(c).includes('physics-2d'),false);
    assert.equal(JSON.stringify(c).includes('2d-canvas'),false);
    assert.equal(JSON.stringify(c).includes('3d-requested'),false);
    assert.equal(c.revision.baseRevisionId,null);
  }
});

test('O1: ambiguous drawing, missing player action, vague edits, 3D wording and contrasts stay unresolved',()=>{
  const draw=draftChildIntentContract('Draw a cat with wheels.');
  assert.ok(draw.unknowns.some(u=>u.code==='drawing-role-needs-review'));
  assert.ok(draw.facts.some(f=>f.facet==='entity-mention'&&f.evidence.quote==='wheels'));
  const vague=draftChildIntentContract('A game about a cat.');
  assert.ok(vague.unknowns.some(u=>u.code==='player-action-not-stated'));
  assert.ok(vague.unknowns.some(u=>u.code==='goal-or-payoff-not-stated'));
  assert.ok(vague.facts.every(f=>f.annotation==='rule-proposal'));
  const edit=draftChildIntentContract('Make it better',{projectId:'p',baseRevisionId:'rev-12'});
  assert.ok(edit.unknowns.some(u=>u.code==='revision-scope-needs-review'));
  assert.equal(edit.revision.baseRevisionId,'rev-12');
  const depth=draftChildIntentContract('Make a 3D game where I can fly in depth.');
  assert.ok(depth.unknowns.some(u=>u.code==='depth-meaning-needs-review'));
  const conflict=draftChildIntentContract('No physics, but realistic gravity!');
  assert.ok(conflict.unknowns.some(u=>u.code==='contrast-needs-review'));
  assert.ok(conflict.facts.some(f=>f.facet==='negative-constraint'&&f.evidence.quote==='No physics'));
  assert.equal(conflict.status,'proposed-not-child-confirmed');
});

test('O1: negative requests and named characters are quoted mentions, never mandatory inclusions',()=>{
  const raw='Make a game with no robots, without music.';
  const c=draftChildIntentContract(raw);
  assert.ok(c.facts.some(f=>f.facet==='negative-constraint'));
  const robots=c.facts.find(f=>f.evidence.quote==='robots');
  assert.equal(robots?.facet,'entity-mention');
  assert.equal(c.status,'proposed-not-child-confirmed');
  assert.ok(!Object.hasOwn(c,'approved'));
});

test('O1: exact spans handle emoji/Unicode, reject shifted offsets and repeated ambiguous quotations',()=>{
  const raw='🐱 Cat eats donuts and cat jumps.';
  const s=exactIntentSpan(raw,'Cat');
  assert.equal(s.start,3);
  assert.equal(raw.slice(s.start,s.end),s.quote);
  assert.throws(()=>exactIntentSpan('cat cat','cat'),/CHILD_INTENT_INVALID_QUOTE_AMBIGUOUS_OR_ABSENT/);
  assert.deepEqual(exactIntentSpan('cat cat','cat',1),{start:4,end:7,quote:'cat'});
  assert.throws(()=>exactIntentSpan(raw,'Cat',2),/CHILD_INTENT_INVALID_QUOTE_AMBIGUOUS_OR_ABSENT/);
  assert.throws(()=>exactIntentSpan(raw,'🐱',-1),/CHILD_INTENT_INVALID_QUOTE_INDEX/);
  const c=draftChildIntentContract(raw);
  const bad=clone(c);
  bad.facts[0].evidence={start:1,end:2,quote:raw.slice(1,2)};
  assert.throws(()=>validateChildIntentContract(bad),/CHILD_INTENT_INVALID_SOURCE_SPAN/);
});

test('O1: validator fails closed on fake source/quote, invalid refs, invented fields and forged approval',()=>{
  const base=draftChildIntentContract('Drag socks together, then blast off.',{projectId:'p1',baseRevisionId:'rev-1'});
  const modify=(apply:(c:ChildIntentContract)=>void)=>{const c=clone(base);apply(c);return c;};
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.source.raw+='!';})),/ORIGINAL_SOURCE/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.source.sha256='f'.repeat(64);})),/ORIGINAL_SOURCE/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.facts[0].evidence.quote='launch a spaceship';})),/SOURCE_SPAN/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.facts[0].facet='fun' as any;})),/FACT/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.facts[1].id=c.facts[0].id;})),/FACT/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.relations[0].to='not-a-fact';})),/RELATION/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.relations[0].evidence=c.facts[0].evidence;})),/RELATION_EVIDENCE/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.revision.baseRevisionId='../../another-family';})),/REVISION_REF/);
  assert.throws(()=>validateChildIntentContract({...base,status:'confirmed-by-child'}),/VERSION/);
  assert.throws(()=>validateChildIntentContract({...base,published:true}),/FIELDS/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{(c.facts[0] as any).approval=true;})),/FIELDS/);
  assert.throws(()=>validateChildIntentContract(modify(c=>{c.unknowns=[{code:'fun-score' as any}];})),/UNKNOWN_CODE/);
});

test('O1: controls are bounded; the extractor refuses data loss or mutation without source support',()=>{
  assert.throws(()=>draftChildIntentContract(''),/ORIGINAL_SOURCE/);
  assert.throws(()=>draftChildIntentContract('X'.repeat(4001)),/ORIGINAL_SOURCE/);
  assert.throws(()=>draftChildIntentContract('hello\0world'),/ORIGINAL_SOURCE/);
  assert.throws(()=>draftChildIntentContract('Make a game.',{projectId:'../../secret'}),/REVISION_REF/);
  const many='Drag a cat. '.repeat(35);
  assert.throws(()=>draftChildIntentContract(many),/FACT_LIMIT/);
  const raw='Make a simple game about a robot.';
  const c=draftChildIntentContract(raw);
  assert.equal(c.source.raw,raw);
  assert.ok(!c.facts.some(f=>f.facet==='payoff'));
  assert.ok(c.unknowns.some(u=>u.code==='goal-or-payoff-not-stated'));
});

test('O1: validator creates a defensive copy and does not bless reviewer labels as confirmed',()=>{
  const c=draftChildIntentContract('Tap a rocket, then blast off.');
  const a=clone(c);
  a.facts[0].annotation='reviewer-proposal';
  const validated=validateChildIntentContract(a);
  a.facts[0].evidence.quote='edited after validation';
  assert.notEqual(validated.facts[0].evidence.quote,'edited after validation');
  assert.equal(validated.status,'proposed-not-child-confirmed');
  assert.equal(validated.facts[0].annotation,'reviewer-proposal');
});
