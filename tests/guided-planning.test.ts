import assert from 'node:assert/strict';
import test from 'node:test';
import {freshDesign,validateDesign} from '../src/studio/design';
import {nextGuidedField,guidedDelegation,isGuidanceHelp,explicitPlanChoices,compileGuidedBuild,authoredFollowupIntents,isHelperAuthoredTurn} from '../src/studio/guided-planning';
import type {Message} from '../src/studio/notebook';
const message=(id:string,role:Message['role'],text:string):Message=>({id,role,text,at:new Date().toISOString()});

test('limited local prompts skip literal child decisions without asserting readiness',()=>{
 const design=freshDesign();
 Object.assign(design.plan,explicitPlanChoices('A cat jumps between donuts. I want silly surprises and pixel art.'));
 assert.equal(nextGuidedField(design),'goal');
 assert.equal(design.plan.action?.value,'A cat jumps between donuts.');
 assert.equal(design.plan.fun?.origin,'child');
 assert.equal(design.plan.style?.accepted,true);
 assert.equal(design.approvedPlan,false);
 assert.doesNotThrow(()=>validateDesign(design));
});

test('a generic build request, question, or request for help is not invented design intent',()=>{
 assert.deepEqual(explicitPlanChoices('Build a game for me.'),{});
 assert.deepEqual(explicitPlanChoices('How do I collect points?'),{});
 assert.deepEqual(explicitPlanChoices("I don't know if points should be fun."),{});
 assert.equal(isGuidanceHelp('Explain what you mean'),true);
 assert.equal(isGuidanceHelp('Make it feel calm'),false);
});

test('requests to delegate are recognized but do not provide any child decisions',()=>{
 for(const text of ['You choose.','skip','Surprise me!'])assert.equal(guidedDelegation(text),'field');
 for(const text of ['Choose the rest','You choose the rest.','skip all'])assert.equal(guidedDelegation(text),'remaining');
 for(const text of ['I do not want you to choose','You choose a character and then race','Skip over the rocks','I do not know'])assert.equal(guidedDelegation(text),null);
 assert.deepEqual(explicitPlanChoices('Choose the rest'),{});
 const design=freshDesign();
 design.plan.action={value:'Jump over clouds',origin:'helper',accepted:true,delegated:false};
 design.plan.fun={value:'',origin:'helper',accepted:false,delegated:true};
 assert.equal(nextGuidedField(design),'action','a legacy helper choice does not become the child’s answer');
});

test('build formatter preserves child intent and omits helper choices and delegated defaults',()=>{
 const design=freshDesign();
 design.plan.action={value:'The cat catches donuts with a bubblegum net.',origin:'child',accepted:true,delegated:false};
 design.plan.style={value:'Colorful cartoon art',origin:'helper',accepted:true,delegated:false};
 design.plan.setback={value:'No losing',origin:'child',accepted:true,delegated:false};
 design.plan.special={value:'Make up the rest',origin:'helper',accepted:false,delegated:true};
 const before=JSON.stringify(design),idea='The cat catches donuts with a bubblegum net.';
 const payload=compileGuidedBuild(idea,design,'Let the donuts bounce away if I miss.');
 assert.equal(payload.split(idea).length-1,1);
 assert.match(payload,/Also: Let the donuts bounce away if I miss\./);
 assert.match(payload,/setback: No losing/);
 assert.doesNotMatch(payload,/cartoon|Make up the rest|Choose sensible details|Not specified/);
 assert.equal(JSON.stringify(design),before);
});

test('identical explicit absence decisions retain their individual meanings',()=>{
 const design=freshDesign();
 design.plan.setback={value:'None',origin:'child',accepted:true,delegated:false};
 design.plan.score={value:'None',origin:'child',accepted:true,delegated:false};
 const payload=compileGuidedBuild('A moon cat game',design);
 assert.match(payload,/setback: None/);assert.match(payload,/score: None/);
});

test('creative questions during a coach question survive as authored follow-up intent',()=>{
 const design=freshDesign();
 const messages=[message('idea','child','A cat jumps over stones.'),message('feel','helper','How should it feel?'),message('clouds','child','Could the clouds be trampolines?'),message('follow','helper','What would make that fun to play?'),message('answer','child','I want calm discoveries.')];
 design.plan.fun={value:'I want calm discoveries.',origin:'child',accepted:true,delegated:false};
 assert.deepEqual(authoredFollowupIntents(messages,design),['Could the clouds be trampolines?']);
});

test('only actually saved whole answers are skipped after their choices change',()=>{
 const design=freshDesign();
 const messages=[message('idea','child','A cat jumps over stones.'),message('feel','helper','How should it feel?'),message('silly','child','Funny surprises'),message('revise','child','Actually make it calm instead.'),message('extra','child','The dragon sneezes bubbles.')];
 design.ideas.push({id:'plan-answer:silly',text:'Funny surprises',origin:'child',adopted:true});
 design.plan.fun={value:'Actually make it calm instead.',origin:'child',accepted:true,delegated:false};
 assert.deepEqual(authoredFollowupIntents(messages,design),['The dragon sneezes bubbles.']);
});

test('legacy helper-origin chat turns and rejected turns never become first-build intent',()=>{
 const design=freshDesign();
 const messages=[message('idea','child','A cat jumps over stones.'),message('helper','child','Give the cat a laser.'),message('private','child','Use rejected private details.'),message('refusal','helper','I can help with safe game ideas. Let’s try another idea without sharing private details.'),message('extra','child','The clouds are trampolines.')];
 design.ideas.push({id:'build-intent:helper',text:'Give the cat a laser.',origin:'helper',adopted:true});
 assert.equal(isHelperAuthoredTurn(messages[1],design),true);
 assert.deepEqual(authoredFollowupIntents(messages,design),['The clouds are trampolines.']);
});

test('overlong build details fail visibly instead of truncating a child rule',()=>{
 const design=freshDesign();
 design.plan.action={value:'Jump. '.repeat(110),origin:'child',accepted:true,delegated:false};
 design.plan.goal={value:'Find. '.repeat(110),origin:'child',accepted:true,delegated:false};
 design.plan.special={value:'Keep. '.repeat(110),origin:'child',accepted:true,delegated:false};
 assert.throws(()=>compileGuidedBuild('A cat explores a moon made from donuts.',design),/shorten your game plan/);
 assert.equal(design.plan.special.value,'Keep. '.repeat(110));
});

test('current choices and unstructured creative followups reach Build in actual conversation order',()=>{
 const design=freshDesign(),idea='A fox folds its shadow.';
 const old='I want red paper. The folds make music.',newer='Silver paper now.',last='The paper sings louder near the den.';
 design.plan.style={origin:'child',value:newer,accepted:true,delegated:false};
 const messages=[idea,old,newer,last].map((text,index)=>message(String(index),'child',text));
 const payload=compileGuidedBuild(idea,design,'',authoredFollowupIntents(messages,design),{messages,selected:{}});
 assert.ok(payload.includes(old)&&payload.includes(newer)&&payload.includes(last));
 assert.ok(payload.indexOf(old)<payload.indexOf(newer)&&payload.indexOf(newer)<payload.indexOf(last));
});
