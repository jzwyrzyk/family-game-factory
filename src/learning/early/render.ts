import {picture, hasPicture} from './pictures';
import {earlyMathTopic, shapes} from './math';
import {learningTheme} from '../workspace/theme';
import type {MathItem} from '../types';
import {createIcon} from '../../brand/icons';

function frame(className:string) {
 const node=document.createElement('span');node.className=className;return node;
}
type Counter = () => HTMLImageElement;
function group(n:number,counter:Counter) {
 const node=frame('early-group');
 for(let i=0;i<n;i++)node.append(counter());
 if(n===0){node.classList.add('early-empty-group');node.setAttribute('role','img');node.setAttribute('aria-label','Empty group');}
 return node;
}
function visual(value:string,counter:Counter){
 if(value==='small-gem'||value==='large-gem'){
  const image=picture('gem');image.classList.add('early-'+value);image.alt=value.replace('-',' ');return image;
 }
 if(hasPicture(value))return picture(value);
 if(value.startsWith('group-'))return group(Number(value.slice(6)),counter);
 const node=frame('early-token');
 if(shapes.some(s=>s===value)||value==='short'||value==='long'){
   node.classList.add('early-'+value);node.setAttribute('role','img');node.setAttribute('aria-label',value);
 }else node.textContent=value;
 return node;
}
// Only generic countable units can take on the game's appearance. Named
// pictures, categories, patterns, ordering by size and solid shapes stay exact.
const themedTopics = new Set(['touch','small','count','build','compare','equal','numeral-group','order','join','remove','missing','teen']);
export function mountEarlyMath(area:HTMLElement,item:MathItem,submit:(value:string)=>void,gameId?:string){
 const {prompt,object,style,n,b,layout}=item.parameters;
 const scene=frame('early-scene');scene.dataset.layout=String(layout);
 const target=Number(n),promptText=String(prompt);
 const theme=learningTheme(gameId);
 const themed=!!gameId && gameId!=='math-lab' && themedTopics.has(earlyMathTopic(item.skillId));
 const counter:Counter=()=>{
  if(!themed)return picture(String(object));
  const image=document.createElement('img');
  image.src=new URL(theme.counter,document.baseURI).href;
  image.alt=theme.noun;image.className='early-picture';image.draggable=false;
  return image;
 };
 if(style==='sort'){scene.append(visual(promptText.split(' ')[0],counter));}
 else if(prompt==='position'){scene.classList.add('early-column');scene.append(picture('star'),picture('gem'),picture('apple'));}
 else if(prompt==='category'){for(let i=0;i<Math.max(target,Number(b));i++){if(i<target)scene.append(picture('apple'));if(i<Number(b))scene.append(picture('pear'));}}
 else if(prompt==='teen'){scene.append(group(10,counter),visual('+',counter),group(target-10,counter));}
 else if(prompt==='triangles'){scene.append(visual('◢',counter),visual('◤',counter));}
 else if(/^(join|remove|missing)-/.test(promptText)){
  const [op,total,part]=promptText.split('-');const kept=Number(total)-Number(part);
  if(op==='join'){scene.append(group(Number(part),counter),visual('+',counter),group(kept,counter));}
  if(op==='remove'){const away=group(Number(part),counter);away.classList.add('early-removed');scene.append(group(kept,counter),away);}
  if(op==='missing')scene.append(group(Number(part),counter),visual('+ ?',counter));
 }else if(promptText){for(const token of promptText.split(' '))scene.append(visual(token,counter));}
 if(scene.childElementCount)area.append(scene);
 const grid=document.createElement('div');grid.className='early-choices';area.append(grid);
 if(style==='touch'||style==='build'||style==='sort'){
  const board=style==='sort'?promptText.split(' ').slice(1):null;
  const count=board?board.length:style==='touch'?target:Math.max(target,item.grade===-1?5:10);
  grid.classList.add('early-counter');let selected=0;
  for(let i=0;i<count;i++){
   const tile=document.createElement('button');tile.type='button';tile.setAttribute('aria-pressed','false');tile.append(board?visual(board[i],counter):counter());
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
  tile.append(style==='groups'?group(Number(choice.value),counter):visual(choice.value,counter));
  if(item.skillId==='k-shape')tile.style.setProperty('--rotation',String(Number(layout)*30)+'deg');
  tile.onclick=()=>submit(choice.value);grid.append(tile);
 }
}
