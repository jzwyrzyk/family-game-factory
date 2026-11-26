import '../legacy/store.js';
import {installRewardWriteGuard} from '../rewards/write-guard';
const FG=(window as any).FG;
const main=document.querySelector<HTMLElement>('#familyTools')!,target=document.querySelector<HTMLElement>('#familyActivity')!;
const caps=JSON.parse(document.documentElement.dataset.capabilities!);
const remote=caps.conversation||caps.generation||caps.remoteSpeech;
const names:Record<string,string>={games:'Mind Your Jems!',learning:'Math and English',coding:'Create & code',problemSolving:'Try an idea',remote:'My creative workshop'};
let dispose:(()=>void)|undefined;
function home(){dispose?.();dispose=undefined;target.replaceChildren();main.hidden=false;target.hidden=true;}
FG.learning={active:false,checkpoint:()=>false};FG.app={page:home};
void installRewardWriteGuard().then(writable=>{
 if(!writable)return;
 const select=document.createElement('select');select.setAttribute('aria-label','Explorer profile');
 for(const p of FG.store.data.profiles){const opt=new Option(p.name,p.id);select.append(opt);}select.value=FG.store.current().id;
 select.onchange=()=>{home();FG.store.choose(select.value);};main.append(select);
 for(const [name,title] of Object.entries(names)){
  if(name==='remote'?!remote:caps[name]!==true)continue;
  const button=document.createElement('button');button.textContent=title;main.append(button);
  button.onclick=async()=>{
   try{const module=await import(new URL(name+'.js',import.meta.url).href);main.hidden=true;target.hidden=false;dispose=await module.open(target,home);}
   catch{home();document.getElementById('familyExitStatus')!.textContent='This activity is unavailable. Your saved work stays here.';}
  };
 }
 document.getElementById('familyHome')!.onclick=home;
});
