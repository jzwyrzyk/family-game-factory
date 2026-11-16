import { World, Vec2, Box, Circle, Polygon, Edge, WeldJoint, RevoluteJoint, WheelJoint, type Body, type Joint } from 'planck';
import { PARTS, type Point, type PartKind, type PartDefinition, type Material } from './parts';
import { validateBlueprint, type Blueprint, type GumConnection, worldPoint } from './blueprint';

export const PHYSICS_VERSION = 'planck-1.4.2-quality-1';
export const FIXED_DT = 1 / 60;
export interface Rect { x: number; y: number; width: number; height: number; angle?: number }
export interface Mission {
  id: string; title: string; instruction: string; goal: Rect;
  terrain: Rect[]; bounds: Rect; holdSeconds: number; maxSeconds: number;
}
export const MISSIONS: Readonly<Record<string, Mission>> = {
  delivery: { id: 'delivery', title: 'Special delivery', instruction: 'Carry your little passenger to the green landing mat.',
    goal: { x: 18.5, y: 6.5, width: 4, height: 5.5 }, terrain: [{ x: -2, y: 12, width: 28, height: 2 }],
    bounds: { x: 0, y: 0, width: 24, height: 13.5 }, holdSeconds: .15, maxSeconds: 30 },
  loft: { id: 'loft', title: 'Up to the clouds', instruction: 'Lift your passenger through the cloud hoop. Where should the fan point?',
    goal: { x: 8, y: 1.8, width: 8, height: 2.6 }, terrain: [{ x: -2, y: 12, width: 28, height: 2 }],
    bounds: { x: 0, y: 0, width: 24, height: 13.5 }, holdSeconds: .1, maxSeconds: 25 },
  bridge: { id: 'bridge', title: 'Mind the gap', instruction: 'Keep your passenger over the gap for three seconds. Watch where the gum bends.',
    goal: { x: 10.2, y: 5.5, width: 3.8, height: 5.15 }, terrain: [{ x: -2, y: 10.5, width: 8.5, height: 5 }, { x: 17.5, y: 10.5, width: 8.5, height: 5 }],
    bounds: { x: 0, y: 0, width: 24, height: 13.5 }, holdSeconds: 3, maxSeconds: 20 },
  free: { id: 'free', title: 'Junkyard playground', instruction: 'Try an idea. Launch it, change it, and see what happens.',
    goal: { x: 18.5, y: 6.5, width: 4, height: 5.5 }, terrain: [{ x: -2, y: 12, width: 28, height: 2 }],
    bounds: { x: 0, y: 0, width: 24, height: 13.5 }, holdSeconds: Infinity, maxSeconds: Infinity },
};
export interface BodySnapshot {
  id: string; kind: PartKind | 'chassis'; x: number; y: number; angle: number;
  previousX: number; previousY: number; previousAngle: number;
  vx: number; vy: number; width: number; height: number; mass: number;
}
export interface JointSnapshot { id: string; partA?: string; partB?: string; a: Point; b: Point; stress: number; broken: boolean; kind: 'gum' | 'axle' | 'suspension' }
export interface PhysicsEvent { type: 'impact' | 'snap' | 'land' | 'win' | 'lose'; x: number; y: number; intensity: number; material?: Material; id?: string }
export interface SimulationSnapshot {
  version: string; time: number; bodies: BodySnapshot[]; joints: JointSnapshot[];
  status: 'playing' | 'won' | 'lost'; reason: string; goal: Rect; bounds: Rect;
  goalProgress: number; brokenCount: number;
}
export interface ConstructionOptions { jointStrength?: number; gumBudget?: number; gravity?: number; thrust?: number }
export interface ConstructionInput { action?: boolean }
export interface ConstructionSimulation {
  step(dt: number, input?: ConstructionInput): void; snapshot(): SimulationSnapshot;
  drainEvents(): PhysicsEvent[]; dispose(): void;
}
type Entry = { id: string; kind: PartKind | 'chassis'; body: Body; width: number; height: number; previous: { x: number; y: number; angle: number }; definition?: PartDefinition };
type Connection = { blueprint: GumConnection; joint: Joint | null; stress: number; overload: number; lastA: Point; lastB: Point };
const bounded = (v: unknown, fallback: number, min: number, max: number) => {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error('PHYSICS_SETTING_OUT_OF_RANGE');
  return v;
};
function bodySnapshot(e: Entry): BodySnapshot {
  const p = e.body.getPosition(), v = e.body.getLinearVelocity();
  return { id: e.id, kind: e.kind, x: p.x, y: p.y, angle: e.body.getAngle(), previousX: e.previous.x, previousY: e.previous.y, previousAngle: e.previous.angle,
    vx: v.x, vy: v.y, width: e.width, height: e.height, mass: e.body.getMass() };
}
function previous(e: Entry) { const p = e.body.getPosition(); e.previous = { x: p.x, y: p.y, angle: e.body.getAngle() }; }
function mass(body: Body, value: number) {
  const prior = body.getMass(); body.setMassData({ mass: value, center: body.getLocalCenter(), I: body.getInertia() * value / Math.max(.001, prior) });
}
function rectangle(world: World, r: Rect) {
  const body = world.createBody({ position: Vec2(r.x + r.width / 2, r.y + r.height / 2), angle: r.angle || 0, userData: { terrain: true } });
  body.createFixture(Box(r.width / 2, r.height / 2), { friction: .85, restitution: .05 }); return body;
}
function setupImpacts(world: World, events: PhysicsEvent[], clock: () => number) {
  const recent = new Map<string, number>();
  world.on('post-solve', (contact, impulse) => {
    const a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody();
    const ad = a.getUserData() as any, bd = b.getUserData() as any;
    const strength = Math.max(...impulse.normalImpulses);
    if (strength < .6) return;
    const key = [ad?.id || 'ground', bd?.id || 'ground'].sort().join(':');
    if (clock() - (recent.get(key) ?? -10) < .15) return;
    recent.set(key, clock());
    const p = (ad?.terrain ? b : a).getPosition();
    if (events.length < 48) events.push({ type: 'impact', x: p.x, y: p.y, intensity: Math.min(1, strength / 7), material: ad?.material || bd?.material || 'wood' });
  });
}
function partBody(world: World, p: Blueprint['parts'][number]): Entry {
  const d = PARTS[p.kind], body = world.createDynamicBody({ position: Vec2(p.x, p.y), angle: p.angle,
    linearDamping: .08, angularDamping: .15, bullet: p.kind === 'capsule', userData: { id: p.id, material: d.material } });
  const c = d.collider;
  const shape = c.type === 'box' ? Box(c.width / 2, c.height / 2) : c.type === 'circle' ? Circle(c.radius) : Polygon(c.vertices.map(v => Vec2(v.x, v.y)));
  body.createFixture(shape, { density: 1, friction: d.friction, restitution: d.restitution }); mass(body, d.mass);
  return { id: p.id, kind: p.kind, body, width: d.width, height: d.height, previous: { x: p.x, y: p.y, angle: p.angle }, definition: d };
}
function stepCount(dt: number, accumulator: number) {
  if (!Number.isFinite(dt) || dt < 0) throw Error('INVALID_SIMULATION_DT');
  accumulator += Math.min(.15, dt);
  const count = Math.min(8, Math.floor((accumulator + 1e-10) / FIXED_DT));
  return { count, remainder: Math.max(0, accumulator - count * FIXED_DT) % FIXED_DT };
}

export function createConstruction(value: Blueprint, options: ConstructionOptions = {}, missionId = 'delivery'): ConstructionSimulation {
  const blueprint = validateBlueprint(value), mission = MISSIONS[missionId];
  if (!mission) throw Error('UNKNOWN_MISSION');
  const strength = bounded(options.jointStrength, 1, .5, 2), budget = bounded(options.gumBudget, 10, 4, 20);
  const gravity = bounded(options.gravity, 10, 4, 16), thrust = bounded(options.thrust, 1, .5, 1.5);
  if (blueprint.joints.length > budget) throw Error('This build uses more gum than you have. Remove a connection or change the gum supply.');
  if (!blueprint.parts.length) throw Error('Add a few parts before testing.');
  if (missionId !== 'free' && !blueprint.parts.some(p => p.kind === 'capsule')) throw Error('Add the little passenger so they can try your machine.');
  const world = new World(Vec2(0, gravity)); world.setContinuousPhysics(true);
  mission.terrain.forEach(r => rectangle(world, r));
  const entries = blueprint.parts.map(p => partBody(world, p));
  const get = (id: string) => entries.find(e => e.id === id)!;
  const connections: Connection[] = blueprint.joints.map(j => {
    const a = get(j.a).body, b = get(j.b).body, p = worldPoint(blueprint.parts.find(p => p.id === j.a)!, j.anchorA);
    const joint = j.kind === 'axle'
      ? world.createJoint(new RevoluteJoint({ collideConnected: false }, a, b, Vec2(p.x, p.y)))!
      : world.createJoint(new WeldJoint({ collideConnected: false, frequencyHz: 7 * Math.sqrt(strength), dampingRatio: .85 }, a, b, Vec2(p.x, p.y)))!;
    return { blueprint: j, joint, stress: 0, overload: 0, lastA: { ...p }, lastB: { ...p } };
  });
  let time = 0, accumulator = 0, goalTime = 0, disposed = false, status: SimulationSnapshot['status'] = 'playing', reason = '';
  const events: PhysicsEvent[] = []; setupImpacts(world, events, () => time);
  const finish = (next: 'won' | 'lost', text: string) => {
    if (status !== 'playing') return; status = next; reason = text;
    const p = entries.find(e => e.kind === 'capsule')?.body.getPosition() || Vec2(12, 7);
    events.push({ type: next === 'won' ? 'win' : 'lose', x: p.x, y: p.y, intensity: 1 });
  };
  const tick = (input: ConstructionInput) => {
    entries.forEach(previous); time += FIXED_DT;
    for (const e of entries) {
      const d = e.definition!;
      if (d.thrust) {
        const direction = e.body.getWorldVector(Vec2(0, -1)), velocity = e.body.getLinearVelocity();
        const forwardSpeed = Math.max(0, velocity.x * direction.x + velocity.y * direction.y);
        const force = d.thrust * thrust * (input.action ? 1.18 : 1) * Math.max(.18, 1 - forwardSpeed / 8);
        e.body.applyForceToCenter(Vec2(direction.x * force, direction.y * force), true);
      }
      if (d.lift) e.body.applyForceToCenter(Vec2(0, -d.lift), true);
    }
    world.step(FIXED_DT, 10, 8);
    for (const c of connections) {
      if (!c.joint) continue;
      const f = c.joint.getReactionForce(60), torque = Math.abs(c.joint.getReactionTorque(60));
      const demand = Math.max(Math.hypot(f.x, f.y) / (105 * strength), torque / (75 * strength));
      c.stress = c.stress * .82 + demand * .18;
      c.overload = c.stress > 1 ? c.overload + FIXED_DT : Math.max(0, c.overload - FIXED_DT * 2);
      c.lastA = { ...c.joint.getAnchorA() }; c.lastB = { ...c.joint.getAnchorB() };
      if (c.overload > .12) {
        world.destroyJoint(c.joint); c.joint = null;
        events.push({ type: 'snap', id: c.blueprint.id, x: c.lastA.x, y: c.lastA.y, intensity: Math.min(1, c.stress / 2), material: 'rubber' });
      }
    }
    const passenger = entries.find(e => e.kind === 'capsule');
    if (missionId !== 'free' && passenger) {
      const p = passenger.body.getPosition(), g = mission.goal;
      const inside = p.x >= g.x && p.x <= g.x + g.width && p.y >= g.y && p.y <= g.y + g.height;
      goalTime = time > .3 && inside ? goalTime + FIXED_DT : 0;
      if (goalTime + 1e-8 >= mission.holdSeconds) finish('won', missionId === 'bridge' ? 'Your bridge held the passenger above the gap!' : missionId === 'loft' ? 'Your passenger flew through the clouds!' : 'Your passenger reached the landing mat!');
      else if (p.y > 16 || p.x < -6 || p.x > 30 || p.y < -5) finish('lost', 'Your passenger went off course. Change the balance or where the fan points, then try again.');
      else if (time >= mission.maxSeconds) finish('lost', 'The passenger has not reached the goal yet. Your build is safe—change one thing and try again.');
    }
  };
  return {
    step(dt, input = {}) { if (disposed || status !== 'playing') return; const s = stepCount(dt, accumulator); accumulator = s.remainder; for (let i = 0; i < s.count && status === 'playing'; i++) tick(input); },
    snapshot() { return { version: PHYSICS_VERSION, time, bodies: entries.map(bodySnapshot), joints: connections.map(c => ({ id: c.blueprint.id, partA: c.blueprint.a, partB: c.blueprint.b,
      a: c.joint ? { ...c.joint.getAnchorA() } : { ...get(c.blueprint.a).body.getWorldPoint(c.blueprint.anchorA) },
      b: c.joint ? { ...c.joint.getAnchorB() } : { ...get(c.blueprint.b).body.getWorldPoint(c.blueprint.anchorB) },
      stress: Math.min(3, c.stress), broken: !c.joint, kind: c.blueprint.kind })), status, reason, goal: { ...mission.goal }, bounds: { ...mission.bounds },
      goalProgress: missionId === 'free' ? 0 : Math.min(1, goalTime / mission.holdSeconds), brokenCount: connections.filter(c => !c.joint).length }; },
    drainEvents() { return events.splice(0); },
    dispose() { disposed = true; events.length = 0; },
  };
}

export interface Track { id: string; title: string; description: string; points: Point[]; goalX: number; gravity: number; color: string }
export const TRACKS: Readonly<Record<string, Track>> = {
  meadow: { id: 'meadow', title: 'Meadow trail', description: 'Find your rhythm over the rolling hills.', goalX: 62, gravity: 10, color: '#83b684',
    points: [{ x: -12, y: 11 }, { x: 8, y: 11 }, { x: 14, y: 9.5 }, { x: 19, y: 8.3 }, { x: 25, y: 11 }, { x: 31, y: 10.3 }, { x: 37, y: 8.8 }, { x: 43, y: 8.8 }, { x: 49, y: 11 }, { x: 55, y: 10 }, { x: 62, y: 10 }, { x: 76, y: 10 }] },
  ridge: { id: 'ridge', title: 'Rocky ridge', description: 'Ease off before a crest and land on your wheels.', goalX: 68, gravity: 10, color: '#c39b7b',
    points: [{ x: -12, y: 11 }, { x: 7, y: 11 }, { x: 12, y: 8.5 }, { x: 17, y: 7 }, { x: 22, y: 11 }, { x: 27, y: 9.3 }, { x: 32, y: 9.3 }, { x: 36, y: 7.6 }, { x: 41, y: 11.2 }, { x: 46, y: 10 }, { x: 53, y: 7.8 }, { x: 59, y: 10.7 }, { x: 68, y: 10.7 }, { x: 82, y: 10.7 }] },
  moon: { id: 'moon', title: 'Moon bounce', description: 'Long floating jumps. Try a softer landing.', goalX: 65, gravity: 5.2, color: '#a9a5cf',
    points: [{ x: -12, y: 11 }, { x: 8, y: 11 }, { x: 14, y: 8.5 }, { x: 21, y: 10.5 }, { x: 27, y: 8.5 }, { x: 33, y: 11 }, { x: 39, y: 8 }, { x: 46, y: 10.5 }, { x: 53, y: 8.5 }, { x: 59, y: 10.5 }, { x: 65, y: 10.5 }, { x: 80, y: 10.5 }] },
};
export interface VehicleOptions { enginePower?: number; suspension?: number; wheelSize?: number; chassisMass?: number; grip?: number }
export interface VehicleInput { throttle?: number; brake?: boolean }
export interface VehicleSnapshot extends SimulationSnapshot { distance: number; bestDistance: number; tilt: number; speed: number; grounded: boolean; track: string }
export interface VehicleSimulation { step(dt: number, input?: VehicleInput): void; snapshot(): VehicleSnapshot; drainEvents(): PhysicsEvent[]; dispose(): void }
export function createVehicle(options: VehicleOptions = {}, trackId = 'meadow'): VehicleSimulation {
  const track = TRACKS[trackId]; if (!track) throw Error('UNKNOWN_TRACK');
  const power = bounded(options.enginePower, 1, .5, 2), frequency = bounded(options.suspension, 4, 2, 8);
  const radius = bounded(options.wheelSize, .52, .35, .8), weight = bounded(options.chassisMass, 1, .5, 2), grip = bounded(options.grip, 1, .5, 1.5);
  const world = new World(Vec2(0, track.gravity)), terrain = world.createBody({ userData: { terrain: true } });
  for (let i = 1; i < track.points.length; i++) terrain.createFixture(Edge(Vec2(track.points[i - 1].x, track.points[i - 1].y), Vec2(track.points[i].x, track.points[i].y)), { friction: .9, restitution: .03 });
  const body = world.createDynamicBody({ position: Vec2(2.5, 9.65), angularDamping: .3, linearDamping: .02, bullet: true, userData: { id: 'chassis', material: 'metal' } });
  body.createFixture(Polygon([Vec2(-1.45, .32), Vec2(1.45, .32), Vec2(1.45, -.05), Vec2(.65, -.55), Vec2(-.7, -.55), Vec2(-1.45, -.1)]), { density: 1, friction: .4, restitution: .08 });
  mass(body, 3.5 * weight);
  const entries: Entry[] = [{ id: 'chassis', kind: 'chassis', body, width: 2.9, height: 1.25, previous: { x: 2.5, y: 9.65, angle: 0 } }];
  const springs: WheelJoint[] = [];
  for (const [id, x] of [['rear-wheel', 1.55], ['front-wheel', 3.45]] as const) {
    const wheel = world.createDynamicBody({ position: Vec2(x, 10.4), angularDamping: .04, bullet: true, userData: { id, material: 'rubber' } });
    wheel.createFixture(Circle(radius), { density: 1, friction: 1.15 * grip, restitution: .05 }); mass(wheel, .65);
    entries.push({ id, kind: 'wheel', body: wheel, width: radius * 2, height: radius * 2, previous: { x, y: 10.4, angle: 0 } });
    springs.push(world.createJoint(new WheelJoint({ motorSpeed: 0, maxMotorTorque: 18 * power, enableMotor: true, frequencyHz: frequency, dampingRatio: .75, collideConnected: false }, body, wheel, wheel.getPosition(), Vec2(0, 1)))!);
  }
  const events: PhysicsEvent[] = []; let time = 0, accumulator = 0, disposed = false, status: SimulationSnapshot['status'] = 'playing', reason = '', best = 0, grounded = false, wasGrounded = false, upsideDown = 0;
  setupImpacts(world, events, () => time);
  const wheelTouchesGround = () => entries.slice(1).some(e => { for (let c = e.body.getContactList(); c; c = c.next) if (c.contact.isTouching() && (c.other?.getUserData() as any)?.terrain) return true; return false; });
  const finish = (next: 'won' | 'lost', text: string) => { if (status !== 'playing') return; status = next; reason = text; const p = body.getPosition(); events.push({ type: next === 'won' ? 'win' : 'lose', x: p.x, y: p.y, intensity: 1 }); };
  function tick(input: VehicleInput) {
    entries.forEach(previous); time += FIXED_DT;
    const throttle = bounded(input.throttle, 0, -1, 1);
    for (const spring of springs) {
      spring.enableMotor(!!input.brake || Math.abs(throttle) > .01);
      spring.setMotorSpeed(input.brake ? 0 : throttle * 17);
      // A modest, predictable torque curve prevents a hard digital press from
      // instantly flipping the car, while engine power still changes climbing.
      const speed = Math.abs(body.getLinearVelocity().x);
      const torque = power * (6.5 + 1.5 * Math.max(0, 1 - speed / 8));
      spring.setMaxMotorTorque(input.brake ? 24 : torque * Math.min(1, time / .35));
    }
    if (!grounded && Math.abs(throttle) > .01) body.applyTorque(throttle * 1.8, true);
    world.step(FIXED_DT, 10, 6);
    grounded = wheelTouchesGround();
    if (grounded && !wasGrounded && time > .5 && Math.abs(entries[0].body.getLinearVelocity().y) > .3) { const p = body.getPosition(); events.push({ type: 'land', x: p.x, y: p.y, intensity: .5 }); }
    wasGrounded = grounded;
    const p = body.getPosition(); best = Math.max(best, p.x - 2.5);
    const inverted = Math.cos(body.getAngle()) < -.45;
    upsideDown = inverted && !grounded ? upsideDown + FIXED_DT : Math.max(0, upsideDown - FIXED_DT * 2);
    if (p.x >= track.goalX) finish('won', 'You made it to camp! Try a different setup or a new trail.');
    else if (p.y > 23 || p.x < -10 || upsideDown > 1.25) finish('lost', 'A bumpy landing! Try easing off before the crest.');
  }
  return {
    step(dt, input = {}) { if (disposed || status !== 'playing') return; const s = stepCount(dt, accumulator); accumulator = s.remainder; for (let i = 0; i < s.count && status === 'playing'; i++) tick(input); },
    snapshot() { const p = body.getPosition(), v = body.getLinearVelocity(); return { version: PHYSICS_VERSION, time, bodies: entries.map(bodySnapshot),
      joints: springs.map((j, i) => ({ id: `spring-${i}`, a: { ...j.getAnchorA() }, b: { ...j.getAnchorB() }, stress: 0, broken: false, kind: 'suspension' as const })),
      status, reason, goal: { x: track.goalX, y: 4, width: 2, height: 10 }, bounds: { x: -12, y: -5, width: track.goalX + 30, height: 30 }, goalProgress: Math.max(0, Math.min(1, (p.x - 2.5) / (track.goalX - 2.5))), brokenCount: 0,
      distance: Math.max(0, p.x - 2.5), bestDistance: best, tilt: body.getAngle(), speed: Math.hypot(v.x, v.y), grounded, track: trackId }; },
    drainEvents() { return events.splice(0); }, dispose() { disposed = true; events.length = 0; },
  };
}
