/** PNG source metadata is editable only if rendering it reproduces the
 * selected PNG's decoded pixels exactly in this browser. */
export async function pixelsMatchPng(bytes:ArrayBuffer, width:number, height:number,
  render:(ctx:CanvasRenderingContext2D)=>void):Promise<boolean> {
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  let bitmap:ImageBitmap | undefined;
  try {
    bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    if (bitmap.width!==width || bitmap.height!==height) return false;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if (!ctx) return false;
    ctx.drawImage(bitmap,0,0);
    const original=ctx.getImageData(0,0,width,height).data;
    render(ctx);
    const replay=ctx.getImageData(0,0,width,height).data;
    return original.every((channel,index)=>channel===replay[index]);
  } finally {
    bitmap?.close(); canvas.width=canvas.height=1;
  }
}
