import type { CreationProject } from './model';
import { ILLUSTRATED_WORLDS, WORLD_PROPS } from './illustrated-art';
import type { CreationAsset } from './projects';

/** Immutable edition shared by the movement editor and trusted 2D stage. */
export interface WorldPlate extends CreationAsset {
  readonly url: string;
  readonly preview?: string;
  readonly middle?: string;
  readonly foreground?: string;
  readonly props?: readonly string[];
}
const firstPlates = {
  meadow: { id: 'world-v1-village', label: 'Cloud village', kind: 'image', url: './jems-journey/background.webp' },
  sky: { id: 'world-v1-cliffs', label: 'Waterfall cliffs', kind: 'image', url: './art/mind-your-jems/scene-sky.webp' },
  night: { id: 'world-v1-moon', label: 'Moon garden', kind: 'image', url: './art/creative-worlds/moon-garden-v1.webp' },
  workshop: { id: 'world-v1-workshop', label: 'Gem Factory', kind: 'image', url: './gem-factory-workshop.webp' },
} as const satisfies Record<string, WorldPlate>;

export type IllustratedWorldId = typeof ILLUSTRATED_WORLDS[number]['id'];
export type SceneWorldId = IllustratedWorldId | keyof typeof firstPlates;
function illustratedPlate(id: IllustratedWorldId): WorldPlate {
  const world = ILLUSTRATED_WORLDS.find(item => item.id === id);
  if (!world) throw Error('Missing illustrated world: ' + id);
  return { id, label:world.label, kind:'image', url:world.background,
    middle:world.middle, foreground:world.foreground, preview:world.preview, props:world.props };
}
export const WORLD_PLATES: Readonly<Record<SceneWorldId, WorldPlate>> = {
  'world-forest-v1': illustratedPlate('world-forest-v1'),
  'world-workshop-v1': illustratedPlate('world-workshop-v1'),
  'world-cloud-v1': illustratedPlate('world-cloud-v1'),
  'world-moon-v1': illustratedPlate('world-moon-v1'),
  ...firstPlates,
};

export function worldOverlay(plate: WorldPlate, layer: 'middle' | 'foreground'): CreationAsset | undefined {
  const url = plate[layer];
  return url ? { id: plate.id + '-' + layer, label: plate.label, kind: 'image', url } : undefined;
}

export const STARTER_WORLDS = { dragon:'world-forest-v1', buckets:'world-cloud-v1', robot:'world-workshop-v1', blank:'world-moon-v1' } as const;

export const SCENERY_ART = [
  ...WORLD_PROPS.map(asset => ({ ...asset, kind:'image' as const })),
  { id: 'world-v1-flowers', label: 'Flowers', kind: 'image', url: './assets/original-dragon/flowers.png' },
  { id: 'world-v1-castle', label: 'Castle', kind: 'image', url: './assets/original-dragon/castle.png' },
  { id: 'world-v1-crystal', label: 'Mint jem', kind: 'image', url: './jems-art/gem_mint.webp' },
] as const satisfies readonly CreationAsset[];

export const SCENERY_LIMIT = 8;

export function sceneAssetIds(project: CreationProject): string[] {
  const ids = project.actors.map(actor => actor.assetId);
  if (project.world?.backdrop) ids.push(project.world.backdrop);
  for (const decoration of project.world?.scenery ?? []) ids.push(decoration.assetId);
  return ids;
}

export function remapSceneAssets(scene: CreationProject, replace: (id: string) => string): void {
  for (const actor of scene.actors) actor.assetId = replace(actor.assetId);
  if (scene.world?.backdrop) scene.world.backdrop = replace(scene.world.backdrop);
  for (const decoration of scene.world?.scenery ?? []) decoration.assetId = replace(decoration.assetId);
}
