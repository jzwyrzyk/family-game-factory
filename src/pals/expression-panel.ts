import { type PalArtworkExpression, type PalArtworkForm, type PalArtworkResolver } from './artwork';
import { createPalArtworkView } from './artwork-view';
import './expression-panel.css';

const choices: readonly [PalArtworkExpression, string][] = [
  ['neutral', 'Ready'], ['celebrate', 'Celebrate'], ['thinking', 'Think'], ['encouraging_retry', 'Try again'],
];

/** Read-only view of one selected art identity; no collection mutation. */
export function createPalExpressionPanel(options: {
  resolver: PalArtworkResolver;
  scope: string;
  characterKey: string;
  form: PalArtworkForm;
  motionPilot?: boolean;
}) {
  const element = document.createElement('section');
  element.className = 'pal-expression-panel';
  const controls = document.createElement('div');
  controls.className = 'pal-expression-panel__controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Choose an expression');
  const buttons = new Map<PalArtworkExpression, HTMLButtonElement>();
  for (const [expression, caption] of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = caption;
    button.dataset.expressionChoice = expression;
    button.setAttribute('aria-pressed', String(expression === 'neutral'));
    controls.append(button);
    buttons.set(expression, button);
  }
  const status = document.createElement('p');
  status.className = 'pal-expression-panel__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Loading picture…';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload picture';
  reload.className = 'pal-expression-panel__reload';
  reload.hidden = true;
  let destroyed = false;
  const view = createPalArtworkView({
    resolver: options.resolver,
    context: { scope: options.scope, characterKey: options.characterKey, form: options.form },
    motionPilot: options.motionPilot,
    className: 'pal-expression-panel__portrait',
    onStateChange: next => {
      if (destroyed) return;
      for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === next.requestedExpression));
      if (next.status === 'loading') status.textContent = 'Loading picture…';
      else if (next.status === 'unavailable') status.textContent = 'Picture unavailable. Reload to try again.';
      else if (next.status === 'ready' && next.artwork?.fallbackReason) status.textContent = 'Showing this form’s regular picture instead.';
      else status.textContent = '';
      reload.hidden = next.status !== 'unavailable';
    },
  });
  for (const [expression, button] of buttons) button.addEventListener('click', () => {
    if (!destroyed) void view.preview(expression);
  });
  reload.addEventListener('click', () => {
    if (destroyed) return;
    // Keep a real, focusable retry target after a failed load. When successful,
    // restore focus to the selected expression rather than a hidden button.
    const requested = view.controller.state.requestedExpression;
    void view.preview(requested).then(success => {
      if (!destroyed && success) buttons.get(requested)?.focus({ preventScroll: true });
    });
  });
  element.append(view.element, controls, status, reload);
  return {
    element,
    preview(expression: PalArtworkExpression) { return view.preview(expression); },
    react: view.react,
    setContext(scope: string, characterKey: string, form: PalArtworkForm) {
      return view.setContext({ scope, characterKey, form });
    },
    setVisible: view.setVisible,
    reset: view.reset,
    dispose() { destroyed = true; view.dispose(); element.remove(); },
  };
}
