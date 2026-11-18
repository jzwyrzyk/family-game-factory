import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  generationDesignBrief,recommendGameForm,reviewGameEvidence,QUALITY_AXES,
  type GameQualityEvidence,type GameFormAdvice
} from '../server/quality/game-intelligence';

const cases: Array<[string,GameFormAdvice['motion'],GameFormAdvice['interaction']]> = [
  ['Make a game where you put socks together with bubble gum and press a button to blast off.','rule-driven','drag-and-drop'],
  ['Bubble Gum Builders: decorate a robot with stickers, then make it go.','rule-driven','drag-and-drop'],
  ['Build a rocket by dragging colorful pieces together.','rule-driven','drag-and-drop'],
  ['Stick parts on a submarine and watch it dive away.','rule-driven','drag-and-drop'],
  ['Make a robot route puzzle with arrow commands on a grid.','rule-driven','grid-puzzle'],
  ['Program a robot to reach its charging station without obstacles.','rule-driven','grid-puzzle'],
  ['Build a maze that my robot follows.','rule-driven','grid-puzzle'],
  ['Make a cat eat donuts on the moon, grow bigger, and explode into stars.','rule-driven','arcade'],
  ['Make a rocket fly through hoops and collect stars.','rule-driven','arcade'],
  ['Make a game where I jump over candy monsters.','rule-driven','arcade'],
  ['Create a car that collects coins and changes color.','rule-driven','arcade'],
  ['Drive a car over bumpy hills with working suspension.','physics-2d','driving'],
  ['Make a physics engine game where balls bounce off walls.','physics-2d','open-ended'],
  ['Build a tower that collapses under weight.','physics-2d','open-ended'],
  ['Launch a ball with a catapult trajectory.','physics-2d','open-ended'],
  ['Make a game with realistic gravity and jumping.','physics-2d','arcade'],
  ['Make a racing game where you drive on a track.','rule-driven','driving'],
  ['Create a drag-and-drop rocket that launches, no physics.','rule-driven','drag-and-drop'],
  ['Make a colorful robot that dances when I tap it.','rule-driven','open-ended'],
  ['Make a 3D robot that can be walked around in three dimensions.','rule-driven','open-ended'],
  ['Create a space world where I fly through all three axes.','rule-driven','open-ended'],
  ['I want realistic gravity but no physics for this game.','needs-review','open-ended'],
];
test('game form: representative novel and established jems concepts use required behavior, not theme',()=>{
  for(const [idea,motion,interaction] of cases){
    const advice = recommendGameForm(idea);
    assert.equal(advice.motion,motion,idea);
    assert.equal(advice.interaction,interaction,idea);
    assert.equal(advice.provenance,'deterministic-advisory-not-child-approved');
    assert.ok(advice.constraints.some(t=>t.includes('child idea verbatim')));
  }
});
test('2D is independent from the decision to run physics; explicit 3D is not falsely claimed supported',()=>{
 const physical = recommendGameForm('Drive a truck over hilly terrain with suspension');
 assert.equal(physical.surface,'2d-canvas');assert.equal(physical.motion,'physics-2d');
 const requested3d = recommendGameForm('Make a 3D robot that can be walked around in three dimensions.');
 assert.equal(requested3d.surface,'3d-requested');
 assert.match(requested3d.capabilities.join(' '),/not supported/);
 assert.equal(recommendGameForm('Make a 2d physics game with realistic collisions').surface,'2d-canvas');
});
test('design advice is advisory, bounded, and includes observable first-play acceptance questions',()=>{
 const input='Make a game about a moon donut cat.';
 const brief=generationDesignBrief(input);
 assert.equal(brief.status,'ADVISORY_NOT_VALIDATED');
 assert.ok(brief.acceptanceQuestions.some(q=>q.includes('physics')));
 assert.ok(brief.acceptanceQuestions.some(q=>q.includes('payoff')));
 assert.ok(!JSON.stringify(brief).includes(input));
 assert.equal(recommendGameForm('Make a game about a pink lion').confidence,'tentative');
 assert.ok(recommendGameForm('Make a game '.repeat(5000)).reasoning.length>0);
});
test('quality evidence is a coverage and failure ledger, not a fabricated fun score',()=>{
 const noEvidence=reviewGameEvidence([]);
 assert.equal(noEvidence.decision,'incomplete');
 assert.deepEqual(noEvidence.missing,QUALITY_AXES);
 const allPass:GameQualityEvidence[]=QUALITY_AXES.map(axis=>({axis,result:'pass',source:'automated',reason:'Fixture evidence only'}));
 const automated=reviewGameEvidence(allPass);
 assert.equal(automated.decision,'await-child-playtest');
 assert.match(automated.unsupportedClaims.join(' '),/No automated assessment establishes enjoyment/);
 assert.equal(reviewGameEvidence([...allPass.slice(0,3),{...allPass[3],result:'fail'},...allPass.slice(4)]).decision,'blocked');
 assert.equal(reviewGameEvidence([{...allPass[0],result:'not-tested'}]).decision,'incomplete');
 assert.throws(()=>reviewGameEvidence([allPass[0],allPass[0]]),/DUPLICATE/);
 assert.throws(()=>reviewGameEvidence([{...allPass[0],reason:''}]),/INVALID/);
});

test('the private agent supplies a design brief and removes unnecessary physics API instructions',async()=>{
 const {OpenAIResponsesAgent}=await import('../server/agent/openai');
 const {hopper}=await import('../server/testing/generated-fixtures');
 const requests:any[]=[];
 const agent=new OpenAIResponsesAgent(
  {enabled:true,approvalId:'fixture-only',model:'game-intelligence-unit-test',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:64000,maxOutputTokens:4000,priceReviewedOn:new Date().toISOString().slice(0,10)},
  ()=> 'not-real-unit-test-provider-key',
  (async(_url,init)=>{
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(hopper)}]}],usage:{input_tokens:100,output_tokens:250}}));
  }) as typeof fetch
 );
 const base={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},baseRevision:{id:'new'},
   allowedCapabilities:['generated-module-v2'],budget:{maxUnits:100000,timeoutMs:60000},signal:new AbortController().signal};
 await agent.generate({...base,childIntent:'Stick pieces of bubble gum on a robot and watch it launch.'});
 await agent.generate({...base,childIntent:'Drive a car over bumpy hills with realistic suspension.'});
 assert.equal(requests.length,2);
 const ruleBased=requests[0],physical=requests[1];
 assert.equal(ruleBased.store,false);assert.equal(ruleBased.text.format.strict,true);
 assert.ok(!ruleBased.instructions.includes('physics.join({id'));
 assert.ok(ruleBased.instructions.includes('Do not call api.physics'));
 assert.ok(physical.instructions.includes('physics.join({id'));
 assert.equal(JSON.parse(ruleBased.input).gameDesignPreflight.motion,'rule-driven');
 assert.equal(JSON.parse(physical.input).gameDesignPreflight.motion,'physics-2d');
 assert.equal(JSON.parse(ruleBased.input).idea,'Stick pieces of bubble gum on a robot and watch it launch.');
 assert.match(ruleBased.instructions,/The preflight design brief is an advisory hypothesis/);
});
