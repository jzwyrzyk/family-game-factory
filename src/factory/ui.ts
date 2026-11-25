import {NativeWorkspace,prepareIndexedNative,indexedStoragePreview} from '../storage/native-workspace';
import {iconMarkup,setIconLabel} from '../brand/icons';
import { interpretLearningRequest, learningFormatLabel } from '../learning/policy';
import { defaults, manifests, isGameId, playableMechanics } from '../runtime/manifests';
import { examples, interpret, type Intent } from './interpreter';
import { type Revision, migrateWorkspace } from './workspace';
import { DesignCoach } from './coach';
import { installRemixFallback } from './remix-routing';
import {profileStorage} from '../adult-pilot/storage';
import type { GameId, PlayOutcome, Mechanics } from '../runtime/types';
const FG = (window as any).FG;
const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const value = (id:string) => $<HTMLInputElement>(id).value;
function display(key:string,value:number|boolean) { return key==='splashMs'?`${Number(value)/1000} seconds`:typeof value==='boolean'?(value?'On':'Off'):String(value); }
function option(value:string,label:string) {const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
async function guarded(action:()=>unknown|Promise<unknown>) {try{await action();}catch(err){$('liveStatus').textContent=(err as Error).message;}}
export async function initLiveRemix() {
  const host=document.createElement('div');host.id='liveFactory';host.className='panel live-factory';
  host.innerHTML=`<div class="eyebrow">FACTORY 2.0 · LOCAL TOOLS</div><h2>${iconMarkup('edit')} Live Remix</h2><p>Play. Change one thing. See what happens! Your versions stay in this browser. No AI service is connected.</p>
  <div class="live-toolbar"><div><label for="liveGame">Start with a game</label><select id="liveGame"><option value="buckets">Splash or Pass</option><option value="gum">Bubble Gum Builders</option><option value="dragon">Dragon &amp; Meatballs</option><option value="hill">Junkyard Rally</option></select></div><button id="newLiveGame" class="btn secondary">${iconMarkup('add')} Start a remix</button></div>
  <label for="liveProjects">My saved playable remixes</label><select id="liveProjects"></select>
  <div id="liveEditor" hidden><h3 id="liveName"></h3><p id="liveVersion"></p><div id="liveMechanics" class="mechanics-grid"></div><button id="livePlay" class="btn primary">${iconMarkup('play')} Play this version</button><button id="liveKeep" class="btn secondary">${iconMarkup('save')} Keep this version</button>
  <section class="coach" aria-labelledby="coachTitle"><h3 id="coachTitle">${iconMarkup('help')} Your design coach</h3><p id="coachEvidence"></p><form id="coachForm" hidden><label for="coachAnswer" id="coachQuestion"></label><input id="coachAnswer" maxlength="300" autocomplete="off"><button class="btn secondary" type="submit">${iconMarkup('save')} Keep my thought</button><button id="coachSkip" class="btn secondary" type="button">${iconMarkup('arrow')} Skip — I'll explore</button></form><p id="coachReady"></p></section>
  <form id="livePromptForm"><label for="livePrompt">What would you like to change?</label><input id="livePrompt" maxlength="300" required placeholder="Give me four buckets" autocomplete="off"><div id="liveExamples" class="example-choices"></div><button class="btn secondary" type="submit">${iconMarkup('play')} Try It</button></form>
  <p id="liveIntent" role="status"></p><button id="liveTry" class="btn primary" hidden>${iconMarkup('play')} Try change &amp; play</button><button id="saveNovelIdea" class="btn secondary" hidden>${iconMarkup('save')} Keep this idea for later</button>
  <button id="liveUndo" class="btn secondary">${iconMarkup('undo')} Undo last change</button><details class="revision-tools" id="versionTools"><summary>${iconMarkup('grid')} Compare versions &amp; save a new game</summary><label for="compareVersion">Compare with a version</label><select id="compareVersion"></select><div class="table-scroll"><table id="liveCompare"><caption>Mechanics comparison</caption><thead><tr><th>Mechanic</th><th>Chosen version</th><th>Current version</th></tr></thead><tbody></tbody></table></div><div class="example-choices"><button id="playCompare" class="btn secondary">${iconMarkup('play')} Play chosen version</button><button id="restoreVersion" class="btn secondary">${iconMarkup('check')} Use chosen version</button></div>
  <form id="liveForkForm"><label for="forkName">Name your new game</label><input id="forkName" maxlength="60" required value="My new remix"><button class="btn primary" type="submit">${iconMarkup('save')} Save as new game</button></form></details>
</div>
  <p id="liveStatus" role="status" aria-live="polite"></p>`;
  $('page-feedback').querySelector('.page-head')!.after(host);
  const collection=document.createElement('div');collection.className='panel';collection.id='liveCollection';collection.innerHTML=`<h2>${iconMarkup('grid')} My playable remixes</h2><div id="savedRemixes"></div><p>These are changed versions of existing games. New game ideas in the notebook still need development.</p>`;
  $('page-creations').querySelector('.page-head')!.after(collection);
  const returnButton=document.createElement('button');returnButton.className='btn secondary';returnButton.id='returnLive';setIconLabel(returnButton,'arrow','Back to Live Remix','jems-icon--back');returnButton.hidden=true;returnButton.onclick=()=>FG.app.page('feedback');$('page-game').querySelector('.game-bottom')!.append(returnButton);
  const played=document.createElement('p');played.id='playedVersion';played.className='notice';played.hidden=true;$('page-game').querySelector('.game-topline')!.after(played);
  let store:NativeWorkspace;
  const owner=()=>String(FG.store.current().id);
  try{store=await NativeWorkspace.open(profileStorage(localStorage),owner);}catch(err){$('liveStatus').textContent=`Could not open your remix workspace: ${(err as Error).message} Your data has not been replaced. Original games still work.`;host.querySelectorAll('button,input,select').forEach(el=>(el as HTMLButtonElement).disabled=true);return;}
  let projectAfter:string|null=null,historyAfter:string|null=null;
  let active:string|null=null,pending:Extract<Intent,{kind:'supported'}>|null=null, pendingPrompt='';
  let currentPlay:{game:GameId;stateKey:string;config:Mechanics;owner:string}|null=null;
  const coach=new DesignCoach();
  const project=async()=>{if(!active)throw Error('Start a remix first.');return await store.project(active,owner());};
  const revision=async()=>{const p=(await project());return await store.revision(p.id,owner());};
  // Save the independent build first. A failed workspace write may leave an unused
  // copied slot, but cannot replace the source build or advance the saved head.
  async function withBuildCopy<T>(source:string,create:(revisionId:string)=>Promise<T>):Promise<T> {
    const revisionId=crypto.randomUUID(),profile=FG.store.current(),before=profile.constructionStates;
    const saved=before?.[source];
    if(saved===undefined)return await create(revisionId);
    profile.constructionStates={...before,[revisionId]:JSON.parse(JSON.stringify(saved))};
    if(!FG.store.save()){profile.constructionStates=before;throw Error('Could not save this experiment. Your earlier build is safe.');}
    try{return await create(revisionId);}catch(error){profile.constructionStates=before;FG.store.save();throw error;}
  }
  function clearPending(){pending=null;pendingPrompt='';$('liveIntent').textContent='';$('liveTry').hidden=true;$('saveNovelIdea').hidden=true;}
  function renderCoach(){
    $('coachEvidence').textContent=coach.summary;$('coachQuestion').textContent=coach.question();$('coachForm').hidden=!coach.question();$('coachReady').textContent=coach.phase==='ready'?(coach.hypothesis?`Your prediction: “${coach.hypothesis}”. Make a change and play to test it.`:'Try your own next change whenever you like.'):'Thoughts are optional. You choose what to test.';
  }
  async function renderComparison(){
    const p=(await project()),current=(await revision()),chosen=await store.revision(p.id,owner(),value('compareVersion')||current.id);
    const body=$('liveCompare').querySelector('tbody')!;body.replaceChildren();
    for(const m of playableMechanics(p.game,current.config)){const row=document.createElement('tr');[m.label,display(m.key,chosen.config[m.key]),display(m.key,current.config[m.key])].forEach(t=>{const cell=document.createElement('td');cell.textContent=t;row.append(cell)});body.append(row);}
  }
  async function renderCollection(){
    const box=$('savedRemixes');box.replaceChildren();const page=await store.page(owner());
    if(!page.items.length)box.textContent='Try Live Remix to save your first playable version.';
    const append=(projects:typeof page.items)=>projects.forEach(p=>{const button=document.createElement('button');button.className='btn secondary';setIconLabel(button,'play',p.name);button.onclick=()=>guarded(async()=>{active=p.id;coach.reset();clearPending();await render();FG.app.page('feedback');});box.append(button);});
    append(page.items);let after=page.next;
    if(after){const more=document.createElement('button');more.id='liveMoreGames';more.className='btn secondary';more.textContent='Show more games';box.append(more);more.onclick=()=>guarded(async()=>{if(!after)return;more.disabled=true;const next=await store.page(owner(),after);more.remove();append(next.items);after=next.next;if(after){more.disabled=false;box.append(more);}});}
  }
  async function render(){
    const page=await store.page(owner()),projects=page.items;projectAfter=page.next;if(active&&!projects.some(p=>p.id===active)){try{projects.push(await store.project(active,owner()));}catch{active=null;}}if(!active)active=projects.at(-1)?.id||null;
    $('liveProjects').replaceChildren(...projects.map(p=>option(p.id,p.name)),...(projectAfter?[option('__more__','More saved games…')]:[]));$<HTMLSelectElement>('liveProjects').value=active||'';$<HTMLSelectElement>('liveProjects').disabled=!projects.length;$('liveEditor').hidden=!active;
    await renderCollection();if(!active)return;
    const p=(await project()),r=(await revision()),historyPage=await store.historyPage(p.id,owner()),history=historyPage.items;historyAfter=historyPage.next;if(!history.some(item=>item.id===r.id))history.push(r);if(r.parentId&&!history.some(item=>item.id===r.parentId))history.push(await store.revision(p.id,owner(),r.parentId));$('liveName').textContent=p.name;$('liveVersion').textContent=`${manifests[p.game].name} · ${store.indexed?'Saved version':'version '+(history.findIndex(x=>x.id===r.id)+1)} · Saved on this device. Learning settings stay the same.`;
    $('liveMechanics').replaceChildren(...playableMechanics(p.game,r.config).map(m=>{const card=document.createElement('div');card.className='stat';card.textContent=`${m.label}: ${display(m.key,r.config[m.key])}`;return card;}));
    $<HTMLButtonElement>('liveUndo').disabled=!r.parentId;const redo=$<HTMLButtonElement>('liveRedo');if(redo)redo.disabled=!history.some(x=>x.parentId===r.id);$('compareVersion').replaceChildren(...history.map((rev,i)=>option(rev.id,`Version ${i+1}: ${rev.label}`)));$<HTMLSelectElement>('compareVersion').value=r.parentId||r.id;
    let more=$<HTMLButtonElement>('liveMoreVersions');if(!more){more=document.createElement('button');more.id='liveMoreVersions';more.className='btn secondary';more.textContent='More saved versions';$('compareVersion').after(more);}more.hidden=!historyAfter;more.onclick=()=>guarded(async()=>{if(!historyAfter)return;const next=await store.historyPage(p.id,owner(),historyAfter);for(const revision of next.items)if(!Array.from($<HTMLSelectElement>('compareVersion').options).some(item=>item.value===revision.id))$('compareVersion').append(option(revision.id,revision.label));historyAfter=next.next;more.hidden=!historyAfter;});
    $('liveExamples').replaceChildren(...examples[p.game].map(example=>{const button=document.createElement('button');button.type='button';button.className='text-btn';button.textContent=example;button.onclick=()=>{clearPending();$<HTMLInputElement>('livePrompt').value=example;$('livePrompt').focus()};return button;}));
    $<HTMLInputElement>('livePrompt').placeholder=examples[p.game][0]||'Describe your game idea';await renderComparison();renderCoach();
  }
  async function play(r:Revision){
    const p=(await project()),capturedOwner=owner();$('playedVersion').hidden=false;$('playedVersion').textContent=`Playing ${p.name}: ${playableMechanics(p.game,r.config).map(m=>`${m.label} ${display(m.key,r.config[m.key])}`).join(' · ')}`;$('returnLive').hidden=false;
    FG.app.openGame(p.game,{config:r.config,stateKey:r.id,projectId:p.id,onOutcome:(outcome:PlayOutcome)=>guarded(async()=>{
      const record=await store.record(p.id,capturedOwner,r.id,outcome);if(owner()===capturedOwner){coach.observe(record,r);renderCoach();$('playedVersion').textContent=`${coach.summary} Tap “Back to Live Remix” to reflect or change your game.`;}
    })});
  }
  $('newLiveGame').onclick=()=>guarded(async()=>{const game=value('liveGame') as GameId;const p=await withBuildCopy('original-'+game,async id=>await store.create(owner(),game,`My ${manifests[game].name}`,defaults(game,FG.store.current().remixes?.[game]||'classic'),id));active=p.id;coach.reset();clearPending();await render();$('liveStatus').textContent='Your starting version is saved. Play it, then try a change!';});
  $('liveProjects').onchange=()=>guarded(async()=>{if(value('liveProjects')==='__more__'){const next=await store.page(owner(),projectAfter);$('liveProjects').querySelector('option[value=__more__]')?.remove();for(const project of next.items)if(!Array.from($<HTMLSelectElement>('liveProjects').options).some(item=>item.value===project.id))$('liveProjects').append(option(project.id,project.name));projectAfter=next.next;if(projectAfter)$('liveProjects').append(option('__more__','More saved games…'));$<HTMLSelectElement>('liveProjects').value=active??'';return;}active=value('liveProjects');coach.reset();clearPending();await render();});
  $('liveKeep').onclick=()=>guarded(async()=>{await store.keep((await project()).id,owner());$('liveStatus').textContent='Kept! This version is pinned in your private remix history.';});
  $('livePlay').onclick=()=>guarded(async()=>play((await revision())));
  $('livePromptForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{clearPending();const p=(await project()),r=(await revision()),prompt=value('livePrompt');const mathRequest=interpretLearningRequest(prompt,FG.learning.subject);if(mathRequest){if(mathRequest.kind==='required')$('liveIntent').textContent=mathRequest.message;else{FG.learning.setMode(p.id,mathRequest.mode);$('liveIntent').textContent='Learning format: '+learningFormatLabel(FG.learning.subject,mathRequest.mode)+'. Your learning history stays with you.';}return;}const intent=interpret(p.game,r.config,prompt);pendingPrompt=prompt;
    if(intent.kind==='supported'){pending=intent;$('liveIntent').textContent=intent.summary;await applyPending();}
    else{$('liveIntent').textContent=intent.message;$('saveNovelIdea').hidden=intent.kind!=='generation-needed';if(intent.kind==='generation-needed')FG.builder?.request({gameId:p.game,baseRevisionId:r.id,config:r.config,prompt});}
  });};
  $('livePrompt').oninput=clearPending;
  async function applyPending(){if(!pending)throw Error('Describe your change first.');const p=(await project()),intent=pending;const r=await withBuildCopy(p.headId,async id=>await store.commit(p.id,owner(),intent.config,pendingPrompt,coach.hypothesis,id,p.headId));clearPending();await render();await play(r);}
  $('liveTry').onclick=()=>guarded(applyPending);
  $('saveNovelIdea').onclick=()=>guarded(async()=>{if(!FG.store.addFeedback({game:(await project()).game,type:'generation needed',idea:pendingPrompt}))throw Error('Could not save your idea. Keep it here and try again.');$('liveIntent').textContent='Idea saved in My Creations. It has not been built into a game.';$('saveNovelIdea').hidden=true;});
  const redo=document.createElement('button');redo.id='liveRedo';redo.className='btn secondary';setIconLabel(redo,'undo','Redo latest change','jems-icon--mirror');$('liveUndo').after(redo);redo.onclick=()=>guarded(async()=>{await store.redo((await project()).id,owner());clearPending();coach.reset();await render();$('liveStatus').textContent='Restored the latest child of this version. Other branches remain in Compare.';});
  $('liveUndo').onclick=()=>guarded(async()=>{await store.undo((await project()).id,owner());clearPending();coach.reset();await render();$('liveStatus').textContent='Undone. Your other versions are still in the history.';});
  $('compareVersion').onchange=()=>guarded(renderComparison);
  $('playCompare').onclick=()=>guarded(async()=>play(await store.revision((await project()).id,owner(),value('compareVersion'))));
  $('restoreVersion').onclick=()=>guarded(async()=>{await store.checkout((await project()).id,owner(),value('compareVersion'));clearPending();coach.reset();await render();$('liveStatus').textContent='That version is now your current game. All other versions are kept.';});
  $('liveForkForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{const p=(await project()),fork=await withBuildCopy(p.headId,async id=>await store.fork(p.id,owner(),value('forkName'),id,p.headId));active=fork.id;clearPending();coach.reset();await render();$('liveStatus').textContent='Saved as a new game! Find it in My Creations or come back after reloading.';});};
  $('coachForm').onsubmit=e=>{e.preventDefault();guarded(async()=>{const answer=value('coachAnswer');if(coach.phase==='reflection'&&coach.playId)await store.reflect(coach.playId,owner(),answer);coach.answer(answer);$<HTMLInputElement>('coachAnswer').value='';renderCoach();});};
  $('coachSkip').onclick=()=>{coach.skip();renderCoach();};
  window.addEventListener('factory-game',event=>{const detail=(event as CustomEvent<{live:boolean;game:GameId;stateKey:string;config?:Mechanics}>).detail;
    currentPlay={game:detail.game,stateKey:detail.stateKey,config:detail.config||defaults(detail.game,FG.store.current().remixes?.[detail.game]||'classic'),owner:owner()};
    if(!detail.live){$('returnLive').hidden=true;$('playedVersion').hidden=true;}});
  installRemixFallback(event=>guarded(async()=>{
    const detail=(event as CustomEvent<{game:GameId;prompt?:string}>).detail;if(!detail||!isGameId(detail.game))return;
    const source=currentPlay?.game===detail.game&&currentPlay.owner===owner()?currentPlay:null;
    FG.app.page('feedback'); // Unmount first so the last ride/build state is flushed.
    const existing=source?await store.projectForRevision(source.stateKey):null;
    if(existing){active=existing.id;await store.checkout(active,owner(),source!.stateKey);}
    else{const config=source?.config||defaults(detail.game,FG.store.current().remixes?.[detail.game]||'classic');const p=await withBuildCopy(source?.stateKey||'original-'+detail.game,async id=>await store.create(owner(),detail.game,`My ${manifests[detail.game].name}`,config,id));active=p.id;}
    coach.reset();clearPending();await render();$<HTMLInputElement>('livePrompt').value=detail.prompt||'';
    $('liveStatus').textContent='Your game and build are ready for an experiment. Try a change, compare it, then Keep your favourite.';
    if(detail.prompt){const intent=interpret((await project()).game,(await revision()).config,detail.prompt);if(intent.kind==='supported'){pending=intent;pendingPrompt=detail.prompt;await applyPending();}else $('liveIntent').textContent=intent.message;}
    else $('livePrompt').focus();
  }));
  window.addEventListener('factory-profile',async()=>{store.close();store=await NativeWorkspace.open(profileStorage(localStorage),owner);$<HTMLInputElement>('livePrompt').value='';$<HTMLInputElement>('coachAnswer').value='';active=null;clearPending();coach.reset();guarded(render);});
  window.addEventListener('factory-page',(event)=>{const page=(event as CustomEvent<string>).detail;if(page==='feedback'||page==='creations')guarded(render);if(page==='home'){$('returnLive').hidden=true;$('playedVersion').hidden=true;}});
  // Keep new data in the parent's existing JSON backup without changing the progress schema/key.
  FG.factory={privateCopyStore:()=>store.indexed,refreshPrivateCopies:async()=>{active=null;await render();},exportWorkspace:()=>store.legacySnapshot(),captureWorkspace:()=>store.snapshot(),indexedStoragePreview:indexedStoragePreview(),prepareIndexedWorkspace:async()=>{await prepareIndexedNative(profileStorage(localStorage),owner);store.close();store=await NativeWorkspace.open(profileStorage(localStorage),owner);active=null;await render();},validateWorkspace:migrateWorkspace,restoreWorkspace:(data:unknown)=>{store.restoreLegacy(JSON.stringify(data));active=null;clearPending();coach.reset();void guarded(render);}};
  await render();
}
