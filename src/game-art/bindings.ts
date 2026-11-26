import type {CreativeAssetChoice} from '../assets/creative-library';
import {validSemanticIdentity} from '../assets/art-lineage';
// Local notebook references. Only the role and game-local handle may enter game code.
export const roleLabels = {
  player: 'Main player', character: 'Other character', vehicle: 'Vehicle',
  challenge: 'Challenge character', collectible: 'Collectible', obstacle: 'Obstacle',
  decoration: 'Decoration', background: 'Background', environment: 'World object',
} as const;
export type GameArtRole = keyof typeof roleLabels;
export interface GameArtPin extends Pick<CreativeAssetChoice,'logicalId'|'originalSha256'|'drawingId'|'sha256'|'semanticIdentity'> {
  role: GameArtRole;
  name: string;
  intent?: string;
}
export interface ArtTest { id: string; parent: string | null; program: string; pins: GameArtPin[] }
export interface GameArtPlan { version: 1; pins: GameArtPin[]; tests: ArtTest[]; kept: string | null }
export const emptyArtPlan = (): GameArtPlan => ({version: 1, pins: [], tests: [], kept: null});
const record = (value: unknown, keys: string[]) => !!value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function validPin(pin: GameArtPin) {
  if(!pin)return false;
  const fields=['role','logicalId','originalSha256','drawingId','sha256','name'];
  if(pin.intent!==undefined)fields.push('intent');
  if(pin.semanticIdentity!==undefined)fields.push('semanticIdentity');
  return record(pin,fields) && Object.hasOwn(roleLabels,pin.role) &&
    id(pin.logicalId) && hash(pin.originalSha256) && id(pin.drawingId) && hash(pin.sha256) &&
    typeof pin.name==='string' && !!pin.name.trim() && pin.name.length<=60 &&
    (pin.intent===undefined || typeof pin.intent==='string' && pin.intent.length<=160) &&
    (pin.semanticIdentity===undefined || validSemanticIdentity(pin.semanticIdentity));
}
function validPins(pins: GameArtPin[]): boolean {
  return Array.isArray(pins) && pins.length<=Object.keys(roleLabels).length &&
    pins.every(validPin) && new Set(pins.map(p=>p.role)).size===pins.length;
}
export function validateGameArt(plan: GameArtPlan) {
  if (!record(plan,['version','pins','tests','kept']) || plan.version !== 1 || !validPins(plan.pins) ||
      !Array.isArray(plan.tests) || plan.tests.length > 32) throw Error('This saved game art plan needs recovery.');
  const seen = new Set<string>();
  for (const test of plan.tests) {
    if (!record(test,['id','parent','program','pins']) || !id(test.id) || seen.has(test.id) ||
        (test.parent !== null && !seen.has(test.parent)) || !hash(test.program) || !validPins(test.pins) || !test.pins.length)
      throw Error('This art test is missing its original version.');
    seen.add(test.id);
  }
  if (plan.kept !== null && !seen.has(plan.kept)) throw Error('The kept art test is missing.');
}
export const retainedPins = (plan: GameArtPlan) => [...plan.pins,...plan.tests.flatMap(test => test.pins)];
export function selectGameArt(plan: GameArtPlan, pin: GameArtPin) {
  plan.pins = [...plan.pins.filter(p => p.role !== pin.role), {...pin}];
  validateGameArt(plan);
}
export function saveArtTest(plan: GameArtPlan, program: string, parent: string | null): ArtTest {
  if (plan.tests.length >= 32) throw Error('This idea has 32 art tests. Make a new idea to try more.');
  const test = {id:crypto.randomUUID(), parent, program, pins:structuredClone(plan.pins)};
  plan.tests.push(test);
  validateGameArt(plan);
  return test;
}
export const artBuildHold = 'Your pictures are saved with this idea. The online builder can’t use them yet.';
export const roleQuestion: Record<GameArtRole,string> = {
  player:'Where should your player go?', vehicle:'Where should your vehicle go?',
  character:'What should your character do?', challenge:'How will the player get past this character?',
  collectible:'What happens when you collect it?', obstacle:'What happens when the player reaches it?',
  decoration:'Where should it appear?', background:'What happens in this place?', environment:'What can you do with it?',
};
