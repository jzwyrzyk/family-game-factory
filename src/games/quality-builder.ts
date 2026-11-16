import type { GameContext, GameInstance } from '../runtime/types';
import { PARTS, PART_LIST, type PartKind } from '../quality/parts';
import { validateBlueprint, cloneBlueprint, starterBlueprint, addPart, removePart, connectParts, rebindConnections, type Blueprint } from '../quality/blueprint';
import { createConstruction, MISSIONS } from '../quality/physics';
import { createFixedClock } from '../quality/clock';
import { createGameAudio } from '../quality/audio';
import { drawPart, drawGum, drawWorkshopBackground, drawLandscape, drawFlag } from '../quality/art';
import '../quality/quality.css';
type Mode = 'build' | 'run' | 'result';
type Simulation = ReturnType<typeof createConstruction>;
type Scene = ReturnType<Simulation['snapshot']>;
interface Save {
    schema: 'quality-construction-v1';
    mission: string;
    blueprint: Blueprint;
    builds: Record<string, Blueprint>;
}
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = document.createElement(tag); n.className = className; n.textContent = text; return n; };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const missionValues = () => Object.values(MISSIONS);
const missionById = (id: string) => missionValues().find(m => m.id === id) || missionValues()[0];
const budgetOf = (ctx: GameContext) => Number(ctx.config.gumBudget) || 10;
const normalAngle = (n: number) => ((n + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const trayNames: Record<PartKind, string> = { bottle: 'Bottle', carton: 'Box', can: 'Tin can', spoon: 'Spoon', plank: 'Plank', cone: 'Cone', wheel: 'Lid', fan: 'Fan', balloon: 'Balloon', capsule: 'Little buddy' };
/** Physical toy and editor. The saved blueprint is NEVER the transient simulated wreck. */
export default class QualityBuilder implements GameInstance {
    private root = el('section', 'quality-game quality-builder');
    private canvas = el('canvas', 'q-canvas');
    private backdrop = el('canvas');
    private backdropKey = '';
    private c: CanvasRenderingContext2D;
    private status = el('div', 'q-status');
    private saveNotice = el('div', 'q-tuning q-save-notice');
    private missionCopy = el('div', 'q-mission-copy');
    private gum = el('div', 'q-meter');
    private missionSelect = el('select', 'q-select');
    private modeLabel = el('div', 'q-stage-label', 'THE WORKSHOP');
    private tray = el('div', 'q-parts');
    private editActions = el('div', 'q-edit-actions');
    private runActions = el('div', 'q-run-actions');
    private result = el('div', 'q-result');
    private pauseButton: HTMLButtonElement;
    private musicButton: HTMLButtonElement;
    private effectsButton: HTMLButtonElement;
    private undoButton: HTMLButtonElement;
    private rotateButton: HTMLButtonElement;
    private glueButton: HTMLButtonElement;
    private detachButton: HTMLButtonElement;
    private removeButton: HTMLButtonElement;
    private testButton: HTMLButtonElement;
    private audio = createGameAudio();
    private clock: ReturnType<typeof createFixedClock>;
    private blueprint: Blueprint;
    private mission = 'delivery';
    private builds: Record<string, Blueprint> = {};
    private history: Blueprint[] = [];
    private selected: string | null = null;
    private joining = false;
    private joinTarget: string | null = null;
    private joinValid = false;
    private mode: Mode = 'build';
    private simulation: Simulation | undefined;
    private scene: Scene | undefined;
    private previous: Scene | undefined;
    private action = false;
    private pointerAction = false;
    private disposed = false;
    private hostFinished = false;
    private storageBlocked = false;
    private manualPause = false;
    private view = { w: 1000, h: 560, scale: 40, x: 0, y: 0 };
    private resizeObserver: ResizeObserver;
    private drag: {
        pointer: number;
        startX: number;
        startY: number;
        partX: number;
        partY: number;
        id: string;
        before: Blueprint;
        moved: boolean;
    } | undefined;
    private pointer: {
        x: number;
        y: number;
    } | null = null;
    private particles: Particle[] = [];
    private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    private lastMessage = 'Your machine is ready. Test it, or make it your own.';
    constructor(private mount: HTMLElement, private context: GameContext) {
        this.blueprint = starterBlueprint(this.mission);
        const loaded = context.persistence?.load();
        if (loaded !== undefined && loaded !== null) {
            try {
                this.load(loaded);
            }
            catch {
                this.storageBlocked = true;
                this.lastMessage = 'This saved build could not be opened. Choose Use example or Start fresh to make a new build.';
            }
        }
        this.c = this.canvas.getContext('2d')!;
        this.root.setAttribute('aria-label', 'Bubble Gum Builders workshop');
        this.root.dataset.qualityGame = 'gum';
        const top = el('div', 'q-topbar'), heading = el('div');
        heading.append(el('div', 'q-eyebrow', 'MAKE A LITTLE MISCHIEF'), el('h2', 'q-title', 'Bubble Gum Builders'), el('p', 'q-subtitle', 'A little junk. A little gum. A big idea.'));
        const tools = el('div', 'q-tools');
        this.musicButton = this.button('Music', 'q-chip', () => { void this.audio.unlock(); this.audio.setMusic(!this.audio.settings.music); this.updateAudio(); });
        this.musicButton.setAttribute('aria-label', 'Toggle music');
        this.effectsButton = this.button('Sound', 'q-chip', () => { void this.audio.unlock(); this.audio.setEffects(!this.audio.settings.effects); this.updateAudio(); });
        this.effectsButton.setAttribute('aria-label', 'Toggle sound effects');
        this.pauseButton = this.button('Ⅱ', 'q-chip', () => this.togglePause());
        this.pauseButton.setAttribute('aria-label', 'Pause game');
        tools.append(this.musicButton, this.effectsButton, this.pauseButton);
        top.append(heading, tools);
        const missionBar = el('div', 'q-mission');
        missionBar.append(el('div', 'q-mission-icon', '⚑'), this.missionCopy, this.gum);
        const stage = el('div', 'q-stage');
        this.canvas.width = 1000;
        this.canvas.height = 560;
        this.canvas.tabIndex = 0;
        this.canvas.setAttribute('role', 'application');
        this.canvas.setAttribute('aria-label', 'Machine workshop: select, drag, and connect parts');
        this.canvas.setAttribute('aria-describedby', 'quality-builder-instructions');
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.result.hidden = true;
        this.result.setAttribute('aria-live', 'polite');
        stage.append(this.canvas, this.modeLabel, this.status, this.result);
        const instructions = el('p', 'q-screenreader', 'Select a part in the tray to add it. Drag it, or tap a part then tap a new position. Arrow keys move the selected part. R rotates. Use [ and ] to select parts. G starts a connection, [ and ] choose the other part, and Enter sticks them together. Delete removes it. Escape cancels connecting. Space starts a test or boosts during a test.');
        instructions.id = 'quality-builder-instructions';
        for (const p of PART_LIST) {
            const b = this.button('', 'q-part builder-piece', () => this.add(p.id as PartKind));
            b.dataset.addPart = p.id;
            b.setAttribute('aria-label', 'Add ' + p.name);
            const thumb = el('canvas');
            thumb.width = 100;
            thumb.height = 104;
            const tc = thumb.getContext('2d')!;
            tc.translate(50, 51);
            const sc = Math.min(78 / p.width, 80 / p.height);
            drawPart(tc, p.spriteId, p.width * sc, p.height * sc);
            const lab = el('span', '', trayNames[p.id as PartKind]), material = el('small', '', p.id === 'carton' ? 'cardboard' : p.id === 'cone' ? 'paper' : p.material);
            b.append(thumb, lab, material);
            this.tray.append(b);
        }
        const toolbar = el('div', 'q-toolbar');
        this.rotateButton = this.button('↻ Rotate', 'q-button', () => this.rotate());
        this.rotateButton.setAttribute('aria-label', 'Rotate selected part');
        this.glueButton = this.button('● Gum', 'q-button', () => this.beginJoin());
        this.glueButton.setAttribute('aria-label', 'Connect selected part with gum');
        this.detachButton = this.button('Unstick', 'q-button', () => this.detach());
        this.detachButton.setAttribute('aria-label', 'Detach selected part');
        this.removeButton = this.button('Remove', 'q-button', () => this.remove());
        this.removeButton.setAttribute('aria-label', 'Remove selected part');
        this.undoButton = this.button('↶ Undo', 'q-button', () => this.undo());
        this.editActions.append(this.rotateButton, this.glueButton, this.detachButton, this.removeButton, this.undoButton);
        this.testButton = this.button('Test machine  ▶', 'q-button q-primary', () => this.test());
        this.testButton.dataset.action = 'test';
        const boost = this.button('Hold to boost ↑', 'q-button q-orange', () => { });
        boost.setAttribute('aria-label', 'Hold to boost');
        boost.onpointerdown = e => { if (this.mode !== 'run')
            return; e.preventDefault(); boost.setPointerCapture(e.pointerId); this.pointerAction = true; void this.audio.unlock(); };
        boost.onpointerup = boost.onpointercancel = boost.onlostpointercapture = () => { this.pointerAction = false; };
        boost.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.pointerAction = true;
        } };
        boost.onkeyup = () => { this.pointerAction = false; };
        boost.onblur = () => { this.pointerAction = false; };
        const back = this.button('Change my machine', 'q-button', () => this.edit());
        const retry = this.button('↻ Try again', 'q-button', () => this.test());
        this.runActions.append(back, retry, boost);
        this.runActions.hidden = true;
        toolbar.append(this.editActions, this.runActions, this.testButton);
        const footer = el('div', 'q-footer'), footerLeft = el('div');
        for (const m of missionValues()) {
            const o = el('option', '', m.title);
            o.value = m.id;
            this.missionSelect.append(o);
        }
        this.missionSelect.value = this.mission;
        this.missionSelect.setAttribute('aria-label', 'Choose construction challenge');
        this.missionSelect.onchange = () => this.chooseMission(this.missionSelect.value);
        const examples = this.button('Use example', '', () => this.reset('example'));
        const fresh = this.button('Start fresh', '', () => this.reset('empty'));
        footerLeft.append(this.missionSelect, examples, fresh);
        footer.append(footerLeft, el('span', '', 'Drag or tap to place · R rotates · G adds gum'));
        this.saveNotice.hidden = true;
        this.saveNotice.setAttribute('role', 'status');
        this.root.append(top, missionBar, stage, instructions, this.tray, toolbar, this.saveNotice, footer);
        mount.replaceChildren(this.root);
        this.canvas.onpointerdown = e => this.pointerDown(e);
        this.canvas.onpointermove = e => this.pointerMove(e);
        this.canvas.onpointerup = e => this.pointerUp(e);
        this.canvas.onpointercancel = e => { if (this.drag?.pointer === e.pointerId) this.cancelDrag(); };
        this.canvas.onlostpointercapture = e => { if (this.drag?.pointer === e.pointerId) this.cancelDrag(); };
        this.canvas.onkeydown = e => this.keyDown(e);
        this.canvas.onkeyup = e => { if (e.code === 'Space' || e.code === 'ArrowUp')
            this.action = false; };
        this.canvas.onblur = () => { this.action = false; if (this.cancelDrag()) this.refresh(); };
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(stage);
        this.resize();
        this.clock = createFixedClock({ update: dt => this.update(dt), render: (alpha, time) => this.draw(alpha, time), onPause: () => { this.action = this.pointerAction = false; this.audio.pause(); this.cancelDrag(); }, onResume: () => { this.audio.resume(); } });
        this.clock.start();
        this.updateAudio();
        this.refresh();
        this.message(this.lastMessage);
    }
    private button(text: string, classes: string, action: () => void) { const b = el('button', classes, text); b.type = 'button'; b.onclick = action; return b; }
    private load(value: unknown) {
        const s = value as Save;
        if (!s || s.schema !== 'quality-construction-v1' || !missionValues().some(m => m.id === s.mission))
            throw Error('Unknown build');
        const blueprint = validateBlueprint(s.blueprint), builds: Record<string, Blueprint> = {};
        if (s.builds !== undefined) {
            if (!s.builds || typeof s.builds !== 'object' || Array.isArray(s.builds) || Object.keys(s.builds).length > 4)
                throw Error('Invalid build count');
            for (const [id, bp] of Object.entries(s.builds)) {
                if (!missionValues().some(m => m.id === id))
                    throw Error('Unknown mission');
                builds[id] = validateBlueprint(bp);
            }
        }
        this.blueprint = blueprint;
        this.mission = s.mission;
        this.builds = builds;
        this.lastMessage = 'Welcome back. Your machine is just where you left it.';
    }
    private saved(): Save { const stable = this.drag?.before || this.blueprint; return { schema: 'quality-construction-v1', mission: this.mission, blueprint: cloneBlueprint(stable), builds: structuredClone({ ...this.builds, [this.mission]: stable }) }; }
    private save() {
        if (this.storageBlocked) return;
        const saved = this.saved(); this.builds = saved.builds;
        let ok = true;
        try { ok = this.context.persistence?.save(saved) !== false; } catch { ok = false; }
        this.saveNotice.hidden = ok;
        this.saveNotice.textContent = ok ? '' : 'This device could not save your latest changes. Keep this page open to protect your machine. Your earlier saved build is safe.';
    }
    private gumShortage() { return Math.max(0, this.blueprint.joints.length - budgetOf(this.context)); }
    private gumHelp() { const short = this.gumShortage(); return `Your machine needs ${short} more piece${short === 1 ? '' : 's'} of gum. Unstick a connection, or add more gum in Remix, then test again.`; }
    private friendlyError(error: unknown, fallback = 'That change could not be made. Your machine is safe. Try again.') {
        const text = error instanceof Error ? error.message : '';
        if (this.gumShortage() > 0 && (text.includes('gum') || text.includes('GUM'))) return this.gumHelp();
        if (['Choose two different, unconnected parts.', 'Move those parts a little closer.', 'No gum left. Unstick a connection or try using fewer parts.', 'Add a few parts before testing.', 'Add the little passenger so they can try your machine.'].includes(text)) return text;
        if (text === 'INVALID_JOINT_ANCHOR' || text === 'MISALIGNED_JOINT_ANCHORS') return 'Too far for that gum. Unstick this part before moving it farther.';
        return fallback;
    }
    private message(t: string) { this.lastMessage = t; this.status.textContent = t; }
    private commit(next: Blueprint, before = this.blueprint) { const valid = rebindConnections(next); this.history.push(cloneBlueprint(before)); if (this.history.length > 60)
        this.history.shift(); this.blueprint = valid; this.save(); this.refresh(); }
    private refresh() {
        this.updateJoinPreview();
        const m = missionById(this.mission);
        this.missionCopy.replaceChildren(el('b', '', m.title), el('span', '', m.instruction));
        this.gum.replaceChildren();
        const remaining = budgetOf(this.context) - this.blueprint.joints.length;
        this.gum.dataset.short = String(remaining < 0);
        this.gum.append(el('span', '', remaining < 0 ? `${-remaining} gum short` : `${remaining} gum left`));
        const dots = el('span', 'q-gum-dots');
        for (let i = 0; i < Math.min(10, remaining); i++)
            dots.append(el('i', 'q-gum-dot'));
        this.gum.append(dots);
        const building = this.mode === 'build';
        this.tray.hidden = !building;
        this.editActions.hidden = !building;
        this.testButton.hidden = !building;
        this.runActions.hidden = building;
        this.missionSelect.disabled = !building;
        this.modeLabel.textContent = building ? 'THE WORKSHOP' : this.mode === 'run' ? 'TEST RUN' : 'YOUR TEST';
        for (const b of this.tray.querySelectorAll('button'))
            b.disabled = this.storageBlocked || this.blueprint.parts.length >= 30;
        for (const b of [this.rotateButton, this.glueButton, this.detachButton, this.removeButton])
            b.disabled = !this.selected || !building || this.storageBlocked;
        this.glueButton.setAttribute('aria-pressed', String(this.joining));
        this.glueButton.textContent = this.joining ? 'Tap another part…' : '● Gum';
        this.undoButton.disabled = !this.history.length || !building || this.storageBlocked;
        this.testButton.disabled = !this.blueprint.parts.length || this.storageBlocked;
        this.root.dataset.mode = this.mode;
        this.root.dataset.selected = this.selected || '';
        this.root.dataset.mission = this.mission;
        this.canvas.dataset.partCount = String(this.blueprint.parts.length);
        this.clock?.invalidate();
    }
    private updateAudio() { this.musicButton.setAttribute('aria-pressed', String(this.audio.settings.music)); this.effectsButton.setAttribute('aria-pressed', String(this.audio.settings.effects)); this.musicButton.textContent = this.audio.settings.music ? '♫' : '♫ off'; this.effectsButton.textContent = this.audio.settings.effects ? '◖))' : '◖ off'; }
    private resize() { const rect = this.canvas.parentElement!.getBoundingClientRect(), w = Math.max(1, rect.width), h = w < 600 ? Math.max(260, w * .69) : Math.min(610, w * .54); this.canvas.style.height = h + 'px'; const dpr = Math.min(2, devicePixelRatio || 1); this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.view = { w, h, scale: Math.min(w / 24, h / 13.5), x: 0, y: 0 }; this.view.x = (w - 24 * this.view.scale) / 2; this.view.y = (h - 13.5 * this.view.scale) / 2; this.c.setTransform(dpr, 0, 0, dpr, 0, 0); this.backdropKey = ''; this.clock?.invalidate(); }
    private point(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - this.view.x) / this.view.scale, y: (e.clientY - r.top - this.view.y) / this.view.scale }; }
    private hit(x: number, y: number, touchRadius = 0) { const candidates = [...this.blueprint.parts].reverse().map(p => { const d = PARTS[p.kind], dx = x - p.x, dy = y - p.y, co = Math.cos(-p.angle), si = Math.sin(-p.angle), px = dx * co - dy * si, py = dx * si + dy * co; return { p, inside: Math.abs(px) <= d.width * .55 + .12 && Math.abs(py) <= d.height * .55 + .12, distance: Math.hypot(Math.max(0, Math.abs(px) - d.width / 2), Math.max(0, Math.abs(py) - d.height / 2)), center: Math.hypot(dx, dy) }; }); return candidates.find(p => p.inside)?.p || (touchRadius ? candidates.filter(p => p.distance < touchRadius).sort((a, b) => a.center - b.center)[0]?.p : undefined); }
    private add(kind: PartKind) { if (this.mode !== 'build' || this.storageBlocked)
        return; this.cancelDrag(); void this.audio.unlock(); try {
        const n = this.blueprint.parts.length;
        const next = addPart(this.blueprint, kind, 3 + (n % 6) * 1.35, 3 + Math.floor(n / 6) * 1.25);
        this.commit(next);
        this.selected = next.parts.at(-1)!.id;
        this.joining = false;
        this.audio.play('pick');
        this.message(PARTS[kind].name + ' added. Drag it, or tap where it should go.');
        this.refresh();
        this.canvas.focus({ preventScroll: true });
    }
    catch (e) {
        this.message(this.friendlyError(e));
    } }
    private pointerDown(e: PointerEvent) {
        if (this.mode !== 'build' || this.storageBlocked || e.button > 0 || this.drag)
            return;
        e.preventDefault();
        void this.audio.unlock();
        this.canvas.focus({ preventScroll: true });
        const q = this.point(e), p = this.hit(q.x, q.y, e.pointerType === 'touch' ? 20 / this.view.scale : 0);
        this.pointer = q;
        if (this.joining && this.selected) {
            if (p && p.id !== this.selected)
                this.connect(p.id);
            this.clock?.invalidate();
            return;
        }
        if (p) {
            this.selected = p.id;
            this.audio.play('pick', .6);
            this.drag = { pointer: e.pointerId, startX: q.x, startY: q.y, partX: p.x, partY: p.y, id: p.id, before: cloneBlueprint(this.blueprint), moved: false };
            this.canvas.setPointerCapture(e.pointerId);
            this.message(PARTS[p.kind].name + ' selected. Move it, rotate it, or add gum.');
        }
        else if (this.selected) {
            const next = cloneBlueprint(this.blueprint), part = next.parts.find(p => p.id === this.selected)!;
            part.x = clamp(q.x, .5, 23.5);
            part.y = clamp(q.y, .5, 11.5);
            try {
                this.commit(next);
                this.message('Moved. Your connections are ready for another test.');
            }
            catch {
                this.message('Too far for that gum. Unstick this part before moving it farther.');
            }
        }
        this.refresh();
    }
    private pointerMove(e: PointerEvent) { const q = this.point(e); this.pointer = q; if (this.joining) {
        const p = this.hit(q.x, q.y);
        this.joinTarget = p && p.id !== this.selected ? p.id : null;
        this.updateJoinPreview();
        this.clock?.invalidate();
    } if (!this.drag || this.drag.pointer !== e.pointerId)
        return; const d = this.drag; if (!d.moved && Math.hypot(q.x - d.startX, q.y - d.startY) * this.view.scale < 4)
        return; d.moved = true; const p = this.blueprint.parts.find(p => p.id === d.id)!; p.x = clamp(d.partX + q.x - d.startX, .5, 23.5); p.y = clamp(d.partY + q.y - d.startY, .5, 11.5); this.clock?.invalidate(); }
    private pointerUp(e: PointerEvent) { const d = this.drag; if (!d || d.pointer !== e.pointerId)
        return; this.drag = undefined; if (d.moved) {
        try {
            this.commit(this.blueprint, d.before);
            this.message('Moved. Ready to try it?');
        }
        catch {
            this.blueprint = d.before;
            this.message('That position did not fit. Your last position is restored.');
        }
    } if (this.canvas.hasPointerCapture(e.pointerId))
        this.canvas.releasePointerCapture(e.pointerId); this.clock?.invalidate(); }
    private cancelDrag() {
        const drag = this.drag;
        if (!drag) return false;
        this.drag = undefined;
        if (drag.moved) this.blueprint = drag.before;
        if (this.canvas.hasPointerCapture(drag.pointer)) this.canvas.releasePointerCapture(drag.pointer);
        this.clock?.invalidate();
        return true;
    }
    private keyDown(e: KeyboardEvent) {
        if (this.mode === 'run') {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.action = true;
                void this.audio.unlock();
            }
            return;
        }
        if (this.mode !== 'build' || this.storageBlocked)
            return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (this.drag && (['Escape', 'Delete', 'Backspace', '[', ']', 'Enter'].includes(e.key) || e.key.startsWith('Arrow') || ['r', 'g'].includes(e.key.toLowerCase()) || e.code === 'Space')) {
            this.cancelDrag(); this.refresh();
            if (e.key === 'Escape') { e.preventDefault(); this.message('Move cancelled. Your last position is restored.'); return; }
        }
        if (e.code === 'Space') {
            e.preventDefault();
            this.test();
            return;
        }
        if (e.key === 'Escape') {
            this.joining = false;
            this.joinTarget = null;
            this.refresh();
            return;
        }
        if (e.key === '[' || e.key === ']') {
            e.preventDefault();
            this.cyclePart(e.key === '[' ? -1 : 1);
            return;
        }
        if (e.key === 'Enter' && this.joining && this.joinTarget) {
            e.preventDefault();
            this.connect(this.joinTarget);
            return;
        }
        if (e.key.toLowerCase() === 'g') {
            e.preventDefault();
            this.beginJoin();
            return;
        }
        if (!this.selected)
            return;
        if (e.key.toLowerCase() === 'r') {
            e.preventDefault();
            this.rotate(e.shiftKey ? -1 : 1);
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.remove();
            return;
        }
        if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            const next = cloneBlueprint(this.blueprint), p = next.parts.find(x => x.id === this.selected)!;
            const step = e.shiftKey ? .5 : .2;
            p.x = clamp(p.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), .5, 23.5);
            p.y = clamp(p.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0), .5, 11.5);
            try {
                this.commit(next);
            }
            catch {
                this.message('Too far for that gum. Unstick this part before moving it farther.');
            }
        }
    }
    private rotate(direction = 1) { if (!this.selected || this.mode !== 'build')
        return; this.cancelDrag(); const n = cloneBlueprint(this.blueprint); n.parts.find(p => p.id === this.selected)!.angle = normalAngle(n.parts.find(p => p.id === this.selected)!.angle + direction * Math.PI / 12); this.commit(n); this.audio.play('pick', .5); this.canvas.focus({ preventScroll: true }); this.message('Rotated. Press Shift + R to turn the other way.'); }
    private beginJoin() { if (!this.selected || this.mode !== 'build')
        return; this.cancelDrag(); this.joining = !this.joining; this.joinTarget = null; if (this.joining) {
        const a = this.blueprint.parts.find(p => p.id === this.selected)!;
        this.joinTarget = this.blueprint.parts.filter(p => p.id !== a.id && !this.blueprint.joints.some(j => (j.a === a.id && j.b === p.id) || (j.b === a.id && j.a === p.id))).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0]?.id || null;
    } this.message(this.joining ? 'Tap a second part to stick it. Keyboard: [ or ] to choose, Enter to stick.' : 'Connection cancelled.'); this.refresh(); this.canvas.focus({ preventScroll: true }); }
    private cyclePart(direction: number) { const list = this.blueprint.parts.filter(p => !this.joining || p.id !== this.selected); if (!list.length)
        return; const id = this.joining ? this.joinTarget : this.selected, index = list.findIndex(p => p.id === id), next = list[(index + direction + list.length) % list.length]; if (this.joining)
        this.joinTarget = next.id;
    else
        this.selected = next.id; this.pointer = { x: next.x, y: next.y }; this.message(PARTS[next.kind].name + (this.joining ? ' is the other part. Enter adds gum.' : ' selected. Arrow keys move it; R turns it.')); this.refresh(); }
    private updateJoinPreview() { this.joinValid = false; if (!this.joining || !this.selected || !this.joinTarget || this.blueprint.joints.length >= budgetOf(this.context))
        return; try {
        connectParts(this.blueprint, this.selected, this.joinTarget);
        this.joinValid = true;
    }
    catch { } }
    private connect(id: string) { if (!this.selected)
        return; try {
        if (this.blueprint.joints.length >= budgetOf(this.context))
            throw Error('No gum left. Unstick a connection or try using fewer parts.');
        const next = connectParts(this.blueprint, this.selected, id);
        this.commit(next);
        this.audio.play('stick');
        this.message('Stuck together! Test it and see how that connection holds.');
        this.joining = false;
        this.joinTarget = null;
        this.refresh();
    }
    catch (err) {
        this.message(this.friendlyError(err));
    } }
    private detach() { if (!this.selected)
        return; this.cancelDrag(); const n = cloneBlueprint(this.blueprint); n.joints = n.joints.filter(j => j.a !== this.selected && j.b !== this.selected); if (n.joints.length === this.blueprint.joints.length) {
        this.message('This part has no gum connections yet.');
        return;
    } this.commit(n); this.audio.play('snap', .4); this.message('Unstuck. The gum is back in your supply.'); }
    private remove() { if (!this.selected)
        return; this.cancelDrag(); this.commit(removePart(this.blueprint, this.selected)); this.selected = null; this.joining = false; this.refresh(); this.message('Part removed. Undo brings it back.'); }
    private undo() { if (this.cancelDrag()) { this.refresh(); this.message('Move cancelled. Your last position is restored.'); return; } const bp = this.history.pop(); if (!bp)
        return; this.blueprint = bp; this.selected = null; this.joining = false; this.save(); this.refresh(); this.message('One step back. Your machine is safe.'); }
    private reset(which: 'example' | 'empty') { this.edit(); this.storageBlocked = false; const next = which === 'example' ? starterBlueprint(this.mission) : { version: 1 as const, parts: [], joints: [] }; this.commit(next); this.selected = null; this.refresh(); this.message(which === 'example' ? 'An example to play with. Change anything you like.' : 'A fresh workbench. Pick a part to begin.'); }
    private chooseMission(id: string) { if (this.mode !== 'build' || this.storageBlocked) {
        this.missionSelect.value = this.mission;
        return;
    } this.cancelDrag(); this.builds[this.mission] = cloneBlueprint(this.blueprint); this.mission = missionById(id).id; this.blueprint = this.builds[this.mission] ? cloneBlueprint(this.builds[this.mission]) : this.mission === 'free' ? { version: 1, parts: [], joints: [] } : starterBlueprint(this.mission); this.selected = null; this.history = []; this.joining = false; this.missionSelect.value = this.mission; this.save(); this.refresh(); this.message('Your other builds are saved. Here is a new challenge.'); }
    private test() { if (this.storageBlocked || !this.blueprint.parts.length)
        return; this.cancelDrag(); if (this.gumShortage() > 0) { this.message(this.gumHelp()); this.refresh(); return; } void this.audio.unlock(); this.save(); this.simulation?.dispose(); try {
        this.simulation = createConstruction(cloneBlueprint(this.blueprint), { jointStrength: Number(this.context.config.jointStrength) || 1, gumBudget: budgetOf(this.context), gravity: Number(this.context.config.gravity) || 10, thrust: Number(this.context.config.thrust) || 1 }, this.mission);
        this.scene = this.simulation.snapshot();
        this.previous = this.scene;
        this.mode = 'run';
        this.selected = null;
        this.joining = false;
        this.hostFinished = false;
        this.action = this.pointerAction = false;
        this.manualPause = false;
        this.clock?.resume('user');
        this.pauseButton.textContent = 'Ⅱ';
        this.pauseButton.setAttribute('aria-label', 'Pause game');
        this.result.hidden = true;
        this.particles = [];
        this.audio.setScene('run');
        this.message('Your machine is moving. Hold Boost or Space for an extra push.');
        this.refresh();
        this.canvas.focus({ preventScroll: true });
    }
    catch (e) {
        this.mode = 'build';
        this.message(this.friendlyError(e));
        this.refresh();
    } }
    private edit() { this.cancelDrag(); this.simulation?.dispose(); this.simulation = undefined; this.scene = this.previous = undefined; this.mode = 'build'; this.action = this.pointerAction = false; this.result.hidden = true; this.particles = []; this.audio.setMotor(0); this.audio.setScene('build'); this.manualPause = false; this.clock?.resume('user'); this.pauseButton.textContent = 'Ⅱ'; this.pauseButton.setAttribute('aria-label', 'Pause game'); this.refresh(); this.message('Your original machine is ready to change.'); this.canvas.focus({ preventScroll: true }); }
    private update(dt: number) {
        if (this.mode === 'run' && this.simulation) {
            this.previous = this.scene;
            this.simulation.step(dt, { action: this.action || this.pointerAction });
            this.scene = this.simulation.snapshot();
            this.audio.setMotor(this.scene.bodies.some(b => b.kind === 'fan') ? ((this.action || this.pointerAction) ? .6 : .2) : 0);
            const progress = this.scene.goalProgress, mission = missionById(this.mission);
            this.modeLabel.textContent = progress > 0 && mission.holdSeconds >= 1 ? `HOLD IT · ${(progress * mission.holdSeconds).toFixed(1)} / ${mission.holdSeconds}s` : `TEST RUN · ${this.scene.time.toFixed(1)}s`;
            if (this.scene.joints.some(j => !j.broken && j.stress > .65))
                this.audio.play('stretch', .5);
            for (const event of this.simulation.drainEvents()) {
                const ev = event as {
                    type: string;
                    x?: number;
                    y?: number;
                    intensity?: number;
                    material?: string;
                };
                if (ev.type === 'win' || ev.type === 'lose')
                    continue;
                const sound = ev.type === 'snap' ? 'snap' : ['metal', 'plastic', 'wood'].includes(ev.material || '') ? ev.material! : 'impact';
                this.audio.play(sound, ev.intensity || .5);
                if (!this.reduced && (ev.type === 'snap' || ev.type === 'impact' || ev.type === 'land'))
                    this.burst(ev.x || 0, ev.y || 0, ev.type === 'snap' ? '#eb8eb3' : '#c6ad82', ev.type === 'snap' ? 8 : 4);
            }
            if (this.scene.status !== 'playing')
                this.showResult(this.scene.status === 'won', this.scene.reason);
        }
        for (const p of this.particles) {
            p.life -= dt;
            p.vy += 7 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
        this.particles = this.particles.filter(p => p.life > 0).slice(-80);
    }
    private burst(x: number, y: number, color: string, count: number) { for (let i = 0; i < count; i++) {
        const a = (i + .2) * Math.PI * 2 / count;
        this.particles.push({ x, y, vx: Math.cos(a) * (1 + i % 3), vy: Math.sin(a) * 2 - 2, life: .55 + (i % 3) * .1, color, size: 2 + i % 3 });
    } }
    private showResult(won: boolean, reason: string) {
        this.mode = 'result';
        this.action = this.pointerAction = false;
        this.audio.setMotor(0);
        this.audio.setScene(won ? 'win' : 'build');
        this.audio.play(won ? 'win' : 'fail');
        this.message(reason || 'What would you like to try next?');
        this.result.replaceChildren(el('div', 'q-result-icon', won ? '✦' : '↻'), el('h3', '', won ? 'Your idea worked!' : 'Another idea to try?'), el('p', '', reason || 'Change a part, move a connection, or give it another go.'));
        const actions = el('div', 'q-result-actions');
        actions.append(this.button('Change my machine', 'q-button q-primary', () => this.edit()), this.button('Try again', 'q-button', () => this.test()));
        if (won && this.mission !== 'free')
            actions.append(this.button('Finish challenge →', 'q-button q-orange', () => { if (this.hostFinished)
                return; this.hostFinished = true; this.pause(); this.context.finish({ won: true, level: Math.max(1, missionValues().filter(m => m.id !== 'free').findIndex(m => m.id === this.mission) + 1), title: 'Your machine made it!', description: reason }); }));
        this.result.append(actions);
        this.result.hidden = false;
        this.refresh();
    }
    private draw(alpha: number, time: number) {
        if (this.disposed)
            return;
        const c = this.c, v = this.view;
        c.clearRect(0, 0, v.w, v.h);
        this.drawBackdrop();
        c.save();
        c.translate(v.x, v.y);
        const s = v.scale, m = missionById(this.mission);
        this.paintTerrain(m, s);
        this.paintGoal(m, s);
        if (this.mode === 'build') {
            for (const j of this.blueprint.joints) {
                const a = this.blueprint.parts.find(p => p.id === j.a), b = this.blueprint.parts.find(p => p.id === j.b);
                if (!a || !b)
                    continue;
                drawGum(c, a.x * s, a.y * s, b.x * s, b.y * s, 0, this.selected === j.a || this.selected === j.b);
            }
            for (const p of this.blueprint.parts) {
                const d = PARTS[p.kind];
                this.partShadow(p.x, p.y, d.width, d.height, s);
                c.save();
                c.translate(p.x * s, p.y * s);
                c.rotate(p.angle);
                drawPart(c, d.spriteId, d.width * s, d.height * s, { selected: p.id === this.selected, preview: this.joining && p.id === this.joinTarget ? (this.joinValid ? 'valid' : 'invalid') : undefined, time: this.reduced ? 0 : time });
                c.restore();
            }
            if (this.joining && this.selected) {
                const p = this.blueprint.parts.find(x => x.id === this.selected), q = this.blueprint.parts.find(x => x.id === this.joinTarget) || this.pointer;
                if (p && q) {
                    c.save();
                    c.setLineDash([6, 6]);
                    c.strokeStyle = this.joinTarget ? (this.joinValid ? '#298f78' : '#c36a4b') : '#cf6393';
                    c.lineWidth = 3;
                    c.beginPath();
                    c.moveTo(p.x * s, p.y * s);
                    c.lineTo(q.x * s, q.y * s);
                    c.stroke();
                    c.restore();
                }
            }
            if (!this.blueprint.parts.length) {
                c.textAlign = 'center';
                c.fillStyle = '#729185';
                c.font = `700 ${Math.max(14, s * .47)}px sans-serif`;
                c.fillText('What will you make?', 12 * s, 5.6 * s);
                c.font = `${Math.max(11, s * .3)}px sans-serif`;
                c.fillText('Choose a piece from your junk drawer.', 12 * s, 6.35 * s);
            }
        }
        else if (this.scene) {
            for (const j of this.scene.joints)
                if (!j.broken) {
                    const link = this.blueprint.joints.find(x => x.id === j.id), a = this.scene.bodies.find(b => b.id === link?.a), b = this.scene.bodies.find(b => b.id === link?.b);
                    drawGum(c, (a?.x ?? j.a.x) * s, (a?.y ?? j.a.y) * s, (b?.x ?? j.b.x) * s, (b?.y ?? j.b.y) * s, j.stress);
                }
            for (const b of this.scene.bodies) {
                const prev = this.previous?.bodies.find(p => p.id === b.id), t = this.mode === 'run' ? alpha : 1, x = prev ? prev.x + (b.x - prev.x) * t : b.x, y = prev ? prev.y + (b.y - prev.y) * t : b.y, a = prev ? prev.angle + normalAngle(b.angle - prev.angle) * t : b.angle;
                const d = PARTS[b.kind as PartKind];
                this.partShadow(x, y, b.width, b.height, s);
                c.save();
                c.translate(x * s, y * s);
                c.rotate(a);
                drawPart(c, d?.spriteId || b.kind, b.width * s, b.height * s, { time: this.reduced ? 0 : time, power: this.mode === 'run' ? (this.action || this.pointerAction ? 1 : .4) : 0 });
                c.restore();
            }
        }
        for (const p of this.particles) {
            c.globalAlpha = Math.min(1, p.life * 3);
            c.fillStyle = p.color;
            c.fillRect(p.x * s, p.y * s, p.size, p.size);
        }
        c.restore();
        c.globalAlpha = 1;
        if (this.manualPause) {
            c.fillStyle = '#203c4b33';
            c.fillRect(0, 0, v.w, v.h);
            c.textAlign = 'center';
            c.fillStyle = '#fff9e7';
            c.font = 'bold 28px sans-serif';
            c.fillText('Paused', v.w / 2, v.h / 2);
        }
    }
    private drawBackdrop() { const v = this.view, key = `${this.mode === 'build' ? 'workshop' : 'outdoors'}:${this.canvas.width}:${this.canvas.height}`; if (key !== this.backdropKey) {
        this.backdrop.width = this.canvas.width;
        this.backdrop.height = this.canvas.height;
        const c = this.backdrop.getContext('2d')!;
        c.scale(this.backdrop.width / v.w, this.backdrop.height / v.h);
        if (this.mode === 'build')
            drawWorkshopBackground(c, v.w, v.h);
        else
            drawLandscape(c, v.w, v.h);
        this.backdropKey = key;
    } this.c.drawImage(this.backdrop, 0, 0, v.w, v.h); }
    private partShadow(x: number, y: number, w: number, h: number, s: number) { const c = this.c; c.save(); c.fillStyle = '#294c3e14'; c.beginPath(); c.ellipse((x + .05) * s, (y + h * .5 + .1) * s, w * s * .46, Math.max(2, h * s * .055), 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    private paintTerrain(m: unknown, s: number) { const c = this.c, data = m as {
        terrain?: Array<{
            x: number;
            y: number;
            width?: number;
            height?: number;
            w?: number;
            h?: number;
            angle?: number;
        }>;
    }; if (!data.terrain)
        return; for (const t of data.terrain) {
        const w = t.width ?? t.w ?? 0, h = t.height ?? t.h ?? 0;
        c.save();
        c.translate((t.x + w / 2) * s, (t.y + h / 2) * s);
        c.rotate(t.angle || 0);
        c.fillStyle = '#c4a574';
        c.strokeStyle = '#9b865f';
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(-w * s / 2, -h * s / 2, w * s, h * s, 3);
        c.fill();
        c.stroke();
        c.fillStyle = '#779c77';
        c.fillRect(-w * s / 2, -h * s / 2, w * s, Math.min(6, h * s));
        c.restore();
    } }
    private paintGoal(m: unknown, s: number) { const data = m as {
        id: string;
        goal?: {
            x: number;
            y: number;
            width?: number;
            height?: number;
            w?: number;
            h?: number;
        };
    }; if (data.id === 'free' || !data.goal)
        return; const c = this.c, g = data.goal, w = g.width ?? g.w ?? 2, h = g.height ?? g.h ?? 2; c.save(); c.fillStyle = '#f8d77b22'; c.strokeStyle = '#8cac7a'; c.lineWidth = 2; c.setLineDash([6, 7]); c.beginPath(); c.roundRect(g.x * s, g.y * s, w * s, h * s, 12); c.fill(); c.stroke(); c.setLineDash([]); drawFlag(c, (g.x + w) * s, (g.y + h) * s, Math.max(23, s * .95), 'HERE'); c.restore(); }
    private togglePause() { this.manualPause = !this.manualPause; if (this.manualPause)
        this.pause();
    else
        this.resume(); }
    pause() { this.manualPause = true; this.action = this.pointerAction = false; this.clock.pause('user'); this.pauseButton.textContent = '▶'; this.pauseButton.setAttribute('aria-label', 'Resume game'); }
    resume() { this.manualPause = false; this.clock.resume('user'); this.pauseButton.textContent = 'Ⅱ'; this.pauseButton.setAttribute('aria-label', 'Pause game'); }
    next() { const ms = missionValues().filter(m => m.id !== 'free'), i = ms.findIndex(m => m.id === this.mission); this.edit(); this.chooseMission(ms[(i + 1) % ms.length].id); }
    restart() { this.test(); }
    retry() { this.test(); }
    snapshot() { return { ...this.saved(), level: Math.max(1, missionValues().filter(m => m.id !== 'free').findIndex(m => m.id === this.mission) + 1), mode: this.mode, selected: this.selected, paused: this.clock.paused, storageBlocked: this.storageBlocked, joining: this.joining, joinTarget: this.joinTarget, dragActive: !!this.drag, resources: { parts: this.blueprint.parts.length, joints: this.blueprint.joints.length, particles: this.particles.length, canvasPixels: this.canvas.width * this.canvas.height + this.backdrop.width * this.backdrop.height }, parts: structuredClone(this.blueprint.parts), joints: structuredClone(this.blueprint.joints), gumRemaining: budgetOf(this.context) - this.blueprint.joints.length, simulation: this.scene ? structuredClone(this.scene) : null, clock: this.clock.stats, audio: this.audio.settings }; }
    unmount() { if (this.disposed)
        return; this.cancelDrag(); this.save(); this.disposed = true; this.clock.dispose(); this.audio.dispose(); this.simulation?.dispose(); this.resizeObserver.disconnect(); this.root.remove(); }
}
