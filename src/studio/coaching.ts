import {freshDesign, PLAN_FIELDS, PLAN_LABELS, missingPlan,planBrief,localCoach,validateCoachReply,type CoachContext,type CoachReply,type Experiment,type Origin} from './design';
import type {StudioNotebook,StudioSession,Candidate} from './notebook';
import type {BuilderConfig} from '../builder/client';
interface Hooks {
 notebook:StudioNotebook;current():StudioSession;owner():string;
 message(s:StudioSession,role:'child'|'helper'|'reflection',text:string):void;
 render():void;status(text:string,error?:boolean):void;
 config():BuilderConfig;localSupported(prompt:string):boolean;
 tryRequest(prompt:string,origin:Origin,depth:Experiment['depth']):Promise<void>;
 rules():string;playTest(id:string):Promise<void>;playMain():Promise<void>;combineTests(ids:string[]):Promise<void>;
 pauseForThinking():boolean;showTalk():void;
}
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
const action=(label:string,fn:()=>void)=>{const b=node('button',label,'studio-chip') as HTMLButtonElement;b.type='button';b.onclick=fn;return b;};
/** UI support only: the model can propose; it cannot execute or promote. */
export function installCoaching(h:Hooks){
 let generation=0,controller:AbortController|null=null,thinking=false;
 const combineSelection=new Set<string>();
 let selectedSuggestion:string|null=null,requestInFlight=false;
 let force=false,origin:Origin='child',depth:Experiment['depth']='tune';
 const controls=node('section','','design-controls');controls.id='designControls';
 controls.innerHTML='<div class="design-mode"><strong>How can I help?</strong><button type="button" id="coachDiscuss">Talk it through</button><button type="button" id="coachIdeas">Give me ideas</button><button type="button" id="coachExplain">Explain</button><button type="button" id="coachThink">Let me think / play</button></div><label for="experimentStart">Start the next experiment from</label><select id="experimentStart"><option value="main">My main game — a different test</option><option value="continue">This test — develop this idea</option></select><details><summary>My guess about this experiment (optional)</summary><input id="designPrediction" maxlength="300" placeholder="I think this might…"></details><button type="button" id="coachTry" class="studio-button">Try my idea</button><button type="button" id="coachPlanToggle" class="studio-button">My game plan</button><details><summary>How much help? (optional)</summary><label for="coachSupport">Explanation style</label><select id="coachSupport"><option value="brief">Short and simple</option><option value="balanced">A little help</option><option value="detailed">Explain more</option></select><label for="coachFriction">What I want to figure out</label><input id="coachFriction" maxlength="1000" placeholder="Optional — in your words"></details><span id="coachModeStatus" role="status"></span><div id="coachProposals"></div>';
 $('studioPromptForm').prepend(controls);
 const plan=node('details','','design-plan') as HTMLDetailsElement;plan.id='designPlan';
 const summary=node('summary','Our game plan — your choices');plan.append(summary);
 const intro=node('p','Tell us what matters, or let the helper suggest missing choices. “No score” and “no losing” are valid designs.');plan.append(intro);plan.append(action('You choose the remaining details',()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();for(const field of missingPlan(x.design))x.design.plan[field]={value:x.design.plan[field]?.value||'',origin:'helper',accepted:false,delegated:true};x.design.approvedPlan=false;});renderPlan();}));
 for(const key of PLAN_FIELDS){const label=node('label',PLAN_LABELS[key]) as HTMLLabelElement;label.htmlFor='plan-'+key;const input=document.createElement('textarea');input.id='plan-'+key;input.rows=2;input.maxLength=700;const credit=node('small');credit.id='plan-credit-'+key;const buttons=node('div','','design-plan-actions');buttons.append(action('Save my answer',()=>saveField(key)),action('You choose',()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.plan[key]={value:'',origin:'helper',accepted:false,delegated:true};x.design.approvedPlan=false;});renderPlan();}));plan.append(label,input,credit,buttons);}
 const approve=action('Build this plan',()=>{const s=h.current(),d=s.design||freshDesign();if(missingPlan(d).length){h.status('Choose an answer or “You choose” for the missing decisions.');plan.open=true;$('plan-'+missingPlan(d)[0]).focus();return;}h.notebook.update(s.id,s.owner,x=>{x.design!.approvedPlan=true;});const first=(s.messages.find(m=>m.role==='child')?.text||s.draft||'Build the game in this plan.').slice(0,350);const brief=PLAN_FIELDS.map(k=>k+': '+(d.plan[k]?.value?.slice(0,160)||'Child delegated this choice; propose a sensible rule.')).join('\n');void request(first+'\n\nApproved game plan (full choices remain in this notebook):\n'+brief,'child','redesign');});approve.id='buildGamePlan';plan.append(approve);
 $('studioPromptForm').after(plan);
 const shelf=node('section','','experiment-shelf');shelf.id='experimentShelf';$('studioVersions').prepend(shelf);
 const change=action('💬 Change my game',()=>{if(!h.pauseForThinking())return;document.body.classList.add('studio-designing');h.showTalk();renderPlan();});change.id='studioChange';$('studioPlay').after(change);
 $('designPrediction').oninput=()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.hypothesis=$<HTMLInputElement>('designPrediction').value;});};
 $('coachSupport').onchange=()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design!.support=$<HTMLSelectElement>('coachSupport').value as 'brief'|'balanced'|'detailed';});};
 $('coachFriction').oninput=()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design!.friction=$<HTMLInputElement>('coachFriction').value;});};
 $('coachDiscuss').onclick=()=>void discuss('discuss');$('coachIdeas').onclick=()=>void discuss('ideas');$('coachExplain').onclick=()=>void discuss('explain');
 $('coachTry').onclick=()=>{const p=$<HTMLTextAreaElement>('studioPrompt').value.trim();if(p)void request(p,p===selectedSuggestion?'helper':'child','tune');else h.status('Tell me the change you want to try.');};
 $('coachThink').onclick=()=>{if((window as any).FG.learning?.active){h.status('Finish the current math activity first.');return;}generation++;controller?.abort();thinking=false;const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.paused=true;x.reflection=false;});h.status('Your thoughts and tests are saved. Keep playing.');document.body.classList.remove('studio-designing');void h.playMain();};
 $('coachPlanToggle').onclick=()=>{plan.open=!plan.open;if(plan.open)renderPlan();};
 // Do not let typing in any design field move or jump the game character.
 [controls,plan,shelf].forEach(e=>e.addEventListener('keydown',event=>event.stopPropagation()));
 function saveField(key:typeof PLAN_FIELDS[number]){const s=h.current(),value=$<HTMLTextAreaElement>('plan-'+key).value.trim();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();const prior=x.design.plan[key];x.design.plan[key]={value,origin:prior?.origin==='helper'&&prior.value===value?'helper':'child',accepted:true,delegated:false};x.design.approvedPlan=false;});renderPlan();h.status('Saved your choice. Nothing has been built yet.');}
 function renderPlan(){const d=h.current().design||freshDesign();for(const key of PLAN_FIELDS){const input=$<HTMLTextAreaElement>('plan-'+key);if(document.activeElement!==input)input.value=d.plan[key]?.value||'';const f=d.plan[key];$('plan-credit-'+key).textContent=!f?'Not decided yet':f.delegated?'You asked the helper to choose; it must report that choice.':f.origin==='child'?'Your choice':f.accepted?'Helper suggestion you chose':'Helper suggestion — not accepted yet';}}
 function context(message:string,mode:CoachContext['mode']):CoachContext {const s=h.current(),d=s.design||freshDesign();return {message,mode,game:s.game,plan:d.plan,rules:h.rules(),friction:d.friction,helpLevel:d.helpLevel,support:d.support,conversation:s.messages.slice(-10).map(m=>({role:m.role,text:m.text})),observations:d.observations.slice(-8),tests:(s.experiments||[]).slice(-8).map(e=>({label:e.label,title:e.title,prediction:e.prediction,notes:e.notes}))};}
 async function request(prompt:string,from:Origin,level:Experiment['depth']){if(requestInFlight){h.status('One experiment is already being prepared.');return;}requestInFlight=true;force=true;origin=from;depth=level;try{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();let idea=x.design.ideas.find(i=>i.text===prompt.slice(0,1000)&&i.origin===from);if(idea)idea.adopted=true;else x.design.ideas.push({id:crypto.randomUUID(),text:prompt.slice(0,1000),origin:from,adopted:true});});await h.tryRequest(prompt,from,level);}catch(err){h.status((err as Error).message,true);}finally{force=false;requestInFlight=false;origin='child';depth='tune';}}
 function present(reply:CoachReply,mode:'model'|'local',captured:StudioSession){
  h.message(captured,'helper',(mode==='local'?'Local design helper: ':'AI design coach: ')+reply.text+(reply.question?'\n'+reply.question:''));
  h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();for(const d of reply.childDecisions||[]){if(!s.design.plan[d.field]?.accepted)s.design.plan[d.field]={value:d.quote,origin:'child',accepted:true,delegated:false};}for(const p of reply.planSuggestions){const current=s.design.plan[p.field];if(!current||current.delegated||current.origin==='helper'&&!current.accepted)s.design.plan[p.field]={value:p.value,origin:'helper',accepted:false,delegated:current?.delegated||false};}});
  const box=$('coachProposals');box.replaceChildren();
  reply.suggestions.forEach(text=>{h.notebook.update(captured.id,captured.owner,s=>{s.design!.ideas.push({id:crypto.randomUUID(),text,origin:'helper',adopted:false});});box.append(action(text,()=>{$<HTMLTextAreaElement>('studioPrompt').value=text;selectedSuggestion=text;$('studioPrompt').dispatchEvent(new Event('input'));h.status('A helper suggestion. Change it or choose to try it.');}));});
  if(reply.proposedChange){const proposal=reply.proposedChange;box.append(action('Try this idea: '+proposal.title,()=>void request(proposal.request,'helper',proposal.depth)));}
  renderPlan();
 }
 async function discuss(mode:CoachContext['mode'],supplied?:string){
  const captured=h.current(),text=(supplied??$<HTMLTextAreaElement>('studioPrompt').value).trim()||(mode==='ideas'?'Please help me find ideas.':mode==='explain'?'Explain the relevant game-design choice.':'What could I think about next?');
  if(thinking){h.status('Your design coach is still replying. You can keep playing.');return;}
  if(!h.pauseForThinking())return;document.body.classList.add('studio-designing');
  const seq=++generation;controller?.abort();controller=new AbortController();thinking=true;
  h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();s.design.paused=false;s.playOnly=false;if(/don.t know|stuck/i.test(text))s.design.helpLevel=Math.min(3,s.design.helpLevel+1);});
  h.message(captured,'child',text);const c=context(text,mode);$('coachModeStatus').textContent='Thinking together…';
  let reply:CoachReply,used:'model'|'local'='local';
  try{const config=h.config();if(config.mode!=='remote')throw Error('LOCAL');
   const response=await fetch(config.apiBaseUrl+'/v1/coach',{method:'POST',credentials:'include',signal:controller.signal,headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({requestId:crypto.randomUUID(),context:c})});
   const data=await response.json();if(!response.ok)throw Error(data.errorCode||'COACH_UNAVAILABLE');if(data.mode!=='model')throw Error('COACH_UNAVAILABLE');reply=validateCoachReply(data.reply,c);used='model';
  }catch(error){if(controller.signal.aborted)return;reply=localCoach(c);}
  finally{if(seq===generation)thinking=false;}
  if(seq!==generation||captured.owner!==h.owner()||captured.id!==h.current().id)return;
  present(reply!,used,captured);$('coachModeStatus').textContent=used==='model'?'Connected AI coach · no game changed':'Local reflection help · conversational AI is not connected';
  h.notebook.update(captured.id,captured.owner,s=>{s.draft='';});$<HTMLTextAreaElement>('studioPrompt').value='';h.render();
 }
 async function intercept(prompt:string):Promise<boolean>{
  if((window as any).FG.learning?.active){h.status('Finish the current math question before changing this game.');return true;}
  const s=h.current();if(force){if(s.game==='new'&&!s.remoteId&&!(s.design?.approvedPlan)){h.message(s,'helper','Let’s agree on the important game choices first. You can answer, say “none”, or ask me to choose.');plan.open=true;renderPlan();return true;}return false;}
  if(h.localSupported(prompt))return false;
  // Unfamiliar commands stay conversations until the child chooses Try my idea.
  await discuss('discuss',prompt);return true;
 }
 function renderShelf(){const s=h.current(),tests=s.experiments||[];shelf.replaceChildren(node('h2','My test ideas'),node('p','Try alternatives. Your main game changes only when you choose. Notes are optional.'));
  if(!tests.length){shelf.append(node('p','Your first experiment will appear here.'));return;}
  for(const e of tests){const card=node('article','','studio-version-card experiment-card');card.dataset.experiment=e.id;card.append(node('strong',e.label+' · '+e.title),node('p',e.candidate.summary),node('small',`${e.origin==='child'?'Your idea':'Helper suggestion you chose'} · ${{tune:'Small adjustment',redesign:'New way to play',rethink:'New direction'}[e.depth]} · ${e.parents.length?'Developed from '+e.parents.map(id=>tests.find(t=>t.id===id)?.label).join(' + '):'Started from the main game at that time'}`));
   if(e.prediction)card.append(node('p','Your prediction: '+e.prediction));
   const note=document.createElement('textarea');note.rows=2;note.maxLength=2000;note.value=e.notes;note.setAttribute('aria-label','Notes for '+e.label);note.placeholder='What did you notice? Or just remember it.';note.oninput=()=>{try{h.notebook.note(s.id,s.owner,e.id,note.value);}catch(err){h.status((err as Error).message,true);}};
   const include=document.createElement('input');include.type='checkbox';include.checked=combineSelection.has(e.id);include.setAttribute('aria-label','Combine '+e.label);include.onchange=()=>{if(include.checked)combineSelection.add(e.id);else combineSelection.delete(e.id);};const combineLabel=node('label','Include in a combined test');combineLabel.prepend(include);card.append(combineLabel);
   card.append(action('Play '+e.label,()=>void h.playTest(e.id)),action('Develop this test',()=>{h.notebook.selectExperiment(s.id,s.owner,e.id);$<HTMLSelectElement>('experimentStart').value='continue';h.showTalk();h.status('Your next test will start from '+e.label+'. This test stays on the shelf.');}),note);shelf.append(card);
  }
  const combine=action('Try selected ideas together',()=>{if(combineSelection.size<2){h.status('Choose at least two tests. Their originals will stay on the shelf.');return;}void h.combineTests([...combineSelection]).catch(e=>h.status(e.message,true));});combine.id='combineExperiments';combine.classList.add('studio-button');shelf.append(combine);
 }
 function newBase(){return $<HTMLSelectElement>('experimentStart').value==='continue';}
 function details(){const s=h.current();return {continueTest:newBase(),parents:newBase()&&s.candidate&&s.selectedTest===s.candidate.id?[s.selectedTest]:[],depth,origin:!force&&h.current().draft===selectedSuggestion?'helper':origin};}
 function openSession(){combineSelection.clear();selectedSuggestion=null;generation++;controller?.abort();thinking=false;$('coachProposals').replaceChildren();$<HTMLSelectElement>('experimentStart').value='main';document.body.classList.remove('studio-designing');const s=h.current();if(!s.design)h.notebook.update(s.id,s.owner,x=>{x.design=freshDesign();});$<HTMLInputElement>('designPrediction').value=s.hypothesis;$<HTMLSelectElement>('coachSupport').value=s.design?.support||'balanced';$<HTMLInputElement>('coachFriction').value=s.design?.friction||'';renderPlan();}
 return {intercept,details,renderShelf,renderPlan,openSession,discuss,reset:()=>{generation++;controller?.abort();thinking=false;},afterOutcome:(text:string,testId:string|null)=>{const s=h.current();h.notebook.observe(s.id,s.owner,text,'runtime',testId);},pauseReflection:()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.paused=true;});}};
}
