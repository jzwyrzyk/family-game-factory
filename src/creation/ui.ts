import {openMotionEditor} from './motion-editor';
import {pathBlock, reusablePaths} from './motion-path';
import {createArtAdventure} from './art-game';
import { createIllustratedStarter } from './projects';
import { WORLD_PROPS } from './illustrated-art';
import { worldTiles, worldControls, placeBackdrop, setWorldLayer, orderedPlacements, stackPlacement } from './world-tools';
import { sceneThumbnails } from './scene-thumbnails';
import { renderCreativePicker } from '../assets/creative-picker';
import { addStaticScenery, EARLIER_PROPS, editWorldPicture, sceneryPlacements, worldView, SCENE_ROLES, type SceneRole, type SceneActor } from './model';
import {keptScenery} from './kept-scenery';
import { worldSettings } from './world-settings';
import { createPalPortrait } from '../pals/ui';
import {earlySoundMuted} from '../learning/early/audio';
import {profileGrade} from '../learning/engine';
import {isEarlyGrade,withinGrade} from '../learning/grades';
import { SceneEngine, type SceneSnapshot } from './engine';
import { starterWorld, validateCreationProject, type CreationProject, type CreationBlock } from './model';
import { CREATION_ASSETS, propsForWorld, createStarterProject, createProjectFromStudio, creationAsset, validateEditableProject, parsePrivateArtId } from './projects';
import { CreationStore, CREATION_KEY, validateCreationWorkspace, type CreationEntry } from './storage';
import {CreationWorkspace,prepareIndexedCreation} from '../storage/creation-workspace';
import { challengesForGrade, getCreationChallenge, createChallengeStarter, createChallengeTarget, evaluateChallenge, predictActor, firstMovement, movementChoices, type MovementChoice } from './challenges';
import { profileStorage } from '../adult-pilot/storage';
import { CreationStage } from './stage';
import type { StudioSession } from '../studio/notebook';
import { publishSourceEvidence } from '../problem-solving/signals';
import { createIcon, iconMarkup, setIconLabel, type IconName } from '../brand/icons';
import {rewardSourceWritable} from '../rewards/write-guard';
import { createGuideCard, type GuideHost } from '../studio/guide-card';
import {applyArtMotion} from '../drawing/motion';
import {PrivateArtResolver,loadPinnedArtSource,artChoice,listArtChoices,privateArtReferences,exportSceneArt,importSceneArt,type ArtSelection,type ResolvedPrivateArt} from './private-art';
import {ART_LIMITS,registerArtUsage,releaseArtUsage} from '../drawing/library';
import { addPalToProject, createPalPlayground, isCreationPalId, type CreationPalId } from '../pals/creation';
import { palSceneAssetId, type PalForm } from '../pals/catalog';
import {createReadAloudControl} from '../speech/read-aloud-control';
import { firstStepsSummary, simpleMove, directionMove, FIRST_STEPS_ACTIONS } from './learner-controls';
import './style.css';
import './landing.css';
import { applyPalArtworkMask } from '../pals/presentation-image';
import {createStudioIntroduction} from './introduction';

type Host = {
  enter(): boolean | Promise<boolean>;
  home(): void;
  openGame(sessionId: string): void | Promise<void>;
  ownedPals?(): readonly string[];
  activePal?(): string | null;
  palForm?(id: CreationPalId): PalForm;
  openPals?(): void;
  onRewardSourceSaved?(owner: string): void;
  guidance?: GuideHost;
};
type SourceRevision = Parameters<typeof createProjectFromStudio>[1];
type Insert = { programId: string; blockId?: string; branch?: 'actions' | 'then' | 'else' };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};
const iconNode = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, icon: IconName, text: string, iconClass = '') => {
  const element = node(tag, className); setIconLabel(element, icon, text, iconClass); return element;
};
function commandSymbol(type:string,mark:string){
  const symbol=node('span','creation-command-symbol',mark);
  symbol.setAttribute('aria-hidden','true');
  if(type==='jump'||type==='dance'){
    symbol.classList.add('creation-action-pose','creation-pose-'+type);
    const art=document.createElement('img');art.alt='';art.draggable=false;
    art.src=new URL('jems-art/character_spark_'+(type==='jump'?'celebrate':'wave')+'.webp',document.baseURI).href;
    symbol.append(art);
  }
  return symbol;
}
const clone = <T>(value: T): T => structuredClone(value);
const uid = () => crypto.randomUUID();
const palette = [
  { type: 'move', label: 'Move', icon: '↗', group: 'motion', detail: 'Go somewhere' },
  { type: 'jump', label: 'Jump', icon: '↟', group: 'motion', detail: 'Hop and land' },
  { type: 'say', label: 'Say', icon: '“ ”', group: 'story', detail: 'Give them a line' },
  { type: 'dance', label: 'Dance', icon: '♪', group: 'story', detail: 'Do a little dance' },
  { type: 'show', label: 'Show', icon: '◉', group: 'story', detail: 'Make an entrance' },
  { type: 'hide', label: 'Hide', icon: '◌', group: 'story', detail: 'Disappear' },
  { type: 'wait', label: 'Wait', icon: '◷', group: 'control', detail: 'Take a pause' },
  { type: 'repeat', label: 'Repeat', icon: '↻', group: 'control', detail: 'Do it again' },
  { type: 'if', label: 'If / otherwise', icon: '⑂', group: 'control', detail: 'Make a choice' },
  { type: 'emit', label: 'Send a signal', icon: '⚑', group: 'game', detail: 'Start another action' },
  { type: 'set', label: 'Set a number', icon: '=', group: 'game', detail: 'Start a score or count' },
  { type: 'change', label: 'Change a number', icon: '+', group: 'game', detail: 'Add or take away' },
] as const;

export function installCreationStudio(host: Host) {
  const FG = (window as any).FG, owner = () => String(FG.store.current().id);
  let activeStore:Promise<CreationWorkspace>|null=null,storeOwner='',indexedAuthority=false;
  const store=async()=>{const captured=owner();if(!activeStore||storeOwner!==captured){const old=activeStore;storeOwner=captured;indexedAuthority=false;activeStore=CreationWorkspace.open(profileStorage(localStorage),owner).then(value=>{if(owner()===captured)indexedAuthority=!!value.indexed;return value;});void old?.then(value=>value.close()).catch(()=>{});}return activeStore;};
  const page = node('section', 'page hidden'); page.id = 'page-creation';
  page.innerHTML = `
    <header class="creation-heading"><div class="creation-heading-copy"><span class="creation-identity">Creative Studio</span><h1 id="creationHeading" tabindex="-1">Make it. <span>Make it move.</span></h1><p id="creationSubtitle">Bring your imagination to life.</p></div><div id="creationHeadingActions" class="creation-heading-actions"><button class="creation-button" id="creationHome">${iconMarkup('arrow', 'jems-icon--back')} My Games</button></div></header>
    <div id="creationStatus" class="creation-status" role="status" aria-live="polite"></div>
    <div id="creationShelf">
      <section id="creationWelcome" class="creation-welcome"><div class="creation-welcome-copy"><h2>Every idea<br>can come to life.</h2><p>Start with a scene.<br>See what you can make it do.</p></div><img src="./jems-art/character_spark_wave.webp" alt="" class="creation-welcome-art"><div class="creation-starts"><button id="creationFreeMode" class="creation-start">${iconMarkup('star')}<span><strong>Make a scene</strong><small>Bring your ideas to life.</small></span>${iconMarkup('arrow')}</button><button id="creationChallengeMode" class="creation-start">${iconMarkup('grid')}<span><strong>Rebuild a scene</strong><small>Watch it. Can you make it?</small></span>${iconMarkup('arrow')}</button><div id="creationExperimentSlot"></div></div></section>
      <button id="creationLandingBack" class="creation-button" hidden>${iconMarkup('arrow','jems-icon--back')} Creative Studio</button>
      <section id="creationFreeShelf"><div class="creation-shelf-heading"><h2>Choose your world</h2></div><div id="creationStarters" class="creation-starters"></div></section>
      <section id="creationChallengeShelf" hidden><div class="creation-shelf-heading"><div><h2>Watch. Build. Try.</h2><p>Can your blocks make it happen?</p></div></div><div id="creationChallenges" class="creation-challenge-grid"></div><div id="creationPracticeGuideSlot"></div></section>
      <section id="creationSavedSection"><div class="creation-shelf-heading"><h2>My scenes</h2><div class="creation-shelf-tools"><button id="creationShelfImport" class="creation-button">${iconMarkup('book')} Open a scene file</button></div></div><div id="creationSaved" class="creation-saved-grid"></div></section>
    </div>
    <div id="creationWorkspace" hidden>
      <div class="creation-project-bar"><button id="creationBack" class="creation-button creation-quiet">${iconMarkup('arrow', 'jems-icon--back')} My scenes</button><label class="creation-title-label"><span class="creation-sr">Scene title</span><input id="creationTitle" maxlength="80" aria-label="Scene title"></label><div class="creation-version-actions"><button id="creationUndo" class="creation-button" title="Undo last edit">${iconMarkup('undo')} <span>Undo</span></button><button id="creationKeep" class="creation-button creation-primary">${iconMarkup('check')} Keep</button><details class="creation-more" id="creationMore"><summary aria-label="More scene tools">${iconMarkup('menu')} <span>More</span></summary><div class="creation-more-content"><span id="creationSaveState" class="creation-save-state">Saved on this device</span><button id="creationMoreScenes">${iconMarkup('arrow', 'jems-icon--back')} My scenes</button><button id="creationRedo">${iconMarkup('undo', 'jems-icon--mirror')} Redo</button><button id="creationCopy">${iconMarkup('add')} Make a copy</button><button id="creationDownload">${iconMarkup('download')} Download editable scene</button><button id="creationImportButton">${iconMarkup('book')} Open scene file</button><button id="creationVideo">${iconMarkup('download')} Save a video</button><button id="creationHistory">${iconMarkup('clock')} Saved versions</button><div id="creationSource" class="creation-source" hidden></div><div id="creationGuideSlot"></div><button id="creationDelete">${iconMarkup('trash')} Delete this scene</button></div></details></div></div>
      <div id="creationRecovery" class="creation-recovery" hidden><span>You have unfinished changes saved on this device.</span><button id="creationResumeDraft" class="creation-button">${iconMarkup('edit')} Resume my draft</button><button id="creationDiscardDraft" class="creation-button">${iconMarkup('undo')} Use saved version</button></div>
      <section id="creationChallengeBrief" class="creation-challenge-brief" hidden></section>
      <div class="creation-view-switch" role="group" aria-label="Workspace view">
        <button id="creationCodeView" class="creation-button" aria-controls="creationCodePane" aria-pressed="true">${iconMarkup('edit')} Code</button>
        <button id="creationPlayView" class="creation-button" aria-controls="creationStagePane" aria-pressed="false">${iconMarkup('play')} Play</button>
      </div>
      <div class="creation-workspace-grid">
        <div id="creationStagePane" class="creation-stage-column">
          <section class="creation-stage-card" aria-label="Scene preview"><div class="creation-stage-heading"><span id="creationPreviewLabel">Your stage</span><span id="creationClock">0.0 s</span><button id="creationFullscreen" class="creation-button creation-quiet" aria-pressed="false">${iconMarkup('grid')} Full screen</button></div><div class="creation-canvas-wrap"><canvas id="creationCanvas" width="800" height="450" tabindex="0" aria-label="Your scene. Select a character to edit it. Use the character buttons to trigger taps." role="img"></canvas><div id="creationLearning" class="creation-learning" hidden></div><div id="creationTargetBadge" class="creation-target-badge" hidden>Watching the goal</div><section id="creationFeedback" class="creation-feedback" tabindex="-1" aria-live="polite" hidden></section></div><div id="creationSceneWords" class="creation-scene-words" aria-live="polite" hidden></div><div class="creation-playbar"><button id="creationRun" class="creation-button creation-play">${iconMarkup('play')} Play</button><button id="creationPause" class="creation-button" disabled>${iconMarkup('pause')} Pause</button><button id="creationReset" class="creation-button" aria-label="Reset scene to its beginning">${iconMarkup('retry')} Reset</button><span id="creationTapSlot"></span><button id="creationStep" class="creation-button" aria-label="Advance the scene by one tenth of a second">${iconMarkup('chevron')} Step</button><span id="creationRunStatus">Ready to try</span></div></section>
        </div>
        <section id="creationCodePane" class="creation-code-card" aria-label="Scene blocks">
          <aside class="creation-palette" aria-label="Add a block"><h3>Add an action</h3><div id="creationPalette"></div></aside>
          <button id="creationCharacterTools" class="creation-button" aria-expanded="false" aria-controls="creationCharacterPanel">Characters &amp; tools</button>
          <div id="creationCharacterPanel">
            <div class="creation-code-heading"><h2 id="creationCodeTitle">My character’s blocks</h2><div class="creation-tools-switch" role="group" aria-label="Coding tools"><button id="creationSimpleMode" aria-pressed="true">First steps</button><button id="creationFullMode" aria-pressed="false">More tools</button></div></div>
            <section class="creation-cast-card"><div id="creationActors" class="creation-actors" role="group" aria-label="Choose a character"></div><button id="creationAddActor" class="creation-button creation-quiet" aria-label="Add a character">${iconMarkup('add')} Character</button><details id="creationSceneOptions" class="creation-scene-options"><summary>Scene settings</summary><div><button id="creationSettingsDone" type="button" class="creation-button">Done</button><div class="creation-setting-row"><div id="creationWorldSettings" class="creation-setting-row"></div><span id="creationPositionHelp">Drag a character to set its starting spot.</span></div><div id="creationWorldTools" class="creation-world-tools"></div><div id="creationPlacementActions"></div><div id="creationActorSettings" class="creation-actor-settings"></div><div id="creationVariables" class="creation-variables"></div></div></details></section>
          </div>
          <div id="creationSimpleEvents" class="creation-simple-events" role="group" aria-label="When the code starts"><button id="creationOnPlay" aria-pressed="true"><span aria-hidden="true">⚑</span> On Play</button><button id="creationOnTap" aria-pressed="false"><span aria-hidden="true">☝</span> On tap</button><span id="creationEventNotice" hidden></span><span id="creationPlanHint">Add an action. Try it. Change it.</span></div><div class="creation-script-row"><label>Script <select id="creationScript" aria-label="Choose a script"></select></label><button id="creationAddScript" class="creation-button creation-quiet">${iconMarkup('add')} Script</button></div><div id="creationTrigger" class="creation-trigger"></div>
          <div class="creation-sequence"><div id="creationBlocks" class="creation-blocks"></div></div>
        </section>
      </div>
      <section id="creationVersions" class="creation-versions" hidden><div class="creation-shelf-heading"><h2>Saved versions</h2><button id="creationCloseHistory" class="creation-button">${iconMarkup('close')} Close</button></div><div id="creationVersionList"></div></section>
    </div>
    <dialog id="creationWorldDialog" class="creation-dialog" aria-labelledby="creationWorldTitle">
      <div class="creation-shelf-heading"><h2 id="creationWorldTitle">Choose a world picture</h2><button type="button" class="creation-button">Close</button></div>
      <div data-world-filters></div><p role="status"></p><div data-world-choices class="creation-actor-choices"></div>
    </dialog>
    <input id="creationImport" type="file" accept="application/json,.json" hidden>
    <dialog id="creationVersionPicker" class="creation-dialog" aria-labelledby="creationVersionPickerTitle"><div class="creation-shelf-heading"><h2 id="creationVersionPickerTitle">Choose art version</h2><button id="creationCloseVersionPicker" type="button" class="creation-button" aria-label="Close art versions">${iconMarkup('close')}</button></div><p id="creationVersionArtStatus" role="status"></p><div id="creationVersionScope"></div><div id="creationVersionArtFilters"></div><div id="creationVersionArtChoices" class="creation-actor-choices"></div></dialog>
    <dialog id="creationActorDialog" class="creation-dialog" aria-labelledby="creationActorDialogTitle"><div class="creation-shelf-heading"><h2 id="creationActorDialogTitle">Who’s joining your scene?</h2><button id="creationCloseActor" class="creation-button" aria-label="Close character picker">${iconMarkup('close')}</button></div><div id="creationPalSlot"></div><section><div class="creation-shelf-heading"><h3>My art</h3><button id="creationOpenArtStudio" class="creation-button">${iconMarkup('edit')} My Art</button></div><p id="creationActorArtStatus" role="status"></p><div id="creationActorArtFilters"></div><div id="creationPrivateActorChoices" class="creation-actor-choices"></div></section><section id="creationJemsProps"></section><h3>Characters & things</h3><div id="creationActorChoices" class="creation-actor-choices"></div></dialog>`;
  document.querySelector('main')!.append(page);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => page.querySelector<T>('#' + id)!;
  const introduction=createStudioIntroduction(host.guidance,()=>shelf('landing'));
  $('creationShelf').before(introduction.element);
  let closeMotionEditor: (() => void) | undefined;
  const pathButton=iconNode('button','creation-button','edit','Draw a path');
  pathButton.id='creationDrawPath';pathButton.hidden=true;
  $('creationAddActor').after(pathButton);
  const privateArt=new PrivateArtResolver(owner);
  const stage = new CreationStage($<HTMLCanvasElement>('creationCanvas'),privateArt,message=>status(message,true));
  const palShelf = node('section', 'creation-pal-shelf'); palShelf.id = 'creationPals';
  palShelf.setAttribute('aria-label', 'Make something with your Pals');
  $('creationStarters').before(palShelf,worldTiles(id => void act(() => create('blank',id))));
  const palTools = node('div', 'creation-pal-tools'); palTools.id = 'creationPalTools';
  $('creationPalSlot').append(palTools);
  let scene: CreationProject | null = null, entryId = '', revisionId = '', sceneOwner = '', selectedActor = '', selectedProgram = '';
  let predictionReader:ReturnType<typeof createReadAloudControl>|null=null;
  let prediction:{choice:MovementChoice;scene:CreationProject}|null=null;
  let sourceSessionId = '', challengeId: string | null = null, hintUsed = false, targetMode = false, visible = false;
  let thumbnails: ReturnType<typeof sceneThumbnails> | undefined;
  let viewEpoch = 0;
  let engine: SceneEngine | null = null, frame = 0, last = 0, checkpointTimer: ReturnType<typeof setInterval> | undefined;
  let insert: Insert | null = null, undo: CreationProject[] = [], redo: CreationProject[] = [], dirty = false, recoveryPending = false;
  let sceneImportPending=false;
  let renderedPalsKey = '';
  // Presentation state only. Switching tools never rewrites the saved program.
  let fullTools = false, expandedBlockId = '', expandedView = false, fullscreenRequest = 0;
  const expandedNotice = 'Expanded view. Use Exit view to return to your code.';
  type Recording = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; owner: string; title: string; cancelled: boolean; timer?: ReturnType<typeof setTimeout> };
  let recording: Recording | null = null;
  let targetInputs = 0;
  const status = (message: string, error = false) => { $('creationStatus').textContent = message; $('creationStatus').classList.toggle('is-error', error); };
  const readingTools=node('div','creation-reading-tools'); readingTools.id='creationReadingTools';
  function readingText() {
    if(!introduction.element.hidden)return 'Can you reach the gem? Choose arrows. Press Play. See what happens. You can skip for now.';
    if(!$('creationWelcome').hidden)return 'Creative Studio. Make a scene, rebuild a scene, or try an experiment. Choose what you want to make.';
    const message=$('creationStatus').textContent?.trim();
    const feedback=$('creationFeedback');
    if(scene && !feedback.hidden && feedback.textContent?.trim())return [message,feedback.textContent,$('creationChallengeBrief').querySelector('.creation-hint')?.textContent].filter(Boolean).join('. ');
    if(challengeId){const goal=getCreationChallenge(challengeId)!;return [message,goal.title,goal.brief,...goal.requirements,$('creationChallengeBrief').querySelector('.creation-hint')?.textContent].filter(Boolean).join('. ');}
    if(scene){const actor=scene.actors.find(actor=>actor.id===selectedActor);return [message,'Choose a character, add an action, then press Play to see what happens.',actor?'You are editing '+actor.name+'.':'',$('creationSceneWords').textContent].filter(Boolean).join(' ');}
    return [message,$('creationSubtitle').textContent,$('creationChallengeShelf').hidden?'Choose a world or open one of your saved scenes.':'Choose a scene challenge. Watch it, then rebuild it your way.'].filter(Boolean).join('. ');
  }
  const sceneReading=createReadAloudControl({text:readingText,deviceOnly:()=>isEarlyGrade(profileGrade(FG.store.current())),canRead:()=>visible&&!FG.learning.active});
  sceneReading.button.id='creationRead';sceneReading.button.dataset.action='read-creation';
  readingTools.append(sceneReading.element);$('creationHeadingActions').prepend(readingTools);
  const actorReading=createReadAloudControl({text:()=>[$('creationActorDialogTitle').textContent,$('creationActorArtStatus').textContent,'Choose a character to add it to your scene.'].filter(Boolean).join('. '),canRead:()=>visible&&!FG.learning.active&&$<HTMLDialogElement>('creationActorDialog').open});
  actorReading.button.dataset.action='read-character-picker';
  $('creationActorDialogTitle').closest('.creation-shelf-heading')!.after(actorReading.element);
  for(const event of ['close','cancel'])$('creationActorDialog').addEventListener(event,()=>actorReading.stop());
  const stopReading=()=>{sceneReading.stop();actorReading.stop();predictionReader?.stop();};
  window.addEventListener('factory-learning-active',event=>{const active=(event as CustomEvent).detail===true;if(active){closeMotionEditor?.();closeMotionEditor=undefined;stopReading();}readingTools.hidden=active;});

  function renderGuide(mode: 'scene' | 'practice') {
    const capturedOwner = owner(), capturedEpoch = viewEpoch;
    const slot = mode === 'practice' && !scene ? $('creationPracticeGuideSlot') : $('creationGuideSlot');
    if (recoveryPending) { slot.replaceChildren(); return; }
    const title = mode === 'practice' ? 'Try an idea. Make it yours.' : sourceSessionId ? 'A new adventure for your character' : 'Start with one little action';
    const description = mode === 'practice'
      ? 'Watch the goal, build it your way, then check your scene. Afterward, use your idea in a story of your own.'
      : sourceSessionId
        ? 'These blocks change this scene. Press Play to try an idea; your original game stays saved.'
        : 'Choose a character and add an action. Press Play to see what happens, then try a change.';
    slot.replaceChildren(createGuideCard({
      id: mode === 'practice' && !scene ? 'creationPracticeGuide' : 'creationGuide',
      tip: mode === 'practice' ? 'practice' : 'scenes', title, description, host: host.guidance,
      canAct: () => visible && capturedOwner === owner() && capturedEpoch === viewEpoch && !locked() && !recoveryPending,
      onError: message => status(message, true),
      onDismiss: () => {
        if (scene) $('creationTitle').focus({ preventScroll: true });
        else ($('creationChallenges').querySelector<HTMLElement>('[data-challenge]') || $('creationChallengeMode')).focus();
      }
    }));
  }
  const isCurrent = () => visible && sceneOwner === owner() && !!scene;
  let pendingActions=0;let actionQueue:Promise<unknown>=Promise.resolve();
  const act=(fn:()=>unknown|Promise<unknown>)=>{const captured=owner();pendingActions++;page.setAttribute('aria-busy','true');const result=actionQueue.then(async()=>{if(owner()!==captured)throw Error('The player changed. Reopen this scene.');return await fn();}).catch(error=>{if(owner()===captured)status((error as Error).message,true);}).finally(()=>{if(!--pendingActions)page.removeAttribute('aria-busy');});actionQueue=result;return result;};
  const actAsync=(fn:()=>Promise<unknown>)=>{
    const capturedOwner=owner(),capturedView=viewEpoch;
    void fn().catch(error=>{if(capturedOwner===owner()&&capturedView===viewEpoch&&visible)status((error as Error).message,true);});
  };
  async function prepareSceneArt(project:CreationProject,current:()=>boolean){
    const bindings:ResolvedPrivateArt[]=[];
    for(const id of privateArtReferences(project)){
      const resolved=await privateArt.load(id);
      if(!current())throw Error('The player or page changed. Reopen this scene in your own profile.');
      bindings.push(resolved);
    }
    return bindings;
  }
  const worlds = worldSettings($('creationWorldSettings'), $<HTMLDialogElement>('creationWorldDialog'), {
    owner, isCurrent:()=>isCurrent() && !recoveryPending && !FG.learning.active, picture:art,
    async choose(world, background, current = () => true, use) {
      let applied = false;
      await act(async () => {
        assertEditing();
        const captured = scene, capturedOwner = sceneOwner, view = viewEpoch;
        if (!current()) return;
        const picture = world?.assetId && parsePrivateArtId(world.assetId) ? await privateArt.load(world.assetId) : undefined;
        if (!current() || !isCurrent() || scene !== captured || capturedOwner !== owner() || viewEpoch !== view) return;
        await mutation(project => {
          if (use === 'scenery' && picture) addStaticScenery(project,picture.assetId,picture.label);
          else if (use === 'backdrop' && picture) {
            selectedActor = placeBackdrop(project, picture).id;
            selectedProgram = ''; insert = null;
          } else if (world && !world.assetId) project.world = world;
          else editWorldPicture(project, world?.assetId ? world : undefined, background);
        });
        if (picture) indexSceneArt(entryId,capturedOwner,[picture]);
        applied = true;
      });
      if (!applied && scene && isCurrent()) worlds.render(scene);
      return applied;
    },
  });
  function indexSceneArt(projectId:string,capturedOwner:string,bindings:ResolvedPrivateArt[]){
    // Retained scene revisions are authoritative for deletion and usage counts.
    // Secondary indexing happens only after a successful scene write, so quota
    // failures can never leave an orphan reservation that traps the artwork.
    for(const resolved of bindings)void registerArtUsage(capturedOwner,{targetId:projectId,targetKind:'scene',drawingId:resolved.drawingId,...(resolved.rigId?{rigId:resolved.rigId}:{})}).catch(()=>{});
  }
  function locked() { if (!FG.learning.active) return false; FG.learning.focus?.(); status('Finish your learning activity, or choose My Games to leave.'); return true; }
  const recoveryMessage = 'Choose “Resume my draft” or “Use saved version” before changing this scene.';
  function assertEditing(options: { resolvingRecovery?: boolean } = {}) { if (!isCurrent()) throw Error('Reopen your scene in your own profile.'); if (locked()) throw Error('Your learning activity is still open.'); if (recoveryPending && !options.resolvingRecovery) throw Error(recoveryMessage); }
  function freshEngine() { if (!scene) return; engine = new SceneEngine(scene); targetMode = false; $('creationTargetBadge').hidden = true; $('creationPreviewLabel').textContent = 'Your stage'; paint(); fitStage(); }
  function stop(clearRecording = true) { stopReading(); cancelAnimationFrame(frame); frame = 0; last = 0; engine?.pause(); if (clearRecording) cancelRecording(); $<HTMLButtonElement>('creationPause').disabled = true; }
  let placeScenery: {scene:CreationProject;view:number;owner:string;id:string} | undefined;
  let cleanPreview = false;
  function paint() {
    if (!scene || !engine) return;
    const snapshot = engine.snapshot();
    const editing = !targetMode && !recording && !cleanPreview && snapshot.status === 'idle';
    stage.render(targetMode && challengeId ? createChallengeTarget(challengeId) : scene, snapshot, editing ? selectedActor : '', editing && !challengeId);
    $('creationClock').textContent = (snapshot.timeMs / 1000).toFixed(1) + ' s';
    $('creationRunStatus').textContent = snapshot.status === 'limit' ? snapshot.reason || 'Try fewer repeats.' : snapshot.status === 'running' ? 'Follow your blocks' : snapshot.status === 'paused' ? 'Paused' : snapshot.status === 'completed' ? 'Try a change, or tap a character' : 'Ready to try';
    const words = [...snapshot.actors.filter(actor => actor.visible && actor.speech).map(actor => `${actor.name}: ${actor.speech}`),
      ...Object.entries(snapshot.variables).map(([name, value]) => `${name}: ${value}`)].join(' · ');
    const captions = $('creationSceneWords');
    if (captions.textContent !== words) captions.textContent = words;
    captions.hidden = !words;
    page.querySelectorAll<HTMLElement>('[data-block-id]').forEach(b => b.classList.toggle('is-running', snapshot.activeBlockIds.includes(b.dataset.blockId!)));
    const summary = snapshot.actors.filter(a => a.visible).map(a => `${a.name} at ${Math.round(a.x)}, ${Math.round(a.y)}${a.speech ? ', says ' + a.speech : ''}`).join('. ');
    $('creationCanvas').setAttribute('aria-label', (targetMode ? 'Goal scene. ' : 'Your scene. ') + summary + '. ' + Object.entries(snapshot.variables).map(([name, value]) => name + ': ' + value).join(', '));
    $<HTMLButtonElement>('creationPause').disabled = snapshot.status !== 'running' && snapshot.status !== 'paused';
    setIconLabel($('creationPause'), snapshot.status === 'paused' ? 'play' : 'pause', snapshot.status === 'paused' ? 'Resume' : 'Pause');
  }
  function loop(time: number) {
    if (!isCurrent() || !engine || FG.learning.active) { stop(); return; }
    const delta = last ? Math.min(80, time - last) : 16; last = time;
    engine.advance(delta);
    if (targetMode && challengeId) {
      const challenge = getCreationChallenge(challengeId)!;
      const now = engine.snapshot().timeMs;
      while (targetInputs < challenge.previewInputs.length && challenge.previewInputs[targetInputs].timeMs <= now) {
        engine.tap(challenge.previewInputs[targetInputs++].actorId);
      }
    }
    paint();
    const snapshot = engine.snapshot();
    if (snapshot.status === 'running' || targetMode && challengeId && snapshot.timeMs < getCreationChallenge(challengeId)!.durationMs || recording) frame = requestAnimationFrame(loop);
    else { frame = 0; last = 0; }
  }
  function animate() { cancelAnimationFrame(frame); last = 0; frame = requestAnimationFrame(loop); }
  async function learningThen(action: () => void|Promise<void>) {
    if (locked() || !isCurrent()) return;
    if (recoveryPending) { status(recoveryMessage, true); return; }
    const target = $('creationLearning'), beforeOwner = sceneOwner, beforeId = entryId;
    const done = () => { target.hidden = true; if (isCurrent() && beforeOwner === owner() && beforeId === entryId) void act(action); };
    const asked = FG.learning.checkpoint(target, { gameId: 'creation', projectId: entryId, versionId: revisionId }, done, { onLeave: () => host.home() });
    if (asked) { stop(); setWorkspaceView('play'); target.hidden = false; } else await action();
  }
  async function run(record = false) {
    assertEditing(); setWorkspaceView('play'); $('creationFeedback').hidden = true; await saveVersion();
    const capturedOwner=owner(),capturedView=viewEpoch,project=scene!;
    const references=privateArtReferences(project);
    const current = () => capturedOwner === owner() && capturedView === viewEpoch && isCurrent() && scene === project;
    if(project.world || references.length || project.actors.some(actor => !!creationAsset(actor.assetId)?.url)){
      $<HTMLButtonElement>('creationRun').disabled=true;$<HTMLButtonElement>('creationVideo').disabled=true;
      try{await Promise.all([stage.prepare(project, current), ...references.map(id=>privateArt.load(id))]);}
      catch(error){ if (!current()) return; throw error; }
      finally{if(capturedOwner===owner()&&capturedView===viewEpoch){$<HTMLButtonElement>('creationRun').disabled=false;$<HTMLButtonElement>('creationVideo').disabled=false;}}
      if(!current())return;
      status('');
    }
    assertEditing();
    await learningThen(() => { stop(); freshEngine(); engine!.start(); if (record) beginRecording(); animate(); });
  }
  async function mutation(change: (project: CreationProject) => void, rerender = true) {
    assertEditing(); stop(); $('creationFeedback').hidden = true;
    const active = document.activeElement as HTMLElement | null;
    const focusId = active?.id, focusLabel = active?.getAttribute('aria-label');
    const focusBlock = active?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId;
    const focusGroup = active?.closest<HTMLElement>('#creationActorSettings,#creationTrigger,#creationVariables')?.id;
    const before = clone(scene!), next = clone(scene!),selectionBefore={selectedActor,selectedProgram,insert,expandedBlockId};
    try{change(next); validateCreationProject(next);await (await store()).autosave(entryId, sceneOwner, next, revisionId);}
    catch(error){selectedActor=selectionBefore.selectedActor;selectedProgram=selectionBefore.selectedProgram;insert=selectionBefore.insert;expandedBlockId=selectionBefore.expandedBlockId;throw error;}
    undo.push(before); if (undo.length > 60) undo.shift(); redo = []; scene = next; cleanPreview = false; dirty = true;
    $('creationSaveState').textContent = 'Draft saved · keep when you’re ready';
    freshEngine(); if (rerender) renderEditor(); updateUndo();
    if (rerender && active && !active.isConnected) {
      const scope = focusBlock ? page.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(focusBlock)}"]`) : focusGroup ? $(focusGroup) : page;
      const nextFocus = focusId ? $(focusId) : focusLabel ? scope?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusLabel)}"]`) : null;
      (nextFocus || page.querySelector<HTMLElement>('.creation-insert[aria-pressed=true]'))?.focus({ preventScroll: true });
    }
  }
  function updateUndo() { $<HTMLButtonElement>('creationUndo').disabled = !undo.length; $<HTMLButtonElement>('creationRedo').disabled = !redo.length; }
  async function saveVersion() {
    if (!scene || !dirty) return;
    if (recoveryPending) throw Error(recoveryMessage);
    const revision = await (await store()).save(entryId, sceneOwner, scene, revisionId); revisionId = revision.id; dirty = false;
    $('creationSaveState').textContent = 'Version saved · ready to keep';
  }
  async function loadScene(id: string) {
    prediction=null;
    const loaded = await (await store()).load(id, owner());
    worlds.close(); viewEpoch++;
    closeMotionEditor?.(); closeMotionEditor=undefined; thumbnails?.clear(); privateArt.clear();stage.clear();
    status(''); $<HTMLDetailsElement>('creationMore').open = false;
    stop(); scene = loaded.scene; entryId = id; revisionId = loaded.revision.id; sceneOwner = owner();
    selectedActor = scene.actors[0]?.id || ''; selectedProgram = scene.programs.find(p => p.actorId === selectedActor)?.id || '';
    sourceSessionId = scene.provenance?.sourceSessionId || '';
    challengeId = loaded.project.challengeId && getCreationChallenge(loaded.project.challengeId) ? loaded.project.challengeId : null; hintUsed = !!loaded.project.hintUsed; targetMode = false; undo = []; redo = []; dirty = false; insert = null; recoveryPending = !!loaded.draft;
    setWorkspaceView('code');
    $('creationCharacterTools').setAttribute('aria-expanded', 'false');
    expandedBlockId = ''; page.classList.add('has-scene'); document.body.classList.add('creation-editing');
    $('creationShelf').hidden = true; $('creationWorkspace').hidden = false; $('creationCodePane').scrollTop = 0; $('creationVersions').hidden = true; $('creationFeedback').hidden = true;
    $('creationRecovery').hidden = !recoveryPending;
    introduction.hide();$('creationHeading').textContent=challengeId?'Rebuild a scene':'Make a scene';$('creationSubtitle').textContent='Add an action. Play. Make it yours.';
    $('creationSaveState').textContent = loaded.project.keptId === revisionId ? 'Your kept version' : 'Saved on this device';
    $<HTMLButtonElement>('creationRun').disabled=false;$<HTMLButtonElement>('creationVideo').disabled=false;$<HTMLButtonElement>('creationDownload').disabled=false;
    if (loaded.project.challengeId && !challengeId) status('This scene’s original challenge is no longer available. You can still edit and keep your scene.');
    $<HTMLInputElement>('creationTitle').value = scene.title; freshEngine(); renderEditor(); renderBrief(); renderSource(); renderGuide(challengeId ? 'practice' : 'scene'); updateUndo();
    if(isEarlyGrade(profileGrade(FG.store.current()))&&!earlySoundMuted(owner())&&navigator.userActivation?.hasBeenActive)sceneReading.button.click();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function enter() { if (!await host.enter()) return false; visible = true; page.classList.remove('hidden'); startCheckpointTimer(); return true; }
  async function open(id?: string) { await act(async () => { if (!await enter()) return; if (id) await loadScene(id); else {await shelf();if(introduction.needed()){ $('creationShelf').hidden=true;introduction.show();}} }); }
  async function openChallenges() { await act(async () => { if (!await enter()) return; await shelf('challenge'); }); }
  async function shelf(mode: 'landing' | 'free' | 'challenge' = 'landing') {
    if (locked()) return; await saveVersion(); stop(); worlds.close(); viewEpoch++; scene = null; entryId = ''; sceneOwner = owner(); sourceSessionId = ''; recoveryPending = false;
    closeMotionEditor?.(); closeMotionEditor=undefined; thumbnails?.clear(); privateArt.clear();stage.clear(); setExpandedView(false); page.classList.remove('has-scene'); document.body.classList.remove('creation-editing');
    $('creationWorkspace').hidden = true; $('creationShelf').hidden = false;
    introduction.hide();$('creationWelcome').hidden=mode!=='landing';$('creationLandingBack').hidden=mode==='landing';
    $('creationHeading').innerHTML=mode==='landing'?'Make it. <span>Make it move.</span>':mode==='free'?'Make a scene':'Rebuild a scene';
    $('creationSubtitle').textContent=mode==='landing'?'Bring your imagination to life.':mode==='free'?'Choose a world. Imagine what happens next.':'Watch it. Build it. Try again.';
    $('creationFreeShelf').hidden = mode !== 'free'; $('creationChallengeShelf').hidden = mode !== 'challenge';
    $('creationFreeMode').setAttribute('aria-pressed', String(mode === 'free')); $('creationChallengeMode').setAttribute('aria-pressed', String(mode === 'challenge'));
    await renderShelf(); status(''); if (mode === 'challenge') renderGuide('practice'); $('creationHeading').focus({ preventScroll: true });
  }
  async function create(kind: 'dragon' | 'buckets' | 'robot' | 'blank', worldId?:string) { const project = await (await store()).create(owner(), createIllustratedStarter(kind,worldId)); await loadScene(project.id); }
  async function challenge(id: string) { const project = await (await store()).create(owner(), { ...createChallengeStarter(id), id: uid() }, { challengeId: id }); await loadScene(project.id); }
  async function scenesByActivity() {
    return (await store()).listByActivity(owner());
  }
  async function continueChallenge(id: string) {
    const latest = (await scenesByActivity()).find(project => project.challengeId === id);
    if (latest) await loadScene(latest.id); else await challenge(id);
  }
  function ownedPals(): CreationPalId[] { return [...new Set(host.ownedPals?.() ?? [])].filter(isCreationPalId); }
  function ownedPalForm(id: CreationPalId): PalForm { return host.palForm?.(id) === 'mature' ? 'mature' : 'base'; }
  function requireOwnedPal(id: string): CreationPalId {
    if (!isCreationPalId(id) || !ownedPals().includes(id)) throw Error('Choose a Pal from your collection first.');
    return id;
  }
  async function openWithPal(id: string): Promise<boolean> {
    const palId = requireOwnedPal(id);
    if (locked()) return false;
    if (visible) {
      if (recoveryPending) throw Error(recoveryMessage);
      await saveVersion();
    }
    // Read before leaving the current page so damaged scene history cannot be
    // replaced with an apparently successful new empty collection.
    const collection = await store();
    const project = createPalPlayground(palId, ownedPalForm(palId));
    project.world = starterWorld('terrace');
    if (!await enter()) return false;
    const saved = await collection.create(owner(), project); await loadScene(saved.id);
    // Show the child's editable tap script immediately; Play and Keep are still
    // deliberate actions, and the starter blocks retain their starter origin.
    selectedProgram = scene!.programs.find(program => program.trigger.type === 'tap')!.id;
    renderEditor(); status('Choose Try tap to try your Pal’s code.');
    return true;
  }
  async function addOwnedPal(id: string) {
    assertEditing();
    if (challengeId) throw Error('Finish your challenge, then choose “Make it my own” to add your Pal.');
    const palId = requireOwnedPal(id);
    await mutation(project => {
      const added = addPalToProject(project, palId, ownedPalForm(palId));
      Object.assign(project, added.scene); selectedActor = added.actorId; selectedProgram = added.programId; insert = null;
    });
    $<HTMLDialogElement>('creationActorDialog').close();
    status('Your Pal is ready. Try a tap!');
  }
  function renderPalShelf() {
    palShelf.replaceChildren(); palShelf.hidden = !host.ownedPals;
    if (palShelf.hidden) return;
    const copy = node('div', 'creation-pal-intro');
    copy.append(node('h3', '', 'Start with your Pal'), node('p', '', 'What will you make it do?'));
    palShelf.append(copy);
    const choices = node('div', 'creation-pal-starts');
    for (const id of ownedPals()) {
      const asset = creationAsset(palSceneAssetId(id, ownedPalForm(id)))!;
      const button = node('button', 'creation-pal-starter'); button.type = 'button'; button.dataset.creationPal = id;
      const label = node('span'); label.append(node('strong', '', asset.label), node('small', '', 'Let’s code →'));
      button.append(art(asset.id), label); button.onclick = async () => await act(async () => await openWithPal(id)); choices.append(button);
    }
    if (!choices.childElementCount && host.openPals) {
      const choose = node('button', 'creation-button', 'Choose your first Pal'); choose.type = 'button';
      choose.onclick = async () => await act(() => { if (!locked()) host.openPals?.(); }); choices.append(choose);
    }
    palShelf.append(choices);
  }
  function renderPalTools() {
    palTools.replaceChildren(); palTools.hidden = !!challengeId || !host.ownedPals;
    if (palTools.hidden) return;
    const ids = ownedPals(), active = host.activePal?.();
    const id = isCreationPalId(active) && ids.includes(active) ? active : ids[0];
    const button = node('button', 'creation-button creation-pal-add', id ? '＋ Add your Pal' : 'Meet your first Pal');
    button.type = 'button'; button.id = 'creationAddPal';
    button.onclick = async () => await act(async () => {
      assertEditing();
      if (id) await addOwnedPal(id);
      else { await saveVersion(); host.openPals?.(); }
    });
    palTools.append(button);
    if (ids.length > 1) {
      const choose = node('button', 'creation-text-button', 'Choose another'); choose.type = 'button'; choose.id = 'creationChoosePal';
      choose.onclick = async () => await act(() => { assertEditing(); renderActorChoices(true); const dialog = $<HTMLDialogElement>('creationActorDialog'); if (!dialog.open) dialog.showModal(); });
      palTools.append(choose);
    }
  }
  function art(assetId: string) {
    const asset = creationAsset(assetId), wrap = node('span', 'creation-actor-art');
    if(parsePrivateArtId(assetId)){
      wrap.textContent='Loading art…';const capturedOwner=owner(),capturedView=viewEpoch;
      void privateArt.load(assetId).then(resolved=>{
        if(capturedOwner!==owner()||capturedView!==viewEpoch||!wrap.isConnected)return;
        const preview=node('canvas');preview.width=preview.height=128;preview.setAttribute('aria-label',resolved.label);
        const ratio=120/Math.max(resolved.image.width,resolved.image.height),w=resolved.image.width*ratio,h=resolved.image.height*ratio;
        preview.getContext('2d')!.drawImage(resolved.image,(128-w)/2,(128-h)/2,w,h);
        preview.style.cssText='width:100%;height:100%;object-fit:contain';wrap.replaceChildren(preview);
      }).catch(()=>{if(capturedOwner===owner()&&capturedView===viewEpoch&&wrap.isConnected)wrap.textContent='Art unavailable';});
    }else if (asset?.palId && asset.palForm) {
      wrap.append(createPalPortrait(asset.palId, asset.palForm === 'mature' ? 2 : 1));
    }else if (asset?.url) {
      const img = node('img'); img.alt = ''; img.decoding = 'async';
      if (asset.palForm) {
        img.style.visibility = 'hidden';
        img.onerror = () => { wrap.textContent = 'Picture unavailable'; };
        img.onload = () => {
          try { applyPalArtworkMask(img, asset.url!); img.style.visibility = 'visible'; }
          catch { wrap.textContent = 'Picture unavailable'; }
        };
      }
      img.src = asset.url; wrap.append(img);
    }
    else { wrap.classList.add('creation-art-' + (asset?.shape || 'gem')); wrap.style.setProperty('--actor-color', asset?.color || '#9473D3'); wrap.textContent = asset?.emoji || (asset?.shape === 'robot' ? '▰' : asset?.shape === 'bucket' ? '◡' : '◆'); }
    return wrap;
  }
  async function renderShelf() {
    renderPalShelf();
    const starters = $('creationStarters'); starters.replaceChildren();
    for (const [kind, name, copy, src] of [
      ['dragon', 'A dragon’s big day', 'Old friends. A brand-new story.', './jems-world-dragon.svg'],
      ['buckets', 'A splash of silliness', 'Surprises, splashes, and silly dances.', './jems-world-buckets.svg'],
      ['robot', 'A robot with a plan', 'Every little step starts with you.', './jems-world-robot.svg'],
      ['blank', 'Anything you imagine', 'An open stage for your next idea.', './jems-workbench.svg'],
    ] as const) {
      const button = node('button', 'creation-starter creation-starter-' + kind); button.type = 'button'; button.dataset.creationStarter = kind;
      const image = node('img'); image.src = src; image.alt = '';
      const info = node('span', 'creation-starter-copy'); info.append(node('strong', '', name), iconNode('b', '', 'arrow', 'Make a scene'));
      button.append(image, info); button.onclick = async () => await act(async () => await create(kind,kind === 'blank' ? 'blank' : undefined)); starters.append(button);
    }
    const current=await store(),captured=owner(),view=viewEpoch,first=await current.page(captured,null,24),projects=first.items;let after=first.next;
    thumbnails?.clear();
    thumbnails = sceneThumbnails(privateArt, () => visible && viewEpoch === view && owner() === captured);
    const saved = $('creationSaved'); saved.replaceChildren();
    const append=async(items:typeof projects)=>{for (const project of items) {
      const loaded = await current.load(project.id,captured);if(owner()!==captured||viewEpoch!==view)return;const button = node('button', 'creation-saved-card'); button.type = 'button'; button.dataset.scene = project.id;
      const thumb = thumbnails!.add(loaded.scene);
      const copy = node('span'); copy.append(node('strong', '', project.title), node('small', '', project.challengeId ? 'Scene challenge · continue' : loaded.draft ? 'Unfinished ideas saved' : project.keptId ? 'A scene you kept' : 'Your work in progress'));
      button.append(thumb, copy, createIcon('arrow', 'creation-saved-arrow')); button.onclick = async () => await act(async () => await loadScene(project.id));
      if (!project.keptId || project.challengeId) {
        saved.append(button);
        continue;
      }
      const card = node('div', 'creation-kept-world');
      const reuse = iconNode('button', 'creation-button', 'add', 'Use this world');
      reuse.type = 'button';
      reuse.dataset.useWorld = project.id;
      reuse.setAttribute('aria-label', 'Use the kept world from ' + project.title);
      const keptRevisionId = project.keptId;
      reuse.onclick = () => act(async () => {
        if (locked() || owner() !== captured || viewEpoch !== view) return;
        const copy = await current.copy(project.id, captured, undefined, {keptRevisionId, detachChallenge:true});
        if (owner() === captured && viewEpoch === view) await loadScene(copy.id);
      });
      card.append(button, reuse);
      saved.append(card);
    }};await append(projects);
    const more=node('button','creation-button','More scenes');more.id='creationMoreScenesPage';if(after)saved.append(more);more.onclick=()=>act(async()=>{if(!after)return;const page=await current.page(captured,after,24);more.remove();await append(page.items);after=page.next;if(after)saved.append(more);});
    $('creationSavedSection').hidden=false;
    if(!saved.childElementCount){const empty=node('div','creation-saved-empty');const image=node('img');image.src='./jems-art/spot_safe_storage.webp';image.alt='';empty.append(image,node('p','','Your scenes will be waiting here.'));saved.append(empty);}
    const challenges = $('creationChallenges'); challenges.replaceChildren();
    challengesForGrade(profileGrade(FG.store.current())).forEach((item, index) => {
      const choice = node('div', 'creation-challenge-choice');
      const latest = projects.find(project => project.challengeId === item.id);
      const button = node('button', 'creation-challenge-card'); button.type = 'button'; button.dataset.challenge = item.id;
      const stamp = node('span', 'creation-challenge-stamp', ['↗', '↻', '☝', '✦', '⑂'][index] || '◎');
      button.append(stamp, node('strong', '', item.title), node('p', '', item.brief), iconNode('b', '', 'arrow', latest ? 'Continue my scene' : 'Watch & rebuild'));
      button.onclick = async () => await act(async () => await continueChallenge(item.id)); choice.append(button);
      if (latest) {
        const fresh = iconNode('button', 'creation-button creation-quiet', 'add', 'Start a new scene'); fresh.type = 'button'; fresh.dataset.challengeNew = item.id;
        fresh.setAttribute('aria-label', 'Start a new ' + item.title + ' scene');
        fresh.onclick = async () => await act(async () => await challenge(item.id)); choice.append(fresh);
      }
      challenges.append(choice);
    });
  }
  function renderSource() {
    const box = $('creationSource'); box.replaceChildren(); const provenance = scene?.provenance;
    const hasPrivateArt=!!scene&&privateArtReferences(scene).length>0;
    box.hidden=!hasPrivateArt&&!provenance?.sourceProjectId;if(box.hidden)return;
    if(sourceSessionId||!hasPrivateArt)box.append(iconNode('span', '', 'star', sourceSessionId
      ? 'A scene from your game · changes here stay in this scene'
      : 'A scene from your saved work · linked to its starting version'));
    if(hasPrivateArt){
      box.append(iconNode('span','','star','Your art · this scene keeps the exact version you chose'));
      const artButton=iconNode('button','creation-text-button','edit','My Art');
      artButton.onclick=async ()=>await act(async ()=>{assertEditing();await saveVersion();if(FG.artStudio?.open)FG.artStudio.open();else status('My Art is still opening. Try again in a moment.');});
      box.append(artButton);
    }
    if (sourceSessionId) { const button = iconNode('button', 'creation-text-button', 'arrow', 'Back to my game'); button.onclick = async () => await act(async () => { await saveVersion(); stop(); void host.openGame(sourceSessionId); }); box.append(button); }
  }
  function renderBrief() {
    predictionReader?.dispose();predictionReader=null;
    const box = $('creationChallengeBrief'); box.replaceChildren(); box.hidden = !challengeId; if (!challengeId) return;
    const goal = getCreationChallenge(challengeId)!;
    const copy = node('div', 'creation-goal-copy'); copy.append(node('h2', '', goal.title));
    const help = node('details', 'creation-goal-help'); help.append(node('summary', '', 'Help'));
    const helpContent = node('div'); helpContent.append(node('p', '', goal.brief));
    const list = node('ul'); goal.requirements.forEach(requirement => list.append(node('li', '', requirement))); helpContent.append(list);
    const testing = node('details', 'creation-test-description'); testing.append(node('summary', '', 'What is checked?'), node('p', '', goal.testDescription)); helpContent.append(testing);
    const controls = node('div', 'creation-goal-actions');
    const watch = iconNode('button', 'creation-button', 'play', 'Watch the goal'); watch.id = 'creationWatchTarget'; watch.onclick = async () => await act(() => { assertEditing(); learningThen(() => { setWorkspaceView('play'); stop(); $('creationFeedback').hidden = true; engine = new SceneEngine(createChallengeTarget(challengeId!)); engine.start(); targetInputs = 0; targetMode = true; $('creationTargetBadge').hidden = false; $('creationPreviewLabel').textContent = 'The goal'; animate(); }); });
    const check = iconNode('button', 'creation-button creation-primary', 'check', 'Check my scene'); check.id = 'creationCheck'; check.onclick = async () => await act(() => learningThen(checkChallenge));
    const hint = iconNode('button', 'creation-text-button', 'help', hintUsed ? 'See my hint again' : 'A little hint?'); hint.id = 'creationHint'; hint.onclick = async () => await act(async () => { assertEditing(); await (await store()).markHintUsed(entryId, sceneOwner); hintUsed = true; const text = node('p', 'creation-hint', goal.hint); hint.replaceWith(text); });
    const actor=predictActor(challengeId);
    if(actor){
      const predict=node('details','creation-prediction');predict.append(node('summary','','Predict a move'));
      const question='Which way will the '+actor+' move first?';
      const read=createReadAloudControl({text:()=>question,canRead:()=>visible&&predict.open,deviceOnly:true});
      predictionReader=read;
      predict.ontoggle=()=>{if(predict.open&&navigator.userActivation?.hasBeenActive)read.button.click();else read.stop();};
      const answers=node('div','creation-prediction-choices');
      for(const choice of movementChoices){
        const b=node('button','creation-button',choice==='still'?'■':directions[choice]);b.type='button';
        b.setAttribute('aria-label',choice);b.dataset.prediction=choice;b.setAttribute('aria-pressed','false');
        b.onclick=async ()=>await act(()=>{assertEditing();prediction={choice,scene:scene!};read.stop();
          answers.querySelectorAll('button').forEach(other=>other.setAttribute('aria-pressed',String(other===b)));});
        answers.append(b);
      }
      predict.append(node('p','',question),read.element,answers);copy.append(predict);
    }
    helpContent.append(hint); help.append(helpContent); controls.append(watch, check, help); box.append(copy, controls);
  }
  async function checkChallenge() {
    assertEditing(); if (!challengeId) return; setWorkspaceView('play'); stop(); await saveVersion();
    const result = evaluateChallenge(challengeId, scene!);
    const choice=prediction?.scene===scene?prediction.choice:null;
    const observed=choice?firstMovement(scene!,challengeId):null;prediction=null;
    const attempt=await (await store()).recordAttempt(entryId, sceneOwner, revisionId, { challengeId, passed: result.passed, hintUsed,...(choice&&observed?{prediction:{choice,observed}}:{}) });
    publishSourceEvidence({kind:'creation',owner:sceneOwner,attempt,result});
    host.onRewardSourceSaved?.(sceneOwner);
    const feedback = $('creationFeedback'); feedback.hidden = false; feedback.replaceChildren(); feedback.classList.toggle('is-success', result.passed);
    const close = iconNode('button', 'creation-button creation-feedback-close', 'close', 'Keep coding'); close.id = 'creationCloseFeedback';
    close.onclick = () => { feedback.hidden = true; setWorkspaceView('code'); $('creationCheck').focus({ preventScroll: true }); };
    feedback.append(close, node('h2', '', result.passed ? 'You made it happen!' : 'Try one more change'), node('p', '', result.feedback));
    const list = node('ul'); result.checks.forEach(check => {
      const item = node('li', check.passed ? 'is-pass' : '');
      item.append(createIcon(check.passed ? 'check' : 'help'), node('span', 'creation-sr', check.passed ? 'Passed: ' : 'Not yet: '), document.createTextNode(' ' + check.feedback));
      list.append(item);
    }); const details = node('details', 'creation-check-details'); details.append(node('summary', '', 'What happened?'), list); feedback.append(details);
    if (result.passed) {
      const extension = getCreationChallenge(challengeId)!.extension;
      const next = node('div', 'creation-next-idea');
      next.append(node('p', '', extension));
      const remix = iconNode('button', 'creation-button', 'edit', 'Make it my own');
      remix.onclick = async () => await act(async () => { assertEditing(); await saveVersion(); const copy = await (await store()).create(sceneOwner, { ...clone(scene!), id: uid(), title: (scene!.title + ' · my story').slice(0, 60), provenance: { createdBy: 'child', sourceKind: 'creation', sourceProjectId: entryId, sourceRevisionId: revisionId } }); await loadScene(copy.id); });
      next.append(remix); feedback.append(next);
    }
    freshEngine(); feedback.focus({ preventScroll: true });
  }
  function currentProgram() { return scene?.programs.find(p => p.id === selectedProgram && p.actorId === selectedActor); }
  function blocksAt(project: CreationProject, address: Insert): CreationBlock[] {
    const program = project.programs.find(p => p.id === address.programId); if (!program) throw Error('Choose a script first.');
    if (!address.blockId) return program.actions;
    const find = (blocks: CreationBlock[]): CreationBlock | undefined => { for (const block of blocks) { if (block.id === address.blockId) return block; const nested = block.type === 'repeat' ? find(block.actions) : block.type === 'if' ? find(block.then) || find(block.else || []) : undefined; if (nested) return nested; } };
    const block = find(program.actions); if (block?.type === 'repeat') return block.actions;
    if (block?.type === 'if') return address.branch === 'else' ? block.else ||= [] : block.then;
    throw Error('Choose where the next block should go.');
  }
  function findBlock(project: CreationProject, id: string) {
    const visit = (blocks: CreationBlock[]): { block: CreationBlock; list: CreationBlock[]; index: number } | null => {
      for (let i = 0; i < blocks.length; i++) { const block = blocks[i]; if (block.id === id) return { block, list: blocks, index: i }; const found = block.type === 'repeat' ? visit(block.actions) : block.type === 'if' ? visit(block.then) || visit(block.else || []) : null; if (found) return found; } return null;
    };
    for (const program of project.programs) { const found = visit(program.actions); if (found) return found; } throw Error('This block is no longer here.');
  }
  function newBlock(type: typeof palette[number]['type']): CreationBlock {
    const base = { id: uid(), origin: 'child' as const };
    switch (type) {
      case 'move': return { ...base, type, dx: 80, dy: 0, durationMs: 800 };
      case 'jump': return { ...base, type, height: 60, durationMs: 700 };
      case 'say': return { ...base, type, text: 'Hello!', durationMs: 1200 };
      case 'dance': return { ...base, type, durationMs: 1600 };
      case 'wait': return { ...base, type, durationMs: 600 };
      case 'repeat': return { ...base, type, count: 3, actions: [] };
      case 'if': return { ...base, type, condition: { type: 'variable', variable: Object.keys(scene!.variables)[0] || 'gems', operator: 'gte', value: 3 }, then: [], else: [] };
      case 'set': return { ...base, type, variable: Object.keys(scene!.variables)[0] || 'gems', value: 0 };
      case 'change': return { ...base, type, variable: Object.keys(scene!.variables)[0] || 'gems', amount: 1 };
      case 'emit': return { ...base, type, name: 'go' };
      default: return { ...base, type };
    }
  }
  function renderEditor() {
    if (!scene) return;
    if (!scene.actors.some(actor => actor.id === selectedActor)) { selectedActor = scene.actors[0].id; selectedProgram = ''; insert = null; }
    page.dataset.tools = fullTools ? 'full' : 'first';
    page.dataset.graphical=String(!fullTools&&withinGrade(profileGrade(FG.store.current()),1));
    $('creationSimpleMode').setAttribute('aria-pressed', String(!fullTools));
    $('creationFullMode').setAttribute('aria-pressed', String(fullTools));
    $('creationStep').hidden = !fullTools && !(matchMedia('(prefers-reduced-motion: reduce)').matches && scene.actors.some(actor => parsePrivateArtId(actor.assetId)));
    $('creationActorSettings').hidden = !fullTools;
    $('creationVariables').hidden = !fullTools;
    $('creationSimpleEvents').hidden = fullTools;
    $('creationTrigger').hidden = !fullTools;
    page.querySelector<HTMLElement>('.creation-script-row')!.hidden = !fullTools;
    paletteBox.querySelectorAll<HTMLButtonElement>('[data-add-block]').forEach(button => {
      const type = button.dataset.addBlock as CreationBlock['type'];
      button.hidden = !fullTools && !FIRST_STEPS_ACTIONS.has(type) && !(type === 'if' && challengeId === 'bucket-rule');
    });
    renderSource();
    renderPalTools();
    $<HTMLInputElement>('creationTitle').value = scene.title; worlds.render(scene);
    const cast = $('creationActors'); cast.replaceChildren();
    for (const actor of scene.actors) {
      const button = node('button', 'creation-actor'); button.type = 'button'; button.dataset.actor = actor.id; button.setAttribute('aria-pressed', String(selectedActor === actor.id));
      button.append(art(actor.assetId), node('span', '', actor.name));
      button.onclick = async () => await act(() => { if (locked()) return; selectedActor = actor.id; selectedProgram = scene!.programs.find(p => p.actorId === selectedActor)?.id || ''; insert = null; renderEditor(); paint(); });
      cast.append(button);
    }
    const worldPanel = $('creationWorldTools');
    worldPanel.replaceChildren();
    worldPanel.hidden = !!challengeId;
    if (!challengeId) worldPanel.append(worldControls(scene, {
      layer: (name, visible) => void act(() => mutation(project => setWorldLayer(project, name, visible))),
      chooseBackdrop: () => void worlds.open('backdrop'),
      toggleBackdrop: visible => void act(() => mutation(project => {
        const backdrop = project.actors.find(actor => actor.layer === 'backdrop');
        if (backdrop) backdrop.visible = visible;
      })),
      addProp: id => void act(() => addWorldProp(id)),
    }));
    if (!challengeId) {
      const active = scene, capturedOwner = sceneOwner;
      worldPanel.append(keptScenery(active,{owner:capturedOwner,store,loadArt:id=>privateArt.load(id),mutate:mutation,run:act,
        current:()=>isCurrent() && scene === active && capturedOwner === owner() && !locked()}));
      const tools=node('details',''), list=node('select');
      tools.append(node('summary','','Decorate the world'));
      list.id='creationSceneryType';list.setAttribute('aria-label','Fixed decoration');
      for (const prop of [...WORLD_PROPS,...EARLIER_PROPS]) list.add(new Option(prop.label,prop.id));
      const add=node('button','creation-button','Add decoration');
      add.id='creationAddScenery';add.onclick=()=>act(()=>mutation(project=>
        addStaticScenery(project,list.value,list.selectedOptions[0].text)));
      const own=node('button','creation-button','Decorate with my art');
      own.onclick=()=>void worlds.open('scenery');
      tools.append(list,add,own);
      worldPanel.append(tools);
    }
    for (const placed of challengeId ? [] : sceneryPlacements(scene)) {
      const fields = node('details','creation-scene-options');
      fields.append(node('summary','',placed.name));
      const edit = (change:(item:{x:number;y:number;size:number;layer:'behind'|'in-front'})=>void) =>
        mutation(project => {
          const picture = worldView(project);
          if (project.world && 'decorations' in project.world) editWorldPicture(project,{assetId:project.world.backdrop,framing:picture.framing});
          const w = project.world;
          if (!w || !('scenery' in w)) throw Error('This placement is missing.');
          const item = w.scenery?.find(item=>item.id === placed.id);
          if (!item) throw Error('This placement is missing.');
          change(item);
        });
      fields.append(input('Scenery x',placed.x,value=>edit(p=>{p.x=+value;}),{min:0,max:scene.width,step:'any'}),
        input('Scenery y',placed.y,value=>edit(p=>{p.y=+value;}),{min:0,max:scene.height,step:'any'}),
        input('Scenery size',placed.size,value=>edit(p=>{p.size=+value;}),{min:1,max:Math.max(400,scene.height),step:'any'}),
        choice('Scenery layer',placed.front?'in-front':'behind',[['behind','Behind the actors'],['in-front','In front of actors']],
          value=>edit(p=>{p.layer=value==='in-front'?'in-front':'behind';})));
      const remove=node('button','creation-button','Remove decoration');
      remove.onclick=()=>act(()=>mutation(project=>{
        const world=project.world;
        if (!world) return;
        if ('decorations' in world) world.decorations=world.decorations.filter(item=>item.id!==placed.id);
        else world.scenery=world.scenery?.filter(item=>item.id!==placed.id);
      }));
      const place=node('button','creation-button','Set position on stage');
      place.onclick=()=>{
        if (!scene || locked()) return;
        placeScenery={scene,view:viewEpoch,owner:owner(),id:placed.id};
        $<HTMLDetailsElement>('creationSceneOptions').open=false;
        setWorkspaceView('play');
        status('Touch the stage where you want this decoration.');
      };
      fields.append(place,remove);worldPanel.append(fields);
    }
    renderActorSettings(); renderPrograms(); renderVariables(); updateUndo();
  }
  async function addWorldProp(id:string) {
    const prop = creationAsset(id);
    if (!prop || challengeId) return;
    await mutation(project => {
      const actor = { id: uid(), assetId: prop.id, name: prop.label, x: Math.round(project.width / 2), y: Math.round(project.height * .65), size: 110 };
      project.actors.push(actor); selectedActor = actor.id; selectedProgram = ''; insert = null;
    });
    $<HTMLDetailsElement>('creationSceneOptions').open = false;
    status('Drag ' + prop.label + ' to a spot.');
  }
  function input(label: string, value: string | number, change: (value: string) => void, options: { min?: number; max?: number; step?: number | 'any'; maxLength?: number } = {}) {
    const wrap = node('label', 'creation-field'), field = node('input'); wrap.append(node('span', '', label)); field.value = String(value); field.setAttribute('aria-label', label);
    if (typeof value === 'number') { field.type = 'number'; field.min = String(options.min ?? -800); field.max = String(options.max ?? 800); field.step = String(options.step ?? 1); }
    else { field.type = 'text'; field.maxLength = options.maxLength ?? 120; }
    field.onchange = async () => await act(() => { if (field.type === 'number' && (!Number.isFinite(field.valueAsNumber) || !field.checkValidity())) { field.value = String(value); throw Error('Choose a number between ' + field.min + ' and ' + field.max + '.'); } try { change(field.value); } catch (error) { field.value = String(value); throw error; } }); wrap.append(field); return wrap;
  }
  function choice(label: string, value: string, options: [string, string][], change: (value: string) => void) {
    const wrap = node('label', 'creation-field'), select = node('select'); wrap.append(node('span', '', label)); select.setAttribute('aria-label', label);
    options.forEach(([key, text]) => { const option = node('option', '', text); option.value = key; select.append(option); }); select.value = value;
    select.onchange = async () => await act(async () => { try { await change(select.value); } catch (error) { select.value = value; throw error; } }); wrap.append(select); return wrap;
  }
  pathButton.onclick=()=>act(async()=>{
    assertEditing();stop();paint();
    const actor=scene!.actors.find(actor=>actor.id===selectedActor);
    if(!actor || !parsePrivateArtId(actor.assetId) || challengeId)return;
    const view=viewEpoch, profile=owner(), actorId=actor.id, programId=selectedProgram, project=scene!;
    const current=()=>isCurrent() && view===viewEpoch && owner()===profile && scene===project && selectedActor===actorId && !FG.learning.active;
    const art=await privateArt.load(actor.assetId);
    if(!current())return;
    closeMotionEditor?.();
    closeMotionEditor=openMotionEditor(page,{
      scene:project, actor, image:art.image, current,
      listScenes:async()=>(await (await store()).list(profile)).filter(entry=>entry.keptId),
      loadPaths:async id=>{
        const revision=await (await store()).keptRevision(id,profile);
        return revision?reusablePaths(revision.scene):[];
      },
      apply:async path=>{
        let saved=false;
        await act(async()=>{
          assertEditing();if(!current())throw Error('Reopen this path in your scene.');
          await mutation(next=>{
            let program=next.programs.find(item=>item.actorId===actorId && item.id===programId);
            if(!program){
              program=next.programs.find(item=>item.actorId===actorId && item.trigger.type==='start');
              if(!program){program={id:uid(),actorId,trigger:{type:'start'},actions:[]};next.programs.push(program);}
            }
            selectedProgram=program.id;
            program.actions.push(pathBlock(path));
          });
          saved=true;status('Path added. Keep your scene to use this path again.');
        });
        if(!saved)throw Error($('creationStatus').textContent || 'Could not add this path.');
      }
    });
  });
  function renderActorSettings() {
    const box = $('creationActorSettings'); box.replaceChildren(); const actor = scene!.actors.find(a => a.id === selectedActor); if (!actor) return;
    pathButton.hidden = !!challengeId || !parsePrivateArtId(actor.assetId);
    const set = async (key: string, value: string | number) => await mutation(project => Object.assign(project.actors.find(a => a.id === actor.id)!, { [key]: value }));
    box.append(input('Name', actor.name, async value => await set('name', value.trim() || 'My character'), { maxLength: 40 }), input('Start x', actor.x, async value => await set('x', +value), { min: 0, max: scene!.width }), input('Start y', actor.y, async value => await set('y', +value), { min: 0, max: scene!.height }), input('Size', actor.size || 100, async value => await set('size', +value), { min: 20, max: 240 }));
    if (!challengeId) {
      box.append(input('Rotate', actor.angle ?? 0, value => set('angle', +value), {min:-180,max:180}));
    }
    if (!challengeId && parsePrivateArtId(actor.assetId)) {
      box.append(choice('Role in this scene', actor.role ?? actor.creativeRole ?? '', [
        ['', 'Choose a role'], ...SCENE_ROLES.map(role => [role, role[0].toUpperCase() + role.slice(1)] as [string, string]),
      ], async value => await mutation(project => {
        const target = project.actors.find(a => a.id === actor.id)!;
        delete target.creativeRole;
        if (value) target.role = value as SceneRole;
        else delete target.role;
      })));

    }
    const placements = $('creationPlacementActions');
    const layersOpen = placements.querySelector('details')?.open ?? false;
    placements.replaceChildren();
    if (!challengeId) {
      const controls = node('div', 'creation-placement-controls');
      const layers = node('details','creation-layer-tools');
      layers.append(node('summary','','Layers'));
      layers.open = layersOpen;
      const action = (name: string, change: (project: CreationProject, placed: SceneActor) => void, group:HTMLElement = controls) => {
        const button = node('button', 'creation-button', name);
        button.type = 'button';
        button.onclick = () => act(() => mutation(project => change(project, project.actors.find(item => item.id === actor.id)!)));
        button.setAttribute('aria-label',name);
        group.append(button);
      };
      action('Move left', (_, a) => { a.x = Math.max(0, a.x - 20); });
      action('Move right', (p, a) => { a.x = Math.min(p.width, a.x + 20); });
      action('Move up', (_, a) => { a.y = Math.max(0, a.y - 20); });
      action('Move down', (p, a) => { a.y = Math.min(p.height, a.y + 20); });
      action('Smaller', (_, a) => { a.size = Math.max(16, (a.size ?? 100) - 20); });
      action('Bigger', (_, a) => { a.size = Math.min(240, (a.size ?? 100) + 20); });
      action('Turn', (_, a) => { a.angle = (((a.angle ?? 0) + 195) % 360) - 180; });
      if (actor.layer === 'backdrop') {
        placements.append(choice('Fit drawing', actor.backdropFit ?? 'contain',
          [['contain','Show whole drawing'], ['cover','Fill the stage']], value => set('backdropFit', value)));
      } else {
        layers.append(choice('Scene layer', actor.layer || 'middle',
          [['back','Behind the scenery'], ['middle','With the characters'], ['front','At the front']], value => set('layer',value)));
        action('Bring to front', (p,a) => stackPlacement(p,a,true), layers);
        action('Send to back', (p,a) => stackPlacement(p,a,false), layers);
        placements.append(layers);
        action('Duplicate', (p, a) => {
          const twin = {...a, id:uid(), x:Math.min(p.width, a.x + 20), y:Math.min(p.height, a.y + 20)};
          p.actors.push(twin);
          selectedActor = twin.id; selectedProgram = ''; insert = null;
        });
      }
      placements.prepend(node('h3', '', actor.name), controls);
    }

    if (!challengeId) {
      const peers = orderedPlacements(scene!.actors).filter(item => (item.layer ?? 'middle') === (actor.layer ?? 'middle'));
      if (peers.length > 1) box.append(choice('Picture layer', String(peers.indexOf(actor)), peers.map((_, index) => [
        String(index), index === 0 ? 'At the back' : index === peers.length - 1 ? 'At the front' : 'Layer ' + (index + 1),
      ]), async value => mutation(project => {
        stackPlacement(project, project.actors.find(item => item.id === actor.id)!, Number(value));
      })));
    }
    if (!challengeId) {
      const replace = node('button', 'creation-button', parsePrivateArtId(actor.assetId) ? 'Choose art version' : 'Choose a drawing');
      replace.id = 'creationReplaceActorArt';
      replace.type = 'button';
      replace.onclick = () => actAsync(async () => {
        assertEditing();
        const dialog = $<HTMLDialogElement>('creationVersionPicker');
        dialog.showModal();
        await renderPrivateChoices(actor.id);
      });
      placements.append(replace);
      if (import.meta.env.MODE === 'creative-art-review' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && parsePrivateArtId(actor.assetId)) {
        const play = iconNode('button', 'creation-button', 'play', 'Try Gem Hunt');
        play.id = 'creationLocalArtGame';
        play.onclick = () => act(async () => {
          assertEditing();
          const capturedView = viewEpoch, capturedOwner = owner();
          const current = () => capturedView === viewEpoch && capturedOwner === owner() && isCurrent() && !FG.learning.active;
          const resolved = await privateArt.load(actor.assetId);
          const { openGemHunt } = await import('../../tools/creative-art-review/gem-hunt');
          if (current()) await openGemHunt(resolved.image, current);
        });
        placements.append(play);
      }
    }
    if(!challengeId&&parsePrivateArtId(actor.assetId)?.kind==='rig'){
      const profile=owner(),project=scene,epoch=viewEpoch,pin=actor.assetId;
      const current=()=>isCurrent()&&owner()===profile&&scene===project&&viewEpoch===epoch&&selectedActor===actor.id&&actor.assetId===pin&&!FG.learning.active;
      const preview=iconNode('button','creation-button','play','Try the saved parts');
      preview.id='creationTryParts';preview.hidden=true;placements.append(preview);
      void privateArt.load(pin).then(art=>{if(current()&&preview.isConnected)preview.hidden=!art.articulated;}).catch(()=>{});
      preview.onclick=()=>act(async()=>{
        assertEditing();
        if(recording)throw Error('Finish your scene recording before trying the parts.');
        await learningThen(async()=>{
          if(!current())return;
          const {rig,source}=await loadPinnedArtSource(profile,pin,current);
          if(!rig||!current())return;
          const {openDrawingLab}=await import('../drawing/lab');
          if(!current())return;
          if(engine?.snapshot().status==='running'){stop();paint();}
          await openDrawingLab(profile,source,undefined,{previewRig:rig,isCurrent:current});
        });
      });
    }
    const remove = iconNode('button', 'creation-text-button', 'trash', 'Remove'); remove.setAttribute('aria-label', 'Remove ' + actor.name); remove.disabled = !!challengeId || scene!.actors.length < 2;
    remove.onclick = async () => await act(async () => await mutation(project => { project.actors = project.actors.filter(a => a.id !== actor.id); project.programs = project.programs.filter(p => p.actorId !== actor.id); selectedActor = project.actors[0].id; selectedProgram = project.programs.find(p => p.actorId === selectedActor)?.id || ''; insert = null; })); (challengeId ? box : placements).append(remove);
    const tap = iconNode('button', 'creation-button creation-quiet', 'star', 'Try tap'); tap.id = 'creationTapActor'; tap.setAttribute('aria-label', 'Tap ' + actor.name);
    tap.onclick = async () => await act(() => { assertEditing(); learningThen(() => { $('creationFeedback').hidden = true; if (targetMode || !engine) freshEngine(); if (engine!.snapshot().status === 'idle') engine!.start(); engine!.resume(); engine!.tap(actor.id); animate(); }); }); $('creationTapSlot').replaceChildren(tap);
    box.querySelectorAll<HTMLInputElement>('input').forEach(field => { if (challengeId && field.getAttribute('aria-label') !== 'Name') field.disabled = true; });
    $('creationPositionHelp').textContent = challengeId ? 'The starting scene stays the same. Change what happens with blocks.' : 'Drag a character to set its starting spot.';
  }
  function renderVariables() {
    const box = $('creationVariables'); box.replaceChildren(); if (!scene) return;
    const details = node('details'); const summary = node('summary', '', 'Numbers in this scene'); details.append(summary);
    const row = node('div', 'creation-variable-row');
    for (const [key, value] of Object.entries(scene.variables)) row.append(input(key, value, async raw => await mutation(project => { project.variables[key] = +raw; }), { min: -999, max: 999 }));
    const add = iconNode('button', 'creation-button creation-quiet', 'add', 'Number'); add.onclick = async () => await act(async () => { const name = prompt('What will you count? Use a short name, like gems or points.', 'points')?.trim(); if (!name) return; if (!/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/.test(name)) throw Error('Use a name starting with a letter, with letters, numbers or underscores.'); await mutation(project => { project.variables[name] = 0; }); }); row.append(add); details.append(row); box.append(details);
  }
  function renderPrograms() {
    const programs = scene!.programs.filter(p => p.actorId === selectedActor), select = $<HTMLSelectElement>('creationScript'); select.replaceChildren();
    if (!programs.some(p => p.id === selectedProgram)) selectedProgram = programs[0]?.id || '';
    programs.forEach((p, index) => { const option = node('option', '', `Script ${index + 1} · ${p.trigger.type === 'event' ? 'on ' + p.trigger.name : p.trigger.type === 'tap' ? 'when tapped' : 'when play starts'}`); option.value = p.id; select.append(option); });
    select.value = selectedProgram; const actor = scene!.actors.find(a => a.id === selectedActor);
    $('creationCodeTitle').textContent = (actor?.name || 'My character') + '’s blocks';
    const trigger = $('creationTrigger'); trigger.replaceChildren(); const program = currentProgram();
    $('creationOnPlay').setAttribute('aria-pressed', String(program?.trigger.type === 'start'));
    $('creationOnTap').setAttribute('aria-pressed', String(program?.trigger.type === 'tap'));
    $('creationEventNotice').hidden = program?.trigger.type !== 'event';
    $('creationEventNotice').textContent = program?.trigger.type === 'event' ? `On signal: ${program.trigger.name}` : '';
    if (!program) { trigger.append(node('p', '', 'Add a script to give this character something to do.')); $('creationBlocks').replaceChildren(); return; }
    trigger.append(node('span', 'creation-trigger-flag', '⚑'));
    trigger.append(choice('When', program.trigger.type, [['start', 'I press play'], ['tap', 'this character is tapped'], ['event', 'a signal arrives']], async value => await mutation(project => { const p = project.programs.find(p => p.id === selectedProgram)!; p.trigger = value === 'event' ? { type: 'event', name: 'go' } : { type: value as 'start' | 'tap' }; })));
    if (program.trigger.type === 'event') trigger.append(input('Signal name', program.trigger.name, async value => await mutation(project => { project.programs.find(p => p.id === selectedProgram)!.trigger = { type: 'event', name: value.trim() || 'go' }; }), { maxLength: 40 }));
    if (programs.length > 1) { const remove = iconNode('button', 'creation-text-button', 'trash', 'Remove script'); remove.onclick = async () => await act(async () => await mutation(project => { project.programs = project.programs.filter(p => p.id !== selectedProgram); selectedProgram = ''; insert = null; })); trigger.append(remove); }
    if (!insert || insert.programId !== selectedProgram) insert = { programId: selectedProgram };
    $('creationBlocks').replaceChildren(renderBlocks(program.actions, { programId: selectedProgram }));
  }
  function renderBlocks(blocks: CreationBlock[], address: Insert) {
    const list = node('div', 'creation-block-list'); list.dataset.container = address.blockId || address.programId;
    blocks.forEach((block, index) => {
      const metadata = block.type === 'animation'
        ? {group: 'motion', label: 'Saved movement', icon: '↻'}
        : palette.find(p => p.type === block.type)!;
      const card = node('div', 'creation-block block-' + metadata.group); card.dataset.blockId = block.id; card.draggable = true;
      card.addEventListener('dragstart', event => { event.stopPropagation(); event.dataTransfer?.setData('application/x-jems-block', block.id); });
      card.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('application/x-jems-block')) event.preventDefault(); });
      card.addEventListener('drop', async event => { event.preventDefault(); event.stopPropagation(); const moved = event.dataTransfer?.getData('application/x-jems-block'); if (moved && moved !== block.id) await act(async () => await mutation(project => { const from = findBlock(project, moved), to = findBlock(project, block.id); if (from.list !== to.list) throw Error('Use the nested “add here” spaces to build groups. Reorder blocks inside their own group.'); from.list.splice(from.index, 1); const next = from.list.findIndex(b => b.id === block.id); from.list.splice(next, 0, from.block); })); });
      const expanded = fullTools || expandedBlockId === block.id;
      card.classList.toggle('is-selected', expanded);
      const head = node('div', 'creation-block-head');
      const edit = node('button', 'creation-block-summary'); edit.type = 'button'; edit.dataset.editBlock = block.id;
      edit.setAttribute('aria-expanded', String(expanded)); edit.setAttribute('aria-label', `Change ${metadata.label} action`);
      const direction=block.type==='move'?simpleMove(block)?.direction:undefined;
      edit.append(node('span','creation-step-number',String(index+1)),commandSymbol(block.type,direction?directions[direction]:metadata.icon),node('span','creation-block-name',metadata.label), node('span', 'creation-block-description', firstStepsSummary(block)));
      edit.onclick = () => { expandedBlockId = expandedBlockId === block.id ? '' : block.id; renderPrograms(); page.querySelector<HTMLElement>(`[data-edit-block="${CSS.escape(block.id)}"]`)?.focus({ preventScroll: true }); };
      head.append(edit);
      const controls = node('span', 'creation-block-tools');
      for (const [label, iconClass, direction] of [['Move block up', 'jems-icon--up', -1], ['Move block down', 'jems-icon--down', 1]] as const) { const b = node('button'); b.append(createIcon('arrow', iconClass)); b.type = 'button'; b.setAttribute('aria-label', label); b.disabled = index + direction < 0 || index + direction >= blocks.length; b.onclick = async () => await act(async () => await mutation(project => { const found = findBlock(project, block.id); const other = found.index + direction; [found.list[found.index], found.list[other]] = [found.list[other], found.list[found.index]]; })); controls.append(b); }
      const remove = node('button'); remove.append(createIcon('close')); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + metadata.label + ' block'); remove.onclick = async () => await act(async () => await mutation(project => { const found = findBlock(project, block.id); found.list.splice(found.index, 1); insert = address; })); controls.append(remove); head.append(controls); card.append(head);
      const fields = node('div', 'creation-block-fields'); fields.hidden = !expanded;
      const update = async (key: string, value: unknown) => await mutation(project => {
        if (key === 'variable' && typeof value === 'string' && !Object.hasOwn(project.variables, value)) project.variables[value] = 0;
        if (key === 'condition' && (value as { type: string }).type === 'variable') { const name = (value as { variable: string }).variable; if (!Object.hasOwn(project.variables, name)) project.variables[name] = 0; }
        Object.assign(findBlock(project, block.id).block, { [key]: value, origin: 'child' });
      });
      const number = (label: string, key: string, value: number, min = -800, max = 800, step = 1) => fields.append(input(label, value, async raw => await update(key, +raw), { min, max, step }));
      const duration = (value: number) => {
        if (fullTools) fields.append(input('seconds', value / 1000, async raw => await update('durationMs', Math.round(+raw * 1000)), { min: 0, max: 10, step: .001 }));
        else {
          const options: [string, string][] = [['500', 'Quick'], ['1000', 'A moment'], ['2000', 'A little longer']];
          if (!options.some(([key]) => +key === value)) options.unshift([String(value), `Custom · ${value / 1000}s`]);
          fields.append(choice('Time', String(value), options, async raw => await update('durationMs', +raw)));
        }
      };
      if (block.type === 'animation') {
        fields.append(input('Seconds', block.motion.durationMs / 1000, async raw =>
          await update('motion', {...block.motion, durationMs: Math.round(+raw * 1000)}), {min: .4, max: 8, step: .01}));
      } else if (!fullTools && block.type === 'move' && simpleMove(block)) {
        const move = simpleMove(block)!;
        const setMove = async (direction: typeof move.direction, steps: number) => await mutation(project => {
          Object.assign(findBlock(project, block.id).block, directionMove(direction, steps), { origin: 'child' });
        });
        fields.append(choice('Direction', move.direction, [['right', '→ Right'], ['left', '← Left'], ['up', '↑ Up'], ['down', '↓ Down']], async raw => await setMove(raw as typeof move.direction, move.steps)));
        fields.append(input('Steps', move.steps, async raw => await setMove(move.direction, +raw), { min: 0, max: 4096, step: 'any' }));
        duration(block.durationMs ?? 500);
      } else if (!fullTools && (block.type === 'move' || ['set', 'change', 'emit'].includes(block.type))) {
        const more = node('button', 'creation-button', 'More controls');
        more.type = 'button'; more.onclick = () => setTools(true); fields.append(more);
      } else if (block.type === 'move') {
        const absolute = block.x !== undefined || block.y !== undefined;
        fields.append(choice('Move', absolute ? 'to' : 'by', [['by', 'by this much'], ['to', 'to a spot']], async value => await mutation(project => { const b = findBlock(project, block.id).block; if (b.type !== 'move') return; delete b.x; delete b.y; delete b.dx; delete b.dy; Object.assign(b, value === 'to' ? { x: scene!.actors.find(a => a.id === selectedActor)!.x, y: scene!.actors.find(a => a.id === selectedActor)!.y } : { dx: 80, dy: 0 }); })));
        number(absolute ? 'x' : 'right / left', absolute ? 'x' : 'dx', absolute ? block.x ?? 0 : block.dx ?? 0);
        number(absolute ? 'y' : 'down / up', absolute ? 'y' : 'dy', absolute ? block.y ?? 0 : block.dy ?? 0); duration(block.durationMs ?? 500);
      } else if (block.type === 'say') { fields.append(input('Words', block.text, async value => await update('text', value))); duration(block.durationMs); }
      else if (block.type === 'wait' || block.type === 'dance') duration(block.durationMs);
      else if (block.type === 'jump') {
        if (fullTools) number('height', 'height', block.height, 0, 300);
        else {
          const options: [string, string][] = [['30', 'Little'], ['60', 'Medium'], ['110', 'Big']];
          if (!options.some(([key]) => +key === block.height)) options.unshift([String(block.height), `Custom · ${block.height}`]);
          fields.append(choice('Height', String(block.height), options, async raw => await update('height', +raw)));
        }
        duration(block.durationMs);
      }
      else if (block.type === 'repeat') number(fullTools ? 'times' : 'Times', 'count', block.count, 0, 50);
      else if (block.type === 'set' || block.type === 'change') { fields.append(input('Number name', block.variable, async value => await update('variable', value.trim() || 'gems'), { maxLength: 30 })); number(block.type === 'set' ? 'value' : 'add', block.type === 'set' ? 'value' : 'amount', block.type === 'set' ? block.value : block.amount, -999, 999); }
      else if (block.type === 'emit') fields.append(input('Signal name', block.name, async value => await update('name', value.trim() || 'go'), { maxLength: 40 }));
      else if (block.type === 'if') {
        const condition = block.condition;
        fields.append(choice('Check', condition.type, [['variable', 'a number'], ['position', 'my position'], ['touching', 'touching a character']], async value => await update('condition', value === 'touching' ? { type: 'touching', actorId: scene!.actors.find(a => a.id !== selectedActor)?.id || selectedActor } : value === 'position' ? { type: 'position', axis: 'x', operator: 'gte', value: 400 } : { type: 'variable', variable: Object.keys(scene!.variables)[0] || 'gems', operator: 'gte', value: 3 })));
        if (condition.type === 'touching') fields.append(choice('Character', condition.actorId, scene!.actors.map(a => [a.id, a.name]), async value => await update('condition', { ...condition, actorId: value })));
        else {
          if (condition.type === 'variable') fields.append(input('Number', condition.variable, async value => await update('condition', { ...condition, variable: value.trim() || 'gems' }), { maxLength: 30 }));
          else fields.append(choice('Axis', condition.axis, [['x', 'x · across'], ['y', 'y · down']], async value => await update('condition', { ...condition, axis: value })));
          fields.append(choice('Rule', condition.operator, [['eq', '='], ['neq', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥']], async value => await update('condition', { ...condition, operator: value })));
          fields.append(input('Compare with', condition.value, async value => await update('condition', { ...condition, value: +value }), { min: -999, max: 999 }));
        }
      }
      if (fields.childElementCount) card.append(fields);
      if (block.type === 'repeat') card.append(renderBlocks(block.actions, { programId: selectedProgram, blockId: block.id, branch: 'actions' }));
      else if (block.type === 'if') { card.append(node('span', 'creation-branch-label', 'THEN'), renderBlocks(block.then, { programId: selectedProgram, blockId: block.id, branch: 'then' }), node('span', 'creation-branch-label', 'OTHERWISE'), renderBlocks(block.else || [], { programId: selectedProgram, blockId: block.id, branch: 'else' })); }
      list.append(card);
    });
    const destination = iconNode('button', 'creation-insert', 'add', address.blockId ? 'Add inside this group' : blocks.length ? 'Add the next action here' : 'Choose your first action'); destination.type = 'button';
    const selected = JSON.stringify(insert) === JSON.stringify(address); destination.setAttribute('aria-pressed', String(selected));
    destination.onclick = () => {
      insert = address; renderPrograms();
      const first = $('creationPalette').querySelector<HTMLElement>('button:not([hidden])');
      first?.focus();
    }; list.append(destination); return list;
  }
  const paletteBox = $('creationPalette');
  const directions = {right:'→',left:'←',up:'↑',down:'↓'} as const;
  for (const item of palette) for(const direction of (item.type==='move'?['right','left','up','down']:[null]) as (keyof typeof directions|null)[]) {
    const b = node('button', 'creation-palette-block block-' + item.group); b.type = 'button'; if(!direction||direction==='right')b.dataset.addBlock=item.type;
    if(direction)b.dataset.moveDirection=direction;
    const label=direction?'Move '+direction:item.label;
    b.setAttribute('aria-label',label);b.title=label;b.append(commandSymbol(item.type,direction?directions[direction]:item.icon),node('b','',direction?direction[0].toUpperCase()+direction.slice(1):label));
    b.onclick = async () => await act(async () => {
      await mutation(project => {
        if (!selectedProgram) { const program = { id: uid(), actorId: selectedActor, trigger: { type: 'start' as const }, actions: [] as CreationBlock[] }; project.programs.push(program); selectedProgram = program.id; insert = { programId: program.id }; }
        const block = newBlock(item.type);
        if(direction&&block.type==='move')Object.assign(block,directionMove(direction,80));
        expandedBlockId = isEarlyGrade(profileGrade(FG.store.current()))?'':block.id;
        const variable = block.type === 'if' && block.condition.type === 'variable' ? block.condition.variable : block.type === 'set' || block.type === 'change' ? block.variable : null;
        if (variable && !Object.hasOwn(project.variables, variable)) project.variables[variable] = 0;
        blocksAt(project, insert || { programId: selectedProgram }).push(block);
        if (block.type === 'repeat') insert = { programId: selectedProgram, blockId: block.id, branch: 'actions' };
        if (block.type === 'if') insert = { programId: selectedProgram, blockId: block.id, branch: 'then' };
      });
      const editor = $('creationBlocks').querySelector<HTMLElement>(`[data-edit-block="${CSS.escape(expandedBlockId)}"]`);
      editor?.closest('.creation-block')?.scrollIntoView({block:'nearest'});
      editor?.focus({preventScroll:true});
    }); paletteBox.append(b);
  }
  function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function cancelRecording() {
    const current = recording; if (!current) return; current.cancelled = true; recording = null;
    clearTimeout(current.timer); if (current.recorder.state !== 'inactive') current.recorder.stop();
    current.stream.getTracks().forEach(track => track.stop()); setIconLabel($('creationVideo'), 'download', 'Save a video');
  }
  function beginRecording() {
    const canvas = $<HTMLCanvasElement>('creationCanvas');
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw Error('Video export is not available in this browser. You can download your editable scene.');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw Error('This browser cannot save a scene video. Try Chrome or download the editable scene.');
    const stream = canvas.captureStream(30);
    try {
      const current: Recording = { recorder: new MediaRecorder(stream, { mimeType }), stream, chunks: [], owner: owner(), title: scene!.title, cancelled: false };
      recording = current;
      current.recorder.ondataavailable = event => { if (event.data.size && !current.cancelled) current.chunks.push(event.data); };
      current.recorder.onstop = () => {
        clearTimeout(current.timer); current.stream.getTracks().forEach(track => track.stop());
        const permitted = !current.cancelled && current.owner === owner() && visible;
        if (permitted && current.chunks.length) { download(new Blob(current.chunks, { type: mimeType }), current.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) + (mimeType.includes('mp4') ? '.mp4' : '.webm')); status('Your scene video is ready. Speech bubbles are included; this recording has no audio.'); }
        current.chunks = []; if (recording === current) { recording = null; setIconLabel($('creationVideo'), 'download', 'Save a video'); }
      };
      current.recorder.onerror = () => { current.cancelled = true; clearTimeout(current.timer); current.stream.getTracks().forEach(track => track.stop()); if (recording === current) { recording = null; setIconLabel($('creationVideo'), 'download', 'Save a video'); } status('The video could not be recorded. Your editable scene is still saved.', true); };
      current.recorder.start(); setIconLabel($('creationVideo'), 'stop', 'Stop & save video'); status('Recording up to 15 seconds. Tap a character to trigger its script. Choose “Stop & save video” when you’re ready.');
      current.timer = setTimeout(() => { if (current.recorder.state === 'recording') current.recorder.stop(); }, 15000);
    } catch (error) { stream.getTracks().forEach(track => track.stop()); recording = null; throw error; }
  }
  function startCheckpointTimer() {
    clearInterval(checkpointTimer);
    checkpointTimer = setInterval(() => { if (!isCurrent() || targetMode || FG.learning.active || engine?.snapshot().status !== 'running') return; const wasRunning = true; learningThen(() => { if (wasRunning && engine?.snapshot().status === 'paused') { engine.resume(); animate(); } }); }, 15000);
  }
  function setTools(full: boolean) {
    if (!scene || locked()) return;
    fullTools = full;
    renderEditor();
    $(full ? 'creationFullMode' : 'creationSimpleMode').focus({ preventScroll: true });
  }
  async function chooseEvent(type: 'start' | 'tap') {
    if (!isCurrent() || locked()) return;
    const existing = scene!.programs.find(program => program.actorId === selectedActor && program.trigger.type === type);
    expandedBlockId = ''; insert = null;
    if (existing) { selectedProgram = existing.id; renderPrograms(); return; }
    await mutation(project => {
      const program = { id: uid(), actorId: selectedActor, trigger: { type }, actions: [] as CreationBlock[] };
      project.programs.push(program); selectedProgram = program.id;
    });
  }
  function setExpandedView(expanded: boolean) {
    fullscreenRequest++;
    expandedView = expanded; page.classList.toggle('creation-expanded-view', expanded);
    if (!expanded && $('creationStatus').textContent === expandedNotice) status('');
    const button = $('creationFullscreen'); button.setAttribute('aria-pressed', String(expanded));
    setIconLabel(button, expanded ? 'close' : 'grid', expanded ? 'Exit view' : 'Full screen');
    if (!expanded && document.fullscreenElement === page) void document.exitFullscreen().catch(() => {});
  }
  $('creationSimpleMode').onclick = () => setTools(false);
  $('creationFullMode').onclick = () => setTools(true);
  $('creationOnPlay').onclick = async () => await act(async () => await chooseEvent('start'));
  $('creationOnTap').onclick = async () => await act(async () => await chooseEvent('tap'));
  $('creationFullscreen').onclick = () => actAsync(async () => {
    if (!isCurrent() || locked()) return;
    if (expandedView) { setExpandedView(false); return; }
    setExpandedView(true);
    const capturedOwner = owner(), capturedView = viewEpoch, request = fullscreenRequest;
    try {
      if (!page.requestFullscreen) throw Error('Fullscreen unavailable');
      await page.requestFullscreen();
      if (!visible || owner() !== capturedOwner || viewEpoch !== capturedView || !expandedView) {
        if (document.fullscreenElement === page) await document.exitFullscreen();
        return;
      }
    } catch {
      if (visible && owner() === capturedOwner && viewEpoch === capturedView && expandedView && request === fullscreenRequest)
        status(expandedNotice);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== page && expandedView && page.dataset.nativeFullscreen === 'true') setExpandedView(false);
    page.dataset.nativeFullscreen = String(document.fullscreenElement === page);
  });
  function leave() {
    if (!visible) return; stop(); clearInterval(checkpointTimer); worlds.close(); visible = false; viewEpoch++;
    stopReading(); setExpandedView(false); page.classList.remove('has-scene'); document.body.classList.remove('creation-editing'); fullTools = false; expandedBlockId = '';
    closeMotionEditor?.(); closeMotionEditor=undefined; thumbnails?.clear(); privateArt.clear();stage.clear();
    $<HTMLDialogElement>('creationActorDialog').close(); $<HTMLDialogElement>('creationVersionPicker').close(); $('creationLearning').hidden = true;
  }
  $('creationHome').onclick = async () => await act(async () => { await saveVersion(); host.home(); });
  $('creationBack').onclick = async () => await act(async () => await shelf());
  $('creationMoreScenes').onclick = async () => await act(async () => { $<HTMLDetailsElement>('creationMore').open = false; await shelf(); });
  function setWorkspaceView(view: 'code' | 'play') {
    cleanPreview = view === 'play';
    page.dataset.workspaceView = view;
    $('creationCodeView').setAttribute('aria-pressed', String(view === 'code'));
    $('creationPlayView').setAttribute('aria-pressed', String(view === 'play'));
  }
  $('creationSettingsDone').onclick = () => {
    const settings = $<HTMLDetailsElement>('creationSceneOptions');
    settings.open = false;
    settings.querySelector('summary')!.focus();
  };
  $('creationCharacterTools').onclick = () => {
    const button = $('creationCharacterTools');
    if (!locked()) button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
  };
  $('creationCodeView').onclick = () => { if (!locked()) setWorkspaceView('code'); };
  $('creationPlayView').onclick = () => { if (!locked()) setWorkspaceView('play'); };
  $('creationLandingBack').onclick=()=>act(()=>shelf());
  $('creationFreeMode').onclick = async () => await act(async () => await shelf('free'));
  $('creationChallengeMode').onclick = async () => await act(async () => await shelf('challenge'));
  $<HTMLInputElement>('creationTitle').maxLength = 60;
  $('creationTitle').onchange = async () => await act(async () => await mutation(project => { project.title = $<HTMLInputElement>('creationTitle').value.trim().slice(0, 60) || 'My scene'; }, false));
  $('creationScript').onchange = () => { selectedProgram = $<HTMLSelectElement>('creationScript').value; insert = null; renderPrograms(); };
  $('creationAddScript').onclick = async () => await act(async () => await mutation(project => {
    const programs = project.programs.filter(p => p.actorId === selectedActor);
    const trigger = !programs.some(p => p.trigger.type === 'start') ? { type: 'start' as const } : !programs.some(p => p.trigger.type === 'tap') ? { type: 'tap' as const } : { type: 'event' as const, name: 'signal-' + (programs.length + 1) };
    const program = { id: uid(), actorId: selectedActor, trigger, actions: [] }; project.programs.push(program); selectedProgram = program.id; insert = null;
  }));
  $('creationRun').onclick = () => actAsync(async () => await run());
  $('creationPause').onclick = async () => await act(() => {
    assertEditing(); if (!engine) return;
    const button = $<HTMLButtonElement>('creationPause'), hadFocus = document.activeElement === button;
    if (engine.snapshot().status === 'paused') { engine.resume(); animate(); } else stop(false);
    paint();
    // stop() temporarily disables this control; keep keyboard focus on Resume.
    if (hadFocus && !button.disabled) button.focus({ preventScroll: true });
  });
  $('creationReset').onclick = async () => await act(() => { assertEditing(); stop(); freshEngine(); setIconLabel($('creationPause'), 'pause', 'Pause'); });
  $('creationStep').onclick = async () => await act(() => { assertEditing(); learningThen(() => { stop(); if (targetMode || !engine) freshEngine(); if (engine!.snapshot().status === 'idle') engine!.start(); engine!.pause(); engine!.step(100); setIconLabel($('creationPause'), 'play', 'Resume'); paint(); }); });
  $('creationUndo').onclick = async () => await act(async () => { assertEditing(); if (!undo.length) return; const previous = undo.at(-1)!; await (await store()).autosave(entryId, sceneOwner, previous, revisionId); stop(); redo.push(clone(scene!)); scene = undo.pop()!; insert = null; dirty = true; freshEngine(); renderEditor(); });
  $('creationRedo').onclick = async () => await act(async () => { assertEditing(); if (!redo.length) return; const next = redo.at(-1)!; await (await store()).autosave(entryId, sceneOwner, next, revisionId); stop(); undo.push(clone(scene!)); scene = redo.pop()!; insert = null; dirty = true; freshEngine(); renderEditor(); });
  $('creationKeep').onclick = async () => await act(async () => { assertEditing(); await saveVersion(); await (await store()).keep(entryId, sceneOwner, revisionId); $('creationSaveState').textContent = 'Your kept version'; status('This version is yours to keep. You can keep experimenting.'); });
  $('creationCopy').onclick = async () => await act(async () => { assertEditing(); await saveVersion(); const copied = await (await store()).copy(entryId, sceneOwner, scene!.title + ' copy'); await loadScene(copied.id); });
  $('creationDownload').onclick = () => actAsync(async () => {
    assertEditing();const capturedOwner=owner(),capturedView=viewEpoch,copy=clone(scene!);
    const current=()=>capturedOwner===owner()&&capturedView===viewEpoch&&isCurrent();
    if(privateArtReferences(copy).length){
      const button=$<HTMLButtonElement>('creationDownload');button.disabled=true;
      try{
        const bundle=await exportSceneArt(capturedOwner,copy,current);if(!current())return;
        download(new Blob([JSON.stringify(bundle)],{type:'application/json'}),'jems-scene-with-art.json');
        status('Your editable scene includes its original artwork and exact saved designs. Keep this file private.');
      }finally{if(current())button.disabled=false;}
    }else download(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }), 'jems-scene.json');
  });
  $('creationVideo').onclick = () => actAsync(async () => { if (recording) { if (recording.recorder.state !== 'inactive') recording.recorder.stop(); return; } await run(true); });
  function assertImportReady() {
    if (scene) { assertEditing(); return; }
    if (!visible) throw Error('Open Creative Studio before opening a scene file.');
    if (locked()) throw Error('Your learning activity is still open.');
  }
  const chooseImport = async () => await act(() => { assertImportReady();if(sceneImportPending){status('A scene file is still opening. Please wait a moment.');return;} $<HTMLInputElement>('creationImport').click(); });
  $('creationImportButton').onclick = chooseImport;
  $('creationShelfImport').onclick = chooseImport;
  $('creationImport').onchange = async () => {
    const input = $<HTMLInputElement>('creationImport'), file = input.files?.[0], capturedOwner = owner(), capturedView = viewEpoch; if (!file) return;
    if(sceneImportPending){input.value='';status('A scene file is still opening. Please wait a moment.');return;}
    sceneImportPending=true;
    try {
      assertImportReady(); if (file.size > ART_LIMITS.bundleBytes) throw Error('Choose a scene and art file smaller than 64 MB.');
      const contents = await file.text();
      if (owner() !== capturedOwner || !visible || viewEpoch !== capturedView) return;
      const data=JSON.parse(contents),current=()=>owner()===capturedOwner&&visible&&viewEpoch===capturedView&&!FG.learning.active;
      const withArt=data?.schema==='jems.scene-art.v1';
      if(!withArt&&file.size>500000)throw Error('This scene file is too large.');
      const imported = withArt?await importSceneArt(capturedOwner,data,current):validateEditableProject(data);
      if(!current())return;
      assertImportReady(); await saveVersion();
      const ready={...imported,id:uid(),provenance:{...imported.provenance,createdBy:'assisted' as const}};
      const bindings=await prepareSceneArt(ready,current);
      if(!current())return;
      let project;
      try{project=await (await store()).create(capturedOwner,ready);}
      catch(error){if(withArt)throw Error('The artwork was imported into My Art, but the scene could not be saved. '+(error as Error).message);throw error;}
      indexSceneArt(project.id,capturedOwner,bindings);
      await loadScene(project.id); status(withArt?'Your scene and its artwork are open as a new project. Earlier work is unchanged.':'Your scene file is open as a new project.');
    } catch (error) { if (owner() === capturedOwner && visible && viewEpoch ===capturedView) status((error as Error).message, true); } finally { sceneImportPending=false;input.value = ''; }
  };
  $('creationDelete').onclick = async () => await act(async () => { assertEditing(); if (!confirm('Delete this scene and all of its versions from this device?')) return;const removedId=entryId,removedOwner=sceneOwner; await (await store()).remove(removedId, removedOwner); publishSourceEvidence({kind:'clear-creation',owner:removedOwner,projectId:removedId}); dirty = false; scene = null; await shelf();void releaseArtUsage(removedOwner,removedId).catch(()=>{}); });
  $('creationHistory').onclick = async () => await act(async () => {
    assertEditing(); await saveVersion(); $('creationVersions').hidden = false; const box = $('creationVersionList'); box.replaceChildren();
    const kept = (await (await store()).get(entryId, sceneOwner)).keptId;
    const capturedId=entryId,capturedOwner=sceneOwner,current=await store();let after:string|null=null,count=0;
    const more=node('button','creation-button','More saved versions');more.id='creationMoreVersions';
    const append=async()=>{const page=await current.historyPage(capturedId,capturedOwner,after,24);if(entryId!==capturedId||sceneOwner!==capturedOwner)return;more.remove();for(const revision of page.items){const b=node('button','creation-button',`Version ${++count}${revision.id===kept?' · kept':''}${revision.id===revisionId?' · current':''}`);b.onclick=()=>act(async()=>{assertEditing();await current.checkout(capturedId,capturedOwner,revision.id,revisionId);await loadScene(capturedId);});box.append(b);}after=page.next;if(after)box.append(more);};
    more.onclick=()=>act(append);await append();
    $('creationVersions').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('creationCloseHistory').onclick = () => { $('creationVersions').hidden = true; };
  $('creationResumeDraft').onclick = async () => await act(async () => { assertEditing({ resolvingRecovery: true }); const loaded = await (await store()).load(entryId, sceneOwner); if (!loaded.draft) { await loadScene(entryId); return; } scene = clone(loaded.draft.scene); dirty = true; recoveryPending = false; $('creationRecovery').hidden = true; $('creationSaveState').textContent = 'Recovered draft · ready to keep'; status('Your draft is ready to continue.'); freshEngine(); renderEditor(); renderGuide(challengeId ? 'practice' : 'scene'); });
  $('creationDiscardDraft').onclick = async () => await act(async () => { assertEditing({ resolvingRecovery: true }); await (await store()).discardDraft(entryId, sceneOwner); recoveryPending = false; $('creationRecovery').hidden = true; status('Your saved version is ready to continue.'); freshEngine(); renderEditor(); renderGuide(challengeId ? 'practice' : 'scene'); });
  $<HTMLDialogElement>('creationVersionPicker').addEventListener('close', () => { $('creationVersionArtFilters').replaceChildren(); $('creationVersionArtChoices').replaceChildren(); });
  $('creationCloseVersionPicker').onclick = () => $<HTMLDialogElement>('creationVersionPicker').close();
  async function renderPrivateChoices(replaceActorId?: string, group: 'family'|'recent' = 'family'){
    const capturedOwner=owner(),capturedView=viewEpoch,dialog=$<HTMLDialogElement>(replaceActorId?'creationVersionPicker':'creationActorDialog');
    const current=()=>capturedOwner===owner()&&capturedView===viewEpoch&&isCurrent()&&dialog.open;
    const choices=$(replaceActorId?'creationVersionArtChoices':'creationPrivateActorChoices');
    const controls=$(replaceActorId?'creationVersionArtFilters':'creationActorArtFilters');
    const message=$(replaceActorId?'creationVersionArtStatus':'creationActorArtStatus');
    controls.replaceChildren();choices.replaceChildren();message.textContent='Opening your art collection…';
    try{
      let items=await listArtChoices(capturedOwner,current, !!replaceActorId);
      if(!current())return;
      if (replaceActorId) {
        const actor = scene?.actors.find(a => a.id === replaceActorId);
        const original = items.find(item => item.assetId === actor?.assetId);
        if (!original) group = 'recent';
        items = items.filter(item => !item.archived && (group === 'recent' || item.logicalId === original?.logicalId)
          && (actor?.layer !== 'backdrop' || item.representation === 'image'));
        const scope = document.createElement('select');
        scope.setAttribute('aria-label','Pictures to show');
        if (original) scope.add(new Option('Versions of this picture','family'));
        scope.add(new Option('All my pictures','recent')); scope.value = group;
        scope.onchange = () => void renderPrivateChoices(replaceActorId,scope.value as 'family'|'recent');
        $('creationVersionScope').replaceChildren(scope);
      }
      message.textContent = replaceActorId ? 'No versions here. Restore this picture in My Art.' : 'Your drawings can join this scene. Add one in My Art.';
      renderCreativePicker(controls, choices, message, items, item => {
        const choice=node('button','creation-character-choice');choice.type='button';choice.dataset.privateArt=item.assetId;
        choice.append(art(item.assetId),node('strong','',item.label),node('small','',item.detail));
        choice.onclick=()=>act(async()=>{
          if (!current()) return;
          assertEditing();choice.disabled=true;
          try{
            const resolved=await privateArt.load(item.assetId);if(!current())return;
            await mutation(project=>{
              if (replaceActorId) {
                const existing = project.actors.find(actor => actor.id === replaceActorId);
                if (!existing) throw Error('Choose a character in this scene.');
                existing.assetId = item.assetId;
                return;
              }
              const actor={id:uid(),assetId:item.assetId,name:item.label,x:Math.round(project.width / 2),y:Math.round(project.height * .65),size:140,visible:true};project.actors.push(actor);
              if (resolved.motion) applyArtMotion(project, actor, resolved.motion);
              const program={id:uid(),actorId:actor.id,trigger:{type:'tap' as const},actions:[]};project.programs.push(program);
              selectedActor=actor.id;selectedProgram=project.programs.find(p=>p.actorId===actor.id&&p.trigger.type==='start')?.id??program.id;insert=null;
            });
            indexSceneArt(entryId,capturedOwner,[resolved]);
            dialog.close();status(replaceActorId?'Art version changed in this scene.':'Your own art is in the scene. Add blocks to tell it what to do.');
          }finally{if(current())choice.disabled=false;}
        });
        return choice;
      });
    }catch(error){if(current())message.textContent=(error as Error).message;}
  }
  $('creationAddActor').onclick = async () => await act(async () => { assertEditing(); renderActorChoices(); $<HTMLDialogElement>('creationActorDialog').showModal();void await renderPrivateChoices(); });
  $('creationOpenArtStudio').onclick=async ()=>await act(async ()=>{assertEditing();await saveVersion();if(FG.artStudio?.open){$<HTMLDialogElement>('creationActorDialog').close();FG.artStudio.open();}else $('creationActorArtStatus').textContent='My Art is still opening. Try again in a moment.';});
  $('creationCloseActor').onclick = () => $<HTMLDialogElement>('creationActorDialog').close();
  function renderActorChoices(palsOnly = false) {
    const box = $('creationActorChoices'), ids = ownedPals(); box.replaceChildren();
    $('creationActorDialogTitle').textContent = palsOnly ? 'Which Pal is joining?' : 'Who’s joining your scene?';
    const propShelf = $('creationJemsProps');
    propShelf.replaceChildren();
    if (!palsOnly && !challengeId) {
      const details = node('details');
      details.append(node('summary', '', 'Props from every world'));
      const grid = node('div', 'creation-world-props');
      for (const prop of WORLD_PROPS) {
        const button = node('button', 'creation-character-choice');
        button.type = 'button'; button.dataset.bundledArt = prop.id;
        button.append(art(prop.id), node('strong','',prop.label));
        button.onclick = () => act(async () => {
          await addWorldProp(prop.id);
          $<HTMLDialogElement>('creationActorDialog').close();
        });
        grid.append(button);
      }
      details.append(grid); propShelf.append(details);
    }
    for (const asset of [...propsForWorld(scene?.world?.assetId), ...CREATION_ASSETS]) {
      if (asset.palId ? challengeId || !ids.includes(asset.palId) || asset.id !== palSceneAssetId(asset.palId, ownedPalForm(asset.palId)) : palsOnly) continue;
      const b = node('button', 'creation-character-choice'); b.type = 'button'; b.dataset.creationAsset = asset.id;
      b.append(art(asset.id), node('strong', '', asset.label));
      b.onclick = async () => await act(async () => {
        if (asset.palId) return await addOwnedPal(asset.palId);
        await mutation(project => { const actor = { id: uid(), assetId: asset.id, name: asset.label, x: Math.round(project.width / 2), y: Math.round(project.height * .66), size: 110, visible: true }; project.actors.push(actor); const program = { id: uid(), actorId: actor.id, trigger: { type: 'start' as const }, actions: [] }; project.programs.push(program); selectedActor = actor.id; selectedProgram = program.id; insert = null; });
        $<HTMLDialogElement>('creationActorDialog').close();
      }); box.append(b);
    }
  }
  type PlacementDrag = {
    id:string; pointer:number; view:number; origin:{x:number;y:number};
    start:{x:number;y:number}; size:number; resizing:boolean; moved:boolean;
  };
  let drag: PlacementDrag | null = null;
  function dragTransform(gesture:PlacementDrag, point:{x:number;y:number}, project:CreationProject) {
    if (gesture.resizing) {
      const from = Math.max(1, Math.hypot(gesture.start.x-gesture.origin.x, gesture.start.y-gesture.origin.y));
      const to = Math.hypot(point.x-gesture.origin.x, point.y-gesture.origin.y);
      return {size:Math.max(16,Math.min(240,Math.round(gesture.size*to/from)))};
    }
    return {
      x:Math.max(0,Math.min(project.width, gesture.origin.x + point.x - gesture.start.x)),
      y:Math.max(0,Math.min(project.height, gesture.origin.y + point.y - gesture.start.y)),
    };
  }
  const canvas = $<HTMLCanvasElement>('creationCanvas');
  // Size the actual canvas element, not a letterboxed CSS content area. Pointer
  // positions therefore keep the exact same mapping as the saved scene.
  const canvasWrap = canvas.parentElement!;
  const fitStage = () => {
    if (!scene || !visible) return;
    const box = canvasWrap.getBoundingClientRect(), ratio = scene.width / scene.height;
    const width = Math.max(1, Math.min(box.width, box.height * ratio));
    canvas.style.width = width + 'px'; canvas.style.height = width / ratio + 'px';
  };
  new ResizeObserver(fitStage).observe(canvasWrap);
  canvas.onpointerdown = async event => {
    if (!event.isPrimary || !isCurrent() || locked() || targetMode) return;
    if (placeScenery) {
      const selected=placeScenery;
      placeScenery=undefined;
      if (selected.scene===scene && selected.view===viewEpoch && selected.owner===owner() && !recoveryPending) {
        const point=stage.point(event);
        await act(()=>mutation(project=>{
          const world=project.world;
          if (!world) return;
          if ('decorations' in world) {
            const item=world.decorations.find(item=>item.id===selected.id);
            if (item) { item.x=100*point.x/project.width;item.y=100*point.y/project.height; }
          } else {
            const item=world.scenery?.find(item=>item.id===selected.id);
            if (item) { item.x=point.x;item.y=point.y; }
          }
        }));
        return;
      }
    }
    const point = stage.point(event), grip = stage.resizeHit(point.x,point.y), id = grip || stage.hit(point.x, point.y); if (!id) return;
    if (recoveryPending) { status(recoveryMessage, true); return; }
    if (engine?.snapshot().status === 'running' || engine?.snapshot().status === 'completed') { await act(() => learningThen(() => { engine!.resume(); engine!.tap(id); animate(); })); return; }
    cleanPreview = false; selectedActor = id; selectedProgram = scene!.programs.find(p => p.actorId === id)?.id || ''; insert = null; renderEditor(); paint();
    if (!challengeId) {
      const placed = scene!.actors.find(actor => actor.id === id)!;
      drag = {id, pointer:event.pointerId, view:viewEpoch, start:point, origin:{x:placed.x,y:placed.y},
        size:placed.size ?? 100, resizing:!!grip, moved:false};
      canvas.setPointerCapture(event.pointerId);
    }
  };
  canvas.onpointermove = event => {
    if (!drag || drag.pointer !== event.pointerId || drag.view !== viewEpoch || !scene || !engine) return;
    const point = stage.point(event);
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 3) return;
    drag.moved = true;
    const snapshot = engine.snapshot(), actor = snapshot.actors.find(a => a.id === drag!.id);
    if (actor) Object.assign(actor,dragTransform(drag,point,scene));
    stage.render(scene,snapshot,selectedActor,true);
  };
  canvas.onpointerup = event => {
    const gesture = drag;
    if (gesture?.pointer !== event.pointerId) return;
    drag = null;
    if (!gesture.moved || gesture.view !== viewEpoch) return;
    const point = stage.point(event);
    void act(async () => {
      if (gesture.view !== viewEpoch) return;
      await mutation(project => {
        const placed = project.actors.find(a => a.id === gesture.id);
        if (placed) Object.assign(placed,dragTransform(gesture,point,project));
      });
    });
  };
  canvas.onpointercancel = canvas.onlostpointercapture = event => {
    if (drag?.pointer === event.pointerId) { drag = null; paint(); }
  };
  page.addEventListener('click',event=>{
    const target = event.target as HTMLElement;
    if (!target.closest('.jems-read-aloud')) stopReading();
    if (target.closest('#creationWorldDialog')) return;
    for (const details of page.querySelectorAll<HTMLDetailsElement>('#creationMore,#creationSceneOptions,.creation-goal-help'))
      if (details.open && !details.contains(target)) details.open = false;
  },true);
  page.addEventListener('change',stopReading);
  page.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !FG.learning.active) {
      if (expandedView) { setExpandedView(false); $('creationFullscreen').focus({ preventScroll: true }); }
      if (targetMode) { stop(); freshEngine(); }
      if (!$('creationFeedback').hidden) { $('creationFeedback').hidden = true; $('creationCheck')?.focus({ preventScroll: true }); }
    }
  });
  window.addEventListener('factory-page', event => { if ((event as CustomEvent).detail !== 'creation') leave(); });
  window.addEventListener('factory-profile-before-change', event => { if (!visible) return;if(pendingActions){event.preventDefault();status('Your scene is still saving. Try changing players again in a moment.');}else stop(); });
  window.addEventListener('factory-profile', () => {
    leave(); scene = null; entryId = ''; revisionId = ''; sceneOwner = ''; engine = null; undo = []; redo = []; dirty = false; recoveryPending = false; sourceSessionId = ''; stage.clear();
    for (const id of ['creationBlocks','creationActors','creationSaved','creationFeedback','creationSource','creationGuideSlot','creationPracticeGuideSlot','creationActorSettings','creationPlacementActions','creationJemsProps','creationWorldTools','creationVariables','creationTrigger','creationStatus','creationVersionList','creationPrivateActorChoices','creationActorArtStatus','creationActorArtFilters','creationVersionScope','creationVersionArtFilters','creationVersionArtChoices','creationVersionArtStatus','creationPals','creationPalTools','creationActorChoices']) $(id).replaceChildren();
    $('creationCodeTitle').textContent = 'My character’s blocks'; $<HTMLInputElement>('creationTitle').value = '';
  });
  window.addEventListener('beforeunload', event => { if (visible&&pendingActions&&rewardSourceWritable()){event.preventDefault();event.returnValue='';} });
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('factory-learning-active', event => { if (visible && (event as CustomEvent).detail) { stop(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && visible) { stop(); paint(); } });
  const api = {
    open, openChallenges, close:leave,
    prepareIndexedCreation:async()=>{await actionQueue;await saveVersion();await prepareIndexedCreation(profileStorage(localStorage),owner);const old=activeStore;activeStore=null;await old?.then(value=>value.close());await shelf();},
    openMake(){return act(async()=>{if(await enter())await shelf('free');});},
    openIntroduction(){return act(async()=>{if(!await enter())return;await shelf();$('creationShelf').hidden=true;introduction.show();});},
    async openArt(selection:ArtSelection, kind:'scene'|'picture-hunt'='scene'){
      if(!await enter())return;
      try{await shelf();}catch(error){status((error as Error).message,true);return;}
      const capturedOwner=owner(),capturedView=viewEpoch,current=()=>capturedOwner===owner()&&capturedView===viewEpoch&&visible&&!FG.learning.active;
      status('Getting your art ready for a new scene…');
      try{
        const choice=await artChoice(capturedOwner,selection,current);const resolved=await privateArt.load(choice.assetId);if(!current())return;
        const project = createArtAdventure(choice, kind);
        if (kind === 'scene' && resolved.motion) {
          project.programs = [];
          applyArtMotion(project, project.actors[0], resolved.motion, true);
        }
        const bindings=await prepareSceneArt(project,current);if(!current())return;
        const saved=await (await store()).create(capturedOwner,project);indexSceneArt(saved.id,capturedOwner,bindings);await loadScene(saved.id);
        status(kind === 'picture-hunt' ? 'Press Play. Find your picture three times!' : resolved.motion?'Your path is ready. Press Play or change a move.':'Your art is ready. Try the starter hop, then change the blocks to make it yours. This scene uses the saved artwork as one character.');
        return saved.id;
      }catch(error){if(current())status((error as Error).message,true);}
    },
    openWithPal,
    refreshPals: () => {
      // Recheck ownership each time the picker is opened or a Pal is added;
      // stale cards cannot introduce a previous profile's collection.
      const key = JSON.stringify([owner(), ownedPals().map(id => [id, ownedPalForm(id)]), host.activePal?.() ?? null]);
      if (key === renderedPalsKey) return;
      renderedPalsKey = key;
      // A background reward refresh must not dismiss an art chooser or move
      // its focus. Every insertion still rechecks ownership at action time.
      if (!visible || $<HTMLDialogElement>('creationActorDialog').open) return;
      if (scene) renderPalTools(); else renderPalShelf();
    },
    async fromStudio(session: StudioSession, revision?: SourceRevision, manifest?: unknown) {
      // The caller still owns the visible Studio surface until entry succeeds.
      // Unsupported sources and unreadable collections must report there.
      const project = createProjectFromStudio(session, revision, manifest);
      let existing:CreationEntry|undefined;const current=await store();let after:string|null=null;
      do{const page=await current.page(owner(),after,24);for(const entry of page.items){const source=(await current.load(entry.id,owner())).scene.provenance;if(source?.sourceSessionId===session.id&&source?.sourceProjectId===project.provenance?.sourceProjectId&&source?.sourceRevisionId===project.provenance?.sourceRevisionId){existing=entry;break;}}after=existing?null:page.next;}while(after);
      if (!await enter()) return;
      return await act(async () => {
        const saved = existing || await (await store()).create(owner(), project); sourceSessionId = session.id; await loadScene(saved.id);
      });
    },
    export: () => {if(import.meta.env.MODE==='storage-preview')throw Error('Use captureWorkspace or the complete recovery copy for this preview.');return new CreationStore(profileStorage(localStorage),owner).read();},captureWorkspace:async()=>await (await store()).read(),validate: validateCreationWorkspace,
    pendingRewards: async (owner: string) => await (await store()).pendingRewards(owner),
    acknowledgeRewards: async (owner: string, ids: string[]) => await (await store()).acknowledgeRewards(owner, ids),
    backup: () => { if(import.meta.env.MODE==='storage-preview')throw Error('Use the complete recovery copy for these prepared scenes.');const legacy=new CreationStore(profileStorage(localStorage),owner);try{return {factoryCreation:legacy.read()};}catch(error){const raw=legacy.recoveryRaw;if(raw===null)throw error;return {factoryCreationRecoveryRaw:raw};}},
    rawSnapshot: () => profileStorage(localStorage).getItem(CREATION_KEY),
    restoreRawSnapshot: (raw: string | null) => { const storage = profileStorage(localStorage); if (raw === null) storage.removeItem(CREATION_KEY); else storage.setItem(CREATION_KEY, raw); },
    restore: (value:unknown)=>{if(import.meta.env.MODE==='storage-preview')throw Error('Restore the complete recovery copy for prepared scenes.');new CreationStore(profileStorage(localStorage),owner).restore(value);},
    flush: async () => { if (visible && sceneOwner === owner()) await saveVersion(); },
    snapshot: () => engine?.snapshot() || null,
    scene: () => scene ? clone(scene) : null,
  };
  FG.creation = api;
  return api;
}
