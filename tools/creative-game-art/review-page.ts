// Browser entry for the offline synthetic review page. Never import in Jems.
import {drawingHash, drawingPage, saveDrawing} from '../../src/assets/private-drawings';
import {artChoice} from '../../src/creation/private-art';
import {openDrawingPlaytest} from './playtest';
import type {ReviewCapsule} from './capsule';

export async function startReview(capsule: ReviewCapsule) {
  // A copied review file may share an origin with another local tool. Route
  // every IndexedDB operation into this tool's synthetic-only namespace.
  const prefix = 'jems-offline-game-art-review-v1:';
  const open = indexedDB.open.bind(indexedDB), remove = indexedDB.deleteDatabase.bind(indexedDB);
  const inventory = indexedDB.databases?.bind(indexedDB);
  indexedDB.open = (name, version) => open(prefix + name, version);
  indexedDB.deleteDatabase = name => remove(prefix + name);
  if (inventory) indexedDB.databases = async () => (await inventory())
    .filter(db => db.name?.startsWith(prefix)).map(db => ({...db, name: db.name!.slice(prefix.length)}));
  const owner = 'offline-fixture-rock';
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const pen = canvas.getContext('2d')!;
  pen.lineJoin = 'round';
  pen.lineWidth = 5;
  pen.strokeStyle = '#352648';
  pen.fillStyle = '#e677f6';
  pen.beginPath();
  pen.moveTo(7, 101);
  for (const [x, y] of [[19, 61], [35, 51], [53, 28], [74, 14], [105, 19], [124, 43], [145, 64], [153, 95], [128, 105], [71, 102], [38, 107]]) pen.lineTo(x, y);
  pen.closePath();
  pen.fill();
  pen.stroke();
  for (const x of [64, 99]) {
    pen.beginPath();
    pen.arc(x, 59, 4, 0, 2 * Math.PI);
    pen.fillStyle = pen.strokeStyle;
    pen.fill();
  }
  pen.beginPath();
  pen.moveTo(67, 74);
  pen.quadraticCurveTo(82, 87, 100, 70);
  pen.stroke();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Missing fixture.'))));
  const expected = await drawingHash(await blob.arrayBuffer());
  const shelf = await drawingPage(owner, {limit: 100});
  const drawing = shelf.items.find(item => item.sha256 === expected) ?? await saveDrawing(owner, 'Synthetic rock fixture', blob);
  const choice = await artChoice(owner, {drawingId: drawing.id});
  const binding = {revision: capsule.revision, assetPin: choice.assetId, slotId: capsule.slot.assetId};
  let view: AbortController | undefined;
  const start = document.querySelector<HTMLButtonElement>('#try')!;
  const close = document.querySelector<HTMLButtonElement>('#close')!;
  const status = document.querySelector<HTMLElement>('#message')!;
  const container = document.querySelector<HTMLElement>('#preview')!;
  function stop() {
    view?.abort();
    view = undefined;
    close.disabled = true;
    start.disabled = false;
    status.textContent = '';
  }
  start.onclick = async () => {
    stop();
    const attempt = new AbortController();
    view = attempt;
    start.disabled = true;
    close.disabled = false;
    try {
      await openDrawingPlaytest(container, capsule, binding, () => owner, attempt.signal);
    } catch (error) {
      if (view !== attempt) return;
      stop();
      status.textContent = (error as Error).message;
    }
  };
  close.onclick = stop;
  window.addEventListener('pagehide', stop, {once: true});
  start.disabled = false;
}
