import type { GameContext, GameInstance } from '../runtime/types';
import { GemSortingSimulation, SORTING_WORLD, type FactoryGemColor } from './gem-factory-physics';
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
  const points = rough ? '29,13 66,9 88,30 92,63 69,86 36,92 11,69 8,36' : shapes[color];
  return `<svg class="gf-gem-art" viewBox="0 0 100 104" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${p.light}"/><stop offset=".43" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient><clipPath id="${id}-clip"><polygon points="${points}"/></clipPath></defs><ellipse cx="50" cy="96" rx="30" ry="5" fill="#18305a" opacity=".14"/><polygon points="${points}" fill="${p.dark}" stroke="${p.dark}" stroke-width="5" stroke-linejoin="round" transform="translate(0 3)"/><polygon points="${points}" fill="url(#${id})" stroke="${p.light}" stroke-width="1.8" stroke-linejoin="round"/><g clip-path="url(#${id}-clip)"><path d="M0 0H100L67 39 50 62 31 37Z" fill="${p.light}" opacity=".7"/><path d="M0 40L31 37 50 94 0 75Z" fill="${p.mid}"/><path d="M100 40L67 39 50 94 100 75Z" fill="${p.dark}" opacity=".5"/><path d="M31 37L50 62 67 39 50 15Z" fill="white" opacity=".23"/><path d="M31 37L50 94 67 39M0 40L31 37 50 15 67 39 100 40" fill="none" stroke="white" stroke-width="1.2" opacity=".5"/>${rough ? '<path d="M17 25L30 33 21 48M70 14L58 32 64 42M31 78L44 62 56 68" stroke="#503d69" stroke-width="4" opacity=".24" fill="none"/>' : '<path d="M25 23L29 34 40 38 29 41 25 52 22 41 11 38 22 34Z" fill="white" opacity=".9"/>'}</g></svg>`;
}
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1 3.2 6.7 7.4 1.1-5.3 5.2 1.2 7.3-6.5-3.5-6.5 3.5 1.2-7.3L1.4 8.8l7.4-1.1Z" fill="currentColor"/></svg>';
const gift = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 12h18v13H5z" fill="#af8bfa"/><path d="M3 9h22v6H3z" fill="#c8b2ff"/><path d="M12 9h4v16h-4z" fill="#ffd17c"/><path d="M14 9C2 10 6-1 12 5l2 4Zm0 0C26 10 22-1 16 5l-2 4Z" fill="none" stroke="#ffd17c" stroke-width="3" stroke-linecap="round"/></svg>';
const node = <T extends keyof HTMLElementTagNameMap>(tag: T, cls: string, text = '') => {
  const n = document.createElement(tag); n.className = cls; n.textContent = text; return n;
};

/** A complete little workshop, mounted in the same learning-aware host as the other games. */
export default class GemFactory implements GameInstance {
  private root = node('section', 'gem-factory');
  private world!: HTMLElement;
  private room!: HTMLElement;
  private console!: HTMLElement;
  private liveGem!: HTMLElement;
  private order!: HTMLElement;
  private status!: HTMLElement;
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
  private recipe: Color[] = [];
  private filled: boolean[] = [];
  private feedCursor = 0;
  private returned: Color[] = [];
  private sortingMistakes = 0;
  private sortingRecoveries = 0;
  private sortingReturns = 0;
  private sortingBonus = 0;
  private sortingReadyAt: number | null = null;
  private sortingHint = '';
  private lastRelease = -1;
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
    this.root.innerHTML = `<header class="gf-topbar"><div class="gf-brand"><img src="./jems-mark.svg" alt="jems"><div><span class="gf-eyebrow">A LITTLE SPARKLE. A LOT OF HAPPY.</span><h2>Gem Factory<span class="gf-title-star">✦</span></h2></div></div><div class="gf-top-actions"><button type="button" class="gf-icon-button" data-action="sound" aria-label="Turn sound on" aria-pressed="false">♪</button><button type="button" class="gf-icon-button" data-action="pause" aria-label="Pause game">Ⅱ</button></div></header>
      <div class="gf-world"><div class="gf-room" aria-hidden="true"><img class="gf-backdrop" src="./gem-factory-workshop.webp" alt=""><div class="gf-belt-motion"></div><div class="gf-machine-glow"></div><div class="gf-live-gem"></div><div class="gf-bubbles"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="gf-hud"><div class="gf-day"><span>WORKSHOP</span><strong></strong></div><div class="gf-wallet"><span class="gf-coin" aria-hidden="true">✦</span><strong>0</strong><span class="gf-wallet-label">happy coins</span></div></div>
      <section class="gf-order" aria-label="Current order"></section>
      <div class="gf-progress" aria-label="Gifts packed"></div>
      <div class="gf-station-signs" aria-hidden="true"><span>Sort</span><span>Cut</span><span>Polish</span><span>Pack</span></div>
      <div class="gf-console-wrap"><div class="gf-helper"><img src="./gem-factory-helper.webp" alt="Pip, your cheerful robot helper"><span>Let's make<br>some happy!</span></div><section class="gf-console" aria-label="Gem workbench"></section></div>
      <div class="gf-effects" aria-hidden="true"></div><div class="gf-pause-overlay" hidden><div class="gf-pause-card"><span class="gf-pause-gem">✦</span><h3>Tea break!</h3><p>Your gems can wait.</p><button type="button" class="gf-primary" data-action="resume">Back to the sparkle</button></div></div></div><p class="gf-screen-reader" role="status" aria-live="polite"></p>`;
    this.world = this.root.querySelector('.gf-world')!;
    this.room = this.root.querySelector('.gf-room')!;
    this.console = this.root.querySelector('.gf-console')!;
    this.liveGem = this.root.querySelector('.gf-live-gem')!;
    this.order = this.root.querySelector('.gf-order')!;
    this.status = this.root.querySelector('[role="status"]')!;
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

  private palette(): Color[] { return this.level === 1 ? ['ruby', 'sapphire', 'emerald'] : this.level === 2 ? ['ruby', 'sapphire', 'emerald', 'amethyst'] : ['ruby', 'sapphire', 'emerald', 'amethyst', 'sunshine']; }
  private wanted(): Color { const p = this.palette(); return p[(this.shipped + this.level - 1) % p.length]; }
  private active() { return !this.stopped && !this.hostPaused && !this.userPaused && !document.hidden && this.stage !== 'done'; }
  private announce(message: string) { this.status.textContent = message; }
  private listen() {
    const signal = this.abort.signal;
    this.root.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-action]');
      if (!b || !this.root.contains(b)) return;
      const action = b.dataset.action;
      if (action === 'sound') { this.sound = !this.sound; this.soundButton.textContent = this.sound ? '♫' : '♪'; this.soundButton.setAttribute('aria-label', `Turn sound ${this.sound ? 'off' : 'on'}`); this.soundButton.setAttribute('aria-pressed', String(this.sound)); if (this.sound) this.chime([523, 659, 784]); return; }
      if (action === 'pause' || action === 'resume') { this.togglePause(); return; }
      if (!this.active()) return;
      if (action === 'route-order') this.route(-1);
      if (action === 'route-return') this.route(1);
      if (action === 'release-gem') this.releaseGem();
      if (action === 'recover-gem') this.releaseGem(true);
      if (action === 'cut') this.cut();
      if (action === 'polish') this.addPolish(14);
      if (action === 'pack') this.pack();
    }, { signal });
    this.root.addEventListener('pointerdown', e => {
      const b = (e.target as Element).closest<HTMLElement>('[data-action="polish"],.gf-polish-stone');
      if (!b || !this.active() || this.stage !== 'polish') return;
      this.pointerId = e.pointerId; this.holding = b.dataset.action === 'polish';
      if (b.classList.contains('gf-polish-stone')) { e.preventDefault(); this.polishingPointer = { x: e.clientX, y: e.clientY }; }
      b.setPointerCapture?.(e.pointerId);
    }, { signal });
    this.root.addEventListener('pointermove', e => {
      if (!this.polishingPointer || this.pointerId !== e.pointerId || !this.active() || this.stage !== 'polish') return;
      const distance = Math.hypot(e.clientX - this.polishingPointer.x, e.clientY - this.polishingPointer.y);
      this.polishingPointer = { x: e.clientX, y: e.clientY };
      this.addPolish(Math.min(3.5, distance * .11));
    }, { signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.root.addEventListener(event, () => this.release(), { signal });
    }
    this.root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.togglePause(); return; }
      if (!this.active() || e.repeat) return;
      if (this.stage === 'pick') {
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); this.route(-1); }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); this.route(1); }
        if (e.key === 'ArrowDown' || e.key === '3') { e.preventDefault(); this.releaseGem(); }
      }
      // Native buttons handle Space and Enter; shortcuts cover non-button game focus.
      if ((e.key === ' ' || e.key === 'Enter') && !(e.target as Element).closest('button')) {
        e.preventDefault(); if (this.stage === 'pick') this.releaseGem(); else if (this.stage === 'cut') this.cut(); else if (this.stage === 'polish') this.addPolish(18); else if (this.stage === 'pack') this.pack();
      }
    }, { signal });
    window.addEventListener('blur', () => { this.release(); if (this.active()) this.setUserPause(true); }, { signal });
    document.addEventListener('visibilitychange', () => { this.release(); this.last = 0; if (document.hidden && !this.stopped && this.stage !== 'done') this.setUserPause(true); }, { signal });
  }
  private release() { this.holding = false; this.pointerId = null; this.polishingPointer = null; }
  private prepareSorting() {
    this.sorter.dispose(); this.sorter = new GemSortingSimulation(); this.sortingNodes.clear();
    const palette = this.palette(), start = palette.indexOf(this.wanted());
    this.recipe = Array.from({ length: Math.min(3, this.level) }, (_, i) => palette[(start + i) % palette.length]);
    this.filled = this.recipe.map(() => false); this.feedCursor = this.shipped % 2;
    this.returned = []; this.sortingMistakes = 0; this.sortingRecoveries = 0; this.sortingReturns = 0; this.sortingBonus = 0;
    this.sortingReadyAt = null; this.lastRelease = -1;
    this.sortingHint = this.level === 1 ? 'Tilt the ramp. Roll your gem into the order tray!' : 'Recipe gems go left. Send the others back to the right.';
  }
  private supply(): Color[] {
    const palette = this.palette();
    return this.recipe.flatMap(c => [c, palette[(palette.indexOf(c) + Math.max(1, this.recipe.length)) % palette.length]]);
  }
  private nextGem(): Color { const supply = this.supply(); return supply[this.feedCursor % supply.length]; }
  private route(direction: -1 | 1) {
    if (this.stage !== 'pick' || this.sortingReadyAt !== null) return;
    this.sorter.setDirection(direction); this.updateSortingControls();
  }
  private releaseGem(recover = false) {
    if (this.stage !== 'pick' || this.sortingReadyAt !== null) return;
    const snapshot = this.sorter.snapshot();
    if (snapshot.time - this.lastRelease < .3 || (recover && !this.returned.length)) return;
    const color = recover ? this.returned[0] : this.nextGem();
    if (this.sorter.release(color) === null) return;
    if (recover) { this.returned.shift(); this.sortingRecoveries++; } else this.feedCursor++;
    this.lastRelease = snapshot.time; this.updateSortingControls(); this.chime([440]);
  }
  private updateSortingControls() {
    if (this.stage !== 'pick') return;
    const state = this.sorter.snapshot(), ready = this.sortingReadyAt !== null;
    for (const [action, target] of [['route-order', -1], ['route-return', 1]] as const) {
      const button = this.console.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      button?.setAttribute('aria-pressed', String(state.target === target));
      if (button) button.disabled = ready;
    }
    const feed = this.console.querySelector<HTMLButtonElement>('[data-action="release-gem"]');
    if (feed) { feed.disabled = ready || state.gems.filter(g => g.state === 'moving').length >= 4; feed.setAttribute('aria-label', `Drop ${colors[this.nextGem()].name} gem`); }
    const preview = this.console.querySelector('.gf-next-gem');
    if (preview) preview.innerHTML = gemArt(this.nextGem(), true);
    const name = this.console.querySelector('.gf-next-name'); if (name) name.textContent = colors[this.nextGem()].name;
    const recipe = this.console.querySelector('.gf-recipe');
    if (recipe) recipe.innerHTML = this.recipe.map((color, i) => `<span class="gf-recipe-gem ${this.filled[i] ? 'gf-recipe-filled' : ''}" aria-label="${colors[color].name} ${this.filled[i] ? 'collected' : 'needed'}">${gemArt(color)}<i>${this.filled[i] ? '✓' : ''}</i></span>`).join('');
    const hint = this.console.querySelector('.gf-sort-hint'); if (hint) hint.textContent = this.sortingHint;
    const recover = this.console.querySelector<HTMLButtonElement>('[data-action="recover-gem"]');
    if (recover) { recover.hidden = !this.returned.length; recover.disabled = ready; recover.textContent = `Try ${colors[this.returned[0] || 'ruby'].name} again ↻`; }
    const returns = this.console.querySelector('.gf-return-gems');
    if (returns) returns.innerHTML = this.returned.slice(0, 3).map(color => `<i>${gemArt(color, true)}</i>`).join('');
    const count = this.console.querySelector('.gf-sort-count'); if (count) count.textContent = `${this.filled.filter(Boolean).length}/${this.recipe.length}`;
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
      if (element) {
        element.style.left = `${gem.x / SORTING_WORLD.width * 100}%`; element.style.top = `${gem.y / SORTING_WORLD.height * 100}%`;
        element.style.transform = `translate(-50%,-50%) rotate(${gem.angle}rad)`; element.classList.toggle('gf-gem-landed', gem.state !== 'moving');
      }
    }
    for (const [id, element] of this.sortingNodes) if (!state.gems.some(g => g.id === id)) { element.remove(); this.sortingNodes.delete(id); }
    const events = this.sorter.drainEvents();
    for (const event of events) {
      if (this.sortingReadyAt !== null) continue;
      const needed = this.recipe.findIndex((color, i) => color === event.color && !this.filled[i]);
      if (event.bin === 'order' && needed !== -1) {
        this.filled[needed] = true; this.sortingHint = `Lovely! ${colors[event.color].name} is in your recipe.`; this.chime([523, 659]);
        this.context.emit?.({ type: 'mechanic', name: 'gem-sorted', value: this.filled.filter(Boolean).length });
        if (this.filled.every(Boolean)) {
          this.sortingBonus = Math.max(0, this.recipe.length * 3 - this.sortingMistakes * 2);
          this.sortingReadyAt = state.time; this.sortingHint = 'Recipe ready! Off to the cutter…'; this.burst(35, 70, 18);
        }
      } else if (event.bin === 'return' && needed === -1) {
        this.sortingReturns++;
        this.sortingHint = 'Good sorting! That gem can sparkle in another gift.'; this.chime([440, 523]);
      } else {
        this.sortingMistakes++;
        if (this.returned.length < 8) this.returned.push(event.color);
        this.sortingHint = needed !== -1 ? 'Your recipe gem is safe! Tilt left and try it again.' : 'Oops, a different gem! Send it to the return tray.';
        this.chime([330, 392]);
      }
      this.announce(this.sortingHint);
    }
    if (events.length) this.updateSortingControls();
    if (this.sortingReadyAt !== null && state.time - this.sortingReadyAt > .55) {
      this.selected = this.recipe[0]; this.stage = 'cut'; this.cutTime = 0; this.render();
      this.announce('Beautiful sorting! Press Cut when the pointer is in the mint stripe.'); this.focusAction('cut');
    }
  }
  private cutterPosition() { return (Math.sin(this.cutTime * Math.PI / 1200 * this.cutterSpeed - Math.PI / 2) + 1) / 2; }
  private cut() {
    if (this.stage !== 'cut') return;
    const distance = Math.abs(this.cutterPosition() - .5);
    this.rating = distance <= .115 ? 3 : distance <= .24 ? 2 : 1;
    this.stage = 'polish'; this.polish = 0; this.render();
    this.burst(38, 58, this.rating === 3 ? 25 : 15);
    this.chime(this.rating === 3 ? [659, 784, 1047] : [523, 659]);
    this.announce(`${this.rating === 3 ? 'Perfect cut!' : 'Nicely cut!'} Rub the gem or hold Polish to make it shine.`);
    this.focusAction('polish');
  }
  private addPolish(amount: number) {
    if (this.stage !== 'polish' || !this.active()) return;
    this.polish = Math.min(100, this.polish + amount * (this.sparkleBoost ? 1.35 : 1));
    const fill = this.console.querySelector<HTMLElement>('.gf-polish-fill'); if (fill) fill.style.width = `${this.polish}%`;
    const meter = this.console.querySelector('[role="progressbar"]'); meter?.setAttribute('aria-valuenow', String(Math.round(this.polish)));
    const value = this.console.querySelector('.gf-polish-percent'); if (value) value.textContent = `${Math.round(this.polish)}%`;
    this.liveGem.style.setProperty('--shine', String(this.polish / 100));
    if (this.polish >= 100) {
      this.release(); this.stage = 'pack'; this.render(); this.burst(62, 56, 26); this.chime([659, 880, 1047]);
      this.announce('So shiny! Pack your gem to send a little happiness.'); this.focusAction('pack');
    }
  }
  private pack() {
    if (this.stage !== 'pack') return;
    this.stage = 'ship'; this.shipTime = 0; const earned = 15 + this.rating * 5 + this.sortingBonus;
    this.coins += earned; this.roundCoins += earned; this.shipped++; this.render();
    this.burst(85, 55, 34); this.chime([523, 659, 784, 1047]);
    this.announce(`Packed with love! ${earned} happy coins. ${this.shipped} of ${this.orderSize} gifts ready.`);
    this.context.emit?.({ type: 'mechanic', name: 'gem-packed', value: this.shipped });
  }
  private finishShipping() {
    if (this.shipped >= this.orderSize) {
      this.stage = 'done'; this.render(); this.save();
      this.context.finish({ won: true, level: this.level, title: 'A box full of happy!', description: `You sorted, cut and polished ${this.orderSize} beautiful gifts and earned ${this.roundCoins} happy coins. ${this.level === 1 ? 'Next up: two-gem rainbow recipes!' : this.level === 2 ? 'Next up: three-gem star recipes!' : 'Ready for another day at the factory?'}` });
    } else {
      this.stage = 'pick'; this.selected = null; this.rating = 0; this.polish = 0; this.prepareSorting(); this.render();
      this.announce(`Next gift! Sort ${this.recipe.map(color => colors[color].name).join(' and ')} into the order tray.`);
      this.focusAction('route-order');
    }
  }
  private focusAction(action: string) { this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus({ preventScroll: true }); }
  private render() {
    this.root.dataset.stage = this.stage;
    const stageIndex = ['pick', 'cut', 'polish', 'pack', 'ship', 'done'].indexOf(this.stage);
    this.world.style.setProperty('--station', String(Math.min(stageIndex, 3)));
    this.world.style.setProperty('--gem-x', `${[16, 38, 62, 85, 85, 85][stageIndex]}%`);
    // Percent translation is relative to the 190%-wide room. Clamp to retain
    // scenery across the whole phone viewport, including the packing station.
    this.world.style.setProperty('--mobile-pan', `${[0, -14, -34, -47, -47, -47][stageIndex]}%`);
    this.dayLabel.textContent = `Day ${String(this.level).padStart(2, '0')}`;
    this.coinsLabel.textContent = this.coins.toLocaleString();
    this.progress.innerHTML = `<span>${Array.from({ length: this.orderSize }, (_, i) => `<i class="${i < this.shipped ? 'gf-gift-filled' : ''}">${gift}</i>`).join('')}</span><strong>${this.shipped}<span> / ${this.orderSize}</span></strong>`;
    this.progress.setAttribute('aria-label', `${this.shipped} of ${this.orderSize} gifts packed`);
    const color = this.stage === 'ship' || this.stage === 'done' ? this.selected || this.wanted() : this.wanted();
    this.order.dataset.color = color;
    this.order.innerHTML = `<div class="gf-order-label"><span class="gf-order-dot"></span>${this.stage === 'ship' || this.stage === 'done' ? 'SPECIAL DELIVERY' : `A GIFT FOR ${customers[(this.shipped + this.level - 1) % customers.length].toUpperCase()}`}</div><div class="gf-order-body">${gemArt(color)}<div><strong>${this.recipe.length > 1 ? 'Rainbow gift' : colors[color].name}</strong><span>${this.stage === 'ship' || this.stage === 'done' ? 'Made with a little love' : this.recipe.length > 1 ? this.recipe.map(c => colors[c].name).join(' + ') : `Find the ${colors[color].shape}`}</span></div><span class="gf-order-check">${this.stage === 'ship' || this.stage === 'done' ? '✓' : '♡'}</span></div>`;
    this.liveGem.innerHTML = this.stage === 'ship' || this.stage === 'done' ? `<div class="gf-packed-present">${gift}</div>` : this.selected ? this.recipe.length === 1 ? gemArt(this.selected, this.stage === 'cut') : `<div class="gf-live-bundle">${this.recipe.map((c, i) => `<i style="left:${i * 32 - 12}%;top:${i % 2 * 10}%">${gemArt(c, this.stage === 'cut')}</i>`).join('')}</div>` : '';
    this.liveGem.classList.toggle('gf-gem-shining', this.stage === 'pack');
    this.liveGem.style.setProperty('--shine', String(this.polish / 100));
    const stepper = `<div class="gf-steps">${['Sort', 'Cut', 'Polish', 'Pack'].map((s, i) => `<span class="${i === Math.min(stageIndex, 3) ? 'gf-current-step' : i < stageIndex ? 'gf-finished-step' : ''}"><i>${i < stageIndex ? '✓' : i + 1}</i>${s}</span>`).join('')}</div>`;
    let inner = '';
    if (this.stage === 'pick') {
      inner = `<div class="gf-sorting-layout"><div class="gf-sorting-board" aria-hidden="true"><div class="gf-sorter-badge">SPARKLE SORTER <span>✦</span></div><div class="gf-sorting-chute"><i></i></div><div class="gf-ramp-pivot"></div><div class="gf-sorting-ramp"><i></i><i></i><i></i></div><div class="gf-sort-path gf-sort-path-left"><svg viewBox="0 0 24 24"><path d="M18 5 6 18m0-8v8h8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="gf-sort-path gf-sort-path-right"><svg viewBox="0 0 24 24"><path d="m6 5 12 13m-8 0h8v-8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="gf-sorting-gems"></div><div class="gf-sort-basket gf-order-basket"><span>♡ ORDER</span><b class="gf-sort-count"></b></div><div class="gf-sort-basket gf-return-basket"><span>↻ RETURN</span><div class="gf-return-gems"></div></div></div><div class="gf-sort-instructions"><h3>${this.level === 1 ? 'Roll a little happiness.' : this.level === 2 ? 'A rainbow recipe!' : 'Three gems. One happy gift.'}</h3><div class="gf-recipe" aria-label="Gems needed for this recipe"></div><div class="gf-next"><span>UP NEXT</span><i class="gf-next-gem"></i><strong class="gf-next-name"></strong></div><div class="gf-sort-controls"><button type="button" class="gf-route-button gf-route-order" data-action="route-order" aria-label="Tilt ramp left to order tray" aria-pressed="true">← Order</button><button type="button" class="gf-primary gf-drop-button" data-action="release-gem">Drop gem <span aria-hidden="true">↓</span></button><button type="button" class="gf-route-button gf-route-return" data-action="route-return" aria-label="Tilt ramp right to return tray" aria-pressed="false">Return →</button></div><p class="gf-sort-hint" role="status"></p><button type="button" class="gf-recover-button" data-action="recover-gem" hidden></button><span class="gf-sort-keyboard">← → tilt · ↓ drop</span></div></div>`;
    } else if (this.stage === 'cut') {
      inner = `<div class="gf-action-copy"><h3>Ready, steady… sparkle!</h3><p class="gf-instruction">Catch the mint stripe for a perfect cut.</p></div><div class="gf-cut-control"><div class="gf-timing-wrap"><span class="gf-timing-hint">NICE</span><div class="gf-timing-track" role="img" aria-label="Moving cut pointer. Aim for the center mint stripe."><span class="gf-good-zone"></span><span class="gf-perfect-zone"></span><i class="gf-cutter-needle"></i></div><span class="gf-timing-hint">PERFECT IN THE MIDDLE</span></div><button type="button" class="gf-primary gf-cut-button" data-action="cut"><span aria-hidden="true">✦</span> Cut gem <kbd>Space</kbd></button></div>`;
    } else if (this.stage === 'polish') {
      inner = `<div class="gf-action-copy"><h3>${this.rating === 3 ? 'Ooh, a perfect cut!' : this.rating === 2 ? 'What a lovely cut!' : 'A little gem of your own!'}</h3><p class="gf-instruction">Rub the gem, or hold the button. Make it shine!</p></div><div class="gf-polish-control"><div class="gf-polish-stone" role="img" aria-label="Rub this ${colors[this.selected!].name.toLowerCase()} to polish it">${gemArt(this.selected!)}</div><div class="gf-polish-meter"><div><span>SPARKLE POWER</span><strong class="gf-polish-percent">0%</strong></div><div class="gf-polish-track" role="progressbar" aria-label="Gem polish" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="gf-polish-fill"></span></div></div><button type="button" class="gf-primary gf-polish-button" data-action="polish"><span aria-hidden="true">✧</span> Hold to polish</button></div>`;
    } else if (this.stage === 'pack') {
      inner = `<div class="gf-action-copy"><h3>Look at that little beauty!</h3><p class="gf-instruction">${this.recipe.length > 1 ? `${this.recipe.length} gems in a rainbow gift.` : 'One shiny gem. One very happy friend.'}${this.sortingBonus ? ` +${this.sortingBonus} for careful sorting!` : ''}</p></div><div class="gf-pack-control"><div class="gf-quality-stars" aria-label="${this.rating} of 3 cut stars">${Array.from({ length: 3 }, (_, i) => `<span class="${i < this.rating ? 'gf-star-earned' : ''}">${star}</span>`).join('')}</div><span class="gf-reward">+${15 + this.rating * 5 + this.sortingBonus} <span>happy coins</span></span><button type="button" class="gf-primary gf-pack-button" data-action="pack">${gift} Pack with love</button></div>`;
    } else {
      inner = `<div class="gf-success"><span class="gf-success-stars">✦ ✧ ✦</span><h3>${this.stage === 'done' ? 'A box full of happy!' : ['Packed with love!', 'You made someone smile!', 'A little sparkle, delivered!'][(this.shipped - 1) % 3]}</h3><p>${this.stage === 'done' ? `${this.orderSize} beautiful gifts. All made by you.` : this.shipped < this.orderSize ? 'Here comes your next little gem…' : 'What a wonderful day at the factory.'}</p></div>`;
    }
    this.console.innerHTML = stepper + inner;
    this.sortingNodes.clear(); if (this.stage === 'pick') { this.updateSortingControls(); this.animateSorter(0); }
    this.pauseButton.disabled = this.stage === 'done';
  }
  private setUserPause(paused: boolean) {
    if (this.stopped || this.stage === 'done' || this.userPaused === paused) return;
    this.userPaused = paused; this.release(); this.last = 0;
    this.pauseOverlay.hidden = !paused; this.root.classList.toggle('gf-paused', paused || this.hostPaused);
    this.console.inert = paused; this.pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
    this.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    this.context.emit?.({ type: paused ? 'pause' : 'resume', name: 'factory-break' });
    if (paused) this.focusAction('resume');
    else { const action = this.stage === 'pick' ? 'route-order' : this.stage === 'ship' ? '' : this.stage; if (action) this.focusAction(action); }
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
    this.stage = 'pick'; this.shipped = 0; this.roundCoins = 0; this.selected = null; this.rating = 0; this.polish = 0;
    this.prepareSorting();
    this.hostPaused = false; this.release(); this.last = 0; this.cutTime = 0; this.shipTime = 0;
    this.particles.forEach(p => p.el.remove()); this.particles = []; this.pauseOverlay.hidden = true; this.console.inert = false;
    this.root.classList.remove('gf-paused'); this.pauseButton.textContent = 'Ⅱ'; this.pauseButton.setAttribute('aria-label', 'Pause game'); this.render();
  }
  next() { if (this.stopped || this.hostPaused) return; this.level = Math.min(999, this.level + 1); this.reset(); this.save(); }
  restart() { if (this.stopped || this.hostPaused) return; this.coins -= this.roundCoins; this.reset(); this.save(); }
  retry() { this.restart(); }
  isPlaying() { return !this.stopped && this.stage !== 'done' && !this.hostPaused && !this.userPaused; }
  pause() { if (!this.isPlaying()) return false; this.hostPaused = true; this.release(); this.root.classList.add('gf-paused'); return true; }
  resume() { if (!this.stopped) { this.hostPaused = false; this.last = 0; this.root.classList.toggle('gf-paused', this.userPaused); } }
  snapshot() { return { stage: this.stage, level: this.level, order: this.wanted(), completed: this.shipped, orderSize: this.orderSize, coins: this.coins, polish: Math.round(this.polish), rating: this.rating, hostPaused: this.hostPaused, userPaused: this.userPaused, holding: this.holding,
    recipe: [...this.recipe], collected: [...this.filled], nextGem: this.nextGem(), returns: [...this.returned], sortingMistakes: this.sortingMistakes, sortingRecoveries: this.sortingRecoveries, sortingReturns: this.sortingReturns, sortingBonus: this.sortingBonus, sorting: this.sorter.snapshot() }; }
  unmount() {
    // Save completed work, never a half-processed gem or held input.
    this.save(); this.stopped = true; this.release(); this.sorter.dispose(); cancelAnimationFrame(this.raf); this.abort.abort();
    this.particles.forEach(p => p.el.remove()); this.particles = []; void this.audio?.close().catch(() => {}); this.root.remove();
  }
}
