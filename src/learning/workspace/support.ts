import {setIconLabel} from '../../brand/icons';
import {mountPaper} from './support-paper';

function disclosure(name: string, icon: 'grid' | 'edit', className: string) {
  const details = document.createElement('details');
  details.className = 'learning-tool ' + className;
  const summary = document.createElement('summary');
  setIconLabel(summary, icon, name);
  details.append(summary);
  return details;
}

export function createNumericKeypad(input: HTMLInputElement, kind: 'number' | 'fraction', signal: AbortSignal) {
  const details = disclosure('Number pad', 'grid', 'learning-keypad');
  details.open = true;
  const nativeMode = input.inputMode;
  input.inputMode = 'none';
  const keys = document.createElement('div');
  keys.className = 'learning-keypad-keys';
  const status = document.createElement('span');
  status.className = 'learning-tool-announcement';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  details.addEventListener('toggle', () => {
    input.inputMode = details.open ? 'none' : nativeMode;
  }, {signal});

  function edit(key: string) {
    if (input.disabled || input.readOnly) return;
    let start = input.selectionStart ?? input.value.length;
    let end = input.selectionEnd ?? start;
    let replacement = key;
    if (key === 'Clear') {
      start = 0;
      end = input.value.length;
      replacement = '';
    } else if (key === 'Delete') {
      if (start === end) start = Math.max(0, start - 1);
      replacement = '';
    }
    const newLength = input.value.length - (end - start) + replacement.length;
    if (input.maxLength >= 0 && newLength > input.maxLength) return;
    input.setRangeText(replacement, start, end, 'end');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    status.textContent = input.value || 'Answer cleared';
  }

  const keyList = ['1','2','3','4','5','6','7','8','9','-','0','.'];
  if (kind === 'fraction') keyList.push('/', ' ');
  keyList.push('Delete', 'Clear');
  const labels: Record<string, string> = {'-': 'Minus', '.': 'Decimal point', '/': 'Fraction slash', ' ': 'Space'};
  for (const key of keyList) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = key === ' ' ? 'Space' : key === '-' ? '−' : key;
    if (labels[key]) control.setAttribute('aria-label', labels[key]);
    if (key.length > 1 || key === ' ') control.className = 'learning-keypad-edit';
    control.addEventListener('click', () => edit(key), {signal});
    keys.append(control);
  }
  details.append(keys, status);
  return details;
}

/** The activity owns the signal and its lifetime. No drawing data reaches the learning engine. */
export function createScratchpad(signal: AbortSignal) {
  const details = disclosure('Scratchpad', 'edit', 'learning-scratchpad');
  function openPaper() {
    if (!details.open) return;
    details.removeEventListener('toggle', openPaper);
    mountPaper(details, signal);
  }
  details.addEventListener('toggle', openPaper, {signal});
  return details;
}
