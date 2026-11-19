import assert from 'node:assert/strict';
import { StudioNotebook,STUDIO_KEY,validateNotebook } from '../src/studio/notebook';
import { StudioGames, isGeneratedRemoteKind } from '../src/studio/adapter';
import { installStudioRemixRouting } from '../src/studio/host-navigation';
import { installRemixFallback } from '../src/factory/remix-routing';
import { defaults } from '../src/runtime/manifests';
class Memory {
 data=new Map<string,string>();fail=false;
 getItem(k:string){return this.data.get(k)??null;}
 setItem(k:string,v:string){if(this.fail)throw Error('quota');this.data.set(k,v);}
}
let passed=0;
function test(name:string,fn:()=>void){fn();console.log('PASS '+name);passed++;}
const storage=new Memory(),notebook=new StudioNotebook(storage),owner='player1';
const s=notebook.create(owner,'buckets','My buckets','project1');
test('separate per-player projects',()=>{assert.equal(notebook.list(owner).length,1);assert.equal(notebook.list('player2').length,0);assert.throws(()=>notebook.get(s.id,'player2'));});
test('draft and conversation survive reload',()=>{notebook.update(s.id,owner,x=>{x.draft='Try more buckets';});notebook.message(s.id,owner,'child','Give me four buckets');const reopened=new StudioNotebook(storage);assert.equal(reopened.get(s.id,owner).draft,'Try more buckets');assert.equal(reopened.get(s.id,owner).messages[0].text,'Give me four buckets');});
test('candidate survives reload without becoming working revision',()=>{notebook.update(s.id,owner,x=>{x.candidate={id:'candidate1',baseId:'base1',config:{bucketCount:4},prompt:'Four buckets',summary:'Three to four'};});const r=new StudioNotebook(storage).get(s.id,owner);assert.equal(r.candidate?.config?.bucketCount,4);assert.equal(r.remoteId,null);});
test('forked conversation is independent',()=>{const f=notebook.fork(s.id,owner,'New copy','project2',null);notebook.message(f.id,owner,'helper','Only in copy');assert.equal(notebook.get(s.id,owner).messages.length,1);assert.equal(notebook.get(f.id,owner).candidate,null);});
test('unknown/secret field refused',()=>{const data=notebook.read() as any;data.sessions[0].previewUrl='https://secret/?capability=token';assert.throws(()=>validateNotebook(data));});
test('unknown schema does not erase original storage',()=>{const bad=new Memory();bad.setItem(STUDIO_KEY,'{"version":99}');assert.throws(()=>new StudioNotebook(bad));assert.equal(bad.getItem(STUDIO_KEY),'{"version":99}');});
test('quota failure is atomic',()=>{const prior=storage.getItem(STUDIO_KEY);storage.fail=true;assert.throws(()=>notebook.update(s.id,owner,x=>{x.name='lost';}));storage.fail=false;assert.equal(storage.getItem(STUDIO_KEY),prior);});
test('stale notebook instance re-reads latest state',()=>{const a=new StudioNotebook(storage),b=new StudioNotebook(storage);a.message(s.id,owner,'child','one');b.message(s.id,owner,'child','two');assert.equal(a.get(s.id,owner).messages.at(-1)?.text,'two');assert.equal(a.get(s.id,owner).messages.at(-2)?.text,'one');});
test('backup restores drafts but rejects invalid preview data',()=>{const backup=notebook.read();const target=new StudioNotebook(new Memory());target.restore(backup);assert.equal(target.get(s.id,owner).candidate?.id,'candidate1');const bad=structuredClone(backup);bad.sessions[0].candidate!.config={count:NaN};assert.throws(()=>target.restore(bad));});
test('background builds preserve the selected test and new draft through reload',()=>{
 const memory=new Memory(),book=new StudioNotebook(memory),session=book.create(owner,'hill','My experiments','ride-project');
 const first={id:'test-one',baseId:'main-one',config:{enginePower:1.2},prompt:'More power',summary:'Power test'};
 book.saveExperiment(session.id,owner,first);book.update(session.id,owner,x=>{x.draft='A newer idea I am still typing';x.job={id:'job-two',api:'https://workshop.test',status:'ready',revisionId:'ready-two'};});
 book.saveExperiment(session.id,owner,{id:'test-two',baseId:'main-one',remoteId:'ready-two',prompt:'Different scene',summary:'Scene test'},[],'redesign','child',false);
 const loaded=new StudioNotebook(memory).get(session.id,owner);assert.equal(loaded.candidate?.id,'test-one');assert.equal(loaded.selectedTest,'test-one');assert.equal(loaded.draft,'A newer idea I am still typing');assert.equal(loaded.experiments?.length,2);assert.equal(loaded.job?.revisionId,'ready-two');
 book.selectExperiment(session.id,owner,'test-two');assert.equal(book.get(session.id,owner).candidate?.remoteId,'ready-two');assert.equal(book.get(session.id,owner).remoteId,null,'opening a ready test does not promote it');
});
test('dismissed home reminder stays dismissed per child without deleting projects',()=>{
 const mem=new Memory(),book=new StudioNotebook(mem),one=book.create('child-one','new','Moon idea');
 const two=book.create('child-two','new','Donut idea');
 book.dismissResume(one.id,'child-one');
 const reload=new StudioNotebook(mem);
 assert.equal(reload.last('child-one'),null);
 assert.equal(reload.get(one.id,'child-one').name,'Moon idea');
 assert.equal(reload.last('child-two')?.id,two.id);
 assert.throws(()=>book.dismissResume(two.id,'child-one'),/own profile/);
 const newer=book.create('child-one','new','New machine');
 assert.equal(book.last('child-one')?.id,newer.id);
});
test('put-away and bring-back preserve draft, versions and profile isolation',()=>{
 const mem=new Memory(),book=new StudioNotebook(mem),one=book.create('child-one','new','Sticker rocket');
 book.update(one.id,'child-one',s=>{s.draft='Keep the pink rocket';s.candidate={id:'preview-1',baseId:null,config:{power:5},prompt:'Try pink',summary:'Pink rocket'};});
 book.archive(one.id,'child-one');
 const reopened=new StudioNotebook(mem);
 assert.equal(reopened.get(one.id,'child-one').archived,true);
 assert.equal(reopened.get(one.id,'child-one').draft,'Keep the pink rocket');
 assert.equal(reopened.get(one.id,'child-one').candidate?.id,'preview-1');
 assert.equal(reopened.last('child-one'),null);
 assert.throws(()=>reopened.unarchive(one.id,'child-two'),/own profile/);
 reopened.unarchive(one.id,'child-one');
 assert.equal(reopened.last('child-one')?.id,one.id);
});
test('ongoing build cannot be hidden by archiving',()=>{
 const mem=new Memory(),book=new StudioNotebook(mem),one=book.create('child-one','new','A busy build');
 book.update(one.id,'child-one',s=>{s.job={id:'job1',api:'https://builder.example',status:'building'};});
 assert.throws(()=>book.archive(one.id,'child-one'),/Stop the build/);
 assert.equal(book.get(one.id,'child-one').archived,undefined);
 book.update(one.id,'child-one',s=>{s.job!.status='cancelled';});
 book.archive(one.id,'child-one');
 assert.equal(book.get(one.id,'child-one').archived,true);
});
const gameStorage=new Memory();let child:any={id:owner,skills:{'mul:8x7':{tries:5,right:3}},constructionStates:{}};let canSave=true;
const fg={store:{current:()=>child,save:()=>canSave}};
const games=new StudioGames(gameStorage as unknown as Storage,fg);
const game=games.create(owner,'gum','My rocket',defaults('gum'));
const original=games.revision(game.id,owner);child.constructionStates[original.id]={level:1,state:{parts:[{id:'body',x:300}],joints:[]}};
const nextConfig={...original.config,gumBudget:15};
test('cloning preview state leaves working construction untouched',()=>{games.clonePlayState(owner,original.id,'candidateA');child.constructionStates.candidateA.state.parts[0].x=450;assert.equal(child.constructionStates[original.id].state.parts[0].x,300);assert.equal(games.revision(game.id,owner).config.gumBudget,10);});
let kept:any;
test('keep commits config and construction state together',()=>{kept=games.keep(owner,game.id,original.id,nextConfig,'15 gum','More room to experiment','candidateA');assert.equal(games.revision(game.id,owner).config.gumBudget,15);assert.equal(child.constructionStates[kept.id].state.parts[0].x,450);});
test('stale-base keep refused',()=>{assert.throws(()=>games.keep(owner,game.id,original.id,nextConfig,'stale','','candidateA'),/changed elsewhere/);});
test('undo and redo preserve branches',()=>{games.undo(owner,game.id);assert.equal(games.revision(game.id,owner).id,original.id);games.redo(owner,game.id);assert.equal(games.revision(game.id,owner).id,kept.id);});
test('save as new preserves source and play state',()=>{const fork=games.fork(owner,game.id,'Rocket copy',undefined,'',kept.id);const r=games.revision(fork.id,owner);assert.equal(child.constructionStates[r.id].state.parts[0].x,450);child.constructionStates[r.id].state.parts[0].x=500;assert.equal(child.constructionStates[kept.id].state.parts[0].x,450);assert.equal(games.revision(game.id,owner).id,kept.id);});
test('state save failure restores working pointer',()=>{canSave=false;assert.throws(()=>games.keep(owner,game.id,kept.id,{...nextConfig,gumBudget:16},'failure','','candidateA'));canSave=true;assert.equal(games.revision(game.id,owner).id,kept.id);});
test('math evidence never modified',()=>{assert.deepEqual(child.skills,{'mul:8x7':{tries:5,right:3}});});
test('profile isolation in state copying',()=>{child={...child,id:'player2'};assert.throws(()=>games.clonePlayState(owner,original.id,'cross-profile'));});
test('hill notebooks reload and restore without changing prior games or accepting unknown game IDs',()=>{
 const memory=new Memory(),book=new StudioNotebook(memory),ride=book.create(owner,'hill','My hill ride','hill-project');
 book.message(ride.id,owner,'child','Try larger wheels');book.update(ride.id,owner,x=>{x.draft='Keep the soft springs';});
 const reopened=new StudioNotebook(memory);assert.equal(reopened.get(ride.id,owner).game,'hill');assert.equal(reopened.get(ride.id,owner).draft,'Keep the soft springs');
 const restored=new StudioNotebook(new Memory());restored.restore(book.read());assert.deepEqual(restored.get(ride.id,owner),book.get(ride.id,owner));
 const bad=book.read() as any;bad.sessions[0].game='__proto__';assert.throws(()=>validateNotebook(bad));
 assert.equal(notebook.get(s.id,owner).game,'buckets');
});
test('ride experiments preserve setup, paint and saved progress independently of the main version',()=>{
 const memory=new Memory(),profile:any={id:owner,constructionStates:{}},adapter=new StudioGames(memory as unknown as Storage,{store:{current:()=>profile,save:()=>true}});
 const project=adapter.create(owner,'hill','My hill ride',defaults('hill')),main=adapter.revision(project.id,owner);
 profile.constructionStates[main.id]={qualityConstruction:{schema:'quality-hill-v1',track:'ridge',paint:'#50a89a',best:{ridge:19}}};
 adapter.clonePlayState(owner,main.id,'hill-test');profile.constructionStates['hill-test'].qualityConstruction.best.ridge=24;
 assert.equal(profile.constructionStates[main.id].qualityConstruction.best.ridge,19);
 const next=adapter.keep(owner,project.id,main.id,{...main.config,wheelSize:.57},'Bigger wheels','','hill-test');
 assert.equal(adapter.revision(project.id,owner).config.wheelSize,.57);
 assert.deepEqual(profile.constructionStates[next.id].qualityConstruction,{schema:'quality-hill-v1',track:'ridge',paint:'#50a89a',best:{ridge:24}});
 assert.equal(adapter.revision(project.id,owner,main.id).config.wheelSize,.52);
});
test('both generated module versions keep the generated builder discriminator',()=>{
 assert.equal(isGeneratedRemoteKind('generated-module-v1'),true);assert.equal(isGeneratedRemoteKind('generated-module-v2'),true);
 assert.equal(isGeneratedRemoteKind('star-catcher-v1'),false);assert.equal(isGeneratedRemoteKind(undefined),false);
});
test('local chat erasure preserves saved versions but removes transcript and design notes per player',()=>{
 const memory=new Memory(),book=new StudioNotebook(memory);
 const one=book.create('first','gum','My first game','project-1');
 const two=book.create('second','new','Their idea');
 book.message(one.id,'first','child','A private made-up world');book.message(two.id,'second','child','Other child private idea');
 book.update(one.id,'first',x=>{x.draft='secret draft';x.hypothesis='secret guess';x.design!.plan.goal={value:'secret design',origin:'child',accepted:true,delegated:false};});
 book.saveExperiment(one.id,'first',{id:'v-one',baseId:'original',config:{gumBudget:12},prompt:'try 12',summary:'new version'});
 const erased=book.clearConversation(one.id,'first');
 assert.deepEqual(erased.messages,[]);assert.equal(erased.draft,'');assert.equal(erased.hypothesis,'');
 assert.deepEqual(erased.design!.plan,{});assert.equal(erased.experiments!.length,1,'do not silently erase game versions');
 assert.equal(book.get(two.id,'second').messages[0].text,'Other child private idea');
 assert.throws(()=>book.clearConversation(one.id,'second'),/own profile/);
 book.update(one.id,'first',x=>{x.job={id:'job-running',api:'https://private.example',status:'building'};});
 assert.throws(()=>book.clearConversation(one.id,'first'),/Finish or cancel/);
 assert.equal(book.get(one.id,'first').job!.status,'building');
});
// Exercise actual EventTarget registration order. A synthetic capture-first
// dispatcher would miss the direct-window dispatch that failed in Chromium CI.
async function routingTests(){
 const events=new EventTarget(),requests:(string|undefined)[]=[];let legacy=0;
 const removeLegacy=installRemixFallback(()=>legacy++,events);
 const removeStudio=installStudioRemixRouting({activeGame:()=> 'hill',openRequest:prompt=>requests.push(prompt)},events);
 const event=new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill',prompt:'Make the wheels bigger'}});
 assert.equal(events.dispatchEvent(event),false,'Studio claims the request during dispatch');
 await Promise.resolve();
 test('a later Studio listener consumes a garage prompt before the already-registered fallback runs',()=>{
  assert.equal(event.defaultPrevented,true);assert.deepEqual(requests,['Make the wheels bigger']);assert.equal(legacy,0);
 });
 events.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill'}}));await Promise.resolve();
 test('an embedded Improve request opens Studio without invoking the legacy host',()=>{assert.deepEqual(requests,['Make the wheels bigger',undefined]);assert.equal(legacy,0);});
 removeStudio();events.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill'}}));await Promise.resolve();
 test('native remix still runs once when Studio is uninstalled',()=>{assert.equal(legacy,1);assert.equal(requests.length,2);});
 events.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill'}}));removeLegacy();await Promise.resolve();
 test('uninstalling the fallback cancels its already-queued action',()=>assert.equal(legacy,1));

 const otherEvents=new EventTarget();let active=true,otherRequests=0,otherLegacy=0;
 const stopFallback=installRemixFallback(()=>otherLegacy++,otherEvents);
 const stopStudio=installStudioRemixRouting({activeGame:()=>active?'hill':null,openRequest:()=>otherRequests++},otherEvents);
 otherEvents.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'gum',prompt:'More gum'}}));
 active=false;otherEvents.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill'}}));
 active=true;otherEvents.dispatchEvent(new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill',prompt:{unexpected:true}}}));
 otherEvents.dispatchEvent(new CustomEvent('factory-remix-request',{detail:{game:'hill'}}));await Promise.resolve();
 test('foreign games, inactive sessions, malformed prompts and noncancelable events keep their existing host',()=>{assert.equal(otherRequests,0);assert.equal(otherLegacy,4);});
 const claimed=new CustomEvent('factory-remix-request',{cancelable:true,detail:{game:'hill'}});claimed.preventDefault();otherEvents.dispatchEvent(claimed);await Promise.resolve();
 test('a request already claimed by another host runs neither Studio nor fallback',()=>{assert.equal(otherRequests,0);assert.equal(otherLegacy,4);});
 stopStudio();stopFallback();console.log(`${passed} studio unit tests passed.`);
}
void routingTests().catch(error=>{console.error(error);process.exitCode=1;});
