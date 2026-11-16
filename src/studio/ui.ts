import { attachPreviewLearning } from '../learning/remote';
import { interpretMathRequest, MODE_LABELS, setMode } from '../learning/policy';
import {installCoaching} from './coaching';
import {freshDesign} from './design';
import './style.css';
import { StudioNotebook, validateNotebook, type StudioSession, type Candidate, type PendingJob } from './notebook';
import { StudioGames } from './adapter';
import { defaults, manifests, validateConfig } from '../runtime/manifests';
import { interpret, examples } from '../factory/interpreter';
import type { GameId, Mechanics, PlayOutcome } from '../runtime/types';
import { BuilderClient, validateBuilderConfig, type BuilderConfig, type JobView } from '../builder/client';

const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el = (tag:string, className='', text='')=>{const n=document.createElement(tag);n.className=className;n.textContent=text;return n;};
const icon:Record<string,string>={gum:'🚀',buckets:'🪣',dragon:'🐉',new:'✨'};
const names:Record<string,string>={gum:'Bubble Gum Builders',buckets:'Splash or Pass',dragon:'Dragon Island Rescue',new:'A brand-new idea'};
const busy=(s:StudioSession)=>!!s.job&&['queued','building','testing'].includes(s.job.status);
const human=(v:number|boolean)=>typeof v==='boolean'?(v?'On':'Off'):String(v);

/** Opt-in review route. It does NOT enable paid generation, change rules, or publish anything. */
export async function installStudio(){
 if(new URLSearchParams(location.search).get('studio')!=='1')return;
 const FG=(window as any).FG;
 if(!FG?.app||!FG?.store)return;
 let notebook:StudioNotebook;
 try{notebook=new StudioNotebook(localStorage);}catch(error){
  const warning=el('p','notice',String((error as Error).message));$('page-home').prepend(warning);return;
 }
 const games=new StudioGames(localStorage,FG), owner=()=>String(FG.store.current().id);
 try{games.export();}catch(error){$('page-home').prepend(el('p','notice','Could not open the studio: '+(error as Error).message));return;}
 let activeId:string|null=null,epoch=0,showing:'working'|'candidate'|'history'='working',mounted=false;
 let remote:BuilderConfig={version:1,mode:'unavailable'};
 const clients=new Map<string,BuilderClient>();
 let iframe:HTMLIFrameElement|null=null, previewChannel='',previewArtifact='',previewOwner='';
 let previewLearning:ReturnType<typeof attachPreviewLearning>|null=null;
 let configReady=false, route:'library'|'studio'|'other'='library', draftTimer:ReturnType<typeof setTimeout>|undefined;
 let saving=false, reflecting=false, lastOutcome:string|null=null,viewedRevisionId:string|null=null,remoteViewedId:string|null=null;
 let coaching:ReturnType<typeof installCoaching>|undefined;
 const sending=new Set<string>();

 const page=el('section','page hidden');page.id='page-studio';
 page.innerHTML=`<div class="studio-heading"><button type="button" class="studio-back" id="studioHome">← My Games</button><div class="studio-title-wrap"><span class="studio-kicker">YOUR CREATIVE STUDIO</span><h1 id="studioTitle">Let's make something.</h1></div><span class="studio-storage" id="studioStorage">Saved on this device</span></div>
 <div class="studio-topbar"><div class="studio-version"><span class="studio-dot"></span><span id="studioVersion">New idea</span></div><div class="studio-actions"><button id="studioPlay" class="studio-button studio-primary">▶ Play</button><button id="studioKeep" class="studio-button studio-keep" disabled>⭐ Make this my main game</button><button id="studioUndo" class="studio-button" disabled>↶ Undo</button><button id="studioRedo" class="studio-button" disabled>↷ Redo</button><button id="studioCompare" class="studio-button">▤ Tests & versions</button><button id="studioCopy" class="studio-button">＋ Save as a different game</button></div></div>
 <div id="studioStatus" class="studio-status" role="status" aria-live="polite"></div>
 <nav class="studio-mobile-tabs" aria-label="Studio panels"><button data-studio-tab="game" aria-pressed="true">🎮 Game</button><button data-studio-tab="talk" aria-pressed="false">💬 Talk & change</button><button data-studio-tab="versions" aria-pressed="false">▤ Tests & versions</button></nav>
 <div class="studio-workspace" data-mobile-panel="game"><div class="studio-canvas-column"><div id="studioPreviewNotice" class="studio-preview-notice" hidden>Preview only. Your working game has not changed. <button id="studioBackWorking">Back to working game</button></div><div id="studioGameHost" class="studio-game-host"><div id="studioEmpty" class="studio-empty"><span>✦</span><h2>An idea is all you need.</h2><p>Describe a new game, or choose a game from your library to change it.</p><button class="studio-button" id="studioChooseStarter">Choose a starting game</button></div><div id="studioRemoteHost" hidden></div></div><div id="studioMathMode"></div><p class="studio-footnote" id="studioPlayNote">Play and change in one place. Saving here never publishes a game.</p></div>
 <aside class="studio-conversation"><div class="studio-helper-heading"><span class="studio-helper-icon">✦</span><div><h2>Your design partner</h2><p id="studioAvailability">Checking available tools…</p></div></div><div id="studioMessages" class="studio-messages" role="log" aria-label="Project conversation" aria-live="polite"></div><div id="studioReflection" class="studio-reflection" hidden><p id="studioReflectionQuestion">What worked well? What would you change?</p><div><button id="studioReflectAnswer" class="studio-chip">Share a thought</button><button id="studioReflectSkip" class="studio-chip">Skip & keep playing</button></div></div><form id="studioPromptForm" class="studio-prompt"><label for="studioPrompt" id="studioPromptLabel">What would you like to change?</label><textarea id="studioPrompt" rows="3" maxlength="2000" placeholder="Tell me what you imagine…" required></textarea><div id="studioSuggestions" class="studio-suggestions"></div><div class="studio-send-row"><span id="studioDraftStatus">Draft saved as you type</span><button id="studioSend" class="studio-button studio-primary" type="submit">Try change →</button></div><div class="studio-build-controls"><button id="studioCancel" class="studio-button" type="button" hidden>Cancel build</button><button id="studioRetry" class="studio-button" type="button" hidden>Try build again</button></div></form></aside></div>
 <section id="studioVersions" class="studio-versions" aria-labelledby="studioVersionsTitle" hidden><div class="studio-section-heading"><div><h2 id="studioVersionsTitle">Try a version. Keep your choice.</h2><p>Playing an older version does not overwrite your working game.</p></div><button class="studio-button" id="studioCloseVersions">Close</button></div><div id="studioVersionCards" class="studio-version-cards"></div></section>
 <dialog id="studioCopyDialog" class="studio-dialog"><form id="studioCopyForm"><h2>Give this game a new name</h2><p>Your original stays exactly as it is. The conversation comes with your copy.</p><label for="studioCopyName">Game name</label><input id="studioCopyName" maxlength="60" required><div><button class="studio-button" id="studioCopyCancel" type="button">Cancel</button><button class="studio-button studio-primary" type="submit">Save new game</button></div></form></dialog>`;
 document.querySelector('main')!.append(page);
 const library=el('section','page');library.id='page-studio-library';
 library.innerHTML=`<div class="studio-library-hero"><div><span class="studio-kicker">PLAY · IMAGINE · MAKE IT YOURS</span><h1>Your ideas.<br><em>Your games.</em></h1><p>Open a game and change it while you play.<br>Your conversation and versions stay together.</p><button class="studio-button studio-primary" id="studioNew">＋ Create something new</button></div><div class="studio-hero-shapes" aria-hidden="true"><span>✦</span><span>↗</span><span>◒</span></div></div><div id="studioContinue"></div><div class="studio-section-heading"><div><h2>My games & ideas</h2><p>Working games, previews and unfinished ideas—right where you left them.</p></div><span class="studio-storage">This browser · this player</span></div><div id="studioLibrary" class="studio-library-grid"></div><div class="studio-section-heading"><div><h2>Start with a family favorite</h2><p>Make your own copy. The original stays safe.</p></div></div><div id="studioStarters" class="studio-library-grid"></div><p class="studio-library-note">Saving is private to this browser—not a public release. AI generation requires your configured family workshop. A saved idea is labeled separately from a playable game.</p>`;
 document.querySelector('main')!.append(library);
 const nativeStage=$('page-game');
 const originalNav=document.querySelector('.site-header nav') as HTMLElement;
 originalNav.hidden=true;
 const nav=el('nav','studio-nav');nav.setAttribute('aria-label','Main navigation');
 nav.innerHTML='<button id="studioNavHome">🎮 My Games</button><button id="studioNavCreate">＋ Create</button><button id="studioNavPowers">⚡ My Powers</button>';
 originalNav.after(nav);document.body.classList.add('studio-review');
 function current(){if(!activeId)throw Error('Choose a project first.');return notebook.get(activeId,owner());}
 function act(action:()=>void|Promise<void>){try{Promise.resolve(action()).catch(error=>status((error as Error).message,true));}catch(error){status((error as Error).message,true);}}
 function status(text:string,error=false){$('studioStatus').textContent=text;$('studioStatus').classList.toggle('is-error',error);}
 function sameView(s:StudioSession,at=epoch){return at===epoch&&owner()===s.owner&&activeId===s.id&&route==='studio';}
 function canChangePlay(s:StudioSession,at=epoch){if(!sameView(s,at))return false;if(FG.learning.active){status('Finish the current math activity before replaying or changing versions.');return false;}return true;}
 function message(s:StudioSession,role:'child'|'helper'|'reflection',text:string){notebook.message(s.id,s.owner,role,text);if(activeId===s.id&&owner()===s.owner)renderConversation();}
 function flushDraft(){clearTimeout(draftTimer);if(!activeId)return;const s=current();if(s.draft!==$<HTMLTextAreaElement>('studioPrompt').value)notebook.update(s.id,s.owner,x=>{x.draft=$<HTMLTextAreaElement>('studioPrompt').value;});$('studioDraftStatus').textContent='Draft saved on this device';}
 function setTab(tab:'game'|'talk'|'versions'){
  if(tab==='talk'){if(FG.learning.active){status('Finish the current math activity before designing.');return;}document.body.classList.add('studio-designing');if(mounted||iframe){disposeGame();showStudio();status('Paused for designing. Construction is saved; action games restart this round when you resume.');}}
  if(tab==='game')document.body.classList.remove('studio-designing');
  $('page-studio').querySelector('.studio-workspace')!.setAttribute('data-mobile-panel',tab);
  document.querySelectorAll('[data-studio-tab]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.studioTab===tab)));
  if(tab==='versions'){$('studioVersions').hidden=false;renderVersions();}else $('studioVersions').hidden=true;
 }
 function showStudio(){
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));page.classList.remove('hidden');route='studio';
  nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
 }
 function disposeGame(){
  ++epoch;previewLearning?.dispose();previewLearning=null;FG.learning.dispose();iframe?.remove();iframe=null;previewChannel='';previewArtifact='';previewOwner='';
  // The original host cleans listeners, timers, audio and pending math callbacks.
  if(mounted){FG.app.page('home');mounted=false;}
  nativeStage.classList.add('hidden');$('studioRemoteHost').replaceChildren();$('studioRemoteHost').hidden=true;
 }
 function renderLibrary(){
  const entries=notebook.list(owner()),box=$('studioLibrary');box.replaceChildren();
  // Import references to existing local remixes without copying or migrating their data.
  for(const p of games.list(owner())) if(!entries.some(s=>s.projectId===p.id))entries.push({...notebook.create(owner(),p.game,p.name,p.id)});
  const last=notebook.last(owner());$('studioContinue').replaceChildren();
  if(last){const banner=el('div','studio-continue');banner.append(el('span','',`${icon[last.game]} Continue ${last.name}`));const b=el('button','studio-button','Open studio →');b.onclick=()=>act(()=>open(last.id));banner.append(b);$('studioContinue').append(banner);}
  if(!entries.length)box.append(el('p','studio-no-games','Your first creation starts below. Choose a favorite or dream up something new.'));
  entries.filter(s=>!s.playOnly||s.experiments?.length||s.candidate).forEach(s=>{const card=el('button','studio-library-card');card.setAttribute('data-session',s.id);card.append(el('span','studio-card-icon',icon[s.game]),el('span','studio-card-name',s.name));const label=busy(s)?'Build in progress':s.candidate?'Preview ready':s.projectId||s.remoteId?'Playable':'Idea · not built yet';card.append(el('span','studio-card-state',label),el('span','studio-card-link','Open in studio →'));card.onclick=()=>act(()=>open(s.id));box.append(card);});
  const starters=$('studioStarters');starters.replaceChildren();
  (['gum','buckets','dragon'] as GameId[]).forEach(game=>{const b=el('button',`studio-library-card studio-starter ${game}`);b.setAttribute('data-starter',game);b.append(el('span','studio-card-icon',icon[game]),el('span','studio-card-name',names[game]),el('span','studio-card-state','Original game · make your own copy'),el('span','studio-card-link','Play & change →'));b.onclick=()=>act(()=>start(game));starters.append(b);});
 }
 function home(){flushDraft();disposeGame();FG.app.page('home');document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));library.classList.remove('hidden');route='library';renderLibrary();nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.id==='studioNavHome'));window.scrollTo(0,0);}
 function start(game:GameId){
  const existing=notebook.list(owner()).find(s=>s.game===game&&s.playOnly);if(existing)return open(existing.id);
  const p=games.create(owner(),game,`My ${names[game]}`,defaults(game,FG.store.current().remixes?.[game]||'classic'));
  const s=notebook.create(owner(),game,p.name,p.id);notebook.update(s.id,s.owner,x=>{x.playOnly=true;});message(s,'helper','Play first. When you want to try a change, we will keep your experiments separate from the original.');return open(s.id);
 }
 function newIdea(){flushDraft();const s=notebook.create(owner(),'new','My new idea');message(s,'helper','What should your new game be about? One sentence is enough. Your idea stays here even when the AI builder is unavailable.');return open(s.id);}
 async function open(id:string){
  flushDraft();disposeGame();notebook.select(id,owner());activeId=id;reflecting=false;lastOutcome=null;showing='working';status('');
  const s=current();if(s.candidate&&!s.experiments?.some(e=>e.id===s.candidate!.id))notebook.saveExperiment(s.id,s.owner,s.candidate);coaching?.openSession();$<HTMLTextAreaElement>('studioPrompt').value=s.draft;showStudio();render();setTab('game');
  if(s.projectId||s.remoteId)await playWorking();else if(s.candidate)await playCandidate();else{$('studioEmpty').hidden=false;setTab('talk');}
  if(s.job&&busy(s)&&remote.mode==='remote'&&s.job.api===remote.apiBaseUrl)resume(s);
 }
 function renderConversation(){
  if(!activeId)return;const s=current(),box=$('studioMessages');box.replaceChildren();
  s.messages.forEach(m=>{const article=el('div',`studio-message ${m.role}`);article.append(el('span','studio-message-author',m.role==='child'?'You':m.role==='reflection'?'Your observation':'Design helper'),el('p','',m.text));box.append(article);});box.scrollTop=box.scrollHeight;
 }
 function render(){
  if(!activeId)return;const s=current(),working=s.projectId?games.revision(s.projectId,s.owner):null;
  FG.learning.modeControl($('studioMathMode'),s.id);$('studioTitle').textContent=s.name;$('studioStorage').textContent=s.remoteId||s.candidate?.remoteId?'Private family game · local conversation':'Saved on this device';
  const n=s.projectId?games.history(s.projectId,s.owner).findIndex(r=>r.id===working?.id)+1:0;
  $('studioVersion').textContent=showing==='candidate'?((s.experiments||[]).find(e=>e.id===s.candidate?.id)?.label||'Preview')+' · main game unchanged':showing==='history'?'Comparing an earlier version':working?`Working version ${n}`:s.remoteId?'Working game':'Idea · not a playable game yet';
  $('studioPreviewNotice').hidden=showing==='working';
  $('studioAvailability').textContent=!configReady?'Checking tools…':remote.mode==='remote'?'Local tools + configured AI workshop':'Local changes ready · AI builder not connected';
  $<HTMLButtonElement>('studioPlay').disabled=!(working||s.remoteId||s.candidate);
  $<HTMLButtonElement>('studioKeep').disabled=!s.candidate||showing!=='candidate'||busy(s)||saving;
  $<HTMLButtonElement>('studioUndo').disabled=!s.candidate&&!working?.parentId&&!s.remoteId;
  $<HTMLButtonElement>('studioRedo').disabled=!!s.candidate||(!s.undone&&(!working||!games.history(s.projectId!,s.owner).some(r=>r.parentId===working.id)));
  $<HTMLButtonElement>('studioCopy').disabled=!(working||s.remoteId||s.candidate)||busy(s)||saving;
  $<HTMLButtonElement>('studioSend').disabled=busy(s)||sending.has(s.id)||saving;$('studioSend').textContent=reflecting?'Save thought →':'Send →';
  $('studioPromptLabel').textContent=reflecting?'What did you notice?':s.game==='new'&&!s.remoteId?'What game would you like to make?':'What would you like to change?';
  $('studioReflection').hidden=!s.reflection;$('studioCancel').hidden=!busy(s);$('studioRetry').hidden=s.job?.status!=='failed';
  const suggestions=$('studioSuggestions');suggestions.replaceChildren();
  if(s.projectId&&!s.remoteId)(examples[s.game as GameId]||[]).slice(0,2).forEach(text=>{const b=el('button','studio-chip',text);b.setAttribute('type','button');b.onclick=()=>{reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value=text;flushDraft();render();$('studioPrompt').focus();};suggestions.append(b);});
  renderConversation();coaching?.renderShelf();
 }
 function mountNative(){
  $('studioEmpty').hidden=true;$('studioRemoteHost').hidden=true;
  if(nativeStage.parentElement!==$('studioGameHost')){$('studioGameHost').append(nativeStage);nativeStage.classList.remove('page');nativeStage.classList.add('studio-native-game');}
  nativeStage.classList.remove('hidden');
 }
 function announceOutcome(s:StudioSession,description:string,observed=false,playedTest:string|null=null){
  if(owner()!==s.owner||activeId!==s.id)return;
  if(description===lastOutcome&&!observed)return;
  // Record the actual play once. Reflection waits for learning and stays optional.
  if(!observed){try{coaching?.afterOutcome(description,playedTest);observed=true;}catch(error){status((error as Error).message,true);return;}}
  if(FG.learning.active){const at=epoch;const pending=()=>{if(!FG.learning.active){window.removeEventListener('factory-learning-active',pending);if(at===epoch)announceOutcome(s,description,true,playedTest);}};window.addEventListener('factory-learning-active',pending);return;}
  try{
   const design=notebook.get(s.id,s.owner).design;
   if(!design?.paused){const fun=design?.plan.fun?.value;message(s,'helper',description+(fun?' You wanted: '+fun+'.':'')+' What was fun or tricky? You can share a thought or keep playing.');notebook.update(s.id,s.owner,x=>{x.reflection=true;});render();}
   lastOutcome=description;
  }catch(error){status((error as Error).message,true);}
 }
 function playLocal(s:StudioSession,config:Mechanics,key:string,view:typeof showing,revisionId?:string){
  if(!canChangePlay(s))return false;
  const playedTest=view==='candidate'?s.candidate?.id||s.selectedTest||null:null;
  disposeGame();lastOutcome=null;viewedRevisionId=revisionId||null;remoteViewedId=null;const generation=epoch;showing=view;mountNative();
  FG.app.openGame(s.game,{config,stateKey:key,projectId:s.id,onOutcome:(outcome:PlayOutcome)=>{
    if(generation!==epoch||s.owner!==owner()||activeId!==s.id)return;
    if(revisionId&&s.projectId)try{games.record(s.owner,s.projectId,revisionId,outcome);}catch(error){status((error as Error).message,true);}
    announceOutcome(s,outcome.description||`You ${outcome.won?'finished':'tried'} this round.`,false,playedTest);
  }});
  mounted=true;showStudio();render();setTab('game');status(view==='candidate'?'Try your test. Your main game has not changed.':view==='history'?'Playing an earlier version for comparison.':'Your main game. Choose Change my game whenever you have an idea.');return true;
 }
 async function playWorking(){const s=current();if(!canChangePlay(s))return;if(s.remoteId){showing='working';await showRemote(s,s.remoteId);return;}if(!s.projectId){disposeGame();showing='working';$('studioEmpty').hidden=false;showStudio();render();return;}const r=games.revision(s.projectId,s.owner);playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'working',r.id);}
 async function playCandidate(){const s=current(),c=s.candidate;if(!canChangePlay(s))return;if(!c)return playWorking();if(c.remoteId){showing='candidate';await showRemote(s,c.remoteId);}else playLocal(s,validateConfig(s.game as GameId,c.config),c.id,'candidate');}
 async function submit(){
  flushDraft();const s=current(),prompt=s.draft.trim();if(!prompt)return;
  if(reflecting){notebook.observe(s.id,s.owner,prompt,'child',s.design?.observations.filter(o=>o.source==='runtime').at(-1)?.experimentId||null);message(s,'reflection',prompt);notebook.update(s.id,s.owner,x=>{x.draft='';x.reflection=false;});reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value='';render();return;}
  if(busy(s)||sending.has(s.id)){status('Your current build is still running. Play your working game or cancel the build first.');return;}
  const mathRequest=interpretMathRequest(prompt);
  if(mathRequest){message(s,'child',prompt);notebook.update(s.id,s.owner,x=>{x.reflection=false;});if(mathRequest.kind==='required'){message(s,'helper',mathRequest.message);}else{FG.learning.setMode(s.id,mathRequest.mode);message(s,'helper',`Math format set to ${MODE_LABELS[mathRequest.mode]}. It applies at the next safe learning moment; your game rules and learning history stay together.`);notebook.update(s.id,s.owner,x=>{x.draft='';});$<HTMLTextAreaElement>('studioPrompt').value='';}render();return;}
  if(await coaching?.intercept(prompt))return;
  const decision=coaching?.details()||{continueTest:false,parents:[],depth:'tune' as const,origin:'child' as const};
  message(s,'child',prompt);notebook.update(s.id,s.owner,x=>{x.reflection=false;x.playOnly=false;});
  if(s.projectId&&!s.remoteId&&!s.candidate?.remoteId){
    const working=games.revision(s.projectId,s.owner),config=decision.continueTest&&s.candidate?.config?s.candidate.config:working.config;
    const intent=interpret(s.game as GameId,config,prompt);
    if(intent.kind==='supported'){
      const c:Candidate={id:crypto.randomUUID(),baseId:decision.continueTest&&s.candidate?s.candidate.baseId:working.id,config:intent.config,prompt,summary:intent.summary};
      games.clonePlayState(s.owner,decision.continueTest&&s.candidate?s.candidate.id:working.id,c.id);
      notebook.saveExperiment(s.id,s.owner,c,decision.parents,decision.depth,decision.origin);
      notebook.update(s.id,s.owner,x=>{x.draft='';x.job=null;});$<HTMLTextAreaElement>('studioPrompt').value='';
      message(s,'helper',`${intent.summary}. This is a preview. Play it before choosing Keep change.`);await playCandidate();return;
    }
    if(intent.kind!=='generation-needed'){message(s,'helper',intent.message);render();return;}
  }
  if(remote.mode!=='remote'){
    message(s,'helper','That request needs the AI builder, which is not connected yet. Your idea is saved here; no build was started and your working game is unchanged. You can still try the local examples.');status('Idea saved · no AI job queued');render();return;
  }
  notebook.update(s.id,s.owner,x=>{x.pendingExperiment={parents:decision.parents,depth:decision.depth,origin:decision.origin,baseId:s.projectId?games.revision(s.projectId,s.owner).id:s.remoteId,prompt};});
  await build(s,prompt,decision.continueTest);
 }
 function clientFor(s:StudioSession){
  let c=clients.get(s.id);if(c)return c;
  c=new BuilderClient(remote,job=>{void onJob(s,job).catch(e=>{if(activeId===s.id&&owner()===s.owner)status(e.message,true);});});clients.set(s.id,c);return c;
 }
 async function build(s:StudioSession,prompt:string,continueTest=false){
  sending.add(s.id);render();status('Sending your request. No job has been queued yet.');
  const r=s.projectId?games.revision(s.projectId,s.owner):null;
  const chosen=continueTest?s.candidate:null;
  const input={gameId:s.remoteId||chosen?.remoteId?(s.remoteKind==='generated-module-v1'?'generated-module':'star-catcher'):s.game,baseRevisionId:chosen?.remoteId||s.remoteId||(chosen?.config?chosen.id:r?.id)||null,prompt,...(r&&!s.remoteId&&!chosen?.remoteId?{config:chosen?.config||r.config}:{})};
  try{await clientFor(s).submit(input);}catch(error){message(s,'helper','The builder could not finish or could not accept this request. Your current game and typed idea are still safe.');if(activeId===s.id&&owner()===s.owner){status((error as Error).message==='SPENDING_CUTOFF'?'The workshop allowance has been reached. No working game was replaced.':'The builder is unavailable. No success has been claimed.',true);render();}}finally{sending.delete(s.id);if(activeId===s.id&&owner()===s.owner)render();}
 }
 async function onJob(captured:StudioSession,job:JobView){
  const prior=notebook.get(captured.id,captured.owner);
  const terminal=['ready','failed','cancelled'].includes(job.status);
  notebook.update(captured.id,captured.owner,s=>{s.job={id:job.jobId,api:remote.apiBaseUrl||'',status:job.status as PendingJob['status']};});
  const texts:Record<string,string>={queued:'Your request is queued.',building:'Building a separate preview…',testing:job.phase==='repairing'?'Repairing the preview…':'Testing the preview…',ready:'Your new preview is ready.',failed:'The build did not work. Your current game is safe.',cancelled:'Build cancelled. Your current game is unchanged.'};
  if(terminal&&prior.job?.status!==job.status)message(captured,'helper',(job.adapter==='mock'?'Test builder (mock): ':'')+texts[job.status]);
  if(job.status==='ready'&&job.revisionId&&!prior.experiments?.some(e=>e.candidate.remoteId===job.revisionId)){
    const pending=prior.pendingExperiment;const c:Candidate={id:crypto.randomUUID(),baseId:pending?.baseId||prior.remoteId,remoteId:job.revisionId,prompt:pending?.prompt||prior.draft,summary:job.adapter==='mock'?'New test-builder preview (mock)':'New AI-built preview'};
    notebook.saveExperiment(captured.id,captured.owner,c,pending?.parents||[],pending?.depth||'redesign',pending?.origin||'child');
    notebook.update(captured.id,captured.owner,s=>{s.draft='';s.pendingExperiment=null;});
    if(activeId===captured.id&&owner()===captured.owner&&route==='studio'){$<HTMLTextAreaElement>('studioPrompt').value='';if(!FG.learning.active)await playCandidate();}
  }
  if(activeId===captured.id&&owner()===captured.owner){status(texts[job.status]||'Your working game is safe.');render();}
 }
 function resume(s:StudioSession){if(!s.job)return;void clientFor(s).resume(s.job.id).catch(()=>{if(owner()===s.owner&&activeId===s.id)status('Could not refresh that build. Your saved game is still available.',true);});}
 async function showRemote(s:StudioSession,id:string){
  if(!canChangePlay(s))return;
  if(FG.store.loadError)throw Error(FG.store.loadError);
  const playedTest=showing==='candidate'&&s.candidate?.remoteId===id?s.candidate.id:null;
  disposeGame();lastOutcome=null;const generation=epoch,preview=await clientFor(s).preview(id);
  if(!canChangePlay(s,generation))return;
  notebook.update(s.id,s.owner,x=>{x.remoteKind=preview.kind||'star-catcher-v1';});
  remoteViewedId=id;viewedRevisionId=null;nativeStage.classList.add('hidden');$('studioEmpty').hidden=true;const host=$('studioRemoteHost');host.hidden=false;
  iframe=document.createElement('iframe');iframe.title='Private game preview';iframe.setAttribute('sandbox','allow-scripts');iframe.referrerPolicy='no-referrer';
  previewChannel=crypto.randomUUID();previewArtifact=preview.artifactId;previewOwner=s.owner;
  const url=new URL(preview.url);url.searchParams.set('channel',previewChannel);iframe.src=url.href;host.replaceChildren(iframe);
  previewLearning=attachPreviewLearning(iframe,{channel:previewChannel,artifactId:previewArtifact,ownerId:s.owner,gameId:'generated',projectId:s.id,versionId:id,onRound:d=>announceOutcome(s,`You ${d.won?'finished':'tried'} that round. Score: ${d.score}.`,false,playedTest)});
  $('studioPlayNote').textContent=preview.adapter==='mock'?'Test builder (mock)—not a real AI generation.':'Private preview. Your working game stays unchanged until you keep it.';
  render();setTab('game');
 }
 window.addEventListener('message',event=>{
  if(!iframe||event.source!==iframe.contentWindow||previewOwner!==owner()||route!=='studio')return;
  const d=event.data;if(!d||d.type!=='factory-preview'||d.channel!==previewChannel||d.artifactId!==previewArtifact)return;
  if(d.event==='ready'&&Number.isInteger(d.height)&&d.height>=300&&d.height<=1000)iframe.style.height=`${Math.max(400,d.height+12)}px`;

 });
 async function keep(){
  if(saving)return;const s=current(),c=s.candidate,at=epoch;if(!c||!canChangePlay(s,at))return;saving=true;render();
  try{
    if(c.remoteId){await clientFor(s).api('/v1/revisions/'+encodeURIComponent(c.remoteId)+'/keep',{});notebook.update(s.id,s.owner,x=>{x.remoteId=c.remoteId!;x.candidate=null;x.undone=null;});}
    else if(s.projectId){const latest=games.revision(s.projectId,s.owner);if(latest.id!==c.baseId&&!confirm('This test started from an earlier main version. Make this whole test the new main game, without silently adding later changes?'))return;const next=games.keep(s.owner,s.projectId,latest.id,c.config!,c.prompt,s.hypothesis,c.id);notebook.update(s.id,s.owner,x=>{x.candidate=null;x.undone=null;});message(s,'helper',`Kept your change. Your earlier versions are still available in Versions.`);void next;}
    if(sameView(s,at)){showing='working';status('Kept privately. Nothing was published.');if(!FG.learning.active)await playWorking();}
  }finally{saving=false;if(activeId===s.id&&owner()===s.owner)render();}
 }
 async function undo(){
  const s=current(),at=epoch;if(!canChangePlay(s,at))return;
  if(s.candidate){notebook.update(s.id,s.owner,x=>{x.undone=x.candidate;x.candidate=null;});message(s,'helper','Preview undone. Your working game was never overwritten.');await playWorking();render();return;}
  if(s.remoteId){const r=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(s.remoteId)+'/undo',{});notebook.update(s.id,s.owner,x=>{x.remoteId=r.revisionId;});}
  else if(s.projectId)games.undo(s.owner,s.projectId);
  if(sameView(s,at)){status('Restored the earlier working version.');if(!FG.learning.active)await playWorking();render();}
 }
 async function combineTests(ids:string[]){
  const s=current();if(!canChangePlay(s))return;const tests=ids.map(id=>s.experiments?.find(e=>e.id===id));if(tests.some(e=>!e))throw Error('Choose tests from this game.');
  if(!s.projectId||tests.some(e=>!e!.candidate.config)){status('These built games need a new AI experiment. Describe which ideas to combine in the conversation; the originals will stay safe.');setTab('talk');return;}
  const main=games.revision(s.projectId,s.owner);if(tests.some(e=>e!.baseId!==main.id))throw Error('These tests started from a different main version. Compare them first and choose the starting version deliberately.');
  const config={...main.config},chosen=new Map<string,number|boolean>();
  for(const e of tests)for(const [k,v] of Object.entries(e!.candidate.config!)){if(v===main.config[k])continue;if(chosen.has(k)&&chosen.get(k)!==v)throw Error('These tests choose different values for '+k+'. Decide which value you want before combining.');chosen.set(k,v);config[k]=v;}
  const checked=validateConfig(s.game as GameId,config),c:Candidate={id:crypto.randomUUID(),baseId:main.id,config:checked,prompt:'Combine '+tests.map(e=>e!.label).join(' + '),summary:tests.map(e=>e!.candidate.summary).join('; ').slice(0,2200)};
  games.clonePlayState(s.owner,main.id,c.id);notebook.saveExperiment(s.id,s.owner,c,ids,'redesign','child');message(s,'helper','Combined only the selected differences into a new test. Your main game and the other tests are unchanged.');await playCandidate();
 }
 function renderVersions(){
  if(!activeId)return;coaching?.renderShelf();const s=current(),box=$('studioVersionCards');box.replaceChildren();
  if(s.projectId&&!s.remoteId){const currentRevision=games.revision(s.projectId,s.owner);for(const [i,r] of games.history(s.projectId,s.owner).entries()){
    const card=el('article','studio-version-card');card.append(el('strong','',`Version ${i+1}${r.id===currentRevision.id?' · working':''}`),el('p','',r.label));
    const detail=el('p','studio-version-detail',manifests[s.game as GameId].mechanics.map(m=>`${m.label}: ${human(r.config[m.key])}`).join(' · '));card.append(detail);
    const play=el('button','studio-button','Play this version');play.onclick=()=>act(()=>{if(playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'history',r.id))status('Comparing only. Your working version has not changed.');});
    const restore=el('button','studio-button','Use this version');restore.onclick=()=>act(async()=>{if(!canChangePlay(s))return;if(current().candidate&&!confirm('Keep your saved conversation, discard the unkept preview, and use this version?'))return;games.checkout(s.owner,s.projectId!,r.id);notebook.update(s.id,s.owner,x=>{x.candidate=null;});await playWorking();renderVersions();});card.append(play,restore);box.append(card);
  }}else if(s.remoteId){const card=el('article','studio-version-card');card.append(el('strong','','Working game'),el('p','','Kept in the private family workshop.'));const b=el('button','studio-button','Play working game');b.onclick=()=>act(playWorking);card.append(b);const compare=el('button','studio-button','Compare previous');compare.onclick=()=>act(async()=>{const at=epoch;if(!canChangePlay(s,at))return;const c=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(s.remoteId!));if(!canChangePlay(s,at))return;if(!c.parentId){status('This is the first version.');return;}showing='history';await showRemote(s,c.parentId);});card.append(compare);box.append(card);}
  if(s.candidate){const card=el('article','studio-version-card is-candidate');card.append(el('strong','','Unkept preview'),el('p','',s.candidate.summary));const b=el('button','studio-button studio-primary','Play preview');b.onclick=()=>act(playCandidate);card.append(b);box.append(card);}
  if(!box.children.length)box.append(el('p','','Your idea is saved. Versions appear when there is a playable game.'));
 }
 async function copyGame(name:string){
  if(saving)return;const s=current(),at=epoch;if(!canChangePlay(s,at))return;saving=true;const sourceMode=FG.learning.modeFor(s.id);render();
  try{let projectId:string|null=null,remoteId:string|null=null;
    if(s.remoteId||showing==='candidate'&&s.candidate?.remoteId){const r=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(remoteViewedId||(showing==='candidate'?s.candidate?.remoteId:undefined)||s.remoteId!)+'/fork',{name});remoteId=r.revisionId;}
    else if(s.projectId){const selected=showing==='candidate'?s.candidate:null;const historical=showing==='history'&&viewedRevisionId?games.revision(s.projectId,s.owner,viewedRevisionId):null;const p=games.fork(s.owner,s.projectId,name,selected?.config||historical?.config,selected?.prompt||historical?.label,selected?.id||historical?.id);projectId=p.id;}
    const saved=notebook.fork(s.id,s.owner,name,projectId,remoteId);const learner=FG.store.data.profiles.find((p:any)=>p.id===s.owner);if(learner){const before=learner.mathModes;setMode(learner,saved.id,sourceMode);if(!FG.store.save()){learner.mathModes=before;throw Error('Your separate game was saved, but its math format could not be copied.');}}$<HTMLDialogElement>('studioCopyDialog').close();
    if(canChangePlay(s,at)){message(saved,'helper','Saved as a separate game. Your original game is unchanged.');await open(saved.id);}
  }finally{saving=false;render();}
 }
 // Route all child entry points to one workspace. Legacy screens remain available without ?studio=1.
 document.addEventListener('click',event=>{
  const target=(event.target as Element)?.closest<HTMLElement>('button,[data-page],[data-game]');if(!target||target.closest('#page-studio')||target.closest('#page-studio-library')||target.closest('.studio-nav'))return;
  if(target.classList.contains('profile-choice')){act(flushDraft);return;}
  if(target.id==='homeBtn'||target.id==='resultHome'||target.dataset.page==='home'||target.dataset.page==='creations'){event.preventDefault();event.stopImmediatePropagation();act(home);}
  else if(target.dataset.page==='create'){event.preventDefault();event.stopImmediatePropagation();act(newIdea);}
  else if(target.dataset.page==='feedback'||target.id==='improveThis'||target.id==='returnLive'){event.preventDefault();event.stopImmediatePropagation();act(()=>{if(activeId){showStudio();setTab('talk');$('studioPrompt').focus();}else home();});}
  else if(target.dataset.game){event.preventDefault();event.stopImmediatePropagation();act(()=>start(target.dataset.game as GameId));}
  else if(target.id==='exitGame'){event.preventDefault();event.stopImmediatePropagation();act(home);}
  else if(target.dataset.page==='parent'||target.dataset.page==='lab'){act(()=>{flushDraft();disposeGame();route='other';});}
 },true);
 // Keyboard input in the conversation must not operate a game's controls.
 $('studioPrompt').addEventListener('keydown',event=>event.stopPropagation());
 $('studioHome').onclick=()=>act(home);$('studioNavHome').onclick=()=>act(home);$('studioNew').onclick=()=>act(newIdea);$('studioNavCreate').onclick=()=>act(newIdea);$('studioChooseStarter').onclick=()=>act(home);
 $('studioNavPowers').onclick=()=>act(()=>{flushDraft();disposeGame();FG.app.page('lab');route='other';});
 $('studioPlay').onclick=()=>act(()=>showing==='candidate'&&current().candidate?playCandidate():playWorking());$('studioKeep').onclick=()=>act(keep);$('studioUndo').onclick=()=>act(undo);
 $('studioRedo').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;if(s.undone){notebook.update(s.id,s.owner,x=>{x.candidate=x.undone!;x.undone=null;});await playCandidate();return;}if(!s.projectId)return;games.redo(s.owner,s.projectId);await playWorking();});
 $('studioCompare').onclick=()=>{renderVersions();$('studioVersions').hidden=!$('studioVersions').hidden;if(!$('studioVersions').hidden)setTab('versions');};$('studioCloseVersions').onclick=()=>setTab('game');$('studioBackWorking').onclick=()=>act(playWorking);
 $('studioCopy').onclick=()=>{$<HTMLInputElement>('studioCopyName').value=current().name+' copy';$<HTMLDialogElement>('studioCopyDialog').showModal();$('studioCopyName').focus();};$('studioCopyCancel').onclick=()=>$<HTMLDialogElement>('studioCopyDialog').close();
 $('studioCopyForm').onsubmit=e=>{e.preventDefault();act(()=>copyGame($<HTMLInputElement>('studioCopyName').value.trim()));};
 $('studioPromptForm').onsubmit=e=>{e.preventDefault();act(submit);};
 $('studioPrompt').oninput=()=>{clearTimeout(draftTimer);$('studioDraftStatus').textContent='Saving draft…';draftTimer=setTimeout(()=>act(()=>{flushDraft();$('studioDraftStatus').textContent='Draft saved on this device';}),180);};
 $('studioReflectAnswer').onclick=()=>{reflecting=true;setTab('talk');render();$('studioPrompt').focus();};$('studioReflectSkip').onclick=()=>act(()=>{const s=current();notebook.update(s.id,s.owner,x=>{x.reflection=false;});coaching?.pauseReflection();reflecting=false;render();setTab('game');});
 $('studioCancel').onclick=()=>act(async()=>{const s=current();await clientFor(s).cancel();});$('studioRetry').onclick=()=>act(async()=>{const s=current();await clientFor(s).retry();});
 page.querySelectorAll<HTMLElement>('[data-studio-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.studioTab as 'game'|'talk'|'versions'));
 window.addEventListener('factory-profile',()=>{coaching?.reset();clearTimeout(draftTimer);clients.forEach(c=>c.disconnect());clients.clear();activeId=null;reflecting=false;disposeGame();act(home);});
 window.addEventListener('beforeunload',()=>{try{flushDraft();}catch{/* preserve existing data on quota errors */}});
 window.addEventListener('storage',event=>{if(event.key?.startsWith('family-game-factory')){if(route==='library')act(renderLibrary);else if(activeId)act(render);}});
 // Existing progress backups gain an explicitly versioned optional notebook. Old backups remain valid.
 const exportButton=$('exportData');exportButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();act(()=>{if(!FG.store.recoveryRaw)flushDraft();const data=FG.store.recoveryRaw||JSON.stringify({...FG.store.data,factoryWorkspace:games.export(),factoryStudio:notebook.read()},null,2);const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a') as HTMLAnchorElement;a.href=url;a.download='family-game-factory-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});},true);
 const importInput=$<HTMLInputElement>('importData');importInput.addEventListener('change',event=>{event.stopImmediatePropagation();const file=importInput.files?.[0];if(!file)return;act(async()=>{try{if(file.size>20_000_000)throw Error('That backup is too large.');const data=JSON.parse(await file.text());if(data.factoryStudio)validateNotebook(data.factoryStudio);if(data.factoryWorkspace)FG.factory.validateWorkspace(data.factoryWorkspace);if(!confirm('Restore this backup? Current progress will be replaced.'))return;const prior=JSON.stringify(FG.store.data),oldWorkspace=games.export(),oldNotebook=notebook.read();try{FG.store.restore(JSON.stringify(data));if(data.factoryWorkspace)FG.factory.restoreWorkspace(data.factoryWorkspace);if(data.factoryStudio)notebook.restore(data.factoryStudio);}catch(error){FG.store.restore(prior);FG.factory.restoreWorkspace(oldWorkspace);notebook.restore(oldNotebook);throw error;}location.reload();}finally{importInput.value='';}});},true);
 coaching=installCoaching({notebook,current,owner,message,render,status,config:()=>remote,
  rules:()=>{const s=current();if(s.game==='new')return 'New game: rules are being agreed; do not invent recorded outcomes.';const r=s.projectId?games.revision(s.projectId,s.owner):null;return JSON.stringify({game:s.game,instructions:FG.games[s.game]?.instructions,controls:FG.games[s.game]?.controls,settings:r?.config,editable:manifests[s.game as GameId]?.mechanics.map(m=>({key:m.key,label:m.label}))}).slice(0,2000);},
  localSupported:prompt=>{const s=current();if(!s.projectId||s.remoteId)return false;const info=coaching?.details();return interpret(s.game as GameId,info?.continueTest&&s.candidate?.config?s.candidate.config:games.revision(s.projectId,s.owner).config,prompt).kind==='supported';},
  tryRequest:async(prompt)=>{$<HTMLTextAreaElement>('studioPrompt').value=prompt;flushDraft();await submit();},
  playTest:async id=>{const s=current();if(!canChangePlay(s))return;notebook.selectExperiment(s.id,s.owner,id);await playCandidate();},playMain:playWorking,combineTests,
  pauseForThinking:()=>{if(FG.learning.active){status('Finish the current math question first.');return false;}if(mounted||iframe){disposeGame();showStudio();status('Paused for designing. Construction is saved; action games restart this round when you resume.');}return true;},
  showTalk:()=>{showStudio();setTab('talk');$('studioPrompt').focus();}
 });
 home();
 try{remote=validateBuilderConfig(await(await fetch(new URL('factory-config.json',document.baseURI))).json());}catch{remote={version:1,mode:'unavailable'};}configReady=true;if(activeId)render();
 FG.studio={version:1,open:(id:string)=>open(id),home,exportNotebook:()=>notebook.read(),mode:()=>remote.mode};
}
