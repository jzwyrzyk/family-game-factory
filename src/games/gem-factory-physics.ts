import { World, Vec2, Box, Polygon, type Body } from 'planck';

export type FactoryGemColor = 'ruby' | 'sapphire' | 'emerald' | 'amethyst' | 'sunshine';
export type FactoryBin = 'order' | 'return';
export interface SortingGem {
  id: number; color: FactoryGemColor; x: number; y: number; angle: number;
  vx: number; vy: number; state: 'moving' | FactoryBin;
}
export interface SortingEvent { id: number; color: FactoryGemColor; bin: FactoryBin }
export interface SortingSnapshot {
  time: number; target: -1 | 1; angle: number; contacts: number; gemContacts: number; gems: SortingGem[];
}

/** The scene uses these same world dimensions for artwork and colliders. */
export const SORTING_WORLD = Object.freeze({ width: 12, height: 5.8, rampX: 6, rampY: 2.35, rampWidth: 4.9, gemSize: .82 });
const STEP = 1 / 60;
type Entry = { id: number; color: FactoryGemColor; body: Body; state: SortingGem['state']; born: number; landed: number };

/** A little physical sorter: gravity/contact, not a chosen button, decides the bin. */
export class GemSortingSimulation {
  private world = new World(Vec2(0, 12));
  private ramp: Body;
  private entries: Entry[] = [];
  private events: SortingEvent[] = [];
  private pending = new Map<number, FactoryBin>();
  private nextId = 1;
  private accumulator = 0;
  private time = 0;
  private target: -1 | 1 = -1;
  private contacts = 0;
  private gemContacts = 0;
  private disposed = false;

  constructor() {
    this.world.setContinuousPhysics(true);
    this.solid(6, 5.76, 12, .2);
    this.solid(.08, 3.1, .16, 6.2); this.solid(11.92, 3.1, .16, 6.2);
    for (const x of [2.15, 9.85]) {
      this.solid(x, 5.25, 3.1, .18);
      this.solid(x - 1.58, 4.75, .17, 1.15); this.solid(x + 1.58, 4.75, .17, 1.15);
      const sensor = this.world.createBody({ position: Vec2(x, 5.02), userData: { bin: x < 6 ? 'order' : 'return' } });
      sensor.createFixture(Box(1.4, .12), { isSensor: true });
    }
    this.ramp = this.world.createKinematicBody({ position: Vec2(SORTING_WORLD.rampX, SORTING_WORLD.rampY), angle: -.48, userData: { ramp: true } });
    this.ramp.createFixture(Box(SORTING_WORLD.rampWidth / 2, .12), { friction: .12, restitution: .12 });
    this.world.on('begin-contact', contact => {
      const a = contact.getFixtureA().getBody().getUserData() as { gem?: number; bin?: FactoryBin } | null;
      const b = contact.getFixtureB().getBody().getUserData() as { gem?: number; bin?: FactoryBin } | null;
      if (a?.gem || b?.gem) this.contacts++;
      if (a?.gem && b?.gem) this.gemContacts++;
      if (a?.gem && b?.bin) this.pending.set(a.gem, b.bin);
      if (b?.gem && a?.bin) this.pending.set(b.gem, a.bin);
    });
  }

  private solid(x: number, y: number, width: number, height: number) {
    this.world.createBody({ position: Vec2(x, y) }).createFixture(Box(width / 2, height / 2), { friction: .35, restitution: .18 });
  }

  setDirection(direction: -1 | 1) { if (!this.disposed) this.target = direction; }

  release(color: FactoryGemColor): number | null {
    if (this.disposed || this.entries.filter(e => e.state === 'moving').length >= 4) return null;
    const id = this.nextId++, x = 6 + ((id % 3) - 1) * .055;
    const body = this.world.createDynamicBody({ position: Vec2(x, .34), angularDamping: .12, linearDamping: .03, bullet: true, userData: { gem: id } });
    const radius = .36;
    const vertices = Array.from({ length: 8 }, (_, i) => Vec2(Math.cos(i * Math.PI / 4) * radius, Math.sin(i * Math.PI / 4) * radius));
    body.createFixture(Polygon(vertices), { density: color === 'emerald' ? 1.3 : 1, friction: .08, restitution: color === 'sapphire' ? .38 : .24 });
    this.entries.push({ id, color, body, state: 'moving', born: this.time, landed: 0 });
    return id;
  }

  step(seconds: number) {
    if (this.disposed) return;
    if (!Number.isFinite(seconds) || seconds < 0) throw Error('INVALID_FACTORY_STEP');
    this.accumulator += Math.min(.1, seconds);
    let count = 0;
    while (this.accumulator + 1e-10 >= STEP && count++ < 6) {
      this.accumulator = Math.max(0, this.accumulator - STEP); this.time += STEP;
      const difference = this.target * .48 - this.ramp.getAngle();
      this.ramp.setAngularVelocity(Math.max(-2.4, Math.min(2.4, difference * 10)));
      this.world.step(STEP, 8, 5);
      for (const entry of this.entries) {
        if (entry.state !== 'moving') continue;
        const bin = this.pending.get(entry.id);
        // A jam is recoverable. The watchdog can return a gem, never fulfill an order.
        if (bin || this.time - entry.born > 8 || entry.body.getPosition().y > 5.7) {
          entry.state = bin || 'return'; entry.landed = this.time;
          this.events.push({ id: entry.id, color: entry.color, bin: entry.state });
        }
      }
      this.pending.clear();
      this.entries = this.entries.filter(entry => {
        if (entry.state === 'moving' || this.time - entry.landed < .85) return true;
        this.world.destroyBody(entry.body); return false;
      });
    }
  }

  snapshot(): SortingSnapshot {
    return { time: this.time, target: this.target, angle: this.ramp.getAngle(), contacts: this.contacts, gemContacts: this.gemContacts,
      gems: this.entries.map(e => { const p = e.body.getPosition(), v = e.body.getLinearVelocity();
        return { id: e.id, color: e.color, x: p.x, y: p.y, angle: e.body.getAngle(), vx: v.x, vy: v.y, state: e.state };
      }) };
  }
  drainEvents(): SortingEvent[] { return this.events.splice(0); }
  dispose() { this.disposed = true; this.events = []; this.pending.clear(); }
}
