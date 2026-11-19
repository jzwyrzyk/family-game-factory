import assert from 'node:assert/strict';
import { builderJourney, builderLevel, gemStage, GEM_MASTER_TARGET } from '../src/brand/gem-progress';
import { StudioNotebook, STUDIO_KEY, validateNotebook, type Candidate, type StudioSession } from '../src/studio/notebook';
import { StudioGames } from '../src/studio/adapter';
import { defaults } from '../src/runtime/manifests';

class Memory {
  data=new Map<string,string>();fail=false;
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){if(this.fail)throw Error('quota');this.data.set(key,value);}
}
let passed=0;
function test(name:string,fn:()=>void){fn();console.log('PASS '+name);passed++;}
const owner='player-one';
function workspace(){const memory=new Memory();return {memory,book:new StudioNotebook(memory)};}
function create(book:StudioNotebook,key:string,player=owner){return book.create(player,'buckets','Jem '+key,'project-'+key);}
function candidate(key:string,baseId:string|null='base-'+key):Candidate {
  return {id:'test-'+key,baseId,config:{bucketCount:4},prompt:'Make four buckets for my game',summary:'Try four buckets'};
}
function polished(book:StudioNotebook,key:string,player=owner):StudioSession {
  const s=create(book,key,player),c=candidate(key);
  const e=book.saveExperiment(s.id,player,c);
  book.observe(s.id,player,'I can reach the last bucket now.','child',e.id);
  return book.keepExperiment(s.id,player,e.id,{kind:'local',baseId:c.baseId,revisionId:'kept-'+key});
}

test('arbitrary chat, helper advice and unsaved drafts are not an authored game idea',()=>{
  const {book}=workspace(),s=create(book,'empty');
  book.message(s.id,owner,'child','hello');book.message(s.id,owner,'child','thanks');
  book.message(s.id,owner,'helper','Try a flying cat');
  book.update(s.id,owner,x=>{x.draft='Maybe add a dragon';x.hypothesis='It might be fun';});
  assert.equal(gemStage(book.get(s.id,owner)),'none');
  assert.equal(gemStage(book.get(s.id,owner),true),'none','A legacy keep hint cannot manufacture authorship');
});
test('rough needs a saved adopted child idea or an accepted nondelegated child decision',()=>{
  const {book}=workspace(),s=create(book,'idea');
  const stage=()=>gemStage(book.get(s.id,owner));
  book.update(s.id,owner,x=>{x.design!.ideas.push({id:'idea-1',text:'A cat makes rainbow bridges',origin:'helper',adopted:true});});
  assert.equal(stage(),'none');
  book.update(s.id,owner,x=>{x.design!.ideas[0].origin='child';x.design!.ideas[0].adopted=false;});assert.equal(stage(),'none');
  book.update(s.id,owner,x=>{x.design!.ideas[0].adopted=true;});assert.equal(stage(),'rough');
  book.update(s.id,owner,x=>{x.design!.ideas=[];x.design!.plan.goal={value:'Reach the rainbow',origin:'child',accepted:false,delegated:false};});assert.equal(stage(),'none');
  book.update(s.id,owner,x=>{x.design!.plan.goal!.accepted=true;});assert.equal(stage(),'rough');
  book.update(s.id,owner,x=>{x.design!.plan.goal!.delegated=true;});assert.equal(stage(),'none');
  book.update(s.id,owner,x=>{x.design!.plan.goal!.delegated=false;x.design!.plan.goal!.value='  \n ';});assert.equal(stage(),'none');
});
test('a saved child-origin test carries authored intent; helper-only experiments do not',()=>{
  const {book}=workspace(),s=create(book,'authorship');
  book.saveExperiment(s.id,owner,candidate('helper'),[],'tune','helper');
  book.note(s.id,owner,'test-helper','The extra bucket is easier.');
  assert.equal(gemStage(book.get(s.id,owner)),'none');
  book.saveExperiment(s.id,owner,{...candidate('blank'),prompt:'  '});
  assert.equal(gemStage(book.get(s.id,owner)),'none');
  book.saveExperiment(s.id,owner,candidate('child'));
  assert.equal(gemStage(book.get(s.id,owner)),'cut','The saved child idea and a reflected real test belong to this project');
});
test('cut requires a child reflection linked to an actual saved test',()=>{
  const {book}=workspace(),s=create(book,'reflection'),e=book.saveExperiment(s.id,owner,candidate('reflection'));
  const stage=()=>gemStage(book.get(s.id,owner));
  assert.equal(stage(),'rough');
  book.observe(s.id,owner,'Won the game','runtime',e.id);assert.equal(stage(),'rough');
  book.observe(s.id,owner,'This feels better','child',null);assert.equal(stage(),'rough');
  book.observe(s.id,owner,'  ','child',e.id);assert.equal(stage(),'rough');
  assert.throws(()=>book.observe(s.id,owner,'Unknown test','child','not-on-this-shelf'),/Unknown observation test/);
  book.observe(s.id,owner,'The fourth bucket gave me a second route.','child',e.id);assert.equal(stage(),'cut');
});
test('saved test-card notes are reflection, and erasing the last note removes that evidence',()=>{
  const {book}=workspace(),s=create(book,'notes'),e=book.saveExperiment(s.id,owner,candidate('notes'));
  book.note(s.id,owner,e.id,'The jump feels nicer.');assert.equal(gemStage(book.get(s.id,owner)),'cut');
  book.note(s.id,owner,e.id,' \n ');assert.equal(gemStage(book.get(s.id,owner)),'rough');
});
test('old remoteId, history hints and unmatched observations never imply a kept improvement',()=>{
  const {book}=workspace(),s=create(book,'legacy'),e=book.saveExperiment(s.id,owner,candidate('legacy'));
  book.observe(s.id,owner,'The change is clearer.','child',e.id);
  book.update(s.id,owner,x=>{x.remoteId='old-working-revision';});
  assert.equal(gemStage(book.get(s.id,owner),true),'cut');
  const restored=new StudioNotebook(new Memory());restored.restore(book.read());
  assert.equal(gemStage(restored.get(s.id,owner),true),'cut');
});
test('a genuine keep receipt must match the exact reflected experiment',()=>{
  const {book}=workspace(),s=create(book,'matching'),a=candidate('a'),b=candidate('b');
  book.saveExperiment(s.id,owner,a);book.saveExperiment(s.id,owner,b);
  book.observe(s.id,owner,'A worked better.','child',a.id);
  book.keepExperiment(s.id,owner,b.id,{kind:'local',baseId:b.baseId,revisionId:'kept-b'});
  assert.equal(gemStage(book.get(s.id,owner)),'cut','Keeping B cannot polish a reflection about A');
  book.note(s.id,owner,b.id,'B leaves more room.');assert.equal(gemStage(book.get(s.id,owner)),'polished');
  book.note(s.id,owner,b.id,'');assert.equal(gemStage(book.get(s.id,owner)),'cut');
});
test('an actual game keep supplies the durable revision id and survives notebook reload',()=>{
  const {book,memory}=workspace(),gameMemory=new Memory();
  const games=new StudioGames(gameMemory as unknown as Storage,{store:{current:()=>({id:owner}),save:()=>true}});
  const project=games.create(owner,'buckets','Four buckets',defaults('buckets')),base=games.revision(project.id,owner);
  const s=book.create(owner,'buckets','Four buckets',project.id),c={...candidate('actual',base.id),config:{...base.config,bucketCount:4}};
  book.saveExperiment(s.id,owner,c);book.note(s.id,owner,c.id,'Four buckets gave me more choice.');
  const kept=games.keep(owner,project.id,base.id,c.config,c.prompt,'',c.id);
  book.keepExperiment(s.id,owner,c.id,{kind:'local',baseId:base.id,revisionId:kept.id});
  const loaded=new StudioNotebook(memory).get(s.id,owner);
  assert.equal(loaded.keptExperiments?.[0].revisionId,games.revision(project.id,owner).id);
  assert.equal(gemStage(loaded),'polished');assert.equal(loaded.candidate,null);
  book.keepExperiment(s.id,owner,c.id,{kind:'local',baseId:base.id,revisionId:kept.id});
  assert.equal(book.get(s.id,owner).keptExperiments?.length,1,'A repeated callback is idempotent');
});
test('a failed game keep cannot award a receipt or change progress',()=>{
  const {book}=workspace(),gameMemory=new Memory();
  const games=new StudioGames(gameMemory as unknown as Storage,{store:{current:()=>({id:owner}),save:()=>true}});
  const project=games.create(owner,'buckets','Bucket test',defaults('buckets')),base=games.revision(project.id,owner);
  const s=book.create(owner,'buckets','Bucket test',project.id),c={...candidate('failed-game',base.id),config:{...base.config,bucketCount:4}};
  book.saveExperiment(s.id,owner,c);book.note(s.id,owner,c.id,'It feels clearer.');gameMemory.fail=true;
  assert.throws(()=>{const kept=games.keep(owner,project.id,base.id,c.config,c.prompt,'',c.id);book.keepExperiment(s.id,owner,c.id,{kind:'local',baseId:base.id,revisionId:kept.id});});
  gameMemory.fail=false;
  assert.equal(games.revision(project.id,owner).id,base.id);assert.equal(gemStage(book.get(s.id,owner)),'cut');
  assert.equal(book.get(s.id,owner).keptExperiments,undefined);
});
test('notebook keep failure leaves both the candidate and the prior evidence intact',()=>{
  const {book,memory}=workspace(),s=create(book,'quota'),c=candidate('quota');
  book.saveExperiment(s.id,owner,c);book.note(s.id,owner,c.id,'It feels clearer.');
  const before=memory.getItem(STUDIO_KEY);memory.fail=true;
  assert.throws(()=>book.keepExperiment(s.id,owner,c.id,{kind:'local',baseId:c.baseId,revisionId:'kept-quota'}),/Could not save/);
  memory.fail=false;assert.equal(memory.getItem(STUDIO_KEY),before);
  const loaded=new StudioNotebook(memory).get(s.id,owner);assert.equal(loaded.candidate?.id,c.id);assert.equal(gemStage(loaded),'cut');
});
test('unknown, mismatched, no-op and cross-owner keep attempts are rejected atomically',()=>{
  const {book,memory}=workspace(),s=create(book,'guard'),c=candidate('guard');book.saveExperiment(s.id,owner,c);
  const before=memory.getItem(STUDIO_KEY),receipt={kind:'local' as const,baseId:c.baseId,revisionId:'kept-guard'};
  assert.throws(()=>book.keepExperiment(s.id,owner,'missing-test',receipt),/match/);
  assert.throws(()=>book.keepExperiment(s.id,owner,c.id,{...receipt,baseId:'another-base'}),/match/);
  assert.throws(()=>book.keepExperiment(s.id,owner,c.id,{...receipt,revisionId:c.baseId!}),/new version/);
  assert.throws(()=>book.keepExperiment(s.id,owner,c.id,{...receipt,kind:'remote'}),/match/);
  assert.throws(()=>book.keepExperiment(s.id,'player-two',c.id,receipt),/own profile/);
  assert.equal(memory.getItem(STUDIO_KEY),before);
});
test('unverified or mock remote previews never supply real-test or keep credit',()=>{
  const {book}=workspace(),s=book.create(owner,'new','Remote idea');
  const c:Candidate={id:'remote-test',baseId:'remote-base',remoteId:'remote-ready',prompt:'Make a cat fly',summary:'A flying cat'};
  book.saveExperiment(s.id,owner,c);book.note(s.id,owner,c.id,'The cat reaches the stars.');
  assert.equal(gemStage(book.get(s.id,owner)),'rough');
  book.keepExperiment(s.id,owner,c.id,{kind:'remote',baseId:c.baseId,revisionId:c.remoteId!});
  assert.equal(book.get(s.id,owner).remoteId,c.remoteId,'Existing keep behavior is preserved');
  assert.equal(book.get(s.id,owner).keptExperiments,undefined);assert.equal(gemStage(book.get(s.id,owner)),'rough');
  book.verifyRemoteExperiment(s.id,owner,c.id);assert.equal(gemStage(book.get(s.id,owner)),'cut');
  assert.equal(book.get(s.id,owner).keptExperiments,undefined,'Later verification must not invent an earlier receipt');
  book.keepExperiment(s.id,owner,c.id,{kind:'remote',baseId:c.baseId,revisionId:c.remoteId!});
  assert.equal(gemStage(book.get(s.id,owner)),'polished');
});
test('verified remote evidence is explicit, exact-test scoped and transactional',()=>{
  const {book,memory}=workspace(),s=book.create(owner,'new','Real remote tests');
  const a:Candidate={id:'remote-a',baseId:'remote-root',remoteId:'ready-a',prompt:'Cats can fly',summary:'Flying cats'};
  const b={...a,id:'remote-b',remoteId:'ready-b'};
  book.saveExperiment(s.id,owner,a,[],'redesign','child',false,true);book.saveExperiment(s.id,owner,b);
  book.note(s.id,owner,b.id,'B moves well.');assert.equal(gemStage(book.get(s.id,owner)),'rough');
  const before=memory.getItem(STUDIO_KEY);memory.fail=true;
  assert.throws(()=>book.verifyRemoteExperiment(s.id,owner,b.id),/Could not save/);memory.fail=false;
  assert.equal(memory.getItem(STUDIO_KEY),before);assert.throws(()=>book.verifyRemoteExperiment(s.id,owner,'unknown'),/saved remote/);
  book.verifyRemoteExperiment(s.id,owner,b.id);book.verifyRemoteExperiment(s.id,owner,b.id);
  assert.deepEqual(book.get(s.id,owner).verifiedRemoteExperiments,[a.id,b.id]);assert.equal(gemStage(book.get(s.id,owner)),'cut');
  assert.throws(()=>book.keepExperiment(s.id,owner,b.id,{kind:'remote',baseId:b.baseId,revisionId:a.remoteId!}),/match/);
});
test('keeping the first playable remote build is not a kept improvement',()=>{
  const {book}=workspace(),s=book.create(owner,'new','First build');
  const c:Candidate={id:'first-test',baseId:null,remoteId:'first-ready',prompt:'Create my moon game',summary:'Moon game'};
  book.saveExperiment(s.id,owner,c,[],'redesign','child',true,true);book.note(s.id,owner,c.id,'The moon feels floaty.');
  book.keepExperiment(s.id,owner,c.id,{kind:'remote',baseId:null,revisionId:c.remoteId!});
  assert.equal(book.get(s.id,owner).remoteId,c.remoteId);assert.equal(gemStage(book.get(s.id,owner)),'cut');
  assert.equal(book.get(s.id,owner).keptExperiments,undefined);
});
test('legacy notebooks remain valid without avatars, keep receipts or remote verification',()=>{
  const {book}=workspace(),s=create(book,'old');book.saveExperiment(s.id,owner,candidate('old'));
  const legacy=book.read();delete legacy.avatars;delete legacy.sessions[0].keptExperiments;delete legacy.sessions[0].verifiedRemoteExperiments;
  const restored=new StudioNotebook(new Memory());restored.restore(legacy);
  assert.equal(restored.avatar(owner),null);assert.equal(gemStage(restored.get(s.id,owner)),'rough');
});
test('malformed receipt and verification backups cannot replace a valid notebook',()=>{
  const {book,memory}=workspace();polished(book,'valid');const before=memory.getItem(STUDIO_KEY);
  const mutations:Array<(s:any)=>void>=[
    s=>{s.keptExperiments={};},s=>{s.keptExperiments=[null];},
    s=>{s.keptExperiments[0].experimentId='foreign-test';},s=>{s.keptExperiments[0].baseId='wrong-base';},
    s=>{s.keptExperiments[0].revisionId=s.keptExperiments[0].baseId;},s=>{s.keptExperiments[0].kind='remote';},
    s=>{s.keptExperiments[0].at='not-a-date';},s=>{s.keptExperiments[0].previewUrl='https://secret.example';},
    s=>{s.keptExperiments.push({...s.keptExperiments[0]});},s=>{s.verifiedRemoteExperiments=['foreign-test'];},
    s=>{s.verifiedRemoteExperiments=[s.experiments[0].id];},s=>{s.experiments[0].baseId='different-base';},
  ];
  for(const mutate of mutations){const bad=book.read();mutate(bad.sessions[0]);assert.throws(()=>book.restore(bad));assert.equal(memory.getItem(STUDIO_KEY),before);}
});
test('remote backups must bind the keep to a verified matching remote revision',()=>{
  const {book}=workspace(),s=book.create(owner,'new','Remote');
  const c:Candidate={id:'verified-test',baseId:'remote-root',remoteId:'remote-next',prompt:'Let the cat glide',summary:'Gliding cat'};
  book.saveExperiment(s.id,owner,c,[],'tune','child',true,true);book.note(s.id,owner,c.id,'Gliding feels gentle.');
  book.keepExperiment(s.id,owner,c.id,{kind:'remote',baseId:c.baseId,revisionId:c.remoteId!});
  const good=book.read();assert.equal(gemStage(validateNotebook(good).sessions[0]),'polished');
  const noVerification=structuredClone(good);delete noVerification.sessions[0].verifiedRemoteExperiments;assert.throws(()=>validateNotebook(noVerification));
  const wrongRevision=structuredClone(good);wrongRevision.sessions[0].keptExperiments![0].revisionId='unrelated-ready';assert.throws(()=>validateNotebook(wrongRevision));
  const duplicateVerification=structuredClone(good);duplicateVerification.sessions[0].verifiedRemoteExperiments!.push(c.id);assert.throws(()=>validateNotebook(duplicateVerification));
});
test('all four levels have truthful thresholds and a focused next action',()=>{
  assert.equal(builderLevel([]).level,0);assert.equal(builderLevel(['none','rough']).name,'Gem Maker');
  assert.equal(builderLevel(['rough','cut']).name,'Gem Cutter');assert.equal(builderLevel(['cut','polished']).name,'Gem Polisher');
  assert.equal(builderLevel(['polished','polished']).level,3);assert.equal(builderLevel(['polished','polished','polished']).name,'Gem Master');
  const {book}=workspace();assert.equal(builderJourney([],owner).nextAction,'Save your first idea');
  polished(book,'one');let journey=builderJourney(book.list(owner),owner);
  assert.equal(journey.level,3);assert.equal(journey.polishedCount,1);assert.equal(journey.masterTarget,GEM_MASTER_TARGET);assert.equal(journey.nextAction,'Polish 2 more jems');
  polished(book,'two');journey=builderJourney(book.list(owner),owner);assert.equal(journey.level,3);assert.equal(journey.nextAction,'Polish 1 more jem');
  polished(book,'three');journey=builderJourney(book.list(owner),owner);assert.equal(journey.level,4);assert.equal(journey.polishedCount,3);assert.equal(journey.stageCounts.polished,3);
});
test('repeated session ids and aliases of one project cannot inflate Master',()=>{
  const {book}=workspace(),s=polished(book,'same');
  assert.equal(builderJourney([s,s,s],owner).polishedCount,1);
  const alias=structuredClone(s);alias.id='alias-session';alias.experiments![0].id='alias-test';alias.experiments![0].candidate.id='alias-test';alias.design!.observations[0].experimentId='alias-test';alias.keptExperiments![0].experimentId='alias-test';alias.keptExperiments![0].revisionId='alias-revision';
  assert.equal(builderJourney([s,alias],owner).polishedCount,1,'Independent session evidence for the same local project counts once');
  const copiedId={...alias,id:s.id,projectId:'different-project'};
  assert.equal(builderJourney([s,copiedId],owner).polishedCount,1,'The same session cannot be counted twice under another project key');
});
test('copied experiments and kept revisions cannot create extra polished project credit',()=>{
  const {book}=workspace(),s=polished(book,'original');
  const testClone={...structuredClone(s),id:'copied-session',projectId:'copied-project'};
  testClone.keptExperiments![0].revisionId='different-kept-id';
  assert.equal(builderJourney([s,testClone],owner).polishedCount,1,'The same experiment receives one project credit');
  const revisionClone={...structuredClone(s),id:'copied-revision-session',projectId:'copied-revision-project'};
  revisionClone.experiments![0].id='different-test';revisionClone.experiments![0].candidate.id='different-test';revisionClone.design!.observations[0].experimentId='different-test';revisionClone.keptExperiments![0].experimentId='different-test';
  assert.equal(builderJourney([s,revisionClone],owner).polishedCount,1,'One kept revision cannot support two projects');
  assert.equal(builderJourney([s,testClone,revisionClone],owner).level,3);
});
test('one project with several polished tests cannot lend its spare receipt to a clone',()=>{
  const {book}=workspace(),s=polished(book,'multiple'),c=candidate('extra');
  book.saveExperiment(s.id,owner,c);book.note(s.id,owner,c.id,'This version feels best.');book.keepExperiment(s.id,owner,c.id,{kind:'local',baseId:c.baseId,revisionId:'kept-extra'});
  const current=book.get(s.id,owner),clone={...structuredClone(current),id:'new-session',projectId:'zz-copy'};
  clone.experiments=clone.experiments!.slice(1);clone.keptExperiments=clone.keptExperiments!.slice(1);clone.design!.observations=[];
  assert.equal(builderJourney([current,clone],owner).polishedCount,1);
  clone.projectId='aa-copy';
  assert.equal(builderJourney([clone,current],owner).polishedCount,1,'A partial copy cannot gain credit by sorting ahead of its original');
});
test('progress is owner scoped even when supplied a mixed notebook snapshot',()=>{
  const {book}=workspace(),mine=polished(book,'mine');polished(book,'theirs-1','player-two');polished(book,'theirs-2','player-two');polished(book,'theirs-3','player-two');
  const all=book.read().sessions;
  assert.equal(builderJourney(all,owner).polishedCount,1);assert.equal(builderJourney(all,'player-two').level,4);
  assert.equal(builderJourney(all,'unknown-player').level,0);assert.equal(builderJourney([mine,...all]).polishedCount,1);
  assert.throws(()=>book.note(mine.id,'player-two',mine.experiments![0].id,'Not mine'),/own profile/);
});
test('a copy retains the idea but must save its own test, reflection and keep',()=>{
  const {book}=workspace(),s=polished(book,'source');
  book.update(s.id,owner,x=>{x.design!.ideas.push({id:'source-idea',origin:'child',adopted:true,text:'A new path across four buckets'});});
  const fork=book.fork(s.id,owner,'My new direction','fork-project',null);
  assert.equal(gemStage(fork),'rough');assert.deepEqual(fork.experiments,[]);assert.deepEqual(fork.keptExperiments,[]);assert.deepEqual(fork.verifiedRemoteExperiments,[]);
  assert.equal(fork.design!.observations[0].experimentId,null);assert.equal(builderJourney(book.list(owner),owner).polishedCount,1);
  const c=candidate('fork');book.saveExperiment(fork.id,owner,c);book.note(fork.id,owner,c.id,'This path leaves more choices.');book.keepExperiment(fork.id,owner,c.id,{kind:'local',baseId:c.baseId,revisionId:'kept-fork'});
  assert.equal(builderJourney(book.list(owner),owner).polishedCount,2);
});
test('archives preserve earned progress; clearing design evidence removes dependent keep credit',()=>{
  const {book}=workspace(),one=polished(book,'archive-one'),two=polished(book,'archive-two');polished(book,'archive-three');
  book.archive(one.id,owner);assert.equal(builderJourney(book.list(owner),owner).level,4);assert.equal(gemStage(book.get(one.id,owner)),'polished');
  const cleared=book.clearConversation(one.id,owner);assert.equal(gemStage(cleared),'rough');assert.equal(cleared.keptExperiments,undefined);assert.equal(cleared.projectId,one.projectId);assert.equal(cleared.experiments?.length,1);
  assert.equal(builderJourney(book.list(owner),owner).level,3);assert.equal(builderJourney(book.list(owner),owner).polishedCount,2);
  book.note(two.id,owner,two.experiments![0].id,'Keep this saved test note');
  const withNote=book.clearConversation(two.id,owner);assert.equal(gemStage(withNote),'cut');assert.equal(withNote.experiments![0].notes,'Keep this saved test note');assert.equal(withNote.keptExperiments,undefined);
});
test('clearing receipts is atomic and cannot remove another owner’s evidence',()=>{
  const {book,memory}=workspace(),s=polished(book,'clear-owner'),other=polished(book,'clear-other','player-two');
  const before=memory.getItem(STUDIO_KEY);memory.fail=true;assert.throws(()=>book.clearConversation(s.id,owner),/Could not save/);memory.fail=false;
  assert.equal(memory.getItem(STUDIO_KEY),before);assert.equal(gemStage(book.get(s.id,owner)),'polished');
  book.clearConversation(s.id,owner);assert.equal(gemStage(book.get(other.id,'player-two')),'polished');
});
test('avatar choice is optional, cosmetic, owner scoped and durable through reload and backup',()=>{
  const {book,memory}=workspace();polished(book,'avatar');
  const before=builderJourney(book.list(owner),owner);assert.equal(book.avatar(owner),null);
  assert.equal(book.setAvatar(owner,'spark'),'spark');book.setAvatar('player-two','nova');
  const reopened=new StudioNotebook(memory);assert.equal(reopened.avatar(owner),'spark');assert.equal(reopened.avatar('player-two'),'nova');
  book.setAvatar(owner,'nova');assert.equal(reopened.avatar(owner),'nova');assert.deepEqual(builderJourney(book.list(owner),owner),before);
  const restored=new StudioNotebook(new Memory());restored.restore(book.read());assert.equal(restored.avatar(owner),'nova');assert.equal(restored.avatar('player-two'),'nova');
  book.setAvatar(owner,null);assert.equal(book.avatar(owner),null);assert.equal(book.avatar('player-two'),'nova');
});
test('avatar saves and restores fail without changing the previous choice or progress',()=>{
  const {book,memory}=workspace();polished(book,'avatar-quota');book.setAvatar(owner,'spark');
  const before=memory.getItem(STUDIO_KEY),backup=book.read();backup.avatars![owner]='nova';memory.fail=true;
  assert.throws(()=>book.setAvatar(owner,'nova'),/Could not save/);assert.throws(()=>book.restore(backup));memory.fail=false;
  assert.equal(memory.getItem(STUDIO_KEY),before);assert.equal(book.avatar(owner),'spark');assert.equal(builderJourney(book.list(owner),owner).level,3);
});
test('avatar schema rejects labels, malformed owners and unknown fields without replacing data',()=>{
  const {book,memory}=workspace();book.setAvatar(owner,'spark');const before=memory.getItem(STUDIO_KEY);
  for(const avatars of [null,[],{[owner]:'boy'},{[owner]:'girl'},{[owner]:{choice:'spark'}},{'bad owner':'spark'},JSON.parse('{"__proto__":"spark"}'),{constructor:'nova'}]){
    const bad={...book.read(),avatars};assert.throws(()=>book.restore(bad));assert.equal(memory.getItem(STUDIO_KEY),before);
  }
  assert.throws(()=>book.setAvatar('__proto__','spark'));assert.throws(()=>book.avatar('constructor'));
  assert.throws(()=>book.setAvatar(owner,'girl' as any));assert.throws(()=>book.restore({...book.read(),gender:'girl'}));
  assert.equal(memory.getItem(STUDIO_KEY),before);
});
console.log(`${passed} gem progress, persistence and character-choice tests passed.`);
