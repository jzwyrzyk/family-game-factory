import {picture, hasPicture} from './pictures';
import {shapes} from './math';
import type {MathItem} from '../types';
import {createIcon} from '../../brand/icons';

function frame(className:string) {
 const node=document.createElement('span');node.className=className;return node;
}
function group(n:number,object:string) {
 const node=frame('early-group');node.setAttribute('role','img');node.setAttribute('aria-label',`${n} ${object} pictures`);
 for(let i=0;i<n;i++){const image=picture(object);image.alt='';node.append(image);}
 if(n===0)node.textContent='0';
 return node;
}
function visual(value:string,object:string){
 if(value==='small-gem'||value==='large-gem'){
  const image=picture('gem');image.classList.add('early-'+value);image.alt=value.replace('-',' ');return image;
 }
 if(hasPicture(value))return picture(value);
 if(value.startsWith('group-'))return group(Number(value.slice(6)),object);
 const node=frame('early-token');
 if(shapes.some(s=>s===value)||value==='short'||value==='long'){
   node.classList.add('early-'+value);node.setAttribute('role','img');node.setAttribute('aria-label',value);
 }else node.textContent=value;
 return node;
}
export function mountEarlyMath(area:HTMLElement,item:MathItem,submit:(value:string)=>void){
 const {prompt,object,style,n,b,layout}=item.parameters;
 const scene=frame('early-scene');scene.dataset.layout=String(layout);
 const asset=String(object),target=Number(n),promptText=String(prompt);
 if(style==='sort'){scene.append(visual(promptText.split(' ')[0],asset));}
 else if(prompt==='position'){scene.classList.add('early-column');scene.append(picture('star'),picture('gem'),picture('apple'));}
 else if(prompt==='category'){for(let i=0;i<Math.max(target,Number(b));i++){if(i<target)scene.append(picture('apple'));if(i<Number(b))scene.append(picture('pear'));}}
 else if(prompt==='teen'){scene.append(group(10,asset),visual('+',asset),group(target-10,asset));}
 else if(prompt==='triangles'){scene.append(visual('◢',asset),visual('◤',asset));}
 else if(/^(join|remove|missing)-/.test(promptText)){
  const [op,total,part]=promptText.split('-');const kept=Number(total)-Number(part);
  if(op==='join'){scene.append(group(Number(part),asset),visual('+',asset),group(kept,asset));}
  if(op==='remove'){const away=group(Number(part),asset);away.classList.add('early-removed');scene.append(group(kept,asset),away);}
  if(op==='missing')scene.append(group(Number(part),asset),visual('+ ?',asset));
 }else if(promptText){for(const token of promptText.split(' '))scene.append(visual(token,asset));}
 if(scene.childElementCount)area.append(scene);
 const grid=document.createElement('div');grid.className='early-choices';area.append(grid);
 if(style==='touch'||style==='build'||style==='sort'){
  const board=style==='sort'?promptText.split(' ').slice(1):null;
  const count=board?board.length:style==='touch'?target:Math.max(target,item.grade===-1?5:10);
  grid.classList.add('early-counter');let selected=0;
  for(let i=0;i<count;i++){
   const tile=document.createElement('button');tile.type='button';tile.setAttribute('aria-pressed','false');tile.append(board?visual(board[i],asset):picture(asset));
   tile.onclick=()=>{const pressed=tile.getAttribute('aria-pressed')==='true';tile.setAttribute('aria-pressed',String(!pressed));selected+=pressed?-1:1;};grid.append(tile);
  }
  const check=document.createElement('button');check.type='button';check.className='early-check';check.setAttribute('aria-label','Check my group');check.append(createIcon('check'));
  check.onclick=()=>{
   const value=board?Array.from(grid.querySelectorAll('button'),tile=>tile.getAttribute('aria-pressed')==='true'?'1':'0').join(''):String(selected);
   submit(value);
  };area.append(check);return;
 }
 for(const choice of item.choices||[]){
  const tile=document.createElement('button');tile.type='button';tile.dataset.value=choice.value;
  tile.append(style==='groups'?group(Number(choice.value),asset):visual(choice.value,asset));
  if(item.skillId==='k-shape')tile.style.setProperty('--rotation',String(Number(layout)*30)+'deg');
  tile.onclick=()=>submit(choice.value);grid.append(tile);
 }
}
