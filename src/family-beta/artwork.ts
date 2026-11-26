import {drawingHash, saveDrawing} from '../assets/private-drawings';
import {checkReviewedPng} from './reviewed-png';

const file = document.querySelector<HTMLInputElement>('#betaReviewedArt');
if (file) file.onchange = async () => {
  const status = document.getElementById('familyExitStatus')!;
  const pass = document.querySelector<HTMLInputElement>('#reviewedArtPassphrase')!;
  const currentOwner = () => (window as any).FG.store.current().id;
  const owner = currentOwner();
  const guard = () => currentOwner() === owner && file.isConnected;
  try {
    const image = file.files?.[0];
    if (!image || image.type !== 'image/png' || image.size > 5 * 1024 * 1024) throw Error('Choose a reviewed PNG up to 5 MB.');
    const bytes = await image.arrayBuffer();
    await checkReviewedPng(bytes);
    if (!guard()) throw Error('The explorer changed. Open the image again.');
    const headers = {'Content-Type':'application/json','X-Factory-Request':'1'};
    const unlock = await fetch('/v1/devices/unlock', {method:'POST', headers, body:JSON.stringify({parentPassphrase:pass.value})});
    if (!unlock.ok) throw Error('A grown-up must authorize this upload.');
    const review = await fetch('/entry/review-art', {method:'POST', headers, body:JSON.stringify({digest:await drawingHash(bytes)})});
    if (!review.ok) throw Error('Unlock Grown-ups and confirm the operator has reviewed this exact image.');
    if (!guard()) throw Error('The explorer changed. Open the image again.');
    await saveDrawing(owner, 'Reviewed workshop artwork', new Blob([bytes],{type:'image/png'}), undefined, guard);
    if (guard()) status.textContent = 'Your reviewed drawing is ready.';
  } catch (error) {
    if (guard()) status.textContent = (error as Error).message;
  } finally {
    pass.value = '';
    file.value = '';
  }
};
