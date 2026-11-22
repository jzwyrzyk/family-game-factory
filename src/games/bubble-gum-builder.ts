import type {GameContext, GameInstance} from '../runtime/types';
import {OBJECTS, objectArt, objectArtFrame, gumArt, sceneDecor, sceneMoment, launchArt, type ObjectId} from './bubble-gum-art';
import {
  BLUEPRINTS, GUM_BUDGET, TOUR_DURATION_MS, createBuild, getBlueprint, nextSlot,
  isConnected, canPlace, placePart, bondPart, removePart, isReady, gumRemaining,
  partChoices, completeTour, markReported, nextBuild, serializeBuild, readBuild,
  type BuildState,
} from './bubble-gum-rules';
import {evaluateBuild, LAUNCH_DURATION_MS} from './bubble-gum-journey';
import './bubble-gum-builder.css';

type Phase = 'build' | 'test' | 'adventure' | 'showcase' | 'done';
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = '') => {
  const element = document.createElement(tag); element.className = css; element.textContent = text; return element;
};
const svgNS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number> = {}) => {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
};
const ADVENTURE_DURATION_MS = LAUNCH_DURATION_MS + TOUR_DURATION_MS;
const PINK_GUM = '#ef80b0';
const WORLD_ICONS = {
  sky: ['☁', '🌈', '☾', '✦', '🪐', '☄', '✺'],
  sea: ['≈', '🐟', '♧', '○', '♜', '🐋', '✧'],
  road: ['➜', '⌃', '❀', '⚑', '⌒', '⌂', '✦'],
  stage: ['◉', '♪', '♫', '★', '♜', '⚑', '✦'],
} as const;
const DISTANCE_UNITS = {sky: 'gum miles', sea: 'bubble miles', road: 'gum miles', stage: 'cheers'} as const;

/** Authored assembly puzzles. Connections are structural rules, not a force simulation.
 * Saved v2 stickers and v1 physics retain their original engines and storage slots. */
export default class BubbleGumBuilder implements GameInstance {
  private readonly root = node('section', 'gum-builder');
  private state = createBuild();
  private phase: Phase = 'build';
  private selected: ObjectId | null = null;
  private evaluation: ReturnType<typeof evaluateBuild> | null = null;
  private evaluatedState: BuildState | null = null;
  private history: BuildState[] = [];
  private paused = false;
  private selfPaused = false;
  private disposed = false;
  private storageBlocked = false;
  private saveFailed = false;
  private message = '';
  private editing = false;
  private choicePage = 0;
  private elapsed = 0;
  private testElapsed = 0;
  private lastFrame = 0;
  private frame: number | null = null;
  private actionCount = 0;
  private boostUntil = 0;
  private drag: {id: ObjectId; pointer: number; x: number; y: number; moved: boolean; ghost: HTMLElement} | null = null;
  private dropFrame: number | null = null;
  private suppressClick = false;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly observer: ResizeObserver;
  private readonly onHidden = () => { if (document.hidden) this.pauseForAbsence(); };
  private readonly onBlur = () => this.pauseForAbsence();
  private readonly onOutside = (event: Event) => {
    if ((this.phase === 'adventure' || this.phase === 'test') && event.target instanceof Node &&
      event.target !== document.body && event.target !== document.documentElement && !this.root.contains(event.target)) this.pauseForAbsence();
  };

  constructor(private readonly mount: HTMLElement, private context: GameContext) {
    this.root.setAttribute('aria-label', 'Bubble Gum Builders');
    this.root.dataset.qualityGame = 'gum-assembly';
    this.root.dataset.reducedMotion = String(this.reduced);
    const raw = context.persistence?.load();
    if (raw !== undefined && raw !== null) {
      try { this.state = readBuild(raw); this.phase = this.state.tourCompleted ? 'showcase' : 'build'; }
      catch { this.storageBlocked = true; }
    }
    this.observer = new ResizeObserver(() => this.fitCanvas());
    mount.replaceChildren(this.root);
    this.render();
    document.addEventListener('visibilitychange', this.onHidden);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('focusin', this.onOutside);
    document.addEventListener('pointerdown', this.onOutside, true);
  }

  private button(label: string, css: string, action: () => void) {
    const button = node('button', css, label); button.type = 'button';
    button.onclick = () => { if (!this.paused && !this.disposed) action(); };
    return button;
  }
  private get blueprint() { return getBlueprint(this.state); }
  private get journey() {
    if (this.evaluatedState !== this.state || !this.evaluation) {
      this.evaluatedState = this.state; this.evaluation = evaluateBuild(this.state);
    }
    return this.evaluation;
  }
  private get journeyElapsed() {
    return this.phase === 'adventure' ? Math.max(0, this.elapsed - LAUNCH_DURATION_MS)
      : this.phase === 'showcase' || this.phase === 'done' ? TOUR_DURATION_MS : 0;
  }
  private get journeyStop() {
    if (this.phase === 'adventure' && this.elapsed < LAUNCH_DURATION_MS) return -1;
    if (!['adventure', 'showcase', 'done'].includes(this.phase)) return -1;
    return Math.min(this.journey.stops.length - 1, Math.floor(this.journeyElapsed / TOUR_DURATION_MS * this.journey.stops.length));
  }
  private get launchPhase() {
    return this.phase !== 'adventure' ? 'idle' : this.elapsed < 3000 ? 'countdown' : this.elapsed < LAUNCH_DURATION_MS ? 'ignition' : 'travel';
  }
  private get step() { return nextSlot(this.state); }
  private get choices() {
    const step = this.step;
    return step && !this.state.placed[step.id] ? partChoices(this.state, step.id,
      Number(this.context.config.extraDecoys || 0) + (this.context.difficulty === 'gentle' ? 0 : 1)) : [];
  }
  private get editable() { return !this.paused && !this.disposed && !this.storageBlocked && !this.state.reported && this.dropFrame === null && this.phase === 'build'; }
  private persist() {
    if (this.storageBlocked) return;
    try { this.saveFailed = !!this.context.persistence && !this.context.persistence.save(serializeBuild(this.state)); }
    catch { this.saveFailed = true; }
  }
  private change(state: BuildState, message = '') {
    if (state === this.state) return false;
    this.history.push(this.state); if (this.history.length > 40) this.history.shift();
    this.state = state; this.message = message; this.selected = null; this.choicePage = 0; this.persist();
    return true;
  }
  private select(id: ObjectId) {
    if (!this.editable || !this.choices.includes(id)) return;
    this.selected = id; this.message = 'Tap the glowing + to add it.';
    this.render('[data-gum-slot]');
  }
  private place(id: string, part = this.selected) {
    if (!this.editable || !part) return;
    if (!canPlace(this.state, id, part)) {
      this.message = 'Try another piece for this job.'; this.selected = null; this.render('[data-gum-part]:not([hidden])'); return;
    }
    if (!this.change(placePart(this.state, id, part))) return;
    this.context.emit?.({type: 'mechanic', name: 'bubblegum-part', value: Object.keys(this.state.placed).length});
    this.render(this.step && this.state.placed[this.step.id] ? '[data-gum-joint]' : '[data-gum-part]:not([hidden])');
  }
  private bond(id: string) {
    if (!this.editable || !this.change(bondPart(this.state, id, 'pink'), 'Squish! That join holds.')) return;
    this.context.emit?.({type: 'mechanic', name: 'bubblegum-joint', value: Object.keys(this.state.bonds).length});
    this.render(isReady(this.state) ? '.gum-build-launch' : '[data-gum-part]:not([hidden])');
  }
  private undo() {
    if (!this.editable || !this.history.length) return;
    this.state = this.history.pop()!; this.selected = null; this.message = 'One step back. Your gum is back too.';
    this.persist(); this.render(this.step && this.state.placed[this.step.id] ? '[data-gum-joint]' : '[data-gum-part]:not([hidden])');
  }
  private tinker() {
    if (this.paused || this.disposed || this.storageBlocked || this.state.reported) return;
    this.stopClock(); this.phase = 'build'; this.editing = true; this.elapsed = 0;
    this.message = 'Tap a piece to change it.'; this.render('[data-change-part]');
  }
  private remove(id: string) {
    if (!this.editable || !this.editing) return;
    if (this.change(removePart(this.state, id), 'Try a new piece. Your gum is back.')) {
      this.editing = false; this.render('[data-gum-part]:not([hidden])');
    }
  }
  private wiggle() {
    if (!this.editable || !Object.keys(this.state.placed).length) return;
    this.phase = 'test'; this.testElapsed = 0; this.selected = null;
    this.message = isReady(this.state) ? 'All together. It holds!' : this.step && this.state.placed[this.step.id]
      ? 'That piece is loose. Add gum at the join.' : 'Keep adding pieces to your invention.';
    this.render(); this.startClock();
  }
  private launch() {
    if (this.paused || this.disposed || this.storageBlocked || !isReady(this.state) || !['build', 'showcase'].includes(this.phase)) return;
    this.phase = 'adventure'; this.elapsed = 0; this.actionCount = 0; this.boostUntil = 0; this.selected = null; this.editing = false;
    this.message = ''; this.render('.gum-build-action'); this.startClock();
    this.context.emit?.({type: 'mechanic', name: 'bubblegum-launch', value: 1});
  }
  private action() {
    if (this.phase !== 'adventure' || this.paused || this.disposed) return;
    this.actionCount++; this.boostUntil = this.elapsed + 1000;
    const effects = this.root.querySelector<HTMLElement>('.gum-build-effects');
    if (effects) { effects.dataset.burst = String(this.actionCount % 2); effects.textContent = this.blueprint.world === 'sea' ? '○  ◯  ○  ◯' : '✦  ✧  ✦  ✧'; }
  }
  private finish() {
    if (this.paused || this.disposed || this.phase !== 'showcase' || !this.state.tourCompleted) return;
    if (this.state.reported) { this.next(); return; }
    const before = this.state;
    this.state = markReported(this.state); this.persist();
    if (this.saveFailed) { this.state = before; this.render('.gum-build-next'); return; }
    this.phase = 'done'; this.history = []; this.render();
    // One host-owned round result, only after the child chooses to move on.
    // Replays and the wiggle test are never learning checkpoints or extra rewards.
    this.context.finish({won: true, level: this.state.completed + 1, title: this.blueprint.title,
      description: `You built ${this.blueprint.title} from ${this.blueprint.slots.length} objects and joined them with gum. ${this.journey.outcome}`});
  }
  private startClock() { this.stopClock(); this.lastFrame = performance.now(); this.frame = requestAnimationFrame(now => this.tick(now)); }
  private stopClock() { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null; }
  private tick(now: number) {
    this.frame = null;
    if (this.disposed || this.paused || !['test', 'adventure'].includes(this.phase)) return;
    // Background time never consumes the adventure; unusually stalled frames
    // cannot jump over its payoff either.
    const dt = Math.max(0, Math.min(now - this.lastFrame, 250)); this.lastFrame = now;
    if (this.phase === 'test') {
      this.testElapsed += dt;
      if (this.testElapsed >= 1200) { this.phase = 'build'; this.render(isReady(this.state) ? '.gum-build-launch' : this.step && this.state.placed[this.step.id] ? '[data-gum-joint]' : '[data-gum-part]:not([hidden])'); return; }
    } else {
      this.elapsed = Math.min(ADVENTURE_DURATION_MS, this.elapsed + dt); this.paintAdventure();
      if (this.elapsed >= ADVENTURE_DURATION_MS) {
        this.state = completeTour(this.state); this.persist(); this.phase = 'showcase';
        this.message = 'You made it! Play again or build another.'; this.render('.gum-build-next'); return;
      }
    }
    this.frame = requestAnimationFrame(time => this.tick(time));
  }
  private paintAdventure() {
    const motion = this.root.querySelector<HTMLElement>('.gum-build-motion');
    if (!motion) return;
    const journey = this.journey, world = this.blueprint.world, launch = this.launchPhase;
    const t = this.journeyElapsed / 1000, boost = this.boostUntil > this.elapsed;
    const ignition = Math.max(0, Math.min(1, (this.elapsed - 3000) / (LAUNCH_DURATION_MS - 3000)));
    const lift = 1 - Math.pow(1 - ignition, 3);
    let x = 0, y = world === 'sky' ? -4 : 0, angle = 0, scale = world === 'sky' ? .84 : .9;
    if (!this.reduced) {
      if (launch === 'countdown') {
        const anticipation = this.elapsed / 3000;
        x = Math.sin(this.elapsed / 90) * .22 * anticipation;
        y = 3; angle = Math.sin(this.elapsed / 160) * .5 * anticipation; scale = .92;
      } else if (launch === 'ignition') {
        x = Math.sin(this.elapsed / 65) * .5 * (1 - ignition);
        y = world === 'sky' ? 3 - lift * 12 : Math.sin(lift * Math.PI) * -5;
        angle = world === 'road' ? -5 * Math.sin(lift * Math.PI) : Math.sin(this.elapsed / 90) * (1 - ignition);
        scale = .92 - lift * (world === 'sky' ? .08 : .02);
      } else {
        const drift = t * journey.speed;
        x = Math.sin(drift * .48) * (world === 'stage' ? 2 : 4);
        y += Math.sin(drift * (world === 'road' ? 2 : .8)) * (world === 'sea' ? 3 : 2);
        angle = Math.sin(drift * (world === 'stage' ? 2.2 : 1.4)) * journey.wobble * (world === 'stage' ? 7 : 8);
        if (world === 'sky') y -= Math.max(0, 1 - t / 2) * 5;
        if (boost) { y -= Math.sin((this.boostUntil - this.elapsed) / 1000 * Math.PI) * 4; angle += world === 'stage' ? 7 : -2; }
      }
    }
    motion.style.transform = `translate(${x}%,${y}%) rotate(${angle}deg) scale(${scale})`;
    this.root.dataset.launch = launch;
    this.root.style.setProperty('--gum-launch-power', String(launch === 'travel' ? .65 : ignition));
    this.root.style.setProperty('--gum-flight-speed', String(journey.speed));
    this.root.classList.toggle('boosting', boost);
    this.root.style.setProperty('--gum-journey', String(this.elapsed / ADVENTURE_DURATION_MS));
    const progress = this.root.querySelector<HTMLElement>('.gum-build-progress');
    progress?.setAttribute('aria-valuenow', String(Math.floor(this.elapsed / ADVENTURE_DURATION_MS * 100)));
    const countdown = this.root.querySelector<HTMLElement>('.gum-build-countdown');
    if (countdown) {
      countdown.hidden = launch === 'travel';
      const text = launch === 'countdown' ? String(3 - Math.floor(this.elapsed / 1000)) : this.blueprint.verb;
      if (countdown.textContent !== text) countdown.textContent = text;
    }
    const stop = this.journeyStop;
    if (this.root.dataset.stop !== String(stop)) {
      this.root.dataset.stop = String(stop);
      const sceneIndex = stop < 0 ? 0 : journey.stops[stop].sceneIndex;
      this.root.dataset.milestone = String(sceneIndex);
      const moment = this.root.querySelector<HTMLElement>('.gum-build-moment');
      if (moment) moment.innerHTML = sceneMoment(world, sceneIndex);
      for (const [index, item] of this.root.querySelectorAll<HTMLElement>('.gum-build-route li').entries()) {
        item.dataset.reached = String(index <= stop);
        if (index === stop) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      }
    }
    const caption = this.root.querySelector('.gum-build-destination');
    if (caption) caption.textContent = stop < 0 ? launch === 'countdown' ? 'Gum holding. Here we go…' : 'Hold on to your gum!' : journey.stops[stop].caption;
    const rideNote = this.root.querySelector('.gum-build-ride-note');
    if (rideNote) rideNote.textContent = stop < 0 ? 'Your invention is getting ready!' : journey.title;
    const distance = Math.round(journey.goalDistance * this.journeyElapsed / TOUR_DURATION_MS);
    const readout = this.root.querySelector('.gum-build-distance');
    if (readout) readout.textContent = `${distance} ${DISTANCE_UNITS[world]}`;
    this.root.style.setProperty('--gum-distance', String(distance / 100));
    this.root.querySelector('.gum-build-reach')?.setAttribute('aria-valuenow', String(distance));
  }

  private beginDrag(button: HTMLButtonElement, id: ObjectId, event: PointerEvent) {
    if (!this.editable || event.button !== 0 || this.drag) return;
    const ghost = node('div', 'gum-build-ghost'); ghost.innerHTML = objectArt(id);
    ghost.style.left = event.clientX + 'px'; ghost.style.top = event.clientY + 'px'; document.body.append(ghost);
    this.drag = {id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ghost};
    button.setPointerCapture(event.pointerId);
  }
  private moveDrag(event: PointerEvent) {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.moved = true;
    drag.ghost.style.left = event.clientX + 'px'; drag.ghost.style.top = event.clientY + 'px';
  }
  private endDrag(event: PointerEvent, cancelled = false) {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    this.drag = null; drag.ghost.remove();
    if (cancelled) { this.suppressClick = true; return; }
    if (drag.moved) {
      this.suppressClick = true;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-gum-slot]');
      const slotId = target && this.root.contains(target) ? target.dataset.gumSlot : undefined;
      const before = this.state;
      const commit = () => {
        if (this.state !== before) return;
        if (slotId) this.place(slotId, drag.id); else this.select(drag.id);
      };
      if (event.pointerType === 'touch') {
        // Keep the captured source alive through touchend. Replacing it inside
        // pointerup can swallow the compatibility click of the next real tap.
        this.dropFrame = requestAnimationFrame(() => { this.dropFrame = null; commit(); });
      } else commit();
    }
  }
  private cancelDrop() {
    if (this.dropFrame !== null) cancelAnimationFrame(this.dropFrame);
    this.dropFrame = null;
  }
  private cancelDrag() { this.cancelDrop(); this.drag?.ghost.remove(); this.drag = null; this.suppressClick = false; }

  private render(focus?: string) {
    if (this.disposed) return;
    this.cancelDrop();
    this.drag?.ghost.remove(); this.drag = null; this.observer.disconnect(); this.root.replaceChildren();
    this.root.dataset.phase = this.phase; this.root.dataset.world = this.blueprint.world;
    this.root.dataset.stop = this.phase === 'adventure' ? '-2' : String(this.journeyStop);
    this.root.dataset.launch = this.launchPhase;
    this.root.dataset.journeyTier = String(this.journey.tier);
    this.root.dataset.milestone = String(this.journeyStop >= 0 ? this.journey.stops[this.journeyStop].sceneIndex : 0);
    this.root.dataset.blueprint = this.blueprint.id; this.root.classList.toggle('paused', this.paused);
    const heading = node('header', 'gum-build-heading');
    heading.append(node('h2', '', this.blueprint.title), node('span', 'gum-build-number', `Build ${this.state.completed + 1}`));
    const main = node('div', 'gum-build-main');
    main.append(this.renderScene(), this.renderTray());
    this.root.append(heading, main, this.renderFooter());
    if (this.storageBlocked || this.saveFailed) {
      const warning = node('div', 'gum-build-warning'); warning.setAttribute('role', 'alert');
      warning.append(node('p', '', this.storageBlocked ? 'This save needs a newer game. It is safe.' : 'Your build could not save. Keep this page open.'));
      if (this.saveFailed) warning.append(this.button('Try saving', '', () => { this.persist(); this.render(); }));
      if (this.storageBlocked) warning.append(this.button('Play without saving', '', () => { this.storageBlocked = false; this.context = {...this.context, persistence: undefined}; this.state = createBuild(); this.render(); }));
      this.root.append(warning);
    }
    const scene = this.root.querySelector('.gum-build-scene'); if (scene) this.observer.observe(scene);
    this.fitCanvas();
    if (this.phase === 'adventure') this.paintAdventure();
    if (this.paused) this.showPause();
    if (focus) this.root.querySelector<HTMLElement>(focus)?.focus({preventScroll: true});
  }
  private renderScene() {
    const scene = node('div', 'gum-build-scene'); scene.setAttribute('aria-label', `${this.blueprint.title} workbench`);
    const decor = node('div', 'gum-build-decor'); decor.setAttribute('aria-hidden', 'true'); decor.innerHTML = sceneDecor(this.blueprint.world); scene.append(decor);
    if (this.phase === 'adventure' || this.phase === 'showcase') {
      const moment = node('div', 'gum-build-moment'); moment.setAttribute('aria-hidden', 'true');
      moment.innerHTML = sceneMoment(this.blueprint.world, this.journeyStop < 0 ? 0 : this.journey.stops[this.journeyStop].sceneIndex); scene.append(moment);
    }
    const canvas = node('div', 'gum-build-canvas');
    const motion = node('div', 'gum-build-motion');
    if (this.phase === 'adventure') {
      const launch = node('div', 'gum-build-launch-effects'); launch.setAttribute('aria-hidden', 'true');
      launch.innerHTML = launchArt(this.blueprint.world, this.blueprint.id); motion.append(launch);
    }
    const machine = svg('svg', {class: 'gum-build-machine', viewBox: '0 0 800 480', 'aria-hidden': 'true', focusable: 'false'});
    for (const slot of this.blueprint.slots) {
      const part = this.state.placed[slot.id];
      // A neutral placement target guides the position without implying that
      // one of the valid household objects is the intended answer.
      if (!part) continue;
      const group = svg('g', {transform: `translate(${slot.x * 8} ${slot.y * 4.8}) rotate(${slot.rotation || 0})`,
        class: `gum-built-object${isConnected(this.state, slot.id) ? ' connected' : ' loose'}`});
      group.setAttribute('data-built-part', slot.id); group.setAttribute('data-object', part);
      // All markup is a closed, locally authored object catalog. Saves only hold
      // validated object IDs; no child strings or URLs enter innerHTML.
      const art = svg('g'); art.innerHTML = objectArtFrame(part, slot.w * 8, slot.h * 4.8);
      const nested = art.firstElementChild!; nested.setAttribute('x', String(-slot.w * 4)); nested.setAttribute('y', String(-slot.h * 2.4));
      nested.setAttribute('width', String(slot.w * 8)); nested.setAttribute('height', String(slot.h * 4.8));
      group.append(art); machine.append(group);
    }
    for (const slot of this.blueprint.slots) {
      if (!this.state.bonds[slot.id] || !slot.joint) continue;
      const {x1, y1, x2, y2} = slot.joint, color = PINK_GUM;
      const path = `M${x1 * 8} ${y1 * 4.8} Q${(x1 + x2) * 4 + 5} ${(y1 + y2) * 2.4 - 5} ${x2 * 8} ${y2 * 4.8}`;
      machine.append(svg('path', {d: path, stroke: '#98507f', 'stroke-width': 19, 'stroke-linecap': 'round', fill: 'none'}));
      machine.append(svg('path', {d: path, stroke: color, 'stroke-width': 14, 'stroke-linecap': 'round', fill: 'none', 'data-gum-bond': slot.id}));
      for (const [x, y] of [[x1, y1], [x2, y2]]) machine.append(svg('ellipse', {cx: x * 8, cy: y * 4.8, rx: 12, ry: 9, fill: color, stroke: '#98507f', 'stroke-width': 2}));
      machine.append(svg('path', {d: path, stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .55, fill: 'none'}));
    }
    motion.append(machine); canvas.append(motion);
    if (this.phase === 'build' && !this.storageBlocked) {
      const step = this.step;
      if (step && !this.editing) {
        const joining = !!this.state.placed[step.id];
        const target = this.button(joining ? '' : '+', joining ? 'gum-build-joint' : 'gum-build-slot', () => joining ? this.bond(step.id) : this.place(step.id));
        if (joining && step.joint) {
          target.dataset.gumJoint = step.id; target.setAttribute('aria-label', `Stick ${step.name} with gum`);
          target.innerHTML = gumArt('pink'); this.position(target, (step.joint.x1 + step.joint.x2) / 2, (step.joint.y1 + step.joint.y2) / 2);
        } else {
          target.dataset.gumSlot = step.id; target.setAttribute('aria-label', `Place ${step.name}`); this.position(target, step.x, step.y);
          if (this.selected) target.classList.add('selected');
        }
        canvas.append(target);
      }
      if (this.editing) for (const slot of this.blueprint.slots) if (this.state.placed[slot.id]) {
        const remove = this.button('↻', 'gum-build-change-part', () => this.remove(slot.id));
        remove.dataset.changePart = slot.id; remove.setAttribute('aria-label', `Change ${slot.name}`); this.position(remove, slot.x, slot.y); canvas.append(remove);
      }
    }
    scene.append(canvas);
    const caption = node('div', 'gum-build-scene-caption');
    if (this.phase === 'adventure') caption.append(node('span', 'gum-build-destination', 'Gum holding. Here we go…'));
    else if (this.phase === 'showcase' || this.phase === 'done') caption.append(node('span', '', this.journey.stops[this.journey.stops.length - 1].caption));
    else caption.append(node('span', '', this.message || (this.editing ? 'Which piece will you change?' : 'Your invention takes shape')));
    scene.append(caption);
    if (this.phase === 'adventure') {
      const countdown = node('div', 'gum-build-countdown', '3'); countdown.setAttribute('role', 'status');
      countdown.setAttribute('aria-live', 'polite'); scene.append(countdown);
    }
    const effects = node('div', 'gum-build-effects'); effects.setAttribute('aria-hidden', 'true'); scene.append(effects);
    if (this.phase === 'adventure') {
      const progress = node('div', 'gum-build-progress'); progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', 'Adventure');
      progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100'); progress.setAttribute('aria-valuenow', '0'); progress.append(node('i')); scene.append(progress);
    }
    return scene;
  }
  private position(element: HTMLElement, x: number, y: number) { element.style.left = x + '%'; element.style.top = y + '%'; }
  private fitCanvas() {
    const scene = this.root.querySelector<HTMLElement>('.gum-build-scene'), canvas = this.root.querySelector<HTMLElement>('.gum-build-canvas');
    if (!scene || !canvas) return;
    const width = Math.min(scene.clientWidth, Math.max(0, scene.clientHeight - 35) * 800 / 480);
    canvas.style.width = width + 'px'; canvas.style.height = width * 480 / 800 + 'px';
  }
  private renderTray() {
    const tray = node('aside', 'gum-build-tray');
    const step = this.step, count = Object.keys(this.state.placed).length;
    const instruction = this.phase === 'adventure' ? 'Look what you made!' : this.phase === 'showcase' || this.phase === 'done'
      ? 'Your invention. Your adventure.' : this.editing ? 'Make it your way' : this.phase === 'test' ? 'Give it a wiggle'
        : !step ? 'Ready for an adventure' : this.state.placed[step.id] ? 'Stick the join with gum' : `Choose ${step.name.toLowerCase()}`;
    tray.append(node('h3', 'gum-build-instruction', instruction));
    if (this.phase === 'adventure') {
      const route = node('ol', 'gum-build-route'); route.setAttribute('aria-label', 'Your adventure stops');
      for (const stop of this.journey.stops) {
        const item = node('li'); item.dataset.reached = 'false';
        const icon = node('span', 'gum-build-route-icon', WORLD_ICONS[this.blueprint.world][stop.sceneIndex]); icon.setAttribute('aria-hidden', 'true');
        item.append(icon, node('span', 'gum-build-route-label', stop.caption)); route.append(item);
      }
      tray.append(route);
      tray.append(node('p', 'gum-build-distance', `0 ${DISTANCE_UNITS[this.blueprint.world]}`));
      const reach = node('div', 'gum-build-reach'); reach.setAttribute('role', 'progressbar'); reach.setAttribute('aria-label', 'Journey reach');
      reach.setAttribute('aria-valuemin', '0'); reach.setAttribute('aria-valuemax', '100'); reach.setAttribute('aria-valuenow', '0');
      reach.append(node('i')); tray.append(reach);
      tray.append(this.button(this.blueprint.action, 'gum-build-action', () => this.action()));
      tray.append(node('p', 'gum-build-hint', 'Tap to join the fun.'));
      if (!this.state.reported) tray.append(this.button('Back to build', 'gum-build-secondary', () => this.tinker()));
      else tray.append(this.button('Back to my invention', 'gum-build-secondary', () => { this.stopClock(); this.phase = 'showcase'; this.render('.gum-build-next'); }));
    } else if (this.phase === 'showcase' || this.phase === 'done') {
      const result = node('div', 'gum-build-result');
      result.append(node('h4', '', this.journey.title), node('p', 'gum-build-distance', `${this.journey.goalDistance} ${DISTANCE_UNITS[this.blueprint.world]}`),
        node('p', 'gum-build-result-reason', this.journey.reason));
      if (!this.state.reported) result.append(node('p', 'gum-build-suggestion', this.journey.suggestion));
      tray.append(result);
      tray.append(this.button('Watch again', 'gum-build-replay', () => this.launch()));
      if (!this.state.reported) tray.append(this.button('Change pieces', 'gum-build-tinker gum-build-secondary', () => this.tinker()));
    } else if (step && !this.state.placed[step.id] && !this.editing) {
      const choices = node('div', 'gum-build-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', `Pieces for ${step.name}`);
      const options = this.choices;
      if (options.length > 3) {
        const more = this.button('More pieces', 'gum-build-more-pieces', () => {
          this.choicePage = (this.choicePage + 1) % Math.ceil(options.length / 3); this.render('.gum-build-more-pieces');
        });
        more.setAttribute('aria-label', 'More pieces'); tray.append(more);
      }
      for (const [index, id] of options.entries()) {
        const choice = this.button('', 'gum-build-piece', () => this.select(id));
        choice.onclick = event => { if (this.suppressClick && event.detail !== 0) { this.suppressClick = false; return; } this.select(id); };
        choice.dataset.gumPart = id; choice.setAttribute('aria-label', `Choose ${OBJECTS[id].name}`); choice.setAttribute('aria-pressed', String(this.selected === id));
        choice.hidden = Math.floor(index / 3) !== this.choicePage;
        if (this.context.config.highlightMatches && step.accepts.includes(id)) choice.classList.add('matching');
        const art = node('span', 'gum-build-piece-art'); art.innerHTML = objectArt(id); art.setAttribute('aria-hidden', 'true');
        choice.append(art, node('span', 'gum-build-piece-name', OBJECTS[id].name));
        choice.onpointerdown = event => { this.suppressClick = false; this.beginDrag(choice, id, event); };
        choice.onpointermove = event => this.moveDrag(event); choice.onpointerup = event => this.endDrag(event);
        choice.onpointercancel = event => this.endDrag(event, true); choice.onlostpointercapture = event => this.endDrag(event, true);
        choice.disabled = this.phase === 'test' || this.storageBlocked; choices.append(choice);
      }
      tray.append(choices);
    } else if (step && this.state.placed[step.id] && !this.editing) {
      const cue = node('div', 'gum-build-pink-cue');
      const gum = node('span', 'gum-build-pink-art'); gum.innerHTML = gumArt('pink'); gum.setAttribute('aria-hidden', 'true');
      cue.append(gum, node('p', 'gum-build-hint', 'Tap the pink gum at the join.')); tray.append(cue);
    } else {
      const preview = node('div', 'gum-build-ready-art'); preview.innerHTML = gumArt('pink'); preview.setAttribute('aria-hidden', 'true'); tray.append(preview);
      tray.append(node('p', 'gum-build-hint', this.editing ? 'The other pieces stay safe.' : 'The gum holds it all together.'));
      if (this.editing) tray.append(this.button('Keep my pieces', 'gum-build-secondary', () => { this.editing = false; this.render(); }));
      else if (!this.state.reported) tray.append(this.button('Change pieces', 'gum-build-tinker gum-build-secondary', () => this.tinker()));
    }
    const status = node('div', 'gum-build-status');
    status.append(node('span', 'gum-build-piece-count', `${count} / ${this.blueprint.slots.length} pieces`), node('span', 'gum-build-gum-count', `Gum: ${gumRemaining(this.state)}`));
    tray.append(status);
    const live = node('p', 'gum-build-live', this.message); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); tray.append(live);
    return tray;
  }
  private renderFooter() {
    const footer = node('footer', 'gum-build-footer');
    if (this.phase === 'build' || this.phase === 'test') {
      const undo = this.button('Undo', 'gum-build-undo gum-build-secondary', () => this.undo()); undo.disabled = !this.history.length || !this.editable;
      const test = this.button('Wiggle test', 'gum-build-test gum-build-secondary', () => this.wiggle()); test.disabled = !Object.keys(this.state.placed).length || !this.editable;
      const launch = this.button(isReady(this.state) ? this.blueprint.verb : 'Keep building', 'gum-build-launch', () => this.launch());
      launch.disabled = !isReady(this.state) || !this.editable; footer.append(undo, test, launch);
    } else if (this.phase === 'showcase') {
      const next = this.button('Next build', 'gum-build-next', () => this.finish()); footer.append(next);
    } else if (this.phase === 'done') footer.append(node('span', '', 'Your next build is ready.'));
    else footer.append(node('span', 'gum-build-ride-note', 'Every piece is coming along!'));
    return footer;
  }

  private pauseForAbsence() {
    if (!this.pause()) return;
    this.selfPaused = true; this.context.emit?.({type: 'pause', name: 'bubblegum-away'});
  }
  private showPause() {
    this.root.querySelector('.gum-build-pause')?.remove();
    const cover = node('div', 'gum-build-pause'); cover.append(node('h3', '', 'Your build is waiting'));
    // Host pauses make the mount inert; their common Keep playing control owns
    // resumption. This button only handles the game's own hidden-window pause.
    const focusedInside = this.root.contains(document.activeElement);
    for (const element of this.root.querySelectorAll<HTMLElement>('.gum-build-heading,.gum-build-main,.gum-build-footer,.gum-build-warning')) element.inert = true;
    const resume = node('button', '', 'Keep playing'); resume.type = 'button';
    resume.onclick = () => { if (this.selfPaused) this.resume(); }; cover.append(resume); this.root.append(cover);
    if (focusedInside && !document.hidden) resume.focus({preventScroll: true});
  }
  next() {
    if (this.disposed || this.storageBlocked) return;
    const next = nextBuild(this.state); if (next === this.state) return;
    this.stopClock(); this.state = next; this.phase = 'build'; this.paused = false; this.selfPaused = false;
    this.history = []; this.selected = null; this.choicePage = 0; this.editing = false; this.elapsed = 0; this.actionCount = 0; this.message = '';
    this.persist(); this.render('[data-gum-part]:not([hidden])');
  }
  restart() {
    if (this.disposed || this.storageBlocked) return;
    this.stopClock(); this.phase = this.state.reported ? 'showcase' : 'build'; this.paused = false; this.selfPaused = false; this.elapsed = 0; this.editing = false;
    // Retry reopens the intact invention; it never discards a child's pieces.
    this.message = 'Your invention is ready to try again.'; this.render();
  }
  retry() { this.restart(); }
  isPlaying() { return !this.disposed && !this.paused && this.phase !== 'done'; }
  pause() {
    if (!this.isPlaying()) return false;
    this.paused = true; this.stopClock(); this.cancelDrag(); this.root.classList.add('paused'); this.showPause(); return true;
  }
  resume() {
    if (this.disposed || !this.paused) return;
    this.paused = false; this.root.classList.remove('paused'); this.root.querySelector('.gum-build-pause')?.remove();
    for (const element of this.root.querySelectorAll<HTMLElement>('.gum-build-heading,.gum-build-main,.gum-build-footer,.gum-build-warning')) element.inert = false;
    if (this.selfPaused) { this.selfPaused = false; this.context.emit?.({type: 'resume', name: 'bubblegum-away'}); }
    if (this.phase === 'test' || this.phase === 'adventure') this.startClock();
  }
  snapshot() {
    const step = this.step, journey = this.journey, stop = this.journeyStop;
    return {mode: 'assembly', stage: this.phase, blueprint: this.state.blueprint, world: this.blueprint.world,
      completedCount: this.state.completed, placed: {...this.state.placed}, bonds: {...this.state.bonds},
      activeSlot: step && !this.state.placed[step.id] ? step.id : null, activeJoint: step && this.state.placed[step.id] ? step.id : null,
      availableChoices: [...this.choices], selectedPart: this.selected, gumLeft: gumRemaining(this.state), gumBudget: GUM_BUDGET,
      totalParts: this.blueprint.slots.length, ready: isReady(this.state), tourElapsedMs: this.journeyElapsed,
      adventureElapsedMs: this.elapsed, launchElapsedMs: Math.min(LAUNCH_DURATION_MS, this.elapsed),
      launchPhase: this.launchPhase, launchDurationMs: LAUNCH_DURATION_MS, journeyDurationMs: TOUR_DURATION_MS,
      journey: {...journey, currentStop: stop, reachedMilestones: journey.stops.slice(0, stop + 1).map(item => item.caption),
        distance: Math.round(journey.goalDistance * this.journeyElapsed / TOUR_DURATION_MS)},
      tourCompleted: this.state.tourCompleted, reported: this.state.reported, paused: this.paused, actionCount: this.actionCount,
      saveFailed: this.saveFailed, storageBlocked: this.storageBlocked, blueprintCount: BLUEPRINTS.length};
  }
  unmount() {
    this.disposed = true; this.stopClock(); this.cancelDrag(); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.onHidden); window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('focusin', this.onOutside); document.removeEventListener('pointerdown', this.onOutside, true);
    this.mount.replaceChildren();
  }
}
