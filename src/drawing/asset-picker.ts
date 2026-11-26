import type { ArtChoice } from '../creation/private-art';
import { artNameMatches, type DrawingCategory } from '../assets/private-drawings';

const categories: Record<DrawingCategory, string> = {
  character: 'Characters', vehicle: 'Vehicles', prop: 'Things', world: 'Worlds', other: 'Other art',
};

export function pickMatches(item: ArtChoice, search: string, category: string) {
  return (!category || item.category === category) &&
    (artNameMatches({name: item.label, semanticName: item.semanticName}, search) ||
     artNameMatches({name: item.assetName ?? item.label}, search));
}

/** A trusted host provides its own explicit use action for the exact revision on each card. */
export function showAssetPicker(controls: HTMLElement, choices: HTMLElement, status: HTMLElement,
  items: ArtChoice[], makeButton: (item: ArtChoice) => HTMLButtonElement, idPrefix = '') {
  controls.replaceChildren();
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Find my art';
  search.setAttribute('aria-label', 'Find my art in this picker');
  search.maxLength = 60;
  const category = document.createElement('select');
  category.setAttribute('aria-label', 'Art collection');
  category.add(new Option('All my art', ''));
  if (idPrefix) { search.id = idPrefix + 'Search'; category.id = idPrefix + 'Category'; }
  for (const [value, label] of Object.entries(categories)) category.add(new Option(label, value));
  controls.append(search, category);
  controls.hidden = !items.length;
  let limit = 12;
  const render = () => {
    choices.replaceChildren();
    const matching = items.filter(item => pickMatches(item, search.value, category.value));
    for (const item of matching.slice(0, limit)) choices.append(makeButton(item));
    status.textContent = !items.length ? 'No drawings yet. Add one in My Art.' : !matching.length ? 'Try another name or collection.' : '';
    if (matching.length > limit) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'creation-button';
      more.textContent = 'More art';
      more.onclick = () => {
        const firstNew = limit;
        limit += 12;
        render();
        (choices.children[firstNew] as HTMLElement | undefined)?.focus();
      };
      choices.append(more);
    }
  };
  search.oninput = category.onchange = () => { limit = 12; render(); };
  render();
}
