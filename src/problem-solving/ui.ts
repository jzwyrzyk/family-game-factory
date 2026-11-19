import { adultStorageKey, profileStorage } from '../adult-pilot/storage';
import { PROBLEM_SOLVING_EPISODE_SCHEMA, PROBLEM_SOLVING_KEY, type ProblemSolvingDraft, type ProblemSolvingEpisode, type EvidenceSupport } from './model';
import { ProblemSolvingStore } from './storage';
import { createIcon, iconMarkup, setIconLabel, type IconName } from '../brand/icons';
import { assertPracticeContinuation, evaluatePracticeChoice, getPracticeTask, practiceTasksForGrade, runPracticeScene, runPracticeTest, runPracticeRevision, validatePracticeDraft, type PracticeChoice, type PracticePhase, type PracticeScene, type PracticeTask, type PracticeTrial } from './practice';
import './style.css';

type Host = { enter(): boolean; home(): void };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
};
const image = (src: string, className = '') => { const img = node('img', className); img.src = src; img.alt = ''; return img; };
const button = (label: string, className = 'ps-button', icon?: IconName, iconClass = '') => { const b = node('button', className, label); b.type = 'button'; if (icon) setIconLabel(b, icon, label, iconClass); return b; };
const iso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const clone = <T>(value: T): T => structuredClone(value);

export function installProblemSolvingPractice(host: Host) {
  const FG = (window as any).FG;
  const owner = () => String(FG.store.current().id);
  const store = () => new ProblemSolvingStore(profileStorage(localStorage), owner);
  const page = node('section', 'page hidden'); page.id = 'page-problem-solving';
  page.innerHTML = `<header class="ps-heading"><div><span class="ps-eyebrow">THE jems IDEA WORKSHOP</span><h1 id="psHeading" tabindex="-1">Try an idea.</h1><p id="psSubtitle">Wonder a little. Try something. See what changes.</p></div><button type="button" class="ps-button ps-home" id="psHome">${iconMarkup('arrow', 'jems-icon--back')} My Games</button></header><div id="psStatus" class="ps-status" role="status" aria-live="polite"></div><div id="psBody"></div>`;
  document.querySelector('main')!.append(page);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => page.querySelector<T>('#' + id)!;
  let active: ProblemSolvingDraft | null = null, visible = false, activeOwner = '', revisionRetry = false;
  let speech: SpeechSynthesisUtterance | null = null;
  const status = (text: string, error = false) => { $('psStatus').textContent = text; $('psStatus').classList.toggle('is-error', error); };
  const isCurrent = () => visible && activeOwner === owner();
  const act = (fn: () => void) => { try { fn(); } catch (error) { status((error as Error).message, true); } };
  const stopSpeech = () => { if (speech && 'speechSynthesis' in window) window.speechSynthesis.cancel(); speech = null; };
  function assertCurrent() {
    if (!isCurrent()) throw Error('Open this idea in your own profile.');
    if (FG.learning?.active) { FG.learning.focus?.(); throw Error('Finish your learning activity, or choose My Games to leave.'); }
  }
  function response(phase: PracticePhase) {
    return active?.episode.observations.filter(item => item.responseId?.startsWith(phase + ':')).at(-1)?.responseId?.slice(phase.length + 1);
  }
  function support(): EvidenceSupport {
    if (active?.episode.observations.some(item => item.responseId?.startsWith('hint:'))) return 'strategy';
    return active?.episode.observations.some(item => item.responseId?.startsWith('narration:')) ? 'access-only' : 'none-observed';
  }
  function requireSavedDraft() {
    if (!active) throw Error('Choose an idea first.');
    assertPracticeContinuation(active, store().draft(owner(), active.episode.task.id));
  }
  function save(next: ProblemSolvingDraft, fresh = false) {
    assertCurrent();
    if (!fresh) requireSavedDraft();
    else if (store().draft(owner(), next.episode.task.id)) throw Error('There is already a saved experiment. Open it to continue.');
    store().saveDraft(next); active = next;
  }
  function phaseNow(): PracticePhase | 'result' | 'finished' {
    const step = active?.stepIndex ?? 0;
    if (step === 0) return 'predict'; if (step === 1) return 'test';
    if (step === 2) return 'result'; if (step === 3) return 'interpret';
    if (step === 4 || revisionRetry) return 'revise'; return 'finished';
  }
  function taskNow(): PracticeTask { if (!active) throw Error('Choose an idea first.'); return getPracticeTask(active.episode.task.id); }
  function addSupport(kind: 'hint' | 'narration', phase: PracticePhase) {
    if (!active || active.episode.observations.some(item => item.responseId === kind + ':' + phase)) return;
    const next = clone(active);
    next.episode.observations.push({ id: `${kind}-${phase}`, skill: phase === 'interpret' ? 'interpret_evidence' : phase === 'revise' ? 'revise' : 'plan_test',
      outcome: 'unobserved', authorship: 'unknown', support: kind === 'hint' ? 'strategy' : 'access-only', elicitation: 'prompted',
      observedAt: iso(), responseId: kind + ':' + phase, note: kind === 'hint' ? `A strategy hint was opened during ${phase}.` : `Local read-aloud was requested during ${phase}.` });
    save(next);
  }
  function choose(phase: PracticePhase, id: string) {
    assertCurrent(); if (!active || phaseNow() !== phase) return;
    const task = taskNow(), result = evaluatePracticeChoice(task.id, phase, id, response('test'));
    const next = clone(active), count = next.episode.observations.filter(item => item.responseId?.startsWith(phase + ':')).length;
    next.episode.observations.push({ id: `${phase}-${count + 1}`, skill: result.skill, outcome: result.outcome,
      authorship: 'learner', support: support(), elicitation: 'prompted', observedAt: iso(), responseId: `${phase}:${id}`,
      evidenceRef: `${task.id}:v${task.version}:${phase}:${id}`, note: result.note });
    next.stepIndex = phase === 'predict' ? 1 : phase === 'test' ? 2 : phase === 'interpret' ? 4 : Math.max(5, next.stepIndex + 1);
    save(next); revisionRetry = false; renderActive(true);
  }
  function moveToInterpret() { if (!active || phaseNow() !== 'result') return; const next = clone(active); next.stepIndex = 3; save(next); renderActive(true); }
  function complete() {
    assertCurrent(); if (!active || !response('revise')) return;
    requireSavedDraft();
    const episode: ProblemSolvingEpisode = { ...clone(active.episode), completedAt: iso() };
    store().record(episode); active = null;
    window.dispatchEvent(new CustomEvent('factory-problem-solving-updated', { detail: { owner: activeOwner } }));
    renderShelf(); status('Your experiment is saved. Another idea is here whenever you want.');
  }
  function start(task: PracticeTask) {
    assertCurrent(); stopSpeech();
    const previous = store().draft(owner(), task.id);
    if (previous) { validatePracticeDraft(previous); active = previous; revisionRetry = false; renderActive(true); return; }
    const seen = store().list(owner()).some(episode => episode.source === 'practice' && episode.task.id === task.id);
    const priorHistoryMissing = store().retention(owner()).discarded > 0;
    const episode: ProblemSolvingEpisode = {
      schema: PROBLEM_SOLVING_EPISODE_SCHEMA, id: uid(), owner: owner(), sessionId: uid(), source: 'practice', kind: 'structured-practice',
      task: { id: task.id, family: task.family, version: task.version, label: task.title, demand: task.band, variant: task.band, exposure: seen ? 'repeat' : priorHistoryMissing ? 'unknown' : 'first-seen', firstAttempt: !seen && !priorHistoryMissing },
      startedAt: iso(), observations: [],
      context: 'Authored local practice. Prediction and observed choices stay separate. No unobserved external help can be ruled out.',
    };
    save({ episode, stepIndex: 0 }, true); revisionRetry = false; renderActive(true);
  }
  function renderShelf() {
    stopSpeech(); active = null; revisionRetry = false; page.dataset.phase = 'shelf'; status('');
    $('psHeading').textContent = 'Try an idea.'; $('psSubtitle').textContent = 'Wonder a little. Try something. See what changes.';
    const body = $('psBody'); body.replaceChildren();
    const intro = node('div', 'ps-shelf-intro');
    intro.append(image('./jems-art/character_spark_wave.webp', 'ps-companion'), node('p', '', 'A small adventure for your next big idea. Pick one to begin.'));
    body.append(intro);
    const cards = node('div', 'ps-cards');
    for (const task of practiceTasksForGrade(Number(FG.store.current().grade) || 1)) {
      const draft = store().draft(owner(), task.id), card = button('', 'ps-card'); card.dataset.psTask = task.id;
      card.append(image(task.thumbnail, 'ps-card-art'));
      const copy = node('span', 'ps-card-copy'), action = node('b', '', draft ? 'Continue my idea ' : 'Let’s try '); action.append(createIcon('arrow'));
      copy.append(node('strong', '', task.title), node('span', '', task.invitation), action);
      card.append(copy); card.onclick = () => act(() => start(task)); cards.append(card);
    }
    body.append(cards, node('p', 'ps-saved-note', 'Your experiments save on this device. Leave whenever you like and come back to your idea.'));
    $('psHeading').focus({ preventScroll: true });
  }
  function makeChoice(choice: PracticeChoice, phase: PracticePhase) {
    const b = button('', 'ps-choice'); b.dataset.psChoice = choice.id;
    const icon = node('span', 'ps-choice-icon', choice.icon || ''); if (!choice.icon) icon.append(createIcon('arrow')); icon.setAttribute('aria-hidden', 'true');
    const copy = node('span', 'ps-choice-copy'); copy.append(node('strong', '', choice.label));
    if (choice.detail) copy.append(node('small', '', choice.detail));
    const arrow = node('span', 'ps-choice-arrow'); arrow.append(createIcon('arrow'));
    b.append(icon, copy, arrow); b.onclick = () => act(() => choose(phase, choice.id)); return b;
  }
  function renderScene(scene: PracticeScene, trial?: PracticeTrial) {
    const stage = node('figure', 'ps-stage ps-stage-' + scene.kind); stage.setAttribute('role', 'img');
    const task = taskNow();
    stage.setAttribute('aria-label', trial ? trial.description : task.setup);
    if (scene.kind === 'robot') {
      const top = node('div', 'ps-stage-caption'); top.append(node('span', 'ps-world-label', 'ROBOT TRAIL'), node('span', 'ps-goal-tag', '◆ Gem at ' + scene.target)); stage.append(top);
      const landscape = node('div', 'ps-robot-world');
      const length = Math.max(scene.target, task.initial.kind === 'robot' ? task.initial.steps * task.initial.stride : 0, scene.steps * scene.stride) + 1;
      const track = node('div', 'ps-track'); track.style.setProperty('--ps-spaces', String(length));
      for (let i = 0; i < length; i++) { const spot = node('div', 'ps-track-spot', String(i)); if (i === scene.target) { spot.classList.add('is-goal'); spot.append(node('span', 'ps-track-gem', '◆')); } track.append(spot); }
      const rover = node('span', 'ps-rover');
      // Reuse the robot from jems-world-robot.svg directly: every trial renders
      // synchronously, without an offscreen image crop or another decode.
      rover.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="125 0 240 230" aria-hidden="true" focusable="false"><g transform="translate(157 25)"><rect x="0" y="35" width="177" height="148" rx="39" fill="#2D7BFF"/><rect x="18" y="53" width="141" height="113" rx="27" fill="#FFF7EE"/><circle cx="62" cy="100" r="14" fill="#0B1D4D"/><circle cx="119" cy="100" r="14" fill="#0B1D4D"/><path d="M65 129q27 25 55 0" stroke="#34D7B3" stroke-width="10" stroke-linecap="round" fill="none"/><rect x="80" y="0" width="16" height="39" rx="7" fill="#0B1D4D"/><circle cx="89" cy="1" r="16" fill="#FFC828"/><rect x="-23" y="86" width="28" height="54" rx="11" fill="#8A4DFF"/><rect x="172" y="86" width="28" height="54" rx="11" fill="#8A4DFF"/></g></svg>`;
      const end = trial ? scene.steps * scene.stride : 0;
      rover.style.left = `${(end + .5) / length * 100}%`;
      landscape.append(track, rover); stage.append(landscape);
      stage.append(node('figcaption', 'ps-scene-caption', trial ? trial.description : task.setup));
      if (trial && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        rover.animate([{ left: `${.5 / length * 100}%` }, { left: `${(end + .5) / length * 100}%` }], { duration: scene.slow ? 1500 : 650, easing: 'ease-in-out' });
      }
    } else if (scene.kind === 'delivery') {
      const top = node('div', 'ps-stage-caption'); top.append(node('span', 'ps-world-label', 'GEM DELIVERY'), node('span', 'ps-goal-tag', '◆ ◆ Stay together')); stage.append(top);
      const map = node('div', 'ps-delivery-map');
      const bridge = node('div', 'ps-bridge' + (scene.route === 'bridge' && trial ? ' is-selected' : '')); bridge.append(node('span', '', 'Bridge · room for 3'));
      const tunnel = node('div', 'ps-tunnel' + (scene.route === 'tunnel' && trial ? ' is-selected' : '')); tunnel.append(node('span', '', 'Tunnel · room for 1'));
      const parcel = node('div', 'ps-parcel', '◆ '.repeat(scene.parcel).trim());
      parcel.classList.toggle('is-delivered', !!trial && trial.observation !== 'blocked'); parcel.classList.toggle('is-blocked', trial?.observation === 'blocked');
      const destination = node('div', 'ps-destination', 'Gift box'); destination.prepend(node('span', '', '◇'));
      map.append(bridge, tunnel, parcel, destination); stage.append(map, node('figcaption', 'ps-scene-caption', trial ? trial.description : task.setup));
    } else {
      const top = node('div', 'ps-stage-caption'); top.append(node('span', 'ps-world-label', 'READY GATE'), node('span', 'ps-goal-tag', scene.goal === 'exactly-three' ? 'Exactly 3' : '3 or more')); stage.append(top);
      const boxes = node('div', 'ps-gate-boxes');
      scene.counts.forEach((count, i) => {
        const card = node('div', 'ps-gate-case');
        card.append(node('span', 'ps-case-count', String(count) + (count === 1 ? ' gem' : ' gems')));
        const gems = node('div', 'ps-box-gems', count ? '◆ '.repeat(count).trim() : '—'); gems.setAttribute('aria-hidden', 'true'); card.append(gems);
        const opened = trial?.outputs[i] === true;
        card.append(node('span', 'ps-gate-door' + (opened ? ' is-open' : ''), trial ? opened ? '↗ Open' : '▥ Closed' : 'Ready to try'));
        boxes.append(card);
      });
      stage.append(boxes, node('figcaption', 'ps-scene-caption', trial ? trial.description : task.setup));
    }
    return stage;
  }
  function narration(text: string, phase: PracticePhase) {
    assertCurrent();
    if (!('speechSynthesis' in window)) { status('Read aloud is not available on this device.'); return; }
    // Local voices only: this optional control adds no speech service or remote call.
    const voice = window.speechSynthesis.getVoices().find(item => item.localService && /^en([-_]|$)/i.test(item.lang));
    if (!voice) { status('A local English read-aloud voice is not available on this device.'); return; }
    addSupport('narration', phase); stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = .88;
    speech = utterance; window.speechSynthesis.speak(utterance);
  }
  function toolsFor(phase: PracticePhase, copy: string) {
    const tools = node('div', 'ps-support'), hint = button('A little hint', 'ps-text-button', 'help'), hear = button('Hear this', 'ps-text-button', 'volume');
    hint.id = 'psHint'; hear.id = 'psHear';
    const hintText = node('p', 'ps-hint'); hintText.id = 'psHintText'; hintText.hidden = true;
    hint.onclick = () => act(() => { assertCurrent(); addSupport('hint', phase); hintText.hidden = false; hintText.textContent = taskNow().hints[phase]; });
    hear.onclick = () => act(() => narration(copy, phase));
    tools.append(hint, hear); return { tools, hintText };
  }
  function renderActive(focus = false) {
    stopSpeech(); if (!active) return;
    const task = taskNow(), phase = phaseNow(); page.dataset.phase = phase;
    $('psHeading').textContent = task.title; $('psSubtitle').textContent = task.goal; status('');
    const body = $('psBody'); body.replaceChildren();
    const top = node('div', 'ps-work-top'), back = button('My ideas', 'ps-text-button', 'arrow', 'jems-icon--back'); back.id = 'psBack';
    back.onclick = () => act(() => { assertCurrent(); renderShelf(); });
    const path = node('ol', 'ps-progress'); path.setAttribute('aria-label', 'Your experiment');
    const current = phase === 'predict' ? 0 : phase === 'test' || phase === 'result' ? 1 : phase === 'interpret' ? 2 : 3;
    ['Wonder', 'Try', 'Notice', 'Choose'].forEach((title, i) => { const li = node('li', i === current ? 'is-current' : i < current ? 'is-done' : '', title); if (i === current) li.setAttribute('aria-current', 'step'); path.append(li); });
    top.append(back, path); body.append(top);
    const testId = response('test'), revisionId = response('revise');
    const testTrial = testId ? runPracticeTest(task.id, testId) : undefined;
    const revisionTrial = phase === 'finished' && revisionId ? runPracticeRevision(task.id, revisionId) : undefined;
    // First reveal the starting plan after the prediction; then reveal the child's
    // selected experiment. These observed outcomes are intrinsic feedback, not hints.
    const trial = revisionTrial || (phase === 'test' ? runPracticeScene(task.initial) : ['result', 'interpret', 'revise'].includes(phase) ? testTrial : undefined);
    const grid = node('div', 'ps-work-grid'), stage = renderScene(trial?.scene || task.initial, trial);
    const panel = node('section', 'ps-question'); panel.setAttribute('aria-labelledby', 'psQuestion');
    const heading = node('h2'); heading.id = 'psQuestion'; heading.tabIndex = -1;
    if (phase === 'result') {
      heading.textContent = 'Look what happened.'; panel.append(node('span', 'ps-eyebrow', 'YOUR TEST'), heading,
        node('p', 'ps-result-copy', testTrial!.description), node('p', 'ps-quiet-copy', 'A surprise can give you a new idea.'));
      const next = button('I’ve noticed something', 'ps-button ps-primary', 'arrow'); next.id = 'psObserve'; next.onclick = () => act(moveToInterpret); panel.append(next);
    } else if (phase === 'finished') {
      heading.textContent = revisionTrial!.reachedGoal ? 'Your plan worked here.' : 'There’s another idea to try.';
      panel.append(node('span', 'ps-eyebrow', 'YOUR NEXT PLAN'), heading, node('p', 'ps-result-copy', revisionTrial!.description));
      const actions = node('div', 'ps-finish-actions');
      const done = button('Save my experiment', 'ps-button ps-primary', 'save'); done.id = 'psFinish'; done.onclick = () => act(complete); actions.append(done);
      const revisions = active.episode.observations.filter(item => item.responseId?.startsWith('revise:')).length;
      if (revisions < 3) { const again = button('Try a different plan', 'ps-button', 'retry'); again.id = 'psReviseAgain'; again.onclick = () => act(() => { assertCurrent(); revisionRetry = true; renderActive(true); }); actions.append(again); }
      panel.append(actions, node('p', 'ps-quiet-copy', 'You tried an idea and saw what happened. Keep exploring whenever you like.'));
    } else {
      const definition = phase === 'predict' ? task.prediction : phase === 'test' ? task.test : phase === 'interpret' ? task.interpretation : task.revision;
      heading.textContent = definition.prompt;
      panel.append(node('span', 'ps-eyebrow', phase === 'predict' ? 'BEFORE YOU TRY' : phase === 'test' ? 'CHOOSE A TEST' : phase === 'interpret' ? 'USE WHAT YOU SAW' : 'YOUR NEXT IDEA'), heading);
      const choices = node('div', 'ps-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-labelledby', heading.id);
      for (const option of definition.choices) choices.append(makeChoice(option, phase)); panel.append(choices);
      const help = toolsFor(phase, [task.goal, definition.prompt, ...definition.choices.map(choice => choice.label + '. ' + (choice.detail || ''))].join('. '));
      panel.append(help.tools, help.hintText);
    }
    grid.append(stage, panel); body.append(grid, node('p', 'ps-saved-note', 'Your place is saved. You can leave and come back.'));
    if (focus) heading.focus({ preventScroll: true });
  }
  function close() { stopSpeech(); visible = false; revisionRetry = false; page.classList.add('hidden'); }
  function open(id?: string) {
    act(() => {
      if (!host.enter()) return;
      visible = true; activeOwner = owner(); page.classList.remove('hidden');
      if (id) {
        const task = getPracticeTask(id), allowed = practiceTasksForGrade(Number(FG.store.current().grade) || 1).some(item => item.id === task.id);
        if (!allowed) { renderShelf(); return; } start(task);
      } else renderShelf();
    });
  }
  $('psHome').onclick = () => { stopSpeech(); host.home(); };
  page.addEventListener('keydown', event => event.stopPropagation());
  window.addEventListener('factory-page', event => { if ((event as CustomEvent).detail !== 'problem-solving') close(); });
  window.addEventListener('factory-profile-before-change', stopSpeech);
  window.addEventListener('factory-profile', () => {
    const wasVisible = visible; close(); active = null; $('psBody').replaceChildren(); status('');
    if (wasVisible) open();
  });
  function refreshAfterExternalChange(force = false) {
    if (!isCurrent()) return;
    if (!active) { act(renderShelf); return; }
    if (!force) {
      try { requireSavedDraft(); return; } catch { /* A removed/replaced draft must not reappear from memory. */ }
    }
    stopSpeech(); active = null; revisionRetry = false;
    act(() => { renderShelf(); status('Your saved experiments changed. Pick an idea to continue.'); });
  }
  window.addEventListener('storage', event => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === null || event.key === adultStorageKey(PROBLEM_SOLVING_KEY)) refreshAfterExternalChange();
  });
  window.addEventListener('factory-problem-solving-reset', event => {
    const changedOwner = (event as CustomEvent).detail?.owner;
    if (!changedOwner || changedOwner === owner()) refreshAfterExternalChange(true);
  });
  window.addEventListener('factory-learning-active', event => { if ((event as CustomEvent).detail) stopSpeech(); });
  window.addEventListener('pagehide', stopSpeech);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeech(); });
  const api = { open, close, flush: () => { /* Each action is saved before the view advances. */ } };
  FG.problemSolving = Object.assign(FG.problemSolving || {}, api);
  return api;
}
