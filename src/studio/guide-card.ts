import { createIcon } from '../brand/icons';
import type { GuideTipId } from './guidance';
import './guidance.css';

/** The host owns profile selection, durable preferences and save errors. */
export type GuideHost = {
  isDismissed(id: GuideTipId): boolean;
  dismiss(id: GuideTipId): void;
};

export type GuideCard = HTMLElement & { refresh(): void };
export type GuideCardOptions = {
  id: string;
  tip: GuideTipId;
  title: string;
  description: string;
  host?: GuideHost;
  action?: { label: string; run(): void };
  /** Reject a control left behind by a profile or view change. */
  canAct?: () => boolean;
  onError?: (message: string) => void;
  /** Explicit dismissal may return focus; passive refresh never does. */
  onDismiss?: () => void;
};

/** One optional, contextual hint. Reading or dismissing it never earns progress. */
export function createGuideCard(options: GuideCardOptions): GuideCard {
  const card = document.createElement('aside') as GuideCard;
  card.id = options.id;
  card.className = 'jems-guide-card';
  card.dataset.guideTip = options.tip;
  card.setAttribute('aria-labelledby', `${options.id}Title`);
  const icon = document.createElement('span');
  icon.className = 'jems-guide-symbol';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(createIcon('help'));
  const copy = document.createElement('div');
  copy.className = 'jems-guide-copy';
  const title = document.createElement('h2');
  title.id = `${options.id}Title`;
  title.textContent = options.title;
  const description = document.createElement('p');
  description.textContent = options.description;
  copy.append(title, description);
  const controls = document.createElement('div');
  controls.className = 'jems-guide-controls';
  let dismissedInView = false;
  const reportError = (error: unknown) => {
    options.onError?.(error instanceof Error ? error.message : 'Could not save your guide choice. Please try again.');
  };
  if (options.action) {
    const action = document.createElement('button');
    action.id = `${options.id}Action`;
    action.type = 'button';
    action.className = 'jems-guide-action';
    action.textContent = options.action.label;
    action.onclick = () => {
      if (options.canAct?.() === false) return;
      try { options.action!.run(); } catch (error) { reportError(error); }
    };
    controls.append(action);
  }
  const dismiss = document.createElement('button');
  dismiss.id = `${options.id}Dismiss`;
  dismiss.type = 'button';
  dismiss.className = 'jems-guide-dismiss';
  dismiss.textContent = 'Got it';
  dismiss.setAttribute('aria-label', `Dismiss hint: ${options.title}`);
  dismiss.onclick = () => {
    if (options.canAct?.() === false) return;
    try {
      // A failed preference write must leave the hint and its control visible.
      options.host?.dismiss(options.tip);
      dismissedInView = true;
      card.hidden = true;
      options.onDismiss?.();
    } catch (error) { reportError(error); }
  };
  controls.append(dismiss);
  card.append(icon, copy, controls);
  card.refresh = () => {
    try { card.hidden = options.host ? options.host.isDismissed(options.tip) : dismissedInView; }
    catch (error) { card.hidden = false; reportError(error); }
  };
  card.refresh();
  return card;
}
