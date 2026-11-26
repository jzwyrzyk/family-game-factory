/** Local creative use of a Pal. This module cannot award or unlock companions. */
import { CREATION_LIMITS, type CreationProject, type SceneActor, type SceneProgram } from '../creation/model';
import { creationAsset, validateEditableProject } from '../creation/projects';
import { PAL_CATALOG, isPalId, palLine, palSceneAssetId, type PalForm, type PalId } from './catalog';

export type CreationPalId = PalId;
export const CREATION_PAL_IDS: readonly CreationPalId[] = Object.freeze(PAL_CATALOG.map(pal => pal.id));
const uid = () => crypto.randomUUID();
export const isCreationPalId = isPalId;

const tapLines: Readonly<Partial<Record<CreationPalId, string>>> = Object.freeze({
  kip: 'Test complete. Wobble levels: excellent.',
  riff: 'Plot twist: I can dance!',
});

function palParts(id: CreationPalId, width: number, height: number, form: PalForm): { actor: SceneActor; program: SceneProgram } {
  if (!isCreationPalId(id)) throw Error('Choose an available Pal for your scene.');
  if (form !== 'base' && form !== 'mature') throw Error('Choose an available Pal form for your scene.');
  const asset = creationAsset(palSceneAssetId(id, form))!;
  const actor: SceneActor = { id: uid(), assetId: asset.id, name: asset.label, x: Math.round(width / 2),
    y: Math.round(height * .64), size: Math.min(130, width * .4, height * .45), visible: true };
  const program: SceneProgram = { id: uid(), actorId: actor.id, trigger: { type: 'tap' }, actions: [
    { id: uid(), origin: 'starter', type: 'jump', height: Math.min(65, height * .15), durationMs: 600 },
    { id: uid(), origin: 'starter', type: 'dance', durationMs: 800 },
    { id: uid(), origin: 'starter', type: 'say', text: tapLines[id] ?? palLine(id, 'play'), durationMs: 1800 },
  ] };
  return { actor, program };
}

/** The child can immediately play and edit a complete tap-response toy. */
export function createPalPlayground(id: CreationPalId, form: PalForm = 'base'): CreationProject {
  const { actor, program } = palParts(id, 800, 450, form);
  return validateEditableProject({ schema: 'jems.creation.v1', id: uid(), title: `${actor.name}'s playground`,
    width: 800, height: 450, background: 'meadow', world:{backdrop:'world:jem-gardens:v1', fit:'cover', decorations:[]}, actors: [actor], variables: {},
    provenance: { createdBy: 'starter' }, programs: [
      { id: uid(), actorId: actor.id, trigger: { type: 'start' }, actions: [
        { id: uid(), origin: 'starter', type: 'say', text: 'Tap me. I have a very important wobble.', durationMs: 1800 },
      ] }, program,
    ],
  });
}

/**
 * Returns a validated copy; existing actors, blocks, provenance and source pins
 * survive. The caller owns draft/Keep semantics and collection eligibility.
 */
export function addPalToProject(input: CreationProject, id: CreationPalId, form: PalForm = 'base'): { scene: CreationProject; actorId: string; programId: string } {
  const scene = validateEditableProject(input);
  if (scene.actors.length >= CREATION_LIMITS.actors) throw Error('Your cast is full. Remove a character before adding your Pal.');
  if (scene.programs.length >= CREATION_LIMITS.programs) throw Error('Your scene has room for no more scripts. Remove a script before adding your Pal.');
  const { actor, program } = palParts(id, scene.width, scene.height, form);
  actor.x = Math.round(scene.width * .72);
  scene.actors.push(actor); scene.programs.push(program);
  return { scene: validateEditableProject(scene), actorId: actor.id, programId: program.id };
}
