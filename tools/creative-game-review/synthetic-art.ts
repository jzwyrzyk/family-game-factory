import {drawingPage, saveDrawing} from '../../src/assets/private-drawings';
import {OWNER} from './contract';

/** Fixed hand-authored QA drawing. Never import a household backup into this review. */
export async function seedSyntheticRock() {
  const existing = await drawingPage(OWNER, {limit:1});
  if (existing.total) return;
  const canvas = document.createElement('canvas');
  canvas.width = 138; canvas.height = 104;
  const ctx = canvas.getContext('2d')!;
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#efb0da'; ctx.strokeStyle = '#3e255c';
  ctx.beginPath();
  for (const [x,y] of [[5,76],[16,54],[22,47],[35,21],[65,10],[79,13],[90,9],[115,30],[121,51],[132,72],[125,87],[96,91],[74,96],[45,93],[27,96],[8,86]]) ctx.lineTo(x,y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3e255c';
  for (const [x,y] of [[51,56],[87,53]]) { ctx.beginPath(); ctx.ellipse(x,y,4,6,-.15,0,Math.PI*2); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(57,66); ctx.quadraticCurveTo(69,79,83,64); ctx.stroke();
  ctx.strokeStyle = '#aa5998'; ctx.lineWidth = 3;
  for (const [x,y] of [[28,48],[36,39],[99,37],[109,47],[22,70],[101,79]]) {
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+6,y-4); ctx.stroke();
  }
  const png = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Fixture unavailable.')), 'image/png'));
  await saveDrawing(OWNER, 'Practice rock', png);
}
