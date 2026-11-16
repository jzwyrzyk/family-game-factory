/** Shared, declarative component contract. Coordinates are metres, +y points down.
 * Artwork is referenced by trusted sprite IDs; no executable code or URLs enter a part.
 * A future drawing importer supplies these components after review/validation.
 */
export interface Point { x: number; y: number }
export type Material = 'plastic' | 'wood' | 'metal' | 'rubber' | 'fabric';
export type Collider = { type: 'box'; width: number; height: number }
  | { type: 'circle'; radius: number }
  | { type: 'polygon'; vertices: Point[] };
export interface Attachment extends Point { id: string; role: 'gum' | 'axle' | 'mount' }
export interface PartDefinition {
  schemaVersion: 1; id: string; name: string; spriteId: string;
  width: number; height: number; mass: number; material: Material;
  friction: number; restitution: number; collider: Collider;
  pivot: Point; attachments: Attachment[];
  /** Thrust points up in the part's local coordinates; rotating the part redirects it. */
  thrust?: number;
  /** A deliberately authored upward force (balloon buoyancy), in newtons. */
  lift?: number;
}

const ids = ['bottle', 'carton', 'can', 'spoon', 'plank', 'cone', 'wheel', 'fan', 'balloon', 'capsule'] as const;
export type PartKind = typeof ids[number];
const points = (w: number, h: number): Attachment[] => [
  { id: 'left', x: -w / 2, y: 0, role: 'gum' }, { id: 'right', x: w / 2, y: 0, role: 'gum' },
  { id: 'top', x: 0, y: -h / 2, role: 'gum' }, { id: 'bottom', x: 0, y: h / 2, role: 'gum' },
  { id: 'center', x: 0, y: 0, role: 'mount' },
];
function part(id: PartKind, name: string, width: number, height: number, mass: number,
  material: Material, extra: Partial<PartDefinition> = {}): PartDefinition {
  return { schemaVersion: 1, id, name, spriteId: id, width, height, mass, material,
    friction: .65, restitution: .12, collider: { type: 'box', width, height },
    pivot: { x: 0, y: 0 }, attachments: points(width, height), ...extra };
}
const catalogue: Record<PartKind, PartDefinition> = {
  bottle: part('bottle', 'Bottle', 1.35, 2.1, 1.1, 'plastic', {
    collider: { type: 'polygon', vertices: [{ x: -.63, y: 1.05 }, { x: .63, y: 1.05 },
      { x: .63, y: -.55 }, { x: .26, y: -1.05 }, { x: -.26, y: -1.05 }, { x: -.63, y: -.55 }] },
  }),
  carton: part('carton', 'Cardboard box', 2.1, 1.65, 1.6, 'wood'),
  can: part('can', 'Heavy tin can', 1.2, 1.55, 3.2, 'metal', { restitution: .08 }),
  spoon: part('spoon', 'Wooden spoon', 2.6, .35, .55, 'wood'),
  plank: part('plank', 'Wooden plank', 3.5, .35, 1.05, 'wood', { friction: .8 }),
  cone: part('cone', 'Paper cone', 1.3, 1.2, .45, 'wood', {
    collider: { type: 'polygon', vertices: [{ x: 0, y: -.6 }, { x: .65, y: .6 }, { x: -.65, y: .6 }] },
  }),
  wheel: part('wheel', 'Rolling lid', 1.12, 1.12, .7, 'rubber', {
    collider: { type: 'circle', radius: .56 }, friction: 1.15, restitution: .08,
    attachments: [{ id: 'axle', x: 0, y: 0, role: 'axle' }],
  }),
  fan: part('fan', 'Rocket fan', 1.3, 1.15, 1.05, 'metal', { thrust: 42 }),
  balloon: part('balloon', 'Balloon', 1.55, 1.9, .5, 'fabric', {
    collider: { type: 'circle', radius: .76 }, lift: 26, restitution: .3,
  }),
  capsule: part('capsule', 'Little passenger', .95, .95, .75, 'plastic', {
    collider: { type: 'circle', radius: .475 }, restitution: .15,
  }),
};

const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(v);
const only = (v: object, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const point = (v: any) => v && only(v, ['x', 'y']) && finite(v.x, -8, 8) && finite(v.y, -8, 8);
/** Reject malformed/capability-bearing definitions; this does not register a new runtime asset. */
export function validatePartDefinition(value: unknown): PartDefinition {
  const d = value as PartDefinition;
  if (!d || typeof d !== 'object' || !only(d, ['schemaVersion', 'id', 'name', 'spriteId', 'width', 'height', 'mass', 'material', 'friction', 'restitution', 'collider', 'pivot', 'attachments', 'thrust', 'lift']) ||
      d.schemaVersion !== 1 || !identifier(d.id) || !identifier(d.spriteId) || typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 60 ||
      !finite(d.width, .15, 8) || !finite(d.height, .15, 8) || !finite(d.mass, .4, 4) ||
      !['plastic', 'wood', 'metal', 'rubber', 'fabric'].includes(d.material) || !finite(d.friction, 0, 1.5) || !finite(d.restitution, 0, .7) ||
      !point(d.pivot) || !Array.isArray(d.attachments) || d.attachments.length > 12 ||
      new Set(d.attachments.map(a => a?.id)).size !== d.attachments.length ||
      d.attachments.some(a => !a || !only(a, ['id', 'role', 'x', 'y']) || !identifier(a.id) || !['gum', 'axle', 'mount'].includes(a.role) || !finite(a.x, -d.width, d.width) || !finite(a.y, -d.height, d.height)) ||
      (d.thrust !== undefined && !finite(d.thrust, 0, 120)) || (d.lift !== undefined && !finite(d.lift, 0, 40))) throw Error('INVALID_PART_DEFINITION');
  const c = d.collider;
  if (!c || typeof c !== 'object') throw Error('INVALID_COLLIDER');
  if (c.type === 'box') {
    if (!only(c, ['type', 'width', 'height']) || !finite(c.width, .1, d.width) || !finite(c.height, .1, d.height)) throw Error('INVALID_COLLIDER');
  } else if (c.type === 'circle') {
    if (!only(c, ['type', 'radius']) || !finite(c.radius, .05, Math.min(d.width, d.height) / 2)) throw Error('INVALID_COLLIDER');
  } else if (c.type === 'polygon') {
    if (!only(c, ['type', 'vertices']) || !Array.isArray(c.vertices) || c.vertices.length < 3 || c.vertices.length > 8 ||
        c.vertices.some(p => !point(p) || Math.abs(p.x) > d.width / 2 || Math.abs(p.y) > d.height / 2)) throw Error('INVALID_COLLIDER');
    let sign = 0, area = 0;
    for (let i = 0; i < c.vertices.length; i++) {
      const a = c.vertices[i], b = c.vertices[(i + 1) % c.vertices.length], n = c.vertices[(i + 2) % c.vertices.length];
      const cross = (b.x - a.x) * (n.y - b.y) - (b.y - a.y) * (n.x - b.x);
      if (Math.hypot(b.x - a.x, b.y - a.y) < .02 || Math.abs(cross) < 1e-6 || (sign && Math.sign(cross) !== sign)) throw Error('COLLIDER_MUST_BE_CONVEX');
      sign = Math.sign(cross); area += a.x * b.y - b.x * a.y;
    }
    // Local turns alone also accept some self-intersecting stars. Every vertex
    // must lie in the same half-plane of every edge of a convex collider.
    for (let i = 0; i < c.vertices.length; i++) {
      const a = c.vertices[i], b = c.vertices[(i + 1) % c.vertices.length];
      for (const p of c.vertices) if (((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * sign < -1e-6) throw Error('COLLIDER_MUST_BE_CONVEX');
    }
    if (Math.abs(area) < .02) throw Error('INVALID_COLLIDER');
  } else throw Error('INVALID_COLLIDER');
  return structuredClone(d);
}
function freeze<T>(v: T): T { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
Object.values(catalogue).forEach(validatePartDefinition);
export const PARTS = freeze(catalogue);
export const PART_LIST = freeze(ids.map(id => PARTS[id]));
export function isPartKind(value: unknown): value is PartKind { return typeof value === 'string' && Object.hasOwn(PARTS, value); }

/** Contract for future drawing decomposition. Imported art uses trusted asset IDs.
 * Components can become rigid bodies, or remain decorative children of another component.
 */
export interface DrawingRig {
  schemaVersion: 1; id: string;
  components: { id: string; parentId: string | null; part: PartDefinition; offset: Point; angle: number; physical: boolean }[];
  bindings: { a: string; b: string; attachmentA: string; attachmentB: string; kind: 'fixed' | 'axle' | 'suspension' | 'gum' }[];
}
export function validateDrawingRig(value: unknown): DrawingRig {
  const r = value as DrawingRig;
  if (!r || !only(r, ['schemaVersion', 'id', 'components', 'bindings']) || r.schemaVersion !== 1 || !identifier(r.id) ||
      !Array.isArray(r.components) || r.components.length < 1 || r.components.length > 32 || !Array.isArray(r.bindings) || r.bindings.length > 48) throw Error('INVALID_DRAWING_RIG');
  const seen = new Set<string>();
  for (const c of r.components) {
    if (!c || !only(c, ['id', 'parentId', 'part', 'offset', 'angle', 'physical']) || !identifier(c.id) || seen.has(c.id) || !point(c.offset) || !finite(c.angle, -Math.PI * 2, Math.PI * 2) || typeof c.physical !== 'boolean') throw Error('INVALID_RIG_COMPONENT');
    seen.add(c.id); validatePartDefinition(c.part);
  }
  for (const c of r.components) {
    const ancestors = new Set([c.id]); let parent = c.parentId;
    while (parent !== null) {
      if (ancestors.has(parent)) throw Error('CYCLIC_RIG');
      ancestors.add(parent); const p = r.components.find(x => x.id === parent); if (!p) throw Error('MISSING_RIG_PARENT'); parent = p.parentId;
    }
  }
  for (const b of r.bindings) {
    const a = r.components.find(c => c.id === b?.a), other = r.components.find(c => c.id === b?.b);
    if (!b || !only(b, ['a', 'b', 'attachmentA', 'attachmentB', 'kind']) || !a || !other || a.id === other.id ||
        !['fixed', 'axle', 'suspension', 'gum'].includes(b.kind) || !a.part.attachments.some(p => p.id === b.attachmentA) || !other.part.attachments.some(p => p.id === b.attachmentB)) throw Error('INVALID_RIG_BINDING');
  }
  return structuredClone(r);
}
