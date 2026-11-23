import { attachPreviewLearning } from '../learning/remote';
import { interpretLearningRequest, learningFormatLabel, setMode } from '../learning/policy';
import {installCoaching} from './coaching';
import {celebrateJem, type JemMilestone} from '../brand/delight';
import {builderJourney, gemStage, GEM_STAGE_LABELS, type GemStage} from '../brand/gem-progress';
import {installGemJourney, createJourneyGem, createJourneyRankThumbnail} from '../brand/journey';
import {createMakerIdentity} from '../brand/maker-identity';
import {installStudioNavigation} from './navigation';
import {iconMarkup, createIcon, setIconLabel, type IconName} from '../brand/icons';
import {createMindYourJems, type WorkshopStatus} from '../games/mind-your-jems';
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
import '../brand/gem-progress.css';
import '../brand/art-library.css';
import { installQualityCards } from '../quality/cards';
import { StudioNotebook, type StudioSession, type Candidate, type PendingJob } from './notebook';
import { StudioGames, isGeneratedRemoteKind } from './adapter';
import { installStudioRemixRouting } from './host-navigation';
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
import { drawing, drawings, drawingBlob } from '../assets/private-drawings';
import { registerArtUsage } from '../drawing/library';
import { installProblemSolvingPractice } from '../problem-solving/ui';
import {installRewards, notifyRewardSourceSaved} from '../rewards/service';
import {createRewardsPage, createRewardsWidget, createRewardCelebration, type RewardsActivity} from '../rewards/ui';
import {type RewardGrant} from '../rewards/model';
import {rewardSourceWritable} from '../rewards/write-guard';
import {createFirstWelcome, createJourneyOverview} from './first-journey';
import {createGuideCard, type GuideCard, type GuideHost} from './guide-card';
import {GUIDE_TIPS, hasMeaningfulCreation, recommendNext, readyGuidedExperiment, type GuideTipId} from './guidance';
import {CreationStore} from '../creation/storage';
import {installPals} from '../pals/service';
import {installPalsInterface} from '../pals/host';
import {createBuildHandoff, type BuildHandoffIdentity, type BuildHandoffState} from './build-handoff';
import {visibleConversation, helperPreview} from './conversation-view';
import {creationBuildReadiness} from './creation-readiness';
import './guided-creation.css';

const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const el = (tag:string, className='', text='')=>{const n=document.createElement(tag);n.className=className;n.textContent=text;return n;};
const iconEl=(tag:string,className:string,name:IconName,label:string,iconClass='')=>{const target=el(tag,className);setIconLabel(target,name,label,iconClass);return target;};
const icon:Record<StudioSession['game'],string>={gum:'🚀',hill:'🚙',buckets:'🪣',dragon:'🐉',moon:'🌙',robot:'🤖',factory:'💎',new:'✨'};
const names:Record<StudioSession['game'],string>={gum:'Bubble Gum Builders',hill:'Junkyard Rally',buckets:'Splash or Pass',dragon:'Dragon Island Rescue',moon:'Moon Donut Dash',robot:'Robot Route Lab',factory:'Gem Factory',new:'A brand-new idea'};
const busy=(s:StudioSession)=>!!s.job&&['queued','building','testing'].includes(s.job.status);
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
 let notebook:StudioNotebook;
 try{notebook=new StudioNotebook(profileStorage(localStorage),notifyRewardSourceSaved);}catch(error){
  const warning=el('p','notice',String((error as Error).message));$('page-home').prepend(warning);return;
 }
 const games=new StudioGames(profileStorage(localStorage),FG), owner=()=>String(FG.store.current().id);
 const guideHost:GuideHost={isDismissed:tip=>notebook.guidance(owner()).dismissedTips.includes(tip),dismiss:tip=>{notebook.dismissGuideTip(owner(),tip);}};
 try{games.export();}catch(error){$('page-home').prepend(el('p','notice','Could not open the studio: '+(error as Error).message));return;}
 let activeId:string|null=null,epoch=0,showing:'working'|'candidate'|'history'='working',mounted=false;
 let remote:BuilderConfig={version:1,mode:'unavailable'};
 const clients=new Map<string,BuilderClient>();
 const unknownJobs=new Set<string>();
 const retryBlocks=new Map<string,{jobId:string;reason:string}>();
 // A lost first acknowledgement has no job ID to check. Never mistake an
 // older failed job for this new request or replay it from a recovery button.
 const unconfirmedSubmissions=new Set<string>();
 let iframe:HTMLIFrameElement|null=null, previewChannel='',previewArtifact='',previewOwner='';
 let previewLearning:ReturnType<typeof attachPreviewLearning>|null=null;
 let configReady=false, route:'library'|'studio'|'journey'|'rewards'|'pals'|'other'='library', draftTimer:ReturnType<typeof setTimeout>|undefined;
 let coachConnection:CoachConnection='checking',builderReadiness:BuilderReadiness='checking';
 let saving=false, reflecting=false, lastOutcome:string|null=null,viewedRevisionId:string|null=null,remoteViewedId:string|null=null;
 let coaching:ReturnType<typeof installCoaching>|undefined;
 let voice:ReturnType<typeof installStudioVoice>|undefined;
 let privateSpeech:ReturnType<typeof installStudioPrivateSpeech>|undefined;
 let artEntries:ReturnType<typeof installArtEntryPoints>|undefined;
 const stopSpeech=()=>{voice?.cancel();privateSpeech?.cancel();};
 const sending=new Set<string>();
 const submittedDrafts=new Map<string,string>();
 let panel:'game'|'talk'|'versions'='game';
 let keptInThisView:string|null=null;
 let guideSignature='',currentGuide:GuideCard|null=null;
 let welcomeArt:{owner:string;hasArt:boolean;pending:Promise<void>|null;deferredView:number|null}|null=null;
 let pausedForTools=false,viewIntent=0;
 // Local arcade state never owns build readiness, saved games or learning evidence.
 const waitArcade=createMindYourJems();
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
 const studioGuideHost=el('div');studioGuideHost.id='studioGuideHost';studioGuideHost.hidden=true;
 page.querySelector('.studio-mobile-tabs')!.after(studioGuideHost);
 studioGuideHost.addEventListener('keydown',event=>event.stopPropagation());
 const doneForNow=iconEl('button','studio-button','save','Done for now') as HTMLButtonElement;
 doneForNow.id='studioDoneForNow';doneForNow.type='button';
 doneForNow.onclick=()=>act(()=>{home();status('Your saved work is here when you come back. Ideas and local creations stay on this device.');});
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
 checkIdea.onclick=()=>act(async()=>{stopSpeech();flushDraft();if(coachConnection==='sign-in'||remote.mode!=='remote'){openParent(true);return;}await coaching?.reassess();});
 buildGuidance.append(buildReason,checkIdea);$('studioSend').after(buildGuidance);
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
 library.querySelector('.studio-home-action')!.append(homeCharacterLink);
 const libraryTools=el('div','studio-library-tools');
 const savedIdeas=iconEl('button','studio-button','grid','Saved ideas & drawings') as HTMLButtonElement;
 savedIdeas.id='studioSavedIdeas';savedIdeas.type='button';savedIdeas.onclick=()=>act(openSavedIdeas);
 libraryTools.append(savedIdeas);library.querySelector('#studioFavoritesSection')!.after(libraryTools);
 const collectionBack=iconEl('button','studio-button','arrow','My Games','jems-icon--back') as HTMLButtonElement;
 collectionBack.id='studioCollectionBack';collectionBack.type='button';collectionBack.onclick=()=>act(home);
 $('page-creations').querySelector('.page-head')!.prepend(collectionBack);
 const collectionTitle=$('page-creations').querySelector('h1')!;collectionTitle.tabIndex=-1;
 const learningChoice=el('section','studio-learning-choice');learningChoice.id='studioLearningChoice';
 learningChoice.setAttribute('aria-labelledby','studioLearningTitle');
 learningChoice.innerHTML='<div class="studio-learning-copy"><strong id="studioLearningTitle">Learning adventure</strong><small id="studioLearningNote"></small></div><div class="learning-subject-switch" role="group" aria-label="Choose practice subject"><button type="button" id="studioSubjectMath" aria-pressed="true">Math</button><button type="button" id="studioSubjectLanguage" aria-pressed="false">English</button></div>';
 // The subject switch belongs to the player's header, not below the game shelf.
 for(const [id,name,label] of [['studioSubjectMath','grid','Math'],['studioSubjectLanguage','book','English']] as const)setIconLabel(learningChoice.querySelector<HTMLElement>('#'+id)!,name,label);
 const nativeStage=$('page-game');
 const originalNav=document.querySelector('.site-header nav') as HTMLElement;
 originalNav.hidden=true;
 const nav=el('nav','studio-nav');nav.setAttribute('aria-label','Main navigation');
 nav.innerHTML='<button id="studioNavHome">My Games</button><button id="studioNavCreate">Create</button><button id="studioNavJourney">My journey</button><button id="studioNavRewards">My rewards</button><button id="studioNavPowers">My Powers</button>';
 for(const [id,name,label] of [['studioNavHome','home','My Games'],['studioNavCreate','add','Create'],['studioNavJourney','star','My journey'],['studioNavRewards','star','My rewards'],['studioNavPowers','chart','My Powers']] as const)setIconLabel(nav.querySelector<HTMLElement>('#'+id)!,name,label);
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
  reset:()=>act(()=>{
   if(guardMath())return;
   notebook.resetGuidance(owner());closeJourneyMap(true);
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
  choose:(character,ownerId)=>chooseMaker(character,ownerId),
  make:ownerId=>{
   if(ownerId!==owner()||!notebook.avatar(ownerId))throw Error('Choose your character first.');
   if(guardMath())return;
   notebook.dismissWelcome(ownerId);closeJourneyMap();return newIdea();
  },
  help:()=>act(openJourneyMap),
 });
 library.prepend(welcome.element);
 library.querySelector('.studio-home-hero')!.before($('studioContinue'));
 function readWelcomeArt(force=false):Promise<void>{
  const capturedOwner=owner();
  if(!force&&welcomeArt?.owner===capturedOwner)return welcomeArt.pending||Promise.resolve();
  const capturedView=epoch,state:{owner:string;hasArt:boolean;pending:Promise<void>|null;deferredView:number|null}={owner:capturedOwner,hasArt:true,pending:null,deferredView:null};
  welcomeArt=state;library.setAttribute('aria-busy','true');
  // A blocked IndexedDB upgrade cannot hold the whole Studio at startup.
  // Unknown or unreadable art conservatively keeps the ordinary home available.
  let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(true),1500);});
  state.pending=Promise.race([drawings(capturedOwner).then(items=>items.length>0,()=>true),timeout]).then(hasArt=>{
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
  // Existing scene creators and established makers keep their normal home.
  // A damaged scene store is not a new account and must not be overwritten.
  let hasScenes=true;
  try{hasScenes=new CreationStore(profileStorage(localStorage)).list(owner()).length>0;}catch{}
  void readWelcomeArt();
  const visible=!welcomeArt!.hasArt&&welcomeArt!.deferredView!==epoch&&!notebook.guidance(owner()).welcomeDismissed&&!hasMeaningfulCreation(notebook.list(owner()),owner())&&!hasScenes;
  // Saving a character does not jump past the explicit creation action.
  // Tool availability is explained in the composer; this first choice stays simple.
  library.dataset.firstVisit=String(visible);welcome.update(visible,'',{ownerId:owner(),character:notebook.avatar(owner())});
  document.body.classList.toggle('studio-first-visit',visible&&route==='library');
 }
 function chooseMaker(character:'spark'|'nova',ownerId:string){
  if(ownerId!==owner())throw Error('Choose a character for the current player.');
  notebook.setAvatar(ownerId,character);
  updateProfile();renderJourney();renderHomeProgress();renderRewards();refreshWelcome();
 }
 const journey=installGemJourney({
  onBack:()=>act(home),onCreate:()=>act(newIdea),
  onPrimaryAction:ownerId=>act(async()=>{
   if(ownerId!==owner())return;
   if(guardMath())return;
   const target=journeyContinuation();
   if(!target){newIdea();return;}
   await open(target.id,false);
   if(owner()===ownerId&&activeId===target.id&&route==='studio')setTab(gemStage(target)==='cut'?'versions':'talk');
  }),
  onChooseCharacter:chooseMaker,
 });
 document.querySelector('main')!.append(journey.element);
 function rewardJourney(){const progress=builderJourney(notebook.list(owner()),owner());return {ownerId:owner(),level:progress.level,character:notebook.avatar(owner()),polishedCount:progress.polishedCount,nextAction:progress.nextAction};}
 const rewardsPage=createRewardsPage({
  guidance:guideHost,
  state:{...rewards.state,journey:rewardJourney()},onBack:()=>act(home),onOpenJourney:()=>act(()=>openJourney(!notebook.avatar(owner()))),
  onPlay:()=>act(()=>openPractice()),onActivity:activity=>act(()=>openRewardActivity(activity)),
  onCreate:()=>act(newIdea),onRetry:()=>{void rewards.refresh().catch(()=>{});}
 });
 document.querySelector('main')!.append(rewardsPage.element);
 const rewardsWidget=createRewardsWidget({...rewards.state,onOpen:()=>act(openRewards)});
 headerTools.prepend(rewardsWidget.element);
 const rewardToastHost=el('div','jems-rewards-toast-host');rewardToastHost.id='jemsRewardCelebrations';document.body.append(rewardToastHost);
 let rewardToastTimer:ReturnType<typeof setTimeout>|undefined,rewardBatchTimer:ReturnType<typeof setTimeout>|undefined,pendingGrants:RewardGrant[]=[];
 function clearRewardCelebration(){clearTimeout(rewardToastTimer);clearTimeout(rewardBatchTimer);pendingGrants=[];rewardToastHost.replaceChildren();}
 function chatIsVisible(){return route==='studio'&&panel==='talk'&&!page.classList.contains('hidden');}
 function renderRewards(){rewardsWidget.update(rewards.state.summary,rewards.state);rewardsPage.update({...rewards.state,journey:rewardJourney()});}
 rewards.subscribe((state,grants)=>{
  renderRewards();
  // Earned totals still update; decorative popups must not cover a chat answer.
  if(chatIsVisible()){clearRewardCelebration();return;}
  if(!grants.length||state.summary.owner!==owner()||document.hidden)return;
  pendingGrants.push(...grants);clearTimeout(rewardBatchTimer);
  const capturedOwner=owner();
  rewardBatchTimer=setTimeout(()=>{
   if(owner()!==capturedOwner||document.hidden||chatIsVisible()){pendingGrants=[];return;}
   const batch=pendingGrants;pendingGrants=[];
   const earned=batch.reduce((total,grant)=>total+grant.amount,0),summary=rewards.state.summary;
   const reached=summary.reachedGemMilestones.filter(goal=>goal>summary.lifetimeGems-earned).at(-1);
   document.getElementById('jems-delight-host')?.replaceChildren();
   rewardToastHost.replaceChildren(createRewardCelebration({grants:batch,journey:rewardJourney(),...(reached?{headline:reached+' gems reached!'}:{})}));
   clearTimeout(rewardToastTimer);rewardToastTimer=setTimeout(()=>rewardToastHost.replaceChildren(),4000);
  },180);
 });
 function openRewards(){
  if(guardMath())return;stopSpeech();flushDraft();FG.creation?.flush();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');
  document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));
  route='rewards';globalStatus.textContent='';renderRewards();rewardsPage.show();
  setActiveNav('studioNavRewards');
  window.scrollTo(0,0);void rewards.refresh().catch(()=>{});
 }
 rewards.setOpen(()=>act(openRewards));
 window.addEventListener('factory-page',()=>{handoff.close();rewardsPage.hide();document.body.classList.remove('studio-first-visit');closeJourneyMap();globalStatus.textContent='';globalStatus.classList.remove('is-error');globalStatus.setAttribute('role','status');});
 window.addEventListener('factory-profile',()=>{clearRewardCelebration();rewardsPage.hide();});
 window.addEventListener('pagehide',clearRewardCelebration);
 // Background builds are visible on every Studio screen without taking focus.
 const buildShelf=el('aside','studio-build-shelf');buildShelf.id='studioBuildShelf';
 buildShelf.setAttribute('aria-label','Background game builds');buildShelf.hidden=true;globalStatus.after(buildShelf);

 function playWhileBuilding(s:StudioSession){
  if(owner()!==s.owner||guardMath())return;
  const latest=notebook.get(s.id,s.owner),ready=readyExperiment(latest);
  if(!latest.job||(!busy(latest)&&!ready))return;
  stopSpeech();flushDraft();handoff.close();++viewIntent;
  if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;render();}
  waitProject={id:s.id,owner:s.owner};
  waitArcade.open({
   projectName:s.name,status:unknownJobs.has(s.id)?'reconnecting':latest.job.status as WorkshopStatus,
   isReady:!!ready,
   onClose:()=>{waitProject=null;if(activeId&&owner()===s.owner&&route==='studio')render();},
   onBackToStudio:()=>act(async()=>{
    if(owner()!==s.owner)return;
    await open(s.id,false);
    if(owner()===s.owner&&activeId===s.id&&route==='studio')setTab('talk');
   }),
   onPlayReady:()=>act(async()=>{
    if(owner()!==s.owner)return;
    const fresh=notebook.get(s.id,s.owner),candidate=readyExperiment(fresh);
    if(!candidate?.candidate.remoteId)return;
    await open(s.id,false);
    const newest=notebook.get(s.id,s.owner),selected=readyExperiment(newest);
    if(selected?.candidate.remoteId)await showRemote(newest,selected.candidate.remoteId,'candidate',selected.id);
   })
  });
 }
 function refreshShelf(){
  const inConversation=route==='studio'&&activeId&&(panel==='talk'||notebook.list(owner()).some(s=>s.id===activeId&&s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate));
  if(inConversation){if(buildShelf.parentElement!==extraTools)extraTools.append(buildShelf);}
  else if(buildShelf.parentElement!==globalStatus.parentElement)globalStatus.after(buildShelf);
  const jobs=notebook.list(owner()).filter(s=>!s.archived&&s.job&&(busy(s)||s.job.status==='failed'||!!readyExperiment(s)));
  buildShelf.replaceChildren();buildShelf.hidden=!jobs.length;if(!jobs.length)return;
  buildShelf.append(iconEl('strong','','clock','My builds & tests'));
  const items=el('div','studio-build-items');
  for(const s of jobs.slice(0,4)){
   const state=readyExperiment(s)?s.projectId||s.remoteId?'Your change is ready':'Your game is ready':s.job!.status==='failed'?'Build needs help · current game safe':
    unknownJobs.has(s.id)||remote.mode!=='remote'?'Status unknown · checking connection':s.job!.status==='queued'?'Waiting for builder':s.job!.phase==='repairing'?'Trying a fix':
    s.job!.status==='testing'?'Testing your game':'Building your idea';
   const item=el('div','studio-build-item'),copy=el('div','studio-build-copy'),controls=el('div','studio-build-item-actions');
   copy.append(el('strong','',s.name),el('span','',state));
   const openButton=iconEl('button','studio-button','play',readyExperiment(s)?s.projectId||s.remoteId?'Try ready test':'Play my game':'Open game') as HTMLButtonElement;
   openButton.type='button';openButton.onclick=()=>act(async()=>{
    if(guardMath())return;
    const latest=notebook.get(s.id,s.owner);
    if(readyExperiment(latest))await openReadySession(s.id,s.owner);else await open(s.id);
   });controls.append(openButton);
   if(busy(s)){
    const stop=iconEl('button','studio-button studio-stop-build','stop','Stop build') as HTMLButtonElement;
    stop.type='button';stop.setAttribute('aria-label','Stop build for '+s.name);
    stop.onclick=()=>{
     stop.disabled=true;setIconLabel(stop,'stop','Stopping…');
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
   if(busy(s)){
    const mini=el('button','studio-button studio-wait-arcade-button','💎 Mind Your Jems!') as HTMLButtonElement;
    mini.type='button';mini.setAttribute('aria-label','Play Mind Your Jems while '+s.name+' is building');
    mini.onclick=()=>act(()=>playWhileBuilding(s));controls.prepend(mini);
   }
   item.append(copy,controls);items.append(item);
  }
  buildShelf.append(items);
  if(jobs.some(busy)){
   const actions=el('div','studio-build-actions'),play=iconEl('button','studio-button','play','Ready to Play jems') as HTMLButtonElement;
   if(route==='studio'&&activeId&&jobs.some(s=>s.id===activeId)){
    const keep=iconEl('button','studio-button','play','Keep playing') as HTMLButtonElement;
    keep.type='button';keep.onclick=()=>act(playViewed);actions.append(keep);
   }
   play.type='button';play.onclick=()=>act(home);
   const practice=iconEl('button','studio-button','book','Extra practice (optional)') as HTMLButtonElement;
   practice.type='button';practice.onclick=()=>act(()=>{if(guardMath())return;stopSpeech();flushDraft();disposeGame();FG.app.page('lab');route='other';});
   actions.append(play,practice);buildShelf.append(actions);
  }
 }
 let renderedMakerOwner='',renderedMakerCharacter:'spark'|'nova'|null=null;
 function updateProfile(){
  const child=FG.store.current(),makerOwner=owner(),character=notebook.avatar(makerOwner);
  // A choice can also change in another tab. Clear old cosmetic notifications
  // only when the rendered identity actually changes; ordinary saves keep them.
  if(renderedMakerOwner&&(renderedMakerOwner!==makerOwner||renderedMakerCharacter!==character)){
   clearRewardCelebration();window.dispatchEvent(new Event('jems:maker-changed'));
  }
  renderedMakerOwner=makerOwner;renderedMakerCharacter=character;profileSummary.replaceChildren();
  if(character)profileSummary.append(createMakerIdentity({ownerId:makerOwner,character,level:builderJourney(notebook.list(makerOwner),makerOwner).level}));
  else profileSummary.append(el('span','',child.icon||'⭐'));
  profileSummary.append(el('span','',child.name));profileSummary.setAttribute('aria-label','Switch player. Current player: '+child.name);profileSummary.title='Switch player';profileMenu.open=false;
 }
 updateProfile();
 function focusView(target:HTMLElement){if(!target.isConnected||target.closest('[hidden],.hidden,[inert]'))return;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});}
 function guardMath(){if(!FG.learning.active)return false;status('Your learning activity is still here. Finish it, or choose My Games to leave.');FG.learning.focus?.();return true;}
 function readyExperiment(s:StudioSession){return readyGuidedExperiment(s);}
 function refreshStudioGuide(){
  if(!activeId||route!=='studio'||FG.learning.active||panel==='versions'){studioGuideHost.hidden=true;return;}
  // The learning host can announce disposal while a profile switch is between
  // its owner change and Studio's reset. Never read the previous owner's view.
  const s=notebook.list(owner()).find(session=>session.id===activeId);
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
   action={label:'Done for now',run:()=>act(()=>{home();status('Your chosen version is kept. Find it here when you come back.');})};
  }else{
   action={label:'Try one change',run:()=>act(()=>{if(setTab('talk'))focusView($('studioPrompt'));})};
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
  const s=notebook.get(id,capturedOwner);
  if(s.archived)return;
  if(route!=='studio'||activeId!==id)await open(id,false);
  if(owner()!==capturedOwner||route!=='studio'||activeId!==id)return;
  const latest=notebook.get(id,capturedOwner),ready=readyExperiment(latest);
  if(ready?.candidate.remoteId)await showRemote(latest,ready.candidate.remoteId,'candidate',ready.id);
  else if(latest.candidate)await playCandidate();
  else if(latest.projectId||latest.remoteId)await playWorking();
  else setTab('talk');
 }
 async function continueRecommended(id:string,capturedOwner:string){
  if(owner()!==capturedOwner||guardMath())return;
  const s=notebook.get(id,capturedOwner);
  if(s.archived||s.resumeDismissed){renderLibrary();return;}
  if(readyExperiment(s)){await openReadySession(id,capturedOwner);return;}
  if(s.candidate){await open(id,false);if(owner()===capturedOwner&&activeId===id&&route==='studio')await playCandidate();return;}
  if(busy(s)||s.job?.status==='failed'||s.draft.trim()||!s.projectId&&!s.remoteId){
   await open(id,false);if(owner()===capturedOwner&&activeId===id&&route==='studio')setTab('talk');return;
  }
  await open(id);
 }

 const stageFor=(s:StudioSession)=>gemStage(s);
 const levelForOwner=()=>builderJourney(notebook.list(owner()),owner());
 const stageNumber=(stage:GemStage)=>({none:0,rough:1,cut:2,polished:3})[stage];
 const progressSnapshot=(s:StudioSession)=>({stage:stageFor(s),level:builderJourney(notebook.list(s.owner),s.owner).level});
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
  if(chatIsVisible()||notebook.pendingRewards(owner()).length)return;
  celebrateJem(kind,anchorId,{character:notebook.avatar(owner()),level:levelForOwner().level});
 }
 function renderJourney(){
  const progress=levelForOwner();
  journey.render({ownerId:owner(),level:progress.level,character:notebook.avatar(owner()),polishedCount:progress.polishedCount,nextAction:progress.nextAction,primaryActionLabel:journeyContinuation()?'Continue my jem':'Make a jem'});
 }
 function journeyContinuation(){
  const sessions=notebook.list(owner()).filter(s=>!s.archived&&!busy(s));
  return sessions.find(s=>gemStage(s)==='cut')||sessions.find(s=>gemStage(s)==='rough')||null;
 }
 function hideJourney(){journey.closeCharacterPicker(false);journey.element.hidden=true;journey.element.classList.add('hidden');}
 function openJourney(choose=false){
  if(guardMath())return;stopSpeech();flushDraft();FG.creation?.flush();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');
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
  const progress=levelForOwner(),character=notebook.avatar(owner());
  homeCharacters.replaceChildren(createMakerIdentity({ownerId:owner(),character,level:progress.level}));
  homeCharacters.classList.remove('is-pair');
  setIconLabel(homeCharacterLink,'star',character?'My journey':'Choose your maker');
  gemSummary.hidden=progress.level===0;gemSummary.replaceChildren();
  if(progress.level===0)return;
  const open=el('button','jems-builder-open') as HTMLButtonElement;open.id='studioJourneyOpen';open.type='button';
  const art=createJourneyRankThumbnail(character,progress.level),copy=el('span','jems-builder-copy');
  art.classList.add('jems-builder-portrait');
  copy.append(el('small','','My journey · Level '+progress.level),el('strong','',progress.name));
  const steps=el('span','jems-builder-steps');steps.setAttribute('aria-hidden','true');
  for(let level=1;level<=4;level++){const gem=createJourneyGem(level);gem.classList.toggle('is-earned',level<=progress.level);steps.append(gem);}
  const arrow=el('span','jems-builder-arrow');arrow.append(createIcon('arrow'));open.append(art,copy,steps,arrow);open.onclick=()=>act(()=>openJourney());gemSummary.append(open);
 }
 function onSavedDesignChange(before:StudioSession,after:StudioSession){
  if(before.owner!==owner()||after.owner!==owner()||before.id!==activeId)return;
  const previous=notebook.list(before.owner).map(s=>s.id===before.id?before:s);
  const achievement=gemAchievement({stage:stageFor(before),level:builderJourney(previous,before.owner).level},after);
  // Update decoration only: typing in a test note or plan must retain focus.
  renderGemBadge(after);updateProfile();refreshBuildAction();
  if(route==='journey')renderJourney();else if(route==='library')renderHomeProgress();
  if(achievement&&!FG.learning.active)celebrateProgress(achievement);
 }
 function current(){if(!activeId)throw Error('Choose a project first.');return notebook.get(activeId,owner());}
 function refreshBuildAction(){
  if(!activeId)return;
  const s=current(),creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  const readiness=creating?(coaching?.buildReadiness()||creationBuildReadiness({...s,draft:$<HTMLTextAreaElement>('studioPrompt').value},s.design?.creationStandard===2?2:1)):null;
  const pending=sending.has(s.id)||saving,uncertain=unknownJobs.has(s.id)||unconfirmedSubmissions.has(s.id);
  $<HTMLButtonElement>('studioSend').hidden=false;
  $<HTMLButtonElement>('studioSend').disabled=pending||!reflecting&&uncertain||creating&&(busy(s)||!readiness?.ready);
  const hasIdea=s.messages.some(message=>message.role==='child');
  const reconnect=['limited','unavailable','sign-in'].includes(coachConnection);
  buildReason.textContent=creating?(pending?'Getting your build ready…':unconfirmedSubmissions.has(s.id)?'The workshop has not confirmed this request. Your idea is safe.':uncertain?'Check your last build before starting another.':busy(s)?'Your game is already building.':readiness?.ready?'':
   !hasIdea?'Tell me your game idea first.':$<HTMLTextAreaElement>('studioPrompt').value.trim()?'Send your new thought first.':
   reconnect?'Chat needs to reconnect to check your idea.':readiness?.reason||'Let’s check your idea together.') : '';
  checkIdea.hidden=!creating||pending||busy(s)||uncertain||!!readiness?.ready||!coaching?.canReassess();
  setIconLabel(checkIdea,'retry',reconnect?'Reconnect chat':'Check my idea');
  buildGuidance.hidden=!creating||(!buildReason.textContent&&checkIdea.hidden);
 }
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
  if(tab!=='talk'){stopSpeech();handoff.close();}
  if(tab!=='game'){
   ++viewIntent;flushDraft();
   if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}
  }
  panel=tab;if(tab==='talk'){clearRewardCelebration();document.getElementById('jems-delight-host')?.replaceChildren();}document.body.classList.toggle('studio-designing',tab==='talk');
  $('page-studio').querySelector('.studio-workspace')!.setAttribute('data-mobile-panel',tab);
  document.querySelectorAll('[data-studio-tab]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.studioTab===tab)));
  if(tab==='versions'){$('studioVersions').hidden=false;renderVersions();focusView($('studioVersionsTitle'));}else $('studioVersions').hidden=true;
  if(tab==='talk'){focusView($('studioPromptLabel'));void privateSpeech?.refresh();}
  refreshStudioGuide();refreshShelf();
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
 function openPractice(subject?:'math'|'language'){
  if(guardMath())return;stopSpeech();flushDraft();FG.creation?.flush();
  // The existing learning host enforces the grown-up's allowed subject choices.
  if(subject&&FG.learning.subject!==subject)FG.learning.setSubject(subject);
  refreshLearningChoice();hideJourney();disposeGame();FG.app.page('lab');route='other';
 }
 function openRewardActivity(activity:RewardsActivity){
  if(activity==='making'){newIdea();return;}
  if(activity==='coding'){
   if(FG.creation?.openChallenges)FG.creation.openChallenges();else status('Create & code is still opening. Try again in a moment.');
   return;
  }
  openPractice(activity);
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
 function renderLibrary(){
  refreshLearningChoice();
  const entries=notebook.list(owner()),box=$('studioLibrary');box.replaceChildren();
  // Import references to existing local remixes without copying or migrating their data.
  for(const p of games.list(owner())) if(!entries.some(s=>s.projectId===p.id))entries.push({...notebook.create(owner(),p.game,p.name,p.id)});
  const next=recommendNext(entries,owner(),notebook.last(owner())?.id);$('studioContinue').replaceChildren();
  const last=next?entries.find(session=>session.id===next.sessionId):null;
  if(last&&next){
   const banner=el('div','studio-continue'),art=el('span','studio-continue-art',icon[last.game]),description=el('div','studio-continue-copy');
   banner.dataset.nextKind=next.kind;
   art.setAttribute('aria-hidden','true');
   description.append(el('span','studio-next-kind',next.title),el('strong','',last.name),el('span','studio-next-description',next.description));
   const continueButton=iconEl('button','studio-button studio-primary',next.kind==='ready'||next.kind==='play'||next.kind==='experiment'?'play':'edit',next.action) as HTMLButtonElement;
   continueButton.type='button';continueButton.id='studioContinuePlaying';continueButton.onclick=()=>act(()=>continueRecommended(last.id,last.owner));
   const dismiss=iconEl('button','studio-continue-close','close','') as HTMLButtonElement;
   dismiss.type='button';dismiss.id='studioDismissResume';dismiss.title='Dismiss reminder';
   dismiss.setAttribute('aria-label','Dismiss reminder for '+last.name);
   dismiss.onclick=()=>act(()=>{notebook.dismissResume(last.id,last.owner);renderLibrary();});
   banner.append(art,description,continueButton,dismiss);$('studioContinue').append(banner);
  }
  const saved=entries.filter(s=>!s.archived&&(!s.playOnly||s.experiments?.length||s.candidate));
  renderHomeProgress();
  const archived=entries.filter(s=>s.archived);
  $('studioSavedSection').hidden=!saved.length&&!archived.length;
  $('studioStarterTitle').textContent='Ready to Play jems';
  saved.forEach(s=>{
   const card=el('article','studio-library-card studio-saved-card');card.setAttribute('data-session',s.id);
   const state:'building'|'ready'|'playable'|'idea'=busy(s)?'building':readyExperiment(s)||s.candidate?'ready':s.projectId||s.remoteId?'playable':'idea';
   const label={building:'Working on your idea',ready:'A test is ready to try',playable:'Ready to play',idea:'Idea · not built yet'}[state];
   const badge={building:'Tools at work',ready:'Test ready',playable:'Playable jem',idea:'Your idea'}[state];
   card.dataset.jemsState=state;
   const openButton=el('button','studio-saved-open') as HTMLButtonElement;
   openButton.type='button';openButton.setAttribute('aria-label','Open '+s.name);
   const cardAction=state==='ready'?s.projectId||s.remoteId?'Try my change':'Play my game':state==='idea'?'Open my idea':'Open my game';
   openButton.append(el('span','jems-project-badge',badge),el('span','studio-card-icon',icon[s.game]),el('span','studio-card-name',s.name),el('span','studio-card-state',label),iconEl('span','studio-card-link','arrow',cardAction));
   const stage=stageFor(s);
    if(stage!=='none'){
     const gemLabel=el('span','jems-gem-status');
     const gemArt=createJourneyGem(stageNumber(stage));
     gemLabel.append(gemArt,el('span','',GEM_STAGE_LABELS[stage]));openButton.append(gemLabel);
    }
    openButton.onclick=()=>act(()=>state==='ready'?openReadySession(s.id,s.owner):open(s.id));
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
   moon:'Chase donuts through moonlight.',robot:'Guide your robot through tricky routes.',
   factory:'A little polish. A whole lot of sparkle!'
  };
  const companions:Record<GameId,string>={gum:'🫧',hill:'⚙️',buckets:'🍅',dragon:'🛡️',moon:'🍩',robot:'🧩',factory:'✨'};
  const worldLabels:Record<GameId,string>={gum:'BUILD',hill:'RACE',buckets:'SURPRISE',dragon:'DRAGON',moon:'SPACE',robot:'ROBOT',factory:'MAKE IT SPARKLE'};
  const worldScenes:Partial<Record<GameId,string>>={
   buckets:'./jems-world-buckets.svg',dragon:'./jems-world-dragon.svg',
   moon:'./jems-world-moon.svg',robot:'./jems-world-robot.svg',factory:'./gem-factory-workshop.webp'
  };
  (['factory','gum','hill','buckets','dragon','moon','robot'] as GameId[]).forEach(game=>{
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
   info.append(el('span','studio-card-name',names[game]),el('span','studio-card-state',descriptions[game]),iconEl('span','studio-card-link','play','Play & make it yours'));
   b.append(art,info);b.onclick=()=>act(()=>start(game));starters.append(b);
  });installQualityCards();updateCreationNote();refreshWelcome();
 }
 function home(){stopSpeech();flushDraft();handoff.close();closeJourneyMap();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('home');document.querySelectorAll('main > .page').forEach(p=>p.classList.add('hidden'));library.classList.remove('hidden');route='library';renderLibrary();setActiveNav('studioNavHome');window.scrollTo(0,0);focusView(welcome.element.hidden?$('studioLibraryTitle'):$('studioWelcomeTitle'));}
 function homeFromNavigation(){
  // The first invitation has no competing Explore action. After choosing a
  // character, an intentional Home action can still open the ordinary library.
  if(route==='library'&&!welcome.element.hidden&&notebook.avatar(owner()))notebook.dismissWelcome(owner());
  home();
 }
 function openSavedIdeas(){
  if(guardMath())return;stopSpeech();flushDraft();FG.creation?.flush();hideJourney();
  $<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('creations');route='other';
  document.body.classList.remove('studio-designing');setActiveNav('studioNavHome');focusView(collectionTitle);
 }
 function start(game:GameId){
  const existing=notebook.list(owner()).find(s=>s.game===game&&s.playOnly);if(existing)return open(existing.id);
  const p=games.create(owner(),game,`My ${names[game]}`,defaults(game,FG.store.current().remixes?.[game]||'classic'));
  const s=notebook.create(owner(),game,p.name,p.id);notebook.update(s.id,s.owner,x=>{x.playOnly=true;});message(s,'helper','Play first. When you want to test an idea, your original game stays safe.');return open(s.id);
 }
 function leaveCreationForStudio(){
  if(guardMath())return false;
  const creationPage=document.getElementById('page-creation');
  if(!creationPage||creationPage.classList.contains('hidden'))return true;
  // Save the scene before changing Studio selection. The normal page event
  // stops its player, recording and checkpoint clock; hiding DOM alone cannot.
  creation.flush();FG.app.page('home');return true;
 }
 function newIdea(){if(!leaveCreationForStudio())return;flushDraft();const s=notebook.create(owner(),'new','My new idea');notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.creationStandard=2;});return open(s.id);}
 async function open(id:string,autoPlay=true){
  if(!leaveCreationForStudio())return;
  stopSpeech();flushDraft();handoff.close();moreChoices.open=false;disposeGame();notebook.select(id,owner());activeId=id;keptInThisView=null;reflecting=false;lastOutcome=null;showing='working';status('');
  const s=current();if(s.candidate&&!s.experiments?.some(e=>e.id===s.candidate!.id))notebook.saveExperiment(s.id,s.owner,s.candidate,[],'tune','helper');coaching?.openSession();$<HTMLTextAreaElement>('studioPrompt').value=s.draft;globalStatus.textContent='';$<HTMLDetailsElement>('studioMore').open=false;showStudio();render();setTab('game');focusView($('studioTitle'));
  if(autoPlay){if(s.projectId||s.remoteId)await playWorking();else if(s.candidate)await playCandidate();else if(readyExperiment(s))await openReadySession(s.id,s.owner);else{$('studioEmpty').hidden=false;setTab('talk');}}
  if(s.job&&busy(s)&&remote.mode==='remote'&&s.job.api===remote.apiBaseUrl&&!clients.has(s.id))resume(s);
 }
 function renderConversation(){
  if(!activeId)return;const s=current(),box=$('studioMessages');
  const atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  const messages=visibleConversation(s.messages).filter(m=>!(s.game==='new'&&m.role==='helper'&&m.text.startsWith('Tell jems what you imagine. One sentence is enough.')));
  const signature=JSON.stringify(messages.map(m=>[m.id,m.text]));
  if(box.dataset.session===s.id&&box.dataset.signature===signature)return;
  const sameSession=box.dataset.session===s.id,earlierWasOpen=sameSession&&box.querySelector<HTMLDetailsElement>('.studio-earlier-messages')?.open;
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
   (index<messages.length-4?earlier:box).append(article);
  }
  if(!sameSession||atEnd)box.scrollTop=box.scrollHeight;
 }
 function render(){
  if(!activeId)return;const s=current(),working=s.projectId?games.revision(s.projectId,s.owner):null;refreshShelf();
  refreshGameSubject();FG.learning.modeControl($('studioMathMode'),s.id);$('studioTitle').textContent=s.name;$('studioStorage').textContent=s.remoteId||s.candidate?.remoteId?'Private family game · local conversation':'Saved on this device';
  renderGemBadge(s);
  const sceneAction=$('studioMakeScene');
  if(sceneAction)setIconLabel(sceneAction,'grid',s.remoteId||s.candidate?.remoteId||['dragon','buckets','robot'].includes(s.game)&&s.projectId?'Animate & code':'Start a separate scene');
  const n=s.projectId?games.history(s.projectId,s.owner).findIndex(r=>r.id===working?.id)+1:0;
  $('studioVersion').textContent=showing==='candidate'?((s.experiments||[]).find(e=>e.id===s.candidate?.id)?.label||'Preview')+' · my main game is safe':showing==='history'?'Trying an earlier version':working?`My main game · version ${n}`:s.remoteId?'My main game':'My idea · ready to imagine';
  $('studioPreviewNotice').hidden=showing==='working';
  const creating=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  const hasIdea=creating&&s.messages.some(m=>m.role==='child');
  page.classList.toggle('studio-creating',creating);
  artEntries?.setCreating(creating);
  page.classList.toggle('studio-idea-unstarted',creating&&!hasIdea);
  page.classList.toggle('studio-idea-started',creating&&hasIdea);
  creationHero.hidden=!creating||hasIdea;
  ideaSparks.hidden=!creating;
  if(!creating)ideaSparks.open=false;
  if(creating){$('studioTitle').textContent='Make a game';if(doneForNow.parentElement!==extraTools)extraTools.append(doneForNow);}
  else if(doneForNow.parentElement!==page.querySelector('.studio-heading'))page.querySelector('.studio-heading')!.append(doneForNow);
  $('studioAvailability').textContent=coachConnectionCopy(configReady?coachConnection:'checking');
  connectionHint.textContent=!configReady||coachConnection==='checking'?'Checking chat…':coachConnection==='sign-in'?'Chat needs a grown-up to reconnect.':['limited','unavailable'].includes(coachConnection)?'Chat is disconnected. Your idea is saved.':'';
  connectionHint.hidden=!connectionHint.textContent;
  workshopNote.textContent=builderReadinessCopy(configReady?builderReadiness:'checking');
  const progress=buildProgressCopy(s.job?{status:s.job.status,phase:s.job.phase}:undefined,sending.has(s.id),unknownJobs.has(s.id)||unconfirmedSubmissions.has(s.id));
  progressBanner.hidden=!progress;
  arcadeButton.hidden=!busy(s);
  progressBanner.dataset.phase=progress?.phase||'';
  progressTitle.textContent=progress?.title||'';
  progressDetails.textContent=progress?.description||'';
  $('studioConversation').dataset.helperState=s.design?.paused||progress?.phase==='cancelled'?'rest':'wave';
  
  $<HTMLButtonElement>('studioPlay').disabled=!(working||s.remoteId||s.candidate);
  $<HTMLButtonElement>('studioKeep').disabled=!s.candidate||showing!=='candidate'||saving||!!s.candidate.remoteId&&!previewLearning?.ready;$('studioKeep').hidden=!s.candidate||showing!=='candidate';$('studioReady').hidden=!readyExperiment(s);setIconLabel($('studioReady'),'play',s.projectId||s.remoteId?'Try your ready test':'Play my game');$<HTMLButtonElement>('studioHelp').disabled=!(s.projectId||s.remoteId||s.candidate);setIconLabel($('studioPlay'),'play',pausedForTools?'Back to my game':'Play');
  $<HTMLButtonElement>('studioUndo').disabled=!s.candidate&&!working?.parentId&&!s.remoteId;
  $<HTMLButtonElement>('studioRedo').disabled=!!s.candidate||(!s.undone&&(!working||!games.history(s.projectId!,s.owner).some(r=>r.parentId===working.id)));
  $<HTMLButtonElement>('studioCopy').disabled=!(working||s.remoteId||s.candidate)||saving;
  refreshBuildAction();
  $<HTMLButtonElement>('studioTalk').disabled=reflecting;
  $('studioPromptLabel').textContent=reflecting?'What did you notice?':creating?(hasIdea?'Your answer or idea':'Tell me your game idea'):'What would you like to change?';
  // The coach's saved review, not the presence of a first idea, enables Build.
  $<HTMLTextAreaElement>('studioPrompt').required=!(creating&&s.messages.some(m=>m.role==='child'));
  setIconLabel($('studioSend'),reflecting?'save':creating?'add':'arrow',reflecting?'Save thought':creating?'Build my game':'Try a change');
  $('studioReflection').hidden=!s.reflection;$('studioCancel').hidden=!busy(s);$('studioRetry').hidden=unconfirmedSubmissions.has(s.id)||!s.job||(s.job.status!=='failed'&&!unknownJobs.has(s.id));
  setIconLabel($('studioRetry'),unknownJobs.has(s.id)?'clock':'retry',unknownJobs.has(s.id)?'Check build status':'Try build again');
  const retryBlock=retryBlocks.get(s.id);
  $<HTMLButtonElement>('studioRetry').disabled=sending.has(s.id)||saving||!unknownJobs.has(s.id)&&retryBlock?.jobId===s.job?.id;
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
  const boundRevision=s.projectId?games.revision(s.projectId,s.owner,revisionId??(view==='candidate'?s.candidate?.baseId??undefined:undefined)):null;
  FG.app.openGame(s.game,{config,stateKey:key,drawingRigId:boundRevision?.drawingRigId??null,projectId:s.id,onOutcome:(outcome:PlayOutcome)=>{
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
  const touchHelp:Record<string,string>={factory:'Find the next gem in the pattern. Tap a bucket, use the glowing machines, then choose paper and send your gift!',moon:'Tap Left or Right to run, and Jump to leap over meteors.',robot:'Tap the arrows to plan a route, then Run to test it.',gum:'Tap a part to add it. Drag to move it. Choose Gum, then another part to stick them together. Choose Test machine to try it.',hill:'Hold the right pedal to drive. Hold the left pedal to brake. You can change your ride in the garage.',buckets:'Tap a bucket to choose it. Watch what happens, then try another round.',dragon:'Use the arrow buttons to move. Tap the jump button to bounce fireballs with your shield.'};
  const viewedConfig=showing==='candidate'?s.candidate?.config:s.projectId?games.revision(s.projectId,s.owner,showing==='history'?viewedRevisionId||undefined:undefined).config:undefined;
  const oldConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===0;
  const physicalConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===1;
  const stickerConstruction=native&&s.game==='gum'&&viewedConfig?.qualityVersion===2;
  $('studioHelpControls').textContent=stickerConstruction?'Choose a sticker and tap a bubble on the machine, or drag a sticker onto a bubble. Add three, then tap Make it GO!':physicalConstruction?(touch?touchHelp.gum:'Choose a part from the tray, place it on the canvas, attach parts with gum and test your machine.'):oldConstruction?'Choose a part in your build, then use the move, turn and connect controls shown below it. Try your machine and change it again.':native&&touch?touchHelp[s.game]:native?FG.games[s.game]?.controls||'Use the controls in your game.':'Tap the game first, then use its buttons or keyboard controls.';
  $('studioHelpKeyboard').textContent=stickerConstruction?'Press Tab to choose a sticker, Enter to select it, then Tab and Enter to place it on a bubble.':physicalConstruction?'Use Tab to reach parts and tools, Enter to select them, arrow keys to move a chosen part, and R to rotate it.':oldConstruction?'Use Tab and Enter to choose parts and construction controls.':'Use Tab to reach controls and Enter to choose. How a character moves depends on this game.';
  focusView($('studioHelpTitle'));
 }
 async function submit(request?:{prompt:string;displayText?:string;compiledPlan?:boolean}){
  if(guardMath())return;stopSpeech();flushDraft();const s=current(),typed=s.draft.trim(),started=epoch;
  let prompt=request?.prompt||typed||(s.game==='new'&&!s.remoteId?s.messages.find(m=>m.role==='child')?.text.trim()||'':'');if(!prompt)return;
  const consumedDraft=!request||request.compiledPlan||request.prompt.trim()===typed?s.draft:undefined;
  const clearConsumedDraft=()=>{
   if(consumedDraft===undefined)return;
   notebook.update(s.id,s.owner,x=>{if(x.draft===consumedDraft)x.draft='';});
   if(sameView(s,started)&&$<HTMLTextAreaElement>('studioPrompt').value===consumedDraft)$<HTMLTextAreaElement>('studioPrompt').value='';
  };
  if(reflecting&&!request){
   const before=progressSnapshot(s);
   notebook.observe(s.id,s.owner,prompt,'child',s.design?.observations.filter(o=>o.source==='runtime').at(-1)?.experimentId||null);
   message(s,'reflection',prompt);notebook.update(s.id,s.owner,x=>{x.draft='';x.reflection=false;});
   reflecting=false;$<HTMLTextAreaElement>('studioPrompt').value='';
   const achievement=gemAchievement(before,notebook.get(s.id,s.owner));
   render();if(achievement){updateProfile();celebrateProgress(achievement);}return;
  }
  if(sending.has(s.id)){status('Sending the earlier request. Your ideas and game are safe.');return;}
  if(unknownJobs.has(s.id)||unconfirmedSubmissions.has(s.id)){status('The last request is not confirmed. Your new thought is saved; no second build was sent.');return;}
  const mathRequest=interpretLearningRequest(prompt,FG.learning.subject);
  if(mathRequest){message(s,'child',prompt);notebook.update(s.id,s.owner,x=>{x.reflection=false;});if(mathRequest.kind==='required'){message(s,'helper',mathRequest.message);}else{FG.learning.setMode(s.id,mathRequest.mode);message(s,'helper',`Learning format set to ${learningFormatLabel(FG.learning.subject,mathRequest.mode)}. It applies at the next safe learning moment; your game rules and learning history stay together.`);clearConsumedDraft();}render();return;}
  if(await coaching?.intercept(prompt,true))return;if(!sameView(s,started))return;
  const decision=coaching?.details()||{continueTest:false,parents:[],depth:'tune' as const,origin:'child' as const};
  const firstBuild=s.game==='new'&&!s.projectId&&!s.remoteId&&!s.candidate;
  if(firstBuild){
   const readiness=coaching?.buildReadiness()||creationBuildReadiness(current(),current().design?.creationStandard===2?2:1);
   if(!readiness.ready){status(readiness.reason);return;}
   prompt=coaching?.buildPrompt(request?.compiledPlan?typed:request?.prompt||typed)||prompt;
   // The request contains the full agreed plan; the conversation contains only
   // the child's words. A Build gesture is already acknowledged by its handoff.
   if(!request&&typed&&!current().messages.some(m=>m.role==='child'&&m.text===typed))message(s,'child',typed);
  }else message(s,'child',request?.displayText||prompt);
  notebook.update(s.id,s.owner,x=>{x.reflection=false;x.playOnly=false;});
  if(s.projectId&&!s.remoteId&&!s.candidate?.remoteId){
    const working=games.revision(s.projectId,s.owner),config=decision.continueTest&&s.candidate?.config?s.candidate.config:working.config;
    const intent=interpret(s.game as GameId,config,prompt);
    if(intent.kind==='supported'){
      const before=progressSnapshot(notebook.get(s.id,s.owner));
      const c:Candidate={id:crypto.randomUUID(),baseId:decision.continueTest&&s.candidate?s.candidate.baseId:working.id,config:intent.config,prompt,summary:intent.summary};
      games.clonePlayState(s.owner,decision.continueTest&&s.candidate?s.candidate.id:working.id,c.id);
      notebook.saveExperiment(s.id,s.owner,c,decision.parents,decision.depth,decision.origin);
      const achievement=gemAchievement(before,notebook.get(s.id,s.owner));if(achievement){updateProfile();celebrateProgress(achievement);}
      // Keep the concurrent AI build and its exact starting revision.
       clearConsumedDraft();
      message(s,'helper',`${intent.summary}. This is a test. Play it before choosing Make this my main game.`);await playCandidate();return;
    }
    if(intent.kind!=='generation-needed'){message(s,'helper',intent.message);render();return;}
  }
  if(busy(s)){status('Your game is still building. This idea is saved.');render();return;}
   if(remote.mode!=='remote'){
    status('Building is offline. Your idea is saved.',true);beginBuildHandoff(s,{phase:'unavailable'});render();return;
  }
  const chosenBase=decision.continueTest?s.candidate:null;
  const baseId=chosenBase?.remoteId||s.remoteId||(chosenBase?.config?chosenBase.id:s.projectId?games.revision(s.projectId,s.owner).id:null);
  notebook.update(s.id,s.owner,x=>{x.pendingExperiment={parents:decision.parents,depth:decision.depth,origin:decision.origin,baseId,prompt};});
  if(consumedDraft!==undefined)submittedDrafts.set(s.id,consumedDraft);else submittedDrafts.delete(s.id);
  await build(s,prompt,decision.continueTest);
 }
 function clientFor(s:StudioSession){
  let c=clients.get(s.id);if(c)return c;
  c=new BuilderClient(remote,job=>{void onJob(s,job).catch(e=>{if(activeId===s.id&&owner()===s.owner){updateBuildHandoff(s,{phase:'uncertain'});status('Could not save the build status. Keep this page open. Your current game is safe.',true);}});});clients.set(s.id,c);return c;
 }
 async function build(s:StudioSession,prompt:string,continueTest=false){
  sending.add(s.id);moreChoices.open=false;const identity=beginBuildHandoff(s,{phase:'sending'});render();status('Sending your idea…');
  const r=s.projectId?games.revision(s.projectId,s.owner):null;
  const chosen=continueTest?s.candidate:null;
  const input={gameId:s.remoteId||chosen?.remoteId?(isGeneratedRemoteKind(s.remoteKind)?'generated-module':'star-catcher'):s.game,baseRevisionId:chosen?.remoteId||s.remoteId||(chosen?.config?chosen.id:r?.id)||null,prompt,...(r&&!s.remoteId&&!chosen?.remoteId?{config:chosen?.config||r.config}:{})};
  // Request admission ends at the durable ACK, not when a game finishes building.
  // Continue status polling independently while a child plays or makes other edits.
  void clientFor(s).submit(input).catch(error=>{
   if(owner()!==s.owner||buildAttempts.get(s.id)?.attemptId!==identity.attemptId)return;
   const saved=notebook.get(s.id,s.owner);
   if(saved.job&&busy(saved)&&saved.job.api===remote.apiBaseUrl&&saved.job.id!==s.job?.id){
    unknownJobs.add(s.id);refreshShelf();resume(saved);
    updateBuildHandoff(s,{phase:'uncertain',canPlayWhileWaiting:true,recovery:'check'});
    if(activeId===s.id&&owner()===s.owner)
     status('Connection interrupted. The builder may still be working; checking again.');
   }else{
    const code=error instanceof Error?error.message:undefined;
    const knownRejection=isKnownBuildRejection(error);
    const explanation=buildErrorCopy(knownRejection?code:undefined);
    if(knownRejection&&saved.job?.id===s.job?.id){
     // No new job accepted this request. Keep the saved failed job's exact
     // experiment metadata for its retry, and leave the rejected draft alone.
     notebook.update(s.id,s.owner,x=>{x.pendingExperiment=s.pendingExperiment||null;});
     submittedDrafts.delete(s.id);
    }
    if(!knownRejection)unconfirmedSubmissions.add(s.id);
    updateBuildHandoff(s,{phase:knownRejection?'unavailable':'uncertain'});
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
  if(guardMath())return;stopSpeech();flushDraft();const s=current();
  if(!s.job||sending.has(s.id)||saving||unconfirmedSubmissions.has(s.id))return;
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
   refreshShelf();
  }finally{
   if(buildAttempts.get(s.id)?.attemptId===identity.attemptId)sending.delete(s.id);
   if(owner()===s.owner&&activeId===s.id&&route==='studio')render();
  }
 }
 async function onJob(captured:StudioSession,job:JobView){
  if(owner()!==captured.owner)return;
  const prior=notebook.get(captured.id,captured.owner);unknownJobs.delete(captured.id);unconfirmedSubmissions.delete(captured.id);
  if(retryBlocks.get(captured.id)?.jobId!==job.jobId||job.status!=='failed')retryBlocks.delete(captured.id);
  let celebratedLevel=false;
  const phase=typeof job.phase==='string'&&/^[a-z-]{1,32}$/.test(job.phase)?job.phase:undefined;
   if(prior.job?.id!==job.jobId||prior.job.status!==job.status||prior.job.revisionId!==job.revisionId||prior.job.phase!==phase)
    notebook.update(captured.id,captured.owner,s=>{s.job={id:job.jobId,api:remote.apiBaseUrl||'',status:job.status as PendingJob['status'],...(job.revisionId?{revisionId:job.revisionId}:{}),...(phase?{phase}:{})};});
  // A job acknowledgment ends the *submission* wait even while generation runs.
   // Unlock quick local edits only after the job ID and source revision are durable.
   if(sending.has(captured.id)){sending.delete(captured.id);}
   if(prior.pendingExperiment&&submittedDrafts.has(captured.id)){if(activeId===captured.id&&owner()===captured.owner)flushDraft();const submitted=submittedDrafts.get(captured.id)!;notebook.update(captured.id,captured.owner,s=>{if(s.draft===submitted)s.draft='';});if(activeId===captured.id&&owner()===captured.owner&&$<HTMLTextAreaElement>('studioPrompt').value===submitted)$<HTMLTextAreaElement>('studioPrompt').value='';submittedDrafts.delete(captured.id);}
  const texts:Record<string,string>={queued:'Your request is queued.',building:'Building a separate preview…',testing:job.phase==='repairing'?'Repairing the preview…':'Testing the preview…',ready:'Your new preview is ready.',failed:'The build did not work. Your current game is safe.',cancelled:'Build cancelled. Your current game is unchanged.'};
  if(job.status==='ready'&&job.revisionId&&!prior.experiments?.some(e=>e.candidate.remoteId===job.revisionId)){
    const pending=prior.pendingExperiment;const c:Candidate={id:crypto.randomUUID(),baseId:pending?pending.baseId:null,remoteId:job.revisionId,prompt:pending?.prompt||prior.draft,summary:job.adapter==='mock'?'New test-builder preview (mock)':'New AI-built preview'};
    const before=progressSnapshot(prior);
    notebook.saveExperiment(captured.id,captured.owner,c,pending?.parents||[],pending?.depth||'redesign',pending?.origin||'helper',false,isRealAdapter(job.adapter));
    notebook.update(captured.id,captured.owner,s=>{s.pendingExperiment=null;});
    if(owner()===captured.owner){const achievement=gemAchievement(before,notebook.get(captured.id,captured.owner));updateProfile();if(achievement&&!FG.learning.active){celebrateProgress(achievement);celebratedLevel=true;}}
  }
  if(waitProject?.id===captured.id&&waitProject.owner===captured.owner&&waitArcade.isOpen()){
   const latest=notebook.get(captured.id,captured.owner);
   if(latest.job)waitArcade.update(latest.job.status as WorkshopStatus,!!readyExperiment(latest));
  }
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
    refreshShelf();
    if(job.status==='ready'&&prior.job?.status!=='ready'&&(activeId!==captured.id||route!=='studio')&&!FG.learning.active)
     globalStatus.textContent=captured.name+' is ready to try. Your current game is safe.';
   }
 }
 const retryTimers=new Map<string,ReturnType<typeof setTimeout>>();
  function resume(s:StudioSession){
   if(!s.job||remote.mode!=='remote'||s.job.api!==remote.apiBaseUrl)return;
   void clientFor(s).resume(s.job.id).catch(()=>{
    if(owner()!==s.owner)return;
    unknownJobs.add(s.id);refreshShelf();
    updateBuildHandoff(s,{phase:'uncertain',canPlayWhileWaiting:busy(s),recovery:'check'});
    if(waitProject?.id===s.id&&waitProject.owner===s.owner&&waitArcade.isOpen())waitArcade.update('reconnecting',false);
     if(activeId===s.id){status('Connection interrupted. The build may still be running. We will check again.');if(route==='studio')render();}
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
  if(playedTest&&isRealAdapter(preview.adapter)&&!s.verifiedRemoteExperiments?.includes(playedTest)){
   const before=notebook.get(s.id,s.owner),after=notebook.verifyRemoteExperiment(s.id,s.owner,playedTest);onSavedDesignChange(before,after);
  }
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
  if(saving)return;const s=current(),c=s.candidate,at=epoch;if(!c||!canChangePlay(s,at))return;if(c.remoteId&&(!previewLearning?.ready||remoteViewedId!==c.remoteId)){status('Open this test and wait for the game before choosing it as your main game.');return;}
   const gemBefore=progressSnapshot(s);saving=true;render();
  try{
    if(c.remoteId){
     await clientFor(s).api('/v1/revisions/'+encodeURIComponent(c.remoteId)+'/keep',{});
     if(owner()!==s.owner||epoch!==at)return;
     if(s.experiments?.some(e=>e.id===c.id))notebook.keepExperiment(s.id,s.owner,c.id,{revisionId:c.remoteId,baseId:c.baseId,kind:'remote'});
     else notebook.update(s.id,s.owner,x=>{x.remoteId=c.remoteId!;x.candidate=null;x.undone=null;});
    }else if(s.projectId){
     const latest=games.revision(s.projectId,s.owner);
     if(latest.id!==c.baseId&&!confirm('This test started from an earlier main version. Make this whole test the new main game, without silently adding later changes?'))return;
     const next=games.keep(s.owner,s.projectId,latest.id,c.config!,c.prompt,s.hypothesis,c.id);
     const contentChanged=Object.entries(c.config!).some(([key,value])=>latest.config[key]!==value)||Object.keys(latest.config).some(key=>!(key in c.config!));
     if(s.experiments?.some(e=>e.id===c.id))notebook.keepExperiment(s.id,s.owner,c.id,{revisionId:next.id,baseId:c.baseId,kind:'local',contentChanged});
     else notebook.update(s.id,s.owner,x=>{x.candidate=null;x.undone=null;});
     message(s,'helper',`Kept your change. Your earlier versions are still available in Versions.`);
    }else return;
    if(sameView(s,at)){showing='working';keptInThisView=s.id;status('Kept privately. Nothing was published.');updateProfile();celebrateProgress(gemAchievement(gemBefore,notebook.get(s.id,s.owner))||'kept','studioKeep');if(!FG.learning.active)await playWorking();}
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
  const main=document.createElement('td'),mainButton=iconEl('button','studio-button','play','Main game') as HTMLButtonElement;
  mainButton.type='button';mainButton.onclick=()=>act(playWorking);main.append(mainButton);actions.append(main);
  for(const e of candidates){
   const cell=document.createElement('td'),button=iconEl('button','studio-button','play',e.label) as HTMLButtonElement;
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
    const card=el('article','studio-version-card');card.append(el('span','jems-version-badge',r.id===currentRevision.id?'Your main version':'Saved version'),el('strong','',`Version ${i+1}${r.id===currentRevision.id?' · working':''}`),el('p','',r.label));
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
  if(target.dataset.page==='creations'){event.preventDefault();event.stopImmediatePropagation();act(openSavedIdeas);}
  else if(target.id==='homeBtn'||target.id==='resultHome'||target.dataset.page==='home'){event.preventDefault();event.stopImmediatePropagation();act(homeFromNavigation);}
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
 $('studioHome').onclick=()=>act(home);$('studioNavHome').onclick=()=>act(homeFromNavigation);$('studioNew').onclick=()=>act(newIdea);$('studioNavCreate').onclick=()=>act(newIdea);$('studioChooseStarter').onclick=()=>act(home);
 $('studioNavJourney').onclick=()=>act(()=>openJourney());homeCharacterLink.onclick=()=>act(()=>openJourney(!notebook.avatar(owner())));
 $('studioNavRewards').onclick=()=>act(openRewards);
 $('studioSubjectMath').onclick=()=>chooseLearningSubject('math');$('studioSubjectLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioGameMath').onclick=()=>chooseLearningSubject('math');$('studioGameLanguage').onclick=()=>chooseLearningSubject('language');
 $('studioNavPowers').onclick=()=>act(()=>{if(guardMath())return;stopSpeech();flushDraft();hideJourney();disposeGame();FG.app.page('lab');route='other';});
 $('studioPlay').onclick=()=>act(playViewed);$('studioKeep').onclick=()=>act(keep);$('studioUndo').onclick=()=>act(undo);
 $('studioRedo').onclick=()=>act(async()=>{const s=current();if(!canChangePlay(s))return;if(s.undone){notebook.update(s.id,s.owner,x=>{x.candidate=x.undone!;x.undone=null;});await playCandidate();return;}if(!s.projectId)return;games.redo(s.owner,s.projectId);await playWorking();});
 $('studioCompare').onclick=()=>act(()=>{if(setTab('versions'))$<HTMLDetailsElement>('studioMore').open=false;});$('studioCloseVersions').onclick=()=>act(()=>{setTab('game');focusView($('studioReturnToPlay')||$('studioPlay'));});$('studioBackWorking').onclick=()=>act(playWorking);
 $('studioCopy').onclick=()=>{if(guardMath())return;stopSpeech();++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;} $<HTMLInputElement>('studioCopyName').value=current().name+' copy';$<HTMLDialogElement>('studioCopyDialog').showModal();$('studioCopyName').focus();};$('studioCopyCancel').onclick=()=>$<HTMLDialogElement>('studioCopyDialog').close();$<HTMLDialogElement>('studioCopyDialog').addEventListener('close',()=>{if(route==='studio'&&!FG.learning.active)focusView($('studioCopy'));});
 $('studioCopyForm').onsubmit=e=>{e.preventDefault();act(()=>copyGame($<HTMLInputElement>('studioCopyName').value.trim()));};
 $('studioPromptForm').onsubmit=e=>{e.preventDefault();act(submit);};
 $('studioClearChat').onclick=()=>act(()=>{
  if(guardMath())return;
  const s=current();
  if(saving){status('Let this version finish saving before clearing chat.',true);return;}
  if(busy(s)||s.pendingExperiment){status('Finish or cancel this build before clearing chat.',true);return;}
  if(!confirm('Clear this chat and its design notes on this device? Removing making evidence can lower your maker level and change your outfit. Your lifetime gems, saved game versions and any remote copies will remain.'))return;
  stopSpeech();coaching?.reset();chatOptions.open=false;
  notebook.clearConversation(s.id,s.owner);
  updateProfile();
  $<HTMLTextAreaElement>('studioPrompt').value='';
  coaching?.openSession();render();
  status('Chat and design notes cleared on this device. Saved game versions remain.');
 });
 $('studioTalk').onclick=()=>act(()=>{
  stopSpeech();
  if(!$<HTMLTextAreaElement>('studioPrompt').value.trim()){status('Type a message or choose Speak first.');return;}
  return coaching?.discuss('discuss');
 });
 $('studioPrompt').oninput=()=>{refreshBuildAction();clearTimeout(draftTimer);$('studioDraftStatus').textContent='Saving draft…';draftTimer=setTimeout(()=>act(()=>{flushDraft();$('studioDraftStatus').textContent='Draft saved on this device';}),180);};
 $('studioReflectAnswer').onclick=()=>act(()=>{if(guardMath())return;reflecting=true;setTab('talk');render();focusView($('studioPrompt'));});$('studioReflectSkip').onclick=()=>act(()=>{const s=current();notebook.update(s.id,s.owner,x=>{x.reflection=false;});coaching?.pauseReflection();reflecting=false;render();void playViewed();});
 $('studioCancel').onclick=()=>act(async()=>{const s=current();await clientFor(s).cancel();});
 $('studioRetry').onclick=()=>act(()=>recoverBuild(unknownJobs.has(current().id)?'check':'retry'));
 page.querySelectorAll<HTMLElement>('[data-studio-tab]').forEach(b=>b.onclick=()=>act(()=>{const tab=b.dataset.studioTab as 'game'|'talk'|'versions';if(tab==='game'&&pausedForTools)return playViewed();setTab(tab);}));
 window.addEventListener('factory-learning-active',event=>{refreshGameSubject();if((event as CustomEvent).detail){handoff.close();if(route==='studio'){$<HTMLDetailsElement>('studioMore').open=false;setTab('game');}}refreshStudioGuide();});
 window.addEventListener('factory-learning-subject',()=>{refreshLearningChoice();if(route==='studio'&&activeId){refreshGameSubject();FG.learning.modeControl($('studioMathMode'),activeId);}});
 window.addEventListener('factory-session-restored',()=>{void refreshServiceReadiness();if(activeId&&panel==='talk')void privateSpeech?.refresh();});
 window.addEventListener('factory-profile-before-change',event=>{try{stopSpeech();flushDraft();handoff.close();disposeGame();}catch(error){event.preventDefault();status((error as Error).message,true);}});
 window.addEventListener('factory-profile',()=>{welcomeArt=null;handoff.close();buildAttempts.clear();submittedDrafts.clear();waitArcade.close();waitProject=null;stopSpeech();hideJourney();
  // A hidden Studio DOM must never retain the previous child's transcript.
  // Clearing a browser view does not delete the former child's saved notebook.
  const conversation=$('studioMessages');conversation.replaceChildren();delete conversation.dataset.session;delete conversation.dataset.signature;$('coachProposals').replaceChildren();
  $('coachModeStatus').textContent='';$<HTMLTextAreaElement>('studioPrompt').value='';
  $('studioVoiceStatus').textContent='';
  coachConnection=remote.mode==='remote'?'checking':'unavailable';builderReadiness=remote.mode==='remote'?'checking':'not-configured';updateProfile();$<HTMLDialogElement>('studioCopyDialog').close();coaching?.reset();clearTimeout(draftTimer);clients.forEach(c=>c.disconnect());clients.clear();unknownJobs.clear();for(const timer of retryTimers.values())clearTimeout(timer);retryTimers.clear();activeId=null;reflecting=false;disposeGame();act(home);void refreshServiceReadiness();resumeOutstanding();});
 window.addEventListener('factory-art-updated',event=>{
  if((event as CustomEvent).detail?.owner!==owner())return;
  void readWelcomeArt(true);
 });
 window.addEventListener('beforeunload',event=>{stopSpeech();if(!rewardSourceWritable())return;try{flushDraft();}catch{event.preventDefault();event.returnValue='';}});
 window.addEventListener('storage',event=>{if(event.key?.startsWith('family-game-factory')){updateProfile();if(route==='library')act(renderLibrary);else if(route==='journey')act(renderJourney);else if(route==='rewards')act(renderRewards);else if(activeId)act(render);}});
 coaching=installCoaching({notebook,current,owner,message,render,status,config:()=>remote,
  onSavedDesignChange,
  onCoachReply:text=>voice?.reply(text),
  onCoachState:state=>{coachConnection=state;if(activeId)render();window.dispatchEvent(new CustomEvent('factory-coach-connection',{detail:{ownerId:owner(),state}}));},
  rules:()=>{const s=current();if(s.game==='new')return 'New game: rules are being agreed; do not invent recorded outcomes.';const r=s.projectId?games.revision(s.projectId,s.owner):null;return JSON.stringify({game:s.game,instructions:FG.games[s.game]?.instructions,controls:FG.games[s.game]?.controls,settings:r?.config,learningSubject:FG.learning.subject,editable:manifests[s.game as GameId]?.mechanics.map(m=>({key:m.key,label:m.label}))}).slice(0,2000);},
  localSupported:prompt=>{const s=current();if(!s.projectId||s.remoteId)return false;const info=coaching?.details();return interpret(s.game as GameId,info?.continueTest&&s.candidate?.config?s.candidate.config:games.revision(s.projectId,s.owner).config,prompt).kind==='supported';},
  tryRequest:async(prompt,_origin,_depth,displayText,compiledPlan)=>{await submit({prompt,displayText,compiledPlan});},
  playTest:async id=>{const s=current();if(!canChangePlay(s))return;const test=s.experiments?.find(e=>e.id===id);if(test?.candidate.remoteId){await showRemote(s,test.candidate.remoteId,'candidate',id);return;}notebook.selectExperiment(s.id,s.owner,id);await playCandidate();},playMain:playViewed,combineTests,
  pauseForThinking:()=>{if(guardMath())return false;++viewIntent;if(mounted||iframe){disposeGame(true);showStudio();pausedForTools=true;status('Your game is waiting. Your build is saved; action games start a new round when you return.');}return true;},
  showTalk:()=>{showStudio();if(setTab('talk'))focusView($('studioPrompt'));}
 });
 // Put live response status next to the conversation it describes, not below
 // unrelated experiment controls. It stays an accessible aria-live status.
 $('studioMessages').after($('coachModeStatus'));
 setIconLabel($('studioChange'),'edit','Talk or change my game');
 const appendSpeechDraft=(text:string)=>{
  // Both speech paths produce a draft only. The child chooses Send or Build.
  const input=$<HTMLTextAreaElement>('studioPrompt');
  input.value=[input.value.trim(),text.trim()].filter(Boolean).join(' ').slice(0,input.maxLength||2000);
  flushDraft();$('studioDraftStatus').textContent='Check your words, then choose Send to jems.';
  input.focus();
 };
 voice=installStudioVoice({
  microphone:$<HTMLButtonElement>('studioMic'),installPack:$<HTMLButtonElement>('studioVoicePack'),
  renderMicrophone:(state,label)=>{const button=$('studioMic');setIconLabel(button,state==='idle'?'mic':state==='recording'?'stop':'close',label);button.setAttribute('aria-label',state==='idle'?'Speak to jems using the microphone when supported':label);},
  hearReply:$<HTMLButtonElement>('studioHear'),status:$('studioVoiceStatus'),
  scope:()=>activeId?owner()+':'+activeId:'',
  canListen:()=>route==='studio'&&panel==='talk'&&!FG.learning.active,
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
 // Mount Home once. The bounded presence check can update this same view,
 // without a second automatic navigation overriding a child's early choice.
 home();
 await readWelcomeArt();
 FG.studio={version:1,flushDraft,open:(id:string)=>open(id),home,exportNotebook:()=>notebook.read(),mode:()=>remote.mode};
 let palsInterface:ReturnType<typeof installPalsInterface>;
 const creation=installCreationStudio({
  guidance:guideHost,
  enter:()=>{if(guardMath())return false;stopSpeech();flushDraft();hideJourney();disposeGame();FG.app.page('creation');route='other';document.body.classList.remove('studio-designing');document.body.classList.add('creation-open');setActiveNav('studioNavScenes');return true;},
  home,openGame:id=>open(id),onRewardSourceSaved:notifyRewardSourceSaved,
  ownedPals:()=>pals.state.profile?.owned.map(pal=>pal.id)??[],
  activePal:()=>pals.state.profile?.activeId??null,
  palForm:id=>pals.state.profile?.owned.find(pal=>pal.id===id)?.form??'base',
  openPals:()=>palsInterface.open(),
 });
 const artStudio=installArtStudio({
  enter:()=>{if(guardMath())return false;stopSpeech();flushDraft();creation.flush();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('art-studio');route='other';document.body.classList.remove('studio-designing','creation-open');setActiveNav('studioNavCreate');return true;},
  home,
  openScene:async art=>{await creation.openArt(art);},
  openCar:async(rigId,isCurrent)=>{
   if(!isCurrent()||guardMath())return;const capturedOwner=owner(),capturedEpoch=epoch;
   const stillCurrent=()=>isCurrent()&&owner()===capturedOwner&&epoch===capturedEpoch;
   const rig=await rigById(capturedOwner,rigId);if(!stillCurrent())return;
   const source=await drawing(capturedOwner,rig.assembly.sourceId);
   if(!stillCurrent()||guardMath())return;if(rig.assembly.kind!=='car')throw Error('Choose a saved car design for Rally.');
   const picture=await createImageBitmap(drawingBlob(source));
   try{if(!stillCurrent())return;vehicleGeometry(rig.assembly,picture.width/picture.height);}finally{picture.close();}
   if(!stillCurrent()||guardMath())return;
   if(!leaveCreationForStudio())return;flushDraft();
   // Keep the two synchronous save steps together. If notebook storage was full
   // on a previous attempt, recover that exact unlisted project instead of
   // leaving it behind and creating another copy on every retry.
   const listed=new Set(notebook.list(capturedOwner).map(item=>item.projectId));
   const pending=games.list(capturedOwner).find(item=>item.game==='hill'&&!listed.has(item.id)&&games.revision(item.id,capturedOwner).drawingRigId===rig.id);
   const p=pending??games.create(capturedOwner,'hill',(source.name+' Rally').slice(0,60),defaults('hill'),rig.id);
   const session=notebook.create(capturedOwner,'hill',p.name,p.id);
   // Actual retained game revisions are authoritative for art usage. Index
   // repair is supplementary and cannot strand an already-saved game.
   void registerArtUsage(capturedOwner,{targetId:p.id,targetKind:'game',drawingId:source.id,rigId:rig.id},()=>owner()===capturedOwner&&rewardSourceWritable()).catch(()=>{});
   try{message(session,'helper','Your own drawing is driving this game. Its saved movement version stays with this adventure. Try it, then decide what you want to change.');}catch{/* The saved game remains available even if the optional welcome note cannot be written. */}
   await open(session.id);
  },
 });
 artEntries=installArtEntryPoints({homeAction:library.querySelector('.studio-home-action')!,libraryTools,open:()=>act(()=>artStudio.open())});
 installCreationProgress();
 const scenesNav=iconEl('button','','grid','Create & code') as HTMLButtonElement;scenesNav.id='studioNavScenes';scenesNav.type='button';scenesNav.onclick=()=>creation.open();$('studioNavCreate').after(scenesNav);
 const scenesEntry=el('button','studio-scene-entry') as HTMLButtonElement;scenesEntry.id='studioScenes';scenesEntry.type='button';
 scenesEntry.innerHTML='<img src="./jems-blocks.svg" alt=""><span><strong>Make your imagination move</strong><small>Tell a story with blocks, or watch a scene and rebuild it your way.</small></span><b aria-hidden="true">→</b>';
 // Keep a complete ready-to-play choice in the first mobile viewport.
 scenesEntry.onclick=()=>creation.open();$('studioFavoritesSection').after(scenesEntry);
 const practice=installProblemSolvingPractice({
  enter:()=>{if(guardMath())return false;stopSpeech();flushDraft();creation.flush();hideJourney();$<HTMLDialogElement>('studioCopyDialog').close();disposeGame();FG.app.page('problem-solving');route='other';document.body.classList.remove('studio-designing','creation-open');setActiveNav('studioNavProblemSolving');return true;},
  home,
 });
 const practiceNav=iconEl('button','','help','Try an idea') as HTMLButtonElement;practiceNav.id='studioNavProblemSolving';practiceNav.type='button';practiceNav.onclick=()=>practice.open();scenesNav.after(practiceNav);
 nav.classList.add('studio-nav-has-practice');document.querySelector('.site-header')!.classList.add('studio-practice-navigation');
 const practiceEntry=el('button','studio-scene-entry') as HTMLButtonElement;practiceEntry.id='studioProblemSolving';practiceEntry.type='button';
 practiceEntry.innerHTML='<img src="./jems-workbench.svg" alt=""><span><strong>Try an idea</strong><small>Make a guess, try a little test, and choose what to change.</small></span><b aria-hidden="true">→</b>';
 practiceEntry.querySelector('b')!.replaceChildren(createIcon('arrow'));
 practiceEntry.onclick=()=>practice.open();scenesEntry.after(practiceEntry);
 const scenePractice=iconEl('button','creation-button creation-quiet','arrow','Try a little experiment') as HTMLButtonElement;scenePractice.id='creationTryIdea';scenePractice.type='button';scenePractice.onclick=()=>practice.open();$('creationSubtitle').after(scenePractice);
 window.dispatchEvent(new CustomEvent('factory-problem-solving-updated',{detail:{owner:owner()}}));
  scenesEntry.querySelector('b')!.replaceChildren(createIcon('arrow'));
 const sceneButton=iconEl('button','studio-button','grid','Animate & code') as HTMLButtonElement;sceneButton.id='studioMakeScene';sceneButton.type='button';
 palsInterface=installPalsInterface({
  controller:pals,
  enter:()=>{
   if(guardMath())return false;
   stopSpeech();flushDraft();FG.creation?.flush();hideJourney();disposeGame();FG.app.page('home');
   document.querySelectorAll('main > .page').forEach(element=>element.classList.add('hidden'));
   route='pals';document.body.classList.remove('studio-designing','creation-open');globalStatus.textContent='';return true;
  },
  home:()=>act(home),create:id=>{creation.openWithPal(id);},
  refreshCreation:()=>creation.refreshPals(),help:()=>{$('studioHelp').click();},
 });
 function openParent(connection=false){
  stopSpeech();flushDraft();FG.creation?.flush();closeJourneyMap();hideJourney();disposeGame();
  FG.app.page('parent');route='other';setActiveNav(null);
  if(connection)FG.parentDashboard?.openTab('settings');
  const target=connection?$('builderConnection'):$('parentDashboard')?.querySelector<HTMLElement>('h1');
  if(target){target.tabIndex=-1;focusView(target);}
 }
 installStudioNavigation({nav,headerTools,helpButton,rewards:rewardsWidget.element,subjects:learningChoice,
  openArt:()=>act(()=>artStudio.open()),openParent:()=>act(()=>openParent()),
 });
 window.addEventListener('factory-open-parent-connection',event=>{
  event.preventDefault();act(()=>openParent(true));
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
   creation.fromStudio({...s,projectId:response.projectId,remoteId:response.revisionId},undefined,response.manifest);return;
  }
  if(!s.projectId||!['dragon','buckets','robot'].includes(s.game)){creation.open();return;}
  const revision=games.revision(s.projectId,s.owner,showing==='history'&&viewedRevisionId?viewedRevisionId:undefined);
  if(showing==='candidate'&&s.candidate?.config)throw Error('Keep this game version first, then use Animate & code to carry that version into a scene.');
  creation.fromStudio(s,revision);
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
  resumeOutstanding();refreshShelf();
 }
 void loadRemoteConfiguration().catch(error=>status('Could not refresh the game workshop: '+(error as Error).message,true));
}
