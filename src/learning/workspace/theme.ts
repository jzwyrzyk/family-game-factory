import type { PalExpression, PalId } from '../../pals/catalog';
import type { PalStage } from '../../pals/model';

interface LearningTheme {
  readonly id: string;
  readonly counter: string;
  readonly noun: string;
}

// Only the host's game ID selects a local asset. Project titles, generated
// messages, assessment content and filenames from games never enter this map.
const fallback: LearningTheme = { id: 'jems', counter: 'learning-counters/gem_blue.webp', noun: 'gem' };
const themes = new Map<string, LearningTheme>([
  ['mining', { id: 'mining', counter: 'learning-counters/gem_gold.webp', noun: 'gem' }],
  ['factory', { id: 'factory', counter: 'learning-counters/gem_mint.webp', noun: 'gem' }],
  ['gum', { id: 'gum', counter: 'early-pictures/cube.webp', noun: 'block' }],
  ['dragon', { id: 'dragon', counter: 'early-pictures/flower.webp', noun: 'flower' }],
  ['moon', { id: 'moon', counter: 'early-pictures/star.webp', noun: 'star' }],
]);

export function learningTheme(gameId?: string): LearningTheme {
  return themes.get(gameId ?? '') ?? fallback;
}

export function applyLearningTheme(root: HTMLElement, gameId?: string) {
  const theme = learningTheme(gameId);
  root.dataset.learningTheme = theme.id;
  root.style.setProperty('--learning-counter-image', `url("${new URL(theme.counter, document.baseURI).href}")`);
}

export type WorkspacePalState = 'question' | 'hint' | 'worked' | 'incorrect' | 'correct';
const reactions: Record<WorkspacePalState, PalExpression> = {
  question: 'neutral', hint: 'thinking', worked: 'thinking', incorrect: 'encouraging_retry', correct: 'celebrate',
};

interface WorkspaceCompanion {
  owner: string;
  id: PalId;
  stage: PalStage;
  encouragement: boolean;
  portrait(expression: PalExpression): { element: HTMLElement; dispose(): void };
}
let companion: WorkspaceCompanion | null = null;
const listeners = new Set<() => void>();

/** Called by the trusted Pal host after resolving ownership, preferences and form.
 * The subject never receives the inventory and the portrait never receives an item. */
export function presentWorkspaceCompanion(selected: WorkspaceCompanion | null) {
  companion = selected;
  for (const update of listeners) update();
}

export function mountWorkspacePal(slot: HTMLElement, owner: string, hintButton?: HTMLButtonElement) {
  let state: WorkspacePalState = 'question';
  let currentKey = '', portrait: ReturnType<WorkspaceCompanion['portrait']> | undefined;
  slot.classList.add('learning-workspace-pal');
  slot.setAttribute('aria-hidden', 'true');
  function draw() {
    const selected = owner && companion?.owner === owner ? companion : null;
    slot.hidden = !selected;
    if (hintButton) {
      if (selected) hintButton.dataset.palHint = selected.id;
      else delete hintButton.dataset.palHint;
    }
    const expression = selected?.encouragement ? reactions[state] : 'neutral';
    const key = selected ? `${selected.id}/${selected.stage}/${expression}` : '';
    if (key === currentKey) return;
    currentKey = key;
    portrait?.dispose();
    portrait = selected?.portrait(expression);
    slot.replaceChildren(...(portrait ? [portrait.element] : []));
  }
  listeners.add(draw);
  draw();
  return {
    setState(next: WorkspacePalState) { state = next; if (listeners.has(draw)) draw(); },
    dispose() {
      listeners.delete(draw);
      portrait?.dispose();
      portrait = undefined;
      slot.replaceChildren();
      slot.hidden = true;
      if (hintButton) delete hintButton.dataset.palHint;
    },
  };
}
