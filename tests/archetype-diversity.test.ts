import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archetypes,mechanicById} from '../src/archetypes/catalog';
import {playPatterns,playPatternById,validatePlayPatterns} from '../src/archetypes/play-patterns';
import {reviewDiversity,validateExperienceSignature,type ExperienceSignature} from '../src/archetypes/diversity';

const get=(id:string)=>{const p=playPatternById.get(id);assert.ok(p,'Expected design-only example '+id);return p!.signature;};

test('88 explicit design hypotheses: 4 differentiated patterns per broad game form',()=>{
 assert.doesNotThrow(validatePlayPatterns);
 assert.equal(archetypes.length,22);
 assert.equal(playPatterns.length,88);
 assert.equal(playPatternById.size,88);
 for(const a of archetypes){
  const group=playPatterns.filter(p=>p.archetypeId===a.id);
  assert.equal(group.length,4,a.id);
  assert.ok(group.every(p=>p.maturity==='design-only'),a.id+' must not claim released games');
  assert.ok(new Set(group.map(p=>p.signature.verb)).size>=2,a.id+' must include distinct player actions');
  assert.ok(new Set(group.map(p=>p.signature.goal)).size>=2,a.id+' must include distinct objectives');
  for(const pattern of group){
   assert.doesNotThrow(()=>validateExperienceSignature(pattern.signature));
   for(const m of pattern.signature.mechanics)assert.ok(mechanicById.has(m));
  }
 }
});

test('renaming the same game, changing animals or the desired art cannot buy structural novelty',()=>{
 const first=get('side-driving/rock-crawler');
 const second:ExperienceSignature={...first,theme:'Purple dinosaur rainbow ice cream canyon',payoff:'A bright unicorn cheers after the very same rock climb'};
 const review=reviewDiversity(first,second,'different-game');
 assert.equal(review.comparison,'cosmetic-only');
 assert.equal(review.gameplayChangeCount,0);
 assert.deepEqual(review.changedMechanics,[]);
 assert.equal(review.suggestedReview,'similarity-risk');
 assert.equal(review.proposedOnly,true);
 assert.ok(review.mustStillTest.some(t=>/play traces/i.test(t)));
});

test('do not falsely require a novel mechanic when child deliberately asks to reskin or do a tiny edit',()=>{
 const first=get('projectile-defense/dragon-mirror');
 const reskin:ExperienceSignature={...first,theme:'A shiny purple monster',payoff:'A glowing purple fireball lands on the same target'};
 assert.equal(reviewDiversity(first,reskin,'reskin').suggestedReview,'none');
 assert.equal(reviewDiversity(first,reskin,'similar-edit').suggestedReview,'none');
 assert.equal(reviewDiversity(first,reskin,'different-game').suggestedReview,'similarity-risk');
});

test('minor timing and presentation changes do not create the illusion of distinct gameplay',()=>{
 const base=get('platformer/star-hop');
 const faster:ExperienceSignature={...base,pace:'timed',mechanics:[...base.mechanics,'sound-effect','celebration'],theme:'Space cats'};
 const result=reviewDiversity(base,faster,'different-game');
 assert.equal(result.comparison,'cosmetic-only');
 assert.ok(result.changedDimensions.includes('pace'));
 assert.ok(!result.changedDimensions.includes('gameplay-mechanics'));
 assert.equal(result.suggestedReview,'similarity-risk');
});

test('four clearly different hill-driving experiences can share the same engine family',()=>{
 const crawl=get('side-driving/rock-crawler');
 const courier=get('side-driving/egg-courier');
 const sprint=get('side-driving/hill-sprint');
 const stunt=get('side-driving/stunt-cart');
 for(const next of [courier,sprint,stunt]){
  const review=reviewDiversity(crawl,next,'different-game');
  assert.equal(review.comparison,'different-gameplay-candidate');
  assert.equal(review.suggestedReview,'none');
  assert.ok(review.gameplayChangeCount>=2);
 }
 assert.notEqual(crawl.goal,courier.goal);
 assert.notEqual(crawl.verb,stunt.verb);
});

test('the bow-to-shield change is a real structural proposal, not a projectile color adjustment',()=>{
 const bow=get('projectile-defense/archery-range'),shield=get('projectile-defense/dragon-mirror');
 const review=reviewDiversity(bow,shield,'different-game');
 assert.equal(review.comparison,'different-gameplay-candidate');
 assert.ok(review.changedMechanics.includes('reflect-projectile'));
 assert.ok(review.changedMechanics.includes('aim-direction'));
 assert.ok(review.changedDimensions.includes('verb'));
 assert.ok(review.changedDimensions.includes('goal'));
 assert.equal(review.proposedOnly,true,'this is not evidence that rendered gameplay works');
});

test('different archetype labels alone do not guarantee a distinct underlying loop',()=>{
 const runner=get('endless-runner/snack-dash');
 const flight:ExperienceSignature={...runner,archetypeId:'flight-dodge',theme:'Flying instead of running'};
 const review=reviewDiversity(runner,flight,'different-game');
 assert.equal(review.comparison,'cosmetic-only');
 assert.equal(review.suggestedReview,'similarity-risk');
});

test('an extra real gameplay mechanic, but the same main loop, is an unverified small variation',()=>{
 const base=get('endless-runner/snack-dash');
 const proposed:ExperienceSignature={...base,mechanics:[...base.mechanics,'teleport']};
 const review=reviewDiversity(base,proposed,'different-game');
 assert.equal(review.comparison,'small-gameplay-variation');
 assert.deepEqual(review.changedMechanics,['teleport']);
 assert.equal(review.suggestedReview,'similarity-risk');
});

test('input validation rejects fake gameplay dimensions, missing mechanic IDs and duplicate mechanics',()=>{
 const base=get('grid-navigation/robot-exit');
 assert.throws(()=>reviewDiversity(base,{...base,verb:'anything' as any},'different-game'),/GAME_EXPERIENCE_SIGNATURE_INVALID/);
 assert.throws(()=>reviewDiversity(base,{...base,mechanics:[...base.mechanics,'fantasy-ai-action']},'different-game'));
 assert.throws(()=>reviewDiversity(base,{...base,mechanics:[...base.mechanics,base.mechanics[0]]},'different-game'));
 assert.throws(()=>reviewDiversity(base,{...base,payoff:'yes'},'different-game'));
 assert.throws(()=>reviewDiversity(base,base,'novelty-forced' as any),/GAME_DIVERSITY_RELATIONSHIP_INVALID/);
});

test('no declared novelty score replaces real gameplay observation or child consent',()=>{
 const patterns=['drag-creation/sticker-rocket','drag-creation/dress-up','drag-creation/dancing-robot','drag-creation/drawn-mural'];
 for(const id of patterns){
  const result=reviewDiversity(get(patterns[0]),get(id),'different-game');
  assert.equal(result.proposedOnly,true);
  assert.ok(result.mustStillTest.some(x=>/children/i.test(x)));
  assert.ok(result.mustStillTest.some(x=>/child.*requested action/i.test(x)));
 }
});

test('each play pattern selects its own mechanic mix instead of inheriting every genre example',()=>{
 const archery=get('projectile-defense/archery-range'),dragon=get('projectile-defense/dragon-mirror');
 assert.ok(archery.mechanics.includes('aim-direction'));
 assert.ok(archery.mechanics.includes('fire-projectile'));
 assert.ok(!archery.mechanics.includes('reflect-projectile'),'archery must not silently become shield reflection');
 assert.ok(!archery.mechanics.includes('shield-window'));
 assert.ok(dragon.mechanics.includes('reflect-projectile'));
 assert.ok(dragon.mechanics.includes('shield-window'));
 const hill=get('side-driving/egg-courier');
 assert.ok(hill.mechanics.includes('drive-throttle'),'editorial driving patterns keep the actual vehicle control');
});

test('same-family play patterns cannot collapse into mere art, reward-text or timing variations',()=>{
 let comparisons=0;let distinct=0;let minor=0;
 for(const archetype of archetypes){
  const variants=playPatterns.filter(p=>p.archetypeId===archetype.id);
  for(let i=0;i<variants.length;i++)for(let j=i+1;j<variants.length;j++){
   const check=reviewDiversity(variants[i].signature,variants[j].signature,'different-game');
   comparisons++;
   assert.notEqual(check.comparison,'cosmetic-only',
    'same-family patterns must not differ only in art: '+variants[i].id+' versus '+variants[j].id);
   if(check.comparison==='different-gameplay-candidate')distinct++;else minor++;
  }
 }
 assert.equal(comparisons,22*6);
 assert.ok(distinct>minor,'the editorial catalog must emphasize substantial, not tiny, differences');
 // No numeric novelty score or observed-child delight is manufactured by these counts.
});

test('rhythm and dialogue can affect play; only inert embellishments are ignored',()=>{
 const b=get('choice-discovery/splash-choice');
 const moreStory:ExperienceSignature={...b,mechanics:[...b.mechanics,'narrative-dialogue']};
 assert.equal(reviewDiversity(b,moreStory,'different-game').comparison,'small-gameplay-variation');
 const rhythm:ExperienceSignature={...b,mechanics:[...b.mechanics,'rhythm-beat']};
 assert.ok(reviewDiversity(b,rhythm,'different-game').changedMechanics.includes('rhythm-beat'));
 const decorated:ExperienceSignature={...b,mechanics:[...b.mechanics,'sound-effect','celebration','launch-animation']};
 assert.equal(reviewDiversity(b,decorated,'different-game').comparison,'cosmetic-only');
});
