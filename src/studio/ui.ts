import {gameArtReview} from '../game-art/review-mode';
import {chooseGameArtwork} from './game-art-picker';
import {loadDrawnCar} from '../drawing/rally';
import {artChoice} from '../creation/private-art';
import {artBuildHold,emptyArtPlan,roleLabels,selectGameArt,saveArtTest} from '../game-art/bindings';
import {renderArtPlan} from '../game-art/plan-view';
import { createPageHeader } from '../brand/page-header';
import { createDashboardCard } from '../brand/dashboard-card';
import {hasParentGuidance,installParentGuidance} from '../family-beta/guidance';
import {isEarlyGrade} from '../learning/grades';
import {createEarlyHandoff,FAMILY_CREATION_LABEL} from './early-handoff';

import {openPreviewFrame} from '../builder/open-preview';
import { attachPreviewLearning } from '../learning/remote';
import { interpretLearningRequest, learningFormatLabel, setMode } from '../learning/policy';
import {installCoaching} from './coaching';
import {celebrateJem, type JemMilestone} from '../brand/delight';
import {builderJourney, gemStage, GEM_STAGE_LABELS, type GemStage} from '../brand/gem-progress';
import {installGemJourney, createJourneyGem, createJourneyRankThumbnail} from '../brand/journey';
import {createMakerIdentity} from '../brand/maker-identity';
import {installStudioNavigation} from './navigation';
import {iconMarkup, createIcon, setIconLabel, type IconName} from '../brand/icons';
import {PREMADE_GAMES,ORIGINAL_GAMES,isRetiredStarter} from './catalogue';
import {installStudioVoice} from './voice';
import {installStudioPrivateSpeech} from './private-speech';
import {createReadAloudControl} from '../speech/read-aloud-control';
import {configureNaturalNarration,stopReadAloud} from '../speech/friendly-narrator';
import {createPrivateNarration} from '../speech/private-narration';
import {freshDesign} from './design';
import {buildErrorCopy,buildProgressCopy,builderReadinessCopy,coachConnectionCopy,canCompareExperiments,type BuilderReadiness,type CoachConnection} from './experience';
import {familyFetch} from '../builder/session';
import {profileStorage} from '../adult-pilot/storage';
import './style.css';
import './modernization.css';
import { destinationTile, installJourneySections } from './world-navigation';
import '../brand/jems.css';
import '../brand/playful.css';
import '../brand/experience.css';
import '../brand/gem-progress.css';
import '../brand/art-library.css';
import { installQualityCards } from '../quality/cards';
import { type StudioSession, type Candidate, type PendingJob } from './notebook';
import {NotebookWorkspace,prepareIndexedNotebook} from '../storage/notebook-workspace';
import type {NotebookCard} from '../storage/indexed-notebook';
import { AsyncStudioGames as StudioGames, isGeneratedRemoteKind } from './adapter';
import { saveStudioProject as saveNativeStudioProject } from './local-project';
import { installStudioRemixRouting } from './host-navigation';
import { installPlayView } from './play-view';
import { defaults, manifests, validateConfig } from '../runtime/manifests';
import { interpret } from '../factory/interpreter';
import type { GameId, Mechanics, PlayOutcome } from '../runtime/types';
import { BuilderClient, isKnownBuildRejection, validateBuilderConfig, type BuilderConfig, type JobView } from '../builder/client';
import { installCreationStudio } from '../creation/ui';
import { installCreationProgress } from '../creation/progress';
import { installArtStudio } from '../drawing/studio';
import { installArtEntryPoints } from './art-entry';
import { rigById } from '../drawing/store';
import { vehicleGeometry } from '../drawing/model';
import { drawing, drawingPage, drawingBlob } from '../assets/private-drawings';
import { registerArtUsage } from '../drawing/library';
import { installProblemSolvingPractice } from '../problem-solving/ui';
import {installRewards, notifyRewardSourceSaved} from '../rewards/service';
import {createRewardsPage, createRewardsWidget, createRewardCelebration, type RewardsActivity} from '../rewards/ui';
import {type RewardGrant} from '../rewards/model';
import {rewardSourceWritable} from '../rewards/write-guard';
import {createFirstWelcome, createJourneyOverview} from './first-journey';
import {createGuideCard, type GuideCard, type GuideHost} from './guide-card';
import {GUIDE_TIPS, hasMeaningfulCreation, recommendNext, readyGuidedExperiment, type GuideTipId} from './guidance';
import {CreationWorkspace} from '../storage/creation-workspace';
import {installPals} from '../pals/service';
import {installPalsInterface} from '../pals/host';
import {createBuildHandoff, type BuildHandoffIdentity, type BuildHandoffState} from './build-handoff';
import {visibleConversation, helperPreview} from './conversation-view';
import {creationBuildReadiness} from './creation-readiness';
import './guided-creation.css';
import {deriveStudioNotifications,type StudioNotification} from './notifications';
import {createStudioNotificationsView,type NotificationOrigin,type StudioContinuation} from './notifications-view';

const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el = (tag:string, className='', text='')=>{const n=document.createElement(tag);n.className=className;n.textContent=text;return n;};
const iconEl=(tag:string,className:string,name:IconName,label:string,iconClass='')=>{const target=el(tag,className);setIconLabel(target,name,label,iconClass);return target;};
const icon:Record<StudioSession['game'],string>={gum:'🚀',hill:'🚙',buckets:'🪣',dragon:'🐉',moon:'🌙',robot:'🤖',factory:'💎',mining:'💎',new:'✨'};
const names:Record<StudioSession['game'],string>={gum:'Bubble Gum Builders',hill:'Junkyard Rally',buckets:'Splash or Pass',dragon:'Dragon Island Rescue',moon:'Moon Donut Dash',robot:'Robot Route Lab',factory:'Gem Factory',mining:'Mind Your Jems!',new:'A brand-new idea'};
const busy=(s:StudioSession|NotebookCard)=>'jobStatus'in s?['queued','building','testing'].includes(s.jobStatus??''):!!s.job&&['queued','building','testing'].includes(s.job.status);
const needsReadyRecovery=(s:StudioSession)=>s.job?.status==='ready'&&!!s.job.revisionId&&(Boolean(s.pendingExperiment)||!s.experiments?.some(e=>e.candidate.remoteId===s.job!.revisionId));
const human=(v:number|boolean)=>typeof v==='boolean'?(v?'On':'Off'):String(v);
// Unknown responses and test fixtures never verify a real generated experiment.
const isRealAdapter=(adapter:string|undefined)=>adapter==='metered-api'||adapter==='codex-subscription'||adapter==='local-rule';

/** Studio is the primary child homepage; ?arcade=1 is the reversible legacy route. */
export async function installStudio(){
 const entry=new URLSearchParams(location.search);
 if(entry.get('arcade')==='1'||entry.get('studio')==='0'){
  const currentUrl=new URL(location.href);
  if(entry.get('arcade')==='1')currentUrl.searchParams.delete('arcade');
  if(entry.get('studio')==='0')currentUrl.searchParams.delete('studio');
  const notice=el('div','notice studio-legacy-return');
  const link=el('a','btn secondary','Open current Jems') as HTMLAnchorElement;
  link.id='jemsCurrentExperience';link.href=currentUrl.href;
  notice.append(link);document.querySelector('main')!.prepend(notice);return;
 }
 const FG=(window as any).FG;
 if(!FG?.app||!FG?.store)return;
 const rewards=installRewards();
 const pals=installPals(rewards);
 const young=()=>isEarlyGrade(FG.store.current().grade)&&!hasParentGuidance(String(FG.store.current().id));
 let guidanceEpoch=0;
 const creationAction=()=>{const captured=String(FG.store.current().id),generation=guidanceEpoch;return()=>String(FG.store.current().id)===captured&&generation===guidanceEpoch&&!young();};
 const handOff=createEarlyHandoff(async ()=>(await openParent(true)),async ()=>(await home()),()=>creation.open(),()=>pals.state,()=>String(FG.store.current().id));
 let notebook:NotebookWorkspace,notebookOwner=String(FG.store.current().id),notebookReady:Promise<void>=Promise.resolve();
 try{notebook=await NotebookWorkspace.open(profileStorage(localStorage),()=>String(FG.store.current().id),notifyRewardSourceSaved);}catch(error){
  const warning=el('p','notice',String((error as Error).message));$('page-home').prepend(warning);return;
 }
 let compoundTail:Promise<unknown>=Promise.resolve();
 async function saveLocalStudioProject(...args:Parameters<typeof saveNativeStudioProject>){const task=compoundTail.catch(()=>{}).then(async()=>{const value=await saveNativeStudioProject(...args);if(owner()===args[2])await notebook.refresh(owner());return value;});compoundTail=task;return task;}
 const games=new StudioGames(profileStorage(localStorage),FG), owner=()=>String(FG.store.current().id);
 const guideHost:GuideHost={isDismissed:tip=>notebook.guidance(owner()).dismissedTips.includes(tip),dismiss:async tip=>{(await notebook.dismissGuideTip(owner(),tip));}};
 try{await games.ready(String(FG.store.current().id));}catch(error){$('page-home').prepend(el('p','notice','Could not open the studio: '+(error as Error).message));return;}
 let activeId:string|null=null,epoch=0,showing:'working'|'candidate'|'history'='working',mounted=false;
 let remote:BuilderConfig={version:1,mode:'unavailable'};
 configureNaturalNarration(createPrivateNarration(()=>remote,owner));
 const clients=new Map<string,BuilderClient>();
 const unknownJobs=new Set<string>();
 const retryBlocks=new Map<string,{jobId:string;reason:string}>();
 // Unacknowledged initial requests live in the notebook, so reload/profile
 // changes cannot discard their identity or authorize a second paid build.
 let iframe:HTMLIFrameElement|null=null, previewChannel='',previewArtifact='',previewOwner='';
 let previewLearning:ReturnType<typeof attachPreviewLearning>|null=null;
 let configReady=false, route:'library'|'studio'|'journey'|'rewards'|'pals'|'notifications'|'other'='library', draftTimer:ReturnType<typeof setTimeout>|undefined;
 let coachConnection:CoachConnection='checking',builderReadiness:BuilderReadiness='checking';
 // Background availability reads belong to this visible document. Stopping
 // them never cancels/replays a paid mutation; a restored document rechecks.
 let readinessRequest:AbortController|undefined,readinessPageActive=true;
 const cancelReadiness=()=>{readinessRequest?.abort();readinessRequest=undefined;};
 window.addEventListener('factory-profile-changing',cancelReadiness);
 window.addEventListener('pagehide',()=>{readinessPageActive=false;cancelReadiness();});
 window.addEventListener('pageshow',event=>{readinessPageActive=!document.documentElement.hidden;if(event.persisted&&readinessPageActive)void refreshServiceReadiness();});
 let saving=false, reflecting=false, lastOutcome:string|null=null,viewedRevisionId:string|null=null,remoteViewedId:string|null=null;
 let coaching:ReturnType<typeof installCoaching>|undefined;
 let voice:ReturnType<typeof installStudioVoice>|undefined;
 let privateSpeech:ReturnType<typeof installStudioPrivateSpeech>|undefined;
 let artEntries:ReturnType<typeof installArtEntryPoints>|undefined;
 let conversationReaders:ReturnType<typeof createReadAloudControl>[]=[];
 let helpReading:ReturnType<typeof createReadAloudControl>|undefined;
 let notificationView:ReturnType<typeof createStudioNotificationsView>|undefined;
 let localSpeechActive=false;
 const stopSpeech=()=>{voice?.cancel();privateSpeech?.cancel();conversationReaders.forEach(reader=>reader.stop());helpReading?.stop();notificationView?.stopReading();stopReadAloud();};
 const sending=new Set<string>();
 const submittedDrafts=new Map<string,string>();
 let panel:'game'|'talk'|'versions'='game';
 let keptInThisView:string|null=null;
 let guideSignature='',currentGuide:GuideCard|null=null;
 let welcomeArt:{owner:string;hasArt:boolean;pending:Promise<void>|null;deferredView:number|null}|null=null;
 let pausedForTools=false,viewIntent=0;
 // The game being built remains separate from the native game played while waiting.
 // This binding is transient; the notebook remains the authority for each job.
 let waitProject:{id:string;owner:string}|null=null;
 const buildAttempts=new Map<string,BuildHandoffIdentity>();
 const handoff=createBuildHandoff({
  isCurrent:identity=>owner()===identity.ownerId&&activeId===identity.sessionId&&route==='studio'&&!FG.learning.active,
  onPlayWhileWaiting:identity=>act(()=>playWhileBuilding(notebook.get(identity.sessionId,identity.ownerId))),
  onPlayReady:identity=>act(()=>openReadySession(identity.sessionId,identity.ownerId)),
  onRecover:(_identity,action)=>act(()=>recoverBuild(action)),
  onStay:identity=>{if(owner()===identity.ownerId&&activeId===identity.sessionId&&route==='studio'&&!FG.learning.active)$('studioPrompt').focus({preventScroll:true});}
 });
 function beginBuildHandoff(s:StudioSession,state:BuildHandoffState){
  const identity={ownerId:s.owner,sessionId:s.id,attemptId:crypto.randomUUID()};
  buildAttempts.set(s.id,identity);handoff.begin(identity,state);
  return identity;
 }
 function updateBuildHandoff(s:StudioSession,state:BuildHandoffState){
  const identity=buildAttempts.get(s.id);if(identity&&identity.ownerId===s.owner)handoff.update(identity,state);
 }

 const page=el('section','page hidden');page.id='page-studio';
 page.innerHTML=`<div class="studio-heading"><button type="button" class="studio-back" id="studioHome">${iconMarkup('arrow','jems-icon--back')} My Games</button><div class="studio-title-wrap"><h1 id="studioTitle" tabindex="-1">Let's make something.</h1></div><span class="studio-storage" id="studioStorage">Saved on this device</span></div>
 <div class="studio-topbar"><div class="studio-version"><span class="studio-dot" aria-hidden="true"></span><span id="studioVersion">New idea</span></div><div class="studio-actions"><button id="studioPlay" class="studio-button studio-primary">${iconMarkup('play')} Play</button><button id="studioKeep" class="studio-button studio-keep" disabled hidden>${iconMarkup('star')} Make this my main game</button><button id="studioHelp" class="studio-button">${iconMarkup('help')} How to play</button><details id="studioMore" class="studio-more"><summary>More game tools</summary><div class="studio-more-actions"><button id="studioUndo" class="studio-button" disabled>${iconMarkup('undo')} Undo</button><button id="studioRedo" class="studio-button" disabled>${iconMarkup('undo','jems-icon--mirror')} Redo</button><button id="studioCompare" class="studio-button">${iconMarkup('grid')} Tests & versions</button><button id="studioCopy" class="studio-button">${iconMarkup('save')} Save as a different game</button></div></details></div></div>
 <div id="studioStatus" class="studio-status" role="status" aria-live="polite" aria-atomic="true"></div><button id="studioReady" class="studio-button studio-ready" hidden>${iconMarkup('play')} Try your ready test</button>
 <nav class="studio-mobile-tabs" aria-label="Studio panels"><button data-studio-tab="game" aria-pressed="true" aria-controls="studioCanvas">${iconMarkup('play')} Game</button><button data-studio-tab="talk" aria-pressed="false" aria-controls="studioConversation">${iconMarkup('edit')} My ideas</button><button data-studio-tab="versions" aria-pressed="false" aria-controls="studioVersions">${iconMarkup('grid')} My tests</button></nav>
 <div class="studio-workspace" data-mobile-panel="game"><div id="studioCanvas" class="studio-canvas-column"><section id="studioHelpPanel" class="studio-help" aria-labelledby="studioHelpTitle" hidden><h2 id="studioHelpTitle" tabindex="-1">How to play</h2><p id="studioHelpGoal"></p><p id="studioHelpControls"></p><details><summary>More controls</summary><p id="studioHelpKeyboard"></p></details><button id="studioCloseHelp" class="studio-button">Got it</button></section><div id="studioPreviewNotice" class="studio-preview-notice" hidden>Trying a different version. Your main game is safe. <button id="studioBackWorking">Back to my main game</button></div><div id="studioGameHost" class="studio-game-host" tabindex="-1" aria-label="Current game"><div id="studioEmpty" class="studio-empty"><img class="jems-empty-workbench" src="./jems-art/spot_first_idea.webp" width="1536" height="1024" alt="" aria-hidden="true" decoding="async"><h2>Every great game starts with an idea.</h2><p>Tell jems what you imagine, or choose a game to change.</p><button class="studio-button" id="studioChooseStarter">Choose a starting game</button></div><div id="studioRemoteHost" hidden></div></div><details id="studioMathOptions" class="studio-math-options"><summary>Learning in this game</summary><div id="studioGameSubject" class="studio-game-subject" hidden><strong>Next learning subject</strong><div class="learning-subject-switch" role="group" aria-label="Next game practice subject"><button type="button" id="studioGameMath" aria-pressed="true">${iconMarkup('grid')} Math</button><button type="button" id="studioGameLanguage" aria-pressed="false">${iconMarkup('book')} English</button></div><small>Finish any open question before switching.</small></div><div id="studioMathMode"></div></details><p class="studio-footnote" id="studioPlayNote">Your ideas save on this device.</p></div>
 <aside id="studioConversation" class="studio-conversation" aria-label="Your game ideas"><div class="studio-helper-heading"><span class="studio-helper-icon" aria-hidden="true">${['wave','think','rest'].map(pose=>`<img class="jems-helper-mark" data-helper-pose="${pose}" src="./jems-art/character_spark_${pose}.webp" width="1254" height="1254" alt="" decoding="async">`).join('')}</span><div><h2>jems · Your idea partner</h2><p id="studioAvailability">Checking available tools…</p></div></div><div id="studioMessages" class="studio-messages" role="log" aria-label="Project conversation" aria-live="polite" aria-relevant="additions text"></div><div id="studioReflection" class="studio-reflection" hidden><p id="studioReflectionQuestion">What was fun or tricky?</p><div><button id="studioReflectAnswer" class="studio-chip">Share a thought</button><button id="studioReflectSkip" class="studio-chip">Keep playing</button></div></div><form id="studioPromptForm" class="studio-prompt"><label for="studioPrompt" id="studioPromptLabel" tabindex="-1">What should happen next?</label><textarea id="studioPrompt" rows="3" maxlength="2000" placeholder="Tell me what you imagine…" required></textarea><div id="studioSuggestions" class="studio-suggestions"></div><div class="studio-send-row"><span id="studioDraftStatus" role="status" aria-live="polite">Your ideas save as you type</span><button id="studioTalk" class="studio-button studio-primary" type="button" aria-label="Send your written message to jems">${iconMarkup('send')} Send to jems</button><button id="studioSend" class="studio-button" type="submit">${iconMarkup('arrow')} Try a change</button></div><div class="studio-voice-row"><button id="studioMic" class="studio-button" type="button" aria-pressed="false" aria-label="Speak to jems using the microphone when supported">${iconMarkup('mic')} Speak</button><button id="studioVoicePack" class="studio-button" type="button" hidden>Install voice pack</button><button id="studioHear" class="studio-button" type="button" disabled>${iconMarkup('volume')} Hear reply</button><span id="studioVoiceStatus" role="status" aria-live="polite">Tap Speak, review the words, then press Send to jems.</span></div><p class="studio-voice-note">Speak uses private on-device recognition when supported or a parent-approved private transcription service. A short recording may be sent for transcription, but never automatically to the game builder. Review the words before choosing Send to jems. You can always type.</p><div class="studio-build-controls"><button id="studioCancel" class="studio-button" type="button" hidden>${iconMarkup('stop')} Cancel build</button><button id="studioRetry" class="studio-button" type="button" hidden>${iconMarkup('retry')} Try build again</button></div></form></aside></div>
 <section id="studioVersions" class="studio-versions" aria-labelledby="studioVersionsTitle" hidden><div class="studio-section-heading"><div><h2 id="studioVersionsTitle" tabindex="-1">My tests & versions</h2><p>Try your ideas. You choose which one becomes your main game.</p></div><button class="studio-button" id="studioCloseVersions">Back to game</button></div><div id="studioVersionCards" class="studio-version-cards"></div></section>
 <dialog id="studioCopyDialog" class="studio-dialog" aria-labelledby="studioCopyTitle"><form id="studioCopyForm"><h2 id="studioCopyTitle">Give this game a new name</h2><p>Your original stays safe. Your ideas come with the copy.</p><label for="studioCopyName">Game name</label><input id="studioCopyName" maxlength="60" required><div><button class="studio-button" id="studioCopyCancel" type="button">Cancel</button><button class="studio-button studio-primary" type="submit">Save new game</button></div></form></dialog>`;
 const studioGemBadge=el('span','jems-gem-status');studioGemBadge.id='studioGemBadge';studioGemBadge.hidden=true;
 page.querySelector('#studioVersion')!.after(studioGemBadge);
 document.querySelector('main')!.append(page);
 const copyRecovery=el('section','studio-copy-recovery');copyRecovery.id='studioCopyRecovery';copyRecovery.hidden=true;
 copyRecovery.setAttribute('aria-label','Saved copy');
 const checkCopy=iconEl('button','studio-button','clock','Check my copy') as HTMLButtonElement;
 checkCopy.id='studioCheckCopy';checkCopy.type='button';
 checkCopy.onclick=()=>act(()=>{const pending=current().pendingCopy;if(pending)return copyGame(pending.name);});
 copyRecovery.append(el('p','','Your copy needs a check. Your original is safe.'),checkCopy);
 page.querySelector('.studio-topbar')!.after(copyRecovery);
 const studioGuideHost=el('div');studioGuideHost.id='studioGuideHost';studioGuideHost.hidden=true;
 page.querySelector('.studio-mobile-tabs')!.after(studioGuideHost);
 studioGuideHost.addEventListener('keydown',event=>event.stopPropagation());
 const doneForNow=iconEl('button','studio-button','save','Done for now') as HTMLButtonElement;
 doneForNow.id='studioDoneForNow';doneForNow.type='button';
 doneForNow.onclick=()=>act(async ()=>{(await home());status('Your idea is saved.');});
 page.querySelector('.studio-heading')!.append(doneForNow);
 // One child-facing journey: an idea-first workspace, a composer with attached
 // actions, and a separate status card that only represents observed build states.
 const creationHero=el('section','studio-creation-hero');
 creationHero.id='studioCreationHero';
 // Decode the hidden workshop hero with its reveal frame; async decoding can leave a blank keyboard-entry frame.
 creationHero.innerHTML='<img src="./jems-art/hero_workshop.webp" width="1536" height="1024" alt="" aria-hidden="true" decoding="sync"><div><h2>What game shall we make?</h2></div>';
 $('studioConversation').querySelector('.studio-helper-heading')!.after(creationHero);
 const chatOptions=el('details','studio-chat-options') as HTMLDetailsElement;
 chatOptions.id='studioChatOptions';
 const chatSummary=el('summary','','Chat options');chatSummary.setAttribute('aria-label','Chat privacy options');
 const clearChat=el('button','studio-button','Clear chat on this device') as HTMLButtonElement;
 clearChat.id='studioClearChat';clearChat.type='button';
 chatOptions.append(chatSummary,clearChat);
 $('studioConversation').querySelector('.studio-helper-heading')!.append(chatOptions);
 const continueChat=el('button','studio-button','Continue chat') as HTMLButtonElement;
 continueChat.id='studioContinueChat';continueChat.type='button';continueChat.hidden=true;
 const chatCapacity=el('p','studio-capacity-notice');chatCapacity.id='studioChatCapacity';chatCapacity.hidden=true;
 $('studioPromptForm').before(chatCapacity,continueChat);
 const sendRow=$('studioPromptForm').querySelector('.studio-send-row')!;
 sendRow.prepend($('studioMic'));
 const privateMic=iconEl('button','studio-button','mic','Speak') as HTMLButtonElement;
 privateMic.id='studioPrivateMic';privateMic.type='button';privateMic.hidden=true;
 privateMic.setAttribute('aria-pressed','false');
 privateMic.setAttribute('aria-label','Speak using parent-approved private transcription, then review your message');
 sendRow.prepend(privateMic);
 sendRow.after($('studioDraftStatus'));
 const workshopNote=el('span','studio-workshop-availability');
 workshopNote.id='studioWorkshopAvailability';
 $('studioSend').after(workshopNote);
 const buildGuidance=el('div','studio-build-guidance');buildGuidance.id='studioBuildGuidance';buildGuidance.hidden=true;
 const buildReason=el('p','studio-build-reason');buildReason.id='studioBuildReason';buildReason.setAttribute('role','status');
 const checkIdea=iconEl('button','studio-button','retry','Check my idea') as HTMLButtonElement;
 checkIdea.id='studioCheckIdea';checkIdea.type='button';checkIdea.hidden=true;
 checkIdea.onclick=()=>act(async()=>{stopSpeech();(await flushDraft());if(coachConnection==='sign-in'||remote.mode!=='remote'){(await openParent(true));return;}await coaching?.reassess();});
 buildGuidance.append(buildReason,checkIdea);
 const buildCompletion=el('section','studio-build-completion');buildCompletion.id='studioBuildCompletion';
 buildCompletion.append(buildGuidance,$('studioSend'),workshopNote);$('studioPromptForm').after(buildCompletion);
 $<HTMLButtonElement>('studioSend').type='button';
 $('studioSend').setAttribute('aria-describedby','studioBuildReason');
 const progressBanner=el('section','studio-progress-banner');
 progressBanner.id='studioBuildProgress';progressBanner.hidden=true;
 progressBanner.setAttribute('role','status');progressBanner.setAttribute('aria-live','polite');
 const progressTitle=el('strong','studio-progress-title'),progressDetails=el('p','studio-progress-detail');
 const arcadeButton=el('button','studio-button studio-wait-arcade-button','💎 Play Mind Your Jems!') as HTMLButtonElement;
 arcadeButton.type='button';arcadeButton.hidden=true;
 progressBanner.append(progressTitle,progressDetails,arcadeButton);
 arcadeButton.onclick=()=>act(()=>{if(activeId)playWhileBuilding(current());});
 $('studioMessages').before(progressBanner);
 progressBanner.append($('studioReady'),$('studioPromptForm').querySelector('.studio-build-controls')!);
 const ideaSparks=el('details','studio-idea-sparks') as HTMLDetailsElement;ideaSparks.id='studioIdeaSparks';
 ideaSparks.append(iconEl('summary','','help','Need a spark of inspiration?'));
 const sparkOptions=el('div','studio-idea-spark-options');
 const askIdeas=el('button','studio-chip','Help me think of an idea') as HTMLButtonElement;
 askIdeas.type='button';askIdeas.onclick=()=>act(()=>coaching?.discuss('ideas'));
 sparkOptions.append(askIdeas);ideaSparks.append(sparkOptions);
 $('studioPromptForm').after(ideaSparks);

 const voiceDetails=el('details','studio-voice-details');
 voiceDetails.append(el('summary','','Voice & accessibility options'));
 $('studioPromptForm').querySelector('.studio-voice-row')!.before(voiceDetails);
 voiceDetails.append($('studioPromptForm').querySelector('.studio-voice-row')!, $('studioPromptForm').querySelector('.studio-voice-note')!);
 // Reading the current question is an ordinary child action, not an advanced option.
 $('studioPrompt').after($('studioHear'));$('studioHear').classList.add('studio-read-current');
 // Optional tools stay outside the conversation. The child supplies the ideas;
 // the coach guides them, and Build enables only after a grounded review.
 const moreChoices=el('details','studio-more-choices') as HTMLDetailsElement;moreChoices.id='studioMoreChoices';
 moreChoices.append(el('summary','','More choices'));
 const extraTools=el('div','studio-extra-tools');extraTools.id='studioExtraTools';moreChoices.append(extraTools);
 extraTools.append(ideaSparks,voiceDetails,chatOptions);
 const connectionOptions=el('details','studio-connection-options');connectionOptions.append(el('summary','','Connection & saving'),$('studioAvailability'),workshopNote,$('studioStorage'));
 extraTools.append(connectionOptions);$('studioPromptForm').after(moreChoices);
 const connectionHint=el('p','studio-connection-hint');connectionHint.id='studioConnectionHint';connectionHint.hidden=true;
 $('studioConversation').querySelector('.studio-helper-heading h2')!.after(connectionHint);
 $('studioConversation').querySelector('.studio-helper-heading h2')!.textContent='Let’s make a game';
 $<HTMLTextAreaElement>('studioPrompt').rows=2;setIconLabel($('studioTalk'),'send','Send');
 // Idle narration and save notices do not compete with the child's question.
 // Actual recording, access errors and failed saves stay beside the composer.
 const voiceStatus=$('studioVoiceStatus');$('studioDraftStatus').after(voiceStatus);
 const quietStatus=()=>{
  const text=voiceStatus.textContent||'';
  voiceStatus.hidden=!text||text==='Microphone off.'||text.startsWith('Tap Speak, review')||text.startsWith('A family-approved private speech service');
  const draft=$('studioDraftStatus');draft.hidden=!/could not|check your words/i.test(draft.textContent||'');
 };
 new MutationObserver(quietStatus).observe(voiceStatus,{childList:true,characterData:true,subtree:true});
 new MutationObserver(quietStatus).observe($('studioDraftStatus'),{childList:true,characterData:true,subtree:true});quietStatus();
 const pausedPreview=el('section','studio-paused-preview');pausedPreview.id='studioPausedPreview';pausedPreview.hidden=true;
 pausedPreview.setAttribute('aria-label','Paused game preview');$('studioGameHost').append(pausedPreview);
 const library=el('section','page');library.id='page-studio-library';
 library.innerHTML="<section class=\"studio-home-hero\" aria-labelledby=\"studioLibraryTitle\">\n<div class=\"studio-home-intro\"><h1 id=\"studioLibraryTitle\" tabindex=\"-1\">What jems will you <span>make today?</span></h1><p>Imagine it. Play it. Make it yours.</p><span class=\"studio-hero-sparkles\" aria-hidden=\"true\">✧ ✦</span></div>\n<div class=\"studio-home-action\"><button type=\"button\" id=\"studioNew\" class=\"studio-make-tile\"><span class=\"studio-make-icon\" aria-hidden=\"true\">✨</span><span class=\"studio-make-copy\"><strong>Invent a game</strong><small>Start with your own idea</small></span><span class=\"studio-make-arrow\" aria-hidden=\"true\">→</span></button><p id=\"studioCreationNote\" class=\"studio-creation-note\" role=\"status\" aria-live=\"polite\"></p></div>\n</section>\n<div id=\"studioContinue\"></div>\n<section id=\"studioFavoritesSection\" class=\"studio-home-favorites\" aria-labelledby=\"studioStarterTitle\"><div class=\"studio-section-heading\"><div><h2 id=\"studioStarterTitle\">Ready to Play jems</h2></div></div><div id=\"studioStarters\" class=\"studio-library-grid\"></div></section>\n<section id=\"studioSavedSection\" class=\"studio-home-saved\" aria-labelledby=\"studioSavedTitle\" hidden><div class=\"studio-section-heading\"><div><h2 id=\"studioSavedTitle\">My jems</h2></div></div><div id=\"studioLibrary\" class=\"studio-library-grid\"></div><div id=\"studioArchived\"></div></section>";
 library.querySelector('.studio-make-icon')!.replaceChildren(createIcon('add'));
 library.querySelector('.studio-make-arrow')!.replaceChildren(createIcon('arrow'));
 library.querySelector('.studio-hero-sparkles')!.replaceChildren(createIcon('star'),createIcon('star'));
 const savedArt=el('img','jems-saved-art') as HTMLImageElement;
 savedArt.src='./jems-art/spot_safe_storage.webp';savedArt.alt='';savedArt.width=1536;savedArt.height=1024;savedArt.decoding='async';savedArt.loading='lazy';savedArt.setAttribute('aria-hidden','true');
 library.querySelector('#studioSavedSection .studio-section-heading')!.prepend(savedArt);
 const gemSummary=el('section','jems-builder-progress');gemSummary.id='studioGemProgress';gemSummary.hidden=true;
 gemSummary.setAttribute('aria-label','My builder level');
 library.querySelector('#studioSavedSection .studio-section-heading')!.after(gemSummary);
 document.querySelector('main')!.append(library);
 const homeCharacters=el('div','jems-home-characters');homeCharacters.setAttribute('aria-hidden','true');
 library.querySelector('.studio-home-hero')!.append(homeCharacters);
 (library.querySelector('.studio-home-hero') as HTMLElement).style.setProperty('--journey-world',`url(${JSON.stringify(new URL('jems-journey/background.webp',document.baseURI).href)})`);
 const homeCharacterLink=el('button','jems-home-journey','Choose your maker') as HTMLButtonElement;
 homeCharacterLink.type='button';homeCharacterLink.id='studioHomeCharacter';
 homeCharacterLink.hidden=true;library.append(homeCharacterLink);
 const libraryTools=el('div','studio-library-tools');
 const savedIdeas=iconEl('button','studio-button','grid','Saved ideas & versions') as HTMLButtonElement;
 savedIdeas.id='studioSavedIdeas';savedIdeas.type='button';savedIdeas.onclick=()=>act(openSavedIdeas);
 libraryTools.append(savedIdeas);library.querySelector('#studioSavedSection .studio-section-heading')!.append(libraryTools);
 const originals=el('section','studio-home-favorites');originals.id='studioOriginalsSection';
 originals.setAttribute('aria-labelledby','studioOriginalsTitle');
 originals.innerHTML='<div class="studio-section-heading"><h3 id="studioOriginalsTitle" class="sr-only">Your original games</h3></div><div id="studioOriginals" class="studio-library-grid"></div>';
 $('studioSavedSection').querySelector('.studio-section-heading')!.after(originals);
 const collectionBack=iconEl('button','studio-button','arrow','My Games','jems-icon--back') as HTMLButtonElement;
 collectionBack.id='studioCollectionBack';collectionBack.type='button';collectionBack.onclick=()=>act(home);
 const collectionPage=$('page-creations');
 const collectionActions=collectionPage.querySelector('.page-head')!;
 const collectionTitle=collectionActions.querySelector('h1')!;
 collectionActions.before(createPageHeader(collectionPage, {
  title:collectionTitle, description:collectionActions.querySelector('p')!, back:collectionBack, backLabel:'My Games',
 }));
 const learningChoice=el('section','studio-learning-choice');learningChoice.id='studioLearningChoice';
 learningChoice.setAttribute('aria-labelledby','studioLearningTitle');
 learningChoice.innerHTML='<div class="studio-learning-copy"><strong id="studioLearningTitle">Learning adventure</strong><small id="studioLearningNote"></small></div><div class="learning-subject-switch" role="group" aria-label="Choose practice subject"><button type="button" id="studioSubjectMath" aria-pressed="true">Math</button><button type="button" id="studioSubjectLanguage" aria-pressed="false">English</button></div>';
 // The subject switch belongs to the player's header, not below the game shelf.
 for(const [id,name,label] of [['studioSubjectMath','grid','Math'],['studioSubjectLanguage','book','English']] as const)setIconLabel(learningChoice.querySelector<HTMLElement>('#'+id)!,name,label);
 const nativeStage=$('page-game');
 const nativeStageHome=document.createComment('Native game host returns here');
 nativeStage.before(nativeStageHome);
 const playView=installPlayView(page,$('studioGameHost'));
 const originalNav=document.querySelector('.site-header nav') as HTMLElement;
 originalNav.hidden=true;
 const nav=el('nav','studio-nav');nav.setAttribute('aria-label','Main navigation');
 nav.innerHTML='<button id="studioNavHome">My Games</button><button id="studioNavCreate">Create</button><button id="studioNavJourney">My Journey</button><button id="studioNavRewards">My rewards</button><button id="studioNavPowers">My Powers</button>';
 for(const [id,name,label] of [['studioNavHome','home','My Games'],['studioNavCreate','add','Create'],['studioNavJourney','star','My Journey'],['studioNavRewards','star','My rewards'],['studioNavPowers','chart','My Powers']] as const)setIconLabel(nav.querySelector<HTMLElement>('#'+id)!,name,label);
 function setActiveNav(id:string|null){nav.querySelectorAll('button').forEach(button=>{const active=button.id===id;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
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
 const helpButton=iconEl('button','studio-button studio-journey-help','help','Journey help') as HTMLButtonElement;
 helpButton.id='studioJourneyHelp';helpButton.type='button';helpButton.setAttribute('aria-controls','studioJourneyMap');helpButton.setAttribute('aria-expanded','false');
 headerTools.append(helpButton);
 const journeyMap=createJourneyOverview({
  reset:()=>act(async ()=>{
   if(guardMath())return;
   (await notebook.resetGuidance(owner()));closeJourneyMap(true);
   document.querySelectorAll<GuideCard>('.jems-guide-card').forEach(card=>card.refresh?.());
   if(route==='studio')refreshStudioGuide();
   status('Helpful hints are back. You can dismiss each one whenever you like.');
  }),close:()=>closeJourneyMap(true),
 });
 globalStatus.after(journeyMap);
 function closeJourneyMap(focus=false){journeyMap.hidden=true;helpButton.setAttribute('aria-expanded','false');if(focus)focusView(helpButton.closest('dialog:not([open])')?$('studioNavMenu'):helpButton);}
 function openJourneyMap(){
  if(guardMath())return;
  if(!journeyMap.hidden){closeJourneyMap(true);return;}
  journeyMap.hidden=false;helpButton.setAttribute('aria-expanded','true');focusView($('studioJourneyMapTitle'));
 }
 helpButton.onclick=()=>act(openJourneyMap);
 journeyMap.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();closeJourneyMap(true);}});
 const welcome=createFirstWelcome({
  choose:async (character,ownerId)=>(await chooseMaker(character,ownerId)),
  make:async ownerId=>{
   if(ownerId!==owner()||!notebook.avatar(ownerId))throw Error('Choose your character first.');
   if(guardMath())return;
   (await notebook.dismissWelcome(ownerId));closeJourneyMap();return (await newIdea());
  },
  help:()=>act(openJourneyMap),
 });
 library.prepend(welcome.element);
 library.querySelector('.studio-home-hero')!.after($('studioContinue'));
 function readWelcomeArt(force=false):Promise<void>{
  const capturedOwner=owner();
  if(!force&&welcomeArt?.owner===capturedOwner)return welcomeArt.pending||Promise.resolve();
  const capturedView=epoch,state:{owner:string;hasArt:boolean;pending:Promise<void>|null;deferredView:number|null}={owner:capturedOwner,hasArt:true,pending:null,deferredView:null};
  welcomeArt=state;library.setAttribute('aria-busy','true');
  // A blocked IndexedDB upgrade cannot hold the whole Studio at startup.
  // Unknown or unreadable art conservatively keeps the ordinary home available.
  let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(true),1500);});
  const scenes=(async()=>{const store=await CreationWorkspace.open(profileStorage(localStorage),owner);try{return (await store.page(capturedOwner,null,1)).items.length>0;}finally{store.close();}})().catch(()=>true);
  state.pending=Promise.race([Promise.all([drawingPage(capturedOwner,{limit:1}).then(page=>page.items.length>0,()=>true),scenes]).then(values=>values.some(Boolean)),timeout]).then(hasArt=>{
   clearTimeout(timer);
   if(welcomeArt!==state||owner()!==capturedOwner)return;
   state.hasArt=hasArt;state.pending=null;library.setAttribute('aria-busy','false');
   if(route!=='library')return;
   const focused=document.activeElement,homeTitle=$('studioLibraryTitle'),welcomeTitle=$('studioWelcomeTitle');
   // A read may finish after the child has chosen an action. Never replace that
   // interaction on this visit, including a later passive storage refresh.
   // Explicit Home advances the view and can use the cached result then.
   if(epoch!==capturedView||(focused!==document.body&&focused!==homeTitle&&focused!==welcomeTitle)){
    if(!hasArt&&welcome.element.hidden)state.deferredView=epoch;
    return;
   }
   act(()=>{
    refreshWelcome();
    if(focused===homeTitle&&!welcome.element.hidden)focusView(welcomeTitle);
    else if(focused===welcomeTitle&&welcome.element.hidden)focusView(homeTitle);
   });
  });
  return state.pending;
 }
 function refreshWelcome(){
  if(notebookOwner!==owner())return;
  // Existing scene creators and established makers keep their normal home.
  // A damaged scene store is not a new account and must not be overwritten.
  void readWelcomeArt();
  const visible=!welcomeArt!.hasArt&&welcomeArt!.deferredView!==epoch&&!notebook.guidance(owner()).welcomeDismissed&&!notebook.summary().meaningfulCreation;
  // Saving a character does not jump past the explicit creation action.
  // Tool availability is explained in the composer; this first choice stays simple.
  library.dataset.firstVisit=String(visible);welcome.update(visible,'',{ownerId:owner(),character:notebook.avatar(owner())});
  document.body.classList.toggle('studio-first-visit',visible&&route==='library');
 }
 async function chooseMaker(character:'spark'|'nova',ownerId:string){
  if(ownerId!==owner())throw Error('Choose a character for the current player.');
  (await notebook.setAvatar(ownerId,character));
  updateProfile();renderJourney();renderHomeProgress();renderRewards();refreshWelcome();
 }
 const journey=installGemJourney({
  onBack:()=>act(home),onCreate:()=>act(newIdea),
  onPrimaryAction:ownerId=>act(async()=>{
   if(ownerId!==owner())return;
   if(guardMath())return;
   const target=journeyContinuation();
   if(!target){(await newIdea());return;}
   await open(target.id,false);
   if(owner()===ownerId&&activeId===target.id&&route==='studio')(await setTab(target.gemStage==='cut'?'versions':'talk'));
  }),
  onChooseCharacter:chooseMaker,
 });
 document.querySelector('main')!.append(journey.element);
 function rewardJourney(){const progress=notebook.summary().journey;return {ownerId:owner(),level:progress.level,character:notebook.avatar(owner()),polishedCount:progress.polishedCount,nextAction:progress.nextAction};}
 const rewardsPage=createRewardsPage({
  guidance:guideHost,
  state:{...rewards.state,journey:rewardJourney()},onBack:()=>act(()=>openJourney()),onOpenJourney:()=>act(async ()=>(await openJourney(!notebook.avatar(owner())))),
  onPlay:()=>act(async ()=>(await openPractice())),onActivity:activity=>act(async ()=>(await openRewardActivity(activity))),
  onCreate:()=>act(newIdea),onRetry:()=>{void rewards.refresh().catch(()=>{});}
 });
 document.querySelector('main')!.append(rewardsPage.element);
 const rewardsWidget=createRewardsWidget({...rewards.state,onOpen:()=>act(openRewards)});
 const rewardToastHost=el('div','jems-rewards-toast-host');rewardToastHost.id='jemsRewardCelebrations';document.body.append(rewardToastHost);
 let rewardToastTimer:ReturnType<typeof setTimeout>|undefined,rewardBatchTimer:ReturnType<typeof setTimeout>|undefined,pendingGrants:RewardGrant[]=[],rewardViewReady:Promise<unknown>=Promise.resolve();
 function clearRewardCelebration(){clearTimeout(rewardToastTimer);clearTimeout(rewardBatchTimer);pendingGrants=[];rewardToastHost.replaceChildren();}
 function celebrationWouldCoverWork(){return playView.active||(route==='studio'&&panel==='talk'&&!page.classList.contains('hidden'));}
 function enterPlayView(){clearRewardCelebration();document.getElementById('jems-delight-host')?.replaceChildren();playView.enter();}
 function renderRewards(){if(notebookOwner!==owner())return;rewardsWidget.update(rewards.state.summary,rewards.state);rewardsPage.update({...rewards.state,journey:rewardJourney()});}
 rewards.subscribe((state,grants)=>{
  if(notebookOwner===owner()){const selected=notebook;
   // A recovered maker outbox may come from another writer. Refresh the maker
   // projection for that milestone, while ordinary rewards read only receipts.
   const refreshed=grants.some(grant=>grant.kind==='maker.milestone')?selected.refresh():selected.refreshRewards();
   rewardViewReady=Promise.all([rewardViewReady.catch(()=>{}),refreshed]);
   void rewardViewReady.then(()=>{if(notebook===selected&&notebookOwner===owner())renderRewards();}).catch(()=>{});
  }
  renderRewards();
  // Earned totals still update; decorative popups must not cover answers or game controls.
  if(celebrationWouldCoverWork()){clearRewardCelebration();return;}
  if(!grants.length||state.summary.owner!==owner()||document.hidden)return;
  pendingGrants.push(...grants);clearTimeout(rewardBatchTimer);
  const capturedOwner=owner();
  rewardBatchTimer=setTimeout(async()=>{
   try{await rewardViewReady;}catch{pendingGrants=[];return;}
   if(owner()!==capturedOwner||document.hidden||celebrationWouldCoverWork()){pendingGrants=[];return;}
   const batch=pendingGrants;pendingGrants=[];
   const earned=batch.reduce((total,grant)=>total+grant.amount,0),summary=rewards.state.summary;
   const reached=summary.reachedGemMilestones.filter(goal=>goal>summary.lifetimeGems-earned).at(-1);
   document.getElementById('jems-delight-host')?.replaceChildren();
   rewardToastHost.replaceChildren(createRewardCelebration({grants:batch,journey:rewardJourney(),...(reached?{headline:reached+' gems reached!'}:{})}));
   clearTimeout(rewardToastTimer);rewardToastTimer=setTimeout(()=>rewardToastHost.replaceChildren(),4000);
  },180);
 });
 async function openRewards(){
  if(guardMath())return;stopSpeech();(await flushDraft());(await FG.creation?.flush());hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));
  route='rewards';globalStatus.textContent='';renderRewards();rewardsPage.show();
  setActiveNav('studioNavRewards');
  window.scrollTo(0,0);void rewards.refresh().catch(()=>{});
 }
 rewards.setOpen(()=>act(openRewards));
 window.addEventListener('factory-page',()=>{handoff.close();rewardsPage.hide();document.body.classList.remove('studio-first-visit');closeJourneyMap();globalStatus.textContent='';globalStatus.classList.remove('is-error');globalStatus.setAttribute('role','status');});
 window.addEventListener('factory-profile',()=>{clearRewardCelebration();rewardsPage.hide();});
 window.addEventListener('pagehide',clearRewardCelebration);
 // One Home recommendation and an owner-scoped page replace the old build shelf.
 // Counts are derived from existing saved work; they never dispatch an action.
 notificationView=createStudioNotificationsView({
  homeHost:$('studioContinue'),
  canRead:ownerId=>owner()===ownerId&&route==='notifications'&&!FG.learning.active&&!localSpeechActive&&!privateSpeech?.active(),
  onOpen:(item,origin)=>act(()=>openNotification(item,origin)),
  onContinue:item=>act(()=>{if(route==='library'&&owner()===item.ownerId)return continueRecommended(item.sessionId,item.ownerId);}),
  onDismiss:item=>act(async ()=>{
   if(route!=='library'||owner()!==item.ownerId)return;
   if(item.notification){const latest=resolveNotification(item.notification,'home');if(!latest)return;(await notebook.dismissNotification(owner(),latest));}
   else (await notebook.dismissResume(item.sessionId,item.ownerId));
   refreshNotifications();focusView($('studioNotificationsHome')||$('studioLibraryTitle'));
  }),
  onOpenPage:()=>act(openNotifications),onBack:()=>act(home),
  onStop:stopNotificationBuild,
  onPlayWhileWaiting:item=>act(async()=>{const latest=resolveNotification(item,'notifications');if(!latest)return;await flushDraft();const selected=await notebook.load(latest.sessionId,latest.ownerId);if(owner()===latest.ownerId)await playWhileBuilding(selected);}),
 });
 document.querySelector('main')!.append(notificationView.page);
 nav.append(notificationView.menuEntry);
 $('studioMore').querySelector('.studio-more-actions')!.prepend(notificationView.playEntry);
 function notificationItems(sessions=notebook.list(owner())){
  const disconnected=new Set(unknownJobs);
  if(configReady)for(const s of sessions)if(busy(s)&&(remote.mode!=='remote'||s.jobApi!==remote.apiBaseUrl))disconnected.add(s.id);
  return notebook.notifications({unknownSessionIds:disconnected,unconfirmedSessionIds:new Set(sessions.filter(s=>s.pendingSubmission||s.needsReadyRecovery).map(s=>s.id)),sendingSessionIds:sending});
 }
 function renderHomeContinuation(sessions:NotebookCard[],items:StudioNotification[]){
  const item=items.find(item=>!item.dismissed);
  let suggestion:StudioContinuation|null=null;
  if(item){
   const session=sessions.find(session=>session.id===item.sessionId)!;
   suggestion={sessionId:session.id,ownerId:session.owner,name:session.name,art:icon[session.game],kind:item.kind,title:item.title,description:item.idea||item.description,actionLabel:item.actionLabel,notification:item};
  }else{
   // A dismissed notification cannot reappear through the recent-play fallback.
   const represented=new Set(items.map(item=>item.sessionId));
   const next=notebook.summary().continuationCandidates.find(candidate=>!represented.has(candidate.sessionId)&&sessions.some(s=>s.id===candidate.sessionId&&(!isRetiredStarter(s.game)||s.meaningfulCreation)));
   const last=next?sessions.find(session=>session.id===next.sessionId):null;
   if(last&&next)suggestion={sessionId:last.id,ownerId:last.owner,name:last.name,art:icon[last.game],kind:next.kind,title:next.title,description:next.description,actionLabel:next.action};
  }
  notificationView!.renderHome(suggestion,items,owner());
 }
 function refreshNotifications(){
  if(notebookOwner!==owner())return;
  const sessions=notebook.list(owner()),items=notificationItems(sessions);
  playView.setReady(items.some(item=>item.kind==='ready'));
  notificationView!.updateBadges(items);
  if(route==='library')renderHomeContinuation(sessions,items);
  if(route==='notifications')notificationView!.renderPage(items,owner(),new Set(sessions.filter(busy).map(s=>s.id)));
 }
 function resolveNotification(item:StudioNotification,origin:NotificationOrigin){
  if(owner()!==item.ownerId||(origin==='home'?route!=='library':route!=='notifications')||guardMath())return null;
  const latest=notificationItems().find(current=>current.sessionId===item.sessionId);
  if(!latest||latest.token!==item.token){refreshNotifications();status('This update changed. Choose its current action.');return null;}
  return latest;
 }
 async function openNotifications(){
  if(guardMath())return;
  stopSpeech();(await flushDraft());(await FG.creation?.flush());
  const items=notificationItems(),unread=items.filter(item=>item.unread);
  // A refused metadata save must not strand the child away from unsaved work.
  if(unread.length)(await notebook.acknowledgeNotifications(owner(),unread));
  handoff.close();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');
  document.querySelectorAll('main > .page').forEach(element=>element.classList.add('hidden'));
  notificationView!.page.classList.remove('hidden');route='notifications';
  document.body.classList.remove('studio-designing','creation-open');globalStatus.textContent='';
  refreshNotifications();setActiveNav('studioNavNotifications');window.scrollTo(0,0);focusView($('studioNotificationsTitle'));
 }
 async function openNotification(item:StudioNotification,origin:NotificationOrigin){
  const latest=resolveNotification(item,origin);if(!latest)return;
  (await flushDraft());if(owner()!==latest.ownerId)return;
  if(latest.unread)(await notebook.acknowledgeNotifications(owner(),[latest]));
  if(latest.action==='open-ready'){await openReadySession(latest.sessionId,latest.ownerId);return;}
  await open(latest.sessionId,false);
  if(owner()!==latest.ownerId||activeId!==latest.sessionId||route!=='studio')return;
  if(latest.kind==='experiment'&&current().candidate)await playCandidate();else (await setTab('talk'));
 }
 async function stopNotificationBuild(item:StudioNotification){
  const capturedOwner=item.ownerId,at=epoch;
  const canPresent=()=>owner()===capturedOwner&&route==='notifications'&&epoch===at;
  let s:StudioSession|undefined;
  try{
   const latest=resolveNotification(item,'notifications');if(!latest)return;
   await flushDraft();s=await notebook.load(latest.sessionId,latest.ownerId);if(!busy(s))return;
   if(remote.mode!=='remote'||('jobApi'in s?s.jobApi:s.job?.api)!==remote.apiBaseUrl){
    if(canPresent())status('Reconnect this game’s workshop before stopping its build. Your idea is saved.',true);
    return;
   }
   const result=await clientFor(s).cancel(s.job!.id);
   if(owner()!==capturedOwner)return;
   if(result.status==='cancelled'){if(canPresent())status('Build stopped. Your idea is saved.');}
   else{
    if(canPresent())status('Stop requested. Checking the build status.');
    const current=notebook.get(s.id,s.owner);if(busy(current))resume(current);
   }
  }catch{
   if(owner()===capturedOwner){
    if(s)unknownJobs.add(s.id);
    if(canPresent())status(s?'Could not confirm stop. The build may still be working.':'Could not check this update. Your saved work is still here.',true);
   }
  }finally{
   if(owner()===capturedOwner)try{refreshNotifications();}catch{if(canPresent())status('Could not refresh updates. Your saved work is still here.',true);}
  }
 }
 async function playWhileBuilding(s:StudioSession){
  if(owner()!==s.owner||guardMath())return;
  const latest=notebook.get(s.id,s.owner),ready=readyExperiment(latest);
  if(!latest.job||(!busy(latest)&&!ready))return;
  stopSpeech();(await flushDraft());handoff.close();
  await start('mining');
  if(owner()!==s.owner||route!=='studio'||!activeId||current().game!=='mining')return;
  waitProject={id:s.id,owner:s.owner};refreshNotifications();
 }
 let renderedMakerOwner='',renderedMakerCharacter:'spark'|'nova'|null=null;
 function updateProfile(){if(notebookOwner!==owner())return;
  const child=FG.store.current(),makerOwner=owner(),character=notebook.avatar(makerOwner);
  // A choice can also change in another tab. Clear old cosmetic notifications
  // only when the rendered identity actually changes; ordinary saves keep them.
  if(renderedMakerOwner&&(renderedMakerOwner!==makerOwner||renderedMakerCharacter!==character)){
   clearRewardCelebration();window.dispatchEvent(new Event('jems:maker-changed'));
  }
  renderedMakerOwner=makerOwner;renderedMakerCharacter=character;profileSummary.replaceChildren();
  if(character&&notebookOwner===owner())profileSummary.append(createMakerIdentity({ownerId:makerOwner,character,level:notebook.summary().journey.level}));
  else profileSummary.append(el('span','',child.icon||'⭐'));
  profileSummary.append(el('span','',child.name));profileSummary.setAttribute('aria-label','Switch player. Current player: '+child.name);profileSummary.title='Switch player';profileMenu.open=false;
 }
 updateProfile();
 function focusView(target:HTMLElement){if(!target.isConnected||target.closest('[hidden],.hidden,[inert]'))return;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});}
 function guardMath(){if(!FG.learning.active)return false;status('Your learning activity is still here. Finish it, or choose My Games to leave.');FG.learning.focus?.();return true;}
 function readyExperiment(s:StudioSession){return readyGuidedExperiment(s);}
 function refreshStudioGuide(){
  if(notebookOwner!==owner()){studioGuideHost.hidden=true;return;}
  if(!activeId||route!=='studio'||FG.learning.active||panel==='versions'){studioGuideHost.hidden=true;return;}
  // The learning host can announce disposal while a profile switch is between
  // its owner change and Studio's reset. Never read the previous owner's view.
  const s=notebook.list(owner()).some(session=>session.id===activeId)?current():null;
  if(!s){studioGuideHost.hidden=true;return;}
  const capturedOwner=s.owner,capturedId=s.id;
  let tip:GuideTipId='play',copy=GUIDE_TIPS.play;
  let action:{label:string;run:()=>void}|undefined;
  const ready=readyExperiment(s),hasGame=!!(s.projectId||s.remoteId);
  if(ready){
   tip='ready';copy={title:hasGame?'Your change is ready to try':'Your game is ready to play',description:GUIDE_TIPS.ready.description};
   action={label:hasGame?'Try my change':'Play my game',run:()=>act(()=>openReadySession(capturedId,capturedOwner))};
  }else if(busy(s)){
   tip='waiting';copy=unknownJobs.has(s.id)?{title:'Your idea is safe',description:'We are checking the connection. The build may still be working; you can keep playing.'}:GUIDE_TIPS.waiting;
   action={label:'Play while I wait',run:()=>act(()=>playWhileBuilding(current()))};
  }else if(s.candidate&&showing==='candidate'&&panel==='game'){
   tip='keep';copy=hasGame?GUIDE_TIPS.keep:{title:'Your first playable version',description:'Give it a try. If you like it, choose Make this my main game. You can change it again later.'};
  }else if(!hasGame&&!s.candidate){
   tip='idea';copy=GUIDE_TIPS.idea;
   if(s.job?.status==='failed')copy={title:'Your idea is still here',description:'The build did not finish. Your words are saved. You can change your idea or choose Try build again.'};
  }else if(panel==='talk'){
   tip='improve';copy=GUIDE_TIPS.improve;
  }else if(keptInThisView===s.id){
   tip='saved';copy={title:'Your favorite is kept',description:'Your earlier versions are still in My tests. Keep playing, try another idea, or come back later.'};
   action={label:'Done for now',run:()=>act(async ()=>{(await home());status('Your chosen version is kept. Find it here when you come back.');})};
  }else{
   action={label:'Try one change',run:()=>act(async ()=>{if((await setTab('talk')))focusView($('studioPrompt'));})};
  }
  const signature=JSON.stringify([s.owner,s.id,tip,copy,action?.label]);
  // Keep guidance after the task it explains and inside the visible phone panel.
  const nearComposer=panel==='talk'||s.game==='new'&&!hasGame&&!s.candidate;
  const moveGuide=studioGuideHost.parentElement!==(nearComposer?extraTools:$('studioCanvas'));
  let focusedGuideControl:'action'|'dismiss'|undefined;
  if((moveGuide||signature!==guideSignature)&&currentGuide?.contains(document.activeElement))focusedGuideControl=document.activeElement?.id==='studioGuideCardAction'?'action':'dismiss';
  if(moveGuide){if(nearComposer)extraTools.append(studioGuideHost);else $('studioGameHost').after(studioGuideHost);}
  if(signature!==guideSignature){
   // A background status change may replace this hint while its controls have
   // keyboard focus. Preserve that position without pulling focus from play.
   guideSignature=signature;
   currentGuide=createGuideCard({id:'studioGuideCard',tip,...copy,host:guideHost,action,
    canAct:()=>owner()===capturedOwner&&activeId===capturedId&&route==='studio'&&!FG.learning.active,
    onError:message=>status(message,true),
    onDismiss:()=>{studioGuideHost.hidden=true;focusView(panel==='talk'?$('studioPromptLabel'):$('studioTitle'));},
   });
   studioGuideHost.replaceChildren(currentGuide);
  }else currentGuide?.refresh();
  studioGuideHost.hidden=!!currentGuide?.hidden;
  if(focusedGuideControl){
   const target=studioGuideHost.hidden?$('studioTitle'):
    currentGuide?.querySelector<HTMLButtonElement>(focusedGuideControl==='action'?'#studioGuideCardAction':'#studioGuideCardDismiss')||
    currentGuide?.querySelector<HTMLButtonElement>('#studioGuideCardDismiss');
   target?.focus({preventScroll:true});
  }
 }
 async function openReadySession(id:string,capturedOwner=owner()){
  if(owner()!==capturedOwner||guardMath())return;
  await flushDraft();const s=await notebook.load(id,capturedOwner);
  if(s.archived)return;
  if(route!=='studio'||activeId!==id)await open(id,false);
  if(owner()!==capturedOwner||route!=='studio'||activeId!==id)return;
  const latest=notebook.get(id,capturedOwner),ready=readyExperiment(latest);
  if(ready?.candidate.remoteId)await showRemote(latest,ready.candidate.remoteId,'candidate',ready.id);
  else if(latest.candidate)await playCandidate();
  else if(latest.projectId||latest.remoteId)await playWorking();
  else (await setTab('talk'));
 }
 async function continueRecommended(id:string,capturedOwner:string){
  if(owner()!==capturedOwner||guardMath())return;
  await flushDraft();const s=await notebook.load(id,capturedOwner);
  if(s.archived||s.resumeDismissed){renderLibrary();return;}
  if(readyExperiment(s)){await openReadySession(id,capturedOwner);return;}
  if(s.candidate){await open(id,false);if(owner()===capturedOwner&&activeId===id&&route==='studio')await playCandidate();return;}
  if(busy(s)||s.job?.status==='failed'||s.draft.trim()||!s.projectId&&!s.remoteId){
   await open(id,false);if(owner()===capturedOwner&&activeId===id&&route==='studio')(await setTab('talk'));return;
  }
  await open(id);
 }

 const stageFor=(s:StudioSession)=>gemStage(s);
 const levelForOwner=()=>notebook.summary().journey;
 const stageNumber=(stage:GemStage)=>({none:0,rough:1,cut:2,polished:3})[stage];
 const progressSnapshot=(s:StudioSession)=>({stage:stageFor(s),level:notebook.summary().journey.level});
 function gemAchievement(before:{stage:GemStage;level:number},s:StudioSession):JemMilestone|null {
  const after=progressSnapshot(s);
  if(after.level>before.level)return ({1:'builder-maker',2:'builder-cut',3:'builder-polished',4:'builder-master'} as const)[after.level as 1|2|3|4];
  if(after.stage==='polished'&&stageNumber(after.stage)>stageNumber(before.stage))
   return 'gem-polished';
  if(after.stage==='cut'&&stageNumber(after.stage)>stageNumber(before.stage))
   return 'gem-cut';
  return null;
 }
 function celebrateProgress(kind:JemMilestone,anchorId='studioVersion'){
  // Persisted gem grants and a newly earned maker rank share one celebration.
  if(celebrationWouldCoverWork()||notebook.pendingRewards(owner()).length)return;
  celebrateJem(kind,anchorId,{character:notebook.avatar(owner()),level:levelForOwner().level});
 }
 function renderJourney(){
  const progress=levelForOwner();
  journey.render({ownerId:owner(),level:progress.level,character:notebook.avatar(owner()),polishedCount:progress.polishedCount,nextAction:progress.nextAction,primaryActionLabel:journeyContinuation()?'Continue my jem':'Invent a game'});
 }
 function journeyContinuation(){
  const sessions=notebook.list(owner()).filter(s=>!s.archived&&!busy(s));
  return sessions.find(s=>s.gemStage==='cut')||sessions.find(s=>s.gemStage==='rough')||null;
 }
 function hideJourney(){journey.closeCharacterPicker(false);journey.element.hidden=true;journey.element.classList.add('hidden');}
 async function openJourney(choose=false){
  if(guardMath())return;stopSpeech();(await flushDraft());(await FG.creation?.flush());$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));
  journey.element.hidden=false;journey.element.classList.remove('hidden');route='journey';globalStatus.textContent='';renderJourney();
  setActiveNav('studioNavJourney');
  window.scrollTo(0,0);focusView($('jemsJourneyTitle'));if(choose)journey.openCharacterPicker();
 }
 function renderGemBadge(s:StudioSession){
  const stage=stageFor(s);studioGemBadge.hidden=stage==='none';studioGemBadge.replaceChildren();
  if(stage!=='none')studioGemBadge.append(createJourneyGem(stageNumber(stage)),el('span','',GEM_STAGE_LABELS[stage]));
 }
 function renderHomeProgress(){
  if(notebookOwner!==owner())return;
  const progress=levelForOwner(),character=notebook.avatar(owner());
  homeCharacters.replaceChildren(createMakerIdentity({ownerId:owner(),character,level:progress.level}));
  homeCharacters.classList.remove('is-pair');
  setIconLabel(homeCharacterLink,'star',character?'My Journey':'Choose your maker');
  gemSummary.hidden=progress.level===0;gemSummary.replaceChildren();
  if(progress.level===0)return;
  const open=el('button','jems-builder-open') as HTMLButtonElement;open.id='studioJourneyOpen';open.type='button';
  const art=createJourneyRankThumbnail(character,progress.level),copy=el('span','jems-builder-copy');
  art.classList.add('jems-builder-portrait');
  copy.append(el('small','','My Journey · Level '+progress.level),el('strong','',progress.name));
  const steps=el('span','jems-builder-steps');steps.setAttribute('aria-hidden','true');
  for(let level=1;level<=4;level++){const gem=createJourneyGem(level);gem.classList.toggle('is-earned',level<=progress.level);steps.append(gem);}
  const arrow=el('span','jems-builder-arrow');arrow.append(createIcon('arrow'));open.append(art,copy,steps,arrow);open.onclick=()=>act(async ()=>(await openJourney()));gemSummary.append(open);
 }
 let lastPresentedLevel=notebook.summary().journey.level;
 function onSavedDesignChange(before:StudioSession,after:StudioSession){
  if(before.owner!==owner()||after.owner!==owner()||before.id!==activeId)return;
  const achievement=gemAchievement({stage:stageFor(before),level:lastPresentedLevel},after);
  lastPresentedLevel=notebook.summary().journey.level;
  // Update decoration only: typing in a test note or plan must retain focus.
  renderGemBadge(after);updateProfile();refreshBuildAction();
  if(route==='journey')renderJourney();else if(route==='library')renderHomeProgress();
  if(achievement&&!FG.learning.active)celebrateProgress(achievement);
 }
 function current(){if(!activeId)throw Error('Choose a project first.');return notebook.get(activeId,owner());}
 const artPlanBox=el('section','studio-art-plan');artPlanBox.id='studioArtPlan';artPlanBox.hidden=true;
 $('studioPromptForm').before(artPlanBox);
 function showArtPlan(s:StudioSession){
  const authorized=creationAction();
  const live=()=>authorized() && route==='studio' && activeId===s.id && owner()===s.owner && !FG.learning.active;
  const active=()=>{if(!live())return null;const plan=current().gameArt;return plan?{owner:s.owner,game:s.id,plan}:null;};
  const play=async(id:string)=>{
   if(!gameArtReview||!live())return;
   const {playArtTest}=await import('../game-art/review');
   const view=epoch;
   await playArtTest({origin:location.origin,owner:s.owner,game:s.id,version:id},()=>epoch===view?active():null,async()=>{
    await notebook.update(s.id,s.owner,x=>{if(!live()||!x.gameArt?.tests.some(t=>t.id===id))throw Error('Reopen this test.');x.gameArt.kept=id;});
    render();
   });
  };
  artPlanBox.parentElement!.dataset.artGame=[s.owner,s.id,epoch,guidanceEpoch].join('/');
  renderArtPlan(artPlanBox,s.gameArt,{
   remove:role=>act(async()=>{if(!live())return;await notebook.update(s.id,s.owner,x=>{if(live()&&x.gameArt)x.gameArt.pins=x.gameArt.pins.filter(p=>p.role!==role);});render();}),
   sample:faster=>act(async()=>{
    if(!gameArtReview||!live())return;
    const {sampleProgram}=await import('../game-art/review');
    let id='';await notebook.update(s.id,s.owner,x=>{
     if(!live()||!x.gameArt?.pins.length)throw Error('Choose a picture first.');
     const plan=x.gameArt;
     if(plan.tests.length!==s.gameArt?.tests.length || JSON.stringify(plan.pins)!==JSON.stringify(s.gameArt.pins))
       throw Error('Your art plan changed. Open its latest test.');
     id=saveArtTest(plan,sampleProgram(faster,plan.pins),plan.kept??plan.tests.at(-1)?.id??null).id;
    });render();await play(id);
   }),
   play:id=>act(()=>play(id)),
  });
 }
 function refreshBuildAction(){
  if(!activeId)return;
  const s=current(),creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  const readiness=creating?(coaching?.buildReadiness()||creationBuildReadiness({...s,draft:$<HTMLTextAreaElement>('studioPrompt').value},s.design?.creationStandard===2?2:1)):null;
  const draftCanReview=readiness?.issue==='draft'&&creationBuildReadiness({...s,draft:''},s.design?.creationStandard===2?2:1).ready;
  const pending=sending.has(s.id)||saving,uncertain=unknownJobs.has(s.id)||Boolean(s.pendingSubmission)||needsReadyRecovery(s);
  $<HTMLButtonElement>('studioSend').hidden=false;
  $<HTMLButtonElement>('studioSend').disabled=pending||!reflecting&&uncertain||creating&&(busy(s)||!readiness?.ready&&!draftCanReview)||!!coaching?.busy();
  if(s.gameArt?.pins.length&&!reflecting)$<HTMLButtonElement>('studioSend').disabled=true;
  const hasIdea=s.messages.some(message=>message.role==='child');
  const reconnect=['limited','unavailable','sign-in'].includes(coachConnection);
  buildReason.textContent=creating?(pending?'Getting your build ready…':s.pendingSubmission?'The workshop has not confirmed this request. Your idea is safe.':uncertain?'Check your last build before starting another.':busy(s)?'Your game is already building.':readiness?.ready?'Your game idea is ready!':
   !hasIdea?'Tell me your game idea first.':$<HTMLTextAreaElement>('studioPrompt').value.trim()?'Build will check your new thought first.':
   reconnect?'Chat needs to reconnect to check your idea.':readiness?.reason||'Let’s check your idea together.') : '';
  checkIdea.hidden=!creating||pending||busy(s)||uncertain||!!readiness?.ready||!coaching?.canReassess();
  setIconLabel(checkIdea,'retry',reconnect?'Reconnect chat':'Check my idea');
  buildGuidance.hidden=!creating||!!s.gameArt?.pins.length||(!buildReason.textContent&&checkIdea.hidden);
 }
 const activeActions=new Set<Promise<void>>();let actionGeneration=0;
 function act(action:()=>void|Promise<void>){const actor=owner(),generation=++actionGeneration;try{const result=action();const pending=Promise.resolve(result).catch(error=>{if(owner()===actor&&generation===actionGeneration)status((error as Error).message,true);}).finally(()=>activeActions.delete(pending));activeActions.add(pending);}catch(error){if(owner()===actor&&generation===actionGeneration)status((error as Error).message,true);}}
 async function flushForCapture(){await Promise.all([...activeActions]);await flushDraft();}
 function status(text:string,error=false){const target=route==='studio'?$('studioStatus'):globalStatus;target.textContent=text;target.classList.toggle('is-error',error);target.setAttribute('role',error?'alert':'status');}
 function sameView(s:StudioSession,at=epoch){return at===epoch&&owner()===s.owner&&activeId===s.id&&route==='studio';}
 function canChangePlay(s:StudioSession,at=epoch){if(!sameView(s,at))return false;if(guardMath())return false;return true;}
 async function message(s:StudioSession,role:'child'|'helper'|'reflection',text:string){
  (await notebook.message(s.id,s.owner,role,text));
  if(activeId===s.id&&owner()===s.owner){
   renderConversation();
   // Immediately reveal the child's message; do not leave the first idea
   // hidden while the model or local helper is still working.
   if(role==='child'&&s.game==='new')render();
  }
 }
 let draftWrites=0;
 function draftPending(){if(draftWrites)return true;if(!activeId)return false;try{return current().draft!==$<HTMLTextAreaElement>('studioPrompt').value;}catch{return true;}}
 async function flushDraft(){
  clearTimeout(draftTimer);await notebookReady;await compoundTail.catch(()=>{});await notebook.whenIdle();if(!activeId)return;const s=current(),text=$<HTMLTextAreaElement>('studioPrompt').value,at=epoch;draftWrites++;
  try{await coaching?.flushDrafts();if(s.draft!==text)await notebook.update(s.id,s.owner,x=>{x.draft=text;});if(sameView(s,at)&&$<HTMLTextAreaElement>('studioPrompt').value===text)$('studioDraftStatus').textContent='Saved on this device';}
  catch(error){if(sameView(s,at)){$('studioDraftStatus').textContent='Could not save. Keep this page open.';$('studioStorage').textContent='Could not save — keep this page open';}throw error;}
  finally{draftWrites--;}
 }
 async function setTab(tab:'game'|'talk'|'versions'){
  const authorized=creationAction();
  if(tab!=='game'&&guardMath())return false;
  if(tab==='talk'&&young()){handOff();return false;}
  if(tab!=='talk'){stopSpeech();handoff.close();}
  if(tab!=='game'){
   ++viewIntent;(await flushDraft());if(tab==='talk'&&!authorized())return false;
   if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}
  }
  panel=tab;if(tab==='talk'){clearRewardCelebration();document.getElementById('jems-delight-host')?.replaceChildren();}document.body.classList.toggle('studio-designing',tab==='talk');
  $('page-studio').querySelector('.studio-workspace')!.setAttribute('data-mobile-panel',tab);
  document.querySelectorAll('[data-studio-tab]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.studioTab===tab)));
  if(tab==='versions'){$('studioVersions').hidden=false;renderVersions();focusView($('studioVersionsTitle'));}else $('studioVersions').hidden=true;
  if(tab==='talk'){renderConversation();focusView($('studioPromptLabel'));void privateSpeech?.refresh();}
  refreshStudioGuide();refreshNotifications();
  return true;
 }
 function showStudio(){
  document.body.classList.remove('studio-first-visit');closeJourneyMap();
  hideJourney();rewardsPage.hide();FG.problemSolving?.close();
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));page.classList.remove('hidden');route='studio';
  setActiveNav(activeId&&current().game==='new'?'studioNavCreate':'studioNavHome');globalStatus.textContent='';
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
  if(!scene.childElementCount){const art=el('img','jems-paused-art') as HTMLImageElement;art.src='./jems-art/character_spark_rest.webp';art.alt='';art.width=1254;art.height=1254;art.decoding='async';art.setAttribute('aria-hidden','true');scene.append(art);}
  caption.append(el('strong','',name),el('p','','Your game is waiting. Your construction is saved; action games start a new round.'));const back=iconEl('button','studio-button studio-primary','play','Back to this game');back.id='studioReturnToPlay';back.onclick=()=>act(playViewed);caption.append(back);
  pausedPreview.append(scene,caption);pausedPreview.hidden=false;
 }
 function disposeGame(keepScene=false){
  playView.leave();
  if(!keepScene)waitProject=null;
  if(keepScene&&(mounted||iframe))capturePausedPreview();else clearPausedPreview();
  if(!keepScene){pausedForTools=false;$('studioHelpPanel').hidden=true;}
  ++epoch;previewLearning?.dispose();previewLearning=null;FG.learning.dispose();iframe?.remove();iframe=null;previewChannel='';previewArtifact='';previewOwner='';
  // The original host cleans listeners, timers, audio and pending math callbacks.
  if(mounted){FG.app.page('home');mounted=false;}
  nativeStage.classList.add('hidden');
  // Saved remixes also use this host outside Studio. Return it after unmount so
  // their explicit Play cannot inherit a hidden Studio ancestor or its chrome.
  if(nativeStage.parentElement===$('studioGameHost')){
   nativeStageHome.after(nativeStage);nativeStage.classList.add('page');nativeStage.classList.remove('studio-native-game');
  }
  $('studioRemoteHost').replaceChildren();$('studioRemoteHost').hidden=true;
 }
 function updateCreationNote(){
  const note=$('studioCreationNote');if(!note)return;
  note.textContent=configReady&&builderReadiness!=='available'&&builderReadiness!=='checking'?builderReadiness==='not-configured'?'Building is offline. You can still save your idea.':builderReadinessCopy(builderReadiness):'';
  welcome.update(!welcome.element.hidden,'',{ownerId:owner(),character:notebook.avatar(owner())});
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
 async function openPractice(subject?:'math'|'language'){
  if(guardMath())return;stopSpeech();(await flushDraft());(await FG.creation?.flush());
  // The existing learning host enforces the grown-up's allowed subject choices.
  if(subject&&FG.learning.subject!==subject)FG.learning.setSubject(subject);
  refreshLearningChoice();hideJourney();disposeGame();FG.app.page('lab');route='other';if(!FG.learning.active)focusView($('jemsPowersTitle'));
 }
 async function openRewardActivity(activity:RewardsActivity){
  if(activity==='making'){(await newIdea());return;}
  if(activity==='coding'){
   if(FG.creation?.openChallenges)(await FG.creation.openChallenges());else status('Creative Studio is still opening. Try again in a moment.');
   return;
  }
  (await openPractice(activity));
 }
 async function refreshServiceReadiness(){
  if(remote.mode!=='remote'||!readinessPageActive)return;
  cancelReadiness();const request=new AbortController();readinessRequest=request;
  const actor=owner(),at=epoch;
  // Public configuration merely selects URLs; only an authenticated server
  // check can distinguish an available service, session failure and allowance.
  const check=async(path:string)=>{
   const response=await familyFetch(remote.apiBaseUrl!,path,{credentials:'include',cache:'no-store',signal:request.signal});
   if(!response.ok)throw Error(response.status===401?'UNAUTHENTICATED':response.status===403?'FORBIDDEN':'SERVICE_UNAVAILABLE');
   return response.json();
  };
  const [coach,builder]=await Promise.allSettled([check('/v1/coach/status'),check('/v1/builder/status')]);
  if(request.signal.aborted||!readinessPageActive||readinessRequest!==request||actor!==owner()||at!==epoch)return;
  readinessRequest=undefined;
  if(coach.status==='fulfilled'){
   // A healthy route cannot erase a failed model turn or certify a live reply.
   if(!coach.value?.available)coachConnection='unavailable';
   else if(!['connected','limited'].includes(coachConnection))coachConnection='available';
  }
  else coachConnection=coach.reason instanceof Error&&coach.reason.message==='UNAUTHENTICATED'?'sign-in':'unavailable';
  if(builder.status==='fulfilled')builderReadiness=builder.value?.available?'available':builder.value?.reason==='ALLOWANCE_REQUIRED'?'allowance-required':'unavailable';
  else builderReadiness=builder.reason instanceof Error&&builder.reason.message==='UNAUTHENTICATED'?'sign-in':'unverified';
  if(route==='library')updateCreationNote();else if(activeId)render();
 }
 function savedGumVersion(s:StudioSession|NotebookCard):number|null{
  if(s.game!=='gum'||!s.projectId||s.remoteId)return null;
  try{
   const version=games.cachedRevision(s.projectId,s.owner)?.config.qualityVersion;
   return typeof version==='number'?version:0;
  }catch{return null;}
 }
 function earlierGumWorkshop(s:StudioSession|NotebookCard):string|null{
  const version=savedGumVersion(s);
  return version===2?'Sticker workshop':version===1?'Machine workshop':version===0?'Earlier workshop':null;
 }
 function refreshEarlyJourney(){
  const early=young();document.body.classList.toggle('early-journey',early);
  const title=document.querySelector('#studioNew strong'),copy=document.querySelector('#studioNew small');
  if(title)title.textContent=early?FAMILY_CREATION_LABEL:'Invent a game';
  if(copy)copy.textContent=early?'Invite your grown-up':'Start with your own idea';
  for(const [id,label] of [['studioNavCreate','Create'],['studioMenuCreate','Invent a game']]){
    const control=document.getElementById(id);if(control)setIconLabel(control,early?'parent':'add',early?FAMILY_CREATION_LABEL:label);
  }
 }
 let libraryRender=0;
 function renderLibrary(){const actor=owner();void renderLibraryAsync().catch(error=>{if(owner()===actor&&route==='library')status((error as Error).message,true);});}
 async function renderLibraryAsync(){
  const requested=++libraryRender,capturedOwner=owner();const projects=await games.list(capturedOwner);
  for(const session of notebook.list(capturedOwner).filter(s=>s.game==='gum'&&s.projectId&&!s.remoteId&&projects.some(project=>project.id===s.projectId)))await games.revision(session.projectId!,capturedOwner);
  if(requested!==libraryRender||owner()!==capturedOwner)return;
  refreshEarlyJourney();
  refreshLearningChoice();
  let entries=notebook.list(owner());const box=$('studioLibrary');box.replaceChildren();
  // Import references to existing local remixes without copying or migrating their data.
  const unlisted=projects.filter(p=>!entries.some(s=>s.projectId===p.id));
  let importFailure='';
  for(const p of unlisted){
   if(!notebook.capacity().available)break;
   try{await notebook.create(capturedOwner,p.game,p.name,p.id);if(owner()!==capturedOwner)return;entries=notebook.list(capturedOwner);}
   catch(error){importFailure=error instanceof Error?error.message:'Could not add this saved game to the notebook.';break;}
  }
  if(requested!==libraryRender||owner()!==capturedOwner)return;
  const capacity=notebook.capacity();
  let capacityNotice=$('studioNotebookCapacity');
  if(!capacityNotice){capacityNotice=el('div','studio-capacity-notice');capacityNotice.id='studioNotebookCapacity';$('studioSavedSection').before(capacityNotice);}
  capacityNotice.hidden=capacity.available>0&&!importFailure;
  capacityNotice.textContent=importFailure||(!capacity.available?'Your notebook is full. Open a saved jem to keep working. Putting it away keeps it saved.':'');
  if(!capacity.available){const detail=el('details');detail.append(el('summary','','Saved space'),el('p','',`${capacity.retained} of ${capacity.limit} spaces: ${capacity.active} open jems, ${capacity.archived} put-away jems and ${capacity.chapters} earlier chat pages. They all count toward saved space.`));capacityNotice.append(detail);}
  if((!capacity.available||importFailure)&&unlisted.some(p=>!entries.some(s=>s.projectId===p.id))){const openRemixes=el('button','studio-button','Open saved remixes') as HTMLButtonElement;openRemixes.type='button';openRemixes.onclick=()=>act(openSavedIdeas);capacityNotice.append(openRemixes);}
  renderHomeContinuation(entries,notificationItems(entries));
  const saved=entries.filter(s=>!s.archived&&(!s.playOnly||s.experimentCount||s.hasCandidate||earlierGumWorkshop(s)||isRetiredStarter(s.game)&&s.meaningfulCreation));
  renderHomeProgress();
  if(!saved.length){const empty=el('div','jems-personal-empty');const art=el('img') as HTMLImageElement;art.src='./jems-art/spot_first_idea.webp';art.alt='';empty.append(art,el('p','','Your own inventions will join these jems.'));const make=iconEl('button','studio-button','add','Invent a game') as HTMLButtonElement;make.type='button';make.onclick=()=>act(newIdea);empty.append(make);box.append(empty);}
  const archived=entries.filter(s=>s.archived);
  $('studioSavedSection').hidden=false;
  $('studioStarterTitle').textContent='Ready to Play jems';
  saved.forEach(s=>{
   const card=el('article','studio-library-card studio-saved-card');card.setAttribute('data-session',s.id);
   const workshop=earlierGumWorkshop(s);
   const state:'building'|'ready'|'playable'|'idea'=busy(s)?'building':s.readyExperiment||s.hasCandidate?'ready':s.projectId||s.remoteId?'playable':'idea';
   const label={building:'Working on your idea',ready:'A test is ready to try',playable:'Ready to play',idea:'Idea · not built yet'}[state];
   const badge={building:'Tools at work',ready:'Test ready',playable:'Playable jem',idea:'Your idea'}[state];
   card.dataset.jemsState=state;
   const openButton=el('button','studio-saved-open') as HTMLButtonElement;
   openButton.type='button';openButton.setAttribute('aria-label','Open '+s.name+(workshop?' · '+workshop:''));
   const cardAction=state==='ready'?s.projectId||s.remoteId?'Try my change':'Play my game':state==='idea'?'Open my idea':'Open my game';
   openButton.append(el('span','jems-project-badge',workshop||badge),el('span','studio-card-icon',icon[s.game]),el('span','studio-card-name',s.name),el('span','studio-card-state',label),iconEl('span','studio-card-link','arrow',cardAction));
   const stage=s.gemStage;
    if(stage!=='none'){
     const gemLabel=el('span','jems-gem-status');
     const gemArt=createJourneyGem(stageNumber(stage));
     gemLabel.append(gemArt,el('span','',GEM_STAGE_LABELS[stage]));openButton.append(gemLabel);
    }
    openButton.onclick=()=>act(()=>state==='ready'?openReadySession(s.id,s.owner):open(s.id));
   const putAway=el('button','studio-put-away',busy(s)?'Stop build first':'Put away') as HTMLButtonElement;
   putAway.type='button';putAway.disabled=busy(s);
   putAway.setAttribute('aria-label',busy(s)?'Stop the build before putting away '+s.name:'Put away '+s.name);
   putAway.title=busy(s)?'Stop the build in Notifications first':'Put this jem away without deleting it';
   putAway.onclick=()=>act(async ()=>{(await notebook.archive(s.id,s.owner));renderLibrary();});
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
    restore.onclick=()=>act(async ()=>{(await notebook.unarchive(s.id,s.owner));renderLibrary();});
    row.append(restore);list.append(row);
   }
   details.append(list);archivedBox.append(details);
  }
  refreshNotifications();
  const starters=$('studioStarters'),originalGames=$('studioOriginals');starters.replaceChildren();originalGames.replaceChildren();
  const descriptions:Record<GameId,string>={
   gum:'Build wild machines with bubble gum.',hill:'Race over hills in a junkyard ride.',
   buckets:'Pick a bucket. Dodge the splat!',dragon:'Bounce fireballs back at a dragon.',
   moon:'Chase donuts through moonlight.',robot:'Guide your robot through tricky routes.',
   factory:'A little polish. A whole lot of sparkle!',mining:'Collect Jems. Bank them. Hold on!'
  };
  const companions:Partial<Record<GameId,string>>={gum:'🫧',hill:'⚙️',buckets:'🍅',dragon:'🛡️',factory:'✨'};
  const worldLabels:Partial<Record<GameId,string>>={gum:'BUILD',hill:'RACE',buckets:'SURPRISE',dragon:'DRAGON',factory:'MAKE IT SPARKLE'};
  const worldScenes:Partial<Record<GameId,string>>={
   buckets:'./jems-world-buckets.svg',dragon:'./jems-world-dragon.svg',
   moon:'./jems-world-moon.svg',robot:'./jems-world-robot.svg',factory:'./gem-factory-workshop.webp'
  };
  [...PREMADE_GAMES,...ORIGINAL_GAMES].forEach(game=>{
   const b=el('button',`studio-library-card studio-starter ${game}`) as HTMLButtonElement;
   b.type='button';b.setAttribute('data-starter',game);
   const art=el('span',`studio-game-art studio-art-${game}`);art.setAttribute('aria-hidden','true');
   if(game==='mining'){
    art.classList.add('studio-mining-preview');
    art.innerHTML='<img class="studio-mining-sky" src="./art/mind-your-jems/scene-sky.webp" alt=""><span class="studio-mining-rock"><img src="./art/mind-your-jems/rock-expressions.webp" alt=""></span><span class="studio-mining-miner"><img src="./art/mind-your-jems/miner-poses.webp" alt=""></span><img class="studio-mining-cart" src="./art/mind-your-jems/cart-empty.webp" alt="">';
   }
   else if(game==='gum'||game==='hill'){const canvas=document.createElement('canvas');canvas.className='quality-card-art';canvas.dataset.qualityCard=game;art.append(canvas);}
   else {
    const image=el('img','jems-world-scene') as HTMLImageElement;
    image.src=worldScenes[game]!;image.alt='';image.setAttribute('aria-hidden','true');
    art.append(image,el('span','studio-art-halo'),el('span','studio-art-symbol',icon[game]),el('span','studio-art-companion',companions[game]));
   }
   if(worldLabels[game])art.append(el('span','jems-world-chip',worldLabels[game]));
   const info=el('span','studio-card-info');
   info.append(el('span','studio-card-name',names[game]),el('span','studio-card-state',descriptions[game]),iconEl('span','studio-card-link','play','Play'));
   b.append(art,info);b.onclick=()=>act(()=>start(game));
   (ORIGINAL_GAMES.includes(game)?originalGames:starters).append(b);
  });installQualityCards();updateCreationNote();refreshWelcome();
 }
 async function home(){if(document.body.classList.contains('creation-open'))welcomeArt=null;stopSpeech();(await flushDraft());handoff.close();closeJourneyMap();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));library.classList.remove('hidden');route='library';renderLibrary();setActiveNav('studioNavHome');window.scrollTo(0,0);focusView(welcome.element.hidden?$('studioLibraryTitle'):$('studioWelcomeTitle'));}
 async function homeFromNavigation(){
  // The first invitation has no competing Explore action. After choosing a
  // character, an intentional Home action can still open the ordinary library.
  if(route==='library'&&!welcome.element.hidden&&notebook.avatar(owner()))(await notebook.dismissWelcome(owner()));
  (await home());
 }
 async function openSavedIdeas(){
  if(guardMath())return;stopSpeech();(await flushDraft());(await FG.creation?.flush());hideJourney();
  $<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('creations');route='other';
  document.body.classList.remove('studio-designing');setActiveNav('studioNavHome');focusView(collectionTitle);
 }
 async function start(game:GameId){
  const startingOwner=owner();for(const prior of notebook.list(startingOwner).filter(s=>s.game===game&&s.projectId&&!s.remoteId))await games.revision(prior.projectId!,startingOwner);if(owner()!==startingOwner)return;
  // The current Gum card opens the assembly workshop. Earlier starter sessions
  // remain unchanged and visible in My jems, with their own saved engine.
  const existing=notebook.list(owner()).find(s=>s.game===game&&s.playOnly&&(game!=='gum'||savedGumVersion(s)===3));if(existing)return open(existing.id);
  const s=(await saveLocalStudioProject(profileStorage(localStorage),FG,owner(),(stagedGames,stagedNotebook)=>{
   const p=stagedGames.create(owner(),game,`My ${names[game]}`,defaults(game,FG.store.current().remixes?.[game]||'classic'));
   return stagedNotebook.create(owner(),game,p.name,p.id,{playOnly:true,message:'Play first. When you want to test an idea, your original game stays safe.'});
  },notifyRewardSourceSaved));return open(s.id);
 }
 async function leaveCreationForStudio(){
  if(guardMath())return false;
  const creationPage=document.getElementById('page-creation');
  if(!creationPage||creationPage.classList.contains('hidden'))return true;
  // Save the scene before changing Studio selection. The normal page event
  // stops its player, recording and checkpoint clock; hiding DOM alone cannot.
  (await creation.flush());FG.app.page('home');return true;
 }
 async function newIdea(){
  const authorized=creationAction();if(!(await leaveCreationForStudio()))return;if(!authorized()){if(young())handOff();return;}await flushDraft();if(!authorized())return;
  const s=await saveLocalStudioProject(profileStorage(localStorage),FG,owner(),(_games,book)=>{if(!authorized())throw Error('The guided creation session ended. Your saved work is still here.');return book.create(owner(),'new','My new idea',null,{creationStandard:2});},notifyRewardSourceSaved);
  if(authorized())return open(s.id);
 }
 async function open(id:string,autoPlay=true){
  const authorized=creationAction();
  if(!(await leaveCreationForStudio()))return;
  await flushDraft();const requested=await notebook.load(id,owner());
  const needsGuidance=requested.game==='new'&&!requested.projectId&&!requested.remoteId&&!requested.candidate;
  if(needsGuidance&&!authorized()){if(young())handOff();return;}
  stopSpeech();handoff.close();moreChoices.open=false;disposeGame();(await notebook.select(id,owner()));if(needsGuidance&&!authorized())return;activeId=id;keptInThisView=null;reflecting=false;lastOutcome=null;showing='working';status('');
  const s=current();if(s.candidate&&!s.experiments?.some(e=>e.id===s.candidate!.id))(await notebook.saveExperiment(s.id,s.owner,s.candidate,[],'tune','helper'));(await coaching?.openSession());if(needsGuidance&&!authorized())return;$<HTMLTextAreaElement>('studioPrompt').value=s.draft;globalStatus.textContent='';$<HTMLDetailsElement>('studioMore').open=false;
  const playIntent=viewIntent;showStudio();render();(await setTab('game'));if(playIntent!==viewIntent)return;focusView($('studioTitle'));
  if(autoPlay){if(s.projectId||s.remoteId)await playWorking(playIntent);else if(s.candidate)await playCandidate(playIntent);else if(readyExperiment(s))await openReadySession(s.id,s.owner);else{$('studioEmpty').hidden=false;(await setTab('talk'));}}
  if(remote.mode==='remote'&&!clients.has(s.id)&&(s.pendingSubmission?.api===remote.apiBaseUrl||s.job?.api===remote.apiBaseUrl&&(busy(s)||needsReadyRecovery(s))))resume(s);
 }
 function renderConversation(){
  if(!activeId)return;const s=current(),box=$('studioMessages');
  const atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  const messages=visibleConversation(s.messages).filter(m=>!(s.game==='new'&&m.role==='helper'&&m.text.startsWith('Tell jems what you imagine. One sentence is enough.')));
  voice?.reply(messages.filter(m=>m.role==='helper').at(-1)?.text||'Tell me your game idea. What would you like to make?');
  const signature=JSON.stringify(messages.map(m=>[m.id,m.text]));
  if(box.dataset.session===s.id&&box.dataset.signature===signature)return;
  const sameSession=box.dataset.session===s.id,earlierWasOpen=sameSession&&box.querySelector<HTMLDetailsElement>('.studio-earlier-messages')?.open;
  conversationReaders.forEach(reader=>reader.dispose());conversationReaders=[];
  box.replaceChildren();box.dataset.session=s.id;box.dataset.signature=signature;
  // An onboarding greeting is presentation only: never a child choice, model instruction, or Build request.
  if(s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate&&!messages.some(m=>m.role==='child')){
   const greeting=el('div','studio-message helper studio-coach-welcome');
   greeting.setAttribute('aria-label','jems');
   greeting.append(el('p','',"Hey, I'm jems! Tell me the game you're imagining."),
    el('p','',"I'll ask a few fun questions so we can make it look and play the way you want."));
   box.append(greeting);
  }
  const earlier=el('details','studio-earlier-messages') as HTMLDetailsElement;
  earlier.append(el('summary','','Earlier ideas'));earlier.open=!!earlierWasOpen;
  if(messages.length>4)box.append(earlier);
  for(const [index,m] of messages.entries()){
   const article=el('div',`studio-message ${m.role}`);article.dataset.message=m.id;
   article.setAttribute('aria-label',m.role==='child'?'You':m.role==='reflection'?'Your observation':'jems');
   const text=m.role==='helper'?helperPreview(m.text):{lead:m.text,question:'',more:''};
   article.append(el('p','',text.lead));
   if(text.question)article.append(el('p','studio-chat-question',text.question));
   if(text.more){const more=el('details','studio-message-more');more.append(el('summary','','More'),el('p','',text.more));article.append(more);}
   if(m.role==='helper'){const reader=createReadAloudControl({text:()=>m.text,buttonClass:'studio-button',canRead:()=>route==='studio'&&panel==='talk'&&!FG.learning.active&&!localSpeechActive&&!privateSpeech?.active()&&activeId===s.id&&owner()===s.owner});conversationReaders.push(reader);article.append(reader.element);}
   (index<messages.length-4?earlier:box).append(article);
  }
  if(!sameSession||atEnd)box.scrollTop=box.scrollHeight;
 }
 let sessionRender=0;
 function render(){const actor=owner(),view=activeId;void renderAsync().catch(error=>{if(owner()===actor&&activeId===view)status((error as Error).message,true);});}
 async function renderAsync(){
  if(!activeId)return;const requested=++sessionRender,s=current(),at=epoch,working=s.projectId?(saving?games.cachedRevision(s.projectId,s.owner):(await games.revision(s.projectId,s.owner))):null;
  if(requested!==sessionRender||!sameView(s,at))return;refreshNotifications();
  refreshGameSubject();FG.learning.modeControl($('studioMathMode'),s.id);$('studioTitle').textContent=s.name;$('studioStorage').textContent=s.remoteId||s.candidate?.remoteId?'Private family game · local conversation':'Saved on this device';
  renderGemBadge(s);
  const sceneAction=$('studioMakeScene');
  if(sceneAction)setIconLabel(sceneAction,'grid',s.remoteId||s.candidate?.remoteId||['dragon','buckets','robot'].includes(s.game)&&s.projectId?'Animate & code':'Start a separate scene');
  const n=working?.label??'';
  $('studioVersion').textContent=showing==='candidate'?((s.experiments||[]).find(e=>e.id===s.candidate?.id)?.label||'Preview')+' · my main game is safe':showing==='history'?'Trying an earlier version':working?`My main game · ${n}`:s.remoteId?'My main game':'My idea · ready to imagine';
  $('studioPreviewNotice').hidden=showing==='working';
  const creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  const hasIdea=creating&&s.messages.some(m=>m.role==='child');
  page.classList.toggle('studio-creating',creating);
  artEntries?.setCreating(creating);showArtPlan(s);
  page.classList.toggle('studio-idea-unstarted',creating&&!hasIdea);
  page.classList.toggle('studio-idea-started',creating&&hasIdea);
  creationHero.hidden=!creating||hasIdea;
  ideaSparks.hidden=!creating;
  if(!creating)ideaSparks.open=false;
  if(creating){$('studioTitle').textContent='Invent a game';if(doneForNow.parentElement!==extraTools)extraTools.append(doneForNow);}
  else if(doneForNow.parentElement!==page.querySelector('.studio-heading'))page.querySelector('.studio-heading')!.append(doneForNow);
  $('studioAvailability').textContent=coachConnectionCopy(configReady?coachConnection:'checking');
  connectionHint.textContent=!configReady||coachConnection==='checking'?'Checking chat…':coachConnection==='sign-in'?'Chat needs a grown-up to reconnect.':['limited','unavailable'].includes(coachConnection)?'Chat is disconnected. Your idea is saved.':'';
  connectionHint.hidden=!connectionHint.textContent;
  workshopNote.textContent=builderReadinessCopy(configReady?builderReadiness:'checking');
  const progress=buildProgressCopy(s.job?{status:s.job.status,phase:s.job.phase}:undefined,sending.has(s.id),unknownJobs.has(s.id)||Boolean(s.pendingSubmission)||needsReadyRecovery(s));
  progressBanner.hidden=!progress;
  arcadeButton.hidden=!busy(s);
  progressBanner.dataset.phase=progress?.phase||'';
  progressTitle.textContent=progress?.title||'';
  progressDetails.textContent=progress?.description||'';
  $('studioConversation').dataset.helperState=s.design?.paused||progress?.phase==='cancelled'?'rest':'wave';
  
  $<HTMLButtonElement>('studioPlay').disabled=!(working||s.remoteId||s.candidate);
  $<HTMLButtonElement>('studioKeep').disabled=!s.candidate||showing!=='candidate'||saving||!!s.candidate.remoteId&&!previewLearning?.ready;$('studioKeep').hidden=!s.candidate||showing!=='candidate';$('studioReady').hidden=!readyExperiment(s);setIconLabel($('studioReady'),'play',s.projectId||s.remoteId?'Try your ready test':'Play my game');$<HTMLButtonElement>('studioHelp').disabled=!(s.projectId||s.remoteId||s.candidate);setIconLabel($('studioPlay'),'play',pausedForTools?'Back to my game':'Play');
  $<HTMLButtonElement>('studioUndo').disabled=!s.candidate&&!working?.parentId&&!s.remoteId;
  $<HTMLButtonElement>('studioRedo').disabled=!!s.candidate||(!s.undone&&!working);
  copyRecovery.hidden=!s.pendingCopy;checkCopy.disabled=saving;
  $<HTMLButtonElement>('studioCopy').disabled=!(working||s.remoteId||s.candidate)||saving||!!s.pendingCopy;
  refreshBuildAction();
  const chatPage=notebook.conversationPage(s.id,s.owner);
  continueChat.hidden=chatPage.available>=4;
  const hasChatSpace=continueChat.hidden||notebook.capacity().available>0;
  continueChat.disabled=!hasChatSpace||saving||busy(s)||!!s.pendingExperiment||!!coaching?.busy()||!!s.pendingSubmission;
  chatCapacity.hidden=continueChat.hidden;
  chatCapacity.textContent=hasChatSpace?'Keep your earlier words. Continue on a new chat page.':'Your notebook is full. This chat stays saved. Open another saved jem, or ask a grown-up to export a backup.';
  $<HTMLButtonElement>('studioTalk').disabled=reflecting;
  $('studioPromptLabel').textContent=reflecting?'What did you notice?':creating?(hasIdea?'Your answer or idea':'Tell me your game idea'):'What would you like to change?';
  // The coach's saved review, not the presence of a first idea, enables Build.
  $<HTMLTextAreaElement>('studioPrompt').required=!(creating&&s.messages.some(m=>m.role==='child'));
  setIconLabel($('studioSend'),reflecting?'save':creating?'add':'arrow',reflecting?'Save thought':creating?'Build my game':'Try a change');
  $('studioReflection').hidden=!s.reflection;$('studioCancel').hidden=!busy(s);$('studioRetry').hidden=!s.pendingSubmission&&!needsReadyRecovery(s)&&(!s.job||(s.job.status!=='failed'&&!unknownJobs.has(s.id)));
  setIconLabel($('studioRetry'),s.pendingSubmission||needsReadyRecovery(s)||unknownJobs.has(s.id)?'clock':'retry',s.pendingSubmission||needsReadyRecovery(s)||unknownJobs.has(s.id)?'Check build status':'Try build again');
  const retryBlock=retryBlocks.get(s.id);
  $<HTMLButtonElement>('studioRetry').disabled=sending.has(s.id)||saving||!s.pendingSubmission&&!needsReadyRecovery(s)&&!unknownJobs.has(s.id)&&!!retryBlock&&retryBlock.jobId===s.job?.id;
  $('studioRetry').title=retryBlock&&retryBlock.jobId===s.job?.id?retryBlock.reason:'';
  const suggestions=$('studioSuggestions');suggestions.replaceChildren();
  page.classList.toggle('studio-has-build',!!progress);
  renderConversation();refreshStudioGuide();if(panel==='versions'&&!document.activeElement?.closest('#experimentShelf'))coaching?.renderShelf();
 }
 function mountNative(){
  pausedForTools=false;$<HTMLDetailsElement>('studioMore').open=false;$('studioEmpty').hidden=true;$('studioRemoteHost').hidden=true;
  if(nativeStage.parentElement!==$('studioGameHost')){$('studioGameHost').append(nativeStage);nativeStage.classList.remove('page');nativeStage.classList.add('studio-native-game');}
  nativeStage.classList.remove('hidden');
 }
 async function announceOutcome(s:StudioSession,description:string,observed=false,playedTest:string|null=null){
  if(owner()!==s.owner||activeId!==s.id)return;
  if(description===lastOutcome&&!observed)return;
  // Record the actual play once. Reflection waits for learning and stays optional.
  if(!observed){try{(await coaching?.afterOutcome(description,playedTest));observed=true;}catch(error){status((error as Error).message,true);return;}}
  if(FG.learning.active){const at=epoch;const pending=async ()=>{if(!FG.learning.active){window.removeEventListener('factory-learning-active',pending);if(at===epoch)(await announceOutcome(s,description,true,playedTest));}};window.addEventListener('factory-learning-active',pending);return;}
  try{
   const design=notebook.get(s.id,s.owner).design;
   if(!design?.paused){const fun=design?.plan.fun?.value;(await message(s,'helper',description+(fun?' You wanted: '+fun+'.':'')+' What was fun or tricky? You can share a thought or keep playing.'));(await notebook.update(s.id,s.owner,x=>{x.reflection=true;}));render();}
   lastOutcome=description;
  }catch(error){status((error as Error).message,true);}
 }
 async function playLocal(s:StudioSession,config:Mechanics,key:string,view:typeof showing,revisionId?:string,intent=viewIntent){
  // Change/Help can be chosen while either indexed revision read is pending,
  // before a mounted game exists for disposal to advance the runtime epoch.
  if(intent!==viewIntent||!canChangePlay(s))return false;
  const playedTest=view==='candidate'?s.candidate?.id||s.selectedTest||null:null;
  // Returning from shared Help/Change keeps the originating build reachable.
  // Opening another session or leaving the player already clears this binding.
  const waiting=s.game==='mining'&&waitProject?.owner===s.owner?waitProject:null;
  disposeGame();waitProject=waiting;lastOutcome=null;viewedRevisionId=revisionId||null;remoteViewedId=null;const generation=epoch;showing=view;mountNative();
  const boundRevision=s.projectId?(await games.revision(s.projectId,s.owner,revisionId??(view==='candidate'?s.candidate?.baseId??undefined:undefined))):null;
  if(intent!==viewIntent||generation!==epoch||owner()!==s.owner||activeId!==s.id)return false;
  FG.app.openGame(s.game,{config,stateKey:key,drawingRigId:boundRevision?.drawingRigId??null,projectId:s.id,onOutcome:async(outcome:PlayOutcome)=>{
    if(generation!==epoch||s.owner!==owner()||activeId!==s.id)return;
    if(revisionId&&s.projectId)try{(await games.record(s.owner,s.projectId,revisionId,outcome));}catch(error){status((error as Error).message,true);}
    if(generation!==epoch||s.owner!==owner()||activeId!==s.id)return;
    (await announceOutcome(s,outcome.description||`You ${outcome.won?'finished':'tried'} this round.`,false,playedTest));
  }});
  mounted=true;showStudio();render();(await setTab('game'));if(intent!==viewIntent||!sameView(s,generation))return false;enterPlayView();status(view==='candidate'?'Try your test. Your main game has not changed.':view==='history'?'Playing an earlier version for comparison.':'Your main game. Choose Change my game whenever you have an idea.');return true;
 }
 async function playWorking(intent=viewIntent){const s=current();if(intent!==viewIntent||!canChangePlay(s))return;if(s.remoteId){await showRemote(s,s.remoteId,'working');return;}if(!s.projectId){disposeGame();showing='working';$('studioEmpty').hidden=false;showStudio();render();return;}const r=(await games.revision(s.projectId,s.owner));await playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'working',r.id,intent);}
 async function playCandidate(intent=viewIntent){const s=current(),c=s.candidate;if(intent!==viewIntent||!canChangePlay(s))return;if(!c)return playWorking(intent);if(c.remoteId){await showRemote(s,c.remoteId,'candidate');}else await playLocal(s,validateConfig(s.game as GameId,c.config),c.id,'candidate',undefined,intent);}
 async function playViewed(){
  const s=current(),intent=viewIntent;if(!canChangePlay(s))return;
  stopSpeech();
  if(showing==='history'){
   if(remoteViewedId){await showRemote(s,remoteViewedId);return;}
   if(s.projectId&&viewedRevisionId){const r=(await games.revision(s.projectId,s.owner,viewedRevisionId));await playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'history',r.id,intent);return;}
  }
  if(showing==='candidate'&&s.candidate)await playCandidate(intent);else await playWorking(intent);
 }
 async function showHelp(){
  const s=current();if(guardMath())return;const helpIntent=++viewIntent;
  if(mounted&&FG.runtime.showHelp?.())return;
  if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;}
  const at=epoch; // Disposing the current player advances the view epoch.
  (await setTab('game'));render();
  const touch=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
  const native=!remoteViewedId&&s.game!=='new';
  const touchHelp:Record<string,string>={mining:'Hold Left or Right to run into jems. Bring them to the bucket. Run to safety or hold on before the giant shakes; holding spills your bag.',factory:'Find the next gem in the pattern. Tap a bucket, use the glowing machines, then choose paper and send your gift!',moon:'Tap Left or Right to run, and Jump to leap over meteors.',robot:'Tap the arrows to plan a route, then Run to test it.',gum:'Tap a part to add it. Drag to move it. Choose Gum, then another part to stick them together. Choose Test machine to try it.',hill:'Hold the right pedal to drive. Hold the left pedal to brake. You can change your ride in the garage.',buckets:'Tap a bucket to choose it. Watch what happens, then try another round.',dragon:'Use the arrow buttons to move. Tap the jump button to bounce fireballs with your shield.'};
  const viewedConfig=showing==='candidate'?s.candidate?.config:s.projectId?(await games.revision(s.projectId,s.owner,showing==='history'?viewedRevisionId||undefined:undefined)).config:undefined;
  if(!sameView(s,at)||helpIntent!==viewIntent)return;
  const oldConstruction=native&&s.game==='gum'&&(viewedConfig?.qualityVersion??0)===0;
  const physicalConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===1;
  const stickerConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===2;
  const assemblyConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===3;
  $('studioHelpGoal').textContent=stickerConstruction?'Choose three stickers for your invention, then send it flying, swimming or dancing.':physicalConstruction?'Connect everyday pieces with gum. Test your machine, change it, and try again.':oldConstruction?'Build a silly invention with the pieces and gum. Try it and make a change.':native?FG.games[s.game]?.instructions||'Try your game and see what happens.':'Use the instructions and controls shown inside your game. Your saved tests stay in My tests.';
  $('studioHelpControls').textContent=assemblyConstruction?'Choose a real object, then tap the glowing +. Tap the pink gum at a join to stick the pieces together. Wiggle test checks your joins. Launch and see how far your pieces can go. Watch again or change a piece to try a different adventure. Choose Next build when you are ready.':stickerConstruction?'Choose a sticker and tap a bubble on the machine, or drag a sticker onto a bubble. Add three, then tap Make it GO!':physicalConstruction?(touch?touchHelp.gum:'Choose a part from the tray, place it on the canvas, attach parts with gum and test your machine.'):oldConstruction?'Choose a part in your build, then use the move, turn and connect controls shown below it. Try your machine and change it again.':native&&touch?touchHelp[s.game]:native?FG.games[s.game]?.controls||'Use the controls in your game.':'Tap the game first, then use its buttons or keyboard controls.';
  $('studioHelpKeyboard').textContent=assemblyConstruction?'Use Tab and Enter to choose a piece. Enter places it at the focused +. Tab to the pink gum join and press Enter to connect it. Every action also works with a tap.':stickerConstruction?'Press Tab to choose a sticker, Enter to select it, then Tab and Enter to place it on a bubble.':physicalConstruction?'Use Tab to reach parts and tools, Enter to select them, arrow keys to move a chosen part, and R to rotate it.':oldConstruction?'Use Tab and Enter to choose parts and construction controls.':'Use Tab to reach controls and Enter to choose. How a character moves depends on this game.';
  $('studioHelpPanel').hidden=false;focusView($('studioHelpTitle'));
 }
 async function submit(request?:{prompt:string;displayText?:string;compiledPlan?:boolean}){
  const authorized=creationAction();
  if(young()){handOff();return;}
  if(guardMath())return;stopSpeech();(await flushDraft());if(!authorized())return;const s=current(),typed=s.draft.trim(),started=epoch;
  let prompt=request?.prompt||typed||(s.game==='new'&&!s.remoteId?s.messages.find(m=>m.role==='child')?.text.trim()||'':'');if(!prompt)return;
  notebook.assertMessageCapacity(s.id,s.owner,reflecting?1:2);
  const consumedDraft=!request||request.compiledPlan||request.prompt.trim()===typed?s.draft:undefined;
  const clearConsumedDraft=async ()=>{
   if(consumedDraft===undefined)return;
   (await notebook.update(s.id,s.owner,x=>{if(x.draft===consumedDraft)x.draft='';}));
   if(sameView(s,started)&&$<HTMLTextAreaElement>('studioPrompt').value===consumedDraft)$<HTMLTextAreaElement>('studioPrompt').value='';
  };
  if(reflecting&&!request){
   const before=progressSnapshot(s);
   (await notebook.observe(s.id,s.owner,prompt,'child',s.design?.observations.filter(o=>o.source==='runtime').at(-1)?.experimentId||null));
   (await message(s,'reflection',prompt));(await notebook.update(s.id,s.owner,x=>{x.draft='';x.reflection=false;}));
   reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value='';
   const achievement=gemAchievement(before,notebook.get(s.id,s.owner));
   render();if(achievement){updateProfile();celebrateProgress(achievement);}return;
  }
  if(sending.has(s.id)){status('Sending the earlier request. Your ideas and game are safe.');return;}
  if(unknownJobs.has(s.id)||s.pendingSubmission||needsReadyRecovery(s)){status('The last request is not confirmed. Your new thought is saved; no second build was sent.');return;}
  const mathRequest=interpretLearningRequest(prompt,FG.learning.subject);
  if(mathRequest){(await message(s,'child',prompt));(await notebook.update(s.id,s.owner,x=>{x.reflection=false;}));if(mathRequest.kind==='required'){(await message(s,'helper',mathRequest.message));}else{FG.learning.setMode(s.id,mathRequest.mode);(await message(s,'helper',`Learning format set to ${learningFormatLabel(FG.learning.subject,mathRequest.mode)}. It applies at the next safe learning moment; your game rules and learning history stay together.`));(await clearConsumedDraft());}render();return;}
  if(s.gameArt?.pins.length){status(artBuildHold);return;}
  if(await coaching?.intercept(prompt,true))return;if(!sameView(s,started)||!authorized())return;
  const decision=coaching?.details()||{continueTest:false,parents:[],depth:'tune' as const,origin:'child' as const};
  const firstBuild=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  if(firstBuild){
   const readiness=coaching?.buildReadiness()||creationBuildReadiness(current(),current().design?.creationStandard===2?2:1);
   if(!readiness.ready){status(readiness.reason);return;}
   prompt=coaching?.buildPrompt(request?.compiledPlan?typed:request?.prompt||typed)||prompt;
   // The request contains the full agreed plan; the conversation contains only
   // the child's words. A Build gesture is already acknowledged by its handoff.
   if(!request&&typed&&!current().messages.some(m=>m.role==='child'&&m.text===typed))(await message(s,'child',typed));
  }else (await message(s,'child',request?.displayText||prompt));
  if(!authorized())return;(await notebook.update(s.id,s.owner,x=>{if(!authorized())throw Error('The guided creation session ended.');x.reflection=false;x.playOnly=false;}));
  if(s.projectId&&!s.remoteId&&!s.candidate?.remoteId){
    const working=(await games.revision(s.projectId,s.owner)),config=decision.continueTest&&s.candidate?.config?s.candidate.config:working.config;
    if(!sameView(s,started)||!authorized())return;
    const intent=interpret(s.game as GameId,config,prompt);
    if(intent.kind==='supported'){
      const before=progressSnapshot(notebook.get(s.id,s.owner));
      const c:Candidate={id:crypto.randomUUID(),baseId:decision.continueTest&&s.candidate?s.candidate.baseId:working.id,config:intent.config,prompt,summary:intent.summary};
      games.clonePlayState(s.owner,decision.continueTest&&s.candidate?s.candidate.id:working.id,c.id);
      (await notebook.saveExperiment(s.id,s.owner,c,decision.parents,decision.depth,decision.origin));if(!authorized())return;
      const achievement=gemAchievement(before,notebook.get(s.id,s.owner));if(achievement){updateProfile();celebrateProgress(achievement);}
      // Keep the concurrent AI build and its exact starting revision.
       (await clearConsumedDraft());
      (await message(s,'helper',`${intent.summary}. This is a test. Play it before choosing Make this my main game.`));await playCandidate();return;
    }
    if(intent.kind!=='generation-needed'){(await message(s,'helper',intent.message));render();return;}
  }
  if(busy(s)){status('Your game is still building. This idea is saved.');render();return;}
   if(remote.mode!=='remote'){
    status('Building is offline. Your idea is saved.',true);beginBuildHandoff(s,{phase:'unavailable'});render();return;
  }
  const chosenBase=decision.continueTest?s.candidate:null;
  const baseId=chosenBase?.remoteId||s.remoteId||(chosenBase?.config?chosenBase.id:s.projectId?(await games.revision(s.projectId,s.owner)).id:null);
  if(!sameView(s,started)||!authorized())return;
  (await notebook.update(s.id,s.owner,x=>{x.pendingExperiment={parents:decision.parents,depth:decision.depth,origin:decision.origin,baseId,prompt};}));
  if(consumedDraft!==undefined)submittedDrafts.set(s.id,consumedDraft);else submittedDrafts.delete(s.id);
  if(authorized())await build(s,prompt,decision.continueTest);
 }
 function clientFor(s:StudioSession){
  let c=clients.get(s.id);if(c)return c;
  c=new BuilderClient(remote,(job,submissionId)=>onJob(s,job,submissionId));clients.set(s.id,c);return c;
 }
 async function build(s:StudioSession,prompt:string,continueTest=false){
  const authorized=creationAction();
  if(young()){handOff();return;}
  if(notebook.get(s.id,s.owner).gameArt?.pins.length){status(artBuildHold);return;}
  sending.add(s.id);moreChoices.open=false;const identity=beginBuildHandoff(s,{phase:'sending'});render();status('Sending your idea…');
  const r=s.projectId?(await games.revision(s.projectId,s.owner)):null;
  if(!authorized()){sending.delete(s.id);return;}
  const chosen=continueTest?s.candidate:null;
  const input={gameId:s.remoteId||chosen?.remoteId?(isGeneratedRemoteKind(s.remoteKind)?'generated-module':'star-catcher'):s.game,baseRevisionId:chosen?.remoteId||s.remoteId||(chosen?.config?chosen.id:r?.id)||null,prompt,...(r&&!s.remoteId&&!chosen?.remoteId?{config:chosen?.config||r.config}:{})};
  // Request admission ends at the durable ACK, not when a game finishes building.
  // Continue status polling independently while a child plays or makes other edits.
  let submissionId:string|undefined;
  void clientFor(s).submit(input,async request=>{
   if(!authorized()||owner()!==s.owner||buildAttempts.get(s.id)?.attemptId!==identity.attemptId)throw Error('PROFILE_CHANGED');
   (await notebook.update(s.id,s.owner,x=>{
    if(!authorized())throw Error('The guided creation session ended.');
    if(x.gameArt?.pins.length)throw Error(artBuildHold);
    if(x.pendingSubmission)throw Error('UNCONFIRMED_BUILD_RESPONSE');
    x.pendingSubmission={owner:s.owner,workspace:s.id,api:remote.apiBaseUrl!,request};
   }));
   if(!authorized())throw Error('The guided creation session ended.');
   submissionId=request.clientRequestId;
  }).catch(async error=>{
   if(owner()!==s.owner||buildAttempts.get(s.id)?.attemptId!==identity.attemptId)return;
   const saved=notebook.get(s.id,s.owner);
   if(saved.job&&busy(saved)&&saved.job.api===remote.apiBaseUrl&&saved.job.id!==s.job?.id){
    unknownJobs.add(s.id);refreshNotifications();resume(saved);
    updateBuildHandoff(s,{phase:'uncertain',canPlayWhileWaiting:true,recovery:'check'});
    if(activeId===s.id&&owner()===s.owner)
     status('Connection interrupted. The builder may still be working; checking again.');
   }else{
    const code=error instanceof Error?error.message:undefined;
    const knownRejection=isKnownBuildRejection(error)||!submissionId;
    const explanation=buildErrorCopy(knownRejection?code:undefined);
    if(knownRejection&&saved.job?.id===s.job?.id){
     // No new job accepted this request. Keep the saved failed job's exact
     // experiment metadata for its retry, and leave the rejected draft alone.
     (await notebook.update(s.id,s.owner,x=>{x.pendingExperiment=s.pendingExperiment||null;if(x.pendingSubmission?.request.clientRequestId===submissionId)x.pendingSubmission=null;}));
     submittedDrafts.delete(s.id);
    }
    updateBuildHandoff(s,{phase:knownRejection?'unavailable':'uncertain',...(!knownRejection?{recovery:'check' as const}:{})});
    if(activeId===s.id&&owner()===s.owner)status(explanation,true);
   }
  }).finally(()=>{
   if(buildAttempts.get(s.id)?.attemptId===identity.attemptId)sending.delete(s.id);
   if(activeId===s.id&&owner()===s.owner)render();
  }).catch(error=>{
   if(activeId===s.id&&owner()===s.owner)status('Could not save the builder status. Your current game is safe.',true);
  });
 }
 async function recoverBuild(action:'retry'|'check'){
  if(guardMath())return;stopSpeech();(await flushDraft());const s=current();
  if(sending.has(s.id)||saving)return;
  if(s.pendingSubmission){await recoverSubmission(s,true);return;}
  if(!s.job)return;
  if(action==='retry'&&s.gameArt?.pins.length){status(artBuildHold);return;}
  if(action==='retry'&&s.job.status!=='failed')action='check';
  const retryBlock=retryBlocks.get(s.id);
  if(action==='retry'&&retryBlock?.jobId===s.job.id){status(retryBlock.reason,true);return;}
  if(remote.mode!=='remote'||s.job.api!==remote.apiBaseUrl){status('Reconnect this game’s workshop before checking its build. Your idea is saved.',true);return;}
  const identity=beginBuildHandoff(s,{phase:'checking'});
  sending.add(s.id);render();status('Checking your saved build…');
  try{
   const client=clientFor(s);
   if(action==='check'){
    const job=await client.check(s.job.id);
    if(job&&owner()===s.owner&&['queued','building','testing'].includes(job.status))resume(notebook.get(s.id,s.owner));
   }else await client.retry(s.job.id);
  }catch(error){
   if(owner()!==s.owner||buildAttempts.get(s.id)?.attemptId!==identity.attemptId)return;
   const latest=notebook.get(s.id,s.owner),code=error instanceof Error?error.message:undefined;
   const rejected=action==='retry'&&!busy(latest)&&isKnownBuildRejection(error);
   if(rejected){
    unknownJobs.delete(s.id);
    const canRetry=!['RETRY_LIMIT','NOT_FOUND','IDEMPOTENCY_CONFLICT','GAME_FORM_UNSUPPORTED','GAME_FORM_REVIEW_REQUIRED','GAME_FORM_BASE_UNVERIFIED'].includes(code||'');
    if(!canRetry)retryBlocks.set(s.id,{jobId:latest.job!.id,reason:buildErrorCopy(code,true)});
    updateBuildHandoff(s,{phase:'failed',...(canRetry?{recovery:'retry' as const}:{}),description:buildErrorCopy(code,true)});
   }else{
    unknownJobs.add(s.id);
    updateBuildHandoff(s,{phase:'uncertain',recovery:'check',canPlayWhileWaiting:busy(latest)});
   }
   if(activeId===s.id&&route==='studio')status(rejected?buildErrorCopy(code,true):'The connection interrupted our check. Check build status to find your last attempt. Your idea is safe.',true);
   refreshNotifications();
  }finally{
   if(buildAttempts.get(s.id)?.attemptId===identity.attemptId)sending.delete(s.id);
   if(owner()===s.owner&&activeId===s.id&&route==='studio')render();
  }
 }
 async function onJob(captured:StudioSession,job:JobView,submissionId?:string){
  if(owner()!==captured.owner)return;
  const prior=notebook.get(captured.id,captured.owner);
  if(prior.pendingSubmission&&prior.pendingSubmission.request.clientRequestId!==submissionId)return;
  unknownJobs.delete(captured.id);
  if(retryBlocks.get(captured.id)?.jobId!==job.jobId||job.status!=='failed')retryBlocks.delete(captured.id);
  let celebratedLevel=false;
  const phase=typeof job.phase==='string'&&/^[a-z-]{1,32}$/.test(job.phase)?job.phase:undefined;
   if(prior.pendingSubmission||prior.job?.id!==job.jobId||prior.job.status!==job.status||prior.job.revisionId!==job.revisionId||prior.job.phase!==phase)
    (await notebook.update(captured.id,captured.owner,s=>{s.job={id:job.jobId,api:remote.apiBaseUrl||'',status:job.status as PendingJob['status'],...(job.revisionId?{revisionId:job.revisionId}:{}),...(phase?{phase}:{})};if(job.status!=='ready')s.pendingSubmission=null;}));
  // A job acknowledgment ends the *submission* wait even while generation runs.
   // Unlock quick local edits only after the job ID and source revision are durable.
   if(sending.has(captured.id)){sending.delete(captured.id);}
   if(prior.pendingExperiment&&submittedDrafts.has(captured.id)){if(activeId===captured.id&&owner()===captured.owner)(await flushDraft());const submitted=submittedDrafts.get(captured.id)!;(await notebook.update(captured.id,captured.owner,s=>{if(s.draft===submitted)s.draft='';}));if(activeId===captured.id&&owner()===captured.owner&&$<HTMLTextAreaElement>('studioPrompt').value===submitted)$<HTMLTextAreaElement>('studioPrompt').value='';submittedDrafts.delete(captured.id);}
  const texts:Record<string,string>={queued:'Your request is queued.',building:'Building a separate preview…',testing:job.phase==='repairing'?'Repairing the preview…':'Testing the preview…',ready:'Your new preview is ready.',failed:'The build did not work. Your current game is safe.',cancelled:'Build cancelled. Your current game is unchanged.'};
  if(job.status==='ready'&&job.revisionId&&!prior.experiments?.some(e=>e.candidate.remoteId===job.revisionId)){
    const pending=prior.pendingExperiment;const c:Candidate={id:crypto.randomUUID(),baseId:pending?pending.baseId:null,remoteId:job.revisionId,prompt:pending?.prompt||prior.draft,summary:job.adapter==='mock'?'New test-builder preview (mock)':'New AI-built preview'};
    const before=progressSnapshot(prior);
    (await notebook.saveExperiment(captured.id,captured.owner,c,pending?.parents||[],pending?.depth||'redesign',pending?.origin||'helper',false,isRealAdapter(job.adapter)));
    if(owner()===captured.owner){const achievement=gemAchievement(before,notebook.get(captured.id,captured.owner));updateProfile();if(achievement&&!FG.learning.active){celebrateProgress(achievement);celebratedLevel=true;}}
  }
  if(job.status==='ready'&&job.revisionId&&(prior.pendingSubmission||prior.pendingExperiment))(await notebook.update(captured.id,captured.owner,s=>{s.pendingSubmission=null;s.pendingExperiment=null;}));
  const latest=notebook.get(captured.id,captured.owner);
  if(job.status!=='draft')updateBuildHandoff(captured,{phase:job.status,canPlayWhileWaiting:busy(latest),canPlayReady:!!readyExperiment(latest),...(job.status==='failed'?{...(retryBlocks.has(captured.id)?{}:{recovery:'retry' as const}),description:retryBlocks.get(captured.id)?.reason||buildErrorCopy(job.errorCode,true)}:{})});
  if(activeId===captured.id&&owner()===captured.owner&&route==='studio'){
   status(job.status==='ready'?'Your new test is saved. Choose Try your ready test when you are ready.':job.status==='failed'?buildErrorCopy(job.errorCode,true):texts[job.status]||'Your working game is safe.');render();
   // Only a confirmed new real revision earns the playable burst; never a mock or queued job.
   if(job.status==='ready'&&job.revisionId&&isRealAdapter(job.adapter)&&prior.job?.status!=='ready'&&!FG.learning.active&&!celebratedLevel)
    celebrateJem('playable','studioReady');
  }
  else if(owner()===captured.owner&&route==='library')renderLibrary();
  else if(owner()===captured.owner&&route==='journey')renderJourney();
   if(owner()===captured.owner){
    refreshNotifications();
    // A background result updates the card and badges without a second banner or a focus change.
   }
 }
 const retryTimers=new Map<string,ReturnType<typeof setTimeout>>();
 async function recoverSubmission(s:StudioSession,interactive=false){
  const pending=s.pendingSubmission;
  if(!pending||sending.has(s.id))return;
  if(remote.mode!=='remote'||pending.api!==remote.apiBaseUrl){
   if(activeId===s.id)status('Reconnect this game’s workshop to check your saved request.',true);return;
  }
  if(interactive)beginBuildHandoff(s,{phase:'checking'});
  const client=clientFor(s),isCurrent=()=>owner()===s.owner&&clients.get(s.id)===client;
  sending.add(s.id);if(activeId===s.id&&route==='studio')render();
  try{
   const job=await client.lookupSubmission(pending.request);
   if(!isCurrent())return;
   const latest=notebook.get(s.id,s.owner);
   if(job&&!latest.pendingSubmission){if(busy(latest))resume(latest);return;}
   if(latest.pendingSubmission?.request.clientRequestId!==pending.request.clientRequestId)return;
   unknownJobs.add(s.id);
   updateBuildHandoff(s,{phase:'uncertain',recovery:'check'});
   if(activeId===s.id&&route==='studio')status('Your request is still unconfirmed. Check again; your idea is saved.',true);
  }catch{
   if(!isCurrent())return;
   unknownJobs.add(s.id);updateBuildHandoff(s,{phase:'uncertain',recovery:'check'});
   if(activeId===s.id&&route==='studio')status('Could not check your request. Your idea is saved. Try checking again.',true);
  }finally{
   if(isCurrent()){
    const latest=notebook.get(s.id,s.owner);
    if(!latest.pendingSubmission||latest.pendingSubmission.request.clientRequestId===pending.request.clientRequestId)sending.delete(s.id);
    refreshNotifications();if(activeId===s.id&&route==='studio')render();
   }
  }
 }
  function resume(s:StudioSession){
   if(s.pendingSubmission){void recoverSubmission(s);return;}
   if(!s.job||remote.mode!=='remote'||s.job.api!==remote.apiBaseUrl)return;
   void clientFor(s).resume(s.job.id).catch(()=>{
    if(owner()!==s.owner)return;
    unknownJobs.add(s.id);refreshNotifications();
    updateBuildHandoff(s,{phase:'uncertain',canPlayWhileWaiting:busy(s),recovery:'check'});
     if(activeId===s.id){status('Connection interrupted. The build may still be running. We will check again.');if(route==='studio')render();}
    if(retryTimers.has(s.id))clearTimeout(retryTimers.get(s.id)!);
    retryTimers.set(s.id,setTimeout(()=>{retryTimers.delete(s.id);try{const latest=notebook.get(s.id,s.owner);if(busy(latest))resume(latest);}catch{/* original work remains */}},15000));
   });
  }
  function resumeOutstanding(){
   if(remote.mode!=='remote')return;
   for(const s of notebook.pendingSessions().filter(s=>s.pendingSubmission?.api===remote.apiBaseUrl||(busy(s)||needsReadyRecovery(s))&&s.job?.api===remote.apiBaseUrl).slice(0,8))
    if(!clients.has(s.id))resume(s);
  }
 async function showRemote(s:StudioSession,id:string,view:typeof showing=showing,selectTest?:string){
  if(!canChangePlay(s))return;
  if(FG.store.loadError)throw Error(FG.store.loadError);
  const at=epoch,intent=++viewIntent;status('Opening your chosen game…');
  let preview;try{preview=await clientFor(s).preview(id);}catch(error){if(intent!==viewIntent||!sameView(s,at))return;throw error;}
  if(intent!==viewIntent||!canChangePlay(s,at))return;
  if(selectTest)(await notebook.selectExperiment(s.id,s.owner,selectTest));
  const playedTest=view==='candidate'?(selectTest||s.experiments?.find(e=>e.candidate.remoteId===id)?.id||s.candidate?.id||null):null;
  if(playedTest&&isRealAdapter(preview.adapter)&&!s.verifiedRemoteExperiments?.includes(playedTest)){
   const before=notebook.get(s.id,s.owner),after=(await notebook.verifyRemoteExperiment(s.id,s.owner,playedTest));onSavedDesignChange(before,after);
  }
  disposeGame();lastOutcome=null;showing=view;const generation=epoch;
  (await notebook.update(s.id,s.owner,x=>{x.remoteKind=preview.kind||'star-catcher-v1';}));
  pausedForTools=false;$<HTMLDetailsElement>('studioMore').open=false;remoteViewedId=id;viewedRevisionId=null;nativeStage.classList.add('hidden');$('studioEmpty').hidden=true;const host=$('studioRemoteHost');host.hidden=false;
  iframe=document.createElement('iframe');iframe.title='Private game preview';iframe.setAttribute('sandbox','allow-scripts');iframe.referrerPolicy='no-referrer';
  previewChannel=crypto.randomUUID();previewArtifact=preview.artifactId;previewOwner=s.owner;
  host.replaceChildren(iframe);openPreviewFrame(iframe,preview,previewChannel);
  previewLearning=attachPreviewLearning(iframe,{channel:previewChannel,artifactId:previewArtifact,ownerId:s.owner,gameId:'generated',projectId:s.id,versionId:id,onReadyChange:()=>queueMicrotask(()=>{if(sameView(s,generation))render();}),onRound:async d=>(await announceOutcome(s,`You ${d.won?'finished':'tried'} that round. Score: ${d.score}.`,false,playedTest))});
  $('studioPlayNote').textContent=preview.adapter==='mock'?'Test builder (mock)—not a real AI generation.':'Private preview. Your working game stays unchanged until you keep it.';
  render();(await setTab('game'));enterPlayView();
 }
 window.addEventListener('message',event=>{
  if(!iframe||event.source!==iframe.contentWindow||previewOwner!==owner()||route!=='studio')return;
  const d=event.data;if(!d||d.type!=='factory-preview'||d.channel!==previewChannel||d.artifactId!==previewArtifact)return;
  if(!playView.active&&d.event==='ready'&&Number.isInteger(d.height)&&d.height>=300&&d.height<=1000)iframe.style.height=`${Math.max(400,d.height+12)}px`;

 });
 async function keep(){
  if(saving)return;const s=current(),c=s.candidate,at=epoch;if(!c||!canChangePlay(s,at))return;if(c.remoteId&&(!previewLearning?.ready||remoteViewedId!==c.remoteId)){status('Open this test and wait for the game before choosing it as your main game.');return;}
   const gemBefore=progressSnapshot(s);saving=true;render();
  try{
    if(c.remoteId){
     await clientFor(s).api('/v1/revisions/'+encodeURIComponent(c.remoteId)+'/keep',{});
     if(owner()!==s.owner||epoch!==at)return;
     if(s.experiments?.some(e=>e.id===c.id))(await notebook.keepExperiment(s.id,s.owner,c.id,{revisionId:c.remoteId,baseId:c.baseId,kind:'remote'}));
     else (await notebook.update(s.id,s.owner,x=>{x.remoteId=c.remoteId!;x.candidate=null;x.undone=null;}));
    }else if(s.projectId){
     const latest=(await games.revision(s.projectId,s.owner));
     if(!canChangePlay(s,at))return;
     if(latest.id!==c.baseId&&!confirm('This test started from an earlier main version. Make this whole test the new main game, without silently adding later changes?'))return;
     await saveLocalStudioProject(profileStorage(localStorage),FG,s.owner,(stagedGames,book)=>{
      const next=stagedGames.keep(s.owner,s.projectId!,latest.id,c.config!,c.prompt,s.hypothesis,c.id);
      const contentChanged=Object.entries(c.config!).some(([key,value])=>latest.config[key]!==value)||Object.keys(latest.config).some(key=>!(key in c.config!));
      if(s.experiments?.some(e=>e.id===c.id))book.keepExperiment(s.id,s.owner,c.id,{revisionId:next.id,baseId:c.baseId,kind:'local',contentChanged});
      else book.update(s.id,s.owner,x=>{x.candidate=null;x.undone=null;});
      book.message(s.id,s.owner,'helper','Kept your change. Your earlier versions are still available in Versions.');return book.get(s.id,s.owner);
     },notifyRewardSourceSaved,undefined,s.projectId);
    }else return;
    if(sameView(s,at)){showing='working';keptInThisView=s.id;status('Kept privately. Nothing was published.');updateProfile();celebrateProgress(gemAchievement(gemBefore,notebook.get(s.id,s.owner))||'kept','studioKeep');if(!FG.learning.active)await playWorking();}
  }finally{saving=false;if(activeId===s.id&&owner()===s.owner)render();}
 }
 async function undo(){
  const s=current(),at=epoch;if(!canChangePlay(s,at))return;
  if(s.candidate){(await notebook.update(s.id,s.owner,x=>{x.undone=x.candidate;x.candidate=null;}));(await message(s,'helper','Preview undone. Your working game was never overwritten.'));await playWorking();render();return;}
  if(s.remoteId){const r=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(s.remoteId)+'/undo',{});if(!sameView(s,at))return;(await notebook.update(s.id,s.owner,x=>{x.remoteId=r.revisionId;}));}
  else if(s.projectId)(await games.undo(s.owner,s.projectId));
  if(sameView(s,at)){status('Restored the earlier working version.');if(!FG.learning.active)await playWorking();render();}
 }
 async function combineTests(ids:string[]){
  const s=current();if(!canChangePlay(s))return;const tests=ids.map(id=>s.experiments?.find(e=>e.id===id));if(tests.some(e=>!e))throw Error('Choose tests from this game.');
  if(!s.projectId||tests.some(e=>!e!.candidate.config)){status('These built games need a new AI experiment. Describe which ideas to combine in the conversation; the originals will stay safe.');(await setTab('talk'));return;}
  const main=(await games.revision(s.projectId,s.owner));if(!canChangePlay(s))return;if(tests.some(e=>e!.baseId!==main.id))throw Error('These tests started from a different main version. Compare them first and choose the starting version deliberately.');
  const config={...main.config},chosen=new Map<string,number|boolean>();
  for(const e of tests)for(const [k,v] of Object.entries(e!.candidate.config!)){if(v===main.config[k])continue;if(chosen.has(k)&&chosen.get(k)!==v)throw Error('These tests choose different values for '+k+'. Decide which value you want before combining.');chosen.set(k,v);config[k]=v;}
  const checked=validateConfig(s.game as GameId,config),c:Candidate={id:crypto.randomUUID(),baseId:main.id,config:checked,prompt:'Combine '+tests.map(e=>e!.label).join(' + '),summary:tests.map(e=>e!.candidate.summary).join('; ').slice(0,2200)};
  games.clonePlayState(s.owner,main.id,c.id);(await notebook.saveExperiment(s.id,s.owner,c,ids,'redesign','child'));(await message(s,'helper','Combined only the selected differences into a new test. Your main game and the other tests are unchanged.'));await playCandidate();
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
  const main=document.createElement('td'),mainButton=iconEl('button','studio-button','play','Main game') as HTMLButtonElement;
  mainButton.type='button';mainButton.onclick=()=>act(playWorking);main.append(mainButton);actions.append(main);
  for(const e of candidates){
   const cell=document.createElement('td'),button=iconEl('button','studio-button','play',e.label) as HTMLButtonElement;
   button.type='button';button.onclick=()=>act(async()=>{
    if(!canChangePlay(s))return;
    if(e.candidate.remoteId)await showRemote(s,e.candidate.remoteId,'candidate',e.id);
    else {(await notebook.selectExperiment(s.id,s.owner,e.id));await playCandidate();}
   });cell.append(button);actions.append(cell);
  }
  body.append(actions);table.append(body);section.append(table);
  const bases=new Set(candidates.map(e=>e.baseId));
  if(bases.size>1)section.append(el('p','','These builds have different starting versions. Their results are not directly controlled comparisons.'));
  box.prepend(section);
 }
 let versionsRender=0;
 function renderVersions(){const actor=owner(),view=activeId;void renderVersionsAsync().catch(error=>{if(actor===owner()&&view===activeId)status((error as Error).message,true);});}
 async function renderVersionsAsync(){
  if(!activeId)return;const request=++versionsRender,s=current(),at=epoch,box=$('studioVersionCards');coaching?.renderShelf();box.replaceChildren();
  if(s.projectId&&!s.remoteId){
   const currentRevision=await games.revision(s.projectId,s.owner);if(request!==versionsRender||!sameView(s,at))return;
   let count=0;
   const append=async(after:string|null)=>{
    const page=await games.historyPage(s.projectId!,s.owner,after,24);if(request!==versionsRender||!sameView(s,at))return;
    box.querySelector('[data-more-versions]')?.remove();
    for(const r of page.items){
     const card=el('article','studio-version-card');card.append(el('span','jems-version-badge',r.id===currentRevision.id?'Your main version':'Saved version'),el('strong','',`Version ${++count}${r.id===currentRevision.id?' · working':''}`),el('p','',r.label));
     card.append(el('p','studio-version-detail',manifests[s.game as GameId].mechanics.map(m=>`${m.label}: ${human(r.config[m.key])}`).join(' · ')));
     const play=el('button','studio-button','Play this version');play.onclick=()=>act(async()=>{if(await playLocal(s,validateConfig(s.game as GameId,r.config),r.id,'history',r.id))status('Comparing only. Your working version has not changed.');});
     const restore=el('button','studio-button','Use this version');restore.onclick=()=>act(async()=>{
      if(!canChangePlay(s,at))return;if(current().candidate&&!confirm('Keep your saved conversation, discard the unkept preview, and use this version?'))return;
      await saveLocalStudioProject(profileStorage(localStorage),FG,s.owner,(stagedGames,book)=>{stagedGames.checkout(s.owner,s.projectId!,r.id);book.update(s.id,s.owner,x=>{x.candidate=null;});return book.get(s.id,s.owner);},notifyRewardSourceSaved,undefined,s.projectId);
      if(!sameView(s,at))return;await playWorking();renderVersions();
     });card.append(play,restore);box.append(card);
    }
    if(page.next){const more=el('button','studio-button','More saved versions') as HTMLButtonElement;more.dataset.moreVersions='true';more.onclick=()=>act(async()=>{more.disabled=true;try{await append(page.next);}finally{more.disabled=false;}});box.append(more);}
   };
   await append(null);if(request!==versionsRender||!sameView(s,at))return;
  }else if(s.remoteId){const card=el('article','studio-version-card');card.append(el('strong','','Working game'),el('p','','Kept in the private family workshop.'));const b=el('button','studio-button','Play working game');b.onclick=()=>act(playWorking);card.append(b);const compare=el('button','studio-button','Compare previous');compare.onclick=()=>act(async()=>{if(!canChangePlay(s,at))return;const c=await clientFor(s).api('/v1/revisions/'+encodeURIComponent(s.remoteId!));if(!canChangePlay(s,at))return;if(!c.parentId){status('This is the first version.');return;}await showRemote(s,c.parentId,'history');});card.append(compare);box.append(card);}
  if(s.candidate){const card=el('article','studio-version-card is-candidate');card.append(el('strong','','Unkept preview'),el('p','',s.candidate.summary));const b=el('button','studio-button studio-primary','Play preview');b.onclick=()=>act(playCandidate);card.append(b);box.append(card);}
  renderComparison(s,box);
  if(!box.children.length)box.append(el('p','','Your idea is saved. Versions appear when there is a playable game.'));
 }
 async function copyGame(name:string){
  if(saving)return;const s=current(),at=epoch;if(!canChangePlay(s,at))return;saving=true;const sourceMode=FG.learning.modeFor(s.id);render();
  try{let saved:StudioSession;
    notebook.assertCanCreate();
    const copyMode=(profile:any,copied:StudioSession)=>setMode(profile,copied.id,sourceMode);
    if(s.pendingCopy||s.remoteId||showing==='candidate'&&s.candidate?.remoteId){
      const pending=s.pendingCopy??{requestId:crypto.randomUUID(),sourceRevisionId:remoteViewedId||(showing==='candidate'?s.candidate?.remoteId:undefined)||s.remoteId!,name,api:remote.apiBaseUrl!};
      if(pending.api!==remote.apiBaseUrl)throw Error('Reconnect this game’s workshop to check its saved copy.');
      const path='/v1/revisions/'+encodeURIComponent(pending.sourceRevisionId)+'/fork';
      if(!s.pendingCopy)(await notebook.update(s.id,s.owner,x=>{x.pendingCopy=pending;}));
      // A retained intent always uses read-only reconciliation, never a replayed POST.
      const r=s.pendingCopy?await clientFor(s).api(path+'/'+encodeURIComponent(pending.requestId)):await clientFor(s).api(path,{name:pending.name,clientRequestId:pending.requestId});
      if(!canChangePlay(s,at))return;
      if(!r||typeof r.revisionId!=='string'||!/^[\w-]{1,100}$/.test(r.revisionId))throw Error('The workshop has not confirmed this copy. Your original is safe. Check again later.');
      saved=(await saveLocalStudioProject(profileStorage(localStorage),FG,s.owner,(_games,book)=>book.fork(s.id,s.owner,pending.name,null,r.revisionId,pending.requestId),notifyRewardSourceSaved,copyMode));
    }
    else if(s.projectId){saved=(await saveLocalStudioProject(profileStorage(localStorage),FG,s.owner,(stagedGames,stagedNotebook)=>{const selected=showing==='candidate'?s.candidate:null;const historical=showing==='history'&&viewedRevisionId?stagedGames.revision(s.projectId!,s.owner,viewedRevisionId):null;const p=stagedGames.fork(s.owner,s.projectId!,name,selected?.config||historical?.config,selected?.prompt||historical?.label,selected?.id||historical?.id);return stagedNotebook.fork(s.id,s.owner,name,p.id,null);},notifyRewardSourceSaved,copyMode,s.projectId));}
    else saved=(await saveLocalStudioProject(profileStorage(localStorage),FG,s.owner,(_games,book)=>book.fork(s.id,s.owner,name,null,null),notifyRewardSourceSaved,copyMode));
    $<HTMLDialogElement>('studioCopyDialog').close();
    if(canChangePlay(s,at)){await open(saved.id);status('Saved as a separate game. Your original game is unchanged.');celebrateJem('copied','studioStatus');}
  }finally{saving=false;render();}
 }
 // Route all child entry points to one workspace. Legacy screens remain available without ?studio=1.
 let profileClickReady=false,profileSwitchPending=false;
 document.addEventListener('click',event=>{
  const target=(event.target as Element)?.closest<HTMLElement>('button,[data-page],[data-game]');if(!target||target.closest('#page-studio')||target.closest('#page-studio-library')||target.closest('.studio-nav'))return;
  if(target.classList.contains('profile-choice')){if(profileClickReady)return;event.preventDefault();event.stopImmediatePropagation();if(profileSwitchPending)return;act(async()=>{profileSwitchPending=true;try{await flushDraft();profileClickReady=true;target.click();}finally{profileClickReady=false;profileSwitchPending=false;}});return;}
  if(target.dataset.page==='creations'){event.preventDefault();event.stopImmediatePropagation();act(openSavedIdeas);}
  else if(target.id==='homeBtn'||target.id==='resultHome'||target.dataset.page==='home'){event.preventDefault();event.stopImmediatePropagation();act(homeFromNavigation);}
  else if(target.dataset.page==='create'){event.preventDefault();event.stopImmediatePropagation();act(newIdea);}
  else if(target.dataset.page==='feedback'||target.id==='improveThis'||target.id==='returnLive'){event.preventDefault();event.stopImmediatePropagation();act(async ()=>{if(activeId){showStudio();(await setTab('talk'));$('studioPrompt').focus();}else (await home());});}
  else if(target.dataset.game){event.preventDefault();event.stopImmediatePropagation();act(()=>start(target.dataset.game as GameId));}
  else if(target.id==='exitGame'){event.preventDefault();event.stopImmediatePropagation();act(home);}
  else if(target.dataset.page==='parent'||target.dataset.page==='lab'){act(async ()=>{stopSpeech();(await flushDraft());disposeGame();route='other';});}
 },true);
 // Keyboard input in the conversation must not operate a game's controls.
 $('studioPrompt').addEventListener('keydown',event=>event.stopPropagation());
 [nav,profileMenu,page.querySelector('.studio-actions')!,page.querySelector('.studio-mobile-tabs')!,page.querySelector('.studio-heading')!].forEach(control=>control.addEventListener('keydown',event=>event.stopPropagation()));
 $('studioMore').addEventListener('keydown',event=>{if(event.key==='Escape'){$<HTMLDetailsElement>('studioMore').open=false;focusView($('studioMore').querySelector('summary')!);}});
 helpReading=createReadAloudControl({text:()=>[$('studioHelpGoal').textContent,$('studioHelpControls').textContent,$('studioHelpKeyboard').textContent].join('. '),label:'Read the instructions',buttonClass:'studio-button',canRead:()=>route==='studio'&&!FG.learning.active&&!$('studioHelpPanel').hidden});
 helpReading.button.id='studioReadInstructions';$('studioCloseHelp').before(helpReading.element);
 $('studioHelp').onclick=()=>act(showHelp);$('studioCloseHelp').onclick=()=>{helpReading?.stop();$('studioHelpPanel').hidden=true;focusView($('studioReturnToPlay')||$('studioHelp'));};
 $('studioReady').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;const ready=readyExperiment(s);if(ready?.candidate.remoteId)await showRemote(s,ready.candidate.remoteId,'candidate',ready.id);});
 $('studioMore').querySelector('summary')!.addEventListener('click',event=>{if(guardMath())event.preventDefault();});
 $('studioHome').onclick=()=>act(home);$('studioNavHome').onclick=()=>act(homeFromNavigation);$('studioNew').onclick=()=>act(newIdea);$('studioNavCreate').onclick=()=>act(newIdea);$('studioChooseStarter').onclick=()=>act(home);
 $('studioNavJourney').onclick=()=>act(async ()=>(await openJourney()));homeCharacterLink.onclick=()=>act(async ()=>(await openJourney(!notebook.avatar(owner()))));
 $('studioNavRewards').onclick=()=>act(openRewards);
 $('studioSubjectMath').onclick=()=>chooseLearningSubject('math');$('studioSubjectLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioGameMath').onclick=()=>chooseLearningSubject('math');$('studioGameLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioNavPowers').onclick=()=>act(async ()=>{if(guardMath())return;stopSpeech();(await flushDraft());hideJourney();disposeGame();FG.app.page('lab');route='other';if(!FG.learning.active)focusView($('jemsPowersTitle'));});
 $('studioPlay').onclick=()=>act(playViewed);$('studioKeep').onclick=()=>act(keep);$('studioUndo').onclick=()=>act(undo);
 $('studioRedo').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;if(s.undone){(await notebook.update(s.id,s.owner,x=>{x.candidate=x.undone!;x.undone=null;}));await playCandidate();return;}if(!s.projectId)return;(await games.redo(s.owner,s.projectId));await playWorking();});
 $('studioCompare').onclick=()=>act(async ()=>{if((await setTab('versions')))$<HTMLDetailsElement>('studioMore').open=false;});$('studioCloseVersions').onclick=()=>act(async ()=>{(await setTab('game'));focusView($('studioReturnToPlay')||$('studioPlay'));});$('studioBackWorking').onclick=()=>act(playWorking);
 $('studioCopy').onclick=()=>{if(guardMath())return;stopSpeech();++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;} $<HTMLInputElement>('studioCopyName').value=current().name+' copy';$<HTMLDialogElement>('studioCopyDialog').showModal();$('studioCopyName').focus();};$('studioCopyCancel').onclick=()=>$<HTMLDialogElement>('studioCopyDialog').close();$<HTMLDialogElement>('studioCopyDialog').addEventListener('close',()=>{if(route==='studio'&&!FG.learning.active)focusView($('studioCopy'));});
 $('studioCopyForm').onsubmit=e=>{e.preventDefault();act(()=>copyGame($<HTMLInputElement>('studioCopyName').value.trim()));};
 $('studioPromptForm').onsubmit=e=>{e.preventDefault();$('studioTalk').click();};
 const firstBuildActions=new Set<string>();
 $('studioSend').onclick=()=>act(async()=>{
  if(young()){await handOff();return;}
  if(guardMath()||coaching?.busy()||saving)return;
  const s=current(),creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  // Reserve this first-build gesture before any async storage or coach work.
  // Once admitted, the builder owns its usual pending-submission guard.
  if(!creating){await submit();return;}
  if(firstBuildActions.has(s.id)||sending.has(s.id)||busy(s)||s.pendingSubmission||unknownJobs.has(s.id)||needsReadyRecovery(s))return;
  firstBuildActions.add(s.id);
  try{
   if($<HTMLTextAreaElement>('studioPrompt').value.trim()){
    const started=epoch;
    stopSpeech();await flushDraft();
    if(sameView(s,started))await coaching?.discuss('discuss');
   }else await submit();
  }finally{firstBuildActions.delete(s.id);}
 });
 continueChat.onclick=()=>act(async()=>{
  if(guardMath())return;
  const s=current();if(saving||coaching?.busy())throw Error('Let this reply finish before continuing chat.');
  (await flushDraft());(await notebook.continueConversation(s.id,s.owner));render();
  status('Your earlier chat is saved. Keep going on this page.');focusView($('studioPrompt'));
 });
 $('studioClearChat').onclick=()=>act(async ()=>{
  if(guardMath())return;
  const s=current();
  if(saving){status('Let this version finish saving before clearing chat.',true);return;}
  if(busy(s)||s.pendingExperiment||s.pendingSubmission){status('Finish or cancel this build before clearing chat.',true);return;}
  if(!confirm('Clear this chat, its earlier pages and design notes on this device? Removing making evidence can lower your maker level and change your outfit. Your lifetime gems, saved game versions and other copies will remain.'))return;
  stopSpeech();coaching?.reset();chatOptions.open=false;
  (await notebook.clearConversation(s.id,s.owner));
  updateProfile();
  $<HTMLTextAreaElement>('studioPrompt').value='';
  (await coaching?.openSession());render();
  status('Chat and design notes cleared on this device. Saved game versions remain.');
 });
 $('studioTalk').onclick=()=>act(()=>{
  if(young()){handOff();return;}
  stopSpeech();
  if(!$<HTMLTextAreaElement>('studioPrompt').value.trim()){status('Type a message or choose Speak first.');return;}
  return coaching?.discuss('discuss');
 });
 $('studioPrompt').oninput=()=>{refreshBuildAction();clearTimeout(draftTimer);$('studioDraftStatus').textContent='Saving draft…';draftTimer=setTimeout(()=>act(async ()=>{(await flushDraft());$('studioDraftStatus').textContent='Draft saved on this device';}),180);};
 $('studioReflectAnswer').onclick=()=>act(async ()=>{if(guardMath())return;reflecting=true;(await setTab('talk'));render();focusView($('studioPrompt'));});$('studioReflectSkip').onclick=()=>act(async ()=>{const s=current();(await notebook.update(s.id,s.owner,x=>{x.reflection=false;}));(await coaching?.pauseReflection());reflecting=false;render();void playViewed();});
 $('studioCancel').onclick=()=>act(async()=>{const s=current();await clientFor(s).cancel();});
 $('studioRetry').onclick=()=>act(()=>recoverBuild(current().pendingSubmission||needsReadyRecovery(current())||unknownJobs.has(current().id)?'check':'retry'));
 page.querySelectorAll<HTMLElement>('[data-studio-tab]').forEach(b=>b.onclick=()=>act(async ()=>{const tab=b.dataset.studioTab as 'game'|'talk'|'versions';if(tab==='game'&&pausedForTools)return playViewed();(await setTab(tab));}));
 window.addEventListener('factory-learning-active',async event=>{refreshGameSubject();if((event as CustomEvent).detail){handoff.close();if(route==='studio'){$<HTMLDetailsElement>('studioMore').open=false;(await setTab('game'));}}refreshStudioGuide();});
 window.addEventListener('factory-learning-subject',()=>{refreshLearningChoice();if(route==='studio'&&activeId){refreshGameSubject();FG.learning.modeControl($('studioMathMode'),activeId);}});
 window.addEventListener('factory-session-restored',()=>{void refreshServiceReadiness();if(activeId&&panel==='talk')void privateSpeech?.refresh();});
 window.addEventListener('factory-profile-before-change',event=>{stopSpeech();if(event.cancelable&&draftPending()){event.preventDefault();act(flushDraft);return;}handoff.close();disposeGame();});
 let profileOpening=0;
 window.addEventListener('factory-profile',()=>{const requested=++profileOpening,capturedOwner=owner(),navigationIntent=++actionGeneration,preserveParent=!$('page-parent').classList.contains('hidden');notebookOwner='';welcomeArt=null;handoff.close();buildAttempts.clear();submittedDrafts.clear();sending.clear();waitProject=null;stopSpeech();hideJourney();
  // A hidden Studio DOM must never retain the previous child's transcript.
  // Clearing a browser view does not delete the former child's saved notebook.
  conversationReaders.forEach(reader=>reader.dispose());conversationReaders=[];notificationView?.clear();
  const conversation=$('studioMessages');conversation.replaceChildren();delete conversation.dataset.session;delete conversation.dataset.signature;$('coachProposals').replaceChildren();
  $('coachModeStatus').textContent='';$<HTMLTextAreaElement>('studioPrompt').value='';
  $('studioVoiceStatus').textContent='';
  coachConnection=remote.mode==='remote'?'checking':'unavailable';builderReadiness=remote.mode==='remote'?'checking':'not-configured';$<HTMLDialogElement>('studioCopyDialog').close();coaching?.reset();clearTimeout(draftTimer);clients.forEach(c=>c.disconnect());clients.clear();unknownJobs.clear();for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();activeId=null;reflecting=false;disposeGame();$('studioLibrary').replaceChildren();notebook.close();
  const opening=(async()=>{const next=await NotebookWorkspace.open(profileStorage(localStorage),owner,notifyRewardSourceSaved);if(requested!==profileOpening||owner()!==capturedOwner){next.close();return;}notebook=next;notebookOwner=capturedOwner;lastPresentedLevel=notebook.summary().journey.level;updateProfile();})();notebookReady=opening;
  void opening.then(async()=>{if(requested!==profileOpening||owner()!==capturedOwner)return;
   // A later Parent action owns navigation even while this profile's notebook
   // is still opening. Rebinding its data must not send that adult back home.
   if(!preserveParent&&navigationIntent===actionGeneration)await home();else if(!$('page-parent').classList.contains('hidden'))route='other';
   void refreshServiceReadiness();resumeOutstanding();}).catch(error=>{if(owner()===capturedOwner)status((error as Error).message,true);});});
 window.addEventListener('factory-art-updated',event=>{
  if((event as CustomEvent).detail?.owner!==owner())return;
  void readWelcomeArt(true);
 });
 window.addEventListener('beforeunload',event=>{stopSpeech();if(rewardSourceWritable()&&draftPending()){event.preventDefault();event.returnValue='';}});
 let storageRefresh=0;
 window.addEventListener('storage',event=>{if(event.key?.startsWith('family-game-factory')){const requested=++storageRefresh,capturedOwner=owner();void (async()=>{await notebookReady;const selected=notebook;await selected.refresh(capturedOwner);if(requested!==storageRefresh||owner()!==capturedOwner||selected!==notebook)return;updateProfile();if(route==='library')renderLibrary();else if(route==='journey')renderJourney();else if(route==='rewards')renderRewards();else if(route==='notifications')refreshNotifications();else if(activeId)render();else refreshNotifications();})().catch(error=>{if(requested===storageRefresh&&owner()===capturedOwner)status((error as Error).message,true);});}});
 coaching=installCoaching({get notebook(){return notebook;},current,owner,message,render,status,config:()=>remote,
  onSavedDesignChange,
  onCoachReply:text=>voice?.reply(text),
  onCoachState:state=>{coachConnection=state;if(activeId)render();window.dispatchEvent(new CustomEvent('factory-coach-connection',{detail:{ownerId:owner(),state}}));},
  rules:()=>{const s=current();if(s.game==='new')return 'New game: rules are being agreed; do not invent recorded outcomes.';const r=s.projectId?games.cachedRevision(s.projectId,s.owner):null;return JSON.stringify({game:s.game,instructions:FG.games[s.game]?.instructions,controls:FG.games[s.game]?.controls,settings:r?.config,learningSubject:FG.learning.subject,editable:manifests[s.game as GameId]?.mechanics.map(m=>({key:m.key,label:m.label}))}).slice(0,2000);},
  localSupported:prompt=>{const s=current();if(!s.projectId||s.remoteId)return false;const info=coaching?.details(),saved=games.cachedRevision(s.projectId,s.owner);if(!saved)return false;return interpret(s.game as GameId,info?.continueTest&&s.candidate?.config?s.candidate.config:saved.config,prompt).kind==='supported';},
  tryRequest:async(prompt,_origin,_depth,displayText,compiledPlan)=>{await submit({prompt,displayText,compiledPlan});},
  playTest:async id=>{const s=current();if(!canChangePlay(s))return;const test=s.experiments?.find(e=>e.id===id);if(test?.candidate.remoteId){await showRemote(s,test.candidate.remoteId,'candidate',id);return;}(await notebook.selectExperiment(s.id,s.owner,id));await playCandidate();},playMain:playViewed,combineTests,
  pauseForThinking:()=>{if(guardMath())return false;++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}return true;},
  showTalk:async ()=>{showStudio();if((await setTab('talk')))focusView($('studioPrompt'));}
 });
 // Put live response status next to the conversation it describes, not below
 // unrelated experiment controls. It stays an accessible aria-live status.
 $('studioMessages').after($('coachModeStatus'));
 setIconLabel($('studioChange'),'edit','Talk or change my game');
 const appendSpeechDraft=async (text:string)=>{
  // Both speech paths produce a draft only. The child chooses Send or Build.
  const input=$<HTMLTextAreaElement>('studioPrompt');
  input.value=[input.value.trim(),text.trim()].filter(Boolean).join(' ').slice(0,input.maxLength||2000);
  (await flushDraft());$('studioDraftStatus').textContent='Check your words, then choose Send to jems.';
  input.focus();
 };
 voice=installStudioVoice({
  microphone:$<HTMLButtonElement>('studioMic'),installPack:$<HTMLButtonElement>('studioVoicePack'),
  renderMicrophone:(state,label)=>{localSpeechActive=state!=='idle';const button=$('studioMic');setIconLabel(button,state==='idle'?'mic':state==='recording'?'stop':'close',label);button.setAttribute('aria-label',state==='idle'?'Speak to jems using the microphone when supported':label);},
  hearReply:$<HTMLButtonElement>('studioHear'),status:$('studioVoiceStatus'),
  renderReading:(active,waiting)=>setIconLabel($('studioHear'),active?'stop':'volume',waiting?'Play reading':active?'Stop reading':'Read this to me'),
  scope:()=>activeId?owner()+':'+activeId:'',
  canListen:()=>route==='studio'&&panel==='talk'&&!FG.learning.active&&!privateSpeech?.active(),
  onTranscript:appendSpeechDraft
 });
 privateSpeech=installStudioPrivateSpeech({
  button:privateMic,status:$('studioVoiceStatus'),
  renderButton:(state,label)=>{setIconLabel(privateMic,state==='idle'?'mic':state==='recording'?'stop':'close',label);privateMic.setAttribute('aria-label',state==='idle'?'Speak using parent-approved private transcription, then review your message':label);},
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
   (await flushDraft());const s=current(),fromCandidate=showing==='candidate'&&!!s.candidate,fromHistory=showing==='history';reflecting=false;
   // Unmount before copying a revision so its latest construction/ride state is saved.
   showStudio();(await setTab('talk'));$<HTMLSelectElement>('experimentStart').value=fromCandidate?'continue':'main';
   if(!prompt){render();$('studioPrompt').focus();return;}
   if(s.draft.trim()&&s.draft.trim()!==prompt){
    const joined=s.draft+'\n\n'+prompt;
    if(joined.length<=2000){$<HTMLTextAreaElement>('studioPrompt').value=joined;(await flushDraft());status('Added that idea to your saved draft. Edit it or choose Send when you are ready.');}
    else status('Your saved draft is full. Finish it first, then try: '+prompt);
    render();$('studioPrompt').focus();return;
   }
   $<HTMLTextAreaElement>('studioPrompt').value=prompt;(await flushDraft());
   if(fromHistory){render();status('Your idea is saved. Choose your starting version in Tests & versions before trying this change.');$('studioPrompt').focus();return;}
   await coaching!.tryPreset(prompt);
  })
 });
 // Mount Home once. The bounded presence check can update this same view,
 // without a second automatic navigation overriding a child's early choice.
 (await home());
 await readWelcomeArt();
 async function prepareNotebook(options:{deferReload?:boolean}={}){
  const captured=owner();await flushDraft();if(owner()!==captured)throw Error('The player changed. Reopen saved work.');
  await prepareIndexedNotebook(profileStorage(localStorage),owner);
  if(!options.deferReload){location.reload();return;}
  // Parent prepares the other domains before its single final reload. Keep
  // hidden scene guidance and other read projections on the new authority.
  const previous=notebook,next=await NotebookWorkspace.open(profileStorage(localStorage),owner,notifyRewardSourceSaved);
  if(owner()!==captured){next.close();throw Error('The player changed. Reopen saved work.');}
  notebook=next;notebookOwner=captured;previous.close();
 }
 FG.studio={version:1,flushDraft:flushForCapture,open:(id:string)=>open(id),home,exportNotebook:()=>notebook.legacySnapshot(),captureNotebook:async()=>{await flushForCapture();return notebook.snapshot();},prepareIndexedNotebook:prepareNotebook,mode:()=>remote.mode};
 let palsInterface:ReturnType<typeof installPalsInterface>;
 const creation=installCreationStudio({
  guidance:guideHost,
  enter:async ()=>{if(guardMath())return false;stopSpeech();(await flushDraft());hideJourney();disposeGame();FG.app.page('creation');route='other';document.body.classList.remove('studio-designing');document.body.classList.add('creation-open');setActiveNav('studioNavScenes');return true;},
  home,openGame:id=>open(id),onRewardSourceSaved:notifyRewardSourceSaved,
  ownedPals:()=>pals.state.profile?.owned.map(pal=>pal.id)??[],
  activePal:()=>pals.state.profile?.activeId??null,
  palForm:id=>pals.state.profile?.owned.find(pal=>pal.id===id)?.form??'base',
  openPals:()=>palsInterface.open(),
 });
 let artReturn:{owner:string;game?:string;scene?:string;creative?:boolean}|null=null;
 const artStudio=installArtStudio({
  enter:async()=>{if(guardMath())return false;const origin=route==='studio'&&activeId?{owner:owner(),game:activeId}:document.body.classList.contains('creation-open')?{owner:owner(),scene:creation.scene()?.id,creative:true}:null;stopSpeech();await flushDraft();await creation.flush();artReturn=origin;setIconLabel($('artHome'),'arrow',origin?.game?'Back to my idea':origin?.scene?'Back to my scene':origin?.creative?'Back to Make a scene':'My Games','jems-icon--back');hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('art-studio');route='other';document.body.classList.remove('studio-designing','creation-open');setActiveNav('studioNavCreate');return true;},
  home:async()=>{const target=artReturn;artReturn=null;if(target?.owner===owner()){if(target.game){await open(target.game);return;}if(target.scene){await creation.open(target.scene);return;}if(target.creative){await creation.openMake();return;}}await home();},
  planGame:async(pin,isCurrent)=>{
   if(guardMath()||!isCurrent())return;if(young()){handOff();return;}
   const captured=owner(),authorized=creationAction(),target=artReturn?.owner===captured?artReturn.game:undefined;
   const check=()=>{if(!authorized()||!isCurrent())throw Error('Reopen this picture in My Art.');};
   const picture=await drawing(captured,pin.drawingId);check();
   if(picture.archived||picture.sha256!==pin.sha256)throw Error('Choose an available picture in My Art.');
   const previous=target?notebook.get(target,captured).gameArt?.pins.find(p=>p.role===pin.role):undefined;
   if(previous && previous.drawingId!==pin.drawingId &&
     !confirm('Use '+pin.name+' instead of '+previous.name+' as '+roleLabels[pin.role]+' in this plan? Your earlier art tests keep their pictures.'))return;
   const attach=(x:StudioSession)=>{
    check();if(busy(x)||x.pendingSubmission||x.pendingExperiment||sending.has(x.id)||unknownJobs.has(x.id))throw Error('Finish checking the current build before adding a picture.');
    x.gameArt??=emptyArtPlan();
    if(JSON.stringify(x.gameArt.pins.find(p=>p.role===pin.role))!==JSON.stringify(previous))throw Error('Your plan changed. Choose the picture again.');
    selectGameArt(x.gameArt,pin);
   };
   let id=target;
   if(id){await notebook.update(id,captured,attach);}
   else{
    const created=await saveLocalStudioProject(profileStorage(localStorage),FG,captured,(_games,book)=>{
     check();const project=book.create(captured,'new','My game idea',null,{creationStandard:2});
     return book.update(project.id,captured,attach);
    },notifyRewardSourceSaved);id=created.id;
   }
   check();await open(id,false);if(authorized()&&activeId===id){await setTab('talk');artPlanBox.scrollIntoView({block:'nearest'});}
  },
  openScene:async (art,kind)=>{await creation.openArt(art,kind);},
  openCar:async(rigId,isCurrent)=>{
   if(!isCurrent()||guardMath())return;const capturedOwner=owner(),capturedEpoch=epoch;
   const stillCurrent=()=>isCurrent()&&owner()===capturedOwner&&epoch===capturedEpoch;
   const rig=await rigById(capturedOwner,rigId);if(!stillCurrent())return;
   const source=await drawing(capturedOwner,rig.assembly.sourceId);
   if(!stillCurrent()||guardMath())return;if(rig.assembly.kind!=='car')throw Error('Choose a saved car design for Rally.');
   const picture=await createImageBitmap(drawingBlob(source));
   try{if(!stillCurrent())return;vehicleGeometry(rig.assembly,picture.width/picture.height);}finally{picture.close();}
   if(!stillCurrent()||guardMath())return;
   if(!(await leaveCreationForStudio()))return;(await flushDraft());
   // Keep the two synchronous save steps together. If notebook storage was full
   // on a previous attempt, recover that exact unlisted project instead of
   // leaving it behind and creating another copy on every retry.
   const listed=new Set(notebook.list(capturedOwner).map(item=>item.projectId));
   let pending:Awaited<ReturnType<StudioGames['project']>>|undefined;for(const item of await games.list(capturedOwner)){if(item.game==='hill'&&!listed.has(item.id)&&(await games.revision(item.id,capturedOwner)).drawingRigId===rig.id){pending=item;break;}}
   if(!stillCurrent())return;
   let projectId='';
   const session=(await saveLocalStudioProject(profileStorage(localStorage),FG,capturedOwner,(stagedGames,stagedNotebook)=>{
    const p=pending??stagedGames.create(capturedOwner,'hill',(source.name+' Rally').slice(0,60),defaults('hill'),rig.id);projectId=p.id;
    return stagedNotebook.create(capturedOwner,'hill',p.name,p.id,{message:'Your own drawing is driving this game. Its saved movement version stays with this adventure. Try it, then decide what you want to change.'});
   },notifyRewardSourceSaved,undefined,pending?.id??null));
   // Actual retained game revisions are authoritative for art usage. Index
   // repair is supplementary and cannot strand an already-saved game.
   void registerArtUsage(capturedOwner,{targetId:projectId,targetKind:'game',drawingId:source.id,rigId:rig.id},()=>owner()===capturedOwner&&rewardSourceWritable()).catch(()=>{});
   await open(session.id);
  },
 });
 async function selectArtForGame(){
  if(guardMath()||route!=='studio'||!activeId)return;
  const session=current(),capturedEpoch=epoch;
  const valid=()=>sameView(session,capturedEpoch)&&!FG.learning.active;
  stopSpeech();await flushDraft();if(!valid())return;
  const rally=session.game==='hill'&&!!session.projectId&&!session.remoteId;
  if(rally&&(session.candidate||showing==='history')){
    status('Open your main Rally game and finish your current experiment before choosing a new car.');return;
  }
  const base=rally?await games.revision(session.projectId!,session.owner):null;
  if(!valid())return;
  const choice=await chooseGameArtwork({owner:session.owner,current:valid,rally,existing:session.game!=='new'||!!session.remoteId});
  if(!choice||!valid())return;
  if(choice==='library'){await artStudio.open();return;}
  const pin=await artChoice(session.owner,choice,valid);
  if(pin.assetId!==choice.assetId)throw Error('Choose the saved version again.');
  if(!valid())return;
  if(!base){await creation.openArt(pin,'picture-hunt',session.id);return;}
  if(!pin.rigId)throw Error('Choose a saved car design.');
  await loadDrawnCar(session.owner,pin.rigId);
  if(!valid())return;
  await saveLocalStudioProject(profileStorage(localStorage),FG,session.owner,(staged,book)=>{
    if(!valid()||book.get(session.id,session.owner).candidate)throw Error('Your game changed. Open its current version again.');
    staged.keep(session.owner,session.projectId!,base.id,base.config,'Changed the Rally car','',base.id,pin.rigId);
    return book.get(session.id,session.owner);
  },notifyRewardSourceSaved,undefined,session.projectId!);
  if(valid())await playWorking();
 }
 artEntries=installArtEntryPoints({homeAction:library.querySelector('.studio-home-action')!,libraryTools,open:()=>act(()=>artStudio.open()),chooseGameArt:()=>act(selectArtForGame)});
 installCreationProgress();
 const scenesNav=iconEl('button','','grid','Creative Studio') as HTMLButtonElement;scenesNav.id='studioNavScenes';scenesNav.type='button';scenesNav.onclick=()=>creation.open();$('studioNavCreate').after(scenesNav);
 const scenesEntry=el('button','studio-scene-entry') as HTMLButtonElement;scenesEntry.id='studioScenes';scenesEntry.type='button';
 scenesEntry.innerHTML='<img src="./jems-blocks.svg" alt=""><span><strong>Make your imagination move</strong><small>Tell a story with blocks, or watch a scene and rebuild it your way.</small></span><b aria-hidden="true">→</b>';
 // Keep a complete ready-to-play choice in the first mobile viewport.
 scenesEntry.onclick=()=>creation.open();
 const practice=installProblemSolvingPractice({
  enter:async ()=>{if(guardMath())return false;stopSpeech();(await flushDraft());(await creation.flush());hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('problem-solving');route='other';document.body.classList.remove('studio-designing','creation-open');setActiveNav('studioNavProblemSolving');return true;},
  home:()=>creation.open(),
 });
 const practiceNav=iconEl('button','','help','Try an idea') as HTMLButtonElement;practiceNav.id='studioNavProblemSolving';practiceNav.type='button';practiceNav.onclick=()=>practice.open();scenesNav.after(practiceNav);
 nav.classList.add('studio-nav-has-practice');document.querySelector('.site-header')!.classList.add('studio-practice-navigation');
 const practiceEntry=el('button','studio-scene-entry') as HTMLButtonElement;practiceEntry.id='studioProblemSolving';practiceEntry.type='button';
 practiceEntry.innerHTML='<img src="./jems-workbench.svg" alt=""><span><strong>Try an idea</strong><small>Make a guess, try a little test, and choose what to change.</small></span><b aria-hidden="true">→</b>';
 practiceEntry.querySelector('b')!.replaceChildren(createIcon('arrow'));
 practiceEntry.onclick=()=>practice.open();
 const scenePractice=iconEl('button','creation-button creation-quiet','arrow','Try an experiment') as HTMLButtonElement;scenePractice.id='creationTryIdea';scenePractice.type='button';scenePractice.className='creation-start';scenePractice.innerHTML=iconMarkup('help')+'<span><strong>Try an experiment</strong><small>Make a guess and test it.</small></span>'+iconMarkup('arrow');scenePractice.onclick=()=>practice.open();$('creationExperimentSlot').append(scenePractice);
 window.dispatchEvent(new CustomEvent('factory-problem-solving-updated',{detail:{owner:owner()}}));
  scenesEntry.querySelector('b')!.replaceChildren(createIcon('arrow'));
 const sceneButton=iconEl('button','studio-button','grid','Animate & code') as HTMLButtonElement;sceneButton.id='studioMakeScene';sceneButton.type='button';
 palsInterface=installPalsInterface({
  controller:pals,
  enter:async ()=>{
   if(guardMath())return false;
   stopSpeech();(await flushDraft());(await FG.creation?.flush());hideJourney();disposeGame();FG.app.page('home');
   document.querySelectorAll('main > .page').forEach(element=>element.classList.add('hidden'));
   route='pals';document.body.classList.remove('studio-designing','creation-open');globalStatus.textContent='';return true;
  },
  home:()=>act(()=>openJourney()),create:async id=>{(await creation.openWithPal(id));},
  refreshCreation:()=>creation.refreshPals(),help:()=>{$('studioHelp').click();},
 });
 async function openParent(connection=false){
  ++viewIntent;
  stopSpeech();(await flushDraft());(await FG.creation?.flush());closeJourneyMap();hideJourney();disposeGame();
  FG.app.page('parent');route='other';setActiveNav(null);
  if(connection)FG.parentDashboard?.openTab('settings');
  const target=connection?$('builderConnection'):$('parentDashboard')?.querySelector<HTMLElement>('h1');
  if(target){target.tabIndex=-1;focusView(target);}
 }
 installStudioNavigation({nav,headerTools,helpButton,subjects:learningChoice,
  openArt:()=>act(()=>artStudio.open()),openParent:()=>act(async ()=>(await openParent())),
 });
 const destinations=el('nav','jems-destinations');destinations.id='studioDestinations';destinations.setAttribute('aria-label','Your Jems world');
 destinations.append(
  destinationTile('studioJourneyTile','My Journey','Pals, gems & your powers','./jems-art/spot_first_idea.webp',()=>act(()=>openJourney())),
  destinationTile('studioArt','My Art','Draw it. Make it yours.','./jems-art/character_spark_wave.webp',()=>act(()=>artStudio.open())),
  destinationTile('studioScenes','Creative Studio','Make scenes. Try ideas.','./jems-workbench.svg',()=>creation.open())
 );
 $('studioContinue').before(destinations);
 const journeySections=installJourneySections({overview:()=>act(()=>openJourney()),pals:()=>palsInterface.open(),rewards:()=>act(openRewards),powers:()=>$('studioNavPowers').click(),scenes:()=>creation.openChallenges(),experiments:()=>practice.open()});
 const powersCard=createDashboardCard('My Powers','Grow your skills',()=>$('studioNavPowers').click());
 powersCard.element.id='journeyPowers';
 const powersArt=document.createElement('img');powersArt.src='./jems-workbench.svg';powersArt.alt='';
 powersCard.artwork.append(powersArt);
 journeySections.overview.append(rewardsWidget.element,palsInterface.dashboardCard,powersCard.element);
 installParentGuidance();
 refreshEarlyJourney();
 window.addEventListener('factory-parent-guidance',()=>{guidanceEpoch++;refreshEarlyJourney();if(young()){++viewIntent;coaching?.reset();clients.forEach(client=>client.disconnect());if(route==='studio'){disposeGame();page.classList.add('hidden');act(home);}}});
 window.addEventListener('factory-learning-settings',refreshEarlyJourney);
 window.addEventListener('factory-profile',refreshEarlyJourney);
 window.addEventListener('factory-early-handoff',event=>{if(young()){event.preventDefault();handOff();}});
 refreshNotifications();
 window.addEventListener('factory-open-parent-connection',event=>{
  event.preventDefault();act(async ()=>(await openParent(true)));
 });
 $('studioHelp').after(sceneButton);
 sceneButton.onclick=()=>act(async()=>{
  if(guardMath())return;const s=current(),capturedOwner=owner(),capturedEpoch=epoch;
  const remoteId=showing==='candidate'?s.candidate?.remoteId:showing==='history'?remoteViewedId:s.remoteId;
  if(remoteId){
   status('Opening the editable scene included with this game…');
   const response=await clientFor(s).creationManifest(remoteId);
   if(owner()!==capturedOwner||epoch!==capturedEpoch||route!=='studio'||activeId!==s.id)return;
   if(!response.manifest){creation.open();globalStatus.textContent='This game has no editable scene. Choose a starter for a separate scene. Your game stays saved.';return;}
   (await creation.fromStudio({...s,projectId:response.projectId,remoteId:response.revisionId},undefined,response.manifest));return;
  }
  if(!s.projectId||!['dragon','buckets','robot'].includes(s.game)){creation.open();return;}
  const revision=(await games.revision(s.projectId,s.owner,showing==='history'&&viewedRevisionId?viewedRevisionId:undefined));
  if(owner()!==capturedOwner||epoch!==capturedEpoch||route!=='studio'||activeId!==s.id)return;
  if(showing==='candidate'&&s.candidate?.config)throw Error('Keep this game version first, then use Animate & code to carry that version into a scene.');
  (await creation.fromStudio(s,revision));
 });
 if(activeId)render();
 window.addEventListener('factory-page',event=>{hideJourney();const destination=(event as CustomEvent).detail;if(destination!=='creation')document.body.classList.remove('creation-open');if(destination==='lab')setActiveNav('studioNavPowers');else if(destination==='parent')setActiveNav(null);});
 if(new URLSearchParams(location.search).get('creation')==='1')creation.open();
 if(new URLSearchParams(location.search).get('problem-solving')==='1')practice.open();
 if(new URLSearchParams(location.search).get('art')==='1')void artStudio.open().catch(error=>status((error as Error).message,true));
 // Local drawing, scenes and their navigation must not wait for the remote
 // builder configuration. Only the existing online readiness state depends on
 // this request; completing it never navigates away from the child's work.
 async function loadRemoteConfiguration(){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10_000);
  try{
   const response=await fetch(new URL('factory-config.json',document.baseURI),{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('Builder configuration is unavailable.');
   remote=validateBuilderConfig(await response.json());
  }catch{remote={version:1,mode:'unavailable'};}
  finally{clearTimeout(timeout);}
  // A saved remote game may have been opened while configuration was still
  // pending. Replace those unavailable clients on the next explicit action;
  // never replay a build request merely because configuration arrived.
  for(const [id,client] of clients)if(client.config!==remote){client.disconnect();clients.delete(id);}
  configReady=true;
  coachConnection=remote.mode==='remote'?'checking':'unavailable';
  builderReadiness=remote.mode==='remote'?'checking':'not-configured';
  if(route==='studio'&&activeId)render();else if(route==='library')updateCreationNote();
  void refreshServiceReadiness().catch(error=>status('Could not check the game workshop: '+(error as Error).message,true));
  resumeOutstanding();refreshNotifications();
 }
 void loadRemoteConfiguration().catch(error=>status('Could not refresh the game workshop: '+(error as Error).message,true));
}
