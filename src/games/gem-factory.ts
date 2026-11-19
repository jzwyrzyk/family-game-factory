import type { GameContext, GameInstance } from '../runtime/types';
import { GemSortingSimulation, SORTING_WORLD, type FactoryGemColor } from './gem-factory-physics';
import { factoryPattern, factorySupply, type FactoryPattern } from './gem-factory-pattern';
import './gem-factory.css';

type Color = FactoryGemColor;
type Stage = 'pick' | 'cut' | 'polish' | 'pack' | 'ship' | 'done';
const colors: Record<Color, { name: string; shape: string; light: string; mid: string; dark: string }> = {
  ruby: { name: 'Ruby', shape: 'heart', light: '#ffcae1', mid: '#ff548c', dark: '#bb1f65' },
  sapphire: { name: 'Sapphire', shape: 'diamond', light: '#b8f4ff', mid: '#3cafff', dark: '#2754c5' },
  emerald: { name: 'Emerald', shape: 'hexagon', light: '#bbffe2', mid: '#28dcb1', dark: '#088d83' },
  amethyst: { name: 'Amethyst', shape: 'crystal', light: '#f0cfff', mid: '#ae6aff', dark: '#6833bb' },
  sunshine: { name: 'Sunshine', shape: 'star', light: '#fff5b5', mid: '#ffc64e', dark: '#df8720' },
};
const customers = ['Pip', 'Luna', 'Momo', 'Coco', 'Sunny'];
const shapes: Record<Color, string> = {
  ruby: '50,86 12,48 12,27 29,15 50,29 71,15 88,27 88,48',
  sapphire: '25,16 75,16 94,42 50,91 6,42',
  emerald: '27,9 73,9 95,50 73,91 27,91 5,50',
  amethyst: '50,5 78,21 86,65 50,94 14,65 22,21',
  sunshine: '50,3 63,32 95,35 72,57 79,90 50,73 21,90 28,57 5,35 37,32',
};
let artId = 0;
/** Real scalable game pieces; their name and shape accompany every color cue. */
export function gemArt(color: Color, rough = false): string {
  const p = colors[color], id = `gf-gem-${++artId}`;
  const points = shapes[color];
  return `<svg class="gf-gem-art" viewBox="0 0 100 104" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${p.light}"/><stop offset=".43" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient><clipPath id="${id}-clip"><polygon points="${points}"/></clipPath></defs><ellipse cx="50" cy="96" rx="30" ry="5" fill="#18305a" opacity=".14"/><polygon points="${points}" fill="${p.dark}" stroke="${p.dark}" stroke-width="5" stroke-linejoin="round" transform="translate(0 3)"/><polygon points="${points}" fill="url(#${id})" stroke="${p.light}" stroke-width="1.8" stroke-linejoin="round"/><g clip-path="url(#${id}-clip)"><path d="M0 0H100L67 39 50 62 31 37Z" fill="${p.light}" opacity=".7"/><path d="M0 40L31 37 50 94 0 75Z" fill="${p.mid}"/><path d="M100 40L67 39 50 94 100 75Z" fill="${p.dark}" opacity=".5"/><path d="M31 37L50 62 67 39 50 15Z" fill="white" opacity=".23"/><path d="M31 37L50 94 67 39M0 40L31 37 50 15 67 39 100 40" fill="none" stroke="white" stroke-width="1.2" opacity=".5"/>${rough ? '<path d="M17 25L30 33 21 48M70 14L58 32 64 42M31 78L44 62 56 68" stroke="#503d69" stroke-width="4" opacity=".24" fill="none"/>' : '<path d="M25 23L29 34 40 38 29 41 25 52 22 41 11 38 22 34Z" fill="white" opacity=".9"/>'}</g></svg>`;
}
type ControlIcon = 'pause' | 'play' | 'sound-on' | 'sound-off';
function controlIcon(kind: ControlIcon): string {
  const paths: Record<ControlIcon, string> = {
    pause: '<rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor"/>',
    play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    'sound-on': '<path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'sound-off': '<path d="M3 9h4l5-4v14l-5-4H3Z" fill="currentColor"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  return `<svg class="gf-ui-icon" viewBox="0 0 24 24" style="width:24px;height:24px" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
}
type Paper = 'hearts' | 'stripes' | 'stars';
const papers: Record<Paper, { name: string; base: string; lid: string; ribbon: string }> = {
  hearts: { name: 'Pink hearts', base: '#ff8eb9', lid: '#ffc6df', ribbon: '#ffe89e' },
  stripes: { name: 'Mint stripes', base: '#65d5ba', lid: '#b4f3df', ribbon: '#fff0a5' },
  stars: { name: 'Purple stars', base: '#aa85e7', lid: '#d8c0ff', ribbon: '#ffd178' },
};
/** The selected paper is part of the gift artwork, including shipped gifts. */
function giftArt(paper: Paper): string {
  const p = papers[paper], id = `gf-paper-${++artId}`;
  const motif = paper === 'hearts'
    ? '<path d="M10 15 4 9C0 4 7 1 10 6c3-5 10-2 6 3Z" fill="#fff0f5" opacity=".8"/>'
    : paper === 'stripes' ? '<path d="m-5 0 25 25m0-25 25 25" stroke="#e0fff2" stroke-width="7" opacity=".8"/>'
    : '<path d="m10 2 2.3 5 5.4.7-3.9 3.8.9 5.4-4.7-2.5-4.7 2.5.9-5.4L2.3 7.7l5.4-.7Z" fill="#fff0b4" opacity=".9"/>';
  return `<svg class="gf-gift-art" data-paper="${paper}" viewBox="0 0 100 104" aria-hidden="true"><defs><pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse">${motif}</pattern></defs><ellipse cx="50" cy="96" rx="36" ry="6" fill="#453465" opacity=".15"/><rect x="16" y="40" width="68" height="51" rx="7" fill="${p.base}"/><rect x="16" y="40" width="68" height="51" rx="7" fill="url(#${id})"/><path d="M17 43h66v6H17Z" fill="#58407a" opacity=".13"/><rect x="11" y="30" width="78" height="18" rx="6" fill="${p.lid}" stroke="${p.base}" stroke-width="2"/><path d="M42 31h16v60H42Z" fill="${p.ribbon}"/><path d="M50 31C16 34 19 0 38 12c8 5 12 19 12 19Zm0 0C84 34 81 0 62 12 54 17 50 31 50 31Z" fill="${p.ribbon}" stroke="#e7b35e" stroke-width="2.2"/><path d="M48 32 34 56l-2-13-10 1 23-16m7 4 14 24 2-13 10 1-23-16" fill="${p.ribbon}"/><ellipse cx="50" cy="29" rx="9" ry="7" fill="#fff2bc"/></svg>`;
}
const node = <T extends keyof HTMLElementTagNameMap>(tag: T, cls: string, text = '') => {
  const n = document.createElement(tag); n.className = cls; n.textContent = text; return n;
};

/** A complete little workshop, mounted in the same learning-aware host as the other games. */
export default class GemFactory implements GameInstance {
  private root = node('section', 'gem-factory');
  private world!: HTMLElement;
  private console!: HTMLElement;
  private liveGem!: HTMLElement;
  private order!: HTMLElement;
  private status!: HTMLElement;
  private helperHint!: HTMLElement;
  private progress!: HTMLElement;
  private coinsLabel!: HTMLElement;
  private dayLabel!: HTMLElement;
  private effects!: HTMLElement;
  private pauseOverlay!: HTMLElement;
  private soundButton!: HTMLButtonElement;
  private pauseButton!: HTMLButtonElement;
  private abort = new AbortController();
  private stage: Stage = 'pick';
  private level = 1;
  private shipped = 0;
  private coins = 0;
  private roundCoins = 0;
  private rating = 0;
  private polish = 0;
  private selected: Color | null = null;
  private cutTime = 0;
  private shipTime = 0;
  private last = 0;
  private raf = 0;
  private stopped = false;
  private hostPaused = false;
  private userPaused = false;
  private holding = false;
  private pointerId: number | null = null;
  private polishingPointer: { x: number; y: number } | null = null;
  private sound = false;
  private audio: AudioContext | null = null;
  private particles: { el: HTMLElement; life: number; duration: number; x: number; y: number; vx: number; vy: number; spin: number }[] = [];
  private sorter = new GemSortingSimulation();
  private sortingNodes = new Map<number, HTMLElement>();
  private pattern: FactoryPattern = factoryPattern(1, 0);
  private recipe: Color[] = [];
  private filled: boolean[] = [];
  private feedCursor = 0;
  private returned: Color[] = [];
  private sortingMistakes = 0;
  private sortingRecoveries = 0;
  private sortingReturns = 0;
  private sortingBonus = 0;
  private sortingReadyAt: number | null = null;
  private sortingSettledAt = 0;
  private sortingHint = '';
  private sortingControlKey = '';
  private paper: Paper = 'hearts';
  private wrappedPapers: Paper[] = [];
  private readonly orderSize: number;
  private readonly cutterSpeed: number;
  private readonly sparkleBoost: boolean;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(target: HTMLElement, private context: GameContext) {
    this.orderSize = Math.min(5, Math.max(2, Number(context.config.orderSize) || 3));
    this.cutterSpeed = Math.min(1.5, Math.max(.5, Number(context.config.cutterSpeed) || 1));
    this.sparkleBoost = Boolean(context.config.sparkleBoost);
    const saved = context.persistence?.load() as Record<string, unknown> | undefined;
    if (saved?.schema === 'gem-factory-v1' && Number.isInteger(saved.level) && Number(saved.level) >= 1 && Number(saved.level) <= 999
      && Number.isInteger(saved.coins) && Number(saved.coins) >= 0 && Number(saved.coins) <= 1000000) {
      this.level = Number(saved.level); this.coins = Number(saved.coins);
    }
    this.root.setAttribute('aria-label', 'Gem Factory');
    this.root.innerHTML = `<header class="gf-topbar"><div class="gf-brand"><img src="./jems-mark.svg" alt="jems"><h2>Gem Factory<span class="gf-title-star" aria-hidden="true">✦</span></h2></div><div class="gf-top-actions"><button type="button" class="gf-icon-button" data-action="sound" aria-label="Turn sound on" aria-pressed="false">${controlIcon('sound-off')}</button><button type="button" class="gf-icon-button" data-action="pause" aria-label="Pause game">${controlIcon('pause')}</button></div></header>
      <div class="gf-world"><div class="gf-room"><img class="gf-backdrop" src="./gem-factory-workshop.webp" alt=""><div class="gf-belt-motion" aria-hidden="true"></div><div class="gf-machine-glow" aria-hidden="true"></div><div class="gf-live-gem" aria-hidden="true"></div><div class="gf-bubbles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><section class="gf-line" aria-label="Factory line"></section></div>
      <div class="gf-hud"><div class="gf-day"><strong></strong></div><div class="gf-wallet"><span class="gf-coin" aria-hidden="true">✦</span><strong>0</strong></div></div>
      <section class="gf-order" aria-label="Gem pattern"></section><div class="gf-progress" aria-label="Gifts packed"></div>
      <div class="gf-helper"><img src="./jems-gem-companion.png" alt="Your cheerful Jems gem companion"><p class="gf-helper-hint" aria-hidden="true"></p></div>
      <div class="gf-effects" aria-hidden="true"></div><div class="gf-pause-overlay" hidden><div class="gf-pause-card"><span class="gf-pause-gem" aria-hidden="true">✦</span><h3>Tea break!</h3><p>Your gems can wait.</p><button type="button" class="gf-primary" data-action="resume">Let's play</button></div></div></div><p class="gf-screen-reader" role="status" aria-live="polite"></p>`;
    this.world = this.root.querySelector('.gf-world')!;
    this.console = this.root.querySelector('.gf-line')!;
    this.liveGem = this.root.querySelector('.gf-live-gem')!;
    this.order = this.root.querySelector('.gf-order')!;
    this.status = this.root.querySelector('[role="status"]')!;
    this.helperHint = this.root.querySelector('.gf-helper-hint')!;
    this.progress = this.root.querySelector('.gf-progress')!;
    this.coinsLabel = this.root.querySelector('.gf-wallet strong')!;
    this.dayLabel = this.root.querySelector('.gf-day strong')!;
    this.effects = this.root.querySelector('.gf-effects')!;
    this.pauseOverlay = this.root.querySelector('.gf-pause-overlay')!;
    this.soundButton = this.root.querySelector('[data-action="sound"]')!;
    this.pauseButton = this.root.querySelector('[data-action="pause"]')!;
    target.replaceChildren(this.root);
    this.prepareSorting(); this.listen(); this.render(); this.focusAction('route-order');
    this.raf = requestAnimationFrame(this.loop);
  }

  private wanted(): Color { return this.pattern.next; }
  private active() { return !this.stopped && !this.hostPaused && !this.userPaused && !document.hidden && this.stage !== 'done'; }
  private announce(message: string) { this.status.textContent = message; }
  private hint(message: string) { this.helperHint.textContent = message; this.announce(message); }
  private listen() {
    const signal = this.abort.signal;
    this.root.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-action]');
      if (!b || !this.root.contains(b) || b.disabled) return;
      const action = b.dataset.action;
      if (action === 'sound') { this.sound = !this.sound; this.soundButton.innerHTML = controlIcon(this.sound ? 'sound-on' : 'sound-off'); this.soundButton.setAttribute('aria-label', `Turn sound ${this.sound ? 'off' : 'on'}`); this.soundButton.setAttribute('aria-pressed', String(this.sound)); if (this.sound) this.chime([523, 659, 784]); return; }
      if (action === 'pause' || action === 'resume') { this.togglePause(); return; }
      if (!this.active()) return;
      if (action === 'route-order') this.route(-1);
      if (action === 'route-return') this.route(1);
      if (action === 'cut') this.cut();
      if (action === 'polish') this.addPolish(18);
      if (action === 'paper' && (b.dataset.paper === 'hearts' || b.dataset.paper === 'stripes' || b.dataset.paper === 'stars')) this.choosePaper(b.dataset.paper);
      if (action === 'pack') this.pack();
    }, { signal });
    this.root.addEventListener('pointerdown', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('[data-action="polish"]');
      if (!b || !this.active() || this.stage !== 'polish') return;
      e.preventDefault(); b.focus({ preventScroll: true });
      this.pointerId = e.pointerId; this.holding = true; this.polishingPointer = { x: e.clientX, y: e.clientY };
      b.setPointerCapture?.(e.pointerId);
    }, { signal });
    this.root.addEventListener('pointermove', e => {
      if (!this.polishingPointer || this.pointerId !== e.pointerId || !this.active() || this.stage !== 'polish') return;
      const distance = Math.hypot(e.clientX - this.polishingPointer.x, e.clientY - this.polishingPointer.y);
      this.polishingPointer = { x: e.clientX, y: e.clientY };
      this.addPolish(Math.min(3.5, distance * .11));
    }, { signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.root.addEventListener(event, () => this.release(), { signal });
    this.root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.togglePause(); return; }
      if (!this.active()) return;
      if (this.stage === 'polish' && e.key === ' ' && (e.target as Element).closest('[data-action="polish"]')) { e.preventDefault(); this.holding = true; return; }
      if (e.repeat) return;
      if (this.stage === 'pick') {
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); this.route(-1); }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); this.route(1); }
      }
      if ((e.key === ' ' || e.key === 'Enter') && !(e.target as Element).closest('button')) {
        e.preventDefault(); if (this.stage === 'pick') this.route(-1); else if (this.stage === 'cut') this.cut(); else if (this.stage === 'polish') this.addPolish(18); else if (this.stage === 'pack') this.pack();
      }
    }, { signal });
    // A held polish must end even if Tab or another control moves focus before
    // Space is released. Both listeners are removed when this game unmounts.
    window.addEventListener('keyup', e => { if (e.key === ' ') this.release(); }, { signal, capture: true });
    this.root.addEventListener('focusout', () => this.release(), { signal });
    window.addEventListener('blur', () => { this.release(); if (this.active()) this.setUserPause(true); }, { signal });
    document.addEventListener('visibilitychange', () => { this.release(); this.last = 0; if (document.hidden && !this.stopped && this.stage !== 'done') this.setUserPause(true); }, { signal });
  }
  private release() { this.holding = false; this.pointerId = null; this.polishingPointer = null; }
  private prepareSorting() {
    this.sorter.dispose(); this.sorter = new GemSortingSimulation(); this.sortingNodes.clear();
    this.pattern = factoryPattern(this.level, this.shipped); this.recipe = [this.pattern.next]; this.filled = [false]; this.feedCursor = 0;
    this.returned = []; this.sortingMistakes = 0; this.sortingRecoveries = 0; this.sortingReturns = 0; this.sortingBonus = 0;
    this.sortingReadyAt = null; this.sortingSettledAt = 0; this.sortingControlKey = '';
    this.sortingHint = 'What comes next? Tap a bucket.';
  }
  private nextGem(): Color { const supply = factorySupply(this.pattern, this.level, this.shipped); return supply[this.feedCursor % supply.length]; }
  private sortingBusy() { const state = this.sorter.snapshot(); return this.sortingReadyAt !== null || state.time < this.sortingSettledAt || state.gems.some(g => g.state === 'moving'); }
  private route(direction: -1 | 1) {
    if (this.stage !== 'pick' || !this.active() || this.sortingBusy()) return;
    this.sorter.setDirection(direction);
    if (this.sorter.release(this.nextGem()) === null) return;
    this.sortingHint = 'Here it goes!'; this.updateSortingControls(); this.chime([440]);
  }
  private renderPattern() {
    this.order.hidden = this.stage !== 'pick';
    if (this.order.hidden) return;
    this.order.innerHTML = `<h3>What comes next?</h3><div class="gf-pattern" role="img" aria-label="${this.pattern.sequence.map(c => colors[c].name).join(', ')}, then the missing gem">${this.pattern.sequence.map(c => `<span class="gf-pattern-gem" data-color="${c}" aria-label="${colors[c].name}">${gemArt(c)}</span>`).join('')}<span class="gf-pattern-missing ${this.filled[0] ? 'gf-pattern-solved' : ''}" aria-label="${this.filled[0] ? `${colors[this.pattern.next].name} added` : 'Missing next gem'}">${this.filled[0] ? gemArt(this.pattern.next) : '?'}</span></div>`;
  }
  private updateSortingControls() {
    if (this.stage !== 'pick') return;
    const busy = this.sortingBusy(), color = this.nextGem(), key = `${busy}:${color}:${this.sortingHint}:${this.filled[0]}`;
    if (key === this.sortingControlKey) return;
    this.sortingControlKey = key; this.console.dataset.sortingBusy = String(busy);
    for (const action of ['route-order', 'route-return']) {
      const button = this.console.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      if (button) { button.disabled = busy; button.setAttribute('aria-label', `${action === 'route-order' ? 'Order' : 'Return'} bucket: send the ${colors[color].name} gem`); }
    }
    const candidate = this.console.querySelector<HTMLElement>('.gf-candidate');
    if (candidate) { candidate.hidden = busy; candidate.innerHTML = gemArt(color, true); candidate.dataset.color = color; candidate.setAttribute('aria-label', `${colors[color].name} ${colors[color].shape} gem in the hopper`); }
    this.hint(this.sortingHint);
  }
  private animateSorter(delta: number) {
    this.sorter.step(delta / 1000);
    const state = this.sorter.snapshot();
    const ramp = this.console.querySelector<HTMLElement>('.gf-sorting-ramp');
    if (ramp) ramp.style.transform = `translate(-50%,-50%) rotate(${state.angle}rad)`;
    const layer = this.console.querySelector<HTMLElement>('.gf-sorting-gems');
    for (const gem of state.gems) {
      let element = this.sortingNodes.get(gem.id);
      if (!element && layer) {
        element = node('div', 'gf-physical-gem'); element.innerHTML = gemArt(gem.color, true);
        element.dataset.gemId = String(gem.id); element.dataset.color = gem.color; layer.append(element); this.sortingNodes.set(gem.id, element);
      }
      if (element) { element.style.left = `${gem.x / SORTING_WORLD.width * 100}%`; element.style.top = `${gem.y / SORTING_WORLD.height * 100}%`; element.style.transform = `translate(-50%,-50%) rotate(${gem.angle}rad)`; element.classList.toggle('gf-gem-landed', gem.state !== 'moving'); }
    }
    for (const [id, element] of this.sortingNodes) if (!state.gems.some(g => g.id === id)) { element.remove(); this.sortingNodes.delete(id); }
    for (const event of this.sorter.drainEvents()) {
      if (this.sortingReadyAt !== null) continue;
      const needed = event.color === this.pattern.next;
      this.sortingSettledAt = state.time + .9;
      if (event.bin === 'order' && needed) {
        if (this.returned.length) this.sortingRecoveries++;
        this.returned = []; this.filled[0] = true; this.sortingBonus = Math.max(0, 6 - this.sortingMistakes * 2);
        this.sortingReadyAt = state.time; this.sortingHint = "That's the one!"; this.renderPattern(); this.chime([523, 659]); this.burst(26, 59, 18);
        this.context.emit?.({ type: 'mechanic', name: 'gem-sorted', value: 1 });
      } else if (event.bin === 'return' && !needed) {
        if (this.returned.length) this.sortingRecoveries++;
        this.returned = []; this.feedCursor++; this.sortingReturns++; this.sortingHint = 'Try this gem!'; this.chime([440, 523]);
      } else {
        this.sortingMistakes++; this.returned = [event.color];
        this.sortingHint = 'Look at the pattern. Try again!'; this.chime([330, 392]);
      }
    }
    this.updateSortingControls();
    if (this.sortingReadyAt !== null && state.time - this.sortingReadyAt > .75) {
      this.selected = this.pattern.next; this.stage = 'cut'; this.cutTime = 0; this.render(); this.focusAction('cut');
    }
  }
  private cutterPosition() { return (Math.sin(this.cutTime * Math.PI / 1200 * this.cutterSpeed - Math.PI / 2) + 1) / 2; }
  private cut() {
    if (this.stage !== 'cut') return;
    const distance = Math.abs(this.cutterPosition() - .5);
    this.rating = distance <= .115 ? 3 : distance <= .24 ? 2 : 1;
    this.stage = 'polish'; this.polish = 0; this.render(); this.burst(38, 58, this.rating === 3 ? 25 : 15);
    this.chime(this.rating === 3 ? [659, 784, 1047] : [523, 659]); this.focusAction('polish');
  }
  private addPolish(amount: number) {
    if (this.stage !== 'polish' || !this.active()) return;
    this.polish = Math.min(100, this.polish + amount * (this.sparkleBoost ? 1.35 : 1));
    const fill = this.console.querySelector<HTMLElement>('.gf-polish-fill'); if (fill) fill.style.width = `${this.polish}%`;
    const meter = this.console.querySelector('[role="progressbar"]'); meter?.setAttribute('aria-valuenow', String(Math.round(this.polish)));
    this.world.style.setProperty('--shine', String(this.polish / 100)); this.liveGem.style.setProperty('--shine', String(this.polish / 100));
    if (this.polish >= 100) { this.release(); this.stage = 'pack'; this.render(); this.burst(62, 56, 26); this.chime([659, 880, 1047]); this.focusAction('paper'); }
  }
  private choosePaper(paper: Paper) {
    if (this.stage !== 'pack') return;
    this.paper = paper;
    for (const b of this.console.querySelectorAll<HTMLButtonElement>('[data-action="paper"]')) b.setAttribute('aria-pressed', String(b.dataset.paper === paper));
    const present = this.console.querySelector<HTMLButtonElement>('.gf-gift-action');
    if (present) { present.dataset.paper = paper; present.innerHTML = giftArt(paper); present.setAttribute('aria-label', `Wrap and send your gem in ${papers[paper].name.toLowerCase()} paper`); }
    this.hint('Lovely! Tap your gift to send it.'); this.chime([659]);
  }
  private pack() {
    if (this.stage !== 'pack') return;
    this.stage = 'ship'; this.shipTime = 0; const earned = 15 + this.rating * 5 + this.sortingBonus;
    this.coins += earned; this.roundCoins += earned; this.wrappedPapers.push(this.paper); this.shipped++; this.render();
    this.burst(85, 55, 34); this.chime([523, 659, 784, 1047]);
    this.announce(`Your ${papers[this.paper].name.toLowerCase()} gift is ready! ${this.shipped} of ${this.orderSize} gifts made.`);
    this.context.emit?.({ type: 'mechanic', name: 'gem-packed', value: this.shipped });
  }
  private finishShipping() {
    if (this.shipped >= this.orderSize) {
      this.stage = 'done'; this.render(); this.save();
      this.context.finish({ won: true, level: this.level, title: 'A box full of happy!', description: `You finished ${this.orderSize} gem patterns and made ${this.orderSize} beautiful gifts. ${this.level === 1 ? 'Next up: a new repeating pattern!' : 'Ready for another day at the factory?'}` });
    } else { this.stage = 'pick'; this.selected = null; this.rating = 0; this.polish = 0; this.prepareSorting(); this.render(); this.focusAction('route-order'); }
  }
  private focusAction(action: string) { this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus({ preventScroll: true }); }
  private render() {
    this.root.dataset.stage = this.stage;
    const stageIndex = ['pick', 'cut', 'polish', 'pack', 'ship', 'done'].indexOf(this.stage);
    this.world.style.setProperty('--station', String(Math.min(stageIndex, 3)));
    this.world.style.setProperty('--gem-x', `${[16, 38, 62, 85, 85, 85][stageIndex]}%`);
    this.world.style.setProperty('--mobile-pan', `${[0, -20, -44, -64.286, -64.286, -64.286][stageIndex]}%`);
    this.world.style.setProperty('--shine', String(this.polish / 100));
    this.dayLabel.textContent = `Day ${this.level}`; this.coinsLabel.textContent = this.coins.toLocaleString();
    this.coinsLabel.parentElement!.setAttribute('aria-label', `${this.coins} happy coins`);
    this.progress.innerHTML = `<span>${Array.from({ length: this.orderSize }, (_, i) => `<i class="${i < this.shipped ? 'gf-gift-filled' : ''}" data-paper="${this.wrappedPapers[i] || 'hearts'}">${giftArt(this.wrappedPapers[i] || 'hearts')}</i>`).join('')}</span>`;
    this.progress.setAttribute('aria-label', `${this.shipped} of ${this.orderSize} gifts packed`);
    this.renderPattern();
    const shipping = this.stage === 'ship' || this.stage === 'done';
    this.liveGem.innerHTML = shipping ? `<div class="gf-packed-present" data-paper="${this.paper}">${giftArt(this.paper)}</div>` : this.stage === 'cut' && this.selected ? gemArt(this.selected, true) : '';
    this.liveGem.style.setProperty('--shine', String(this.polish / 100));
    let inner = '';
    if (this.stage === 'pick') {
      inner = `<div class="gf-sorting-board" aria-label="Choose a bucket for the gem"><div class="gf-sorting-chute" aria-hidden="true"><i></i></div><div class="gf-candidate" role="img"></div><div class="gf-ramp-pivot" aria-hidden="true"></div><div class="gf-sorting-ramp" aria-hidden="true"><i></i><i></i><i></i></div><div class="gf-sorting-gems" aria-hidden="true"></div><button type="button" class="gf-sort-basket gf-order-basket" data-action="route-order"><span class="gf-basket-symbol" aria-hidden="true">♡</span><span>Order</span></button><button type="button" class="gf-sort-basket gf-return-basket" data-action="route-return"><span class="gf-basket-symbol" aria-hidden="true">↻</span><span>Return</span></button></div>`;
    } else if (this.stage === 'cut') {
      inner = `<button type="button" class="gf-machine-action gf-cut-action" data-action="cut" aria-label="Tap the cutter when the pointer is in the glowing mint stripe"><span class="gf-machine-halo" aria-hidden="true"></span><span class="gf-tap-spark" aria-hidden="true">✦</span><span class="gf-timing-track" aria-hidden="true"><span class="gf-good-zone"></span><span class="gf-perfect-zone"></span><i class="gf-cutter-needle"></i></span></button>`;
    } else if (this.stage === 'polish') {
      inner = `<button type="button" class="gf-machine-action gf-polish-action gf-polish-stone" data-action="polish" aria-label="Rub or hold the ${colors[this.selected!].name} gem to make it shine. Hold Space or press Enter with a keyboard."><span class="gf-machine-halo" aria-hidden="true"></span>${gemArt(this.selected!)}<span class="gf-polish-cloud" aria-hidden="true"></span><span class="gf-polish-spark" aria-hidden="true">✦</span></button><div class="gf-polish-track" role="progressbar" aria-label="Gem shine" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="gf-polish-fill"></span></div>`;
    } else if (this.stage === 'pack') {
      inner = `<div class="gf-wrap-options" role="group" aria-label="Choose wrapping paper">${(Object.keys(papers) as Paper[]).map(paper => `<button type="button" class="gf-paper-roll gf-paper-${paper}" data-action="paper" data-paper="${paper}" aria-label="${papers[paper].name} wrapping paper" aria-pressed="${this.paper === paper}"><span class="gf-paper-swatch" aria-hidden="true"></span><span class="gf-paper-name">${paper[0].toUpperCase() + paper.slice(1)}</span><span class="gf-paper-check" aria-hidden="true">✓</span></button>`).join('')}</div><button type="button" class="gf-machine-action gf-gift-action" data-action="pack" data-paper="${this.paper}" aria-label="Wrap and send your gem in ${papers[this.paper].name.toLowerCase()} paper">${giftArt(this.paper)}</button>`;
    } else {
      inner = `<div class="gf-delivery-spark" aria-hidden="true">✦</div>`;
    }
    this.console.innerHTML = inner; this.console.inert = this.userPaused || this.hostPaused;
    this.sortingControlKey = ''; this.sortingNodes.clear();
    if (this.stage === 'pick') { this.updateSortingControls(); this.animateSorter(0); }
    else this.hint(this.stage === 'cut' ? 'Tap when it glows!' : this.stage === 'polish' ? 'Rub the gem. Make it shine!' : this.stage === 'pack' ? 'Pick a paper. Tap your gift!' : this.stage === 'done' ? 'A little happiness, delivered!' : `A gift for ${customers[(this.shipped + this.level - 2) % customers.length]}!`);
    this.pauseButton.disabled = this.stage === 'done';
  }
  private setUserPause(paused: boolean) {
    if (this.stopped || this.stage === 'done' || this.userPaused === paused) return;
    this.userPaused = paused; this.release(); this.last = 0;
    this.pauseOverlay.hidden = !paused; this.root.classList.toggle('gf-paused', paused || this.hostPaused);
    this.console.inert = paused || this.hostPaused; this.pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game'); this.pauseButton.innerHTML = controlIcon(paused ? 'play' : 'pause');
    this.context.emit?.({ type: paused ? 'pause' : 'resume', name: 'factory-break' });
    if (paused) this.focusAction('resume'); else { const action = this.stage === 'pick' ? 'route-order' : this.stage === 'ship' ? '' : this.stage; if (action) this.focusAction(action); }
  }
  private togglePause() { if (!this.hostPaused) this.setUserPause(!this.userPaused); }
  private save() {
    const saved = this.context.persistence?.save({ schema: 'gem-factory-v1', level: this.level, coins: this.coins });
    if (saved === false) this.announce('Your gem factory could not be saved. You can keep playing here.');
  }
  private chime(notes: number[]) {
    if (!this.sound || this.stopped) return;
    try {
      this.audio ||= new AudioContext(); void this.audio.resume().catch(() => {});
      const now = this.audio.currentTime;
      notes.forEach((hz, i) => {
        const o = this.audio!.createOscillator(), g = this.audio!.createGain(); o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0, now + i * .08); g.gain.linearRampToValueAtTime(.065, now + i * .08 + .014); g.gain.exponentialRampToValueAtTime(.001, now + i * .08 + .26);
        o.connect(g); g.connect(this.audio!.destination); o.start(now + i * .08); o.stop(now + i * .08 + .28);
        o.onended = () => { o.disconnect(); g.disconnect(); };
      });
    } catch { /* A browser without WebAudio still has the complete game. */ }
  }
  private burst(x: number, y: number, count: number) {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const el = node('i', 'gf-particle', i % 4 === 0 ? '✦' : '');
      el.style.setProperty('--particle-color', ['#ffcd59', '#fa7faf', '#82ead2', '#ad94f9', '#fff6ce'][i % 5]); this.effects.append(el);
      const angle = i / count * Math.PI * 2;
      this.particles.push({ el, life: 0, duration: 900 + (i % 5) * 100, x, y, vx: Math.cos(angle) * (6 + i % 4 * 3), vy: Math.sin(angle) * 10 - 12, spin: i * 47 });
    }
  }
  private loop = (now: number) => {
    if (this.stopped) return;
    const delta = this.last ? Math.min(48, Math.max(0, now - this.last)) : 0; this.last = now;
    if (this.active()) {
      if (this.stage === 'pick') this.animateSorter(delta);
      if (this.stage === 'cut') {
        this.cutTime += delta;
        const needle = this.console.querySelector<HTMLElement>('.gf-cutter-needle'); if (needle) needle.style.left = `${this.cutterPosition() * 100}%`;
        this.console.querySelector('.gf-cut-action')?.classList.toggle('gf-cut-ready', Math.abs(this.cutterPosition() - .5) <= .115);
      }
      if (this.stage === 'polish' && this.holding) this.addPolish(delta / 28);
      if (this.stage === 'ship') { this.shipTime += delta; if (this.shipTime >= (this.reducedMotion ? 650 : 1300)) this.finishShipping(); }
      for (const p of this.particles) {
        p.life += delta; const t = p.life / 1000;
        p.el.style.left = `${p.x + p.vx * t}%`; p.el.style.top = `${p.y + p.vy * t + 18 * t * t}%`;
        p.el.style.opacity = String(Math.max(0, 1 - p.life / p.duration)); p.el.style.transform = `rotate(${p.spin + p.life * .2}deg)`;
        if (p.life >= p.duration) p.el.remove();
      }
      this.particles = this.particles.filter(p => p.life < p.duration);
    }
    this.raf = requestAnimationFrame(this.loop);
  };
  private reset() {
    if (this.userPaused) { this.userPaused = false; this.context.emit?.({ type: 'resume', name: 'factory-break' }); }
    this.stage = 'pick'; this.shipped = 0; this.roundCoins = 0; this.selected = null; this.rating = 0; this.polish = 0; this.wrappedPapers = [];
    this.prepareSorting(); this.hostPaused = false; this.release(); this.last = 0; this.cutTime = 0; this.shipTime = 0;
    this.particles.forEach(p => p.el.remove()); this.particles = []; this.pauseOverlay.hidden = true; this.console.inert = false;
    this.root.classList.remove('gf-paused'); this.pauseButton.innerHTML = controlIcon('pause'); this.pauseButton.setAttribute('aria-label', 'Pause game'); this.render();
  }
  next() { if (this.stopped || this.hostPaused) return; this.level = Math.min(999, this.level + 1); this.reset(); this.save(); }
  restart() { if (this.stopped || this.hostPaused) return; this.coins -= this.roundCoins; this.reset(); this.save(); }
  retry() { this.restart(); }
  isPlaying() { return !this.stopped && this.stage !== 'done' && !this.hostPaused && !this.userPaused; }
  pause() { if (!this.isPlaying()) return false; this.hostPaused = true; this.release(); this.console.inert = true; this.root.classList.add('gf-paused'); return true; }
  resume() { if (!this.stopped) { this.hostPaused = false; this.last = 0; this.console.inert = this.userPaused; this.root.classList.toggle('gf-paused', this.userPaused); } }
  snapshot() { return { stage: this.stage, level: this.level, order: this.wanted(), completed: this.shipped, orderSize: this.orderSize, coins: this.coins, polish: Math.round(this.polish), rating: this.rating, hostPaused: this.hostPaused, userPaused: this.userPaused, holding: this.holding,
    recipe: [...this.recipe], collected: [...this.filled], pattern: { cycle: [...this.pattern.cycle], sequence: [...this.pattern.sequence], next: this.pattern.next }, nextGem: this.nextGem(), returns: [...this.returned], sortingMistakes: this.sortingMistakes, sortingRecoveries: this.sortingRecoveries, sortingReturns: this.sortingReturns, sortingBonus: this.sortingBonus, sortingBusy: this.sortingBusy(), paper: this.paper, wrappedPapers: [...this.wrappedPapers], sorting: this.sorter.snapshot() }; }
  unmount() {
    this.save(); this.stopped = true; this.release(); this.sorter.dispose(); cancelAnimationFrame(this.raf); this.abort.abort();
    this.particles.forEach(p => p.el.remove()); this.particles = []; void this.audio?.close().catch(() => {}); this.root.remove();
  }
}
