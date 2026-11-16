import OriginalDragon from '../games/original-dragon.js';
import OriginalBuckets from '../games/original-buckets.js';
import Construction from '../games/original-builder.js';
import QualityBuilder from '../games/quality-builder';
import Hill from '../games/quality-hill';
import '../quality/quality.css';
import Builder from '../games/builder.js';
import Buckets from '../games/buckets.js';
import Dragon from '../games/dragon.js';
import { manifests, defaults } from './manifests';
import { createLifecycle } from './lifecycle';
import type { GameId, GamePlugin, GameContext, GameLifecycle, Difficulty, Mechanics, PlayOutcome } from './types';

export const plugins: Record<GameId, GamePlugin> = {
  gum: {manifest: manifests.gum, mount: (target, context) => context.config.qualityVersion === 1 ? new QualityBuilder(target, context) : new (context.config.originalRules ? Construction : Builder)(target, context)},
  buckets: {manifest: manifests.buckets, mount: (target, context) => new (context.config.originalRules ? OriginalBuckets : Buckets)(target, context)},
  dragon: {manifest: manifests.dragon, mount: (target, context) => new (context.config.originalRules ? OriginalDragon : Dragon)(target, context)},
  hill: {manifest: manifests.hill, mount: (target, context) => new Hill(target, context)},
};
const details = {
  gum: { type: 'BUILD & DISCOVER', instructions: 'Build a silly machine. Watch it move. Try your next idea.', controls: 'Drag or tap to place · R rotates · select two parts to connect · Test your machine.' },
  buckets: { type: 'GUESS & SURVIVE', instructions: 'Pick a bucket. Can you stay dry?', controls: 'Tap a numbered bucket or use left/right and Space to choose.' },
  dragon: { type: 'SHIELD ADVENTURE', instructions: 'Jump into falling fireballs to reflect them. Only your hero can save the island.', controls: '← → move · ↑ jump · Space jump / shield · touch controls below' },
  hill: { type: 'DRIVE & TINKER', instructions: 'Find your rhythm over the hills. Change your ride and feel what happens.', controls: 'Right / D accelerates · Left / A brakes · R retries · P pauses · touch pedals below' },
};
let current: GameLifecycle | undefined;
export function snapshot() { return current?.snapshot(); }
// Compatibility edge for the existing orchestration; plugins themselves do not know profiles or math.
const FG = (window as any).FG;
FG.runtime = { snapshot, pause: () => current?.pause(), resume: () => current?.resume() };
FG.games = Object.fromEntries((Object.keys(plugins) as GameId[]).map(id => [id, {
  name: manifests[id].name, ...details[id], build: function(target: HTMLElement, ctx: {difficulty: Difficulty; config?: Mechanics; stateKey?:string; finish(outcome: PlayOutcome): void}) {
    const config = ctx.config || defaults(id, ctx.difficulty), key = ctx.stateKey || id;
    // Capture the owning profile. Unmount can happen AFTER the active profile changes.
    const profile = FG.store.current();
    const quality = id === 'hill' || (id === 'gum' && config.qualityVersion === 1);
    const lifecycle = createLifecycle(plugins[id], target, config, ctx.difficulty, ctx.finish, {
      load: () => { const value = profile.constructionStates?.[key]; return quality ? value?.qualityConstruction : value; },
      save: (state: unknown) => {
        if (!FG.store.data.profiles.includes(profile)) return false;
        const p = profile, before = p.constructionStates;
        const previous = before?.[key];
        const record = quality ? { ...(previous && typeof previous === 'object' ? previous : {}), qualityConstruction: state }
          : { ...(state && typeof state === 'object' ? state : {}), ...(previous?.qualityConstruction ? { qualityConstruction: previous.qualityConstruction } : {}) };
        p.constructionStates = { ...before, [key]: record };
        if (FG.store.save()) return true;
        p.constructionStates = before; return false;
      }
    });
    current = lifecycle;
    lifecycle.start();
    return { next: () => lifecycle.next(), restart: () => lifecycle.retry(), retry: () => lifecycle.retry(), pause: () => lifecycle.pause(), resume: () => lifecycle.resume(), unmount: () => lifecycle.dispose() };
  },
}]));
