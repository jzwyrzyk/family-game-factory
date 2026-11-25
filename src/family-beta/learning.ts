import {mountMathActivity} from '../learning/activity';
import {mountLanguageActivity} from '../language/activity';
import '../learning/activity.css';
import '../language/activity.css';
export function open(root:HTMLElement,home:()=>void){
 const store=(window as any).FG.store,profile=store.current();
 let activity:{dispose():void}|undefined;
 for(const [subject,title] of [['math','Practice math'],['language','Practice English']]){
  const btn=document.createElement('button');btn.textContent=title;root.append(btn);
  btn.onclick=()=>{activity?.dispose();root.replaceChildren();const options={profile,onSave:()=>store.save(),onComplete:home};
   activity=subject==='math'?mountMathActivity(root,options):mountLanguageActivity(root,options);};
 }
 return ()=>activity?.dispose();
}
