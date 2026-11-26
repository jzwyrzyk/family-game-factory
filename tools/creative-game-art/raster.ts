/** Draw only visible pixels into a bounded PNG. Strip private PNG chunks,
 * editor history, filenames and camera metadata before local frame delivery. */
export function encodeReviewRaster(image: CanvasImageSource & {width:number;height:number}, width:number, height:number) {
  if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=1024))throw Error('Choose a smaller sprite.');
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const scale=Math.min(width/image.width,height/image.height);
  const w=image.width*scale,h=image.height*scale;
  const ctx=canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(image,(width-w)/2,(height-h)/2,w,h);
  const png=canvas.toDataURL('image/png');
  const prefix='data:image/png;base64,';
  if(!png.startsWith(prefix)||png.length>1500000)throw Error('Choose a smaller sprite.');
  return png.slice(prefix.length);
}
