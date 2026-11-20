import {createIcon,setIconLabel,type IconName} from '../brand/icons';
import type { GameContext, GameInstance } from '../runtime/types';
import { createVehicle, TRACKS, type VehicleSnapshot, type VehicleOptions } from '../quality/physics';
import { createFixedClock, interpolateBody } from '../quality/clock';
import { createGameAudio } from '../quality/audio';
import { drawLandscape, drawPart, drawFlag, palette } from '../quality/art';
import {loadDrawnCar,drawCarBody,drawCarWheel,type DrawnCar} from '../drawing/rally';

type Mode = 'ready' | 'drive' | 'result';
interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number }
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** A small physical car. Only the simulation supplies position, wheel rotation and outcomes. */
export default class QualityHill implements GameInstance {
  private root = el('section', 'quality-game quality-hill');
  private canvas = el('canvas', 'q-canvas');
  private context2d: CanvasRenderingContext2D;
  private status = el('div', 'q-status');
  private saveNotice = el('div', 'q-tuning');
  private result = el('div', 'q-result');
  private distance = el('div', 'q-meter');
  private trackSelect = el('select', 'q-select');
  private pauseButton: HTMLButtonElement;
  private musicButton: HTMLButtonElement;
  private effectsButton: HTMLButtonElement;
  private driveButton: HTMLButtonElement;
  private audio = createGameAudio();
  private clock: ReturnType<typeof createFixedClock>;
  private resizeObserver: ResizeObserver;
  private onWindowResize = () => this.resize();
  private listeners = new AbortController();
  private simulation: ReturnType<typeof createVehicle>;
  private drawnCar: DrawnCar|null = null;
  private drawingOwner = '';
  private drawingRigId:string|null = null;
  private drawingLoading = false;
  private drawingUnavailable = false;
  private drawingError = '';
  private scene: VehicleSnapshot;
  private options: VehicleOptions;
  private mode: Mode = 'ready';
  private track = 'meadow';
  private best: Record<string, number> = {};
  private paint = '#e99b55';
  private pedals = new Map<number, 'go' | 'brake'>();
  private keys = new Set<string>();
  private particles: Particle[] = [];
  private view = { w: 1000, h: 560, scale: 56, x: 0, y: 0 };
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;
  private finished = false;
  private hostPaused = false;
  private manualPause = false;
  private storageBlocked = false;
  private elapsed = 0;
  private lastHud = 0;

  constructor(private mount: HTMLElement, private context: GameContext) {
    this.options = { enginePower: Number(context.config.enginePower), suspension: Number(context.config.suspension),
      wheelSize: Number(context.config.wheelSize), chassisMass: Number(context.config.chassisMass), grip: Number(context.config.grip) };
    const saved = context.persistence?.load();
    if (saved !== undefined && saved !== null) {
      try {
        const data = saved as { schema: string; track: string; best: Record<string, number>; paint: string; drawingRigId?:string|null };
        if (data.schema !== 'quality-hill-v1' || typeof data.track !== 'string' || !Object.hasOwn(TRACKS, data.track) || !data.best || typeof data.best !== 'object' || Array.isArray(data.best)
          || Object.entries(data.best).some(([k, v]) => !Object.hasOwn(TRACKS, k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000)
          || !['#e99b55', '#50a89a', '#b29bd5'].includes(data.paint)
          || (data.drawingRigId!==undefined&&data.drawingRigId!==null&&(typeof data.drawingRigId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(data.drawingRigId)))) throw Error('Unsupported saved ride');
        this.track = data.track; this.best = { ...data.best }; this.paint = data.paint;
        this.drawingRigId=data.drawingRigId??null;
      } catch { this.storageBlocked = true; }
    }
    // The saved game revision is authoritative. Missing means legacy progress;
    // explicit null always chooses the original car. Never consult a global picker.
    if(context.drawingRigId!==undefined)this.drawingRigId=context.drawingRigId;
    this.simulation = createVehicle(this.options, this.track); this.scene = this.simulation.snapshot();
    this.context2d = this.canvas.getContext('2d')!;
    this.root.dataset.qualityGame = 'hill'; this.root.setAttribute('aria-label', 'Junkyard Rally');
    const heading = el('div'); heading.append(el('div', 'q-eyebrow', 'SMALL WHEELS · BIG ADVENTURES'),
      el('h2', 'q-title', 'Junkyard Rally'), el('p', 'q-subtitle', 'Find your rhythm. Feel every bump.'));
    const tools = el('div', 'q-tools');
    this.musicButton = this.button('Music', 'q-chip', () => { void this.audio.unlock(); this.audio.setMusic(!this.audio.settings.music); this.audioLabels(); });
    this.effectsButton = this.button('Sound', 'q-chip', () => { void this.audio.unlock(); this.audio.setEffects(!this.audio.settings.effects); this.audioLabels(); });
    this.musicButton.setAttribute('aria-label', 'Toggle music'); this.effectsButton.setAttribute('aria-label', 'Toggle sound effects');
    this.pauseButton = this.button('', 'q-chip', () => this.togglePause()); this.pauseButton.append(createIcon('pause')); this.pauseButton.setAttribute('aria-label', 'Pause game');
    tools.append(this.musicButton, this.effectsButton, this.pauseButton); const top = el('div', 'q-topbar'); top.append(heading, tools);
    const mission = el('div', 'q-mission'); const copy = el('div', 'q-mission-copy');
    copy.append(el('b', '', 'Take the little car to camp'), el('span', '', 'Ease off at a crest. Brake to settle the wheels.'));
    for (const track of Object.values(TRACKS)) { const option = el('option', '', track.title); option.value = track.id; this.trackSelect.append(option); }
    this.trackSelect.value = this.track; this.trackSelect.setAttribute('aria-label', 'Choose a trail');
    this.trackSelect.addEventListener('change', () => { this.track = this.trackSelect.value; this.save(); this.restart(); });
    mission.append(el('div', 'q-mission-icon', '⚑'), copy, this.trackSelect);
    const stage = el('div', 'q-stage'); this.canvas.setAttribute('aria-label', 'Driving trail. Hold Space, right arrow or D to drive; left arrow or A to brake.'); this.canvas.tabIndex = 0;
    this.distance.style.cssText = 'position:absolute;right:14px;top:12px;background:#fffbecdf;border-radius:14px;padding:8px 12px;pointer-events:none';
    this.result.hidden = true; this.result.setAttribute('aria-live', 'polite'); this.status.setAttribute('role', 'status'); stage.append(this.canvas, el('div', 'q-stage-label', 'THE GREAT OUTDOORS'), this.distance, this.status, this.result);
    const toolbar = el('div', 'q-toolbar'), actions = el('div', 'q-edit-actions'), pedals = el('div', 'q-drive-controls');
    this.driveButton = this.button('Let’s drive', 'q-button q-primary', () => this.begin(), 'play');
    actions.append(this.driveButton, this.button('Try again', 'q-button', () => this.restart(), 'retry'));
    pedals.append(this.pedal('Brake', 'brake'), this.pedal('Go', 'go')); toolbar.append(actions, pedals);
    const garage = el('details', 'q-garage'); garage.style.cssText = 'padding:10px 16px;background:#f0efdf;border-top:1px solid #d8dfca';
    const summary = el('summary', '', 'Make this ride your own'); summary.style.cssText = 'font-size:13px;font-weight:700;cursor:pointer'; garage.append(summary);
    const choices = el('div', 'q-tuning'); choices.style.padding = '12px 0';
    for (const [name, paint] of [['Apricot', '#e99b55'], ['Sea green', '#50a89a'], ['Lilac', '#b29bd5']]) {
      const b = this.button(name, 'q-chip', () => { this.paint = paint; this.save(); this.audio.play('pick'); for (const child of choices.children) child.setAttribute('aria-pressed', String(child === b)); this.clock.invalidate(); });
      b.setAttribute('aria-pressed', String(this.paint === paint)); b.style.borderColor = paint; choices.append(b);
    }
    garage.append(choices, el('p', 'q-subtitle', 'Try a change in Live Remix. Your versions keep their own handling and trail.'));
    const prompts = el('div', 'q-edit-actions'); prompts.style.padding = '10px 0 2px';
    for (const prompt of ['Make the wheels bigger', 'Make the springs softer', 'Make the motor stronger', 'Make the car lighter']) {
      prompts.append(this.button(prompt, 'q-chip', () => window.dispatchEvent(new CustomEvent('factory-remix-request', { cancelable: true, detail: { game: 'hill', prompt } }))));
    }
    garage.append(prompts);
    const footer = el('div', 'q-footer'); footer.append(el('span', '', 'Hold Space / → / D to drive · ← / A brake · R retry · P pause'), el('span', '', 'Your own best. No timer to beat.'));
    this.saveNotice.hidden = true; this.saveNotice.setAttribute('role', 'status'); this.saveNotice.dataset.saveNotice = 'hill';
    this.root.append(top, mission, stage, toolbar, garage, this.saveNotice, footer);
    if (this.storageBlocked) {
      const notice = el('div', 'q-tuning'); notice.append(el('span', '', 'Your saved ride could not be opened. It is still safe.'),
        this.button('Use this new ride', 'q-button', () => { this.storageBlocked = false; if (this.save()) notice.remove(); })); this.root.append(notice);
    }
    mount.replaceChildren(this.root); this.audioLabels();
    this.clock = createFixedClock({ update: dt => this.update(dt), render: (alpha, elapsed) => this.render(alpha, elapsed),
      onPause: () => { this.clearInput(); this.audio.pause(); this.pauseButton.replaceChildren(createIcon('play')); this.pauseButton.setAttribute('aria-label', 'Resume game'); this.context.emit?.({ type: 'pause', name: 'hill' }); },
      onResume: () => { this.clearInput(); this.audio.resume(); this.pauseButton.replaceChildren(createIcon('pause')); this.pauseButton.setAttribute('aria-label', 'Pause game'); this.context.emit?.({ type: 'resume', name: 'hill' }); } });
    window.addEventListener('keydown', this.keydown, { signal: this.listeners.signal });
    window.addEventListener('keyup', this.keyup, { signal: this.listeners.signal });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(stage);
    window.addEventListener('resize', this.onWindowResize, { signal: this.listeners.signal });
    this.resize(); this.resetCamera(); this.hud(); this.clock.start();
    this.drawingOwner=String((window as any).FG?.store?.current()?.id||'');
    if(this.drawingRigId){
      this.drawingLoading=true;this.driveButton.disabled=true;this.trackSelect.disabled=true;this.hud();
      void loadDrawnCar(this.drawingOwner,this.drawingRigId).then(asset=>{
        if(this.disposed||this.drawingOwner!==String((window as any).FG?.store?.current()?.id||''))return;
        this.drawnCar=asset;this.drawingLoading=false;this.drawingUnavailable=false;
        this.simulation.dispose();this.simulation=createVehicle(this.options,this.track,asset.geometry);this.scene=this.simulation.snapshot();
        this.driveButton.disabled=false;this.trackSelect.disabled=false;this.resetCamera();this.hud();this.clock.invalidate();
      }).catch(error=>{
        if(this.disposed||this.drawingOwner!==String((window as any).FG?.store?.current()?.id||''))return;
        this.drawingLoading=false;this.drawingUnavailable=true;
        this.drawingError=error instanceof Error?error.message:'The saved drawing could not be opened.';
        this.hud();this.clock.invalidate();
      });
    }
  }

  private button(label: string, className: string, action: () => void, icon?: IconName) { const b = el('button', className, label); b.type = 'button'; if(icon)setIconLabel(b,icon,label); b.addEventListener('click', action); return b; }
  private pedal(label: string, name: 'go' | 'brake') {
    const b = el('button', 'q-pedal', label); b.type = 'button'; setIconLabel(b,name==='go'?'arrow':'stop',label); b.style.touchAction = 'none'; b.dataset.pedal = name;
    b.addEventListener('pointerdown', event => { event.preventDefault(); if (this.mode === 'ready') this.begin(); if (this.clock.paused || this.mode !== 'drive') return;
      void this.audio.unlock(); b.setPointerCapture(event.pointerId); this.pedals.set(event.pointerId, name); b.setAttribute('aria-pressed', 'true'); });
    const release = (e: PointerEvent) => { this.pedals.delete(e.pointerId); b.setAttribute('aria-pressed', 'false'); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(type, release);
    b.addEventListener('keydown', e => { if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (this.clock.paused || this.mode === 'result') return; if (this.mode === 'ready') this.begin(false); this.keys.add(name); } });
    b.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault(); this.keys.delete(name); } });
    b.addEventListener('blur', () => { this.keys.delete(name); }); return b;
  }
  private keydown = (e: KeyboardEvent) => {
    if (this.hostPaused) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return;
    // Space is a held primary action only on the stage, not on focused buttons or form controls.
    if (e.code === 'Space' && e.target === this.canvas) {
      e.preventDefault();
      if (!this.clock.paused) {
        if (this.mode === 'ready') this.begin(false);
        if (this.mode === 'drive') this.keys.add('Space');
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyR', 'KeyP', 'Escape'].includes(e.code)) e.preventDefault();
    if (!e.repeat && e.code === 'KeyR') { this.restart(); return; }
    if (!e.repeat && (e.code === 'KeyP' || e.code === 'Escape')) { this.togglePause(); return; }
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { if (this.mode === 'ready') this.begin(); if (!this.clock.paused) this.keys.add(e.code); }
  };
  private keyup = (e: KeyboardEvent) => { this.keys.delete(e.code); if(e.code === 'Space' || e.code === 'Enter'){ this.keys.delete('go'); this.keys.delete('brake'); } };
  private clearInput() { this.keys.clear(); this.pedals.clear(); this.root.querySelectorAll('[data-pedal]').forEach(b => b.setAttribute('aria-pressed', 'false')); }
  private audioLabels() { this.musicButton.setAttribute('aria-pressed', String(this.audio.settings.music)); this.effectsButton.setAttribute('aria-pressed', String(this.audio.settings.effects)); setIconLabel(this.musicButton,'music',this.audio.settings.music?'Music':'Music off'); setIconLabel(this.effectsButton,'volume',this.audio.settings.effects?'Sound':'Sound off'); }
  private save() {
    // A trail switch changes this.track before saving; the run still belongs to scene.track.
    this.best[this.scene.track] = Math.max(this.best[this.scene.track] || 0, this.scene.bestDistance);
    if (this.storageBlocked||this.drawingLoading||this.drawingUnavailable) return false;
    const ok = this.context.persistence?.save({ schema: 'quality-hill-v1', track: this.track, best: { ...this.best }, paint: this.paint,drawingRigId:this.drawingRigId }) ?? true;
    this.saveNotice.hidden = ok;
    if (!ok) this.saveNotice.textContent = 'Could not save on this device. Keep this page open to protect your changes; your earlier saved ride is safe.';
    return ok;
  }
  private begin(focus=true) { if (this.hostPaused||this.drawingLoading||this.drawingUnavailable) return; if (this.mode === 'result') this.restart(); if (this.mode !== 'ready') return; this.mode = 'drive'; this.clock.resume('user'); void this.audio.unlock(); this.audio.setScene('run'); setIconLabel(this.driveButton,'play','Driving'); this.driveButton.disabled = true; this.hud(); if(focus)this.canvas.focus({ preventScroll: true }); }
  private resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect(), w = Math.max(1, rect.width);
    const normalHeight = w < 600 ? Math.max(290, w * .75) : w * .54;
    // Geometry, not mutable pointer classification, determines whether pedals need screen room.
    const compactLandscape = window.innerWidth > window.innerHeight
      && window.innerHeight >= 600 && window.innerHeight <= 900 && w >= 600;
    const h = compactLandscape ? Math.min(normalHeight, Math.max(340, window.innerHeight * .48)) : normalHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1); this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.canvas.style.height = h + 'px';
    this.context2d.setTransform(dpr, 0, 0, dpr, 0, 0); this.view.w = w; this.view.h = h; this.view.scale = clamp(w / 17, 27, 65);
    this.clock?.invalidate();
  }
  private resetCamera() { const body = this.scene.bodies[0]; this.view.x = body.x - this.view.w * .3 / this.view.scale; this.view.y = body.y - this.view.h * .58 / this.view.scale; this.clock?.invalidate(); }
  private update(dt: number) {
    this.elapsed += dt;
    if (this.mode !== 'drive') return;
    const go = this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.keys.has('Space') || this.keys.has('go') || [...this.pedals.values()].includes('go');
    const brake = this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.keys.has('brake') || [...this.pedals.values()].includes('brake');
    this.simulation.step(dt, { throttle: go ? 1 : 0, brake }); this.scene = this.simulation.snapshot();
    const body = this.scene.bodies[0], look = this.reduced ? 0 : clamp(body.vx * .1, -1, 2);
    const targetX = body.x + look - this.view.w * .3 / this.view.scale, targetY = body.y - this.view.h * .58 / this.view.scale;
    this.view.x += (targetX - this.view.x) * (this.reduced ? .25 : .09); this.view.y += (targetY - this.view.y) * .07;
    this.audio.setMotor(go && !brake ? clamp(this.scene.speed / 13 + .22, 0, 1) : 0);
    for (const event of this.simulation.drainEvents()) {
      if (event.type === 'win') { this.audio.play('win'); this.audio.setScene('win'); }
      else if (event.type === 'lose') this.audio.play('fail');
      else this.audio.play(event.type === 'land' ? 'land' : 'impact', event.intensity);
      if (!this.reduced && (event.type === 'land' || event.type === 'impact')) for (let i = 0; i < 7 && this.particles.length < 48; i++) this.particles.push({ x: event.x, y: event.y, vx: (Math.random() - .5) * 3, vy: -Math.random() * 2, life: .5, size: .04 + Math.random() * .06 });
    }
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 3 * dt; p.life -= dt; } this.particles = this.particles.filter(p => p.life > 0);
    if (this.elapsed - this.lastHud > .1) { this.hud(); this.lastHud = this.elapsed; }
    if (this.scene.status !== 'playing') this.showResult();
  }
  private hud() {
    this.distance.textContent = `${Math.floor(this.scene.distance)} / ${Math.round(TRACKS[this.track].goalX - 2.5)} m · Best ${Math.floor(Math.max(this.best[this.track] || 0, this.scene.bestDistance))} m`;
    if(this.drawingLoading){this.status.textContent='Opening the saved car for this game…';return;}
    if(this.drawingUnavailable){this.status.textContent=this.drawingError+' Open Art Studio to check the saved parts or restore missing art, then reopen this game. Your saved ride has not changed.';return;}
    const text = this.mode === 'ready' ? 'Hold Go to begin. You can stop and try again whenever you like.' : this.mode === 'drive' ? (this.scene.grounded ? (this.scene.speed > 8 ? 'A crest ahead? Ease off and feel the landing.' : 'A little gas. A little brake. Find your rhythm.') : 'Wheels in the air! Ease off for a gentle landing.') : this.status.textContent;
    if (this.status.textContent !== text) this.status.textContent = text;
  }
  private showResult() {
    this.mode = 'result'; this.clearInput(); this.audio.setMotor(0); this.save(); this.hud();
    this.result.replaceChildren(); this.result.hidden = false;
    const resultIcon=el('div','q-result-icon');resultIcon.append(createIcon(this.scene.status==='won'?'check':'retry'));
    this.result.append(resultIcon, el('h3', '', this.scene.status === 'won' ? 'Hello, happy camper!' : 'One more little adventure?'), el('p', '', this.scene.reason));
    const actions = el('div', 'q-result-actions'); actions.append(this.button('Try again', 'q-button q-primary', () => { this.restart(); this.begin(); }),
      this.button('Keep exploring', 'q-button', () => this.next()));
    if (this.scene.status === 'won') actions.append(this.button('Finish this trip', 'q-button', () => {
      if (this.finished) return; this.finished = true; this.clock.pause('host'); this.context.finish({ won: true, level: Object.keys(TRACKS).indexOf(this.track) + 1, title: 'You made it to camp!', description: `${Math.floor(this.scene.distance)} metres of bumps, balance and brave little wheels.` });
    }));
    this.result.append(actions); this.status.textContent = `Your ride reached ${Math.floor(this.scene.bestDistance)} metres. Try a change and feel the difference.`;
    this.context.emit?.({ type: 'checkpoint', name: this.scene.status === 'won' ? 'camp-reached' : 'ride-ended', value: this.scene.distance });
  }
  private render(alpha: number, elapsed: number) {
    const c = this.context2d, v = this.view, s = v.scale, track = TRACKS[this.track];
    c.clearRect(0, 0, v.w, v.h); drawLandscape(c, v.w, v.h, v.x * s, this.reduced ? 0 : elapsed);
    if (this.track === 'moon') { c.fillStyle = '#62529225'; c.fillRect(0, 0, v.w, v.h); }
    const x = (n: number) => (n - v.x) * s, y = (n: number) => (n - v.y) * s;
    c.save(); c.beginPath(); c.moveTo(x(track.points[0].x), v.h + 50); for (const p of track.points) c.lineTo(x(p.x), y(p.y)); c.lineTo(x(track.points.at(-1)!.x), v.h + 50); c.closePath();
    const soil = c.createLinearGradient(0, v.h * .5, 0, v.h); soil.addColorStop(0, this.track === 'moon' ? '#b5b0c9' : '#d1b383'); soil.addColorStop(1, this.track === 'moon' ? '#8b89a5' : '#bd9568'); c.fillStyle = soil; c.fill();
    c.beginPath(); track.points.forEach((p, i) => i ? c.lineTo(x(p.x), y(p.y)) : c.moveTo(x(p.x), y(p.y))); c.lineWidth = 11; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = track.color; c.stroke();
    c.lineWidth = 2; c.strokeStyle = '#ffffff44'; c.stroke();
    for (let i = 1; i < track.points.length; i++) {
      const p = track.points[i]; if (x(p.x) < -100 || x(p.x) > v.w + 100) continue;
      c.fillStyle = '#685f4828'; for (let j = 0; j < 4; j++) { c.beginPath(); c.ellipse(x(p.x) - 15 + j * 16, y(p.y) + 23 + j % 2 * 15, 3 + j % 2 * 3, 2, -.2, 0, Math.PI * 2); c.fill(); }
      if (i % 2 === 0 && p.x < track.goalX - 2) { c.strokeStyle = '#688b6b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x(p.x) + 15, y(p.y) - 6); c.lineTo(x(p.x) + 12, y(p.y) - 17); c.moveTo(x(p.x) + 15, y(p.y) - 6); c.lineTo(x(p.x) + 21, y(p.y) - 13); c.stroke(); }
    }
    const goalPoint = track.points.find(p => p.x >= track.goalX)!; drawFlag(c, x(track.goalX), y(goalPoint.y) - 7, s * 1.7, 'CAMP');
    c.restore();
    if(this.drawingRigId&&!this.drawnCar){
      c.fillStyle='#ffffffd9';c.fillRect(0,0,v.w,v.h);c.fillStyle=palette.ink;c.textAlign='center';c.font='bold 18px system-ui';
      c.fillText(this.drawingUnavailable?'Check your saved car in Art Studio.':'Opening your own car…',v.w/2,v.h/2);return;
    }
    const bodies = this.scene.bodies.map(b => interpolateBody(b, alpha)), chassis = bodies[0];
    c.save(); c.strokeStyle = '#5e6d6d'; c.lineWidth = Math.max(2, s * .07);
    for (const wheel of bodies.slice(1)) {
      const custom=this.drawnCar?.geometry.wheels[wheel.id==='rear-wheel'?0:1];
      const dx = custom?.x??(wheel.id==='rear-wheel'?-.95:.95),dy=custom?.y??0;
      const ax = chassis.x + Math.cos(chassis.angle)*dx - Math.sin(chassis.angle)*dy;
      const ay = chassis.y + Math.sin(chassis.angle)*dx + Math.cos(chassis.angle)*dy;
      const bx = wheel.x, by = wheel.y; c.beginPath(); c.moveTo(x(ax), y(ay)); for (let i = 1; i < 8; i++) c.lineTo(x(ax + (bx - ax) * i / 8) + (i % 2 ? 3 : -3), y(ay + (by - ay) * i / 8)); c.lineTo(x(bx), y(by)); c.stroke();
    }
    for (const body of bodies) {
      c.save();c.translate(x(body.x),y(body.y));c.rotate(body.angle);
      const custom=this.drawnCar;
      if(custom&&body.id==='chassis')drawCarBody(c,custom,body.width*s,body.height*s);
      else if(custom&&(body.id==='rear-wheel'||body.id==='front-wheel'))drawCarWheel(c,custom,body.id==='rear-wheel'?0:1,body.width*s);
      else drawPart(c,body.kind,body.width*s,body.height*s,{time:elapsed,tint:this.paint});
      c.restore();
    }
    for (const p of this.particles) { c.globalAlpha = clamp(p.life * 2, 0, 1); c.fillStyle = '#e4d7bb'; c.beginPath(); c.arc(x(p.x), y(p.y), p.size * s, 0, Math.PI * 2); c.fill(); }
    c.restore();
    if (this.clock?.paused) { c.fillStyle = '#edf2e2b3'; c.fillRect(0, 0, v.w, v.h); c.fillStyle = palette.ink; c.textAlign = 'center'; c.font = 'bold 25px ui-rounded, system-ui'; c.fillText('Taking a little pit stop', v.w / 2, v.h / 2 - 8); c.font = '14px system-ui'; c.fillText('Press Play or P when you’re ready.', v.w / 2, v.h / 2 + 22); }
  }
  private togglePause() { if (this.hostPaused) return; this.manualPause = !this.manualPause; if (this.manualPause) this.clock.pause('user'); else this.clock.resume('user'); }
  isPlaying() { return !this.disposed && !this.finished && !this.hostPaused && !this.clock.paused && this.mode === 'drive'; }
  pause() { if (this.disposed || this.hostPaused) return false; this.hostPaused = true; this.clearInput(); this.clock.pause('host'); return true; }
  resume() { if (!this.hostPaused) return; this.hostPaused = false; this.clock.resume('host'); }
  restart() { if (this.disposed || this.hostPaused||this.drawingLoading||this.drawingUnavailable) return; this.manualPause = false; this.save(); this.clearInput(); this.simulation.dispose(); this.simulation = createVehicle(this.options, this.track,this.drawnCar?.geometry); this.scene = this.simulation.snapshot(); this.mode = 'ready'; this.finished = false; this.particles = []; this.result.hidden = true; setIconLabel(this.driveButton,'play','Let’s drive'); this.driveButton.disabled = false; this.audio.setMotor(0); this.audio.setScene('build'); this.clock.resume('user'); this.clock.resume('host'); this.resetCamera(); this.hud(); }
  retry() { this.restart(); }
  next() { const tracks = Object.keys(TRACKS); this.track = tracks[(tracks.indexOf(this.track) + 1) % tracks.length]; this.trackSelect.value = this.track; this.save(); this.restart(); }
  snapshot() { return { engine: 'quality-hill-v1', mode: this.mode, paused: this.clock.paused, hostPaused: this.hostPaused, track: this.track, options: { ...this.options }, paint: this.paint,
    distance: this.scene.distance, status: this.scene.status, time: this.scene.time, bodies: this.scene.bodies, best: { ...this.best }, grounded: this.scene.grounded, speed: this.scene.speed,
    inputActive: this.keys.size + this.pedals.size,drawingRigId:this.drawnCar?.rigId??null,requestedDrawingRigId:this.drawingRigId,drawingLoading:this.drawingLoading,drawingUnavailable:this.drawingUnavailable, performance: this.clock.stats, resources: { bodies: 3, joints: 2, particles: this.particles.length }, storageBlocked: this.storageBlocked }; }
  unmount() { if (this.disposed) return; this.disposed = true; this.save(); this.clock.dispose(); this.audio.dispose(); this.simulation.dispose(); this.resizeObserver.disconnect(); this.listeners.abort(); this.clearInput(); this.mount.replaceChildren(); }
}
