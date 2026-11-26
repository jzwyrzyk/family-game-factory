// Trusted local qualification surface. No entry point in either shipped application.
import {pickCreativeAsset} from '../../src/assets/creative-picker';
import {resolvePrivateArt} from '../../src/creation/private-art';
import {CreationStore} from '../../src/creation/storage';
import {createStarterProject} from '../../src/creation/projects';
import {GAME_SOURCE, OWNER, SLOT, validPosition} from './contract';
import {seedSyntheticRock} from './synthetic-art';

const store = new CreationStore(localStorage, () => OWNER);
const choose = document.querySelector<HTMLButtonElement>('#choose')!;
const status = document.querySelector<HTMLElement>('#status')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-move]')];
const stage = document.querySelector<HTMLCanvasElement>('#stage')!;
const ctx = stage.getContext('2d')!;
const room = new Image();
room.src = '/workshop.webp';
let session = 0, frame:HTMLIFrameElement|null = null, port:MessagePort|null = null;
let timeout:ReturnType<typeof setTimeout>|undefined, waiting = false;

function disableMoves(disabled:boolean) { buttons.forEach(button => {button.disabled = disabled;}); }
function stop() {
  session++; disableMoves(true); clearTimeout(timeout); waiting = false;
  port?.close(); port = null; frame?.remove(); frame = null;
  ctx.clearRect(0,0,stage.width,stage.height); delete stage.dataset.position;
}
function unavailable() { stop(); status.textContent = 'This version could not play. Choose a saved drawing to try again.'; }
function waitForFrame() {
  disableMoves(true); waiting = true; clearTimeout(timeout);
  timeout = setTimeout(unavailable, 6000);
}
function move(direction:string) {
  if (!port || waiting || !['left','right'].includes(direction)) return;
  waitForFrame(); port.postMessage(direction);
}
for (const button of buttons) button.onclick = () => move(button.dataset.move!);
stage.onkeydown = event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); move(event.key === 'ArrowLeft' ? 'left' : 'right');
  }
};
function savedGame() {
  const entry = store.list(OWNER).find(entry => entry.id === 'qualified-workshop');
  if (!entry) return null;
  const game = store.load(entry.id, OWNER);
  if (game.scene.provenance?.sourceRevisionId !== GAME_SOURCE ||
      game.scene.actors.length !== 1 || game.scene.actors[0].id !== SLOT) throw Error('Unknown game or slot.');
  return game;
}
function saveSelection(pin:string) {
  const game = savedGame();
  if (game) {
    if (game.scene.actors[0].assetId === pin) return;
    game.scene.actors[0].assetId = pin;
    store.save(game.project.id, OWNER, game.scene, game.revision.id, 'Choose drawing');
  } else {
    const scene = createStarterProject('blank','Workshop drawing');
    scene.id = 'qualified-workshop';
    scene.provenance = {createdBy:'assisted',sourceKind:'generated',sourceRevisionId:GAME_SOURCE};
    scene.actors = [{id:SLOT,name:'Workshop helper',assetId:pin,x:150,y:280,size:100}];
    scene.programs = []; scene.width = 720; scene.height = 400;
    store.create(OWNER,scene);
  }
}
async function launch(pin:string, save:boolean) {
  stop();
  const run = session, current = () => run === session;
  const [art] = await Promise.all([resolvePrivateArt(OWNER,pin,current),room.decode()]);
  if (!current()) return;
  if (save) saveSelection(pin);
  const game = document.createElement('iframe');
  frame = game;
  game.hidden = true; game.title = 'Isolated workshop simulation';
  game.setAttribute('sandbox','allow-scripts');
  const channel = new MessageChannel();
  port = channel.port1;
  port.onmessage = ({data}) => {
    if (!current()) return;
    if (!waiting || !validPosition(data)) { unavailable(); return; }
    clearTimeout(timeout); waiting = false; disableMoves(false);
    // Same center and viewport as the reviewed room and helper draw commands.
    ctx.drawImage(room,0,-40,720,480);
    const scale = Math.min(100 / art.image.width, 104 / art.image.height);
    const w = art.image.width*scale, h = art.image.height*scale;
    ctx.drawImage(art.image,data-w/2,280-h/2,w,h);
    stage.dataset.position = String(data);
    status.textContent = 'Move ' + art.label + ' with the buttons or arrow keys.';
  };
  port.onmessageerror = unavailable;
  game.onload = () => {
    if (current()) game.contentWindow?.postMessage('connect','*',[channel.port2]);
  };
  waitForFrame(); game.src = '/frame'; document.body.append(game);
}
choose.onclick = async () => {
  const run = session;
  choose.disabled = true;
  try {
    const choice = await pickCreativeAsset(OWNER, () => run === session, {imagesOnly:true,title:'Choose a practice drawing'});
    if (choice && run === session) await launch(choice.assetId,true);
  } catch { unavailable(); }
  finally { choose.disabled = false; }
};
window.addEventListener('pagehide',stop);
async function start() {
  await seedSyntheticRock();
  choose.disabled = false;
  const game = savedGame();
  if (game) await launch(game.scene.actors[0].assetId,false);
  else status.textContent = 'Choose a practice drawing for the workshop helper.';
}
void start().catch(unavailable);
