import {gemHuntFrame} from './gem-hunt-frame';
import './gem-hunt.css';

export async function openGemHunt(picture: HTMLCanvasElement, current: () => boolean) {
  if (import.meta.env.MODE !== 'creative-art-review' || !['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return;
  const room = new Image(), prize = new Image();
  room.src = './gem-factory-workshop.webp';
  prize.src = './jems-art/gem_mint.webp';
  const [markup] = await Promise.all([gemHuntFrame(), room.decode(), prize.decode()]);
  if (!current()) return;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-busy','true');
  dialog.className = 'creation-dialog art-game-review';
  dialog.setAttribute('aria-labelledby', 'gemHuntTitle');
  dialog.innerHTML = `<header><h2 id="gemHuntTitle">Gem Hunt</h2><button class="creation-button" data-close>Close</button></header>
    <p>Move your drawing to each green gem.</p>
    <canvas width="720" height="400" tabindex="0" aria-label="Gem Hunt play area"></canvas>
    <p role="status">Getting ready…</p>
    <div class="art-game-controls"><button class="creation-button" data-step="left" disabled>← Left</button>
    <button class="creation-button" data-step="right" disabled>Right →</button>
    <button class="creation-button" data-step="restart" disabled>Play again</button></div>`;
  const canvas = dialog.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const controls = [...dialog.querySelectorAll<HTMLButtonElement>('[data-step]')];
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Isolated Gem Hunt game rules';
  frame.sandbox.add('allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  const cleanup = new AbortController(), signal = cleanup.signal;
  let timeout = 0, score: number | undefined, pending = true;
  function close() { dialog.close(); }
  function fail() {
    clearTimeout(timeout);
    dialog.setAttribute('aria-busy','false');
    controls.forEach(button => { button.disabled = true; });
    frame.remove();
    status.textContent = 'This game stopped. Close it and try again.';
  }
  function drawContained(image: HTMLCanvasElement | HTMLImageElement, x: number, size: number) {
    const scale = size / Math.max(image.width, image.height);
    const width = image.width * scale, height = image.height * scale;
    ctx.drawImage(image, x - width / 2, 335 - height, width, height);
  }
  function receive(event: MessageEvent) {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || !pending) return;
    if (!current()) { close(); return; }
    const data = event.data;
    const tile = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 90 && x <= 630 && x % 90 === 0;
    if (!Array.isArray(data) || data.length !== 3 || !tile(data[0]) || !Number.isInteger(data[2]) ||
        data[2] < 0 || data[2] > 3 || (data[2] === 3 ? data[1] !== null : !tile(data[1]))) { fail(); return; }
    clearTimeout(timeout); pending = false; dialog.setAttribute('aria-busy','false');
    const [actorX, prizeX, collected] = data;
    // Centre crop the illustrated room. The selected drawing always retains
    // its original proportions, colors and transparency.
    const sourceHeight = room.width * canvas.height / canvas.width;
    ctx.drawImage(room, 0, (room.height - sourceHeight) / 2, room.width, sourceHeight, 0, 0, canvas.width, canvas.height);
    if (prizeX !== null) drawContained(prize, prizeX, 80);
    drawContained(picture, actorX, 110);
    status.textContent = collected === 3 ? 'You found all three gems!' : `Gems: ${collected} of 3. The gem is ${prizeX > actorX ? 'on your right' : 'on your left'}.`;
    score = collected;
    controls.forEach(button => { button.disabled = collected === 3 && button.dataset.step !== 'restart'; });
  }
  function step(action: string) {
    if (!current()) { close(); return; }
    if (pending || score === undefined || (score === 3 && action !== 'restart')) return;
    pending = true;
    dialog.setAttribute('aria-busy','true');
    frame.contentWindow?.postMessage(action, '*');
    timeout = window.setTimeout(fail, 2500);
  }
  controls.forEach(button => { button.onclick = () => step(button.dataset.step!); });
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  dialog.onkeydown = event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); step(event.key === 'ArrowLeft' ? 'left' : 'right');
    }
  };
  dialog.addEventListener('close', () => { cleanup.abort(); clearTimeout(timeout); dialog.remove(); }, { once: true });
  for (const name of ['factory-page','factory-profile-before-change','factory-learning-active','pagehide']) window.addEventListener(name, close, {signal});
  window.addEventListener('message', receive, {signal});
  document.body.append(dialog); dialog.showModal(); canvas.focus();
  frame.srcdoc = markup; dialog.append(frame);
  timeout = window.setTimeout(fail, 5000);
}
