import {artBuildHold,roleLabels,roleQuestion,type GameArtPlan,type GameArtRole} from './bindings';
export function renderArtPlan(box:HTMLElement,plan:GameArtPlan|undefined,actions:{
  remove(role:GameArtRole):void;sample(faster:boolean):void;play(id:string):void;
}){
  const signature=JSON.stringify(plan);
  // Render against the caller's current session. Reinstall actions even for identical copies.
  if(!plan || (!plan.pins.length && !plan.tests.length)){box.hidden=true;box.replaceChildren();delete box.dataset.plan;return;}
  if(box.dataset.plan===signature && box.dataset.game===box.parentElement?.dataset.artGame)return;
  box.dataset.plan=signature;box.dataset.game=box.parentElement?.dataset.artGame;box.hidden=false;box.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='My game pictures';box.append(heading);
  const button=(label:string,fn:()=>void)=>{const b=document.createElement('button');b.type='button';b.className='studio-button';b.textContent=label;b.onclick=fn;return b;};
  for(const pin of plan.pins){
    const row=document.createElement('div'),label=document.createElement('span');
    label.textContent=pin.name+' · '+roleLabels[pin.role];
    const remove=button('Remove',()=>actions.remove(pin.role));remove.setAttribute('aria-label','Remove '+pin.name+' as '+roleLabels[pin.role]);
    row.append(label,remove);box.append(row);
    if(pin.intent){const idea=document.createElement('p');idea.textContent=pin.intent;box.append(idea);}
  }
  if(plan.pins.length){
    const question=document.createElement('p'),hold=document.createElement('p');
    question.textContent=roleQuestion[plan.pins.at(-1)!.role];hold.textContent=artBuildHold;
    if(!plan.pins.at(-1)!.intent)box.append(question);box.append(hold);
  }
  if(import.meta.env.MODE==='game-art-review'){
    if(plan.pins.length)box.append(button(plan.tests.length?'Try faster flight':'Try art in a sample game',()=>actions.sample(!!plan.tests.length)));
    for(const [i,test] of plan.tests.entries())box.append(button('Play art test '+(i+1)+(test.id===plan.kept?' · kept':''),()=>actions.play(test.id)));
  }
}
