/**
 * Deterministic engagement rewards. These receipts never describe proficiency,
 * correctness, attention or the quality of a child's reasoning.
 *
 * Policy 1 is immutable: a future schedule gets a new policy version while the
 * semantic receipt identity remains unchanged. Existing grants are grandfathered.
 */
export const REWARD_POLICY_VERSION = 1 as const;
export const REWARDS_LIMITS = Object.freeze({ owners: 80, receiptsPerOwner: 25_000, outbox: 1_024, characters: 16_000_000 });
export type RewardDomain = 'math' | 'language' | 'coding' | 'making';
export type RewardActivityKind = 'math.completed' | 'language.completed' | 'language.explored' | 'scene.challenge' | 'game.developed';
export type RewardFactKind = RewardActivityKind | 'maker.milestone';
export type RewardGrantKind = RewardFactKind | 'practice.milestone';
export type MakerRewardLevel = 1 | 2 | 3 | 4;

export const REWARD_AMOUNTS: Readonly<Record<RewardActivityKind, number>> = Object.freeze({
  'math.completed': 2, 'language.completed': 2, 'language.explored': 2,
  'scene.challenge': 8, 'game.developed': 25,
});
export const MAKER_MILESTONE_AMOUNTS: Readonly<Record<MakerRewardLevel, number>> = Object.freeze({ 1: 5, 2: 10, 3: 20, 4: 40 });
export const GEM_MILESTONE_START: readonly number[] = Object.freeze([50, 150, 300, 600, 1000]);
const PRACTICE_MILESTONE_START = Object.freeze([{ goal: 10, amount: 10 }, { goal: 25, amount: 15 }, { goal: 50, amount: 20 }, { goal: 100, amount: 25 }]);

interface FactBase {
  schema: 'jems.reward.fact.v1'; owner: string; sourceId: string;
  occurredAt: string; policyVersion: typeof REWARD_POLICY_VERSION;
}
export type RewardFact = FactBase & ({ kind: RewardActivityKind } | { kind: 'maker.milestone'; level: MakerRewardLevel });
interface FactInputBase { owner: string; occurredAt: number | string }
export type CreateRewardFactInput = FactInputBase & (
  { kind: RewardActivityKind; sourceId: string } |
  { kind: 'maker.milestone'; level: MakerRewardLevel }
);
export interface ActivityRewardReceipt { type: 'activity'; id: string; fact: RewardFact; amount: number }
export interface PracticeRewardReceipt {
  type: 'practice'; id: string; goal: number; policyVersion: typeof REWARD_POLICY_VERSION;
  amount: number; occurredAt: string;
}
export type RewardReceipt = ActivityRewardReceipt | PracticeRewardReceipt;
export interface RewardsLedger { owner: string; receipts: RewardReceipt[] }
export interface RewardsWorkspace { schema: 'jems.rewards.workspace.v1'; profiles: RewardsLedger[] }
export interface RewardsBackup { schema: 'jems.rewards.backup.v1'; namespace: string; data: RewardsWorkspace }
export interface RewardGrant {
  id: string; kind: RewardGrantKind; domain: RewardDomain | 'practice'; amount: number;
  label: string; createdAt: string;
}
export interface RewardsSummary {
  owner: string; lifetimeGems: number; nextGemMilestone: number; reachedGemMilestones: number[];
  gemMilestoneFloor: number; gemMilestoneProgress: number;
  counts: Record<RewardDomain, number>; practiceCount: number;
  nextPracticeMilestone: { goal: number; progress: number; amount: number };
  recentGrants: RewardGrant[]; totalGrants: number;
}

const activityKinds = Object.keys(REWARD_AMOUNTS) as RewardActivityKind[];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const object = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
export const isRewardOwner = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export const isRewardsNamespace = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,259}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const sourceId = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:~/-]{0,239}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function invalid(): never { throw Error('This rewards history is unsupported or damaged. Your saved gems have not been replaced.'); }

/** The host calls this only when it can save the corresponding source fact. */
export function createRewardFact(input: CreateRewardFactInput): RewardFact {
  const at = new Date(input.occurredAt);
  if (!Number.isFinite(at.getTime())) invalid();
  const maker = input.kind === 'maker.milestone';
  return validateRewardFact({
    schema: 'jems.reward.fact.v1', owner: input.owner, kind: input.kind,
    sourceId: maker ? `level:${input.level}` : input.sourceId,
    occurredAt: at.toISOString(), policyVersion: REWARD_POLICY_VERSION,
    ...(maker ? { level: input.level } : {}),
  });
}

export function validateRewardFact(value: unknown): RewardFact {
  if (!object(value, ['schema', 'owner', 'kind', 'sourceId', 'occurredAt', 'policyVersion', 'level']) ||
      value.schema !== 'jems.reward.fact.v1' || !isRewardOwner(value.owner) || !sourceId(value.sourceId) ||
      !timestamp(value.occurredAt) || value.policyVersion !== 1) invalid();
  if (value.kind === 'maker.milestone') {
    if (![1, 2, 3, 4].includes(value.level as number) || value.sourceId !== `level:${value.level}`) invalid();
  } else if (!activityKinds.includes(value.kind as RewardActivityKind) || Object.hasOwn(value, 'level')) invalid();
  return clone(value as unknown as RewardFact);
}

/** Deliberately excludes policy version, timestamps, session IDs and award amount. */
export function rewardFactId(fact: RewardFact): string { return `${fact.kind}:${encodeURIComponent(fact.sourceId)}`; }

/** Optional source fields are additive: old profiles/notebooks have no pending facts. */
export function validateRewardOutbox(value: unknown): RewardFact[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > REWARDS_LIMITS.outbox) invalid();
  const facts = value.map(validateRewardFact), seen = new Set<string>();
  for (const fact of facts) {
    const id = `${fact.owner}|${rewardFactId(fact)}`;
    if (seen.has(id)) invalid();
    seen.add(id);
  }
  return facts;
}

/** Returns a new array so a failed source save cannot mutate the old outbox. */
export function enqueueRewardFact(outbox: unknown, input: RewardFact): RewardFact[] {
  const facts = validateRewardOutbox(outbox), fact = validateRewardFact(input);
  if (!facts.some(prior => prior.owner === fact.owner && rewardFactId(prior) === rewardFactId(fact))) facts.push(fact);
  return validateRewardOutbox(facts);
}

export function rewardFactAmount(fact: RewardFact): number {
  return fact.kind === 'maker.milestone' ? MAKER_MILESTONE_AMOUNTS[fact.level] : REWARD_AMOUNTS[fact.kind];
}
export function rewardFactDomain(fact: RewardFact): RewardDomain {
  if (fact.kind === 'math.completed') return 'math';
  if (fact.kind === 'language.completed' || fact.kind === 'language.explored') return 'language';
  return fact.kind === 'scene.challenge' ? 'coding' : 'making';
}
export function practiceMilestones(count: number): { goal: number; amount: number }[] {
  const milestones = PRACTICE_MILESTONE_START.filter(item => item.goal <= count).map(item => ({ ...item }));
  for (let goal = 200; goal <= count; goal += 100) milestones.push({ goal, amount: 25 });
  return milestones;
}
const isPractice = (receipt: RewardReceipt): receipt is ActivityRewardReceipt => receipt.type === 'activity' &&
  ['math.completed', 'language.completed', 'language.explored'].includes(receipt.fact.kind);
const practiceAmount = (goal: number): number | null =>
  PRACTICE_MILESTONE_START.find(item => item.goal === goal)?.amount ?? (Number.isSafeInteger(goal) && goal >= 200 && goal % 100 === 0 ? 25 : null);

/** Source receipts are permanent; milestones therefore survive source/chat erasure. */
export function addPracticeMilestones(ledger: RewardsLedger): PracticeRewardReceipt[] {
  const practice = ledger.receipts.filter(isPractice).sort((a, b) => a.fact.occurredAt.localeCompare(b.fact.occurredAt) || a.id.localeCompare(b.id));
  const ids = new Set(ledger.receipts.map(receipt => receipt.id)), added: PracticeRewardReceipt[] = [];
  for (const milestone of practiceMilestones(practice.length)) {
    const id = `practice.milestone:${milestone.goal}`;
    if (ids.has(id)) continue;
    const receipt: PracticeRewardReceipt = {
      type: 'practice', id, goal: milestone.goal, policyVersion: 1, amount: milestone.amount,
      occurredAt: practice[milestone.goal - 1].fact.occurredAt,
    };
    ledger.receipts.push(receipt); added.push(receipt); ids.add(id);
  }
  return added;
}

export function emptyRewardsWorkspace(): RewardsWorkspace { return { schema: 'jems.rewards.workspace.v1', profiles: [] }; }
export function validateRewardsWorkspace(value: unknown): RewardsWorkspace {
  if (!object(value, ['schema', 'profiles']) || value.schema !== 'jems.rewards.workspace.v1' ||
      !Array.isArray(value.profiles) || value.profiles.length > REWARDS_LIMITS.owners) invalid();
  const owners = new Set<string>();
  for (const ledger of value.profiles) {
    if (!object(ledger, ['owner', 'receipts']) || !isRewardOwner(ledger.owner) || owners.has(ledger.owner) ||
        !Array.isArray(ledger.receipts) || ledger.receipts.length > REWARDS_LIMITS.receiptsPerOwner) invalid();
    owners.add(ledger.owner);
    const ids = new Set<string>(); let practiceCount = 0;
    const practiceGoals = new Set<number>();
    for (const receipt of ledger.receipts) {
      if (!receipt || typeof receipt !== 'object' || typeof receipt.id !== 'string' || ids.has(receipt.id)) invalid();
      ids.add(receipt.id);
      if (receipt.type === 'activity') {
        if (!object(receipt, ['type', 'id', 'fact', 'amount'])) invalid();
        const fact = validateRewardFact(receipt.fact);
        if (fact.owner !== ledger.owner || receipt.id !== rewardFactId(fact) || receipt.amount !== rewardFactAmount(fact)) invalid();
        if (['math.completed', 'language.completed', 'language.explored'].includes(fact.kind)) practiceCount++;
      } else if (receipt.type === 'practice') {
        if (!object(receipt, ['type', 'id', 'goal', 'policyVersion', 'amount', 'occurredAt']) ||
            typeof receipt.goal !== 'number' || receipt.policyVersion !== 1 || receipt.amount !== practiceAmount(receipt.goal) ||
            receipt.id !== `practice.milestone:${receipt.goal}` || !timestamp(receipt.occurredAt)) invalid();
        practiceGoals.add(receipt.goal);
      } else invalid();
    }
    const expectedGoals = practiceMilestones(practiceCount).map(item => item.goal);
    if (expectedGoals.length !== practiceGoals.size || expectedGoals.some(goal => !practiceGoals.has(goal))) invalid();
  }
  if (JSON.stringify(value).length > REWARDS_LIMITS.characters) throw Error('This rewards history is full. Export a backup before continuing. Saved gems have not been removed.');
  return clone(value as unknown as RewardsWorkspace);
}

export function validateRewardsBackup(value: unknown, namespace?: string): RewardsBackup {
  if (!object(value, ['schema', 'namespace', 'data']) || value.schema !== 'jems.rewards.backup.v1' ||
      !isRewardsNamespace(value.namespace) || namespace !== undefined && value.namespace !== namespace) invalid();
  return { schema: 'jems.rewards.backup.v1', namespace: value.namespace, data: validateRewardsWorkspace(value.data) };
}

export function rewardGrant(receipt: RewardReceipt): RewardGrant {
  if (receipt.type === 'practice') return {
    id: receipt.id, kind: 'practice.milestone', domain: 'practice', amount: receipt.amount,
    label: `${receipt.goal} practice activities`, createdAt: receipt.occurredAt,
  };
  const labels: Record<RewardActivityKind, string> = {
    'math.completed': 'Math activity completed', 'language.completed': 'Language activity completed',
    'language.explored': 'Writing saved', 'scene.challenge': 'Scene challenge completed', 'game.developed': 'Game developed',
  };
  const makerNames: Record<MakerRewardLevel, string> = { 1: 'Gem Maker', 2: 'Gem Cutter', 3: 'Gem Polisher', 4: 'Gem Master' };
  const fact = receipt.fact;
  return { id: receipt.id, kind: fact.kind, domain: rewardFactDomain(fact), amount: receipt.amount,
    label: fact.kind === 'maker.milestone' ? `${makerNames[fact.level]} milestone` : labels[fact.kind], createdAt: fact.occurredAt };
}

export function summarizeRewards(ledger: RewardsLedger): RewardsSummary {
  const counts: Record<RewardDomain, number> = { math: 0, language: 0, coding: 0, making: 0 };
  let lifetimeGems = 0;
  for (const receipt of ledger.receipts) {
    lifetimeGems += receipt.amount;
    if (receipt.type === 'activity' && receipt.fact.kind !== 'maker.milestone') counts[rewardFactDomain(receipt.fact)]++;
  }
  const reachedGemMilestones = GEM_MILESTONE_START.filter(goal => goal <= lifetimeGems);
  for (let goal = 1500; goal <= lifetimeGems; goal += 500) reachedGemMilestones.push(goal);
  const gemMilestoneFloor = reachedGemMilestones.at(-1) ?? 0;
  const nextGemMilestone = GEM_MILESTONE_START.find(goal => goal > lifetimeGems) ?? (Math.floor(lifetimeGems / 500) + 1) * 500;
  const practiceCount = counts.math + counts.language;
  const nextPractice = PRACTICE_MILESTONE_START.find(item => item.goal > practiceCount) ?? { goal: (Math.floor(practiceCount / 100) + 1) * 100, amount: 25 };
  return { owner: ledger.owner, lifetimeGems, nextGemMilestone, reachedGemMilestones,
    gemMilestoneFloor, gemMilestoneProgress: (lifetimeGems - gemMilestoneFloor) / (nextGemMilestone - gemMilestoneFloor),
    counts, practiceCount, nextPracticeMilestone: { ...nextPractice, progress: practiceCount },
    recentGrants: ledger.receipts.map(rewardGrant).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 12),
    totalGrants: ledger.receipts.length };
}
export function emptyRewardsSummary(owner: string): RewardsSummary {
  if (!isRewardOwner(owner)) invalid();
  return summarizeRewards({ owner, receipts: [] });
}
