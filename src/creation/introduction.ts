import {SceneEngine} from './engine';
import {CreationStage} from './stage';
import {createIllustratedStarter} from './projects';
import type {CreationBlock} from './model';
import type {GuideHost} from '../studio/guide-card';
import {iconMarkup} from '../brand/icons';

/** A transient first try in the real interpreter. No project, reward or assessment write. */
export function createStudioIntroduction(guidance:GuideHost|undefined,leave:()=>void){
 const element=document.createElement('section');element.id='creationIntroduction';element.className='creation-introduction';element.hidden=true;
 element.innerHTML=`<div class="creation-intro-heading"><div><h2 tabindex="-1">Can you reach the gem?</h2><p>Choose arrows. Press Play. See what happens.</p></div><button id="creationIntroSkip" class="creation-button">Skip for now</button></div><div class="creation-intro-workspace"><canvas width="800" height="450" aria-label="A dragon to the left of a gem"></canvas><div><div class="creation-intro-arrows" role="group" aria-label="Add a movement">${[['left','←'],['right','→'],['up','↑'],['down','↓']].map(([direction,arrow])=>`<button class="creation-button" data-intro-move="${direction}" aria-label="Move ${direction}">${arrow}</button>`).join('')}</div><ol id="creationIntroSequence" aria-label="Your instructions"></ol><div class="creation-intro-actions"><button id="creationIntroPlay" class="creation-button creation-primary">${iconMarkup('play')} Play</button><button id="creationIntroUndo" class="creation-button">${iconMarkup('undo')} Undo</button></div><p id="creationIntroResult" role="status"></p><button id="creationIntroDone" class="creation-button">Explore Creative Studio ${iconMarkup('arrow')}</button></div></div>`;
 const canvas=element.querySelector('canvas')!,stage=new CreationStage(canvas);
 const project=createIllustratedStarter('dragon');
 project.actors=[{id:'explorer',name:'Dragon',assetId:'dragon',x:200,y:225,size:110},{id:'goal',name:'Gem',assetId:'gem',x:500,y:225,size:65}];
 project.programs=[{id:'first-steps',actorId:'explorer',trigger:{type:'start'},actions:[]}];
 let engine=new SceneEngine(project),frame=0,prior=0,running=false,epoch=0;
 const result=element.querySelector<HTMLElement>('#creationIntroResult')!;
 const actions=project.programs[0].actions;
 const draw=()=>stage.render(project,engine.snapshot(),'explorer');
 function stop(){epoch++;cancelAnimationFrame(frame);running=false;}
 function render(){const list=element.querySelector('#creationIntroSequence')!;list.replaceChildren();for(const action of actions){const item=document.createElement('li');const move=action as Extract<CreationBlock,{type:'move'}>;item.textContent=move.dx?move.dx>0?'→ Right':'← Left':move.dy!>0?'↓ Down':'↑ Up';list.append(item);}element.querySelector<HTMLButtonElement>('#creationIntroUndo')!.disabled=!actions.length;}
 function reset(){stop();actions.splice(0);engine=new SceneEngine(project);result.textContent='Each arrow adds one step.';render();draw();}
 for(const button of element.querySelectorAll<HTMLButtonElement>('[data-intro-move]'))button.onclick=()=>{stop();if(actions.length>=8){result.textContent='Try these steps, or Undo one.';return;}const direction=button.dataset.introMove;actions.push({id:crypto.randomUUID(),type:'move',dx:direction==='left'?-100:direction==='right'?100:0,dy:direction==='up'?-100:direction==='down'?100:0,durationMs:450,origin:'child'});engine=new SceneEngine(project);render();draw();};
 element.querySelector<HTMLButtonElement>('#creationIntroUndo')!.onclick=()=>{stop();actions.pop();engine=new SceneEngine(project);render();draw();};
 element.querySelector<HTMLButtonElement>('#creationIntroPlay')!.onclick=async()=>{
  stop();if(!actions.length){result.textContent='Choose an arrow to give your dragon a step.';return;}
  const token=epoch;try{await stage.prepare(project,()=>token===epoch&&!element.hidden);}catch{return;}if(token!==epoch)return;
  engine=new SceneEngine(project);engine.start();running=true;prior=0;result.textContent='Your instructions are moving the dragon.';
  const animate=(time:number)=>{if(!running||element.hidden)return;const delta=prior?Math.min(50,time-prior):16;prior=time;const snapshot=engine.advance(delta);draw();if(snapshot.status==='completed'){running=false;const actor=snapshot.actors.find(a=>a.id==='explorer')!;result.textContent=Math.abs(actor.x-500)<45&&Math.abs(actor.y-225)<45?'You reached it! Your steps made that happen.':'Where did your dragon stop? Change a step and try again.';}else frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
 };
 const finish=()=>{try{guidance?.dismiss('studio-intro');stop();element.hidden=true;leave();}catch{result.textContent='Could not save your choice. Try again.';}};
 element.querySelector<HTMLButtonElement>('#creationIntroSkip')!.onclick=finish;element.querySelector<HTMLButtonElement>('#creationIntroDone')!.onclick=finish;
 window.addEventListener('factory-profile-before-change',()=>{stop();element.hidden=true;stage.clear();});
 window.addEventListener('factory-page',()=>{stop();});
 return {element,show(){element.hidden=false;reset();element.querySelector<HTMLElement>('h2')!.focus({preventScroll:true});},hide(){stop();element.hidden=true;},needed:()=>!!guidance&&!guidance.isDismissed('studio-intro')};
}
