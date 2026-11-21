import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleConversation,helperPreview} from '../src/studio/conversation-view';
import type {Message} from '../src/studio/notebook';

const message=(text:string,role:Message['role']='child'):Message=>({id:crypto.randomUUID(),role,text,at:'2026-11-20T12:00:00Z'});
const envelope='\n\nApproved game plan (full choices remain in this notebook):\n'+['fun','action','goal','setback','score','style','progression','special'].map(field=>field+': My choice').join('\n');
test('old build envelopes stay in storage while the conversation retains the original idea once',()=>{
 const idea=message('A dragon delivers moon cakes.'),compiled=message(idea.text+envelope);
 const original=[idea,compiled,message('Test builder (mock): Your new preview is ready.','helper')];
 const before=JSON.stringify(original);
 assert.deepEqual(visibleConversation(original),[idea]);
 assert.equal(JSON.stringify(original),before);
 assert.equal(visibleConversation([compiled])[0].text,idea.text,'legacy chat with only a compiled message retains the actual idea');
});
test('child-authored text, reflections and ordinary plan discussion are never filtered',()=>{
 const originals=[message('Your new preview is ready.'),message('I want a game about the Approved game plan.'),message('fun: bounce\ngoal: explore'),message('It was too fast.','reflection'),message('That build needs help with its story.','helper')];
 assert.deepEqual(visibleConversation(originals),originals);
});
test('long helper explanations keep the question visible and their full content expandable',()=>{
 const text='We can make that idea playful. '+('Your choices decide what happens in the world. '.repeat(8))+'How should it feel?';
 const view=helperPreview(text);
 assert.equal(view.lead,'We can make that idea playful.');assert.equal(view.question,'How should it feel?');assert.equal(view.more,text);
 assert.deepEqual(helperPreview('How should it feel?'),{lead:'How should it feel?',question:'',more:''});
});
