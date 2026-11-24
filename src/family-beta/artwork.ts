import {drawingHash,inspectDrawingBytes,saveDrawing} from '../assets/private-drawings';
// Only exact operator-reviewed bytes are eligible. Persist a raster re-encoding, never file metadata.
const file=document.querySelector<HTMLInputElement>('#betaReviewedArt');
if(file)file.onchange=async()=>{
 const out=document.getElementById('familyExitStatus')!;
 try{
  const image=file.files?.[0];if(!image||image.type!=='image/png'||image.size>5*1024*1024)throw Error('Choose a reviewed PNG up to 5 MB.');
  const owner=(window as any).FG.store.current().id,bytes=await image.arrayBuffer();
  const {width,height}=inspectDrawingBytes(bytes,'image/png');
  const response=await fetch('/entry/review-art',{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({digest:await drawingHash(bytes)})});
  if(!response.ok)throw Error('Unlock Grown-ups and confirm the operator has reviewed this exact image.');
  const bitmap=await createImageBitmap(image),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();
  const raster=await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('Drawing unavailable.')),'image/png'));
  const guard=()=>(window as any).FG.store.current().id===owner;
  if(!guard())throw Error('The explorer changed. Open the image again.');
  await saveDrawing(owner,'Reviewed workshop artwork',raster,undefined,guard);out.textContent='Your reviewed drawing is ready.';
 }catch(e){out.textContent=(e as Error).message;}finally{file.value='';}
};
