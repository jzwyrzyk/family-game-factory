import {drawingBlob, saveDrawing, type Drawing} from '../assets/private-drawings';
import {assertRewardSourceWritable} from '../rewards/write-guard';
import {iconMarkup} from '../brand/icons';

type PictureEdit = {left:number;top:number;right:number;bottom:number;turns:number;flip:boolean;paper:boolean};
const initial = ():PictureEdit=>({left:0,top:0,right:0,bottom:0,turns:0,flip:false,paper:false});

/** Remove connected near-white border paper only. Enclosed white details remain. */
export function removeBorderPaper(image:ImageData):void {
  const {data,width:w,height:h}=image,seen=new Uint8Array(w*h),queue=new Uint32Array(w*h);let start=0,end=0;
  const visit=(i:number)=>{if(seen[i])return;seen[i]=1;const p=i*4;
    if(data[p+3]===0||Math.min(data[p],data[p+1],data[p+2])>=230&&Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])<25){queue[end++]=i;data[p+3]=0;}};
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  while(start<end){const i=queue[start++],x=i%w;if(x>0)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<w*(h-1))visit(i+w);}
}

/** Export visible pixels without private strokes or imported source metadata. */
export async function visiblePicturePng(source:Drawing):Promise<Blob>{
  const bitmap=await createImageBitmap(drawingBlob(source));
  const canvas=document.createElement('canvas');
  try{
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('This picture could not be downloaded.');
    ctx.drawImage(bitmap,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('This picture could not be downloaded.')),'image/png'));
  }finally{bitmap.close();canvas.width=canvas.height=1;}
}

/** Every picture edit creates a new local original derivative; never overwrites. */
export async function editPicture(owner:string,source:Drawing,onSaved:(drawing:Drawing)=>Promise<void>,isCurrent:()=>boolean=()=>true){
  const FG=(window as any).FG,valid=()=>String(FG.store.current().id)===owner&&isCurrent();
  if(!valid()||source.owner!==owner)throw Error('Open a picture from your own profile.');
  const bitmap=await createImageBitmap(drawingBlob(source));if(!valid()){bitmap.close();return;}
  const previous=document.activeElement as HTMLElement|null,dialog=document.createElement('dialog');dialog.className='art-picture';
  dialog.setAttribute('aria-labelledby','artPictureTitle');
  dialog.innerHTML=`<header><div><span class="art-eyebrow">PICTURE TOOLS</span><h2 id="artPictureTitle">Get your picture ready</h2><p>Trim the edges. Turn it around. Keep your original.</p></div><button data-close class="art-button" aria-label="Close picture tools">${iconMarkup('close')}</button></header><div class="art-picture-layout"><div class="art-checker"><canvas data-preview aria-label="Preview of your edited picture" role="img"></canvas></div><div class="art-picture-tools"><label>New picture name<input data-name maxlength="60"></label><h3>Trim the edges</h3>${['left','top','right','bottom'].map(edge=>`<label>${edge[0].toUpperCase()+edge.slice(1)}<span><input data-edge="${edge}" type="range" min="0" max="45" value="0"><output data-value="${edge}">0%</output></span></label>`).join('')}<div class="art-action-row"><button data-turn class="art-button">${iconMarkup('retry')} Turn</button><button data-flip class="art-button" aria-pressed="false">${iconMarkup('arrow')} Flip</button></div><label class="art-check"><input type="checkbox" data-paper> Remove white paper around my drawing</label><p class="art-small">Best with plain white paper. White details inside a closed outline stay white.</p><div class="art-action-row"><button data-undo class="art-button">${iconMarkup('undo')} Undo</button><button data-redo class="art-button">${iconMarkup('undo','jems-icon--mirror')} Redo</button></div><button data-save class="art-button art-primary">${iconMarkup('save')} Save a new picture</button><p data-status role="status" aria-live="polite"></p></div></div>`;
  document.body.append(dialog);
  const $=<T extends HTMLElement>(s:string)=>dialog.querySelector<T>(s)!;
  const canvas=$<HTMLCanvasElement>('[data-preview]'),ctx=canvas.getContext('2d')!,status=$<HTMLElement>('[data-status]');
  const base=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  base.width=Math.max(1,Math.round(bitmap.width*ratio));base.height=Math.max(1,Math.round(bitmap.height*ratio));base.getContext('2d')!.drawImage(bitmap,0,0,base.width,base.height);bitmap.close();
  let edit=initial(),undo:PictureEdit[]=[],redo:PictureEdit[]=[],busy=false,closed=false,saved:Drawing|null=null;
  $<HTMLInputElement>('[data-name]').value=(source.name+' edit').slice(0,60);
  const paint=()=>{
    const x=Math.round(base.width*edit.left/100),y=Math.round(base.height*edit.top/100),w=Math.max(1,Math.round(base.width*(100-edit.left-edit.right)/100)),h=Math.max(1,Math.round(base.height*(100-edit.top-edit.bottom)/100));
    const cut=document.createElement('canvas');cut.width=w;cut.height=h;const c=cut.getContext('2d')!;c.drawImage(base,x,y,w,h,0,0,w,h);
    if(edit.paper){const pixels=c.getImageData(0,0,w,h);removeBorderPaper(pixels);c.putImageData(pixels,0,0);}
    canvas.width=edit.turns%2?h:w;canvas.height=edit.turns%2?w:h;ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(edit.turns*Math.PI/2);ctx.scale(edit.flip?-1:1,1);ctx.drawImage(cut,-w/2,-h/2);ctx.restore();
    for(const key of ['left','top','right','bottom'] as const){$<HTMLInputElement>(`[data-edge="${key}"]`).value=String(edit[key]);$<HTMLOutputElement>(`[data-value="${key}"]`).value=edit[key]+'%';}
    $<HTMLInputElement>('[data-paper]').checked=edit.paper;$<HTMLButtonElement>('[data-flip]').setAttribute('aria-pressed',String(edit.flip));$<HTMLButtonElement>('[data-undo]').disabled=!undo.length||busy;$<HTMLButtonElement>('[data-redo]').disabled=!redo.length||busy;
  };
  const change=(fn:(e:PictureEdit)=>void)=>{if(busy||closed||saved||!valid())return;undo.push({...edit});if(undo.length>30)undo.shift();redo=[];fn(edit);paint();};
  for(const input of dialog.querySelectorAll<HTMLInputElement>('[data-edge]'))input.onchange=()=>change(e=>{e[input.dataset.edge as 'left']=Number(input.value);});
  $<HTMLButtonElement>('[data-turn]').onclick=()=>change(e=>e.turns=(e.turns+1)%4);
  $<HTMLButtonElement>('[data-flip]').onclick=()=>change(e=>e.flip=!e.flip);
  $<HTMLInputElement>('[data-paper]').onchange=()=>change(e=>e.paper=$<HTMLInputElement>('[data-paper]').checked);
  $<HTMLButtonElement>('[data-undo]').onclick=()=>{if(busy||closed||saved||!valid()||!undo.length)return;redo.push({...edit});edit=undo.pop()!;paint();};
  $<HTMLButtonElement>('[data-redo]').onclick=()=>{if(busy||closed||saved||!valid()||!redo.length)return;undo.push({...edit});edit=redo.pop()!;paint();};
  $<HTMLButtonElement>('[data-save]').onclick=async()=>{
    if(busy||closed||saved||!valid())return;busy=true;$<HTMLButtonElement>('[data-save]').disabled=true;status.textContent='Saving your new picture…';
    try{assertRewardSourceWritable();const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Your picture could not be prepared.')),'image/png'));
      if(closed||!valid())return;const result=await saveDrawing(owner,$<HTMLInputElement>('[data-name]').value,blob,source.id,()=>!closed&&valid());
      saved=result;
      if(closed||!valid())return;await onSaved(result);if(!closed)dialog.close();
    }catch(error){if(!closed&&valid())status.textContent=saved?'Your new picture is saved. We could not refresh the art shelf. Close these tools and reopen Art Studio to see it.':(error as Error).message;}finally{busy=false;if(!closed){$<HTMLButtonElement>('[data-save]').disabled=!!saved;if(saved)for(const control of dialog.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button:not([data-close])'))control.disabled=true;}}
  };
  const close=()=>{if(busy)return;if(!saved&&undo.length&&!confirm('Leave these picture edits? Your saved original is safe.'))return;dialog.close();};
  $<HTMLButtonElement>('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const profile=()=>{if(!valid())dialog.close();};window.addEventListener('factory-profile',profile);window.addEventListener('factory-page',profile);
  dialog.addEventListener('close',()=>{closed=true;window.removeEventListener('factory-profile',profile);window.removeEventListener('factory-page',profile);base.width=base.height=canvas.width=canvas.height=1;dialog.remove();if(valid()&&previous?.isConnected)previous.focus();},{once:true});
  paint();dialog.showModal();
}
