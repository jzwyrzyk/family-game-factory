import { createJourneyGem, createJourneyRankThumbnail, type JourneyState } from '../brand/journey';
import { GEM_MILESTONE_START, REWARD_AMOUNTS, type RewardGrant, type RewardsSummary } from './model';
import { createGuideCard, type GuideHost } from '../studio/guide-card';
import './rewards.css';

export type RewardsViewState = {
  summary: RewardsSummary;
  journey: JourneyState;
  loading?: boolean;
  error?: string;
};

export type RewardsActivity = 'math' | 'language' | 'coding' | 'making';

export type RewardsPageOptions = {
  state: RewardsViewState;
  onBack: () => void;
  onOpenJourney: () => void;
  onPlay: () => void;
  onCreate: () => void;
  /** The host chooses the destination and enforces the player's subject settings. */
  onActivity?: (activity: RewardsActivity) => void;
  onRetry?: () => void;
  guidance?: GuideHost;
};

const makerNames = ['Ready to create', 'Gem Maker', 'Gem Cutter', 'Gem Polisher', 'Gem Master'] as const;
const numbers = new Intl.NumberFormat();
const number = (value: number) => numbers.format(Math.max(0, Math.floor(value)));
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};
const button = (className: string, text: string, action: () => void) => {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
};
const image = (path: string, className = '') => {
  const element = node('img', className);
  element.src = new URL(path, document.baseURI).href;
  element.alt = '';
  element.setAttribute('aria-hidden', 'true');
  element.decoding = 'async';
  return element;
};
const icon = (name: string) => image(`jems-art/icons/${name}.svg`, 'jems-rewards-icon');

/** A read-only view of durable grants. The host owns storage, earning and navigation. */
export function createRewardsPage(options: RewardsPageOptions) {
  let state = options.state;
  let disposed = false;
  const element = node('section', 'page hidden jems-rewards');
  element.id = 'page-jems-rewards';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'jemsRewardsTitle');

  const toolbar = node('div', 'jems-rewards-toolbar');
  const back = button('jems-rewards-back', '← My Journey', options.onBack);
  back.id = 'jemsRewardsBack';
  const heading = node('h1', '', 'Gems & achievements');
  heading.id = 'jemsRewardsTitle';
  heading.tabIndex = -1;
  const journeyLink = button('jems-rewards-secondary', 'My Journey', options.onOpenJourney);
  journeyLink.id = 'jemsRewardsJourney';
  toolbar.append(back, heading, journeyLink);

  const status = node('div', 'jems-rewards-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.hidden = true;
  const statusText = node('span');
  const retry = button('jems-rewards-secondary', 'Try again', () => options.onRetry?.());
  retry.id = 'jemsRewardsRetry';
  status.append(statusText, retry);

  const hero = node('div', 'jems-rewards-hero');
  const copy = node('div', 'jems-rewards-hero-copy');
  const eyebrow = node('p', 'jems-rewards-eyebrow', 'Create. Solve. Build. Play. Grow.');
  const totalRow = node('div', 'jems-rewards-total-row');
  totalRow.append(image('jems-mark.svg', 'jems-rewards-mark'));
  const totalCopy = node('div');
  const total = node('strong', 'jems-rewards-total');
  total.id = 'jemsRewardsTotal';
  const totalLabel = node('span', 'jems-rewards-total-label', 'Lifetime gems earned');
  totalCopy.append(total, totalLabel);
  totalRow.append(totalCopy);
  const encouragement = node('p', 'jems-rewards-encouragement');

  const next = node('div', 'jems-rewards-next');
  next.id = 'jemsRewardsNext';
  const nextTop = node('div', 'jems-rewards-progress-label');
  const nextTitle = node('strong');
  const nextValue = node('span');
  nextTop.append(nextTitle, nextValue);
  const progress = node('progress', 'jems-rewards-progress');
  progress.id = 'jemsRewardsProgress';
  const remaining = node('p', 'jems-rewards-remaining');
  next.append(nextTop, progress, remaining);
  const actions = node('div', 'jems-rewards-actions');
  const play = button('jems-rewards-primary', 'Play & practice', options.onPlay);
  play.id = 'jemsRewardsPlay';
  play.append(node('span', 'jems-rewards-arrow', '→'));
  const create = button('jems-rewards-secondary', 'Invent a game', options.onCreate);
  create.id = 'jemsRewardsCreate';
  actions.append(play, create);
  copy.append(eyebrow, totalRow, encouragement, next, actions);

  const maker = node('div', 'jems-rewards-maker');
  const makerArt = node('div', 'jems-rewards-maker-art');
  makerArt.id = 'jemsRewardsMakerArt';
  const makerCopy = node('div', 'jems-rewards-maker-copy');
  const makerState = node('span', 'jems-rewards-maker-state');
  makerState.id = 'jemsRewardsMakerState';
  const makerName = node('h2', 'jems-rewards-maker-name');
  makerName.id = 'jemsRewardsMakerName';
  const makerNext = node('p', 'jems-rewards-maker-next');
  const makerAction = button('jems-rewards-text-action', 'See my journey →', options.onOpenJourney);
  makerAction.id = 'jemsRewardsMakerAction';
  makerCopy.append(makerState, makerName, makerNext, makerAction);
  maker.append(makerArt, makerCopy);
  hero.append(copy, maker);
  const progressExplanation = createGuideCard({
    id: 'jemsRewardsExplanation', tip: 'progress', title: 'More than one way to grow',
    description: 'Your gems add up across activities. Your maker level grows as you test and improve your saved games. My Powers shows your practice; gems are not a skill score.',
    host: options.guidance,
    canAct: () => !disposed && !element.hidden && state.summary.owner === state.journey.ownerId,
    onError: message => { status.hidden = false; statusText.textContent = message; retry.hidden = true; },
    onDismiss: () => play.focus({ preventScroll: true })
  });

  const milestonesSection = node('section', 'jems-rewards-section');
  milestonesSection.setAttribute('aria-labelledby', 'jemsRewardsMilestonesTitle');
  const milestonesHeading = node('div', 'jems-rewards-section-heading');
  const milestonesTitle = node('h2', '', 'Your gem milestones');
  milestonesTitle.id = 'jemsRewardsMilestonesTitle';
  const milestoneHint = node('p', '', 'A little progress. A bigger adventure.');
  milestonesHeading.append(milestonesTitle, milestoneHint);
  const milestoneList = node('ol', 'jems-rewards-milestones');
  milestoneList.id = 'jemsRewardsMilestones';
  milestonesSection.append(milestonesHeading, milestoneList);

  const bottom = node('div', 'jems-rewards-bottom');
  const ways = node('section', 'jems-rewards-ways');
  ways.setAttribute('aria-labelledby', 'jemsRewardsWaysTitle');
  const waysTitle = node('h2', '', 'Small steps, more gems');
  waysTitle.id = 'jemsRewardsWaysTitle';
  const waysList = node('ul', 'jems-rewards-ways-list');
  const routes = [
    { activity: 'math', title: 'Math practice', detail: 'Complete an activity', amount: REWARD_AMOUNTS['math.completed'], icon: 'add', tone: 'blue' },
    { activity: 'language', title: 'Words & stories', detail: 'Complete an activity', amount: REWARD_AMOUNTS['language.completed'], icon: 'book', tone: 'coral' },
    { activity: 'coding', title: 'Coding challenges', detail: 'Solve a new challenge', amount: REWARD_AMOUNTS['scene.challenge'], icon: 'grid', tone: 'purple' },
    { activity: 'making', title: 'Your own game', detail: 'Develop it, then keep it', amount: REWARD_AMOUNTS['game.developed'], icon: 'edit', tone: 'mint' }
  ] as const;
  for (const route of routes) {
    const item = node('li');
    const activity = button(`jems-rewards-way is-${route.tone}`, '', () => {
      if (options.onActivity) options.onActivity(route.activity);
      else if (route.activity === 'making') options.onCreate();
      else options.onPlay();
    });
    activity.dataset.rewardActivity = route.activity;
    activity.setAttribute('aria-label', `${route.title}. ${route.detail}. Earn ${route.amount} gems.`);
    const symbol = node('span', 'jems-rewards-way-symbol');
    symbol.append(icon(route.icon));
    const label = node('span', 'jems-rewards-way-copy');
    label.append(node('strong', '', route.title), node('small', '', route.detail));
    activity.append(symbol, label, node('strong', 'jems-rewards-way-amount', `+${route.amount}`));
    item.append(activity);
    waysList.append(item);
  }
  const bonus = node('div', 'jems-rewards-bonus');
  const bonusTitle = node('strong', '', 'Your next practice bonus');
  const bonusDescription = node('span');
  bonusDescription.id = 'jemsRewardsPracticeBonus';
  bonus.append(bonusTitle, bonusDescription);
  ways.append(waysTitle, waysList, bonus);

  const recent = node('section', 'jems-rewards-recent');
  recent.setAttribute('aria-labelledby', 'jemsRewardsRecentTitle');
  const recentTitle = node('h2', '', 'Look what you did');
  recentTitle.id = 'jemsRewardsRecentTitle';
  const recentList = node('ol', 'jems-rewards-recent-list');
  recentList.id = 'jemsRewardsRecent';
  const recentEmpty = node('div', 'jems-rewards-empty');
  recentEmpty.append(icon('star'));
  const emptyTitle = node('strong');
  const emptyText = node('p');
  recentEmpty.append(emptyTitle, emptyText);
  recent.append(recentTitle, recentList, recentEmpty);
  bottom.append(ways, recent);
  element.append(toolbar, status, hero, progressExplanation, milestonesSection, bottom);

  function render() {
    if (disposed) return;
    const { summary, journey, loading = false, error } = state;
    // An async refresh may cross a profile change. Never paint another owner's balance.
    const waiting = loading || summary.owner !== journey.ownerId;
    const unavailable = waiting || !!error;
    element.setAttribute('aria-busy', String(waiting));
    element.dataset.owner = journey.ownerId;
    total.textContent = waiting ? '…' : error ? '—' : number(summary.lifetimeGems);
    total.setAttribute('aria-label', waiting ? 'Loading gems earned' : error ? 'Gems earned unavailable' : `${number(summary.lifetimeGems)} gems earned`);
    status.hidden = !error;
    statusText.textContent = error ? 'Your rewards couldn’t load. Try again in a moment.' : '';
    retry.hidden = !error || !options.onRetry;
    progressExplanation.refresh();
    encouragement.textContent = waiting ? 'Opening your rewards…' : error ? 'You can keep playing and creating.' : summary.lifetimeGems === 0 ? 'Your next little adventure starts here.' : 'You’re making progress, one adventure at a time.';
    next.hidden = unavailable;
    nextTitle.textContent = `Next milestone: ${number(summary.nextGemMilestone)} gems`;
    progress.max = Math.max(1, summary.nextGemMilestone - summary.gemMilestoneFloor);
    progress.value = Math.max(0, Math.min(progress.max, summary.lifetimeGems - summary.gemMilestoneFloor));
    nextValue.textContent = `${number(progress.value)} / ${number(progress.max)} this milestone`;
    progress.setAttribute('aria-label', `${number(progress.value)} of ${number(progress.max)} gems earned since your last milestone; next milestone ${number(summary.nextGemMilestone)} total gems`);
    const left = Math.max(0, summary.nextGemMilestone - summary.lifetimeGems);
    remaining.textContent = `${number(left)} more ${left === 1 ? 'gem' : 'gems'} to go`;

    const level = journey.level;
    maker.dataset.earnedLevel = String(level);
    maker.classList.toggle('is-preview', level === 0);
    makerArt.replaceChildren(createJourneyRankThumbnail(journey.character, Math.max(1, level)));
    makerState.textContent = level === 0 ? 'Your maker · outfit preview' : `Your making journey · level ${level}`;
    makerName.textContent = makerNames[level];
    makerNext.textContent = journey.nextAction || (level === 0 ? 'Save your first idea.' : 'Keep making something wonderful.');
    makerAction.textContent = !journey.character ? 'Choose your maker →' : 'See my journey →';

    milestonesSection.hidden = unavailable;
    milestoneList.replaceChildren();
    const reached = new Set(summary.reachedGemMilestones);
    const targets = [...new Set([
      ...summary.reachedGemMilestones.slice(-2),
      ...GEM_MILESTONE_START.filter(target => target > summary.lifetimeGems),
      summary.nextGemMilestone
    ])].sort((a, b) => a - b).slice(0, 5);
    for (const target of targets) {
      const earned = reached.has(target);
      const isNext = target === summary.nextGemMilestone;
      const item = node('li', `jems-rewards-milestone${earned ? ' is-earned' : isNext ? ' is-next' : ''}`);
      item.dataset.milestone = String(target);
      item.dataset.earned = String(earned);
      const gem = createJourneyGem(Math.min(4, Math.max(1, GEM_MILESTONE_START.findIndex(value => value >= target) + 1 || 4)));
      gem.classList.add('jems-rewards-milestone-gem');
      const label = node('strong', '', `${number(target)} gems`);
      const marker = node('span', 'jems-rewards-milestone-state', earned ? '✓ Reached' : isNext ? 'Up next' : 'Ahead');
      item.append(gem, label, marker);
      milestoneList.append(item);
    }

    bonus.hidden = unavailable;
    const practice = summary.nextPracticeMilestone;
    const practiceLeft = Math.max(0, practice.goal - practice.progress);
    bonusDescription.textContent = `${number(practiceLeft)} more ${practiceLeft === 1 ? 'activity' : 'activities'} · +${number(practice.amount)} gems`;
    recentList.replaceChildren();
    const grants = unavailable ? [] : summary.recentGrants.slice(0, 5);
    recentList.hidden = !grants.length;
    recentEmpty.hidden = grants.length > 0;
    emptyTitle.textContent = waiting ? 'Opening your progress…' : error ? 'Let’s try again soon' : 'Your first gems are waiting';
    emptyText.textContent = unavailable ? 'Your earned rewards appear here when available.' : 'Complete a practice activity or make something of your own.';
    for (const grant of grants) {
      const item = node('li', 'jems-rewards-grant');
      item.dataset.rewardKind = grant.kind;
      const check = node('span', 'jems-rewards-grant-check', '✓');
      check.setAttribute('aria-hidden', 'true');
      const description = node('span', 'jems-rewards-grant-copy');
      description.append(node('strong', '', grant.label));
      const created = new Date(grant.createdAt);
      if (Number.isFinite(created.getTime())) {
        const time = node('time', '', created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        time.dateTime = created.toISOString();
        description.append(time);
      }
      item.append(check, description, node('strong', 'jems-rewards-grant-amount', `+${number(grant.amount)}`));
      recentList.append(item);
    }
  }

  render();
  return {
    element,
    update(nextState: RewardsViewState) { state = nextState; render(); },
    show() { if (disposed) return; progressExplanation.refresh(); element.hidden = false; element.classList.remove('hidden'); heading.focus({ preventScroll: true }); },
    hide() { element.hidden = true; element.classList.add('hidden'); },
    dispose() { disposed = true; element.remove(); }
  };
}

export type RewardsWidgetOptions = {
  summary: RewardsSummary;
  onOpen: () => void;
  loading?: boolean;
  error?: string;
};

/** One compact entry point. Reading it never grants or replays a reward. */
export function createRewardsWidget(options: RewardsWidgetOptions) {
  const element = button('jems-rewards-widget', '', options.onOpen);
  element.id = 'jemsRewardsWidget';
  const gem = createJourneyGem(1);
  const count = node('strong');
  const label = node('span', 'jems-rewards-widget-label', 'Gems');
  element.append(gem, count, label);
  const update = (summary: RewardsSummary, status: { loading?: boolean; error?: string } = {}) => {
    count.textContent = status.loading ? '…' : status.error ? '—' : number(summary.lifetimeGems);
    element.setAttribute('aria-label', status.loading ? 'My rewards, loading gems' : status.error ? 'My rewards, gems unavailable' : `My rewards, ${number(summary.lifetimeGems)} gems earned`);
    element.setAttribute('aria-busy', String(!!status.loading));
    element.dataset.owner = summary.owner;
  };
  update(options.summary, options);
  return { element, update };
}

/** Pure non-interactive toast content; the host emits only after a durable grant. */
export function createRewardCelebration(options: {
  grants: readonly RewardGrant[];
  journey: Pick<JourneyState, 'level' | 'character'>;
  headline?: string;
}) {
  const toast = node('div', 'jems-rewards-toast');
  if (!options.grants.length) { toast.hidden = true; return toast; }
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  const amount = options.grants.reduce((sum, grant) => sum + grant.amount, 0);
  const hasMakerMilestone = options.grants.some(grant => grant.kind === 'maker.milestone');
  toast.dataset.rewardIds=JSON.stringify(options.grants.map(grant=>grant.id));
  if(hasMakerMilestone)toast.dataset.makerLevel=String(options.journey.level);
  if (hasMakerMilestone && options.journey.level > 0) {
    toast.classList.add('has-maker');
    toast.append(createJourneyRankThumbnail(options.journey.character, options.journey.level));
  } else {
    toast.append(image('jems-mark.svg', 'jems-rewards-toast-mark'));
  }
  const copy = node('span', 'jems-rewards-toast-copy');
  copy.append(node('strong', '', options.headline || `+${number(amount)} ${amount === 1 ? 'gem' : 'gems'}`));
  copy.append(node('span', '', options.headline ? `+${number(amount)} gems earned` : options.grants.length === 1 ? options.grants[0].label : 'Your progress adds up!'));
  toast.append(copy);
  return toast;
}
