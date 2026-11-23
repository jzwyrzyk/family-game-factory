import { hasMeaningfulCreation, readyGuidedExperiment, recommendNext } from './guidance';
import type { StudioSession } from './notebook';

export type StudioNotificationKind = 'ready' | 'unknown' | 'failed' | 'building' | 'experiment' | 'draft';
export type StudioNotification = {
  id: string;
  ownerId: string;
  sessionId: string;
  projectName: string;
  /** A short reminder in the child's own words, never compiled build instructions. */
  idea?: string;
  token: string;
  kind: StudioNotificationKind;
  priority: number;
  title: string;
  description: string;
  action: 'open-project' | 'open-ready';
  actionLabel: string;
  /** An unseen ready, failed or uncertain state; ordinary pending work is not an alert. */
  unread: boolean;
  /** Unresolved work, independently of whether its notification has been read. */
  pending: boolean;
  /** Hidden from the home recommendation, still available in Notifications. */
  dismissed: boolean;
};
export type StudioNotificationRef = Pick<StudioNotification, 'ownerId' | 'sessionId' | 'token'>;
export type StudioNotificationContext = {
  unknownSessionIds?: ReadonlySet<string>;
  unconfirmedSessionIds?: ReadonlySet<string>;
  sendingSessionIds?: ReadonlySet<string>;
};
export type StudioNotificationAcknowledgement = { sessionId: string; token: string; dismissed: boolean };
export type StudioNotificationPreferences = { acknowledgements: StudioNotificationAcknowledgement[] };

export const MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS = 80;
const kinds: readonly StudioNotificationKind[] = ['ready', 'unknown', 'failed', 'building', 'experiment', 'draft'];
const ident = (value: unknown): value is string => typeof value === 'string' && value.length <= 160 &&
  /^[\w:-]+$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const tokenIsValid = (value: unknown): value is string => typeof value === 'string' &&
  /^v1:(ready|unknown|failed|building|experiment|draft):[a-f0-9]{16}$/.test(value);
const onlyKeys = (value: object, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));

export function freshStudioNotificationPreferences(): StudioNotificationPreferences {
  return { acknowledgements: [] };
}

/** Small inert preferences in the existing notebook, never a second project/job store. */
export function validateStudioNotificationPreferences(input: unknown): StudioNotificationPreferences {
  const value = input as StudioNotificationPreferences;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !onlyKeys(value, ['acknowledgements']) ||
    !Array.isArray(value.acknowledgements) || value.acknowledgements.length > MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS)
    throw Error('Invalid notification preferences.');
  const seen = new Set<string>();
  const acknowledgements = value.acknowledgements.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      !onlyKeys(entry, ['sessionId', 'token', 'dismissed']) || !ident(entry.sessionId) ||
      !tokenIsValid(entry.token) || typeof entry.dismissed !== 'boolean' || seen.has(entry.sessionId))
      throw Error('Invalid notification acknowledgement.');
    seen.add(entry.sessionId);
    return { sessionId: entry.sessionId, token: entry.token, dismissed: entry.dismissed };
  });
  return { acknowledgements };
}

/** A presentation fingerprint, not an authorization token or a security hash.
 * Store only this bounded opaque value, never draft text, prompts or API URLs.
 * In particular, job poll timestamps and queued/building/testing phases are
 * absent: repeatedly observing one request cannot make another unread alert. */
function versionToken(kind: StudioNotificationKind, source: readonly unknown[]): string {
  const value = JSON.stringify(source);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(index))) * 0x100000001b3n);
  return 'v1:' + kind + ':' + hash.toString(16).padStart(16, '0');
}

function pendingVersion(session: StudioSession): readonly unknown[] {
  const pending = session.pendingExperiment;
  return pending ? [pending.baseId, pending.prompt, pending.parents, pending.depth, pending.origin] : [];
}

function authoredVersion(session: StudioSession): readonly unknown[] {
  const lastMessage = [...session.messages].reverse().find(message => message.role !== 'helper');
  const plan = Object.entries(session.design?.plan ?? {}).sort(([left], [right]) => left.localeCompare(right))
    .filter(([, field]) => field?.accepted).map(([key, field]) => [key, field!.value]);
  return [session.draft, lastMessage?.id ?? null, pendingVersion(session), plan,
    session.design?.ideas.filter(idea => idea.adopted).map(idea => [idea.id, idea.text]) ?? [],
    session.design?.observations.filter(observation => observation.source === 'child').map(observation => observation.id) ?? []];
}

function authoredIdea(session: StudioSession): string | undefined {
  // Drafts and child messages preserve the child's words. Pending prompts and
  // experiment descriptions can contain a compiled plan, so are not fallbacks.
  const source = session.draft.trim() || [...session.messages].reverse()
    .find(message => message.role === 'child' && message.text.trim())?.text;
  if (!source) return undefined;
  const singleLine = source.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 160) return singleLine;
  // Stay within 160 UTF-16 units without leaving half of an emoji at the edge.
  return singleLine.slice(0, 159).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…';
}

/** Derive one current row per owned project. Reading has no storage, network,
 * clock, reward, Build, cancel, selection or Keep side effects.
 *
 * Context describes transient observations only. A saved pending experiment
 * without an acknowledged job remains uncertain after reload; it does not prove
 * that the server accepted or rejected a request. Callers re-resolve the owner,
 * session and state when activating an item and retain existing action guards. */
export function deriveStudioNotifications(
  sessions: readonly StudioSession[],
  ownerId: string,
  context: StudioNotificationContext = {},
  preferences: StudioNotificationPreferences = freshStudioNotificationPreferences(),
): StudioNotification[] {
  if (!ident(ownerId)) throw Error('Invalid player.');
  const acknowledgements = validateStudioNotificationPreferences(preferences).acknowledgements;
  const seen = new Set<string>();
  const projected: StudioNotification[] = [];
  for (const session of sessions) {
    if (session.owner !== ownerId || session.archived || seen.has(session.id)) continue;
    seen.add(session.id);
    const job = session.job;
    const busy = !!job && ['queued', 'building', 'testing'].includes(job.status);
    const sending = context.sendingSessionIds?.has(session.id) === true;
    const unconfirmed = context.unconfirmedSessionIds?.has(session.id) === true;
    const ready = readyGuidedExperiment(session);
    const savedResultKnown = job?.status === 'ready' && !!job.revisionId &&
      session.experiments?.some(test => test.candidate.remoteId === job.revisionId) === true;
    // A selected or kept result is no longer a new ready item, but still settles
    // its old job's connection uncertainty. A separately unconfirmed submit does
    // not gain an acknowledgement from that older result.
    const unknown = context.unknownSessionIds?.has(session.id) === true && !savedResultKnown;
    const savedResultMissing = job?.status === 'ready' && !savedResultKnown;
    let kind: StudioNotificationKind;
    let title: string, description: string, actionLabel: string;
    let action: StudioNotification['action'] = 'open-project';
    let version: readonly unknown[];
    if (ready) {
      // An actual saved result wins over a stale disconnected/sending observation.
      kind = 'ready';
      title = session.projectId || session.remoteId ? 'Your change is ready' : 'Your game is ready';
      description = 'Open it whenever you are ready.';
      actionLabel = session.projectId || session.remoteId ? 'Try my change' : 'Play my game';
      action = 'open-ready';
      version = [job!.id, job!.revisionId, ready.id];
    } else if (unconfirmed || unknown || savedResultMissing || (!job && !!session.pendingExperiment && !sending)) {
      kind = 'unknown';
      title = 'Your idea needs a check';
      description = unconfirmed || !job ? 'The request was not confirmed. Your idea is safe.' :
        savedResultMissing ? 'The saved result needs a check before opening.' : 'The connection changed. Your game is safe.';
      actionLabel = 'Open my idea';
      version = [job?.id ?? null, unconfirmed || !job ? 'unconfirmed' : savedResultMissing ? 'result' : 'connection',
        unconfirmed || !job ? pendingVersion(session) : []];
    } else if (sending && !busy) {
      kind = 'building';
      title = 'Checking your request';
      description = 'Your idea is saved. Waiting for a response.';
      actionLabel = 'Open my idea';
      version = [job?.id ?? null, 'submission', pendingVersion(session)];
    } else if (job?.status === 'failed') {
      kind = 'failed';
      title = 'The build needs help';
      description = 'The build did not finish. Open your idea for help.';
      actionLabel = 'Open my idea';
      version = [job.id];
    } else if (busy) {
      kind = 'building';
      title = 'Your idea is being made';
      description = 'You can play while you wait.';
      actionLabel = 'See my idea';
      version = [job!.id];
    } else {
      // Empty starter visits and ordinary recent play do not create notifications.
      if (!hasMeaningfulCreation([session], ownerId)) continue;
      const next = recommendNext([{ ...session, resumeDismissed: false }], ownerId, session.id);
      if (next?.kind === 'experiment') {
        kind = 'experiment';
        title = next.title;
        description = next.description;
        actionLabel = next.action;
        version = [next.experimentId, session.candidate?.baseId, session.candidate?.remoteId];
      } else if (next?.kind === 'idea' || session.pendingExperiment) {
        kind = 'draft';
        title = 'Keep shaping your idea';
        description = 'Your unfinished idea is saved here.';
        actionLabel = 'Continue my idea';
        version = authoredVersion(session);
      } else continue;
    }
    const token = versionToken(kind, version);
    const acknowledgement = acknowledgements.find(entry => entry.sessionId === session.id && entry.token === token);
    const actionable = kind === 'ready' || kind === 'unknown' || kind === 'failed';
    const dismissed = acknowledgement?.dismissed ??
      (!!session.resumeDismissed && (kind === 'draft' || kind === 'experiment'));
    const idea = authoredIdea(session);
    projected.push({
      id: session.id, ownerId, sessionId: session.id, projectName: session.name, token, kind,
      ...(idea ? { idea } : {}),
      priority: kinds.indexOf(kind), title, description, action, actionLabel,
      unread: actionable && !acknowledgement, pending: kind === 'building' || kind === 'unknown', dismissed,
    });
  }
  // Keep equal-priority rows in a stable order. Job polling also writes updated,
  // so recency would move rows and disrupt focus or narration without new work.
  return projected.sort((left, right) => left.priority - right.priority || left.sessionId.localeCompare(right.sessionId));
}

/** Update only the latest acknowledgement per project. Stale tokens cannot
 * acknowledge a new job/result. Dismissal never removes the derived item or
 * cancels, completes, selects or keeps its underlying work. */
export function acknowledgeStudioNotificationItems(
  preferences: StudioNotificationPreferences,
  ownerId: string,
  items: readonly StudioNotificationRef[],
  dismiss = false,
): StudioNotificationPreferences {
  if (!ident(ownerId) || !Array.isArray(items) || items.length > MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS)
    throw Error('Invalid notification acknowledgement.');
  const next = validateStudioNotificationPreferences(preferences);
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || item.ownerId !== ownerId || !ident(item.sessionId) || !tokenIsValid(item.token) || seen.has(item.sessionId))
      throw Error('Choose a notification from your own profile.');
    seen.add(item.sessionId);
    const previous = next.acknowledgements.find(entry => entry.sessionId === item.sessionId);
    next.acknowledgements = next.acknowledgements.filter(entry => entry.sessionId !== item.sessionId);
    next.acknowledgements.push({ sessionId: item.sessionId, token: item.token,
      dismissed: dismiss || previous !== undefined && previous.token === item.token && previous.dismissed });
  }
  next.acknowledgements = next.acknowledgements.slice(-MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS);
  return next;
}
