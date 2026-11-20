import type { PalArtworkResolver, PalArtworkExpression, PalArtworkForm } from './artwork';
import { createPalArtworkView } from './artwork-view';
import './expression-panel.css';

export interface PalExpressionPanelOptions {
  resolver: PalArtworkResolver;
  scope: string;
  characterKey: string;
  form: PalArtworkForm;
}

/** Explicit, reversible expression play for an already selected character.
 * This panel has no collect, equip, save or earning operation. */
export function createPalExpressionPanel(options: PalExpressionPanelOptions) {
  let retrying = false;
  const element = document.createElement('section');
  element.className = 'pal-expression-panel';
  element.setAttribute('aria-label', 'Pal expressions');
  const buttons = new Map<PalArtworkExpression, HTMLButtonElement>();
  const controls = document.createElement('div');
  controls.className = 'pal-expression-panel__controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Choose an expression');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'pal-expression-panel__retry';
  retry.textContent = 'Try loading again';
  retry.hidden = true;
  const portrait = createPalArtworkView({
    resolver: options.resolver,
    context: { scope: options.scope, characterKey: options.characterKey, form: options.form },
    motionPilot: true,
    onStateChange(state) {
      if (!state.visible || state.status === 'idle' || state.requestedExpression !== 'neutral') retrying = false;
      if (state.status === 'ready' || state.status === 'unavailable') {
        // Return focus only from this still-focused retry. Context/hide resets
        // clear retrying, and another focused control always keeps its focus.
        if (retrying && state.status === 'ready' && document.activeElement === retry
          && !document.hidden && element.isConnected && element.getClientRects().length) {
          buttons.get('neutral')?.focus({ preventScroll: true });
        }
        retrying = false;
      }
      retry.hidden = state.status !== 'unavailable' && !(retrying && document.activeElement === retry);
      if (retrying) retry.setAttribute('aria-disabled', 'true'); else retry.removeAttribute('aria-disabled');
      for (const [expression, button] of buttons) {
        button.setAttribute('aria-pressed', String(state.status === 'ready' && state.artwork?.expression === expression));
      }
    },
  });
  portrait.element.classList.add('pal-expression-panel__portrait');
  const labels = [
    ['neutral', 'Ready'], ['celebrate', 'Celebrate'], ['thinking', 'Think'], ['encouraging_retry', 'Try again'],
  ] as const;
  for (const [expression, label] of labels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.expression = expression;
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => { void portrait.preview(expression); };
    buttons.set(expression, button);
    controls.append(button);
  }
  retry.onclick = () => { if (!retrying) { retrying = true; void portrait.reset(); } };
  element.append(portrait.element, controls, retry);
  return {
    element,
    portrait,
    setSelection(selection: { scope: string; characterKey: string; form: PalArtworkForm }) {
      return portrait.setContext(selection);
    },
    setVisible: portrait.setVisible,
    dispose() { portrait.dispose(); element.remove(); },
  };
}
