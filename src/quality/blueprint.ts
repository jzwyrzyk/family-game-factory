import { PARTS, isPartKind, type PartKind, type Point } from './parts';
export interface PlacedPart { id: string; kind: PartKind; x: number; y: number; angle: number }
export interface GumConnection { id: string; a: string; b: string; anchorA: Point; anchorB: Point; kind: 'gum' | 'axle' }
export interface Blueprint { version: 1; parts: PlacedPart[]; joints: GumConnection[] }
export const BLUEPRINT_LIMITS = Object.freeze({ parts: 32, joints: 48, width: 24, height: 13.5 });
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,49}$/.test(v);
const only = (v: object, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
export function validateBlueprint(value: unknown): Blueprint {
  const b = value as Blueprint;
  if (!b || typeof b !== 'object' || !only(b, ['version', 'parts', 'joints']) || b.version !== 1 || !Array.isArray(b.parts) || b.parts.length > 32 || !Array.isArray(b.joints) || b.joints.length > 48) throw Error('INVALID_BLUEPRINT');
  if (new Set(b.parts.map(p => p?.id)).size !== b.parts.length || new Set(b.joints.map(j => j?.id)).size !== b.joints.length) throw Error('DUPLICATE_BLUEPRINT_ID');
  for (const p of b.parts) if (!p || !only(p, ['id', 'kind', 'x', 'y', 'angle']) || !id(p.id) || !isPartKind(p.kind) || !finite(p.x, .2, 23.8) || !finite(p.y, .2, 12.8) || !finite(p.angle, -Math.PI * 8, Math.PI * 8)) throw Error('INVALID_BLUEPRINT_PART');
  const pairs = new Set<string>();
  for (const j of b.joints) {
    if (!j || !only(j, ['id', 'a', 'b', 'anchorA', 'anchorB', 'kind']) || !id(j.id) || !id(j.a) || !id(j.b) || j.a === j.b || !['gum', 'axle'].includes(j.kind)) throw Error('INVALID_BLUEPRINT_JOINT');
    const a = b.parts.find(p => p.id === j.a), other = b.parts.find(p => p.id === j.b);
    if (!a || !other) throw Error('MISSING_JOINT_PART');
    const pair = [j.a, j.b].sort().join(':'); if (pairs.has(pair)) throw Error('DUPLICATE_JOINT'); pairs.add(pair);
    for (const p of [j.anchorA, j.anchorB]) if (!p || !only(p, ['x', 'y']) || !finite(p.x, -5, 5) || !finite(p.y, -5, 5)) throw Error('INVALID_JOINT_ANCHOR');
    if (j.kind === 'axle' && a.kind !== 'wheel' && other.kind !== 'wheel') throw Error('AXLE_NEEDS_WHEEL');
    const aw = worldPoint(a, j.anchorA), bw = worldPoint(other, j.anchorB);
    if (Math.hypot(aw.x - bw.x, aw.y - bw.y) > .05) throw Error('MISALIGNED_JOINT_ANCHORS');
  }
  return structuredClone(b);
}
export const emptyBlueprint = (): Blueprint => ({ version: 1, parts: [], joints: [] });
export const cloneBlueprint = (b: Blueprint): Blueprint => validateBlueprint(b);
export function worldPoint(p: PlacedPart, local: Point): Point {
  return { x: p.x + Math.cos(p.angle) * local.x - Math.sin(p.angle) * local.y, y: p.y + Math.sin(p.angle) * local.x + Math.cos(p.angle) * local.y };
}
function localPoint(p: PlacedPart, world: Point): Point {
  const dx = world.x - p.x, dy = world.y - p.y;
  return { x: dx * Math.cos(p.angle) + dy * Math.sin(p.angle), y: -dx * Math.sin(p.angle) + dy * Math.cos(p.angle) };
}
const nextId = (taken: string[], prefix: string) => { let n = 1; while (taken.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; };
export function addPart(value: Blueprint, kind: PartKind, x: number, y: number): Blueprint {
  const b = validateBlueprint(value); if (!isPartKind(kind)) throw Error('UNKNOWN_PART');
  b.parts.push({ id: nextId(b.parts.map(p => p.id), kind), kind, x, y, angle: 0 }); return validateBlueprint(b);
}
export function removePart(value: Blueprint, partId: string): Blueprint {
  const b = validateBlueprint(value); b.parts = b.parts.filter(p => p.id !== partId); b.joints = b.joints.filter(j => j.a !== partId && j.b !== partId); return b;
}
export function connectParts(value: Blueprint, aId: string, bId: string, at?: Point): Blueprint {
  const b = validateBlueprint(value), a = b.parts.find(p => p.id === aId), other = b.parts.find(p => p.id === bId);
  if (!a || !other || aId === bId || b.joints.some(j => (j.a === aId && j.b === bId) || (j.a === bId && j.b === aId))) throw Error('Choose two different, unconnected parts.');
  if (Math.hypot(a.x - other.x, a.y - other.y) > Math.max(PARTS[a.kind].width, PARTS[a.kind].height) / 2 + Math.max(PARTS[other.kind].width, PARTS[other.kind].height) / 2 + 1.6) throw Error('Move those parts a little closer.');
  const wheel = a.kind === 'wheel' ? a : other.kind === 'wheel' ? other : undefined;
  const anchor = wheel ? { x: wheel.x, y: wheel.y } : at || { x: (a.x + other.x) / 2, y: (a.y + other.y) / 2 };
  b.joints.push({ id: nextId(b.joints.map(j => j.id), 'gum'), a: aId, b: bId, kind: wheel ? 'axle' : 'gum', anchorA: localPoint(a, anchor), anchorB: localPoint(other, anchor) });
  return validateBlueprint(b);
}
/** An edit deliberately chooses new attachment sites in the new geometry.
 * Runtime joints then keep those local sites fixed for the entire simulation. */
export function rebindConnections(value: Blueprint): Blueprint {
  const b = structuredClone(value);
  for (const j of b.joints) {
    const a = b.parts.find(p => p.id === j.a), other = b.parts.find(p => p.id === j.b); if (!a || !other) continue;
    const wheel = a.kind === 'wheel' ? a : other.kind === 'wheel' ? other : undefined;
    const anchor = wheel ? { x: wheel.x, y: wheel.y } : { x: (a.x + other.x) / 2, y: (a.y + other.y) / 2 };
    j.anchorA = localPoint(a, anchor); j.anchorB = localPoint(other, anchor);
  }
  return validateBlueprint(b);
}
export function starterBlueprint(missionId = 'delivery'): Blueprint {
  let b = emptyBlueprint();
  const put = (kind: PartKind, x: number, y: number, angle = 0) => { b = addPart(b, kind, x, y); b.parts.at(-1)!.angle = angle; return b.parts.at(-1)!.id; };
  const join = (a: string, c: string) => { b = connectParts(b, a, c); };
  if (missionId === 'loft') {
    const body = put('bottle', 12, 8.5), fan = put('fan', 12, 10.1), passenger = put('capsule', 12, 6.9);
    join(body, fan); join(body, passenger); return b;
  }
  if (missionId === 'bridge') {
    const planks = [5.5, 8.8, 12.1, 15.4, 18.7].map(x => put('plank', x, 10.3));
    for (let i = 1; i < planks.length; i++) join(planks[i - 1], planks[i]);
    const passenger = put('capsule', 12.1, 9.6); join(planks[2], passenger); return b;
  }
  const body = put('carton', 4.5, 10), left = put('wheel', 3.65, 11.4), right = put('wheel', 5.35, 11.4);
  const passenger = put('capsule', 4.5, 8.65), fan = put('fan', 2.8, 10, Math.PI / 2);
  join(body, left); join(body, right); join(body, passenger); join(body, fan); return b;
}
