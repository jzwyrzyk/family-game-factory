import {createIcon, setIconLabel} from '../../brand/icons';
import type {Grade} from '../grades';
import {applyLearningTheme, mountWorkspacePal} from './theme';

export interface LearningWorkspaceOptions {
  subject: 'math' | 'language';
  grade: Grade;
  title: string;
  id: string;
  owner: string;
  gameId?: string;
  onLeave?: () => void;
  leaveLabel?: string;
  signal: AbortSignal;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** Subject controllers own the attempt. The shell only presents its current state. */
export function createLearningWorkspace(options: LearningWorkspaceOptions) {
  const {subject} = options;
  const root = element('section', 'learning-workspace ' + subject + '-activity');
  root.dataset.subject = subject;
  root.dataset.band = options.grade <= 0 ? 'early' : options.grade <= 2 ? 'middle' : 'upper';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-labelledby', options.id);
  applyLearningTheme(root, options.gameId);

  const header = element('div', 'workspace-header');
  if (options.onLeave) {
    const leave = element('button', 'workspace-leave ' + subject + '-leave');
    leave.type = 'button';
    leave.dataset.action = 'leave-game';
    setIconLabel(leave, 'arrow', options.leaveLabel ?? 'Back to Games', 'jems-icon--back');
    leave.addEventListener('click', options.onLeave, {signal: options.signal});
    header.append(leave);
  }
  const heading = element('div', 'workspace-heading');
  const title = element('h2', 'workspace-question ' + subject + '-question');
  title.id = options.id;
  title.tabIndex = -1;
  title.textContent = options.title;
  const palSlot = element('div', 'workspace-pal');
  heading.append(title, palSlot);

  const desk = element('div', 'workspace-desk');
  const task = element('div', 'workspace-task');
  const stimulus = element('div', 'workspace-stimulus');
  const work = element('div', 'workspace-work ' + subject + '-work');
  const tools = element('aside', 'workspace-tools');
  tools.setAttribute('aria-label', 'Workspace tools');
  task.append(stimulus, work);
  desk.append(task, tools);

  const feedback = element('p', 'workspace-feedback ' + subject + '-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');
  const footer = element('div', 'workspace-footer');
  const helpPanel = element('section', 'workspace-help ' + subject + '-hint');
  helpPanel.hidden = true;
  root.append(heading, header, desk, feedback, footer, helpPanel);
  let pal: ReturnType<typeof mountWorkspacePal> | undefined;
  const connectHelp = (hintButton: HTMLButtonElement) => {
    pal?.dispose();
    pal = mountWorkspacePal(palSlot, options.owner, hintButton);
  };
  const dispose = () => { pal?.dispose(); pal = undefined; };
  options.signal.addEventListener('abort', dispose, {once: true});

  function setFeedback(state: 'input' | 'incorrect' | 'correct' | 'support', text: string) {
    feedback.dataset.state = state;
    feedback.textContent = text;
    if (state === 'correct' || state === 'incorrect') pal?.setState(state);
    if (state === 'correct') feedback.prepend(createIcon('check'));
  }
  function setHelpState(worked: boolean) {
    pal?.setState(worked ? 'worked' : 'hint');
  }
  return {root, title, header, stimulus, work, footer, tools, feedback, helpPanel, connectHelp,
    setFeedback, setHelpState, dispose};
}
