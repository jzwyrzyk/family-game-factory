/** Transient, trusted-host presentation only. No collection, receipt, storage or
 * learning dependency: a reaction cannot change ownership, progress or rewards. */
import { isPalArtworkExpression, isPalArtworkForm, type PalArtworkAsset, type PalArtworkExpression,
  type PalArtworkForm, type PalArtworkResolution, type PalArtworkResolver } from './artwork';

export type PalReactionTrigger = 'explicit-celebrate' | 'explicit-think' | 'explicit-retry' | 'saved-success' | 'growth';
export interface PalExpressionContext {
  /** Captured owner/namespace or other host context; never inferred from art. */
  readonly scope: string;
  readonly characterKey: string;
  readonly form: PalArtworkForm;
}
export interface PalExpressionState {
  readonly context: PalExpressionContext | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable';
  readonly requestedExpression: PalArtworkExpression;
  /** Only a successfully loaded/decoded frame is exposed here. */
  readonly artwork: PalArtworkResolution | null;
  readonly reaction: PalReactionTrigger | null;
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly failure: 'unknown-selection' | 'load-failed' | 'load-timeout' | null;
}
export interface PalExpressionClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface PalExpressionOptions {
  readonly resolver: PalArtworkResolver;
  /** Resolve only when the image has loaded and decoded; honor cancellation. */
  readonly load: (asset: PalArtworkAsset, signal: AbortSignal) => Promise<void>;
  readonly onChange: (state: PalExpressionState) => void;
  readonly loadTimeoutMs?: number;
  readonly clock?: PalExpressionClock;
}
const expressions: Readonly<Record<PalReactionTrigger, PalArtworkExpression>> = Object.freeze({
  'explicit-celebrate': 'celebrate', 'explicit-think': 'thinking', 'explicit-retry': 'encouraging_retry',
  'saved-success': 'celebrate', growth: 'celebrate',
});
const defaultClock: PalExpressionClock = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
type LoadResult = 'loaded' | 'failed' | 'timeout' | 'cancelled';

/** Latest request wins even if an image loader ignores AbortSignal. Expiry and
 * visibility are local presentation state, never facts about a child. */
export function createPalExpressionController(options: PalExpressionOptions) {
  const clock = options.clock ?? defaultClock;
  const loadTimeout = Number.isFinite(options.loadTimeoutMs) ? Math.max(100, Math.min(15_000, options.loadTimeoutMs!)) : 5_000;
  let epoch = 0, disposed = false;
  let pending: AbortController | null = null, reactionTimer: unknown = null;
  let state: PalExpressionState = Object.freeze({ context: null, status: 'idle', requestedExpression: 'neutral',
    artwork: null, reaction: null, visible: true, reducedMotion: false, failure: null });
  const publish = (patch: Partial<PalExpressionState>) => {
    state = Object.freeze({ ...state, ...patch });
    if (!disposed) options.onChange(state);
  };
  function cancel() {
    epoch++;
    pending?.abort(); pending = null;
    if (reactionTimer !== null) clock.clearTimeout(reactionTimer);
    reactionTimer = null;
  }
  function empty(patch: Partial<PalExpressionState> = {}) {
    publish({ status: 'idle', requestedExpression: 'neutral', artwork: null, reaction: null, failure: null, ...patch });
  }
  function load(asset: PalArtworkAsset): Promise<LoadResult> {
    const abort = new AbortController(); pending = abort;
    return new Promise(resolve => {
      let done = false, timer: unknown = null;
      const finish = (result: LoadResult) => {
        if (done) return;
        done = true;
        if (timer !== null) clock.clearTimeout(timer);
        abort.signal.removeEventListener('abort', cancelled);
        if (pending === abort) pending = null;
        resolve(result);
      };
      const cancelled = () => finish('cancelled');
      abort.signal.addEventListener('abort', cancelled, { once: true });
      timer = clock.setTimeout(() => { finish('timeout'); abort.abort(); }, loadTimeout);
      try { Promise.resolve(options.load(asset, abort.signal)).then(() => finish('loaded'), () => finish(abort.signal.aborted ? 'cancelled' : 'failed')); }
      catch { finish('failed'); }
    });
  }
  async function request(expression: PalArtworkExpression, reaction: PalReactionTrigger | null = null, holdMs = 1_600): Promise<boolean> {
    if (disposed) return false;
    cancel(); const captured = epoch, context = state.context;
    if (!context || !state.visible) { empty(); return false; }
    if (!isPalArtworkExpression(expression)) { empty({ status: 'unavailable', failure: 'unknown-selection' }); return false; }
    let frame = options.resolver.resolve({ characterKey: context.characterKey, form: context.form, expression });
    if (!frame) { empty({ status: 'unavailable', requestedExpression: expression, failure: 'unknown-selection' }); return false; }
    publish({ status: 'loading', requestedExpression: expression, artwork: null, reaction, failure: null });
    if (disposed || captured !== epoch) return false;
    let outcome = await load(frame.asset);
    if (disposed || captured !== epoch || !state.visible || outcome === 'cancelled') return false;
    let failure: PalExpressionState['failure'] = outcome === 'timeout' ? 'load-timeout' : outcome === 'failed' ? 'load-failed' : null;
    if (failure && frame.expression !== 'neutral') {
      const neutral = options.resolver.resolve({ characterKey: context.characterKey, form: context.form, expression: 'neutral' });
      if (neutral) {
        frame = Object.freeze({ ...neutral, requestedExpression: expression,
          fallbackReason: failure === 'load-timeout' ? 'image-load-timeout' as const : 'image-load-failed' as const });
        outcome = await load(frame.asset);
        if (disposed || captured !== epoch || !state.visible || outcome === 'cancelled') return false;
      }
    }
    if (outcome !== 'loaded') {
      publish({ status: 'unavailable', artwork: null, reaction: null, failure: outcome === 'timeout' ? 'load-timeout' : 'load-failed' });
      return false;
    }
    const activeReaction = frame.expression === 'neutral' ? null : reaction;
    publish({ status: 'ready', artwork: frame, reaction: activeReaction, failure });
    if (disposed || captured !== epoch) return false;
    if (activeReaction) reactionTimer = clock.setTimeout(() => {
      reactionTimer = null;
      if (!disposed && captured === epoch && state.visible) void request('neutral');
    }, holdMs);
    return true;
  }
  return {
    get state(): PalExpressionState { return state; },
    async setContext(context: PalExpressionContext | null): Promise<boolean> {
      if (disposed) return false;
      if (context && (typeof context.scope !== 'string' || !context.scope.trim() || typeof context.characterKey !== 'string'
        || !isPalArtworkForm(context.form))) {
        cancel(); empty({ context: null, status: 'unavailable', failure: 'unknown-selection' }); return false;
      }
      // Passive refreshes preserve a chosen expression. Use reset() for an
      // explicit retry after a load failure or to return to neutral.
      if (context && state.context && context.scope === state.context.scope && context.characterKey === state.context.characterKey
        && context.form === state.context.form) return state.status === 'ready';
      cancel(); empty({ context: context ? Object.freeze({ scope: context.scope, characterKey: context.characterKey, form: context.form }) : null });
      return context ? request('neutral') : false;
    },
    preview(expression: PalArtworkExpression): Promise<boolean> { return request(expression); },
    react(trigger: PalReactionTrigger, holdMs = 1_600): Promise<boolean> {
      if (!Object.hasOwn(expressions, trigger) || !Number.isFinite(holdMs)) return Promise.resolve(false);
      return request(expressions[trigger], trigger, Math.max(250, Math.min(5_000, holdMs)));
    },
    setVisible(visible: boolean): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (state.visible === visible) return Promise.resolve(state.status === 'ready');
      cancel(); empty({ visible });
      return visible ? request('neutral') : Promise.resolve(false);
    },
    reset(): Promise<boolean> { return request('neutral'); },
    setReducedMotion(reducedMotion: boolean): void {
      if (!disposed && state.reducedMotion !== reducedMotion) publish({ reducedMotion });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; cancel();
      state = Object.freeze({ ...state, context: null, status: 'idle', requestedExpression: 'neutral', artwork: null, reaction: null, failure: null });
    },
  };
}
