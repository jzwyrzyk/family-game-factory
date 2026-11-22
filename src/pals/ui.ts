import { PAL_CATALOG, palArtworkPath, palDefinition, palLine, type PalId, type PalLineKind } from './catalog';
import type { PalsView, PalPreferences, OwnedPalView, PalStage } from './model';
import type { PalArtworkExpression } from './artwork';
import './pals.css';

/** Read-only presentation. Only the trusted coordinator changes ownership or growth. */
export interface PalsViewState {
  owner: string;
  profile: PalsView | null;
  lifetimeGems: number | null;
  loading: boolean;
  saving?: boolean;
  error?: string;
}
type Action = void | Promise<unknown>;
export interface PalsPageOptions {
  state: PalsViewState;
  onBack: () => Action;
  onChooseStarter: (id: PalId, owner: string) => Action;
  onCollect: (id: PalId, owner: string) => Action;
  onEquip: (id: PalId, owner: string) => Action;
  onCreate: (id: PalId, owner: string) => Action;
  onPreferences: (patch: Partial<PalPreferences>, owner: string) => Action;
  onRetry: () => Action;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
};
const button = (label: string, key: string, className = 'pals-button') => {
  const result = el('button', className, label);
  result.type = 'button';
  result.dataset.palsFocus = key;
  return result;
};
const owned = (state: PalsViewState, id: PalId | null | undefined) => state.profile?.owned.find(item => item.id === id);
const ready = (state: PalsViewState) => !state.loading && !!state.profile && state.profile.owner === state.owner;
const count = (value: number) => new Intl.NumberFormat('en-US').format(value);
const portraitRequests = new WeakMap<HTMLElement, number>();
const portraitTimeouts = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function retirePortrait(portrait: HTMLElement) {
  portraitRequests.set(portrait, (portraitRequests.get(portrait) ?? 0) + 1);
  clearTimeout(portraitTimeouts.get(portrait));
  portraitTimeouts.delete(portrait);
  const image = portrait.querySelector('img');
  if (image) image.onload = image.onerror = null;
  // A native decode already in progress cannot be cancelled here. Its existing
  // request guard prevents a retired portrait from changing state or falling back.
}

/** Exact approved character/form artwork. Cards load on demand; a failed reaction
 * falls back only to this same character's same-form neutral. */
export function createPalPortrait(id: PalId, stage: PalStage = 1, className = '', expression: PalArtworkExpression = 'neutral', eager = false): HTMLElement {
  const definition = palDefinition(id);
  const portrait = el('span', `pals-portrait ${className}`);
  portrait.dataset.pal = id;
  portrait.dataset.stage = String(stage);
  portrait.dataset.form = stage === 2 ? 'mature' : 'base';
  portrait.dataset.artwork = definition.artwork.status;
  portrait.dataset.characterKey = definition.artwork.characterKey;
  portrait.dataset.assetVersion = definition.artwork.assetVersion;
  portrait.setAttribute('aria-hidden', 'true');
  const image = el('img');
  image.alt = '';
  image.width = 240;
  image.height = 240;
  image.decoding = 'async';
  image.loading = eager ? 'eager' : 'lazy';
  const unavailable = el('span', 'pals-picture-unavailable', 'Picture unavailable');
  unavailable.hidden = true;
  portrait.append(image, unavailable);
  setPortraitExpression(portrait, expression);
  return portrait;
}

function setPortraitExpression(portrait: HTMLElement, expression: PalArtworkExpression) {
  const id = portrait.dataset.pal as PalId, form = portrait.dataset.form === 'mature' ? 'mature' : 'base';
  const image = portrait.querySelector('img')!, unavailable = portrait.querySelector<HTMLElement>('.pals-picture-unavailable')!;
  const neutral = new URL(palArtworkPath(id, form), document.baseURI).href;
  const requested = new URL(palArtworkPath(id, form, expression), document.baseURI).href;
  const request = (portraitRequests.get(portrait) ?? 0) + 1;
  portraitRequests.set(portrait, request);
  const clearLoadTimeout = () => { clearTimeout(portraitTimeouts.get(portrait)); portraitTimeouts.delete(portrait); };
  clearLoadTimeout();
  image.hidden = false; unavailable.hidden = true;
  portrait.dataset.expression = requested === neutral ? 'neutral' : expression;
  portrait.dataset.state = 'loading';
  const changed = () => portrait.dispatchEvent(new Event('pal-picture-state', { bubbles: true }));
  const boundLoad = () => {
    // Offscreen lazy cards must not time out before the browser requests them.
    // The selected detail is eager and has the same bounded wait as previews.
    if (image.loading === 'eager') portraitTimeouts.set(portrait, setTimeout(() => failed(), 8000));
  };
  const failed = (failedURL = image.src) => {
    if (portraitRequests.get(portrait) !== request || image.src !== failedURL) return;
    clearLoadTimeout();
    if (image.src !== neutral) {
      portrait.dataset.expression = 'neutral'; image.src = neutral; boundLoad();
    } else {
      image.hidden = true; unavailable.hidden = false; portrait.dataset.state = 'unavailable';
    }
    changed();
  };
  image.onload = () => {
    const decodedURL = image.src;
    if (portraitRequests.get(portrait) !== request) return;
    void image.decode().then(() => {
      if (portraitRequests.get(portrait) !== request || image.src !== decodedURL) return;
      clearLoadTimeout();
      image.hidden = false; unavailable.hidden = true;
      portrait.dataset.state = 'ready'; changed();
    }).catch(() => failed(decodedURL));
  };
  image.onerror = () => failed();
  changed();
  image.src = requested;
  boundLoad();
}

function progress(value: number, max: number, label: string) {
  const meter = el('progress', 'pals-progress');
  meter.max = Math.max(1, max);
  meter.value = Math.max(0, Math.min(value, meter.max));
  meter.setAttribute('aria-label', label);
  return meter;
}

function growthCopy(pal: OwnedPalView): string {
  return pal.nextStageAt === null ? `${count(pal.adventures)} adventures together` : `${count(pal.adventuresToNext)} more adventures to Grown`;
}

/** A complete collection page with no modal takeover and no mutations on render. */
export function createPalsPage(options: PalsPageOptions) {
  let state = options.state;
  let selection: PalId | null = state.profile?.activeId ?? null;
  let localSaving = false;
  let localError = '';
  let epoch = 0;
  let disposed = false;
  let pendingFocus = '';
  let playCount = 0;
  let playLine = '';
  let playPal: PalId | null = null;
  let playTimer: ReturnType<typeof setTimeout> | undefined;
  let playGeneration = 0;
  let pendingReaction: { generation: number; id: PalId; owner: string; form: string } | null = null;
  let optionsOpen = false;
  let growthOpen = false;
  let expressionsOpen = false;
  let expression: PalArtworkExpression = 'neutral';
  const portraits = new Map<string, HTMLElement>();
  const usedPortraits = new Set<string>();
  const pictureRetries = new WeakSet<HTMLElement>();

  function pagePortrait(id: PalId, stage: PalStage, surface: 'gallery' | 'detail', requested: PalArtworkExpression = 'neutral') {
    const key = JSON.stringify([state.owner, surface, id, stage]);
    usedPortraits.add(key);
    let portrait = portraits.get(key);
    if (!portrait) {
      portrait = createPalPortrait(id, stage, surface === 'detail' ? 'pals-hero-portrait' : '', requested, surface === 'detail');
      portraits.set(key, portrait);
    } else {
      const url = new URL(palArtworkPath(id, stage === 2 ? 'mature' : 'base', requested), document.baseURI).href;
      // Ordinary progress/saving renders retain the same decoded or pending
      // image, including an honest failure. Explicit expression/retry actions
      // still use the original loader rather than silently retrying on render.
      if (portrait.querySelector('img')!.src !== url) setPortraitExpression(portrait, requested);
    }
    return portrait;
  }
  function retireUnusedPortraits() {
    for (const [key, portrait] of portraits) {
      if (usedPortraits.has(key)) continue;
      retirePortrait(portrait); pictureRetries.delete(portrait); portraits.delete(key);
    }
  }

  const element = el('section', 'page hidden jems-pals');
  element.id = 'page-jems-pals';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'jemsPalsTitle');
  element.addEventListener('pal-picture-state', event => {
    if (disposed || element.hidden) return;
    const portrait = event.target;
    if (!(portrait instanceof HTMLElement) || !portrait.classList.contains('pals-hero-portrait')) return;
    expression = portrait.dataset.expression as PalArtworkExpression;
    syncExpressionControls();
    const pending = pendingReaction;
    if (!pending || portrait.dataset.state === 'loading') return;
    pendingReaction = null;
    if (portrait.dataset.state !== 'ready' || expression !== 'celebrate' || element.hidden || disposed
      || pending.generation !== playGeneration || pending.owner !== state.owner || pending.id !== selection
      || pending.form !== owned(state, selection)?.form) return;
    const toy = element.querySelector<HTMLElement>('#jemsPalPlay');
    if (toy) { void toy.offsetWidth; toy.classList.add('is-playing'); }
    // A slow first request gets the same visible hold as a cached reaction.
    playTimer = setTimeout(() => {
      toy?.classList.remove('is-playing');
      if (!disposed && pending.generation === playGeneration && pending.owner === state.owner
        && pending.id === selection && pending.form === owned(state, selection)?.form) previewExpression('neutral');
    }, 1600);
  });

  const header = el('div', 'pals-page-heading');
  const titleBlock = el('div');
  const back = button('← My games', 'back', 'pals-button pals-quiet');
  back.id = 'jemsPalsBack';
  back.onclick = () => { void perform(() => options.onBack()); };
  const heading = el('h1', '', 'My Pals');
  heading.id = 'jemsPalsTitle';
  heading.tabIndex = -1;
  const intro = el('p', 'pals-lead');
  titleBlock.append(heading, intro);
  const total = el('span', 'pals-collection-count');
  total.id = 'jemsPalsCount';
  header.append(titleBlock, total);

  const message = el('div', 'pals-status');
  message.id = 'jemsPalsStatus';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.setAttribute('aria-atomic', 'true');
  const retry = button('Try again', 'retry');
  retry.onclick = () => { void perform(options.onRetry); };
  const content = el('div', 'pals-content');
  element.append(back, header, message, retry, content);

  function focusKey() {
    const target = document.activeElement;
    return target instanceof HTMLElement && element.contains(target) ? target.dataset.palsFocus ?? '' : '';
  }
  function restoreFocus(key: string) {
    if (!key || element.hidden) return;
    const target = Array.from(element.querySelectorAll<HTMLElement>('[data-pals-focus]')).find(item => item.dataset.palsFocus === key);
    if (target && !('disabled' in target && target.disabled)) target.focus({ preventScroll: true });
    else if (/^(starter|equip|equip-detail)-/.test(key)) element.querySelector<HTMLElement>('#jemsPalDetailTitle')?.focus();
    else if (key.startsWith('collect-')) {
      const detailKey = `details-${key.slice('collect-'.length)}`;
      Array.from(element.querySelectorAll<HTMLElement>('[data-pals-focus]')).find(item => item.dataset.palsFocus === detailKey)?.focus({ preventScroll: true });
    }
  }
  async function perform(action: () => Action) {
    if (disposed || localSaving || state.saving) return;
    const capturedOwner = state.owner, capturedEpoch = epoch;
    pendingFocus = focusKey();
    localSaving = true;
    localError = '';
    render();
    try { await action(); }
    catch (error) {
      if (!disposed && capturedEpoch === epoch && capturedOwner === state.owner) localError = error instanceof Error ? error.message : 'That could not be saved. Please try again.';
    } finally {
      if (!disposed && capturedEpoch === epoch && capturedOwner === state.owner) {
        localSaving = false;
        render();
        restoreFocus(pendingFocus);
        pendingFocus = '';
      }
    }
  }
  function actionButton(label: string, key: string, action: () => Action, primary = false) {
    const result = button(label, key, `pals-button${primary ? ' pals-primary' : ''}`);
    result.disabled = localSaving || !!state.saving || !ready(state);
    result.onclick = () => { void perform(action); };
    return result;
  }
  function select(id: PalId) {
    if (selection !== id) { cancelReaction(); playLine = ''; playPal = null; expression = 'neutral'; expressionsOpen = false; }
    selection = id;
    render();
  }
  function play(id: PalId) {
    if (disposed || !owned(state, id) || localSaving || state.saving) return;
    playPal = id;
    playLine = palLine(id, 'play', playCount++);
    const line = element.querySelector<HTMLElement>('#jemsPalPlayLine');
    if (line) { line.textContent = playLine; line.hidden = false; }
    const toy = element.querySelector<HTMLElement>('#jemsPalPlay');
    cancelReaction();
    toy?.classList.remove('is-playing');
    pendingReaction = { generation: playGeneration, id, owner: state.owner, form: owned(state, id)!.form };
    previewExpression('celebrate', true);
  }

  function cancelReaction() {
    if (playTimer) clearTimeout(playTimer);
    playTimer = undefined; pendingReaction = null; playGeneration++;
    element.querySelector('#jemsPalPlay')?.classList.remove('is-playing');
  }
  function previewExpression(next: PalArtworkExpression, fromTap = false) {
    if (!fromTap) cancelReaction();
    expression = next;
    const portrait = element.querySelector<HTMLElement>('.pals-hero-portrait');
    if (portrait) setPortraitExpression(portrait, next);
    syncExpressionControls();
  }
  function syncExpressionControls() {
    element.querySelectorAll<HTMLButtonElement>('[data-expression]').forEach(control => {
      control.setAttribute('aria-pressed', String(control.dataset.expression === expression));
    });
  }

  function render() {
    if (disposed) return;
    const previousFocus = focusKey();
    const isReady = ready(state), busy = localSaving || !!state.saving;
    element.setAttribute('aria-busy', String(state.loading || busy));
    element.dataset.owner = state.owner;
    back.disabled = busy;
    const error = localError || state.error || '';
    message.textContent = error || (state.loading ? 'Opening your saved Pals…' : busy ? 'Saving…' : '');
    message.classList.toggle('is-error', !!error);
    message.hidden = !message.textContent;
    retry.hidden = !error;
    retry.disabled = busy || state.loading;
    total.textContent = isReady ? `${state.profile!.owned.length} / ${PAL_CATALOG.length} Pals` : 'Your collection';
    heading.textContent = isReady && !state.profile!.starterId ? 'Choose your Pal' : 'My Pals';
    intro.textContent = isReady && !state.profile!.starterId ? 'Your first Pal is free.' : '';
    intro.hidden = !intro.textContent;
    usedPortraits.clear();
    content.replaceChildren();
    if (!isReady) {
      content.append(el('div', 'pals-loading', state.loading ? 'Your crew will be right here.' : 'Your saved collection has not been replaced.'));
      retireUnusedPortraits();
      restoreFocus(previousFocus);
      return;
    }
    const profile = state.profile!;
    if (selection === null || !PAL_CATALOG.some(pal => pal.id === selection)) selection = profile.activeId;
    const selectedOwned = owned(state, selection);
    if (profile.starterId && selectedOwned) {
      content.append(detail(selectedOwned, previousFocus));
    }

    const starterGrid = el('div', 'pals-grid pals-starter-grid');
    starterGrid.setAttribute('role', 'group');
    starterGrid.setAttribute('aria-label', 'Free starter Pals');
    if (!profile.starterId) content.append(starterGrid);

    const shelf = el('section', 'pals-shelf');
    shelf.setAttribute('aria-labelledby', 'jemsPalsShelfTitle');
    const shelfHeading = el('div', 'pals-section-heading');
    const h2 = el('h2', '', profile.starterId ? 'Meet the Pals' : 'More Pals to meet');
    h2.id = 'jemsPalsShelfTitle';
    const gemCount = el('span', 'pals-gem-count', state.lifetimeGems === null ? 'Gems are loading…' : `${count(state.lifetimeGems)} lifetime gems`);
    shelfHeading.append(h2, gemCount);
    const grid = el('div', 'pals-grid');
    for (const definition of PAL_CATALOG) {
      const pal = owned(state, definition.id), available = profile.availableIds.includes(definition.id);
      const starter = !profile.starterId && definition.starter;
      const card = el('article', 'pals-card');
      card.dataset.pal = definition.id;
      card.dataset.owned = String(!!pal);
      card.dataset.active = String(profile.activeId === definition.id);
      card.classList.toggle('is-selected', selection === definition.id && !!pal);
      const badge = el('span', 'pals-card-badge', starter ? 'Free starter' : pal ? profile.activeId === pal.id ? 'Your active Pal' : pal.stageName : available ? 'Ready to meet' : `${definition.unlockGems} gems`);
      const art = pal ? button('', `details-${definition.id}`, 'pals-card-art') : el('div', 'pals-card-art');
      art.append(pagePortrait(definition.id, pal?.stage ?? 1, 'gallery'));
      if (art instanceof HTMLButtonElement) {
        art.setAttribute('aria-label', `Show ${definition.name} and progress`);
        art.setAttribute('aria-pressed', String(selection === definition.id));
        art.disabled = busy;
        art.onclick = () => {
          select(definition.id);
          // A large roster can put the chosen card far below its detail. This
          // explicit inspection brings the selected character into view.
          element.querySelector<HTMLElement>('#jemsPalDetailTitle')?.focus();
        };
      }
      const name = el('h3', '', definition.name);
      card.append(badge, art, name);
      const actions = el('div', 'pals-card-actions');
      if (starter) {
        actions.append(actionButton(`Choose ${definition.name}`, `starter-${definition.id}`, () => options.onChooseStarter(definition.id, state.owner), true));
      } else if (pal) {
        const text = el('p', 'pals-card-progress', pal.nextStageAt === null ? `Grown · ${count(pal.adventures)} adventures` : `${count(pal.adventures)} / ${pal.nextStageAt} adventures`);
        actions.append(text);
        if (pal.nextStageAt !== null) actions.append(progress(pal.adventures, pal.nextStageAt, `${definition.name}: ${pal.adventures} of ${pal.nextStageAt} adventures`));
        if (profile.activeId !== definition.id) actions.append(actionButton('Take along', `equip-${definition.id}`, () => options.onEquip(definition.id, state.owner)));
        else {
          const active = el('span', 'pals-active-mark', '✓ Your active Pal');
          actions.append(active);
        }
        actions.append(actionButton('Create with this Pal', `create-card-${definition.id}`, () => options.onCreate(definition.id, state.owner), true));
      } else if (available) {
        actions.append(actionButton(`Welcome ${definition.name}`, `collect-${definition.id}`, () => options.onCollect(definition.id, state.owner), true));
      } else {
        const remaining = state.lifetimeGems === null ? null : Math.max(0, definition.unlockGems - state.lifetimeGems);
        if (profile.starterId) actions.append(el('p', 'pals-unlock-copy', remaining === null ? 'Checking your gems…' : `${count(remaining)} more gems`));
      }
      card.append(actions);
      (starter ? starterGrid : grid).append(card);
    }
    shelf.append(shelfHeading, grid);
    content.append(shelf);
    content.append(explainer(), preferences());
    retireUnusedPortraits();
    restoreFocus(previousFocus);
  }

  function detail(pal: OwnedPalView, previousFocus: string) {
    const definition = palDefinition(pal.id), profile = state.profile!;
    const hero = el('section', 'pals-detail');
    hero.setAttribute('aria-labelledby', 'jemsPalDetailTitle');
    hero.dataset.pal = pal.id;
    hero.dataset.stage = String(pal.stage);
    const playground = el('div', 'pals-playground');
    const toy = button(`Play with ${definition.name}`, `play-${pal.id}`, 'pals-play-button');
    toy.id = 'jemsPalPlay';
    toy.textContent = '';
    toy.setAttribute('aria-label', `Tap ${definition.name} for a playful reaction`);
    toy.disabled = localSaving || !!state.saving;
    const portrait = pagePortrait(pal.id, pal.stage, 'detail', expression);
    toy.append(portrait);
    toy.onclick = () => play(pal.id);
    const pictureRetry = button('Retry picture', `picture-retry-${pal.id}`);
    pictureRetry.hidden = true;
    pictureRetry.onclick = () => {
      if (pictureRetries.has(portrait)) return;
      pictureRetries.add(portrait); previewExpression('neutral');
    };
    const syncPictureRetry = (restoreRetryFocus = false) => {
      const status = portrait.dataset.state;
      if (status === 'ready' || status === 'unavailable') pictureRetries.delete(portrait);
      const retryingPicture = pictureRetries.has(portrait);
      // Only the keyboard user still on this retry returns to the Pal. A late
      // image response cannot steal focus from navigation or another control.
      if (status === 'ready' && document.activeElement === pictureRetry && !element.hidden && portrait.isConnected) {
        toy.focus({ preventScroll: true });
      }
      pictureRetry.hidden = status !== 'unavailable' && !(retryingPicture && (document.activeElement === pictureRetry || restoreRetryFocus));
      pictureRetry.setAttribute('aria-disabled', String(retryingPicture));
    };
    // The portrait survives ordinary renders; its controls and listeners do not.
    // Listen on this detail container so old retry/toy controls cannot accumulate.
    hero.addEventListener('pal-picture-state', () => syncPictureRetry());
    syncPictureRetry(previousFocus === `picture-retry-${pal.id}` && pictureRetries.has(portrait));
    const hint = el('span', 'pals-tap-hint', `Tap ${definition.name}`);
    const speech = el('p', 'pals-play-line', playPal === pal.id && playLine ? playLine : '');
    speech.hidden = !speech.textContent;
    speech.id = 'jemsPalPlayLine';
    speech.setAttribute('role', 'status');
    speech.setAttribute('aria-live', 'polite');
    speech.setAttribute('aria-atomic', 'true');
    playground.append(toy, hint, pictureRetry, speech);
    const info = el('div', 'pals-detail-copy');
    const title = el('h2', '', definition.name);
    title.id = 'jemsPalDetailTitle';
    title.tabIndex = -1;
    info.append(title);
    const trail = el('ol', 'pals-growth-stages');
    trail.setAttribute('aria-label', `${definition.name}'s growth stages`);
    for (const [index, label] of ['Base', 'Grown'].entries()) {
      const step = el('li');
      step.dataset.earned = String(index + 1 <= pal.stage);
      if (index + 1 === pal.stage) step.setAttribute('aria-current', 'step');
      step.append(el('span', 'pals-stage-dot', index + 1 <= pal.stage ? '✓' : String(index + 1)), el('span', '', label));
      if (index + 1 > pal.stage) step.append(el('span', 'pals-sr-only', ' · upcoming'));
      trail.append(step);
    }
    info.append(trail);
    const growth = el('div', 'pals-growth');
    growth.append(el('strong', '', growthCopy(pal)));
    if (pal.nextStageAt !== null) {
      growth.append(progress(pal.adventures, pal.nextStageAt, `${definition.name} growth: ${pal.adventures} of ${pal.nextStageAt} adventures`));
    }
    info.append(growth);
    const actions = el('div', 'pals-detail-actions');
    actions.append(actionButton(`Create with ${definition.name}`, `create-${pal.id}`, () => options.onCreate(pal.id, state.owner), true));
    if (profile.activeId !== pal.id) actions.append(actionButton(`Take ${definition.name} along`, `equip-detail-${pal.id}`, () => options.onEquip(pal.id, state.owner)));
    info.append(actions);
    const expressionChoices = [
      ['neutral', 'Ready'], ['celebrate', 'Celebrate'], ['thinking', 'Think'], ['encouraging_retry', 'Try again'],
    ] as const;
    if (expressionChoices.some(([value]) => palArtworkPath(pal.id, pal.form, value) !== palArtworkPath(pal.id, pal.form))) {
      const expressions = el('details', 'pals-expression-options');
      expressions.open = expressionsOpen;
      expressions.addEventListener('toggle', () => { if (expressions.isConnected) expressionsOpen = expressions.open; });
      const summary = el('summary', '', 'Try expressions');
      summary.dataset.palsFocus = 'expressions';
      const controls = el('div', 'pals-expression-controls');
      controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', `${definition.name}'s expressions`);
      for (const [value, label] of expressionChoices) {
        const control = button(label, `expression-${value}`);
        control.dataset.expression = value;
        control.setAttribute('aria-pressed', String(value === expression));
        control.onclick = () => { previewExpression(value); };
        controls.append(control);
      }
      expressions.append(summary, controls); info.append(expressions);
    }
    hero.append(playground, info);
    return hero;
  }

  function explainer() {
    const details = el('details', 'pals-explainer');
    details.open = growthOpen;
    details.addEventListener('toggle', () => { growthOpen = details.open; });
    const summary = el('summary', '', 'How do Pals grow?');
    summary.dataset.palsFocus = 'growth-help';
    const body = el('div');
    body.append(el('p', '', 'Take a Pal along while you learn and make. Every 5 saved Math or English activities, each new coding challenge, or a developed game adds an adventure. Using help still counts.'));
    body.append(el('p', '', 'Your Pal grows from Base to Grown at 5 adventures. There are two forms. Tapping your Pal is just for fun. Progress stays when you take a break.'));
    details.append(summary, body);
    return details;
  }

  function preferences() {
    const details = el('details', 'pals-options');
    details.open = optionsOpen;
    details.addEventListener('toggle', () => { optionsOpen = details.open; });
    const summary = el('summary', '', 'Companion options');
    summary.dataset.palsFocus = 'options';
    const body = el('div', 'pals-preferences');
    for (const [key, label, explanation] of [
      ['showCompanion', 'Show my Pal beside games', 'Your collection stays available in My Pals.'],
      ['encouragement', 'Funny encouragement', 'Short reactions while you make and learn.'],
    ] as const) {
      const row = el('label', 'pals-preference');
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.profile!.preferences[key];
      checkbox.disabled = localSaving || !!state.saving;
      checkbox.dataset.palsFocus = `preference-${key}`;
      checkbox.id = `jemsPalPreference-${key}`;
      const copy = el('span');
      copy.append(el('strong', '', label), el('small', '', explanation));
      checkbox.onchange = () => { const checked = checkbox.checked; void perform(() => options.onPreferences({ [key]: checked }, state.owner)); };
      row.append(checkbox, copy);
      body.append(row);
    }
    details.append(summary, body);
    return details;
  }

  render();
  return {
    element,
    update(next: PalsViewState) {
      if (disposed) return;
      if (next.owner !== state.owner) {
        cancelReaction();
        epoch++;
        selection = next.profile?.activeId ?? null;
        localSaving = false;
        localError = '';
        pendingFocus = '';
        playLine = '';
        playPal = null;
        playCount = 0;
        optionsOpen = growthOpen = expressionsOpen = false;
        expression = 'neutral';
        if (playTimer) clearTimeout(playTimer);
      } else if (state.profile?.activeId !== next.profile?.activeId && next.profile?.activeId) {
        cancelReaction(); selection = next.profile.activeId; expression = 'neutral'; expressionsOpen = false;
      } else if (owned(state, selection)?.form !== owned(next, selection)?.form) { cancelReaction(); expression = 'neutral'; }
      state = next;
      render();
    },
    show() { element.hidden = false; element.classList.remove('hidden'); render(); heading.focus({ preventScroll: true }); },
    hide() { cancelReaction(); element.hidden = true; element.classList.add('hidden'); expressionsOpen = false; expression = 'neutral'; },
    dispose() { disposed = true; epoch++; cancelReaction(); usedPortraits.clear(); retireUnusedPortraits(); element.remove(); },
  };
}

export function createPalsWidget(options: { state: PalsViewState; onOpen: () => void; onCreate?: (id: PalId, owner: string) => void }) {
  let state = options.state;
  const element = el('section', 'pals-home-widget');
  element.setAttribute('aria-label', 'My Pals');
  const open = button('', 'open-pals', 'pals-widget-open');
  open.onclick = options.onOpen;
  const make = button('Create together', 'widget-create', 'pals-button');
  make.onclick = () => { const id = state.profile?.activeId; if (id && ready(state) && !state.saving) options.onCreate?.(id, state.owner); };
  element.append(open, make);
  function update(next: PalsViewState) {
    state = next;
    const pal = owned(state, state.profile?.activeId);
    open.replaceChildren();
    const copy = el('span', 'pals-widget-copy');
    if (ready(state) && pal) {
      const definition = palDefinition(pal.id);
      open.append(createPalPortrait(pal.id, pal.stage));
      copy.append(el('strong', '', definition.name), el('span', '', pal.stageName));
    } else {
      copy.append(el('strong', '', 'My Pals'), el('span', '', state.loading ? 'Opening your crew…' : state.error ? 'Open your collection to retry' : 'Choose your free Pal'));
    }
    open.append(copy, el('span', 'pals-widget-arrow', '→'));
    make.hidden = !options.onCreate || !pal || !ready(state);
    make.disabled = !!state.saving;
    element.dataset.owner = state.owner;
  }
  update(state);
  return { element, update, dispose() { element.remove(); } };
}

/** Inline host cameo. The host explicitly hides it during learning and can supply an existing help action. */
export function createPalCameo(options: { state: PalsViewState; onOpen: () => void; onHelp?: () => void }) {
  let state = options.state;
  let allowed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const element = el('aside', 'pals-cameo');
  element.setAttribute('aria-label', 'Your Pal');
  const open = button('', 'cameo-open', 'pals-cameo-open');
  open.onclick = options.onOpen;
  const copy = el('span', 'pals-cameo-name');
  const speech = el('span', 'pals-cameo-line');
  speech.setAttribute('role', 'status');
  speech.setAttribute('aria-live', 'polite');
  speech.setAttribute('aria-atomic', 'true');
  speech.hidden = true;
  const help = button('Help', 'cameo-help', 'pals-button pals-quiet');
  help.hidden = !options.onHelp;
  help.onclick = () => options.onHelp?.();
  element.append(open, copy, speech, help);
  function visibility() { element.hidden = !allowed || !ready(state) || !state.profile?.activeId || !state.profile.preferences.showCompanion; }
  function clear() {
    if (timer) clearTimeout(timer); speech.textContent = ''; speech.hidden = true;
    const portrait = open.querySelector<HTMLElement>('.pals-portrait');
    if (portrait && portrait.dataset.expression !== 'neutral') setPortraitExpression(portrait, 'neutral');
  }
  function update(next: PalsViewState) {
    if (state.owner !== next.owner || state.profile?.activeId !== next.profile?.activeId || !next.profile?.preferences.encouragement || !next.profile.preferences.showCompanion) clear();
    state = next;
    const pal = owned(state, state.profile?.activeId);
    open.replaceChildren();
    copy.textContent = '';
    if (pal) {
      const definition = palDefinition(pal.id);
      open.append(createPalPortrait(pal.id, pal.stage));
      open.setAttribute('aria-label', `Open My Pals. ${definition.name} is your active Pal.`);
      copy.textContent = definition.name;
    }
    visibility();
  }
  update(state);
  return {
    element, update,
    setVisible(value: boolean) { allowed = value; if (!value) clear(); visibility(); },
    say(kind: PalLineKind, seed: string | number = 0) {
      if (element.hidden || !state.profile?.activeId || !state.profile.preferences.encouragement || !ready(state)) return false;
      clear();
      speech.textContent = palLine(state.profile.activeId, kind, seed);
      speech.hidden = false;
      const portrait = open.querySelector<HTMLElement>('.pals-portrait');
      if (portrait) setPortraitExpression(portrait, kind === 'retry' ? 'encouraging_retry' : ['growth', 'practice', 'making', 'coding'].includes(kind) ? 'celebrate' : 'neutral');
      timer = setTimeout(clear, 8000);
      return true;
    },
    dispose() { clear(); element.remove(); },
  };
}
