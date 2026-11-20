import { loadApprovedPalArtwork } from './approved-artwork';
import type { PalArtworkForm, PalArtworkResolver } from './artwork';
import { createPalExpressionPanel } from './expression-panel';
import { PAL_EXPRESSION_MOTION_PILOT } from './artwork-view';
import './expression-explorer.css';

/** A read-only playground for approved art identities. Choosing a character or
 * Grown here never equips a saved companion or changes earned progress. */
export function createPalExpressionExplorer(initialScope: string) {
  let scope = initialScope, visible = false, disposed = false, epoch = 0;
  let resolver: PalArtworkResolver | null = null;
  let panel: ReturnType<typeof createPalExpressionPanel> | null = null;
  let pending = false;
  const element = document.createElement('details');
  element.className = 'pal-expression-explorer';
  const summary = document.createElement('summary');
  summary.textContent = 'Try Pal expressions';
  summary.dataset.palsFocus = 'expressions';
  const body = document.createElement('div');
  body.className = 'pal-expression-explorer__body';
  const intro = document.createElement('p');
  intro.textContent = 'Choose a Pal and a form.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try loading again';
  retry.hidden = true;
  const choices = document.createElement('div');
  choices.className = 'pal-expression-explorer__choices';
  choices.hidden = true;
  const palLabel = document.createElement('label');
  palLabel.textContent = 'Pal';
  const pal = document.createElement('select');
  pal.dataset.palExpressionCharacter = '';
  pal.dataset.palsFocus = 'expression-character';
  palLabel.append(pal);
  const formLabel = document.createElement('label');
  formLabel.textContent = 'Form';
  const form = document.createElement('select');
  form.dataset.palExpressionForm = '';
  form.dataset.palsFocus = 'expression-form';
  for (const [value, label] of [['base', 'Base'], ['mature', 'Grown']] as const) {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; form.append(option);
  }
  formLabel.append(form);
  choices.append(palLabel, formLabel);
  const stage = document.createElement('div');
  body.append(intro, status, retry, choices, stage);
  element.append(summary, body);

  function selection() {
    return { scope, characterKey: pal.value, form: form.value as PalArtworkForm };
  }
  function renderPanel() {
    if (!resolver || !visible || !element.open || disposed) return;
    if (!panel) {
      panel = createPalExpressionPanel({ resolver, ...selection() });
      stage.replaceChildren(panel.element);
    } else {
      void panel.setSelection(selection());
      void panel.setVisible(true);
    }
  }
  async function open() {
    if (disposed || !visible || !element.open) return;
    if (resolver) { renderPanel(); return; }
    if (pending) return;
    const captured = ++epoch;
    const retryOwnedFocus = document.activeElement === retry;
    pending = true;
    status.textContent = 'Opening the Pals…'; status.hidden = false;
    // Keep a focused retry in place while loading. Hiding it would drop keyboard
    // focus to the document, making later recovery indistinguishable from a
    // deliberate move elsewhere. pending still prevents duplicate requests.
    retry.hidden = !retryOwnedFocus;
    retry.setAttribute('aria-disabled', 'true');
    try {
      const loaded = await loadApprovedPalArtwork();
      if (disposed || captured !== epoch || !visible || !element.open) return;
      resolver = loaded;
      pal.replaceChildren(...loaded.manifest.characters.map(character => {
        const option = document.createElement('option');
        option.value = character.characterKey; option.textContent = character.name;
        return option;
      }));
      // The pilot opens on its exact approved identity. This is only a local
      // preview choice and is never a collection/ownership assignment.
      pal.value = PAL_EXPRESSION_MOTION_PILOT.characterKey;
      if (!pal.value) pal.selectedIndex = 0;
      form.value = 'base';
      choices.hidden = false; status.hidden = true;
      renderPanel();
      if (retryOwnedFocus && document.activeElement === retry && !document.hidden && element.isConnected) {
        pal.focus({ preventScroll: true });
      }
      retry.hidden = true;
    } catch {
      if (disposed || captured !== epoch) return;
      status.textContent = 'Pictures could not load. Try again.';
      status.hidden = false; retry.hidden = false;
    } finally {
      if (captured === epoch) { pending = false; retry.removeAttribute('aria-disabled'); }
    }
  }
  function pause() {
    epoch++; pending = false;
    retry.removeAttribute('aria-disabled');
    void panel?.setVisible(false);
  }
  const onToggle = () => { if (element.open && visible) void open(); else pause(); };
  element.addEventListener('toggle', onToggle);
  pal.onchange = form.onchange = () => { if (visible && element.open) renderPanel(); };
  retry.onclick = () => { void open(); };

  return {
    element,
    setScope(next: string) {
      if (next === scope || disposed) return;
      pause(); scope = next;
      panel?.dispose(); panel = null;
      element.open = false;
      pal.value = PAL_EXPRESSION_MOTION_PILOT.characterKey;
      form.value = 'base';
      status.hidden = true; retry.hidden = true;
    },
    setVisible(next: boolean) {
      if (disposed) return;
      visible = next;
      if (next && element.open) void open(); else pause();
    },
    dispose() {
      if (disposed) return;
      disposed = true; pause();
      element.removeEventListener('toggle', onToggle);
      panel?.dispose(); panel = null;
      element.remove();
    },
  };
}
