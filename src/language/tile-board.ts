import {setIconLabel, type IconName} from '../brand/icons';
import {picture} from '../learning/early/pictures';
import type {LanguageItem} from './types';

function control(label: string, className: string, icon?: IconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (icon) setIconLabel(button, icon, label);
  else button.textContent = label;
  return button;
}

/** A piece's identity is its tray index. Equal letters and words remain separately movable. */
export function mountTileBoard(work: HTMLElement, item: LanguageItem, signal: AbortSignal,
  active: () => boolean, submit: (answer: string) => void) {
  const tokens = item.tiles!;
  const pictures = item.kind === 'picture-order';
  const letters = item.kind === 'word-tiles';
  const product = pictures ? 'story' : letters ? 'word' : 'sentence';
  const selected: number[] = [];
  const history: number[][] = [];
  let editing: number | undefined;

  const board = document.createElement('section');
  board.className = 'language-construction';
  board.dataset.pieces = pictures ? 'pictures' : letters ? 'letters' : 'words';
  const hint = document.createElement('p');
  hint.className = 'language-tile-instruction';
  hint.textContent = pictures ? 'Tap a placed picture to move it.' : 'Tap a placed tile to move it.';
  const built = document.createElement('div');
  built.className = 'language-built';
  built.setAttribute('role', 'group');
  built.setAttribute('aria-label', 'Your ' + product);
  const tray = document.createElement('div');
  tray.className = 'language-tile-tray';
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', 'Available pieces');
  const edits = document.createElement('div');
  edits.className = 'language-piece-tools';
  const earlier = control('Move earlier', 'language-secondary');
  const later = control('Move later', 'language-secondary');
  const remove = control('Take out', 'language-secondary');
  edits.append(earlier, later, remove);

  const actions = document.createElement('div');
  actions.className = 'language-tile-actions';
  const undo = control('Undo last', 'language-secondary', 'undo');
  const clear = control('Clear', 'language-secondary', 'close');
  const check = control('Check my ' + product, 'language-primary', 'check');
  check.dataset.action = 'check-tiles';
  actions.append(undo, clear, check);
  board.append(hint, built, edits, tray, actions);
  work.append(board);
  const assembled = () => selected.map(i => tokens[i]).join(letters ? '' : ' ');

  function piece(index: number, placed: boolean) {
    const button = control(tokens[index], placed ? 'language-placed' : 'language-tile');
    button.dataset.piece = String(index);
    if (!placed) button.dataset.tile = String(index);
    if (pictures) button.replaceChildren(picture(tokens[index]));
    if (placed) {
      button.setAttribute('aria-pressed', String(editing === index));
      button.setAttribute('aria-label', tokens[index] + ', position ' + (selected.indexOf(index) + 1));
    }
    return button;
  }

  const supply = tokens.map((_, index) => piece(index, false));
  tray.append(...supply);
  function draw() {
    built.replaceChildren(...selected.map(i => piece(i, true)));
    if (!selected.length) {
      const empty = document.createElement('span');
      empty.className = 'language-empty';
      empty.textContent = pictures ? 'Tap a picture to start.' : letters ? 'Tap a letter to start.' : 'Tap a word to start.';
      built.append(empty);
    }
    hint.hidden = selected.length === 0;
    supply.forEach((button, i) => button.disabled = selected.includes(i));
    edits.hidden = editing === undefined;
    const position = editing === undefined ? -1 : selected.indexOf(editing);
    earlier.disabled = position < 1;
    later.disabled = position < 0 || position === selected.length - 1;
    clear.disabled = selected.length === 0;
    undo.disabled = history.length === 0;
    check.disabled = selected.length !== tokens.length;
  }

  function apply(next: number[], focusPiece?: number) {
    if (next.length === selected.length && next.every((v, i) => v === selected[i])) return;
    history.push(selected.slice());
    if (history.length > 64) history.shift();
    selected.splice(0, selected.length, ...next);
    editing = undefined;
    draw();
    if (focusPiece !== undefined) {
      const target = built.querySelector<HTMLButtonElement>('[data-piece="' + focusPiece + '"]') ?? supply[focusPiece];
      target?.focus({preventScroll: true});
    }
  }

  function place(id: number, before?: number) {
    if (id === before) return;
    const next = selected.filter(value => value !== id);
    const index = before === undefined ? next.length : next.indexOf(before);
    next.splice(index < 0 ? next.length : index, 0, id);
    apply(next, id);
  }
  function move(delta: number) {
    if (!active() || editing === undefined) return;
    const at = selected.indexOf(editing);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= selected.length) return;
    const next = selected.slice();
    next[at] = next[to];
    next[to] = editing;
    apply(next, editing);
  }

  let drag: {pointer: number; id: number; x: number; y: number; moved: boolean} | undefined;
  let suppressClick = false;
  const targetPiece = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLButtonElement>('button[data-piece]') : null;
  board.addEventListener('pointerdown', event => {
    suppressClick = false;
    const button = targetPiece(event.target);
    if (!active() || !event.isPrimary || event.button !== 0 || !button || button.disabled) return;
    drag = {pointer: event.pointerId, id: Number(button.dataset.piece), x: event.clientX, y: event.clientY, moved: false};
    button.setPointerCapture(event.pointerId);
  }, {signal});
  board.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8 && !drag.moved) return;
    drag.moved = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    built.classList.toggle('is-drop-target', built.contains(hit));
    const insertion = targetPiece(hit);
    for (const b of built.querySelectorAll('button')) b.classList.toggle('drop-before', b === insertion);
  }, {signal});
  function endDrag(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const previous = drag;
    drag = undefined;
    built.classList.remove('is-drop-target');
    built.querySelector('.drop-before')?.classList.remove('drop-before');
    if (!previous.moved || !active()) return;
    suppressClick = true;
    if (event.type === 'pointercancel') return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (built.contains(hit)) {
      const before = targetPiece(hit);
      place(previous.id, before ? Number(before.dataset.piece) : undefined);
    } else if (tray.contains(hit)) apply(selected.filter(id => id !== previous.id), previous.id);
  }
  board.addEventListener('pointerup', endDrag, {signal});
  board.addEventListener('pointercancel', endDrag, {signal});
  board.addEventListener('click', event => {
    if (!active()) return;
    if (suppressClick && event.detail) { suppressClick = false; return; }
    const button = targetPiece(event.target);
    if (!button) return;
    const id = Number(button.dataset.piece);
    if (tray.contains(button)) place(id);
    else {
      editing = editing === id ? undefined : id;
      draw();
      built.querySelector<HTMLButtonElement>('[data-piece="' + id + '"]')?.focus({preventScroll: true});
    }
  }, {signal});
  earlier.addEventListener('click', () => move(-1), {signal});
  later.addEventListener('click', () => move(1), {signal});
  remove.addEventListener('click', () => {
    if (active() && editing !== undefined) apply(selected.filter(id => id !== editing), editing);
  }, {signal});
  clear.addEventListener('click', () => { if (active()) apply([]); }, {signal});
  undo.addEventListener('click', () => {
    if (!active()) return;
    const previous = history.pop();
    if (previous) { selected.splice(0, selected.length, ...previous); editing = undefined; draw(); }
  }, {signal});
  check.addEventListener('click', () => { if (active() && !check.disabled) submit(assembled()); }, {signal});
  draw();
}
