import Builder from '../games/builder.js';
import Buckets from '../games/buckets.js';
import Dragon from '../games/dragon.js';
import { manifests, defaults } from './manifests';
import { createLifecycle } from './lifecycle';
import type { GameId, GamePlugin, GameContext, GameLifecycle, Difficulty, Mechanics, PlayOutcome } from './types';

export const plugins: Record<GameId, GamePlugin> = {
  gum: {manifest: manifests.gum, mount: (target, context) => new Builder(target, context)},
  buckets: {manifest: manifests.buckets, mount: (target, context) => new Buckets(target, context)},
  dragon: {manifest: manifests.dragon, mount: (target, context) => new Dragon(target, context)},
};
const details = {
  gum: { type: 'BUILD & CREATE', instructions: 'Match junk to blueprint parts using ten gum sticks.', controls: 'Tap a junk item, then the matching blueprint slot.' },
  buckets: { type: 'GUESS & SURVIVE', instructions: 'Pick a bucket. Can you stay dry?', controls: 'Tap a numbered bucket or use left/right and Space to choose.' },
  dragon: { type: 'TEAM ADVENTURE', instructions: 'Choose a hero. All four friends battle a dragon.', controls: '← → move · ↑ jump · Space throw meatballs · touch controls below' },
};
let current: GameLifecycle | undefined;
export function snapshot() { return current?.snapshot(); }
// Compatibility edge for the existing orchestration; plugins themselves do not know profiles or math.
const FG = (window as any).FG;
FG.runtime = { snapshot };
FG.games = Object.fromEntries((Object.keys(plugins) as GameId[]).map(id => [id, {
  name: manifests[id].name, ...details[id], build: function(target: HTMLElement, ctx: {difficulty: Difficulty; config?: Mechanics; finish(outcome: PlayOutcome): void}) {
    const lifecycle = createLifecycle(plugins[id], target, ctx.config || defaults(id, ctx.difficulty), ctx.difficulty, ctx.finish);
    current = lifecycle;
    lifecycle.start();
    return { next: () => lifecycle.next(), restart: () => lifecycle.retry(), retry: () => lifecycle.retry(), unmount: () => lifecycle.dispose() };
  },
}]));
