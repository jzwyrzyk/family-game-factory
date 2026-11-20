import { loadApprovedPalArtwork } from './approved-artwork';
import { createPalExpressionPanel } from './expression-panel';
import type { PalArtworkForm, PalArtworkResolver } from './artwork';
import './expression-explorer.css';

/** Optional, read-only gallery with its own exact art identity. It does not
 * choose a starter, equip a Pal, unlock a growth stage or write a receipt. */
export function createPalExpressionExplorer(options: { owner: string }) {
  const element = document.createElement('details');
  element.className = 'pal-expression-explorer';
  const summary = document.createElement('summary');
  summary.textContent = 'Try Pal expressions';
  const body = document.createElement('div');
  body.className = 'pal-expression-explorer__body';
  const introduction = document.createElement('p');
  introduction.textContent = 'Choose a Pal, a form, and a face.';
  const message = document.createElement('p');
  message.className = 'pal-expression-explorer__status';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try loading again';
  retry.hidden = true;
  const selectors = document.createElement('div');
  selectors.className = 'pal-expression-explorer__choices';
  const characterLabel = document.createElement('label');
  characterLabel.textContent = 'Pal';
  const characterSelect = document.createElement('select');
  characterSelect.setAttribute('aria-label', 'Pal to preview');
  characterLabel.append(characterSelect);
  const formLabel = document.createElement('label');
  formLabel.textContent = 'Form';
  const formSelect = document.createElement('select');
  formSelect.setAttribute('aria-label', 'Pal form to preview');
  for (const [value, label] of [['base', 'Base'], ['mature', 'Grown']] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    formSelect.append(option);
  }
  formLabel.append(formSelect);
  selectors.append(characterLabel, formLabel);
  selectors.hidden = true;
  body.append(introduction, message, retry, selectors);
  element.append(summary, body);
  let owner = options.owner;
  let epoch = 0;
  let disposed = false;
  let visible = true;
  let resolver: PalArtworkResolver | null = null;
  let panel: ReturnType<typeof createPalExpressionPanel> | null = null;
  function clear() {
    panel?.dispose(); panel = null;
    resolver = null;
    characterSelect.replaceChildren();
    formSelect.value = 'base';
    selectors.hidden = true;
    message.textContent = '';
    retry.hidden = true;
  }
  async function open() {
    const captured = ++epoch;
    if (!element.open || !visible || disposed) return;
    message.textContent = 'Loading Pal pictures…';
    retry.hidden = true;
    try {
      const loaded = await loadApprovedPalArtwork();
      if (disposed || captured !== epoch || !element.open || !visible) return;
      resolver = loaded;
      if (!characterSelect.options.length) {
        for (const character of resolver.manifest.characters) {
          const option = document.createElement('option');
          option.value = character.characterKey;
          option.textContent = character.name;
          characterSelect.append(option);
        }
      }
      const wink = resolver.manifest.characters.find(c => c.slug === 'wink');
      if (wink) characterSelect.value = wink.characterKey;
      const selected = resolver.manifest.characters.find(c => c.characterKey === characterSelect.value);
      if (!selected) throw Error('No character found in the approved collection.');
      selectors.hidden = false;
      panel?.dispose();
      panel = createPalExpressionPanel({
        resolver,
        scope: owner,
        characterKey: selected.characterKey,
        form: formSelect.value as PalArtworkForm,
        motionPilot: true,
      });
      body.append(panel.element);
      message.textContent = '';
    } catch {
      if (disposed || captured !== epoch || !element.open || !visible) return;
      message.textContent = 'The pictures are unavailable right now.';
      retry.hidden = false;
    }
  }
  function choose() {
    if (disposed || !panel || !resolver) return;
    const current = resolver.manifest.characters.find(x => x.characterKey === characterSelect.value);
    if (!current) return;
    void panel.setContext(owner, current.characterKey, formSelect.value as PalArtworkForm);
  }
  characterSelect.addEventListener('change', choose);
  formSelect.addEventListener('change', choose);
  retry.addEventListener('click', () => {
    void open().then(() => {
      if (!disposed && panel) characterSelect.focus({ preventScroll: true });
    });
  });
  element.addEventListener('toggle', () => {
    if (element.open) void open();
    else {
      ++epoch;
      panel?.dispose(); panel = null;
      selectors.hidden = true;
      message.textContent = '';
    }
  });
  return {
    element,
    updateOwner(nextOwner: string) {
      if (disposed || owner === nextOwner) return;
      owner = nextOwner;
      ++epoch;
      element.open = false;
      clear();
    },
    show() { visible = true; if (element.open) void open(); },
    hide() { visible = false; ++epoch; void panel?.setVisible(false); },
    dispose() { disposed = true; ++epoch; clear(); element.remove(); },
  };
}
