import assert from 'node:assert/strict';
import { StudioNotebook,STUDIO_KEY,validateNotebook } from '../src/studio/notebook';
import { StudioGames } from '../src/studio/adapter';
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
console.log(`${passed} studio unit tests passed.`);
