import { DRAWING_CATEGORIES, type DrawingCategory } from './private-drawings';
import type { CreativeAssetChoice } from './creative-library';
import './creative-picker.css';

const categoryLabels: Record<DrawingCategory, string> = {
  character: 'Characters', prop: 'Things', vehicle: 'Vehicles', world: 'Worlds', other: 'Other art',
};

export function filterCreativeChoices(items: readonly CreativeAssetChoice[], search: string, category: string) {
  const term = search.trim().toLowerCase();
  return items.filter(item => (!category || category === item.category)
    && [item.label, item.logicalName, item.semanticIdentity].some(value => value?.toLowerCase().includes(term)));
}

/** Loads only the visible batch of thumbnails. The parent handles the selected immutable pin. */
export function renderCreativePicker(
  controls: HTMLElement, grid: HTMLElement, status: HTMLElement, items: readonly CreativeAssetChoice[],
  card: (item: CreativeAssetChoice) => HTMLButtonElement,
) {
  controls.replaceChildren();
  grid.replaceChildren();
  if (!items.length) return;
  controls.classList.add('creative-picker-tools');
  const search = document.createElement('input');
  search.type = 'search';
  search.maxLength = 60;
  search.setAttribute('aria-label', 'Find my art');
  search.placeholder = 'Find my art';
  const category = document.createElement('select');
  category.setAttribute('aria-label', 'Art collection');
  category.add(new Option('All my art', ''));
  for (const key of DRAWING_CATEGORIES) {
    if (items.some(item => item.category === key)) category.add(new Option(categoryLabels[key], key));
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'creation-button';
  more.textContent = 'Show more art';
  controls.append(search, category);
  let shown = 0;
  let matches: CreativeAssetChoice[] = [];
  const append = () => {
    more.remove();
    const batch = matches.slice(shown, shown + 12);
    grid.append(...batch.map(card));
    shown += batch.length;
    if (shown < matches.length) grid.append(more);
  };
  const refresh = () => {
    matches = filterCreativeChoices(items, search.value, category.value);
    status.textContent = matches.length ? '' : 'No art found. Try another name or collection.';
    grid.replaceChildren();
    shown = 0;
    append();
  };
  more.onclick = () => {
    const next = shown;
    append();
    (grid.children[next] as HTMLElement | undefined)?.focus();
  };
  search.oninput = refresh;
  category.onchange = refresh;
  refresh();
}
