import {setIconLabel} from '../brand/icons';
import type {LanguageItem} from './types';

export function literacyInteraction(item: LanguageItem) {
  if (item.kind !== 'choice') return item.kind;
  if (item.contentPack === 'v3' && item.passage?.includes('__')) return 'fill-gap';
  if (item.contentPack === 'v3' && item.skillId === 'g2-adjectives') return 'select-word';
  if (item.contentPack === 'v3' && item.passage && item.domain === 'comprehension') return 'evidence';
  if (item.skillId.endsWith('-syllables') || item.skillId === 'k-ela-segment') return 'sound-taps';
  if (item.skillId === 'g1-punctuation' && item.question.includes(': ')) return 'punctuation';
  return 'choice';
}

/** In scored evidence items each sentence is exactly one reviewed choice, in passage order. */
export function passageLines(item: LanguageItem): string[] {
  if (!item.passage || !item.choices) return [];
  const sorted = item.choices.map(choice => choice.value).sort((a,b) => item.passage!.indexOf(a)-item.passage!.indexOf(b));
  return sorted.join(' ') === item.passage ? sorted : [];
}

export function mountPassage(target: HTMLElement, item: LanguageItem, signal: AbortSignal, checked: (value: string) => void) {
  const passage = document.createElement('section');
  passage.className = 'language-passage';
  passage.setAttribute('aria-label', 'Reading passage');
  const text = document.createElement('p');
  text.className = 'language-story-text';
  passage.append(text);
  target.append(passage);
  const selectWord = literacyInteraction(item) === 'select-word';
  if (!selectWord && literacyInteraction(item) !== 'evidence') {
    text.textContent = item.passage!;
    return;
  }
  const lines = selectWord ? item.passage!.split(/(\b[A-Za-z]+\b)/).filter(Boolean) : passageLines(item);
  if (!lines.length) throw Error('Evidence choices must match the complete passage.');
  let selected: HTMLButtonElement | undefined;
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'language-primary';
  check.dataset.action = 'check-evidence';
  setIconLabel(check, 'check', selectWord ? 'Check my word' : 'Check my evidence');
  check.disabled = true;
  for (const line of lines) {
    if (selectWord && !item.choices?.some(choice=>choice.value === line)) {text.append(line); continue;}
    const phrase = document.createElement('button');
    phrase.className = 'language-evidence-line';
    phrase.type = 'button';
    phrase.textContent = line;
    phrase.setAttribute('aria-pressed', 'false');
    phrase.addEventListener('click', () => {
      selected?.setAttribute('aria-pressed', 'false');
      selected = phrase;
      phrase.setAttribute('aria-pressed','true');
      check.disabled = false;
    }, {signal});
    text.append(phrase);if(!selectWord)text.append(' ');
  }
  check.addEventListener('click', () => { if (selected) checked(selected.textContent!); }, {signal});
  passage.append(check);
}

export function mountBeatCounter(work: HTMLElement, item: LanguageItem, signal: AbortSignal, submit: (answer: string) => void) {
  const board = document.createElement('div');
  board.className = 'language-beats';
  let count = 0;
  const max = Math.max(...item.choices!.map(choice => Number(choice.value)));
  const dots = document.createElement('output');
  dots.className = 'language-beat-dots';
  dots.setAttribute('aria-live','polite');
  const tap = document.createElement('button');
  tap.type = 'button';
  tap.className = 'language-beat-tap';
  setIconLabel(tap, 'add', item.skillId === 'k-ela-segment' ? 'Tap a sound' : 'Tap a beat');
  const undo = document.createElement('button');
  undo.type = 'button';
  setIconLabel(undo, 'undo', 'Undo last');
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'language-primary';
  setIconLabel(check, 'check', 'Check');
  check.dataset.action = 'check-beats';
  function draw() {
    dots.replaceChildren();
    for(let index=0; index<max; index++) {
      const mark=document.createElement('span');
      mark.dataset.filled=String(index<count);
      mark.setAttribute('aria-hidden','true');
      dots.append(mark);
    }
    dots.setAttribute('aria-label',String(count)+' taps');
    undo.disabled = count === 0;
    tap.disabled = count === max;
    check.disabled = count === 0;
  }
  tap.addEventListener('click', () => { count = Math.min(count+1, max); draw(); }, {signal});
  undo.addEventListener('click', () => { count = Math.max(0,count-1); draw(); }, {signal});
  check.addEventListener('click', () => submit(String(count)), {signal});
  board.append(dots, tap, undo, check);
  work.append(board);
  draw();
}
