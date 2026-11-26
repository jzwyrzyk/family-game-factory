import {mountCreativeAssetPicker,type CreativePickerOptions} from '../drawing/asset-collection';
import type { CreativeAssetChoice } from './creative-library';
import './creative-picker.css';

export function filterCreativeChoices(items: readonly CreativeAssetChoice[], search: string, category: string) {
  const term = search.trim().toLowerCase();
  return items.filter(item => (!category || category === item.category)
    && [item.label, item.logicalName, item.semanticIdentity].some(value => value?.toLowerCase().includes(term)));
}

/** Loads only the visible batch of thumbnails. The parent handles the selected immutable pin. */
export function renderCreativePicker(
  controls: HTMLElement, grid: HTMLElement, status: HTMLElement, items: readonly CreativeAssetChoice[],
  card: (item: CreativeAssetChoice) => HTMLButtonElement,
  options:Partial<CreativePickerOptions> = {},
) {
  return mountCreativeAssetPicker(controls,items,{...options,onChoose:()=>{},card,layout:{controls,results:grid,status}});
}
