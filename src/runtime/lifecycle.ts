import { validateConfig } from './manifests';
import type { Difficulty, GameLifecycle, GamePlugin, Mechanics, PlayOutcome, GameContext } from './types';
export function createLifecycle(plugin: GamePlugin, target: HTMLElement, config: Mechanics, difficulty: Difficulty, onOutcome: (outcome: PlayOutcome) => void): GameLifecycle {
  const checked = validateConfig(plugin.manifest.id, config);
  let instance: ReturnType<GamePlugin['mount']> | undefined, disposed = false, finished = false, began = performance.now();
  const context: GameContext = { difficulty, config: Object.freeze({ ...checked }), finish(result) {
    if (disposed || finished) return;
    finished = true;
    onOutcome({ ...result, game: plugin.manifest.id, durationMs: Math.round(performance.now() - began), config: { ...checked }, at: new Date().toISOString() });
  } };
  const resetClock = () => { began = performance.now(); finished = false; };
  return {
    start() { if (disposed || instance) return; resetClock(); instance = plugin.mount(target, context); },
    next() { if (!disposed && instance) { resetClock(); instance.next(); } },
    retry() { if (!disposed && instance) { resetClock(); (instance.retry || instance.restart).call(instance); } },
    dispose() { if (disposed) return; disposed = true; instance?.unmount(); target.replaceChildren(); },
    snapshot() { return { config: { ...checked }, state: instance?.snapshot?.() || {}, disposed }; },
  };
}
