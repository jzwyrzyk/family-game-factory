import { SceneEngine, type SceneSnapshot } from './engine';
import { validateCreationProject, type CreationProject, type CreationBlock } from './model';
import { CREATION_ASSETS, createStarterProject, createProjectFromStudio, creationAsset } from './projects';
import { CreationStore, CREATION_KEY, validateCreationWorkspace } from './storage';
import { CREATION_CHALLENGES, getCreationChallenge, createChallengeStarter, createChallengeTarget, evaluateChallenge } from './challenges';
import { profileStorage } from '../adult-pilot/storage';
import { CreationStage } from './stage';
import type { StudioSession } from '../studio/notebook';
import {rewardSourceWritable} from '../rewards/write-guard';
import { addPalToProject, createPalPlayground, isCreationPalId, type CreationPalId } from '../pals/creation';
import './style.css';

type Host = {
  enter(): boolean;
  home(): void;
  openGame(sessionId: string): void | Promise<void>;
  ownedPals?(): readonly string[];
  activePal?(): string | null;
  openPals?(): void;
  onRewardSourceSaved?(owner: string): void;
};
type SourceRevision = Parameters<typeof createProjectFromStudio>[1];
type Insert = { programId: string; blockId?: string; branch?: 'actions' | 'then' | 'else' };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};
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
  const store = () => new CreationStore(profileStorage(localStorage), owner);
  const page = node('section', 'page hidden'); page.id = 'page-creation';
  page.innerHTML = `
    <header class="creation-heading"><div><span class="creation-eyebrow">THE jems CREATION STUDIO</span><h1 id="creationHeading" tabindex="-1">Little blocks. Big possibilities.</h1><p id="creationSubtitle">Make a story move. Give a character an idea. See what happens.</p></div><button class="creation-button" id="creationHome">← My Games</button></header>
    <div id="creationStatus" class="creation-status" role="status" aria-live="polite"></div>
    <div id="creationShelf">
      <div class="creation-mode-switch" role="group" aria-label="Choose how to create"><button id="creationFreeMode" aria-pressed="true">✦ Make your own</button><button id="creationChallengeMode" aria-pressed="false">◎ Rebuild a scene</button></div>
      <section id="creationFreeShelf"><div class="creation-shelf-heading"><div><h2>Your next adventure starts here</h2><p>Choose a world. You’re the director.</p></div><span class="creation-small-pill">MOVE · TALK · DANCE · PLAY</span></div><div id="creationStarters" class="creation-starters"></div><section id="creationSavedSection"><div class="creation-shelf-heading"><h2>My scenes</h2><p>Pick up where your imagination left off.</p></div><div id="creationSaved" class="creation-saved-grid"></div></section></section>
      <section id="creationChallengeShelf" hidden><div class="creation-shelf-heading"><div><h2>Watch it. Wonder. Make it happen.</h2><p>Rebuild the scene your way. Different blocks can tell the same story.</p></div><span class="creation-small-pill">SMALL CHALLENGES · REAL IDEAS</span></div><div id="creationChallenges" class="creation-challenge-grid"></div></section>
    </div>
    <div id="creationWorkspace" hidden>
      <div class="creation-project-bar"><button id="creationBack" class="creation-button creation-quiet">← My scenes</button><label class="creation-title-label"><span class="creation-sr">Scene title</span><input id="creationTitle" maxlength="80" aria-label="Scene title"></label><span id="creationSaveState" class="creation-save-state">Saved on this device</span><div class="creation-version-actions"><button id="creationUndo" class="creation-button" title="Undo last edit">↶ <span>Undo</span></button><button id="creationRedo" class="creation-button" title="Redo last edit">↷ <span>Redo</span></button><button id="creationKeep" class="creation-button creation-primary">Keep this version</button><details class="creation-more" id="creationMore"><summary aria-label="More scene tools">•••</summary><div><button id="creationCopy">Make a copy</button><button id="creationDownload">Download editable scene</button><button id="creationImportButton">Open scene file</button><input id="creationImport" type="file" accept="application/json,.json" hidden><button id="creationVideo">Save a video</button><button id="creationHistory">See saved versions</button><button id="creationDelete">Delete this scene</button></div></details></div></div>
      <div id="creationSource" class="creation-source" hidden></div>
      <div id="creationRecovery" class="creation-recovery" hidden><span>You have unfinished changes saved on this device.</span><button id="creationResumeDraft" class="creation-button">Resume my draft</button><button id="creationDiscardDraft" class="creation-button">Use saved version</button></div>
      <section id="creationChallengeBrief" class="creation-challenge-brief" hidden></section>
      <div class="creation-workspace-grid">
        <div class="creation-stage-column">
          <section class="creation-stage-card" aria-label="Scene preview"><div class="creation-stage-heading"><span id="creationPreviewLabel">YOUR STAGE</span><span id="creationClock">0.0 s</span></div><div class="creation-canvas-wrap"><canvas id="creationCanvas" width="800" height="450" tabindex="0" aria-label="Your scene. Select a character to edit it. Use the character buttons to trigger taps." role="img"></canvas><div id="creationLearning" class="creation-learning" hidden></div><div id="creationTargetBadge" class="creation-target-badge" hidden>Watching the goal · your blocks are safe</div></div><div class="creation-playbar"><button id="creationRun" class="creation-button creation-play">▶ Play my scene</button><button id="creationPause" class="creation-button" disabled>Ⅱ Pause</button><button id="creationStep" class="creation-button" aria-label="Advance the scene by one tenth of a second">▹ Step</button><button id="creationReset" class="creation-button" aria-label="Reset scene to its beginning">↺ Reset</button><span id="creationRunStatus">Ready for your ideas</span></div></section>
          <section class="creation-cast-card"><div class="creation-section-label"><h2>Characters & things</h2><button id="creationAddActor" class="creation-button creation-quiet">＋ Add</button></div><div id="creationActors" class="creation-actors" role="group" aria-label="Choose a character"></div><div id="creationActorSettings" class="creation-actor-settings"></div><div class="creation-setting-row"><label>World <select id="creationBackground"><option value="meadow">Sunny meadow</option><option value="sky">Cloud country</option><option value="night">Starry night</option><option value="workshop">Dream workshop</option></select></label><span id="creationPositionHelp">Drag a character to set its starting spot.</span></div><div id="creationVariables" class="creation-variables"></div></section>
          <section id="creationFeedback" class="creation-feedback" aria-live="polite" hidden></section>
          <p class="creation-footnote">Your scene saves on this device. You choose which version to keep.</p>
        </div>
        <section class="creation-code-card" aria-label="Scene blocks"><div class="creation-code-heading"><div><span class="creation-eyebrow">MAKE SOMETHING HAPPEN</span><h2 id="creationCodeTitle">My character’s blocks</h2></div><span class="creation-code-badge" aria-hidden="true">{ }</span></div><div class="creation-script-row"><label>Script <select id="creationScript" aria-label="Choose a script"></select></label><button id="creationAddScript" class="creation-button creation-quiet">＋ Script</button></div><div id="creationTrigger" class="creation-trigger"></div><div class="creation-block-editor"><aside class="creation-palette" aria-label="Add a block"><h3>Pick a block</h3><div id="creationPalette"></div></aside><div class="creation-sequence"><div id="creationBlocks" class="creation-blocks"></div><p class="creation-code-tip">Add blocks with a tap. Use ↑ ↓ to put them in order.</p></div></div></section>
      </div>
      <section id="creationVersions" class="creation-versions" hidden><div class="creation-shelf-heading"><h2>Saved versions</h2><button id="creationCloseHistory" class="creation-button">Close</button></div><div id="creationVersionList"></div></section>
    </div>
    <dialog id="creationActorDialog" class="creation-dialog" aria-labelledby="creationActorDialogTitle"><div class="creation-shelf-heading"><div><span class="creation-eyebrow">EVERY STORY NEEDS A CAST</span><h2 id="creationActorDialogTitle">Who’s joining your scene?</h2></div><button id="creationCloseActor" class="creation-button" aria-label="Close character picker">×</button></div><div id="creationActorChoices" class="creation-actor-choices"></div></dialog>`;
  document.querySelector('main')!.append(page);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => page.querySelector<T>('#' + id)!;
  const stage = new CreationStage($<HTMLCanvasElement>('creationCanvas'));
  const palShelf = node('section', 'creation-pal-shelf'); palShelf.id = 'creationPals';
  palShelf.setAttribute('aria-label', 'Make something with your Pals');
  $('creationStarters').before(palShelf);
  const palTools = node('div', 'creation-pal-tools'); palTools.id = 'creationPalTools';
  $('creationActors').before(palTools);
  let scene: CreationProject | null = null, entryId = '', revisionId = '', sceneOwner = '', selectedActor = '', selectedProgram = '';
  let sourceSessionId = '', challengeId: string | null = null, hintUsed = false, targetMode = false, visible = false;
  let engine: SceneEngine | null = null, frame = 0, last = 0, checkpointTimer: ReturnType<typeof setInterval> | undefined;
  let insert: Insert | null = null, undo: CreationProject[] = [], redo: CreationProject[] = [], dirty = false, recoveryPending = false;
  type Recording = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; owner: string; title: string; cancelled: boolean; timer?: ReturnType<typeof setTimeout> };
  let recording: Recording | null = null;
  let targetInputs = 0;
  const status = (message: string, error = false) => { $('creationStatus').textContent = message; $('creationStatus').classList.toggle('is-error', error); };
  const isCurrent = () => visible && sceneOwner === owner() && !!scene;
  const act = (fn: () => unknown) => { try { return fn(); } catch (error) { status((error as Error).message, true); } };
  function locked() { if (!FG.learning.active) return false; FG.learning.focus?.(); status('Finish your learning activity, or choose My Games to leave.'); return true; }
  const recoveryMessage = 'Choose “Resume my draft” or “Use saved version” before changing this scene.';
  function assertEditing(options: { resolvingRecovery?: boolean } = {}) { if (!isCurrent()) throw Error('Reopen your scene in your own profile.'); if (locked()) throw Error('Your learning activity is still open.'); if (recoveryPending && !options.resolvingRecovery) throw Error(recoveryMessage); }
  function freshEngine() { if (!scene) return; engine = new SceneEngine(scene); targetMode = false; $('creationTargetBadge').hidden = true; $('creationPreviewLabel').textContent = 'YOUR STAGE'; paint(); }
  function stop(clearRecording = true) { cancelAnimationFrame(frame); frame = 0; last = 0; engine?.pause(); if (clearRecording) cancelRecording(); $<HTMLButtonElement>('creationPause').disabled = true; }
  function paint() {
    if (!scene || !engine) return;
    const snapshot = engine.snapshot();
    stage.render(targetMode && challengeId ? createChallengeTarget(challengeId) : scene, snapshot, targetMode || snapshot.status === 'running' ? '' : selectedActor);
    $('creationClock').textContent = (snapshot.timeMs / 1000).toFixed(1) + ' s';
    $('creationRunStatus').textContent = snapshot.status === 'limit' ? snapshot.reason || 'This scene reached its run limit. Try fewer repeats.' : snapshot.status === 'running' ? 'Your blocks are running…' : snapshot.status === 'paused' ? 'Paused · step through your idea' : snapshot.status === 'completed' ? 'Scene finished. Tap a character to try its tap script.' : 'Ready for your ideas';
    page.querySelectorAll<HTMLElement>('[data-block-id]').forEach(b => b.classList.toggle('is-running', snapshot.activeBlockIds.includes(b.dataset.blockId!)));
    const summary = snapshot.actors.filter(a => a.visible).map(a => `${a.name} at ${Math.round(a.x)}, ${Math.round(a.y)}${a.speech ? ', says ' + a.speech : ''}`).join('. ');
    $('creationCanvas').setAttribute('aria-label', (targetMode ? 'Goal scene. ' : 'Your scene. ') + summary + '. ' + Object.entries(snapshot.variables).map(([name, value]) => name + ': ' + value).join(', '));
    $<HTMLButtonElement>('creationPause').disabled = snapshot.status !== 'running' && snapshot.status !== 'paused';
    $('creationPause').textContent = snapshot.status === 'paused' ? '▶ Resume' : 'Ⅱ Pause';
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
  function learningThen(action: () => void) {
    if (locked() || !isCurrent()) return;
    if (recoveryPending) { status(recoveryMessage, true); return; }
    const target = $('creationLearning'), beforeOwner = sceneOwner, beforeId = entryId;
    const done = () => { target.hidden = true; if (isCurrent() && beforeOwner === owner() && beforeId === entryId) action(); };
    const asked = FG.learning.checkpoint(target, { gameId: 'creation', projectId: entryId, versionId: revisionId }, done, { onLeave: () => host.home() });
    if (asked) { stop(); target.hidden = false; } else action();
  }
  function run(record = false) {
    assertEditing(); saveVersion();
    learningThen(() => { stop(); freshEngine(); engine!.start(); if (record) beginRecording(); animate(); });
  }
  function mutation(change: (project: CreationProject) => void, rerender = true) {
    assertEditing(); stop();
    const before = clone(scene!), next = clone(scene!); change(next); validateCreationProject(next);
    store().autosave(entryId, sceneOwner, next, revisionId);
    undo.push(before); if (undo.length > 60) undo.shift(); redo = []; scene = next; dirty = true;
    $('creationSaveState').textContent = 'Draft saved · keep when you’re ready';
    freshEngine(); if (rerender) renderEditor(); updateUndo();
  }
  function updateUndo() { $<HTMLButtonElement>('creationUndo').disabled = !undo.length; $<HTMLButtonElement>('creationRedo').disabled = !redo.length; }
  function saveVersion() {
    if (!scene || !dirty) return;
    if (recoveryPending) throw Error(recoveryMessage);
    const revision = store().save(entryId, sceneOwner, scene, revisionId); revisionId = revision.id; dirty = false;
    $('creationSaveState').textContent = 'Version saved · ready to keep';
  }
  function loadScene(id: string) {
    const loaded = store().load(id, owner());
    status(''); $<HTMLDetailsElement>('creationMore').open = false;
    stop(); scene = loaded.scene; entryId = id; revisionId = loaded.revision.id; sceneOwner = owner();
    selectedActor = scene.actors[0]?.id || ''; selectedProgram = scene.programs.find(p => p.actorId === selectedActor)?.id || '';
    sourceSessionId = scene.provenance?.sourceSessionId || '';
    challengeId = loaded.project.challengeId && getCreationChallenge(loaded.project.challengeId) ? loaded.project.challengeId : null; hintUsed = !!loaded.project.hintUsed; targetMode = false; undo = []; redo = []; dirty = false; insert = null; recoveryPending = !!loaded.draft;
    $('creationShelf').hidden = true; $('creationWorkspace').hidden = false; $('creationVersions').hidden = true; $('creationFeedback').hidden = true;
    $('creationRecovery').hidden = !recoveryPending;
    $('creationHeading').textContent = 'Your imagination, in motion.'; $('creationSubtitle').textContent = 'Choose a character. Give it some blocks. Press play.';
    $('creationSaveState').textContent = loaded.project.keptId === revisionId ? 'Your kept version' : 'Saved on this device';
    if (loaded.project.challengeId && !challengeId) status('This scene’s original challenge is no longer available. You can still edit and keep your scene.');
    $<HTMLInputElement>('creationTitle').value = scene.title; freshEngine(); renderEditor(); renderBrief(); renderSource(); updateUndo();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function enter() { if (!host.enter()) return false; visible = true; page.classList.remove('hidden'); startCheckpointTimer(); return true; }
  function open(id?: string) { act(() => { if (!enter()) return; if (id) loadScene(id); else shelf(); }); }
  function shelf(mode: 'free' | 'challenge' = 'free') {
    if (locked()) return; saveVersion(); stop(); scene = null; entryId = ''; sceneOwner = owner(); sourceSessionId = ''; recoveryPending = false;
    $('creationWorkspace').hidden = true; $('creationShelf').hidden = false;
    $('creationHeading').textContent = 'Little blocks. Big possibilities.'; $('creationSubtitle').textContent = 'Make a story move. Give a character an idea. See what happens.';
    $('creationFreeShelf').hidden = mode !== 'free'; $('creationChallengeShelf').hidden = mode !== 'challenge';
    $('creationFreeMode').setAttribute('aria-pressed', String(mode === 'free')); $('creationChallengeMode').setAttribute('aria-pressed', String(mode === 'challenge'));
    renderShelf(); status(''); $('creationHeading').focus({ preventScroll: true });
  }
  function create(kind: 'dragon' | 'buckets' | 'robot' | 'blank') { const project = store().create(owner(), createStarterProject(kind)); loadScene(project.id); }
  function challenge(id: string) { const project = store().create(owner(), { ...createChallengeStarter(id), id: uid() }, { challengeId: id }); loadScene(project.id); }
  function ownedPals(): CreationPalId[] { return [...new Set(host.ownedPals?.() ?? [])].filter(isCreationPalId); }
  function requireOwnedPal(id: string): CreationPalId {
    if (!isCreationPalId(id) || !ownedPals().includes(id)) throw Error('Choose a Pal from your collection first.');
    return id;
  }
  function openWithPal(id: string): boolean {
    const palId = requireOwnedPal(id);
    if (locked()) return false;
    if (visible) {
      if (recoveryPending) throw Error(recoveryMessage);
      saveVersion();
    }
    // Read before leaving the current page so damaged scene history cannot be
    // replaced with an apparently successful new empty collection.
    const collection = store(); collection.read();
    const project = createPalPlayground(palId);
    if (!enter()) return false;
    const saved = collection.create(owner(), project); loadScene(saved.id);
    // Show the child's editable tap script immediately; Play and Keep are still
    // deliberate actions, and the starter blocks retain their starter origin.
    selectedProgram = scene!.programs.find(program => program.trigger.type === 'tap')!.id;
    renderEditor(); status('Press Play, then tap your Pal. Change the blocks to make it your own.');
    return true;
  }
  function addOwnedPal(id: string) {
    assertEditing();
    if (challengeId) throw Error('Finish your challenge, then choose “Make it my own” to add your Pal.');
    const palId = requireOwnedPal(id);
    mutation(project => {
      const added = addPalToProject(project, palId);
      Object.assign(project, added.scene); selectedActor = added.actorId; selectedProgram = added.programId; insert = null;
    });
    $<HTMLDialogElement>('creationActorDialog').close();
    status('Your Pal joined the cast. Press Play and tap it, or change its blocks.');
  }
  function renderPalShelf() {
    palShelf.replaceChildren(); palShelf.hidden = !host.ownedPals;
    if (palShelf.hidden) return;
    const copy = node('div', 'creation-pal-intro');
    copy.append(node('h3', '', 'Your Pal. Your next big idea.'), node('p', '', 'A little jump, a silly line, a whole story. You choose.'));
    palShelf.append(copy);
    const choices = node('div', 'creation-pal-starts');
    for (const id of ownedPals()) {
      const asset = creationAsset('pal-' + id)!;
      const button = node('button', 'creation-pal-starter'); button.type = 'button'; button.dataset.creationPal = id;
      const label = node('span'); label.append(node('strong', '', asset.label), node('small', '', 'Make a scene →'));
      button.append(art(asset.id), label); button.onclick = () => act(() => openWithPal(id)); choices.append(button);
    }
    if (!choices.childElementCount && host.openPals) {
      const choose = node('button', 'creation-button', 'Choose your first Pal'); choose.type = 'button';
      choose.onclick = () => act(() => { if (!locked()) host.openPals?.(); }); choices.append(choose);
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
    button.onclick = () => act(() => {
      assertEditing();
      if (id) addOwnedPal(id);
      else { saveVersion(); host.openPals?.(); }
    });
    palTools.append(button);
    if (id) palTools.append(node('span', '', `${creationAsset('pal-' + id)!.label} brings a tap-to-dance script. You can change every block.`));
    if (ids.length > 1) {
      const choose = node('button', 'creation-text-button', 'Choose another'); choose.type = 'button'; choose.id = 'creationChoosePal';
      choose.onclick = () => act(() => { assertEditing(); renderActorChoices(true); $<HTMLDialogElement>('creationActorDialog').showModal(); });
      palTools.append(choose);
    }
  }
  function art(assetId: string) {
    const asset = creationAsset(assetId), wrap = node('span', 'creation-actor-art');
    if (asset?.url) { const img = node('img'); img.src = asset.url; img.alt = ''; wrap.append(img); }
    else { wrap.classList.add('creation-art-' + (asset?.shape || 'gem')); wrap.style.setProperty('--actor-color', asset?.color || '#9473D3'); wrap.textContent = asset?.emoji || (asset?.shape === 'robot' ? '▰' : asset?.shape === 'bucket' ? '◡' : '◆'); }
    return wrap;
  }
  function renderShelf() {
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
      const info = node('span', 'creation-starter-copy'); info.append(node('strong', '', name), node('span', '', copy), node('b', '', 'Make a scene  →'));
      button.append(image, info); button.onclick = () => act(() => create(kind)); starters.append(button);
    }
    const saved = $('creationSaved'); saved.replaceChildren();
    for (const project of store().list(owner())) {
      const loaded = store().load(project.id, owner()); const button = node('button', 'creation-saved-card'); button.type = 'button'; button.dataset.scene = project.id;
      const thumb = art(loaded.scene.actors[0]?.assetId || 'gem');
      const copy = node('span'); copy.append(node('strong', '', project.title), node('small', '', project.challengeId ? 'Scene challenge · continue' : loaded.draft ? 'Unfinished ideas saved' : project.keptId ? 'A scene you kept' : 'Your work in progress'));
      button.append(thumb, copy, node('span', 'creation-saved-arrow', '→')); button.onclick = () => act(() => loadScene(project.id)); saved.append(button);
    }
    $('creationSavedSection').hidden = !saved.childElementCount;
    const challenges = $('creationChallenges'); challenges.replaceChildren();
    CREATION_CHALLENGES.forEach((item, index) => {
      const button = node('button', 'creation-challenge-card'); button.type = 'button'; button.dataset.challenge = item.id;
      const stamp = node('span', 'creation-challenge-stamp', ['↗', '↻', '☝', '✦', '⑂'][index] || '◎');
      button.append(stamp, node('small', '', 'SCENE ' + String(index + 1).padStart(2, '0')), node('strong', '', item.title), node('p', '', item.brief), node('span', 'creation-challenge-concepts', item.concepts.join(' · ')), node('b', '', 'Watch & rebuild →'));
      button.onclick = () => act(() => challenge(item.id)); challenges.append(button);
    });
  }
  function renderSource() {
    const box = $('creationSource'); box.replaceChildren(); const provenance = scene?.provenance;
    box.hidden = !provenance?.sourceProjectId; if (box.hidden) return;
    box.append(node('span', '', '✦ A new scene from your game · linked to the version you chose'));
    if (sourceSessionId) { const button = node('button', 'creation-text-button', 'Back to my game →'); button.onclick = () => act(() => { saveVersion(); stop(); void host.openGame(sourceSessionId); }); box.append(button); }
  }
  function renderBrief() {
    const box = $('creationChallengeBrief'); box.replaceChildren(); box.hidden = !challengeId; if (!challengeId) return;
    const goal = getCreationChallenge(challengeId)!;
    const copy = node('div', 'creation-goal-copy'); copy.append(node('span', 'creation-eyebrow', 'YOUR SCENE CHALLENGE'), node('h2', '', goal.title), node('p', '', goal.brief));
    const list = node('ul'); goal.requirements.forEach(requirement => list.append(node('li', '', requirement))); copy.append(list);
    const testing = node('details', 'creation-test-description'); testing.append(node('summary', '', 'What does the scene check look for?'), node('p', '', goal.testDescription)); copy.append(testing);
    const controls = node('div', 'creation-goal-actions');
    const watch = node('button', 'creation-button', '▷ Watch the goal'); watch.id = 'creationWatchTarget'; watch.onclick = () => act(() => { assertEditing(); learningThen(() => { stop(); engine = new SceneEngine(createChallengeTarget(challengeId!)); engine.start(); targetInputs = 0; targetMode = true; $('creationTargetBadge').hidden = false; $('creationPreviewLabel').textContent = 'THE SCENE TO REBUILD'; animate(); }); });
    const check = node('button', 'creation-button creation-primary', 'Check my scene'); check.id = 'creationCheck'; check.onclick = () => act(() => learningThen(checkChallenge));
    const hint = node('button', 'creation-text-button', hintUsed ? 'See my hint again' : 'A little hint?'); hint.id = 'creationHint'; hint.onclick = () => act(() => { assertEditing(); store().markHintUsed(entryId, sceneOwner); hintUsed = true; const text = node('p', 'creation-hint', goal.hint); hint.replaceWith(text); });
    controls.append(watch, check, hint); box.append(copy, controls);
  }
  function checkChallenge() {
    assertEditing(); if (!challengeId) return; stop(); saveVersion();
    const result = evaluateChallenge(challengeId, scene!);
    store().recordAttempt(entryId, sceneOwner, revisionId, { challengeId, passed: result.passed, hintUsed });
    host.onRewardSourceSaved?.(sceneOwner);
    const feedback = $('creationFeedback'); feedback.hidden = false; feedback.replaceChildren(); feedback.classList.toggle('is-success', result.passed);
    feedback.append(node('span', 'creation-eyebrow', result.passed ? 'YOUR IDEA WORKS' : 'A NEW THING TO NOTICE'), node('h2', '', result.passed ? 'You made it happen!' : 'Let’s look a little closer.'), node('p', '', result.feedback));
    const list = node('ul'); result.checks.forEach(check => list.append(node('li', check.passed ? 'is-pass' : '', (check.passed ? '✓ ' : '○ ') + check.feedback))); feedback.append(list);
    feedback.append(node('small', '', hintUsed ? 'You explored this scene with a hint. Your next idea is still yours.' : 'This records what your scene did on this challenge.'));
    if (result.passed) { const remix = node('button', 'creation-button', 'Make it my own →'); remix.onclick = () => act(() => { assertEditing(); saveVersion(); const copy = store().create(sceneOwner, { ...clone(scene!), id: uid(), title: (scene!.title + ' · my story').slice(0, 60), provenance: { createdBy: 'child', sourceKind: 'creation', sourceProjectId: entryId, sourceRevisionId: revisionId } }); loadScene(copy.id); }); feedback.append(remix); }
    freshEngine(); feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    renderPalTools();
    $<HTMLInputElement>('creationTitle').value = scene.title; $<HTMLSelectElement>('creationBackground').value = scene.background;
    const cast = $('creationActors'); cast.replaceChildren();
    for (const actor of scene.actors) {
      const button = node('button', 'creation-actor'); button.type = 'button'; button.dataset.actor = actor.id; button.setAttribute('aria-pressed', String(selectedActor === actor.id));
      button.append(art(actor.assetId), node('span', '', actor.name));
      button.onclick = () => act(() => { if (locked()) return; selectedActor = actor.id; selectedProgram = scene!.programs.find(p => p.actorId === selectedActor)?.id || ''; insert = null; renderEditor(); paint(); });
      cast.append(button);
    }
    renderActorSettings(); renderPrograms(); renderVariables(); updateUndo();
  }
  function input(label: string, value: string | number, change: (value: string) => void, options: { min?: number; max?: number; step?: number; maxLength?: number } = {}) {
    const wrap = node('label', 'creation-field'), field = node('input'); wrap.append(node('span', '', label)); field.value = String(value); field.setAttribute('aria-label', label);
    if (typeof value === 'number') { field.type = 'number'; field.min = String(options.min ?? -800); field.max = String(options.max ?? 800); field.step = String(options.step ?? 1); }
    else { field.type = 'text'; field.maxLength = options.maxLength ?? 120; }
    field.onchange = () => act(() => { if (field.type === 'number' && (!Number.isFinite(field.valueAsNumber) || !field.checkValidity())) { field.value = String(value); throw Error('Choose a number between ' + field.min + ' and ' + field.max + '.'); } try { change(field.value); } catch (error) { field.value = String(value); throw error; } }); wrap.append(field); return wrap;
  }
  function choice(label: string, value: string, options: [string, string][], change: (value: string) => void) {
    const wrap = node('label', 'creation-field'), select = node('select'); wrap.append(node('span', '', label)); select.setAttribute('aria-label', label);
    options.forEach(([key, text]) => { const option = node('option', '', text); option.value = key; select.append(option); }); select.value = value;
    select.onchange = () => act(() => change(select.value)); wrap.append(select); return wrap;
  }
  function renderActorSettings() {
    const box = $('creationActorSettings'); box.replaceChildren(); const actor = scene!.actors.find(a => a.id === selectedActor); if (!actor) return;
    const set = (key: string, value: string | number) => mutation(project => Object.assign(project.actors.find(a => a.id === actor.id)!, { [key]: value }));
    box.append(input('Name', actor.name, value => set('name', value.trim() || 'My character'), { maxLength: 40 }), input('Start x', actor.x, value => set('x', +value), { min: 0, max: scene!.width }), input('Start y', actor.y, value => set('y', +value), { min: 0, max: scene!.height }), input('Size', actor.size || 100, value => set('size', +value), { min: 20, max: 240 }));
    const remove = node('button', 'creation-text-button', 'Remove'); remove.setAttribute('aria-label', 'Remove ' + actor.name); remove.disabled = !!challengeId || scene!.actors.length < 2;
    remove.onclick = () => act(() => mutation(project => { project.actors = project.actors.filter(a => a.id !== actor.id); project.programs = project.programs.filter(p => p.actorId !== actor.id); selectedActor = project.actors[0].id; selectedProgram = project.programs.find(p => p.actorId === selectedActor)?.id || ''; insert = null; })); box.append(remove);
    const tap = node('button', 'creation-button creation-quiet', '☝ Try tap'); tap.id = 'creationTapActor'; tap.setAttribute('aria-label', 'Tap ' + actor.name);
    tap.onclick = () => act(() => learningThen(() => { if (targetMode || !engine) freshEngine(); if (engine!.snapshot().status === 'idle') engine!.start(); engine!.resume(); engine!.tap(actor.id); animate(); })); box.append(tap);
    box.querySelectorAll<HTMLInputElement>('input').forEach(field => { if (challengeId && field.getAttribute('aria-label') !== 'Name') field.disabled = true; });
    $('creationPositionHelp').textContent = challengeId ? 'The starting scene stays the same. Change what happens with blocks.' : 'Drag a character to set its starting spot.';
  }
  function renderVariables() {
    const box = $('creationVariables'); box.replaceChildren(); if (!scene) return;
    const details = node('details'); const summary = node('summary', '', 'Numbers in this scene'); details.append(summary);
    const row = node('div', 'creation-variable-row');
    for (const [key, value] of Object.entries(scene.variables)) row.append(input(key, value, raw => mutation(project => { project.variables[key] = +raw; }), { min: -999, max: 999 }));
    const add = node('button', 'creation-button creation-quiet', '＋ Number'); add.onclick = () => act(() => { const name = prompt('What will you count? Use a short name, like gems or points.', 'points')?.trim(); if (!name) return; if (!/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/.test(name)) throw Error('Use a name starting with a letter, with letters, numbers or underscores.'); mutation(project => { project.variables[name] = 0; }); }); row.append(add); details.append(row); box.append(details);
  }
  function renderPrograms() {
    const programs = scene!.programs.filter(p => p.actorId === selectedActor), select = $<HTMLSelectElement>('creationScript'); select.replaceChildren();
    if (!programs.some(p => p.id === selectedProgram)) selectedProgram = programs[0]?.id || '';
    programs.forEach((p, index) => { const option = node('option', '', `Script ${index + 1} · ${p.trigger.type === 'event' ? 'on ' + p.trigger.name : p.trigger.type === 'tap' ? 'when tapped' : 'when play starts'}`); option.value = p.id; select.append(option); });
    select.value = selectedProgram; const actor = scene!.actors.find(a => a.id === selectedActor);
    $('creationCodeTitle').textContent = (actor?.name || 'My character') + '’s blocks';
    const trigger = $('creationTrigger'); trigger.replaceChildren(); const program = currentProgram();
    if (!program) { trigger.append(node('p', '', 'Add a script to give this character something to do.')); $('creationBlocks').replaceChildren(); return; }
    trigger.append(node('span', 'creation-trigger-flag', '⚑'));
    trigger.append(choice('When', program.trigger.type, [['start', 'I press play'], ['tap', 'this character is tapped'], ['event', 'a signal arrives']], value => mutation(project => { const p = project.programs.find(p => p.id === selectedProgram)!; p.trigger = value === 'event' ? { type: 'event', name: 'go' } : { type: value as 'start' | 'tap' }; })));
    if (program.trigger.type === 'event') trigger.append(input('Signal name', program.trigger.name, value => mutation(project => { project.programs.find(p => p.id === selectedProgram)!.trigger = { type: 'event', name: value.trim() || 'go' }; }), { maxLength: 40 }));
    if (programs.length > 1) { const remove = node('button', 'creation-text-button', 'Remove script'); remove.onclick = () => act(() => mutation(project => { project.programs = project.programs.filter(p => p.id !== selectedProgram); selectedProgram = ''; insert = null; })); trigger.append(remove); }
    if (!insert || insert.programId !== selectedProgram) insert = { programId: selectedProgram };
    $('creationBlocks').replaceChildren(renderBlocks(program.actions, { programId: selectedProgram }));
  }
  function renderBlocks(blocks: CreationBlock[], address: Insert) {
    const list = node('div', 'creation-block-list'); list.dataset.container = address.blockId || address.programId;
    blocks.forEach((block, index) => {
      const metadata = palette.find(p => p.type === block.type)!;
      const card = node('div', 'creation-block block-' + metadata.group); card.dataset.blockId = block.id; card.draggable = true;
      card.addEventListener('dragstart', event => { event.stopPropagation(); event.dataTransfer?.setData('application/x-jems-block', block.id); });
      card.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('application/x-jems-block')) event.preventDefault(); });
      card.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); const moved = event.dataTransfer?.getData('application/x-jems-block'); if (moved && moved !== block.id) act(() => mutation(project => { const from = findBlock(project, moved), to = findBlock(project, block.id); if (from.list !== to.list) throw Error('Use the nested “add here” spaces to build groups. Reorder blocks inside their own group.'); from.list.splice(from.index, 1); const next = from.list.findIndex(b => b.id === block.id); from.list.splice(next, 0, from.block); })); });
      const head = node('div', 'creation-block-head'); head.append(node('span', 'creation-block-name', metadata.icon + ' ' + metadata.label));
      const controls = node('span', 'creation-block-tools');
      for (const [label, icon, direction] of [['Move block up', '↑', -1], ['Move block down', '↓', 1]] as const) { const b = node('button', '', icon); b.type = 'button'; b.setAttribute('aria-label', label); b.disabled = index + direction < 0 || index + direction >= blocks.length; b.onclick = () => act(() => mutation(project => { const found = findBlock(project, block.id); const other = found.index + direction; [found.list[found.index], found.list[other]] = [found.list[other], found.list[found.index]]; })); controls.append(b); }
      const remove = node('button', '', '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + metadata.label + ' block'); remove.onclick = () => act(() => mutation(project => { const found = findBlock(project, block.id); found.list.splice(found.index, 1); insert = address; })); controls.append(remove); head.append(controls); card.append(head);
      const fields = node('div', 'creation-block-fields');
      const update = (key: string, value: unknown) => mutation(project => {
        if (key === 'variable' && typeof value === 'string' && !Object.hasOwn(project.variables, value)) project.variables[value] = 0;
        if (key === 'condition' && (value as { type: string }).type === 'variable') { const name = (value as { variable: string }).variable; if (!Object.hasOwn(project.variables, name)) project.variables[name] = 0; }
        Object.assign(findBlock(project, block.id).block, { [key]: value, origin: 'child' });
      });
      const number = (label: string, key: string, value: number, min = -800, max = 800, step = 1) => fields.append(input(label, value, raw => update(key, +raw), { min, max, step }));
      const duration = (value: number) => fields.append(input('seconds', value / 1000, raw => update('durationMs', Math.round(+raw * 1000)), { min: .1, max: 10, step: .1 }));
      if (block.type === 'move') {
        const absolute = block.x !== undefined || block.y !== undefined;
        fields.append(choice('Move', absolute ? 'to' : 'by', [['by', 'by this much'], ['to', 'to a spot']], value => mutation(project => { const b = findBlock(project, block.id).block; if (b.type !== 'move') return; delete b.x; delete b.y; delete b.dx; delete b.dy; Object.assign(b, value === 'to' ? { x: scene!.actors.find(a => a.id === selectedActor)!.x, y: scene!.actors.find(a => a.id === selectedActor)!.y } : { dx: 80, dy: 0 }); })));
        number(absolute ? 'x' : 'right / left', absolute ? 'x' : 'dx', absolute ? block.x ?? 0 : block.dx ?? 0);
        number(absolute ? 'y' : 'down / up', absolute ? 'y' : 'dy', absolute ? block.y ?? 0 : block.dy ?? 0); duration(block.durationMs ?? 500);
      } else if (block.type === 'say') { fields.append(input('Words', block.text, value => update('text', value))); duration(block.durationMs); }
      else if (block.type === 'wait' || block.type === 'dance') duration(block.durationMs);
      else if (block.type === 'jump') { number('height', 'height', block.height, 0, 250); duration(block.durationMs); }
      else if (block.type === 'repeat') number('times', 'count', block.count, 1, 20);
      else if (block.type === 'set' || block.type === 'change') { fields.append(input('Number name', block.variable, value => update('variable', value.trim() || 'gems'), { maxLength: 30 })); number(block.type === 'set' ? 'value' : 'add', block.type === 'set' ? 'value' : 'amount', block.type === 'set' ? block.value : block.amount, -999, 999); }
      else if (block.type === 'emit') fields.append(input('Signal name', block.name, value => update('name', value.trim() || 'go'), { maxLength: 40 }));
      else if (block.type === 'if') {
        const condition = block.condition;
        fields.append(choice('Check', condition.type, [['variable', 'a number'], ['position', 'my position'], ['touching', 'touching a character']], value => update('condition', value === 'touching' ? { type: 'touching', actorId: scene!.actors.find(a => a.id !== selectedActor)?.id || selectedActor } : value === 'position' ? { type: 'position', axis: 'x', operator: 'gte', value: 400 } : { type: 'variable', variable: Object.keys(scene!.variables)[0] || 'gems', operator: 'gte', value: 3 })));
        if (condition.type === 'touching') fields.append(choice('Character', condition.actorId, scene!.actors.map(a => [a.id, a.name]), value => update('condition', { ...condition, actorId: value })));
        else {
          if (condition.type === 'variable') fields.append(input('Number', condition.variable, value => update('condition', { ...condition, variable: value.trim() || 'gems' }), { maxLength: 30 }));
          else fields.append(choice('Axis', condition.axis, [['x', 'x · across'], ['y', 'y · down']], value => update('condition', { ...condition, axis: value })));
          fields.append(choice('Rule', condition.operator, [['eq', '='], ['neq', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥']], value => update('condition', { ...condition, operator: value })));
          fields.append(input('Compare with', condition.value, value => update('condition', { ...condition, value: +value }), { min: -999, max: 999 }));
        }
      }
      if (fields.childElementCount) card.append(fields);
      if (block.type === 'repeat') card.append(renderBlocks(block.actions, { programId: selectedProgram, blockId: block.id, branch: 'actions' }));
      else if (block.type === 'if') { card.append(node('span', 'creation-branch-label', 'THEN'), renderBlocks(block.then, { programId: selectedProgram, blockId: block.id, branch: 'then' }), node('span', 'creation-branch-label', 'OTHERWISE'), renderBlocks(block.else || [], { programId: selectedProgram, blockId: block.id, branch: 'else' })); }
      list.append(card);
    });
    const destination = node('button', 'creation-insert', blocks.length ? '＋ Add the next block here' : '＋ Choose a block to put here'); destination.type = 'button';
    const selected = JSON.stringify(insert) === JSON.stringify(address); destination.setAttribute('aria-pressed', String(selected));
    destination.onclick = () => { insert = address; renderPrograms(); }; list.append(destination); return list;
  }
  const paletteBox = $('creationPalette');
  for (const item of palette) {
    const b = node('button', 'creation-palette-block block-' + item.group); b.type = 'button'; b.dataset.addBlock = item.type; b.title = item.detail; b.append(node('span', '', item.icon), node('b', '', item.label));
    b.onclick = () => act(() => mutation(project => {
      if (!selectedProgram) { const program = { id: uid(), actorId: selectedActor, trigger: { type: 'start' as const }, actions: [] as CreationBlock[] }; project.programs.push(program); selectedProgram = program.id; insert = { programId: program.id }; }
      const block = newBlock(item.type);
      const variable = block.type === 'if' && block.condition.type === 'variable' ? block.condition.variable : block.type === 'set' || block.type === 'change' ? block.variable : null;
      if (variable && !Object.hasOwn(project.variables, variable)) project.variables[variable] = 0;
      blocksAt(project, insert || { programId: selectedProgram }).push(block);
      if (block.type === 'repeat') insert = { programId: selectedProgram, blockId: block.id, branch: 'actions' };
      if (block.type === 'if') insert = { programId: selectedProgram, blockId: block.id, branch: 'then' };
    })); paletteBox.append(b);
  }
  function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function cancelRecording() {
    const current = recording; if (!current) return; current.cancelled = true; recording = null;
    clearTimeout(current.timer); if (current.recorder.state !== 'inactive') current.recorder.stop();
    current.stream.getTracks().forEach(track => track.stop()); $('creationVideo').textContent = 'Save a video';
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
        current.chunks = []; if (recording === current) { recording = null; $('creationVideo').textContent = 'Save a video'; }
      };
      current.recorder.onerror = () => { current.cancelled = true; clearTimeout(current.timer); current.stream.getTracks().forEach(track => track.stop()); if (recording === current) recording = null; status('The video could not be recorded. Your editable scene is still saved.', true); };
      current.recorder.start(); $('creationVideo').textContent = 'Stop & save video'; status('Recording up to 15 seconds. Tap a character to trigger its script. Choose “Stop & save video” when you’re ready.');
      current.timer = setTimeout(() => { if (current.recorder.state === 'recording') current.recorder.stop(); }, 15000);
    } catch (error) { stream.getTracks().forEach(track => track.stop()); recording = null; throw error; }
  }
  function startCheckpointTimer() {
    clearInterval(checkpointTimer);
    checkpointTimer = setInterval(() => { if (!isCurrent() || targetMode || FG.learning.active || engine?.snapshot().status !== 'running') return; const wasRunning = true; learningThen(() => { if (wasRunning && engine?.snapshot().status === 'paused') { engine.resume(); animate(); } }); }, 15000);
  }
  function leave() {
    if (!visible) return; stop(); clearInterval(checkpointTimer); visible = false;
    $<HTMLDialogElement>('creationActorDialog').close(); $('creationLearning').hidden = true;
  }
  $('creationHome').onclick = () => act(() => { saveVersion(); host.home(); });
  $('creationBack').onclick = () => act(() => shelf());
  $('creationFreeMode').onclick = () => act(() => shelf('free'));
  $('creationChallengeMode').onclick = () => act(() => shelf('challenge'));
  $<HTMLInputElement>('creationTitle').maxLength = 60;
  $('creationTitle').onchange = () => act(() => mutation(project => { project.title = $<HTMLInputElement>('creationTitle').value.trim().slice(0, 60) || 'My scene'; }, false));
  $('creationBackground').onchange = () => act(() => mutation(project => { project.background = $<HTMLSelectElement>('creationBackground').value as CreationProject['background']; }));
  $('creationScript').onchange = () => { selectedProgram = $<HTMLSelectElement>('creationScript').value; insert = null; renderPrograms(); };
  $('creationAddScript').onclick = () => act(() => mutation(project => {
    const programs = project.programs.filter(p => p.actorId === selectedActor);
    const trigger = !programs.some(p => p.trigger.type === 'start') ? { type: 'start' as const } : !programs.some(p => p.trigger.type === 'tap') ? { type: 'tap' as const } : { type: 'event' as const, name: 'signal-' + (programs.length + 1) };
    const program = { id: uid(), actorId: selectedActor, trigger, actions: [] }; project.programs.push(program); selectedProgram = program.id; insert = null;
  }));
  $('creationRun').onclick = () => act(() => run());
  $('creationPause').onclick = () => act(() => { assertEditing(); if (!engine) return; if (engine.snapshot().status === 'paused') { engine.resume(); animate(); $('creationPause').textContent = 'Ⅱ Pause'; } else { stop(false); $('creationPause').textContent = '▶ Resume'; } paint(); });
  $('creationReset').onclick = () => act(() => { assertEditing(); stop(); freshEngine(); $('creationPause').textContent = 'Ⅱ Pause'; });
  $('creationStep').onclick = () => act(() => { assertEditing(); learningThen(() => { stop(); if (targetMode || !engine) freshEngine(); if (engine!.snapshot().status === 'idle') engine!.start(); engine!.pause(); engine!.step(100); $('creationPause').textContent = '▶ Resume'; paint(); }); });
  $('creationUndo').onclick = () => act(() => { assertEditing(); if (!undo.length) return; const previous = undo.at(-1)!; store().autosave(entryId, sceneOwner, previous, revisionId); stop(); redo.push(clone(scene!)); scene = undo.pop()!; dirty = true; freshEngine(); renderEditor(); });
  $('creationRedo').onclick = () => act(() => { assertEditing(); if (!redo.length) return; const next = redo.at(-1)!; store().autosave(entryId, sceneOwner, next, revisionId); stop(); undo.push(clone(scene!)); scene = redo.pop()!; dirty = true; freshEngine(); renderEditor(); });
  $('creationKeep').onclick = () => act(() => { assertEditing(); saveVersion(); store().keep(entryId, sceneOwner, revisionId); $('creationSaveState').textContent = 'Your kept version'; status('This version is yours to keep. You can keep experimenting.'); });
  $('creationCopy').onclick = () => act(() => { assertEditing(); saveVersion(); const copied = store().copy(entryId, sceneOwner, scene!.title + ' copy'); loadScene(copied.id); });
  $('creationDownload').onclick = () => act(() => { assertEditing(); download(new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' }), 'jems-scene.json'); });
  $('creationVideo').onclick = () => act(() => { if (recording) { if (recording.recorder.state !== 'inactive') recording.recorder.stop(); return; } run(true); });
  $('creationImportButton').onclick = () => act(() => { assertEditing(); $<HTMLInputElement>('creationImport').click(); });
  $('creationImport').onchange = async () => {
    const input = $<HTMLInputElement>('creationImport'), file = input.files?.[0], capturedOwner = owner(); if (!file) return;
    try { assertEditing(); if (file.size > 500000) throw Error('This scene file is too large.'); const imported = validateCreationProject(JSON.parse(await file.text())); if (owner() !== capturedOwner || !visible) return; assertEditing(); const project = store().create(owner(), { ...imported, id: uid(), provenance: { ...imported.provenance, createdBy: 'assisted' } }); loadScene(project.id); status('Your scene file is open as a new project.'); } catch (error) { status((error as Error).message, true); } finally { input.value = ''; }
  };
  $('creationDelete').onclick = () => act(() => { assertEditing(); if (!confirm('Delete this scene and all of its versions from this device?')) return; store().remove(entryId, sceneOwner); dirty = false; scene = null; shelf(); });
  $('creationHistory').onclick = () => act(() => {
    assertEditing(); saveVersion(); $('creationVersions').hidden = false; const box = $('creationVersionList'); box.replaceChildren();
    const kept = store().get(entryId, sceneOwner).keptId;
    store().history(entryId, sceneOwner).forEach((revision, index) => { const b = node('button', 'creation-button', `Version ${index + 1}${revision.id === kept ? ' · kept' : ''}${revision.id === revisionId ? ' · current' : ''}`); b.onclick = () => act(() => { assertEditing(); store().checkout(entryId, sceneOwner, revision.id); loadScene(entryId); }); box.append(b); });
    $('creationVersions').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('creationCloseHistory').onclick = () => { $('creationVersions').hidden = true; };
  $('creationResumeDraft').onclick = () => act(() => { assertEditing({ resolvingRecovery: true }); const loaded = store().load(entryId, sceneOwner); if (!loaded.draft) { loadScene(entryId); return; } scene = clone(loaded.draft.scene); dirty = true; recoveryPending = false; $('creationRecovery').hidden = true; $('creationSaveState').textContent = 'Recovered draft · ready to keep'; status('Your draft is ready to continue.'); freshEngine(); renderEditor(); });
  $('creationDiscardDraft').onclick = () => act(() => { assertEditing({ resolvingRecovery: true }); store().discardDraft(entryId, sceneOwner); recoveryPending = false; $('creationRecovery').hidden = true; status('Your saved version is ready to continue.'); freshEngine(); renderEditor(); });
  $('creationAddActor').onclick = () => act(() => { assertEditing(); renderActorChoices(); $<HTMLDialogElement>('creationActorDialog').showModal(); });
  $('creationCloseActor').onclick = () => $<HTMLDialogElement>('creationActorDialog').close();
  function renderActorChoices(palsOnly = false) {
    const box = $('creationActorChoices'), ids = ownedPals(); box.replaceChildren();
    $('creationActorDialogTitle').textContent = palsOnly ? 'Which Pal is joining?' : 'Who’s joining your scene?';
    for (const asset of CREATION_ASSETS) {
      if (asset.palId ? challengeId || !ids.includes(asset.palId) : palsOnly) continue;
      const b = node('button', 'creation-character-choice'); b.type = 'button'; b.dataset.creationAsset = asset.id;
      b.append(art(asset.id), node('strong', '', asset.label));
      b.onclick = () => act(() => {
        if (asset.palId) return addOwnedPal(asset.palId);
        mutation(project => { const actor = { id: uid(), assetId: asset.id, name: asset.label, x: Math.round(project.width / 2), y: Math.round(project.height * .66), size: 110, visible: true }; project.actors.push(actor); const program = { id: uid(), actorId: actor.id, trigger: { type: 'start' as const }, actions: [] }; project.programs.push(program); selectedActor = actor.id; selectedProgram = program.id; insert = null; });
        $<HTMLDialogElement>('creationActorDialog').close();
      }); box.append(b);
    }
  }
  let drag: { id: string; x: number; y: number; moved: boolean } | null = null;
  const canvas = $<HTMLCanvasElement>('creationCanvas');
  canvas.onpointerdown = event => {
    if (!isCurrent() || locked() || targetMode) return; const point = stage.point(event), id = stage.hit(point.x, point.y); if (!id) return;
    if (recoveryPending) { status(recoveryMessage, true); return; }
    if (engine?.snapshot().status === 'running' || engine?.snapshot().status === 'completed') { act(() => learningThen(() => { engine!.resume(); engine!.tap(id); animate(); })); return; }
    selectedActor = id; selectedProgram = scene!.programs.find(p => p.actorId === id)?.id || ''; insert = null; renderEditor(); paint();
    if (!challengeId) { drag = { id, ...point, moved: false }; canvas.setPointerCapture(event.pointerId); }
  };
  canvas.onpointermove = event => { if (!drag || !scene || !engine) return; const point = stage.point(event); if (Math.hypot(point.x - drag.x, point.y - drag.y) < 3 && !drag.moved) return; drag.moved = true; const snapshot = engine.snapshot(); const actor = snapshot.actors.find(a => a.id === drag!.id)!; actor.x = Math.max(0, Math.min(scene.width, point.x)); actor.y = Math.max(0, Math.min(scene.height, point.y)); stage.render(scene, snapshot, selectedActor); };
  canvas.onpointerup = event => { const moving = drag; drag = null; if (!moving?.moved) return; const point = stage.point(event); act(() => mutation(project => { const actor = project.actors.find(a => a.id === moving.id)!; actor.x = Math.max(0, Math.min(project.width, point.x)); actor.y = Math.max(0, Math.min(project.height, point.y)); })); };
  canvas.onpointercancel = () => { drag = null; paint(); };
  page.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape' && targetMode && !FG.learning.active) { stop(); freshEngine(); } });
  window.addEventListener('factory-page', event => { if ((event as CustomEvent).detail !== 'creation') leave(); });
  window.addEventListener('factory-profile-before-change', event => { if (!visible) return; try { saveVersion(); stop(); } catch (error) { event.preventDefault(); status((error as Error).message, true); } });
  window.addEventListener('factory-profile', () => {
    leave(); scene = null; entryId = ''; revisionId = ''; sceneOwner = ''; engine = null; undo = []; redo = []; dirty = false; recoveryPending = false; sourceSessionId = ''; stage.clear();
    for (const id of ['creationBlocks','creationActors','creationSaved','creationFeedback','creationSource','creationActorSettings','creationVariables','creationTrigger','creationStatus','creationVersionList','creationPals','creationPalTools','creationActorChoices']) $(id).replaceChildren();
    $('creationCodeTitle').textContent = 'My character’s blocks'; $<HTMLInputElement>('creationTitle').value = '';
  });
  window.addEventListener('beforeunload', event => { if (!visible||!rewardSourceWritable()) return; try { saveVersion(); } catch { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => stop());
  window.addEventListener('factory-learning-active', event => { if (visible && (event as CustomEvent).detail) { stop(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && visible) { stop(); paint(); } });
  const api = {
    open,
    openWithPal,
    refreshPals: () => {
      // Recheck ownership each time the picker is opened or a Pal is added;
      // stale cards cannot introduce a previous profile's collection.
      $<HTMLDialogElement>('creationActorDialog').close();
      if (!visible) return;
      if (scene) renderPalTools(); else renderPalShelf();
    },
    fromStudio(session: StudioSession, revision?: SourceRevision, manifest?: unknown) {
      // The caller still owns the visible Studio surface until entry succeeds.
      // Unsupported sources and unreadable collections must report there.
      const project = createProjectFromStudio(session, revision, manifest);
      const existing = store().list(owner()).find(entry => {
        const source = store().load(entry.id, owner()).scene.provenance;
        return source?.sourceSessionId === session.id && source?.sourceProjectId === project.provenance?.sourceProjectId && source?.sourceRevisionId === project.provenance?.sourceRevisionId;
      });
      if (!enter()) return;
      return act(() => {
        const saved = existing || store().create(owner(), project); sourceSessionId = session.id; loadScene(saved.id);
      });
    },
    export: () => store().read(), validate: validateCreationWorkspace,
    pendingRewards: (owner: string) => store().pendingRewards(owner),
    acknowledgeRewards: (owner: string, ids: string[]) => store().acknowledgeRewards(owner, ids),
    backup: () => {
      const current = store();
      try { return { factoryCreation: current.read() }; }
      catch (error) { const raw = current.recoveryRaw; if (raw === null) throw error; return { factoryCreationRecoveryRaw: raw }; }
    },
    rawSnapshot: () => profileStorage(localStorage).getItem(CREATION_KEY),
    restoreRawSnapshot: (raw: string | null) => { const storage = profileStorage(localStorage); if (raw === null) storage.removeItem(CREATION_KEY); else storage.setItem(CREATION_KEY, raw); },
    restore: (value: unknown) => { store().restore(value); },
    flush: () => { if (visible && sceneOwner === owner()) saveVersion(); },
    snapshot: () => engine?.snapshot() || null,
    scene: () => scene ? clone(scene) : null,
  };
  FG.creation = api;
  return api;
}
