import { ILLUSTRATED_WORLDS } from './illustrated-art';

/** The local, serializable Creation Lab language. It contains data, never source code. */
export const CREATION_SCHEMA = 'jems.creation.v1' as const;
export const CREATION_TICK_MS = 10;
export const CREATION_LIMITS = {
  actors: 16, programs: 48, blocks: 300, depth: 6, variables: 24,
  repeat: 50, actionDurationMs: 10000, runDurationMs: 120000,
  instructions: 4000, events: 256, trace: 10000,
} as const;

export type CreationOrigin = 'child' | 'starter' | 'assisted';
export type SceneBackground = 'blank' | 'meadow' | 'night' | 'workshop' | 'sky' | typeof ILLUSTRATED_WORLDS[number]['id'];
export type SceneLayer = 'backdrop' | 'back' | 'middle' | 'front';
export type ComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
export type SceneCondition =
  | {type: 'variable'; variable: string; operator: ComparisonOperator; value: number}
  | {type: 'position'; axis: 'x' | 'y'; operator: ComparisonOperator; value: number}
  | {type: 'touching'; actorId: string};
type BlockBase = {id: string; origin?: CreationOrigin};
export type CreationBlock = BlockBase & (
  | {type: 'move'; x?: number; y?: number; dx?: number; dy?: number; durationMs?: number}
  | {type: 'wait'; durationMs: number}
  | {type: 'say'; text: string; durationMs: number}
  | {type: 'dance'; durationMs: number}
  | {type: 'jump'; height: number; durationMs: number}
  | {type: 'show' | 'hide'}
  | {type: 'repeat'; count: number; actions: CreationBlock[]}
  | {type: 'if'; condition: SceneCondition; then: CreationBlock[]; else?: CreationBlock[]}
  | {type: 'set'; variable: string; value: number}
  | {type: 'change'; variable: string; amount: number}
  | {type: 'emit'; name: string}
);
export type SceneTrigger = {type: 'start' | 'tap'} | {type: 'event'; name: string};
export const CREATIVE_ROLES = ['character','decoration','scenery','obstacle','collectible'] as const;
export type CreativeRole = typeof CREATIVE_ROLES[number];
export interface SceneActor {
  creativeRole?: CreativeRole;
  id: string; name: string; assetId: string; x: number; y: number;
  size?: number; visible?: boolean; layer?: SceneLayer; stackOrder?: number; angle?: number; backdropFit?: 'contain' | 'cover';
}
export interface SceneProgram {
  id: string; actorId: string; trigger: SceneTrigger; actions: CreationBlock[];
}
export interface CreationProvenance {
  createdBy: CreationOrigin;
  sourceKind?: 'curated' | 'generated' | 'creation' | 'art';
  sourceProjectId?: string; sourceRevisionId?: string;
  sourceSessionId?: string; sourceGameId?: string;
}
export interface CreationProject {
  schema: typeof CREATION_SCHEMA;
  id: string; title: string; width: number; height: number; background: SceneBackground;
  worldLayers?: { middle: boolean; foreground: boolean };
  actors: SceneActor[]; programs: SceneProgram[]; variables: Record<string, number>;
  provenance?: CreationProvenance;
}
export type SceneProject = CreationProject;

const forbiddenIds = new Set(['__proto__', 'prototype', 'constructor']);
export const isCreationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value) && !forbiddenIds.has(value);
/** Only private asset references have the additional hash suffix. The source
 * ID bound matches portable art restoration; ordinary creation IDs stay capped at 160. */
export interface PrivateArtReference {kind:'image'|'rig';id:string;sha256:string}
export function parsePrivateArtId(value:unknown):PrivateArtReference|null {
  if(typeof value!=='string')return null;
  const match=/^art:(image|rig):([A-Za-z0-9_-]{1,100}):([a-f0-9]{64})$/.exec(value);
  return match&&!forbiddenIds.has(match[2])?{kind:match[1] as 'image'|'rig',id:match[2],sha256:match[3]}:null;
}
const fail = (message: string): never => { throw new Error(`Creation Lab: ${message}`); };
function record(value: unknown, allowed: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) fail(`Unknown field in ${label}.`);
  return result;
}
function id(value: unknown, label: string): asserts value is string {
  if (!isCreationId(value)) fail(`Invalid ${label}.`);
}
function text(value: unknown, max: number, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`Invalid ${label}.`);
}
function number(value: unknown, min: number, max: number, label: string, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value))) fail(`Invalid ${label}.`);
}
function list(value: unknown, max: number, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(`Too many or invalid ${label}.`);
}
const origins = ['child', 'starter', 'assisted'];
const operators = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];

/** Strictly validates before cloning: unsupported executable/asset payloads are never retained. */
export function validateCreationProject(input: unknown): CreationProject {
  const p = record(input, ['schema','id','title','width','height','background','worldLayers','actors','programs','variables','provenance'], 'project');
  if (p.schema !== CREATION_SCHEMA) fail('Unsupported saved project version.');
  id(p.id, 'project ID'); text(p.title, 80, 'project title');
  number(p.width, 200, 1600, 'stage width', true); number(p.height, 160, 1200, 'stage height', true);
  if (!['blank','meadow','night','workshop','sky'].includes(p.background as string) && !ILLUSTRATED_WORLDS.some(world => world.id === p.background)) fail('Choose a supported background.');
  if (p.worldLayers !== undefined) {
    const layers = record(p.worldLayers, ['middle','foreground'], 'world layers');
    if (typeof layers.middle !== 'boolean' || typeof layers.foreground !== 'boolean') fail('Choose visible world layers.');
  }
  list(p.actors, CREATION_LIMITS.actors, 'characters');
  if (!p.actors.length) fail('Add at least one character.');
  const actorIds = new Set<string>();
  for (const raw of p.actors) {
    const a = record(raw, ['id','name','assetId','x','y','size','visible','layer','creativeRole','angle','backdropFit','stackOrder'], 'character');
    id(a.id, 'character ID');
    if(!isCreationId(a.assetId)&&!parsePrivateArtId(a.assetId))fail('Invalid asset reference.');
    text(a.name, 60, 'character name');
    if (actorIds.has(a.id)) fail('Character IDs must be unique.');
    actorIds.add(a.id);
    number(a.x, 0, p.width, 'character x'); number(a.y, 0, p.height, 'character y');
    if (a.size !== undefined) number(a.size, 16, 240, 'character size');
    if (a.stackOrder !== undefined) number(a.stackOrder, 0, CREATION_LIMITS.actors - 1, 'stack position', true);
    if (a.angle !== undefined) number(a.angle, -180, 180, 'picture angle');
    if (a.backdropFit !== undefined && (a.layer !== 'backdrop' || !['contain','cover'].includes(a.backdropFit as string))) fail('Choose a supported backdrop fit.');
    if (a.layer !== undefined && !['backdrop','back','middle','front'].includes(a.layer as string)) fail('Choose a supported scene layer.');
    if (a.layer === 'backdrop' && parsePrivateArtId(a.assetId)?.kind !== 'image') fail('Choose an original drawing for your backdrop.');
    if (a.creativeRole !== undefined && !CREATIVE_ROLES.includes(a.creativeRole as CreativeRole)) fail('Choose a supported role for this scene.');
    if (a.visible !== undefined && typeof a.visible !== 'boolean') fail('Invalid character visibility.');
  }
  if (p.actors.filter(raw => (raw as SceneActor).layer === 'backdrop').length > 1) fail('Choose one drawing for your backdrop.');
  if (!p.variables || typeof p.variables !== 'object' || Array.isArray(p.variables)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(p.variables))) fail('Invalid variables.');
  const variables = p.variables as Record<string, unknown>;
  if (Object.keys(variables).length > CREATION_LIMITS.variables) fail('Too many variables.');
  for (const [key,value] of Object.entries(variables)) {
    id(key, 'variable name'); number(value, -1000000, 1000000, 'variable value');
  }
  const variable = (name: unknown) => {
    id(name, 'variable name');
    if (!Object.hasOwn(variables, name)) fail(`Add the variable ${name} before using it.`);
  };
  const condition = (raw: unknown) => {
    const c = record(raw, ['type','variable','operator','value','axis','actorId'], 'condition');
    if (c.type === 'touching') {
      record(c, ['type','actorId'], 'touching condition');
      id(c.actorId, 'touching character');
      if (!actorIds.has(c.actorId)) fail('The touching character is missing.');
    } else if (c.type === 'variable' || c.type === 'position') {
      record(c, c.type === 'variable' ? ['type','variable','operator','value'] : ['type','axis','operator','value'], 'comparison');
      if (c.type === 'variable') variable(c.variable);
      else if (c.axis !== 'x' && c.axis !== 'y') fail('Choose x or y for a position comparison.');
      if (!operators.includes(c.operator as string)) fail('Invalid comparison.');
      number(c.value, -1000000, 1000000, 'comparison value');
    } else fail('Unsupported condition.');
  };
  const blockIds = new Set<string>();
  let blockCount = 0;
  function blocks(raw: unknown, depth: number): void {
    if (depth > CREATION_LIMITS.depth) fail('Blocks are nested too deeply.');
    list(raw, CREATION_LIMITS.blocks, 'blocks');
    for (const value of raw) {
      if (++blockCount > CREATION_LIMITS.blocks) fail('This project has too many blocks.');
      const b = record(value, ['id','origin','type','x','y','dx','dy','durationMs','text','height','count','actions','condition','then','else','variable','value','amount','name'], 'block');
      id(b.id, 'block ID');
      if (blockIds.has(b.id)) fail('Block IDs must be unique throughout a project.');
      blockIds.add(b.id);
      if (b.origin !== undefined && !origins.includes(b.origin as string)) fail('Invalid block authorship.');
      const fields = (specific: string[]) => record(b, ['id','origin','type',...specific], 'block');
      const duration = (optional = false) => {
        if (!optional || b.durationMs !== undefined) number(b.durationMs, 0, CREATION_LIMITS.actionDurationMs, 'action duration', true);
      };
      switch (b.type) {
        case 'move': {
          fields(['x','y','dx','dy','durationMs']);
          const absolute = b.x !== undefined || b.y !== undefined;
          const relative = b.dx !== undefined || b.dy !== undefined;
          if (absolute === relative) fail('Move needs either a destination or a relative distance.');
          for (const field of ['x','y','dx','dy']) if (b[field] !== undefined) number(b[field], -4096, 4096, 'move distance');
          duration(true); break;
        }
        case 'wait': case 'dance': fields(['durationMs']); duration(); break;
        case 'say': fields(['text','durationMs']); text(b.text, 160, 'speech', true); duration(); break;
        case 'jump': fields(['height','durationMs']); number(b.height, 0, 300, 'jump height'); duration(); break;
        case 'show': case 'hide': fields([]); break;
        case 'repeat': fields(['count','actions']); number(b.count, 0, CREATION_LIMITS.repeat, 'repeat count', true); blocks(b.actions, depth + 1); break;
        case 'if': fields(['condition','then','else']); condition(b.condition); blocks(b.then, depth + 1); if (b.else !== undefined) blocks(b.else, depth + 1); break;
        case 'set': fields(['variable','value']); variable(b.variable); number(b.value, -1000000, 1000000, 'variable value'); break;
        case 'change': fields(['variable','amount']); variable(b.variable); number(b.amount, -1000000, 1000000, 'variable change'); break;
        case 'emit': fields(['name']); id(b.name, 'event name'); break;
        default: fail('Unsupported block.');
      }
    }
  }
  list(p.programs, CREATION_LIMITS.programs, 'programs');
  const programIds = new Set<string>();
  const triggerKeys = new Set<string>();
  for (const raw of p.programs) {
    const program = record(raw, ['id','actorId','trigger','actions'], 'program');
    id(program.id, 'program ID'); id(program.actorId, 'program character');
    if (programIds.has(program.id)) fail('Program IDs must be unique.');
    programIds.add(program.id);
    if (!actorIds.has(program.actorId)) fail('A program references a missing character.');
    const t = record(program.trigger, ['type','name'], 'trigger');
    if (t.type === 'event') id(t.name, 'event name');
    else if (t.type === 'start' || t.type === 'tap') record(t, ['type'], 'trigger');
    else fail('Unsupported trigger.');
    const triggerKey = `${program.actorId}/${t.type}/${t.name ?? ''}`;
    if (triggerKeys.has(triggerKey)) fail('Combine blocks under one matching character trigger.');
    triggerKeys.add(triggerKey);
    blocks(program.actions, 0);
  }
  if (p.provenance !== undefined) {
    const source = record(p.provenance, ['createdBy','sourceKind','sourceProjectId','sourceRevisionId','sourceSessionId','sourceGameId'], 'source history');
    if (!origins.includes(source.createdBy as string)) fail('Invalid project authorship.');
    if (source.sourceKind !== undefined && !['curated','generated','creation','art'].includes(source.sourceKind as string)) fail('Invalid source kind.');
    for (const field of ['sourceProjectId','sourceRevisionId','sourceSessionId','sourceGameId']) if (source[field] !== undefined) id(source[field], 'source reference');
  }
  return JSON.parse(JSON.stringify(input)) as CreationProject;
}
