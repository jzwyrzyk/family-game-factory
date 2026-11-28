import { ILLUSTRATED_WORLDS } from './illustrated-art';
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
