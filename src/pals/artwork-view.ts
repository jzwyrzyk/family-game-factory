import { createPalArtworkResolver, PAL_ARTWORK_ASSET_VERSION, type PalArtworkAsset } from './artwork';
import { createPalExpressionController } from './expressions';
import './artwork-view.css';

type Resolver = NonNullable<ReturnType<typeof createPalArtworkResolver>>;
type Controller = ReturnType<typeof createPalExpressionController>;
type Context = Parameters<Controller['setContext']>[0];
type ViewState = Controller['state'];

const LABELS = {
  neutral: 'Ready', celebrate: 'Celebrate', thinking: 'Thinking', encouraging_retry: 'Try again',
} as const;

/** This first motion pilot only fades between unchanged, approved Wink Base
 * illustrations. It does not rig or deform the character or its gems. */
export const PAL_EXPRESSION_MOTION_PILOT = Object.freeze({
  characterKey: 'first-round-2026-11-19/R', form: 'base', durationMs: 180,
});

export interface PalArtworkViewOptions {
  resolver: Resolver;
  context: Context;
  className?: string;
  decorative?: boolean;
  motionPilot?: boolean;
  onStateChange?: (state: ViewState) => void;
}

/** An isolated, disposable portrait. Its controller owns only temporary visual
 * state; this component never reads or writes collection or reward storage. */
export function createPalArtworkView(options: PalArtworkViewOptions) {
  const element = document.createElement('span');
  element.className = `pal-artwork-view ${options.className ?? ''}`.trim();
  if (options.decorative) element.setAttribute('aria-hidden', 'true');
  else element.setAttribute('role', 'img');
  const unavailable = document.createElement('span');
  unavailable.className = 'pal-artwork-view__unavailable';
  unavailable.textContent = 'Picture unavailable';
  unavailable.hidden = true;
  element.append(unavailable);

  const prepared = new Map<string, HTMLImageElement>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let shown: HTMLImageElement | null = null;
  let shownURL = '';
  let contextKey = '';
  let transition: Animation | null = null;
  let visualEpoch = 0;
  let allowed = true;

  function cancelTransition() {
    visualEpoch++;
    transition?.cancel();
    transition = null;
    element.querySelectorAll('img').forEach(image => { if (image !== shown) image.remove(); });
    if (shown) shown.style.opacity = '1';
  }
  function clearFrame() {
    cancelTransition();
    element.querySelectorAll('img').forEach(image => image.remove());
    shown = null;
    shownURL = '';
    prepared.clear();
    delete element.dataset.expression;
    delete element.dataset.assetVersion;
    delete element.dataset.sourceHash;
    delete element.dataset.characterKey;
    delete element.dataset.form;
    element.removeAttribute('aria-label');
  }
  async function load(asset: PalArtworkAsset, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new DOMException('Portrait request cancelled.', 'AbortError');
    if (prepared.has(asset.url)) return;
    const image = new Image();
    image.className = 'pal-artwork-view__image';
    image.alt = '';
    image.width = asset.width;
    image.height = asset.height;
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const abort = () => {
        image.removeAttribute('src');
        finish(new DOMException('Portrait request cancelled.', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.onerror = () => finish(new Error('Portrait image could not load.'));
      image.onload = () => {
        void image.decode().then(() => {
          if (signal.aborted) abort(); else finish();
        }).catch(finish);
      };
      image.src = new URL(asset.url, document.baseURI).href;
    });
    if (signal.aborted || disposed) throw new DOMException('Portrait request cancelled.', 'AbortError');
    prepared.set(asset.url, image);
    // A form contains four approved states. A change of context clears this map.
    while (prepared.size > 4) prepared.delete(prepared.keys().next().value!);
  }

  function paint(state: ViewState) {
    if (disposed) return;
    const nextContext = state.context
      ? `${state.context.scope}\u0000${state.context.characterKey}\u0000${state.context.form}` : '';
    if (nextContext !== contextKey) {
      clearFrame();
      contextKey = nextContext;
    }
    element.dataset.state = state.status;
    element.dataset.motion = 'none';
    unavailable.hidden = state.status !== 'unavailable';
    if (!state.visible || !state.context) {
      clearFrame();
      unavailable.hidden = true;
    } else if (state.status === 'unavailable') {
      clearFrame();
      element.setAttribute('aria-label', 'Picture unavailable');
    } else if (state.status === 'ready' && state.artwork) {
      const frame = state.artwork;
      const next = prepared.get(frame.asset.url);
      if (next) {
        const previous = shown;
        const changed = shownURL !== frame.asset.url;
        cancelTransition();
        if (changed) {
          shown = next;
          shownURL = frame.asset.url;
          next.style.opacity = '1';
          element.append(next);
          const pilot = options.motionPilot && previous && previous !== next && !state.reducedMotion
            && frame.characterKey === PAL_EXPRESSION_MOTION_PILOT.characterKey
            && frame.form === PAL_EXPRESSION_MOTION_PILOT.form;
          if (pilot && typeof next.animate === 'function') {
            element.dataset.motion = 'expression-fade';
            const epoch = visualEpoch;
            transition = next.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: PAL_EXPRESSION_MOTION_PILOT.durationMs, easing: 'ease-out', fill: 'none',
            });
            void transition.finished.then(() => {
              if (disposed || epoch !== visualEpoch) return;
              previous.remove();
              transition = null;
              element.dataset.motion = 'none';
            }).catch(() => {});
          } else previous?.remove();
        }
        element.dataset.characterKey = frame.characterKey;
        element.dataset.form = frame.form;
        element.dataset.expression = frame.expression;
        element.dataset.sourceHash = frame.asset.sourceSHA256;
        element.dataset.assetVersion = PAL_ARTWORK_ASSET_VERSION;
        if (!options.decorative) {
          element.setAttribute('aria-label', `${frame.name}, ${frame.form === 'mature' ? 'Grown' : 'Base'}, ${LABELS[frame.expression]}`);
        }
      }
    }
    options.onStateChange?.(state);
  }
  const controller = createPalExpressionController({ resolver: options.resolver, load, onChange: paint });
  controller.setReducedMotion(reducedMotion.matches);
  const onMotionChange = () => {
    if (reducedMotion.matches) cancelTransition();
    controller.setReducedMotion(reducedMotion.matches);
  };
  const onVisibility = () => { void controller.setVisible(allowed && !document.hidden); };
  reducedMotion.addEventListener('change', onMotionChange);
  document.addEventListener('visibilitychange', onVisibility);
  void controller.setContext(options.context);
  if (document.hidden) void controller.setVisible(false);

  return {
    element,
    controller,
    setContext(context: Context) { return controller.setContext(context); },
    setVisible(value: boolean) {
      allowed = value;
      return controller.setVisible(value && !document.hidden);
    },
    preview: controller.preview,
    react: controller.react,
    reset: controller.reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reducedMotion.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibility);
      controller.dispose();
      clearFrame();
      element.remove();
    },
  };
}
