import { attachPreviewLearning } from '../learning/remote';
import { interpretLearningRequest, learningFormatLabel, setMode } from '../learning/policy';
import {installCoaching} from './coaching';
import {celebrateJem} from '../brand/delight';
import {installStudioVoice} from './voice';
import {installStudioPrivateSpeech} from './private-speech';
import {freshDesign} from './design';
import {buildErrorCopy,buildProgressCopy,builderReadinessCopy,coachConnectionCopy,canCompareExperiments,type BuilderReadiness,type CoachConnection} from './experience';
import {familyFetch} from '../builder/session';
import {profileStorage} from '../adult-pilot/storage';
import './style.css';
import '../brand/jems.css';
import '../brand/playful.css';
import '../brand/experience.css';
import { installQualityCards } from '../quality/cards';
import { StudioNotebook, validateNotebook, type StudioSession, type Candidate, type PendingJob } from './notebook';
import { StudioGames, isGeneratedRemoteKind } from './adapter';
import { installStudioRemixRouting } from './host-navigation';
import { defaults, manifests, validateConfig } from '../runtime/manifests';
import { interpret, examples } from '../factory/interpreter';
import type { GameId, Mechanics, PlayOutcome } from '../runtime/types';
import { BuilderClient, validateBuilderConfig, type BuilderConfig, type JobView } from '../builder/client';
import { installCreationStudio } from '../creation/ui';
import { installCreationProgress } from '../creation/progress';

const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el = (tag:string, className='', text='')=>{const n=document.createElement(tag);n.className=className;n.textContent=text;return n;};
const icon:Record<StudioSession['game'],string>={gum:'🚀',hill:'🚙',buckets:'🪣',dragon:'🐉',moon:'🌙',robot:'🤖',new:'✨'};
const names:Record<StudioSession['game'],string>={gum:'Bubble Gum Builders',hill:'Junkyard Rally',buckets:'Splash or Pass',dragon:'Dragon Island Rescue',moon:'Moon Donut Dash',robot:'Robot Route Lab',new:'A brand-new idea'};
const busy=(s:StudioSession)=>!!s.job&&['queued','building','testing'].includes(s.job.status);
const human=(v:number|boolean)=>typeof v==='boolean'?(v?'On':'Off'):String(v);

/** Studio is the primary child homepage; ?arcade=1 is the reversible legacy route. */
export async function installStudio(){
 const entry=new URLSearchParams(location.search);
 if(entry.get('arcade')==='1'||entry.get('studio')==='0')return;
 const FG=(window as any).FG;
 if(!FG?.app||!FG?.store)return;
 let notebook:StudioNotebook;
 try{notebook=new StudioNotebook(profileStorage(localStorage));}catch(error){
  const warning=el('p','notice',String((error as Error).message));$('page-home').prepend(warning);return;
 }
 const games=new StudioGames(profileStorage(localStorage),FG), owner=()=>String(FG.store.current().id);
 try{games.export();}catch(error){$('page-home').prepend(el('p','notice','Could not open the studio: '+(error as Error).message));return;}
 let activeId:string|null=null,epoch=0,showing:'working'|'candidate'|'history'='working',mounted=false;
 let remote:BuilderConfig={version:1,mode:'unavailable'};
 const clients=new Map<string,BuilderClient>();
 const unknownJobs=new Set<string>();
 let iframe:HTMLIFrameElement|null=null, previewChannel='',previewArtifact='',previewOwner='';
 let previewLearning:ReturnType<typeof attachPreviewLearning>|null=null;
 let configReady=false, route:'library'|'studio'|'other'='library', draftTimer:ReturnType<typeof setTimeout>|undefined;
 let coachConnection:CoachConnection='checking',builderReadiness:BuilderReadiness='checking';
 let saving=false, reflecting=false, lastOutcome:string|null=null,viewedRevisionId:string|null=null,remoteViewedId:string|null=null;
 let coaching:ReturnType<typeof installCoaching>|undefined;
 let voice:ReturnType<typeof installStudioVoice>|undefined;
 let privateSpeech:ReturnType<typeof installStudioPrivateSpeech>|undefined;
 const stopSpeech=()=>{voice?.cancel();privateSpeech?.cancel();};
 const sending=new Set<string>();
 let panel:'game'|'talk'|'versions'='game';
 let pausedForTools=false,viewIntent=0;

 const page=el('section','page hidden');page.id='page-studio';
 page.innerHTML=`<div class="studio-heading"><button type="button" class="studio-back" id="studioHome">← My Games</button><div class="studio-title-wrap"><h1 id="studioTitle" tabindex="-1">Let's make something.</h1></div><span class="studio-storage" id="studioStorage">Saved on this device</span></div>
 <div class="studio-topbar"><div class="studio-version"><span class="studio-dot" aria-hidden="true"></span><span id="studioVersion">New idea</span></div><div class="studio-actions"><button id="studioPlay" class="studio-button studio-primary">▶ Play</button><button id="studioKeep" class="studio-button studio-keep" disabled hidden>⭐ Make this my main game</button><button id="studioHelp" class="studio-button">? How to play</button><details id="studioMore" class="studio-more"><summary>More game tools</summary><div class="studio-more-actions"><button id="studioUndo" class="studio-button" disabled>↶ Undo</button><button id="studioRedo" class="studio-button" disabled>↷ Redo</button><button id="studioCompare" class="studio-button">▤ Tests & versions</button><button id="studioCopy" class="studio-button">＋ Save as a different game</button></div></details></div></div>
 <div id="studioStatus" class="studio-status" role="status" aria-live="polite" aria-atomic="true"></div><button id="studioReady" class="studio-button studio-ready" hidden>Try your ready test →</button>
 <nav class="studio-mobile-tabs" aria-label="Studio panels"><button data-studio-tab="game" aria-pressed="true" aria-controls="studioCanvas">🎮 Game</button><button data-studio-tab="talk" aria-pressed="false" aria-controls="studioConversation">💬 My ideas</button><button data-studio-tab="versions" aria-pressed="false" aria-controls="studioVersions">▤ My tests</button></nav>
 <div class="studio-workspace" data-mobile-panel="game"><div id="studioCanvas" class="studio-canvas-column"><section id="studioHelpPanel" class="studio-help" aria-labelledby="studioHelpTitle" hidden><h2 id="studioHelpTitle" tabindex="-1">How to play</h2><p id="studioHelpGoal"></p><p id="studioHelpControls"></p><details><summary>More controls</summary><p id="studioHelpKeyboard"></p></details><button id="studioCloseHelp" class="studio-button">Got it</button></section><div id="studioPreviewNotice" class="studio-preview-notice" hidden>Trying a different version. Your main game is safe. <button id="studioBackWorking">Back to my main game</button></div><div id="studioGameHost" class="studio-game-host" tabindex="-1" aria-label="Current game"><div id="studioEmpty" class="studio-empty"><img class="jems-empty-workbench" src="./jems-workbench.svg" alt="" aria-hidden="true"><h2>Every great game starts with an idea.</h2><p>Tell jems what you imagine, or choose a game to change.</p><button class="studio-button" id="studioChooseStarter">Choose a starting game</button></div><div id="studioRemoteHost" hidden></div></div><details id="studioMathOptions" class="studio-math-options"><summary>Learning in this game</summary><div id="studioGameSubject" class="studio-game-subject" hidden><strong>Next learning subject</strong><div class="learning-subject-switch" role="group" aria-label="Next game practice subject"><button type="button" id="studioGameMath" aria-pressed="true">🔢 Math</button><button type="button" id="studioGameLanguage" aria-pressed="false">📚 English</button></div><small>Finish any open question before switching.</small></div><div id="studioMathMode"></div></details><p class="studio-footnote" id="studioPlayNote">Your ideas save on this device.</p></div>
 <aside id="studioConversation" class="studio-conversation" aria-label="Your game ideas"><div class="studio-helper-heading"><span class="studio-helper-icon" aria-hidden="true"><img class="jems-helper-mark" src="./jems-mark.svg" alt=""></span><div><h2>jems · Your idea partner</h2><p id="studioAvailability">Checking available tools…</p></div></div><div id="studioMessages" class="studio-messages" role="log" aria-label="Project conversation" aria-live="polite" aria-relevant="additions text"></div><div id="studioReflection" class="studio-reflection" hidden><p id="studioReflectionQuestion">What was fun or tricky?</p><div><button id="studioReflectAnswer" class="studio-chip">Share a thought</button><button id="studioReflectSkip" class="studio-chip">Keep playing</button></div></div><form id="studioPromptForm" class="studio-prompt"><label for="studioPrompt" id="studioPromptLabel" tabindex="-1">What should happen next?</label><textarea id="studioPrompt" rows="3" maxlength="2000" placeholder="Tell me what you imagine…" required></textarea><div id="studioSuggestions" class="studio-suggestions"></div><div class="studio-send-row"><span id="studioDraftStatus" role="status" aria-live="polite">Your ideas save as you type</span><button id="studioTalk" class="studio-button studio-primary" type="button" aria-label="Send your written message to jems">➤ Send to jems</button><button id="studioSend" class="studio-button" type="submit">Try a change →</button></div><div class="studio-voice-row"><button id="studioMic" class="studio-button" type="button" aria-pressed="false" aria-label="Speak to jems using the microphone when supported">🎙 Speak</button><button id="studioVoicePack" class="studio-button" type="button" hidden>Install voice pack</button><button id="studioHear" class="studio-button" type="button" disabled>🔊 Hear reply</button><span id="studioVoiceStatus" role="status" aria-live="polite">Tap Speak, review the words, then press Send to jems.</span></div><p class="studio-voice-note">Speak uses private on-device recognition when supported or a parent-approved private transcription service. A short recording may be sent for transcription, but never automatically to the game builder. Review the words before choosing Send to jems. You can always type.</p><div class="studio-build-controls"><button id="studioCancel" class="studio-button" type="button" hidden>Cancel build</button><button id="studioRetry" class="studio-button" type="button" hidden>Try build again</button></div></form></aside></div>
 <section id="studioVersions" class="studio-versions" aria-labelledby="studioVersionsTitle" hidden><div class="studio-section-heading"><div><h2 id="studioVersionsTitle" tabindex="-1">My tests & versions</h2><p>Try your ideas. You choose which one becomes your main game.</p></div><button class="studio-button" id="studioCloseVersions">Back to game</button></div><div id="studioVersionCards" class="studio-version-cards"></div></section>
 <dialog id="studioCopyDialog" class="studio-dialog" aria-labelledby="studioCopyTitle"><form id="studioCopyForm"><h2 id="studioCopyTitle">Give this game a new name</h2><p>Your original stays safe. Your ideas come with the copy.</p><label for="studioCopyName">Game name</label><input id="studioCopyName" maxlength="60" required><div><button class="studio-button" id="studioCopyCancel" type="button">Cancel</button><button class="studio-button studio-primary" type="submit">Save new game</button></div></form></dialog>`;
 document.querySelector('main')!.append(page);
 // One child-facing journey: an idea-first workspace, a composer with attached
 // actions, and a separate status card that only represents observed build states.
 const creationHero=el('section','studio-creation-hero');
 creationHero.id='studioCreationHero';
 creationHero.innerHTML='<img src="./jems-workbench.svg" alt="" aria-hidden="true"><div><span class="studio-creation-kicker">✨ ANY IDEA CAN START HERE</span><h2>What game can you dream up?</h2><p>A seal hopping on icebergs? A cat on the moon? Tell jems what you imagine!</p></div>';
 $('studioConversation').querySelector('.studio-helper-heading')!.after(creationHero);
 const chatOptions=el('details','studio-chat-options') as HTMLDetailsElement;
 chatOptions.id='studioChatOptions';
 const chatSummary=el('summary','','Chat options');chatSummary.setAttribute('aria-label','Chat privacy options');
 const clearChat=el('button','studio-button','Clear chat on this device') as HTMLButtonElement;
 clearChat.id='studioClearChat';clearChat.type='button';
 chatOptions.append(chatSummary,clearChat);
 $('studioConversation').querySelector('.studio-helper-heading')!.append(chatOptions);
 const sendRow=$('studioPromptForm').querySelector('.studio-send-row')!;
 sendRow.prepend($('studioMic'));
 const privateMic=el('button','studio-button','🎙 Speak') as HTMLButtonElement;
 privateMic.id='studioPrivateMic';privateMic.type='button';privateMic.hidden=true;
 privateMic.setAttribute('aria-pressed','false');
 privateMic.setAttribute('aria-label','Use microphone for parent-approved private transcription, then review your message');
 sendRow.prepend(privateMic);
 sendRow.after($('studioDraftStatus'));
 const workshopNote=el('span','studio-workshop-availability');
 workshopNote.id='studioWorkshopAvailability';
 $('studioSend').after(workshopNote);
 const progressBanner=el('section','studio-progress-banner');
 progressBanner.id='studioBuildProgress';progressBanner.hidden=true;
 progressBanner.setAttribute('role','status');progressBanner.setAttribute('aria-live','polite');
 const progressTitle=el('strong','studio-progress-title'),progressDetails=el('p','studio-progress-detail');
 progressBanner.append(progressTitle,progressDetails);
 page.querySelector('.studio-workspace')!.before(progressBanner);
 progressBanner.append($('studioReady'),$('studioPromptForm').querySelector('.studio-build-controls')!);
 const ideaSparks=el('details','studio-idea-sparks') as HTMLDetailsElement;ideaSparks.id='studioIdeaSparks';
 ideaSparks.append(el('summary','','💡 Need a spark of inspiration?'));
 const sparkOptions=el('div','studio-idea-spark-options');
 for(const [label,idea] of [
  ['🦭 Bouncing seal','Make a game where a seal jumps across icy platforms to reach the end.'],
  ['🐱 Moon cat','Make a game where a cat eats donuts on the moon.'],
  ['🫧 Bubblegum world','Make a game where you build wild machines out of bubblegum.']
 ]){
  const b=el('button','studio-chip',label) as HTMLButtonElement;
  b.type='button';b.onclick=()=>{
   const input=$<HTMLTextAreaElement>('studioPrompt');input.value=idea;
   input.dispatchEvent(new Event('input',{bubbles:true}));ideaSparks.open=false;input.focus();
  };sparkOptions.append(b);
 }
 const askIdeas=el('button','studio-chip','Ask jems for ideas') as HTMLButtonElement;
 askIdeas.type='button';askIdeas.onclick=()=>act(()=>coaching?.discuss('ideas'));
 sparkOptions.append(askIdeas);ideaSparks.append(sparkOptions);
 $('studioPromptForm').after(ideaSparks);

 const voiceDetails=el('details','studio-voice-details');
 voiceDetails.append(el('summary','','Voice & accessibility options'));
 $('studioPromptForm').querySelector('.studio-voice-row')!.before(voiceDetails);
 voiceDetails.append($('studioPromptForm').querySelector('.studio-voice-row')!, $('studioPromptForm').querySelector('.studio-voice-note')!);
 const pausedPreview=el('section','studio-paused-preview');pausedPreview.id='studioPausedPreview';pausedPreview.hidden=true;
 pausedPreview.setAttribute('aria-label','Paused game preview');$('studioGameHost').append(pausedPreview);
 const library=el('section','page');library.id='page-studio-library';
 library.innerHTML="<section class=\"studio-home-hero\" aria-labelledby=\"studioLibraryTitle\">\n<div class=\"studio-home-intro\"><h1 id=\"studioLibraryTitle\" tabindex=\"-1\">What jems will you <span>make today?</span></h1><p>Imagine it. Play it. Make it yours.</p><span class=\"studio-hero-sparkles\" aria-hidden=\"true\">✧ ✦</span></div>\n<div class=\"studio-home-action\"><button type=\"button\" id=\"studioNew\" class=\"studio-make-tile\"><span class=\"studio-make-icon\" aria-hidden=\"true\">✨</span><span class=\"studio-make-copy\"><strong>Invent a game</strong><small>Start with your own idea</small></span><span class=\"studio-make-arrow\" aria-hidden=\"true\">→</span></button><p id=\"studioCreationNote\" class=\"studio-creation-note\" role=\"status\" aria-live=\"polite\"></p></div>\n</section>\n<div id=\"studioContinue\"></div>\n<section id=\"studioFavoritesSection\" class=\"studio-home-favorites\" aria-labelledby=\"studioStarterTitle\"><div class=\"studio-section-heading\"><div><h2 id=\"studioStarterTitle\">Ready to Play jems</h2></div></div><div id=\"studioStarters\" class=\"studio-library-grid\"></div></section>\n<section id=\"studioSavedSection\" class=\"studio-home-saved\" aria-labelledby=\"studioSavedTitle\" hidden><div class=\"studio-section-heading\"><div><h2 id=\"studioSavedTitle\">My jems</h2></div></div><div id=\"studioLibrary\" class=\"studio-library-grid\"></div><div id=\"studioArchived\"></div></section>";
 document.querySelector('main')!.append(library);
 const learningChoice=el('section','studio-learning-choice');learningChoice.id='studioLearningChoice';
 learningChoice.setAttribute('aria-labelledby','studioLearningTitle');
 learningChoice.innerHTML='<div class="studio-learning-copy"><strong id="studioLearningTitle">Learning adventure</strong><small id="studioLearningNote"></small></div><div class="learning-subject-switch" role="group" aria-label="Choose practice subject"><button type="button" id="studioSubjectMath" aria-pressed="true">🔢 Math</button><button type="button" id="studioSubjectLanguage" aria-pressed="false">📚 English</button></div>';
 // The subject switch belongs to the player's header, not below the game shelf.
 const nativeStage=$('page-game');
 const originalNav=document.querySelector('.site-header nav') as HTMLElement;
 originalNav.hidden=true;
 const nav=el('nav','studio-nav');nav.setAttribute('aria-label','Main navigation');
 nav.innerHTML='<button id="studioNavHome">🎮 My Games</button><button id="studioNavCreate">＋ Create</button><button id="studioNavPowers">⚡ My Powers</button>';
 originalNav.after(nav);document.body.classList.add('studio-review');
 const profileBar=document.querySelector('.profile-bar') as HTMLElement,profileChoices=$('profile-choices');
 const profileMenu=document.createElement('details');profileMenu.id='studioProfileMenu';profileMenu.className='studio-profile-menu';
 const profileSummary=document.createElement('summary');profileSummary.id='studioProfileSummary';profileMenu.append(profileSummary,profileChoices);profileBar.replaceChildren(profileMenu);
 // Close the chooser on selection even if a storage fault refuses the switch.
 // An open menu must never obscure My Games or other child navigation.
 profileChoices.addEventListener('click',event=>{
  if((event.target as HTMLElement).closest('.profile-choice'))profileMenu.open=false;
 },true);
 const headerTools=el('div','studio-header-tools');
 headerTools.append(learningChoice,profileBar);
 document.querySelector('.site-header')!.append(headerTools);
 const globalStatus=el('div','studio-status');globalStatus.id='studioGlobalStatus';globalStatus.setAttribute('role','status');globalStatus.setAttribute('aria-live','polite');globalStatus.setAttribute('aria-atomic','true');document.querySelector('main')!.prepend(globalStatus);
 // Background builds are visible on every Studio screen without taking focus.
 const buildShelf=el('aside','studio-build-shelf');buildShelf.id='studioBuildShelf';
 buildShelf.setAttribute('aria-label','Background game builds');buildShelf.hidden=true;globalStatus.after(buildShelf);
 function refreshShelf(){
  const jobs=notebook.list(owner()).filter(s=>!s.archived&&s.job&&(busy(s)||s.job.status==='failed'||!!readyExperiment(s)));
  buildShelf.replaceChildren();buildShelf.hidden=!jobs.length;if(!jobs.length)return;
  buildShelf.append(el('strong','','🏗️ My builds & tests'));
  const items=el('div','studio-build-items');
  for(const s of jobs.slice(0,4)){
   const state=readyExperiment(s)?'✨ Your test is ready':s.job!.status==='failed'?'Build needs help · current game safe':
    unknownJobs.has(s.id)||remote.mode!=='remote'?'Status unknown · checking connection':s.job!.status==='queued'?'Waiting for builder':s.job!.phase==='repairing'?'Trying a fix':
    s.job!.status==='testing'?'Testing your game':'Building your idea';
   const item=el('div','studio-build-item'),copy=el('div','studio-build-copy'),controls=el('div','studio-build-item-actions');
   copy.append(el('strong','',s.name),el('span','',state));
   const openButton=el('button','studio-button',readyExperiment(s)?'Try ready test':'Open game') as HTMLButtonElement;
   openButton.type='button';openButton.onclick=()=>act(async()=>{
    if(guardMath())return;
    await open(s.id);
    if(owner()!==s.owner||route!=='studio'||activeId!==s.id)return;
    const latest=notebook.get(s.id,s.owner),ready=readyExperiment(latest);
    if(ready?.candidate.remoteId)await showRemote(latest,ready.candidate.remoteId,'candidate',ready.id);
   });controls.append(openButton);
   if(busy(s)){
    const stop=el('button','studio-button studio-stop-build','Stop build') as HTMLButtonElement;
    stop.type='button';stop.setAttribute('aria-label','Stop build for '+s.name);
    stop.onclick=()=>{
     stop.disabled=true;stop.textContent='Stopping…';
     void (async()=>{
      try{
       const result=await clientFor(s).cancel(s.job!.id);
       if(owner()!==s.owner)return;
       if(result.status==='cancelled')status('Build stopped. Your current game is safe.');
       else{status('Stop requested. Checking the build status.');const latest=notebook.get(s.id,s.owner);if(busy(latest))resume(latest);}
      }catch{
       if(owner()===s.owner){unknownJobs.add(s.id);status('Could not confirm stop. The build may still be working.',true);}
      }finally{if(owner()===s.owner)refreshShelf();}
     })();
    };controls.append(stop);
   }
   item.append(copy,controls);items.append(item);
  }
  buildShelf.append(items);
  if(jobs.some(busy)){
   const actions=el('div','studio-build-actions'),play=el('button','studio-button','🎮 Ready to Play jems') as HTMLButtonElement;
   if(route==='studio'&&activeId&&jobs.some(s=>s.id===activeId)){
    const keep=el('button','studio-button','▶ Keep playing') as HTMLButtonElement;
    keep.type='button';keep.onclick=()=>act(playViewed);actions.append(keep);
   }
   play.type='button';play.onclick=()=>act(home);
   const practice=el('button','studio-button','⚡ Extra practice (optional)') as HTMLButtonElement;
   practice.type='button';practice.onclick=()=>act(()=>{if(guardMath())return;stopSpeech();flushDraft();disposeGame();FG.app.page('lab');route='other';});
   actions.append(play,practice);buildShelf.append(actions);
  }
 }
 function updateProfile(){const child=FG.store.current();profileSummary.textContent=`${child.icon||'⭐'} ${child.name}`;profileSummary.setAttribute('aria-label','Switch player. Current player: '+child.name);profileSummary.title='Switch player';profileMenu.open=false;}
 updateProfile();
 function focusView(target:HTMLElement){if(!target.isConnected||target.closest('[hidden],.hidden,[inert]'))return;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});}
 function guardMath(){if(!FG.learning.active)return false;status('Your learning activity is still here. Finish it, or choose My Games to leave.');FG.learning.focus?.();return true;}
 function readyExperiment(s:StudioSession){return s.job?.status==='ready'&&s.job.revisionId?s.experiments?.find(e=>e.candidate.remoteId===s.job!.revisionId&&e.candidate.remoteId!==s.remoteId&&e.id!==s.selectedTest):undefined;}

 function current(){if(!activeId)throw Error('Choose a project first.');return notebook.get(activeId,owner());}
 function act(action:()=>void|Promise<void>){const actor=owner();try{const result=action(),project=activeId,view=route;Promise.resolve(result).catch(error=>{if(owner()===actor&&activeId===project&&route===view)status((error as Error).message,true);});}catch(error){if(owner()===actor)status((error as Error).message,true);}}
 function status(text:string,error=false){const target=route==='studio'?$('studioStatus'):globalStatus;target.textContent=text;target.classList.toggle('is-error',error);target.setAttribute('role',error?'alert':'status');}
 function sameView(s:StudioSession,at=epoch){return at===epoch&&owner()===s.owner&&activeId===s.id&&route==='studio';}
 function canChangePlay(s:StudioSession,at=epoch){if(!sameView(s,at))return false;if(guardMath())return false;return true;}
 function message(s:StudioSession,role:'child'|'helper'|'reflection',text:string){
  notebook.message(s.id,s.owner,role,text);
  if(activeId===s.id&&owner()===s.owner){
   renderConversation();
   // Immediately reveal the child's message; do not leave the first idea
   // hidden while the model or local helper is still working.
   if(role==='child'&&s.game==='new')render();
  }
 }
 function flushDraft(){
  clearTimeout(draftTimer);if(!activeId)return;const s=current();
  try{coaching?.flushDrafts();if(s.draft!==$<HTMLTextAreaElement>('studioPrompt').value)notebook.update(s.id,s.owner,x=>{x.draft=$<HTMLTextAreaElement>('studioPrompt').value;});$('studioDraftStatus').textContent='Saved on this device';}
  catch(error){$('studioDraftStatus').textContent='Could not save. Keep this page open.';$('studioStorage').textContent='Could not save — keep this page open';throw error;}
 }
 function setTab(tab:'game'|'talk'|'versions'){
  if(tab!=='game'&&guardMath())return false;
  if(tab!=='talk')stopSpeech();
  if(tab!=='game'){
   ++viewIntent;flushDraft();
   if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}
  }
  panel=tab;document.body.classList.toggle('studio-designing',tab==='talk');
  $('page-studio').querySelector('.studio-workspace')!.setAttribute('data-mobile-panel',tab);
  document.querySelectorAll('[data-studio-tab]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.studioTab===tab)));
  if(tab==='versions'){$('studioVersions').hidden=false;renderVersions();focusView($('studioVersionsTitle'));}else $('studioVersions').hidden=true;
  if(tab==='talk'){focusView($('studioPromptLabel'));void privateSpeech?.refresh();}
  return true;
 }
 function showStudio(){
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));page.classList.remove('hidden');route='studio';
  nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));globalStatus.textContent='';
 }
 function clearPausedPreview(){pausedPreview.hidden=true;pausedPreview.replaceChildren();}
 function capturePausedPreview(){
  clearPausedPreview();const name=$('studioTitle').textContent||'Your game',scene=el('div','studio-paused-scene'),caption=el('div','studio-paused-caption');
  // Copy pixels once, before unmount. No game instance, animation, URL or storage is retained.
  const mount=$('game-mount'),source=mount.querySelector('canvas')||Array.from(mount.children).map(child=>child.shadowRoot?.querySelector('canvas')).find(Boolean);
  if(source&&source.width>0&&source.height>0)try{
   const frame=document.createElement('canvas'),scale=Math.min(1,960/source.width,600/source.height);
   frame.width=Math.max(1,Math.round(source.width*scale));frame.height=Math.max(1,Math.round(source.height*scale));
   const context=frame.getContext('2d');if(context){
    context.drawImage(source,0,0,frame.width,frame.height);
    const pixels=context.getImageData(0,0,frame.width,frame.height).data;
    // A just-mounted or unavailable canvas may have no painted frame yet.
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]){frame.setAttribute('role','img');frame.setAttribute('aria-label',name+' — paused scene');scene.append(frame);break;}
   }
  }catch{/* A missing or unreadable frame still gets the named placeholder below. */}
  if(!scene.childElementCount){const symbol=el('span','studio-paused-symbol','Ⅱ');symbol.setAttribute('aria-hidden','true');scene.append(symbol);}
  caption.append(el('strong','',name),el('p','','Your game is waiting. Your construction is saved; action games start a new round.'));const back=el('button','studio-button studio-primary','Back to this game →');back.id='studioReturnToPlay';back.onclick=()=>act(playViewed);caption.append(back);
  pausedPreview.append(scene,caption);pausedPreview.hidden=false;
 }
 function disposeGame(keepScene=false){
  if(keepScene&&(mounted||iframe))capturePausedPreview();else clearPausedPreview();
  if(!keepScene){pausedForTools=false;$('studioHelpPanel').hidden=true;}
  ++epoch;previewLearning?.dispose();previewLearning=null;FG.learning.dispose();iframe?.remove();iframe=null;previewChannel='';previewArtifact='';previewOwner='';
  // The original host cleans listeners, timers, audio and pending math callbacks.
  if(mounted){FG.app.page('home');mounted=false;}
  nativeStage.classList.add('hidden');$('studioRemoteHost').replaceChildren();$('studioRemoteHost').hidden=true;
 }
 function updateCreationNote(){
  const note=$('studioCreationNote');if(!note)return;
  note.textContent=!configReady?'Checking which creation tools are ready…':builderReadiness==='not-configured'?'Game building is not connected yet. Your idea will still save.':builderReadinessCopy(builderReadiness)+'. Your ideas stay saved here.';
 }
 function refreshLearningChoice(){
   const p=FG.store.current(),subject=FG.learning.subject,both=!!p.allowSubjectSwitch;
   learningChoice.hidden=!both;
   for(const [id,value] of [['studioSubjectMath','math'],['studioSubjectLanguage','language']] as const){
     const button=$<HTMLButtonElement>(id);button.setAttribute('aria-pressed',String(subject===value));
     button.disabled=!both||!!FG.learning.active||!!FG.store.loadError;
   }
   $('studioLearningNote').textContent=both?'Choose what to practice next. Math and English keep separate progress.':'A grown-up can enable both subjects in Parent Controls.';
 }
 function refreshGameSubject(){
   const p=FG.store.current(),both=!!p.allowSubjectSwitch,active=!!FG.learning.active;
   $('studioGameSubject').hidden=!both;
   for(const [id,value] of [['studioGameMath','math'],['studioGameLanguage','language']] as const){
     const button=$<HTMLButtonElement>(id);
     button.setAttribute('aria-pressed',String(FG.learning.subject===value));
     button.disabled=!both||active||!!FG.store.loadError;
   }
 }
 function chooseLearningSubject(subject:'math'|'language'){
   try{FG.learning.setSubject(subject);refreshLearningChoice();if(route==='studio')$('studioStatus').textContent='';else globalStatus.textContent='';}
   catch(error){globalStatus.textContent=(error as Error).message;}
 }
 async function refreshServiceReadiness(){
  if(remote.mode!=='remote')return;
  const actor=owner(),at=epoch;
  // Public configuration merely selects URLs; only an authenticated server
  // check can distinguish an available service, session failure and allowance.
  const check=async(path:string)=>{
   const response=await familyFetch(remote.apiBaseUrl!,path,{credentials:'include',cache:'no-store'});
   if(!response.ok)throw Error(response.status===401?'UNAUTHENTICATED':response.status===403?'FORBIDDEN':'SERVICE_UNAVAILABLE');
   return response.json();
  };
  const [coach,builder]=await Promise.allSettled([check('/v1/coach/status'),check('/v1/builder/status')]);
  if(actor!==owner()||at!==epoch)return;
  if(coach.status==='fulfilled')coachConnection=coach.value?.available?'available':'unavailable';
  else coachConnection=coach.reason instanceof Error&&coach.reason.message==='UNAUTHENTICATED'?'sign-in':'unavailable';
  if(builder.status==='fulfilled')builderReadiness=builder.value?.available?'available':builder.value?.reason==='ALLOWANCE_REQUIRED'?'allowance-required':'unavailable';
  else builderReadiness=builder.reason instanceof Error&&builder.reason.message==='UNAUTHENTICATED'?'sign-in':'unverified';
  if(activeId)render();else updateCreationNote();
 }
 function renderLibrary(){
  refreshLearningChoice();
  const entries=notebook.list(owner()),box=$('studioLibrary');box.replaceChildren();
  // Import references to existing local remixes without copying or migrating their data.
  for(const p of games.list(owner())) if(!entries.some(s=>s.projectId===p.id))entries.push({...notebook.create(owner(),p.game,p.name,p.id)});
  const last=notebook.last(owner());$('studioContinue').replaceChildren();
  if(last){
   const banner=el('div','studio-continue'),art=el('span','studio-continue-art',icon[last.game]),description=el('div','studio-continue-copy');
   art.setAttribute('aria-hidden','true');
   description.append(el('strong','',last.name));
   const continueButton=el('button','studio-button studio-primary',last.projectId||last.remoteId?'▶ Continue playing':'✦ Continue my idea') as HTMLButtonElement;
   continueButton.type='button';continueButton.id='studioContinuePlaying';continueButton.onclick=()=>act(()=>open(last.id));
   const dismiss=el('button','studio-continue-close','×') as HTMLButtonElement;
   dismiss.type='button';dismiss.id='studioDismissResume';dismiss.title='Dismiss reminder';
   dismiss.setAttribute('aria-label','Dismiss reminder for '+last.name);
   dismiss.onclick=()=>act(()=>{notebook.dismissResume(last.id,last.owner);renderLibrary();});
   banner.append(art,description,continueButton,dismiss);$('studioContinue').append(banner);
  }
  const saved=entries.filter(s=>!s.archived&&(!s.playOnly||s.experiments?.length||s.candidate));
  const archived=entries.filter(s=>s.archived);
  $('studioSavedSection').hidden=!saved.length&&!archived.length;
  $('studioStarterTitle').textContent='Ready to Play jems';
  saved.forEach(s=>{
   const card=el('article','studio-library-card studio-saved-card');card.setAttribute('data-session',s.id);
   const state:'building'|'ready'|'playable'|'idea'=busy(s)?'building':readyExperiment(s)||s.candidate?'ready':s.projectId||s.remoteId?'playable':'idea';
   const label={building:'Working on your idea',ready:'A test is ready to try',playable:'Ready to play',idea:'Idea · not built yet'}[state];
   const badge={building:'Tools at work',ready:'✦ Test ready',playable:'✦ Playable jem',idea:'✦ Your idea'}[state];
   card.dataset.jemsState=state;
   const openButton=el('button','studio-saved-open') as HTMLButtonElement;
   openButton.type='button';openButton.setAttribute('aria-label','Open '+s.name);
   openButton.append(el('span','jems-project-badge',badge),el('span','studio-card-icon',icon[s.game]),el('span','studio-card-name',s.name),el('span','studio-card-state',label),el('span','studio-card-link','Open my game →'));
   openButton.onclick=()=>act(()=>open(s.id));
   const putAway=el('button','studio-put-away',busy(s)?'Stop build first':'Put away') as HTMLButtonElement;
   putAway.type='button';putAway.disabled=busy(s);
   putAway.setAttribute('aria-label',busy(s)?'Stop the build before putting away '+s.name:'Put away '+s.name);
   putAway.title=busy(s)?'Stop the build in My builds & tests first':'Put this jem away without deleting it';
   putAway.onclick=()=>act(()=>{notebook.archive(s.id,s.owner);renderLibrary();});
   card.append(openButton,putAway);box.append(card);
  });
  const archivedBox=$('studioArchived');archivedBox.replaceChildren();
  if(archived.length){
   const details=el('details','studio-archived-details');
   details.append(el('summary','','Put-away jems ('+archived.length+')'));
   const list=el('div','studio-archived-list');
   for(const s of archived){
    const row=el('div','studio-archived-item');
    row.append(el('span','',s.name));
    const restore=el('button','studio-button','Bring back') as HTMLButtonElement;
    restore.type='button';restore.setAttribute('aria-label','Bring back '+s.name);
    restore.onclick=()=>act(()=>{notebook.unarchive(s.id,s.owner);renderLibrary();});
    row.append(restore);list.append(row);
   }
   details.append(list);archivedBox.append(details);
  }
  refreshShelf();
  const starters=$('studioStarters');starters.replaceChildren();
  const descriptions:Record<GameId,string>={
   gum:'Build wild machines with bubble gum.',hill:'Race over hills in a junkyard ride.',
   buckets:'Pick a bucket. Dodge the splat!',dragon:'Bounce fireballs back at a dragon.',
   moon:'Chase donuts through moonlight.',robot:'Guide your robot through tricky routes.'
  };
  const companions:Record<GameId,string>={gum:'🫧',hill:'⚙️',buckets:'🍅',dragon:'🛡️',moon:'🍩',robot:'🧩'};
  const worldLabels:Record<GameId,string>={gum:'BUILD',hill:'RACE',buckets:'SURPRISE',dragon:'DRAGON',moon:'SPACE',robot:'ROBOT'};
  const worldScenes:Partial<Record<GameId,string>>={
   buckets:'./jems-world-buckets.svg',dragon:'./jems-world-dragon.svg',
   moon:'./jems-world-moon.svg',robot:'./jems-world-robot.svg'
  };
  (['gum','hill','buckets','dragon','moon','robot'] as GameId[]).forEach(game=>{
   const b=el('button',`studio-library-card studio-starter ${game}`) as HTMLButtonElement;
   b.type='button';b.setAttribute('data-starter',game);
   const art=el('span',`studio-game-art studio-art-${game}`);art.setAttribute('aria-hidden','true');
   if(game==='gum'||game==='hill'){const canvas=document.createElement('canvas');canvas.className='quality-card-art';canvas.dataset.qualityCard=game;art.append(canvas);}
   else {
    const image=el('img','jems-world-scene') as HTMLImageElement;
    image.src=worldScenes[game]!;image.alt='';image.setAttribute('aria-hidden','true');
    art.append(image,el('span','studio-art-halo'),el('span','studio-art-symbol',icon[game]),el('span','studio-art-companion',companions[game]));
   }
   art.append(el('span','jems-world-chip',worldLabels[game]));
   const info=el('span','studio-card-info');
   info.append(el('span','studio-card-name',names[game]),el('span','studio-card-state',descriptions[game]),el('span','studio-card-link','Play & make it yours  →'));
   b.append(art,info);b.onclick=()=>act(()=>start(game));starters.append(b);
  });installQualityCards();updateCreationNote();
 }
 function home(){stopSpeech();flushDraft();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));library.classList.remove('hidden');route='library';renderLibrary();nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.id==='studioNavHome'));window.scrollTo(0,0);focusView($('studioLibraryTitle'));}
 function start(game:GameId){
  const existing=notebook.list(owner()).find(s=>s.game===game&&s.playOnly);if(existing)return open(existing.id);
  const p=games.create(owner(),game,`My ${names[game]}`,defaults(game,FG.store.current().remixes?.[game]||'classic'));
  const s=notebook.create(owner(),game,p.name,p.id);notebook.update(s.id,s.owner,x=>{x.playOnly=true;});message(s,'helper','Play first. When you want to test an idea, your original game stays safe.');return open(s.id);
 }
 function newIdea(){flushDraft();const s=notebook.create(owner(),'new','My new idea');message(s,'helper','Tell jems what you imagine. One sentence is enough. Your idea is safe even when game building is unavailable.');return open(s.id);}
 async function open(id:string){
  stopSpeech();flushDraft();disposeGame();notebook.select(id,owner());activeId=id;reflecting=false;lastOutcome=null;showing='working';status('');
  const s=current();if(s.candidate&&!s.experiments?.some(e=>e.id===s.candidate!.id))notebook.saveExperiment(s.id,s.owner,s.candidate);coaching?.openSession();$<HTMLTextAreaElement>('studioPrompt').value=s.draft;globalStatus.textContent='';$<HTMLDetailsElement>('studioMore').open=false;showStudio();render();setTab('game');focusView($('studioTitle'));
  if(s.projectId||s.remoteId)await playWorking();else if(s.candidate)await playCandidate();else{$('studioEmpty').hidden=false;setTab('talk');}
  if(s.job&&busy(s)&&remote.mode==='remote'&&s.job.api===remote.apiBaseUrl&&!clients.has(s.id))resume(s);
 }
 function renderConversation(){
  if(!activeId)return;const s=current(),box=$('studioMessages');
  const atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  const same=box.dataset.session===s.id&&box.childElementCount<=s.messages.length&&Array.from(box.children).every((node,i)=>(node as HTMLElement).dataset.message===s.messages[i]?.id);
  if(!same){box.replaceChildren();box.dataset.session=s.id;}
  for(const m of s.messages.slice(box.childElementCount)){
   const article=el('div',`studio-message ${m.role}`);article.dataset.message=m.id;
   // The original welcome line is already explained by the hero. Keep it in
   // the durable notebook, but do not take first-screen space repeating it.
   if(s.game==='new'&&m.role==='helper'&&m.text.startsWith('Tell jems what you imagine. One sentence is enough.'))article.classList.add('studio-intro-message');
   article.append(el('span','studio-message-author',m.role==='child'?'You':m.role==='reflection'?'Your observation':'jems'),el('p','',m.text));box.append(article);
  }
  if(!same||atEnd)box.scrollTop=box.scrollHeight;
 }
 function render(){
  if(!activeId)return;const s=current(),working=s.projectId?games.revision(s.projectId,s.owner):null;refreshShelf();
  refreshGameSubject();FG.learning.modeControl($('studioMathMode'),s.id);$('studioTitle').textContent=s.name;$('studioStorage').textContent=s.remoteId||s.candidate?.remoteId?'Private family game · local conversation':'Saved on this device';
  const n=s.projectId?games.history(s.projectId,s.owner).findIndex(r=>r.id===working?.id)+1:0;
  $('studioVersion').textContent=showing==='candidate'?((s.experiments||[]).find(e=>e.id===s.candidate?.id)?.label||'Preview')+' · my main game is safe':showing==='history'?'Trying an earlier version':working?`My main game · version ${n}`:s.remoteId?'My main game':'My idea · ready to imagine';
  $('studioPreviewNotice').hidden=showing==='working';
  const creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  const hasIdea=creating&&s.messages.some(m=>m.role==='child');
  page.classList.toggle('studio-creating',creating);
  page.classList.toggle('studio-idea-unstarted',creating&&!hasIdea);
  page.classList.toggle('studio-idea-started',creating&&hasIdea);
  creationHero.hidden=!creating;
  ideaSparks.hidden=!creating;
  if(!creating)ideaSparks.open=false;
  creationHero.querySelector('h2')!.textContent=hasIdea?'Your game is taking shape!':'What game can you dream up?';
  creationHero.querySelector('p')!.textContent=hasIdea?'Keep sharing your ideas, then build when you are ready.':'A seal hopping on icebergs? A cat on the moon? Tell jems what you imagine!';
  $('studioAvailability').textContent=coachConnectionCopy(configReady?coachConnection:'checking');
  workshopNote.textContent=builderReadinessCopy(configReady?builderReadiness:'checking');
  const progress=buildProgressCopy(s.job?{status:s.job.status,phase:s.job.phase}:undefined,sending.has(s.id),unknownJobs.has(s.id));
  progressBanner.hidden=!progress;
  progressBanner.dataset.phase=progress?.phase||'';
  progressTitle.textContent=progress?.title||'';
  progressDetails.textContent=progress?.description||'';
  
  $<HTMLButtonElement>('studioPlay').disabled=!(working||s.remoteId||s.candidate);
  $<HTMLButtonElement>('studioKeep').disabled=!s.candidate||showing!=='candidate'||saving||!!s.candidate.remoteId&&!previewLearning?.ready;$('studioKeep').hidden=!s.candidate||showing!=='candidate';$('studioReady').hidden=!readyExperiment(s);$<HTMLButtonElement>('studioHelp').disabled=!(s.projectId||s.remoteId||s.candidate);$('studioPlay').textContent=pausedForTools?'▶ Back to my game':'▶ Play';
  $<HTMLButtonElement>('studioUndo').disabled=!s.candidate&&!working?.parentId&&!s.remoteId;
  $<HTMLButtonElement>('studioRedo').disabled=!!s.candidate||(!s.undone&&(!working||!games.history(s.projectId!,s.owner).some(r=>r.parentId===working.id)));
  $<HTMLButtonElement>('studioCopy').disabled=!(working||s.remoteId||s.candidate)||saving;
  $<HTMLButtonElement>('studioSend').disabled=sending.has(s.id)||saving;$('studioSend').textContent=reflecting?'Save thought →':'Try a change →';
  $<HTMLButtonElement>('studioTalk').disabled=reflecting;
  $('studioPromptLabel').textContent=reflecting?'What did you notice?':creating?(hasIdea?'What happens next in your game?':'Tell jems your game idea'):'Tell jems what you want to discuss or change';
  // A child who already told jems an idea can choose Build without repeating it.
  $<HTMLTextAreaElement>('studioPrompt').required=!(creating&&s.messages.some(m=>m.role==='child'));
  $('studioSend').textContent=reflecting?'Save thought →':creating?'✨ Build my game':'Try a change →';
  $('studioReflection').hidden=!s.reflection;$('studioCancel').hidden=!busy(s);$('studioRetry').hidden=s.job?.status!=='failed';
  const suggestions=$('studioSuggestions');suggestions.replaceChildren();
  if(s.projectId&&!s.remoteId)(examples[s.game as GameId]||[]).slice(0,2).forEach(text=>{const b=el('button','studio-chip',text);b.setAttribute('type','button');b.onclick=()=>{reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value=text;flushDraft();render();$('studioPrompt').focus();};suggestions.append(b);});
  renderConversation();if(panel==='versions'&&!document.activeElement?.closest('#experimentShelf'))coaching?.renderShelf();
 }
 function mountNative(){
  pausedForTools=false;$<HTMLDetailsElement>('studioMore').open=false;$('studioEmpty').hidden=true;$('studioRemoteHost').hidden=true;
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
 async function playWorking(){const s=current();if(!canChangePlay(s))return;if(s.remoteId){await showRemote(s,s.remoteId,'working');return;}if(!s.projectId){disposeGame();showing='working';$('studioEmpty').hidden=false;showStudio();render();return;}const r=games.revision(s.projectId,s.owner);playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'working',r.id);}
 async function playCandidate(){const s=current(),c=s.candidate;if(!canChangePlay(s))return;if(!c)return playWorking();if(c.remoteId){await showRemote(s,c.remoteId,'candidate');}else playLocal(s,validateConfig(s.game as GameId,c.config),c.id,'candidate');}
 async function playViewed(){
  const s=current();if(!canChangePlay(s))return;
  stopSpeech();
  if(showing==='history'){
   if(remoteViewedId){await showRemote(s,remoteViewedId);return;}
   if(s.projectId&&viewedRevisionId){const r=games.revision(s.projectId,s.owner,viewedRevisionId);playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'history',r.id);return;}
  }
  if(showing==='candidate'&&s.candidate)await playCandidate();else await playWorking();
 }
 function showHelp(){
  const s=current();if(guardMath())return;++viewIntent;
  if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;}
  setTab('game');render();$('studioHelpPanel').hidden=false;
  const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
  const native=!remoteViewedId&&s.game!=='new';
  $('studioHelpGoal').textContent=native?FG.games[s.game]?.instructions||'Try your game and see what happens.':'Use the instructions and controls shown inside your game. Your saved tests stay in My tests.';
  const touchHelp:Record<string,string>={moon:'Tap Left or Right to run, and Jump to leap over meteors.',robot:'Tap the arrows to plan a route, then Run to test it.',gum:'Tap a part to add it. Drag to move it. Choose Gum, then another part to stick them together. Choose Test machine to try it.',hill:'Hold the right pedal to drive. Hold the left pedal to brake. You can change your ride in the garage.',buckets:'Tap a bucket to choose it. Watch what happens, then try another round.',dragon:'Use the arrow buttons to move. Tap the jump button to bounce fireballs with your shield.'};
  const viewedConfig=showing==='candidate'?s.candidate?.config:s.projectId?games.revision(s.projectId,s.owner,showing==='history'?viewedRevisionId||undefined:undefined).config:undefined;
  const oldConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===0;
  const physicalConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===1;
  const stickerConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===2;
  $('studioHelpControls').textContent=stickerConstruction?'Choose a sticker and tap a bubble on the machine, or drag a sticker onto a bubble. Add three, then tap Make it GO!':physicalConstruction?(touch?touchHelp.gum:'Choose a part from the tray, place it on the canvas, attach parts with gum and test your machine.'):oldConstruction?'Choose a part in your build, then use the move, turn and connect controls shown below it. Try your machine and change it again.':native&&touch?touchHelp[s.game]:native?FG.games[s.game]?.controls||'Use the controls in your game.':'Tap the game first, then use its buttons or keyboard controls.';
  $('studioHelpKeyboard').textContent=stickerConstruction?'Press Tab to choose a sticker, Enter to select it, then Tab and Enter to place it on a bubble.':physicalConstruction?'Use Tab to reach parts and tools, Enter to select them, arrow keys to move a chosen part, and R to rotate it.':oldConstruction?'Use Tab and Enter to choose parts and construction controls.':'Use Tab to reach controls and Enter to choose. How a character moves depends on this game.';
  focusView($('studioHelpTitle'));
 }
 async function submit(){
  if(guardMath())return;stopSpeech();flushDraft();const s=current(),prompt=s.draft.trim()||(s.game==='new'&&!s.remoteId?s.messages.find(m=>m.role==='child')?.text.trim()||'':''),started=epoch;if(!prompt)return;
  if(reflecting){notebook.observe(s.id,s.owner,prompt,'child',s.design?.observations.filter(o=>o.source==='runtime').at(-1)?.experimentId||null);message(s,'reflection',prompt);notebook.update(s.id,s.owner,x=>{x.draft='';x.reflection=false;});reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value='';render();return;}
  if(sending.has(s.id)){status('Sending the earlier request. Your ideas and game are safe.');return;}
  const mathRequest=interpretLearningRequest(prompt,FG.learning.subject);
  if(mathRequest){message(s,'child',prompt);notebook.update(s.id,s.owner,x=>{x.reflection=false;});if(mathRequest.kind==='required'){message(s,'helper',mathRequest.message);}else{FG.learning.setMode(s.id,mathRequest.mode);message(s,'helper',`Learning format set to ${learningFormatLabel(FG.learning.subject,mathRequest.mode)}. It applies at the next safe learning moment; your game rules and learning history stay together.`);notebook.update(s.id,s.owner,x=>{x.draft='';});$<HTMLTextAreaElement>('studioPrompt').value='';}render();return;}
  if(await coaching?.intercept(prompt,true))return;if(!sameView(s,started))return;
  const decision=coaching?.details()||{continueTest:false,parents:[],depth:'tune' as const,origin:'child' as const};
  message(s,'child',prompt);notebook.update(s.id,s.owner,x=>{x.reflection=false;x.playOnly=false;});
  if(s.projectId&&!s.remoteId&&!s.candidate?.remoteId){
    const working=games.revision(s.projectId,s.owner),config=decision.continueTest&&s.candidate?.config?s.candidate.config:working.config;
    const intent=interpret(s.game as GameId,config,prompt);
    if(intent.kind==='supported'){
      const c:Candidate={id:crypto.randomUUID(),baseId:decision.continueTest&&s.candidate?s.candidate.baseId:working.id,config:intent.config,prompt,summary:intent.summary};
      games.clonePlayState(s.owner,decision.continueTest&&s.candidate?s.candidate.id:working.id,c.id);
      notebook.saveExperiment(s.id,s.owner,c,decision.parents,decision.depth,decision.origin);
      // Keep the concurrent AI build and its exact starting revision.
       notebook.update(s.id,s.owner,x=>{x.draft='';});$<HTMLTextAreaElement>('studioPrompt').value='';
      message(s,'helper',`${intent.summary}. This is a test. Play it before choosing Make this my main game.`);await playCandidate();return;
    }
    if(intent.kind!=='generation-needed'){message(s,'helper',intent.message);render();return;}
  }
  if(busy(s)){message(s,'helper','Your big edit is building. This new idea is saved for later; quick edits still work.');status('Background build active · idea saved');render();return;}
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
  const input={gameId:s.remoteId||chosen?.remoteId?(isGeneratedRemoteKind(s.remoteKind)?'generated-module':'star-catcher'):s.game,baseRevisionId:chosen?.remoteId||s.remoteId||(chosen?.config?chosen.id:r?.id)||null,prompt,...(r&&!s.remoteId&&!chosen?.remoteId?{config:chosen?.config||r.config}:{})};
  // Request admission ends at the durable ACK, not when a game finishes building.
  // Continue status polling independently while a child plays or makes other edits.
  void clientFor(s).submit(input).catch(error=>{
   if(owner()!==s.owner)return;
   const saved=notebook.get(s.id,s.owner);
   if(busy(saved)&&saved.job?.api===remote.apiBaseUrl){
    unknownJobs.add(s.id);refreshShelf();resume(saved);
    if(activeId===s.id&&owner()===s.owner)
     status('Connection interrupted. The builder may still be working; checking again.');
   }else{
    const code=error instanceof Error?error.message:undefined;
    const explanation=buildErrorCopy(code);
    message(s,'helper',explanation);
    if(activeId===s.id&&owner()===s.owner)status(explanation,true);
   }
  }).finally(()=>{
   sending.delete(s.id);
   if(activeId===s.id&&owner()===s.owner)render();
  }).catch(error=>{
   if(activeId===s.id&&owner()===s.owner)status('Could not save the builder status. Your current game is safe.',true);
  });
 }
 async function onJob(captured:StudioSession,job:JobView){
  if(owner()!==captured.owner)return;
  const prior=notebook.get(captured.id,captured.owner);unknownJobs.delete(captured.id);
  const terminal=['ready','failed','cancelled'].includes(job.status);
  const phase=typeof job.phase==='string'&&/^[a-z-]{1,32}$/.test(job.phase)?job.phase:undefined;
   if(prior.job?.id!==job.jobId||prior.job.status!==job.status||prior.job.revisionId!==job.revisionId||prior.job.phase!==phase)
    notebook.update(captured.id,captured.owner,s=>{s.job={id:job.jobId,api:remote.apiBaseUrl||'',status:job.status as PendingJob['status'],...(job.revisionId?{revisionId:job.revisionId}:{}),...(phase?{phase}:{})};});
  // A job acknowledgment ends the *submission* wait even while generation runs.
   // Unlock quick local edits only after the job ID and source revision are durable.
   if(sending.has(captured.id)){sending.delete(captured.id);}
   if(job.status==='queued'&&prior.pendingExperiment){if(activeId===captured.id&&owner()===captured.owner)flushDraft();const submitted=prior.pendingExperiment.prompt;notebook.update(captured.id,captured.owner,s=>{if(s.draft===submitted)s.draft='';});if(activeId===captured.id&&owner()===captured.owner&&$<HTMLTextAreaElement>('studioPrompt').value===submitted)$<HTMLTextAreaElement>('studioPrompt').value='';}
  const texts:Record<string,string>={queued:'Your request is queued.',building:'Building a separate preview…',testing:job.phase==='repairing'?'Repairing the preview…':'Testing the preview…',ready:'Your new preview is ready.',failed:'The build did not work. Your current game is safe.',cancelled:'Build cancelled. Your current game is unchanged.'};
  if(terminal&&prior.job?.status!==job.status)message(captured,'helper',(job.adapter==='mock'?'Test builder (mock): ':'')+(job.status==='failed'?buildErrorCopy(job.errorCode):texts[job.status]));
  if(job.status==='ready'&&job.revisionId&&!prior.experiments?.some(e=>e.candidate.remoteId===job.revisionId)){
    const pending=prior.pendingExperiment;const c:Candidate={id:crypto.randomUUID(),baseId:pending?.baseId||prior.remoteId,remoteId:job.revisionId,prompt:pending?.prompt||prior.draft,summary:job.adapter==='mock'?'New test-builder preview (mock)':'New AI-built preview'};
    notebook.saveExperiment(captured.id,captured.owner,c,pending?.parents||[],pending?.depth||'redesign',pending?.origin||'child',false);
    notebook.update(captured.id,captured.owner,s=>{s.pendingExperiment=null;});
  }
  if(activeId===captured.id&&owner()===captured.owner&&route==='studio'){
   status(job.status==='ready'?'Your new test is saved. Choose Try your ready test when you are ready.':job.status==='failed'?buildErrorCopy(job.errorCode):texts[job.status]||'Your working game is safe.');render();
   // Only a confirmed new real revision earns the playable burst; never a mock or queued job.
   if(job.status==='ready'&&job.revisionId&&job.adapter!=='mock'&&prior.job?.status!=='ready'&&!FG.learning.active)
    celebrateJem('playable','studioReady');
  }
  else if(owner()===captured.owner&&route==='library')renderLibrary();
   if(owner()===captured.owner){
    refreshShelf();
    if(job.status==='ready'&&prior.job?.status!=='ready'&&(activeId!==captured.id||route!=='studio')&&!FG.learning.active)
     globalStatus.textContent='✨ '+captured.name+' is ready to try. Your current game is safe.';
   }
 }
 const retryTimers=new Map<string,ReturnType<typeof setTimeout>>();
  function resume(s:StudioSession){
   if(!s.job||remote.mode!=='remote'||s.job.api!==remote.apiBaseUrl)return;
   void clientFor(s).resume(s.job.id).catch(()=>{
    if(owner()!==s.owner)return;
    unknownJobs.add(s.id);refreshShelf();
     if(activeId===s.id)status('Connection interrupted. The build may still be running. We will check again.');
    if(retryTimers.has(s.id))clearTimeout(retryTimers.get(s.id)!);
    retryTimers.set(s.id,setTimeout(()=>{retryTimers.delete(s.id);try{const latest=notebook.get(s.id,s.owner);if(busy(latest))resume(latest);}catch{/* original work remains */}},15000));
   });
  }
  function resumeOutstanding(){
   if(remote.mode!=='remote')return;
   for(const s of notebook.list(owner()).filter(s=>busy(s)&&s.job?.api===remote.apiBaseUrl).slice(0,8))
    if(!clients.has(s.id))resume(s);
  }
 async function showRemote(s:StudioSession,id:string,view:typeof showing=showing,selectTest?:string){
  if(!canChangePlay(s))return;
  if(FG.store.loadError)throw Error(FG.store.loadError);
  const at=epoch,intent=++viewIntent;status('Opening your chosen game…');
  let preview;try{preview=await clientFor(s).preview(id);}catch(error){if(intent!==viewIntent||!sameView(s,at))return;throw error;}
  if(intent!==viewIntent||!canChangePlay(s,at))return;
  if(selectTest)notebook.selectExperiment(s.id,s.owner,selectTest);
  const playedTest=view==='candidate'?(selectTest||s.experiments?.find(e=>e.candidate.remoteId===id)?.id||s.candidate?.id||null):null;
  disposeGame();lastOutcome=null;showing=view;const generation=epoch;
  notebook.update(s.id,s.owner,x=>{x.remoteKind=preview.kind||'star-catcher-v1';});
  pausedForTools=false;$<HTMLDetailsElement>('studioMore').open=false;remoteViewedId=id;viewedRevisionId=null;nativeStage.classList.add('hidden');$('studioEmpty').hidden=true;const host=$('studioRemoteHost');host.hidden=false;
  iframe=document.createElement('iframe');iframe.title='Private game preview';iframe.setAttribute('sandbox','allow-scripts');iframe.referrerPolicy='no-referrer';
  previewChannel=crypto.randomUUID();previewArtifact=preview.artifactId;previewOwner=s.owner;
  const url=new URL(preview.url);url.searchParams.set('channel',previewChannel);iframe.src=url.href;host.replaceChildren(iframe);
  previewLearning=attachPreviewLearning(iframe,{channel:previewChannel,artifactId:previewArtifact,ownerId:s.owner,gameId:'generated',projectId:s.id,versionId:id,onReadyChange:()=>queueMicrotask(()=>{if(sameView(s,generation))render();}),onRound:d=>announceOutcome(s,`You ${d.won?'finished':'tried'} that round. Score: ${d.score}.`,false,playedTest)});
  $('studioPlayNote').textContent=preview.adapter==='mock'?'Test builder (mock)—not a real AI generation.':'Private preview. Your working game stays unchanged until you keep it.';
  render();setTab('game');
 }
 window.addEventListener('message',event=>{
  if(!iframe||event.source!==iframe.contentWindow||previewOwner!==owner()||route!=='studio')return;
  const d=event.data;if(!d||d.type!=='factory-preview'||d.channel!==previewChannel||d.artifactId!==previewArtifact)return;
  if(d.event==='ready'&&Number.isInteger(d.height)&&d.height>=300&&d.height<=1000)iframe.style.height=`${Math.max(400,d.height+12)}px`;

 });
 async function keep(){
  if(saving)return;const s=current(),c=s.candidate,at=epoch;if(!c||!canChangePlay(s,at))return;if(c.remoteId&&(!previewLearning?.ready||remoteViewedId!==c.remoteId)){status('Open this test and wait for the game before choosing it as your main game.');return;}saving=true;render();
  try{
    if(c.remoteId){await clientFor(s).api('/v1/revisions/'+encodeURIComponent(c.remoteId)+'/keep',{});notebook.update(s.id,s.owner,x=>{x.remoteId=c.remoteId!;x.candidate=null;x.undone=null;});}
    else if(s.projectId){const latest=games.revision(s.projectId,s.owner);if(latest.id!==c.baseId&&!confirm('This test started from an earlier main version. Make this whole test the new main game, without silently adding later changes?'))return;const next=games.keep(s.owner,s.projectId,latest.id,c.config!,c.prompt,s.hypothesis,c.id);notebook.update(s.id,s.owner,x=>{x.candidate=null;x.undone=null;});message(s,'helper',`Kept your change. Your earlier versions are still available in Versions.`);void next;}
    if(sameView(s,at)){showing='working';status('Kept privately. Nothing was published.');celebrateJem('kept','studioKeep');if(!FG.learning.active)await playWorking();}
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
 function renderComparison(s:StudioSession,box:HTMLElement){
  // Only show a comparison when the child intentionally opens Tests & versions
  // AND at least two independent tests exist. Never fabricate scores or a winner.
  if(!canCompareExperiments(s.experiments?.length||0))return;
  const candidates=s.experiments!.slice(-3),section=el('section','studio-comparison');
  section.setAttribute('aria-label','Compare my game experiments');
  section.append(el('h3','','Compare my game ideas 🔎'),el('p','','Play your different builds, notice what changes, and choose what you like best.'));
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr');
  for(const label of ['','My main game',...candidates.map(e=>e.label)]){
   const th=document.createElement('th');th.scope='col';th.textContent=label;header.append(th);
  }
  head.append(header);table.append(head);
  const body=document.createElement('tbody'),observations=s.design?.observations||[];
  const addRow=(label:string,main:string,forTest:(e:NonNullable<StudioSession['experiments']>[number])=>string)=>{
   const row=document.createElement('tr'),title=document.createElement('th');title.scope='row';title.textContent=label;row.append(title);
   for(const value of [main,...candidates.map(forTest)]){
    const td=document.createElement('td');td.textContent=value;row.append(td);
   }
   body.append(row);
  };
  addRow('What changed','Your original rules',e=>e.candidate.summary);
  addRow('What I expected','Try your main game to compare',e=>e.prediction.trim()||'No prediction saved');
  addRow('What happened','My main game is safe',e=>{
   const last=observations.filter(o=>o.experimentId===e.id&&o.source==='runtime').at(-1);
   return last?.text||'No recorded play yet';
  });
  addRow('What I noticed','Your own impressions',e=>{
   const note=e.notes.trim(),last=observations.filter(o=>o.experimentId===e.id&&o.source==='child').at(-1);
   return note||last?.text||'No notes yet';
  });
  const actions=document.createElement('tr'),label=document.createElement('th');label.scope='row';label.textContent='Try it';actions.append(label);
  const main=document.createElement('td'),mainButton=el('button','studio-button','▶ Main game') as HTMLButtonElement;
  mainButton.type='button';mainButton.onclick=()=>act(playWorking);main.append(mainButton);actions.append(main);
  for(const e of candidates){
   const cell=document.createElement('td'),button=el('button','studio-button','▶ '+e.label) as HTMLButtonElement;
   button.type='button';button.onclick=()=>act(async()=>{
    if(!canChangePlay(s))return;
    if(e.candidate.remoteId)await showRemote(s,e.candidate.remoteId,'candidate',e.id);
    else {notebook.selectExperiment(s.id,s.owner,e.id);await playCandidate();}
   });cell.append(button);actions.append(cell);
  }
  body.append(actions);table.append(body);section.append(table);
  const bases=new Set(candidates.map(e=>e.baseId));
  if(bases.size>1)section.append(el('p','','These builds have different starting versions. Their results are not directly controlled comparisons.'));
  box.prepend(section);
 }
 function renderVersions(){
  if(!activeId)return;coaching?.renderShelf();const s=current(),box=$('studioVersionCards');box.replaceChildren();
  if(s.projectId&&!s.remoteId){const currentRevision=games.revision(s.projectId,s.owner);for(const [i,r] of games.history(s.projectId,s.owner).entries()){
    const card=el('article','studio-version-card');card.append(el('span','jems-version-badge',r.id===currentRevision.id?'✦ Your main version':'Saved version'),el('strong','',`Version ${i+1}${r.id===currentRevision.id?' · working':''}`),el('p','',r.label));
    const detail=el('p','studio-version-detail',manifests[s.game as GameId].mechanics.map(m=>`${m.label}: ${human(r.config[m.key])}`).join(' · '));card.append(detail);
    const play=el('button','studio-button','Play this version');play.onclick=()=>act(()=>{if(playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'history',r.id))status('Comparing only. Your working version has not changed.');});
    const restore=el('button','studio-button','Use this version');restore.onclick=()=>act(async()=>{if(!canChangePlay(s))return;if(current().candidate&&!confirm('Keep your saved conversation, discard the unkept preview, and use this version?'))return;games.checkout(s.owner,s.projectId!,r.id);notebook.update(s.id,s.owner,x=>{x.candidate=null;});await playWorking();renderVersions();});card.append(play,restore);box.append(card);
  }}else if(s.remoteId){const card=el('article','studio-version-card');card.append(el('strong','','Working game'),el('p','','Kept in the private family workshop.'));const b=el('button','studio-button','Play working game');b.onclick=()=>act(playWorking);card.append(b);const compare=el('button','studio-button','Compare previous');compare.onclick=()=>act(async()=>{const at=epoch;if(!canChangePlay(s,at))return;const c=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(s.remoteId!));if(!canChangePlay(s,at))return;if(!c.parentId){status('This is the first version.');return;}await showRemote(s,c.parentId,'history');});card.append(compare);box.append(card);}
  if(s.candidate){const card=el('article','studio-version-card is-candidate');card.append(el('strong','','Unkept preview'),el('p','',s.candidate.summary));const b=el('button','studio-button studio-primary','Play preview');b.onclick=()=>act(playCandidate);card.append(b);box.append(card);}
  renderComparison(s,box);
  if(!box.children.length)box.append(el('p','','Your idea is saved. Versions appear when there is a playable game.'));
 }
 async function copyGame(name:string){
  if(saving)return;const s=current(),at=epoch;if(!canChangePlay(s,at))return;saving=true;const sourceMode=FG.learning.modeFor(s.id);render();
  try{let projectId:string|null=null,remoteId:string|null=null;
    if(s.remoteId||showing==='candidate'&&s.candidate?.remoteId){const r=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(remoteViewedId||(showing==='candidate'?s.candidate?.remoteId:undefined)||s.remoteId!)+'/fork',{name});remoteId=r.revisionId;}
    else if(s.projectId){const selected=showing==='candidate'?s.candidate:null;const historical=showing==='history'&&viewedRevisionId?games.revision(s.projectId,s.owner,viewedRevisionId):null;const p=games.fork(s.owner,s.projectId,name,selected?.config||historical?.config,selected?.prompt||historical?.label,selected?.id||historical?.id);projectId=p.id;}
    const saved=notebook.fork(s.id,s.owner,name,projectId,remoteId);const learner=FG.store.data.profiles.find((p:any)=>p.id===s.owner);if(learner){const before=learner.mathModes;setMode(learner,saved.id,sourceMode);if(!FG.store.save()){learner.mathModes=before;throw Error('Your separate game was saved, but its learning format could not be copied.');}}$<HTMLDialogElement>('studioCopyDialog').close();
    if(canChangePlay(s,at)){message(saved,'helper','Saved as a separate game. Your original game is unchanged.');await open(saved.id);celebrateJem('copied','studioStatus');}
  }finally{saving=false;render();}
 }
 // Route all child entry points to one workspace. Legacy screens remain available without ?studio=1.
 document.addEventListener('click',event=>{
  const target=(event.target as Element)?.closest<HTMLElement>('button,[data-page],[data-game]');if(!target||target.closest('#page-studio')||target.closest('#page-studio-library')||target.closest('.studio-nav'))return;
  if(target.classList.contains('profile-choice')){try{flushDraft();}catch(error){event.preventDefault();event.stopImmediatePropagation();status((error as Error).message,true);}return;}
  if(target.id==='homeBtn'||target.id==='resultHome'||target.dataset.page==='home'||target.dataset.page==='creations'){event.preventDefault();event.stopImmediatePropagation();act(home);}
  else if(target.dataset.page==='create'){event.preventDefault();event.stopImmediatePropagation();act(newIdea);}
  else if(target.dataset.page==='feedback'||target.id==='improveThis'||target.id==='returnLive'){event.preventDefault();event.stopImmediatePropagation();act(()=>{if(activeId){showStudio();setTab('talk');$('studioPrompt').focus();}else home();});}
  else if(target.dataset.game){event.preventDefault();event.stopImmediatePropagation();act(()=>start(target.dataset.game as GameId));}
  else if(target.id==='exitGame'){event.preventDefault();event.stopImmediatePropagation();act(home);}
  else if(target.dataset.page==='parent'||target.dataset.page==='lab'){act(()=>{stopSpeech();flushDraft();disposeGame();route='other';});}
 },true);
 // Keyboard input in the conversation must not operate a game's controls.
 $('studioPrompt').addEventListener('keydown',event=>event.stopPropagation());
 [nav,profileMenu,page.querySelector('.studio-actions')!,page.querySelector('.studio-mobile-tabs')!,page.querySelector('.studio-heading')!].forEach(control=>control.addEventListener('keydown',event=>event.stopPropagation()));
 $('studioMore').addEventListener('keydown',event=>{if(event.key==='Escape'){$<HTMLDetailsElement>('studioMore').open=false;focusView($('studioMore').querySelector('summary')!);}});
 $('studioHelp').onclick=()=>act(showHelp);$('studioCloseHelp').onclick=()=>{$('studioHelpPanel').hidden=true;focusView($('studioReturnToPlay')||$('studioHelp'));};
 $('studioReady').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;const ready=readyExperiment(s);if(ready?.candidate.remoteId)await showRemote(s,ready.candidate.remoteId,'candidate',ready.id);});
 $('studioMore').querySelector('summary')!.addEventListener('click',event=>{if(guardMath())event.preventDefault();});
 $('studioHome').onclick=()=>act(home);$('studioNavHome').onclick=()=>act(home);$('studioNew').onclick=()=>act(newIdea);$('studioNavCreate').onclick=()=>act(newIdea);$('studioChooseStarter').onclick=()=>act(home);
 $('studioSubjectMath').onclick=()=>chooseLearningSubject('math');$('studioSubjectLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioGameMath').onclick=()=>chooseLearningSubject('math');$('studioGameLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioNavPowers').onclick=()=>act(()=>{stopSpeech();flushDraft();disposeGame();FG.app.page('lab');route='other';});
 $('studioPlay').onclick=()=>act(playViewed);$('studioKeep').onclick=()=>act(keep);$('studioUndo').onclick=()=>act(undo);
 $('studioRedo').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;if(s.undone){notebook.update(s.id,s.owner,x=>{x.candidate=x.undone!;x.undone=null;});await playCandidate();return;}if(!s.projectId)return;games.redo(s.owner,s.projectId);await playWorking();});
 $('studioCompare').onclick=()=>act(()=>{if(setTab('versions'))$<HTMLDetailsElement>('studioMore').open=false;});$('studioCloseVersions').onclick=()=>act(()=>{setTab('game');focusView($('studioReturnToPlay')||$('studioPlay'));});$('studioBackWorking').onclick=()=>act(playWorking);
 $('studioCopy').onclick=()=>{if(guardMath())return;stopSpeech();++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;} $<HTMLInputElement>('studioCopyName').value=current().name+' copy';$<HTMLDialogElement>('studioCopyDialog').showModal();$('studioCopyName').focus();};$('studioCopyCancel').onclick=()=>$<HTMLDialogElement>('studioCopyDialog').close();$<HTMLDialogElement>('studioCopyDialog').addEventListener('close',()=>{if(route==='studio'&&!FG.learning.active)focusView($('studioCopy'));});
 $('studioCopyForm').onsubmit=e=>{e.preventDefault();act(()=>copyGame($<HTMLInputElement>('studioCopyName').value.trim()));};
 $('studioPromptForm').onsubmit=e=>{e.preventDefault();act(submit);};
 $('studioClearChat').onclick=()=>act(()=>{
  if(guardMath())return;
  const s=current();
  if(busy(s)||s.pendingExperiment){status('Finish or cancel this build before clearing chat.',true);return;}
  if(!confirm('Clear this chat and its design notes on this device? Your saved game versions and any remote copies will remain.'))return;
  stopSpeech();coaching?.reset();chatOptions.open=false;
  notebook.clearConversation(s.id,s.owner);
  $<HTMLTextAreaElement>('studioPrompt').value='';
  coaching?.openSession();render();
  status('Chat and design notes cleared on this device. Saved game versions remain.');
 });
 $('studioTalk').onclick=()=>act(()=>{
  stopSpeech();
  if(!$<HTMLTextAreaElement>('studioPrompt').value.trim()){status('Type a message or choose Speak first.');return;}
  return coaching?.discuss('discuss');
 });
 $('studioPrompt').oninput=()=>{clearTimeout(draftTimer);$('studioDraftStatus').textContent='Saving draft…';draftTimer=setTimeout(()=>act(()=>{flushDraft();$('studioDraftStatus').textContent='Draft saved on this device';}),180);};
 $('studioReflectAnswer').onclick=()=>act(()=>{if(guardMath())return;reflecting=true;setTab('talk');render();focusView($('studioPrompt'));});$('studioReflectSkip').onclick=()=>act(()=>{const s=current();notebook.update(s.id,s.owner,x=>{x.reflection=false;});coaching?.pauseReflection();reflecting=false;render();void playViewed();});
 $('studioCancel').onclick=()=>act(async()=>{const s=current();await clientFor(s).cancel();});$('studioRetry').onclick=()=>act(async()=>{const s=current();await clientFor(s).retry();});
 page.querySelectorAll<HTMLElement>('[data-studio-tab]').forEach(b=>b.onclick=()=>act(()=>{const tab=b.dataset.studioTab as 'game'|'talk'|'versions';if(tab==='game'&&pausedForTools)return playViewed();setTab(tab);}));
 window.addEventListener('factory-learning-active',event=>{refreshGameSubject();if((event as CustomEvent).detail&&route==='studio'){$<HTMLDetailsElement>('studioMore').open=false;setTab('game');}});
 window.addEventListener('factory-learning-subject',()=>{refreshLearningChoice();if(route==='studio'&&activeId){refreshGameSubject();FG.learning.modeControl($('studioMathMode'),activeId);}});
 window.addEventListener('factory-session-restored',()=>{void refreshServiceReadiness();if(activeId&&panel==='talk')void privateSpeech?.refresh();});
 window.addEventListener('factory-profile-before-change',event=>{try{stopSpeech();flushDraft();disposeGame();}catch(error){event.preventDefault();status((error as Error).message,true);}});
 window.addEventListener('factory-profile',()=>{stopSpeech();
  // A hidden Studio DOM must never retain the previous child's transcript.
  // Clearing a browser view does not delete the former child's saved notebook.
  $('studioMessages').replaceChildren();$('coachProposals').replaceChildren();
  $('coachModeStatus').textContent='';$<HTMLTextAreaElement>('studioPrompt').value='';
  $('studioVoiceStatus').textContent='';
  coachConnection=remote.mode==='remote'?'checking':'unavailable';builderReadiness=remote.mode==='remote'?'checking':'not-configured';updateProfile();$<HTMLDialogElement>('studioCopyDialog').close();coaching?.reset();clearTimeout(draftTimer);clients.forEach(c=>c.disconnect());clients.clear();unknownJobs.clear();for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();activeId=null;reflecting=false;disposeGame();act(home);void refreshServiceReadiness();resumeOutstanding();});
 window.addEventListener('beforeunload',event=>{stopSpeech();try{flushDraft();}catch{event.preventDefault();event.returnValue='';}});
 window.addEventListener('storage',event=>{if(event.key?.startsWith('family-game-factory')){if(route==='library')act(renderLibrary);else if(activeId)act(render);}});
 // Existing progress backups gain an explicitly versioned optional notebook. Old backups remain valid.
 const exportButton=$('exportData');exportButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();act(()=>{if(!FG.store.recoveryRaw){flushDraft();creation.flush();}const data=FG.store.recoveryRaw||JSON.stringify({...FG.store.data,factoryWorkspace:games.export(),factoryStudio:notebook.read(),...creation.backup()},null,2);const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a') as HTMLAnchorElement;a.href=url;a.download='family-game-factory-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});},true);
 const importInput=$<HTMLInputElement>('importData');importInput.addEventListener('change',event=>{event.stopImmediatePropagation();const file=importInput.files?.[0];if(!file)return;act(async()=>{try{if(FG.store.adultProfileId)throw Error('Switch to a family profile before restoring a family backup.');if(file.size>20_000_000)throw Error('That backup is too large.');const data=JSON.parse(await file.text());if(data.factoryStudio)validateNotebook(data.factoryStudio);if(data.factoryWorkspace)FG.factory.validateWorkspace(data.factoryWorkspace);if(Object.hasOwn(data,'factoryCreationRecoveryRaw'))throw Error('This backup preserves damaged scene data for recovery. Restore a compatible scene backup before replacing family data.');const importedCreation=Object.hasOwn(data,'factoryCreation')?creation.validate(data.factoryCreation):{schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]};if(!confirm('Restore this backup? Current progress will be replaced.'))return;const prior=JSON.stringify(FG.store.data),oldWorkspace=games.export(),oldNotebook=notebook.read(),oldCreation=creation.rawSnapshot();try{FG.store.restore(JSON.stringify(data));if(data.factoryWorkspace)FG.factory.restoreWorkspace(data.factoryWorkspace);if(data.factoryStudio)notebook.restore(data.factoryStudio);creation.restore(importedCreation);}catch(error){FG.store.restore(prior);FG.factory.restoreWorkspace(oldWorkspace);notebook.restore(oldNotebook);creation.restoreRawSnapshot(oldCreation);throw error;}location.reload();}finally{importInput.value='';}});},true);
 coaching=installCoaching({notebook,current,owner,message,render,status,config:()=>remote,
  onCoachReply:text=>voice?.reply(text),
  onCoachState:state=>{coachConnection=state;if(activeId)render();},
  rules:()=>{const s=current();if(s.game==='new')return 'New game: rules are being agreed; do not invent recorded outcomes.';const r=s.projectId?games.revision(s.projectId,s.owner):null;return JSON.stringify({game:s.game,instructions:FG.games[s.game]?.instructions,controls:FG.games[s.game]?.controls,settings:r?.config,learningSubject:FG.learning.subject,editable:manifests[s.game as GameId]?.mechanics.map(m=>({key:m.key,label:m.label}))}).slice(0,2000);},
  localSupported:prompt=>{const s=current();if(!s.projectId||s.remoteId)return false;const info=coaching?.details();return interpret(s.game as GameId,info?.continueTest&&s.candidate?.config?s.candidate.config:games.revision(s.projectId,s.owner).config,prompt).kind==='supported';},
  tryRequest:async(prompt)=>{$<HTMLTextAreaElement>('studioPrompt').value=prompt;flushDraft();await submit();},
  playTest:async id=>{const s=current();if(!canChangePlay(s))return;const test=s.experiments?.find(e=>e.id===id);if(test?.candidate.remoteId){await showRemote(s,test.candidate.remoteId,'candidate',id);return;}notebook.selectExperiment(s.id,s.owner,id);await playCandidate();},playMain:playViewed,combineTests,
  pauseForThinking:()=>{if(guardMath())return false;++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}return true;},
  showTalk:()=>{showStudio();if(setTab('talk'))focusView($('studioPrompt'));}
 });
 // Put live response status next to the conversation it describes, not below
 // unrelated experiment controls. It stays an accessible aria-live status.
 $('studioMessages').after($('coachModeStatus'));
 const appendSpeechDraft=(text:string)=>{
  // Both speech paths produce a draft only. The child chooses Send or Build.
  const input=$<HTMLTextAreaElement>('studioPrompt');
  input.value=[input.value.trim(),text.trim()].filter(Boolean).join(' ').slice(0,input.maxLength||2000);
  flushDraft();$('studioDraftStatus').textContent='Check your words, then choose Send to jems.';
  input.focus();
 };
 voice=installStudioVoice({
  microphone:$<HTMLButtonElement>('studioMic'),installPack:$<HTMLButtonElement>('studioVoicePack'),
  hearReply:$<HTMLButtonElement>('studioHear'),status:$('studioVoiceStatus'),
  scope:()=>activeId?owner()+':'+activeId:'',
  canListen:()=>route==='studio'&&panel==='talk'&&!FG.learning.active,
  onTranscript:appendSpeechDraft
 });
 privateSpeech=installStudioPrivateSpeech({
  button:privateMic,status:$('studioVoiceStatus'),
  scope:()=>activeId?owner()+':'+activeId:'',
  canListen:()=>route==='studio'&&panel==='talk'&&!FG.learning.active,
  onAvailability:ready=>{
   $<HTMLButtonElement>('studioMic').hidden=ready;
   if(ready)$('studioVoiceStatus').textContent='A family-approved private speech service will transcribe this recording. You review the words before sending.';
  },
  onRecordingStart:()=>voice?.cancel(),
  available:async signal=>{
   if(remote.mode!=='remote'||!remote.apiBaseUrl)return false;
   const response=await familyFetch(remote.apiBaseUrl,'/v1/coach/audio/status',{
    method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal
   });
   if(!response.ok)return false;
   const data=await response.json();
   return data?.available===true&&data?.mode==='private';
  },
  transcribe:async(blob,signal)=>{
   if(remote.mode!=='remote'||!remote.apiBaseUrl)throw Error('AUDIO_UNAVAILABLE');
   const response=await familyFetch(remote.apiBaseUrl,'/v1/coach/audio',{
    method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal,
    headers:{'Content-Type':blob.type,'X-Factory-Request':'1','X-Factory-Audio-Id':crypto.randomUUID()},
    body:blob
   });
   if(!response.ok)throw Error('AUDIO_UNAVAILABLE');
   const data=await response.json();
   if(typeof data?.text!=='string'||!data.text.trim()||data.text.length>2000)
    throw Error('AUDIO_NO_SPEECH');
   return data.text;
  },
  onTranscript:appendSpeechDraft
 });
 // Only one browser microphone can capture at once.
 $('studioMic').addEventListener('click',()=>privateSpeech?.cancel(),{capture:true});
 installStudioRemixRouting({
  activeGame:()=>activeId&&route==='studio'&&mounted?current().game as GameId:null,
  openRequest:prompt=>act(async()=>{
   if(guardMath())return;
   flushDraft();const s=current(),fromCandidate=showing==='candidate'&&!!s.candidate,fromHistory=showing==='history';reflecting=false;
   // Unmount before copying a revision so its latest construction/ride state is saved.
   showStudio();setTab('talk');$<HTMLSelectElement>('experimentStart').value=fromCandidate?'continue':'main';
   if(!prompt){render();$('studioPrompt').focus();return;}
   if(s.draft.trim()&&s.draft.trim()!==prompt){
    const joined=s.draft+'\n\n'+prompt;
    if(joined.length<=2000){$<HTMLTextAreaElement>('studioPrompt').value=joined;flushDraft();status('Added that idea to your saved draft. Edit it or choose Send when you are ready.');}
    else status('Your saved draft is full. Finish it first, then try: '+prompt);
    render();$('studioPrompt').focus();return;
   }
   $<HTMLTextAreaElement>('studioPrompt').value=prompt;flushDraft();
   if(fromHistory){render();status('Your idea is saved. Choose your starting version in Tests & versions before trying this change.');$('studioPrompt').focus();return;}
   await coaching!.tryPreset(prompt);
  })
 });
 home();
 try{remote=validateBuilderConfig(await(await fetch(new URL('factory-config.json',document.baseURI),{cache:'no-store'})).json());}catch{remote={version:1,mode:'unavailable'};}
 configReady=true;
 if(remote.mode!=='remote'){coachConnection='unavailable';builderReadiness='not-configured';}
 if(activeId)render();else updateCreationNote();
 void refreshServiceReadiness();resumeOutstanding();refreshShelf();
 FG.studio={version:1,open:(id:string)=>open(id),home,exportNotebook:()=>notebook.read(),mode:()=>remote.mode};
 const creation=installCreationStudio({
  enter:()=>{if(guardMath())return false;stopSpeech();flushDraft();disposeGame();FG.app.page('creation');route='other';document.body.classList.remove('studio-designing');document.body.classList.add('creation-open');nav.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.id==='studioNavScenes'));return true;},
  home,openGame:id=>open(id),
 });
 installCreationProgress();
 const scenesNav=el('button','','✦ Create & code') as HTMLButtonElement;scenesNav.id='studioNavScenes';scenesNav.type='button';scenesNav.onclick=()=>creation.open();$('studioNavCreate').after(scenesNav);
 const scenesEntry=el('button','studio-scene-entry') as HTMLButtonElement;scenesEntry.id='studioScenes';scenesEntry.type='button';
 scenesEntry.innerHTML='<img src="./jems-blocks.svg" alt=""><span><strong>Make your imagination move</strong><small>Tell a story with blocks, or watch a scene and rebuild it your way.</small></span><b aria-hidden="true">→</b>';
 scenesEntry.onclick=()=>creation.open();$('studioContinue').after(scenesEntry);
 const sceneButton=el('button','studio-button','✦ Animate & code') as HTMLButtonElement;sceneButton.id='studioMakeScene';sceneButton.type='button';
 $('studioHelp').after(sceneButton);
 sceneButton.onclick=()=>act(async()=>{
  if(guardMath())return;const s=current(),capturedOwner=owner(),capturedEpoch=epoch;
  const remoteId=showing==='candidate'?s.candidate?.remoteId:showing==='history'?remoteViewedId:s.remoteId;
  if(remoteId){
   status('Opening the editable scene included with this game…');
   const response=await clientFor(s).creationManifest(remoteId);
   if(owner()!==capturedOwner||epoch!==capturedEpoch||route!=='studio'||activeId!==s.id)return;
   if(!response.manifest)throw Error('This game does not include an editable scene yet. Choose Create & code to start a scene with available characters.');
   creation.fromStudio({...s,projectId:response.projectId,remoteId:response.revisionId},undefined,response.manifest);return;
  }
  if(!s.projectId)throw Error('Choose a starting game, or open Create & code to make a scene.');
  const revision=games.revision(s.projectId,s.owner,showing==='history'&&viewedRevisionId?viewedRevisionId:undefined);
  if(showing==='candidate'&&s.candidate?.config)throw Error('Keep this game version first, then use Animate & code to carry that version into a scene.');
  creation.fromStudio(s,revision);
 });
 window.addEventListener('factory-page',event=>{if((event as CustomEvent).detail!=='creation')document.body.classList.remove('creation-open');});
 if(new URLSearchParams(location.search).get('creation')==='1')creation.open();
}
