import {freshDesign, PLAN_FIELDS, PLAN_LABELS,localCoach,validateCoachReply,type CoachContext,type CoachReply,type Experiment,type Origin,type PlanField,type DesignField} from './design';
import type {StudioNotebook,StudioSession} from './notebook';
import {familyFetch} from '../builder/session';
import type {BuilderConfig} from '../builder/client';
import {conversationDisposition} from './experience';
import {visibleConversation} from './conversation-view';
import {creationInputFingerprint,recordCreationReview,creationBuildReadiness,creationConversation,creationPlan,lastCreationTurn,type CreationBuildReadiness} from './creation-readiness';
import {guidedDelegation,explicitPlanChoices,compileGuidedBuild,isExplicitPlanRevision,authoredFollowupIntents,isRejectedChildTurn,isHelperAuthoredTurn} from './guided-planning';
interface Hooks {
 notebook:StudioNotebook;current():StudioSession;owner():string;
 message(s:StudioSession,role:'child'|'helper'|'reflection',text:string):void;
 render():void;status(text:string,error?:boolean):void;
 config():BuilderConfig;localSupported(prompt:string):boolean;
 tryRequest(prompt:string,origin:Origin,depth:Experiment['depth'],displayText?:string,compiledPlan?:boolean):Promise<void>;
 rules():string;playTest(id:string):Promise<void>;playMain():Promise<void>;combineTests(ids:string[]):Promise<void>;
 pauseForThinking():boolean;showTalk():void;
 onCoachReply?(text:string):void;
 onCoachState?(state:'connected'|'limited'|'sign-in'|'unavailable'):void;
 /** Fired only after a design choice or test note is durably saved. */
 onSavedDesignChange?(before:StudioSession,after:StudioSession):void;
}
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
/** UI support only: the model can propose; it cannot execute or promote. */
export function installCoaching(h:Hooks){
 let generation=0,requestGeneration=0,controller:AbortController|null=null,thinking=false,reviewUnavailable=false;
 const helperFields=new Map<PlanField,DesignField>(),pendingFields=new Map<PlanField,string>();
 function isCurrent(s:StudioSession){try{return s.owner===h.owner()&&s.id===h.current().id;}catch{return false;}}
 function report(error:unknown,s?:StudioSession){if(s&&!isCurrent(s))return;h.status(error instanceof Error?error.message:String(error),true);}
 function run(fn:()=>void|Promise<void>){let s:StudioSession|undefined;try{s=h.current();Promise.resolve(fn()).catch(error=>report(error,s));}catch(error){report(error,s);}}
 const action=(label:string,fn:()=>void|Promise<void>)=>{const b=node('button',label,'studio-chip') as HTMLButtonElement;b.type='button';b.onclick=()=>run(fn);return b;};
 function cancelDiscussion(){generation++;controller?.abort();controller=null;thinking=false;$('coachModeStatus').textContent='';$('coachModeStatus').classList.remove('is-thinking');}
 function cancelRequest(){requestGeneration++;requestInFlight=false;force=false;origin='child';depth='tune';}

 const combineSelection=new Set<string>();
 let requestInFlight=false,promptVersion=0;
 $('studioPrompt').addEventListener('input',()=>{promptVersion++;});
 let force=false,origin:Origin='child',depth:Experiment['depth']='tune';
 const controls=node('section','','design-controls');controls.id='designControls';
 controls.innerHTML='<div class="design-mode"><strong>How can I help?</strong><button type="button" id="coachDiscuss">Talk it through</button><button type="button" id="coachIdeas">Give me ideas</button><button type="button" id="coachExplain">Explain</button><button type="button" id="coachThink">Let me think / play</button></div><details id="coachExperimentOptions" class="design-options"><summary>Experiment options (optional)</summary><label for="experimentStart">Start the next experiment from</label><select id="experimentStart"><option value="main">My main game — a different test</option><option value="continue">This test — develop this idea</option></select><label for="designPrediction">My guess about this experiment (optional)</label><input id="designPrediction" maxlength="300" placeholder="I think this might…"></details><button type="button" id="coachTry" class="studio-button">Try my idea</button><button type="button" id="coachPlanToggle" class="studio-button">My game plan</button><details id="coachSupportOptions" class="design-options"><summary>How much help? (optional)</summary><label for="coachSupport">Explanation style</label><select id="coachSupport"><option value="brief">Short and simple</option><option value="balanced">A little help</option><option value="detailed">Explain more</option></select><label for="coachFriction">What I want to figure out</label><input id="coachFriction" maxlength="1000" placeholder="Optional — in your words"></details><span id="coachModeStatus" role="status"></span><div id="coachProposals"></div>';
 const extras=$('studioExtraTools');
 if(extras)extras.append(controls);else {const more=node('details','','studio-more-choices') as HTMLDetailsElement;more.id='coachMoreOptions';more.append(node('summary','More choices'),controls);$('studioPromptForm').after(more);}
 $('studioMessages').after($('coachProposals'),$('coachModeStatus'));
 const plan=node('details','','design-plan') as HTMLDetailsElement;plan.id='designPlan';
 const summary=node('summary','My game plan');plan.append(summary);
 const guideStatus=node('p','','design-guide-status');guideStatus.id='designGuideStatus';plan.append(guideStatus);
 const planReview=node('section','','design-plan-review');planReview.id='designPlanReview';planReview.hidden=true;plan.append(planReview);
 const planStatus=node('p','','design-plan-status');planStatus.id='planSaveStatus';planStatus.setAttribute('role','status');plan.append(planStatus);
 const intro=node('p','Your ideas are saved here. You can change them in the conversation or write a detail below.');plan.append(intro);
 for(const key of PLAN_FIELDS){
  const field=node('section','','design-plan-field');field.dataset.field=key;
  const label=node('label',PLAN_LABELS[key]) as HTMLLabelElement;label.htmlFor='plan-'+key;
  const input=document.createElement('textarea');input.id='plan-'+key;input.rows=2;input.maxLength=700;input.oninput=()=>run(()=>saveField(key,false));
  const credit=node('small');credit.id='plan-credit-'+key;
  const buttons=node('div','','design-plan-actions');
  buttons.append(action('Save my answer',()=>saveField(key)));
  field.append(label,input,credit,buttons);plan.append(field);
 }
 (extras||controls).append(plan);
 const shelf=node('section','','experiment-shelf');shelf.id='experimentShelf';$('studioVersions').prepend(shelf);
 const change=action('💬 Talk or change my game',()=>{if(!h.pauseForThinking())return;document.body.classList.add('studio-designing');h.showTalk();renderPlan();});change.id='studioChange';$('studioPlay').after(change);
 $('designPrediction').oninput=()=>run(()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.hypothesis=$<HTMLInputElement>('designPrediction').value;});});
 $('coachSupport').onchange=()=>run(()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.support=$<HTMLSelectElement>('coachSupport').value as 'brief'|'balanced'|'detailed';});});
 $('coachFriction').oninput=()=>run(()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.friction=$<HTMLInputElement>('coachFriction').value;});});
 $('coachDiscuss').onclick=()=>void discuss('discuss');$('coachIdeas').onclick=()=>void discuss('ideas');$('coachExplain').onclick=()=>void discuss('explain');
 $('coachTry').onclick=()=>{const s=h.current(),p=$<HTMLTextAreaElement>('studioPrompt').value.trim();if(isNewIdea(s)){h.status('Tell me what you want to make. We will talk it through first.');h.showTalk();return;}if(p)void request(p,sourceOf(s,p),'tune');else h.status('Tell me the change you want to try.');};
 $('coachThink').onclick=()=>run(async()=>{if((window as any).FG.learning?.active){h.status('Finish the current learning activity first.');return;}cancelDiscussion();cancelRequest();const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.paused=true;x.reflection=false;});h.status('Your thoughts and tests are saved. Keep playing.');document.body.classList.remove('studio-designing');await h.playMain();});
 $('coachPlanToggle').onclick=()=>run(()=>{plan.open=!plan.open;if(plan.open)renderPlan();});
 // Do not let typing in any design field move or jump the game character.
 [controls,plan,shelf].forEach(e=>e.addEventListener('keydown',event=>event.stopPropagation()));
 function saveField(key:PlanField,explicit=true){
  const s=h.current(),value=$<HTMLTextAreaElement>('plan-'+key).value,prior=s.design?.plan[key],helper=helperFields.get(key);
  // Saving work does not accept an unchanged helper proposal or approve a whole plan.
  if(!explicit&&prior?.value===value){pendingFields.delete(key);return;}
  pendingFields.set(key,value);
  const unchangedHelper=helper?.value===value?helper:prior?.origin==='helper'&&prior.value===value?prior:undefined;
  try{h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.plan[key]=unchangedHelper
    ?{...unchangedHelper,accepted:explicit||unchangedHelper.accepted,delegated:explicit?false:unchangedHelper.delegated}
    :{value,origin:'child',accepted:!!value.trim(),delegated:false};x.design.approvedPlan=false;});}
  catch(error){planStatus.textContent='This answer has not saved yet. Keep it here and try Save my answer again.';throw error;}
  h.onSavedDesignChange?.(s,h.notebook.get(s.id,s.owner));
  pendingFields.delete(key);planStatus.textContent=pendingFields.size?'Some answers have not saved yet. Use Save my answer beside each one to try again.':'Your answers are saved on this device. Nothing has been built yet.';
  renderPlan();
  if(explicit)h.status('Saved your choice. Nothing has been built yet.');
 }
 function firstIdea(s:StudioSession){return visibleConversation(s.messages).find((m,index,messages)=>m.role==='child'&&!isHelperAuthoredTurn(m,s.design||freshDesign())&&!isRejectedChildTurn(messages,index,s.design)&&!['Build my game','Build this plan'].includes(m.text)&&!guidedDelegation(m.text))?.text||s.draft;}
 function isNewIdea(s:StudioSession){return s.game==='new'&&!s.remoteId&&!s.projectId&&!s.candidate;}
 function sourceOf(s:StudioSession,text:string):Origin{return s.design?.ideas.some(idea=>idea.origin==='helper'&&idea.text.trim()===text.trim())||Object.values(s.design?.plan||{}).some(choice=>choice?.origin==='helper'&&choice.value.trim()===text.trim())?'helper':'child';}
 function buildReadiness():CreationBuildReadiness {
  const s=h.current();
  if(!isNewIdea(s))return {ready:true,reason:''};
  if(thinking)return {ready:false,reason:'jems is still thinking about your idea.',issue:'thinking'};
  if(pendingFields.size)return {ready:false,reason:'Save your new ideas before building.',issue:'unsaved'};
  const readiness=creationBuildReadiness({...s,draft:$<HTMLTextAreaElement>('studioPrompt').value},s.design?.creationStandard===2?2:1);
  if(!readiness.ready&&readiness.issue!=='draft'&&reviewUnavailable)return {ready:false,reason:'Chat could not check your idea. Try reconnecting.',issue:'review-unavailable'};
  return readiness;
 }
 function canReassess(){
  const s=h.current();return isNewIdea(s)&&!thinking&&!requestInFlight&&!pendingFields.size&&!$<HTMLTextAreaElement>('studioPrompt').value.trim()&&!!lastCreationTurn(s);
 }
 async function reassess(){
  if(!canReassess()){h.status(buildReadiness().reason||'Tell me your game idea first.');return;}
  // This is an explicit check of saved words, not another authored statement
  // and never a Build action or an automatic retry of a metered request.
  const latest=lastCreationTurn(h.current())!;
  await discuss('discuss',latest.text,true,latest.id);
 }
 function buildPrompt(latestIntent=''):string|null {
  const s=h.current();if(!isNewIdea(s))return null;
  const readiness=buildReadiness();if(!readiness.ready)throw Error(readiness.reason);
  if(latestIntent.trim()&&!s.messages.some(message=>message.role==='child'&&message.text.trim()===latestIntent.trim()))throw Error('Send your new idea so we can think it through first.');
  const design={...s.design!,plan:creationPlan(s)};
  return compileGuidedBuild(firstIdea(s),design,latestIntent,authoredFollowupIntents(visibleConversation(s.messages),design));
 }
 function saveLiteralChoices(s:StudioSession,text:string,prior?:CoachContext['plan'],source:Origin='child',modelFields:readonly PlanField[]=[]){
  const expressed=explicitPlanChoices(text);if(!Object.keys(expressed).length)return;
  const correction=isExplicitPlanRevision(text);
  h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();let changed=false;const accepted=creationPlan(x);for(const key of PLAN_FIELDS){
   const current=x.design.plan[key],unchanged=prior===undefined||JSON.stringify(current)===JSON.stringify(prior[key]);
   if(expressed[key]&&!modelFields.includes(key)&&unchanged&&(correction||!accepted[key]?.accepted||current?.delegated)){x.design.plan[key]={...expressed[key]!,origin:source};changed=true;}
  }if(changed)x.design.approvedPlan=false;});
  h.onSavedDesignChange?.(s,h.notebook.get(s.id,s.owner));
 }
 function focusGuidedQuestion(){
  const box=$('studioMessages'),target=(box.lastElementChild as HTMLElement|null)||$('studioPromptLabel');
  target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView?.({block:'nearest',behavior:'auto'});
 }
 function renderPlan(replaceFocused=false){
  const d=h.current().design||freshDesign();plan.classList.remove('guided');planReview.hidden=true;
  guideStatus.textContent='Your ideas, in your words.';
  for(const key of PLAN_FIELDS){
   const field=plan.querySelector<HTMLElement>('.design-plan-field[data-field="'+key+'"]');if(field)field.hidden=false;
   const input=$<HTMLTextAreaElement>('plan-'+key),f=d.plan[key];
   if(f?.origin==='helper'&&!pendingFields.has(key))helperFields.set(key,{...f});
   if(replaceFocused||document.activeElement!==input)input.value=pendingFields.get(key)??f?.value??'';
   $('plan-credit-'+key).textContent=pendingFields.has(key)?'Not saved yet':!f?'Not discussed yet':f.delegated?'Earlier helper detail — still to discuss':f.origin==='child'?'Your idea':f.accepted?'Suggestion you chose':'Suggestion';
  }
  $('coachTry').hidden=isNewIdea(h.current());
 }
 function context(message:string,mode:CoachContext['mode']):CoachContext {
  const s=h.current(),d=s.design||freshDesign(),creating=isNewIdea(s);
  const conversation=visibleConversation(s.messages).filter(message=>!creating||message.role!=='child'||!isHelperAuthoredTurn(message,d));
  const result:CoachContext={message,mode,game:s.game,...(creating?{creation:{version:d.creationStandard===2?2 as const:1 as const}}:{}),plan:creating?creationPlan(s):d.plan,rules:h.rules(),friction:d.friction,helpLevel:d.helpLevel,support:d.support,conversation:creating?[]:conversation.slice(-10).map(m=>({role:m.role,text:m.text})),observations:d.observations.slice(-8),tests:(s.experiments||[]).slice(-8).map(e=>({label:e.label,title:e.title,prediction:e.prediction,notes:e.notes}))};
  if(creating){
   // Keep authored intent within the existing 16-entry protocol and the default
   // 16k input allowance. Old test notes cannot crowd out a first game's idea.
   while(JSON.stringify(result).length>12000&&result.tests.length)result.tests.shift();
   while(JSON.stringify(result).length>12000&&result.observations.length)result.observations.shift();
   result.conversation=creationConversation(s,Math.max(2,15500-JSON.stringify(result).length));
  }
  return result;
 }
 async function request(prompt:string,from:Origin,level:Experiment['depth'],displayText?:string,compiledPlan=false){
  let captured:StudioSession|undefined,token=0;
  try{captured=h.current();if(isNewIdea(captured)){h.status('Tell me what you want to make. We will talk it through first.');h.showTalk();return;}if(requestInFlight){h.status('One experiment is already being prepared.');return;}
   token=++requestGeneration;cancelDiscussion();requestInFlight=true;force=true;origin=from;depth=level;
   h.notebook.update(captured.id,captured.owner,x=>{x.design ||= freshDesign();const authored=(compiledPlan?firstIdea(captured!):prompt).slice(0,1000);let idea=x.design.ideas.find(i=>i.text===authored&&i.origin===from);if(idea)idea.adopted=true;else x.design.ideas.push({id:crypto.randomUUID(),text:authored,origin:from,adopted:true});});
   h.onSavedDesignChange?.(captured,h.notebook.get(captured.id,captured.owner));
   await h.tryRequest(prompt,from,level,displayText,compiledPlan);
  }catch(error){if(!token||token===requestGeneration)report(error,captured);}finally{if(token&&token===requestGeneration){force=false;requestInFlight=false;origin='child';depth='tune';}}
 }
 function present(reply:CoachReply,mode:'model'|'local',captured:StudioSession,turn?:{text:string;prior:CoachContext['plan'];origin:Origin;messageId:string;reviewCurrent:boolean;requestMode:CoachContext['mode']}){
  const before=h.notebook.get(captured.id,captured.owner);
  h.notebook.update(captured.id,captured.owner,s=>{
   s.design ||= freshDesign();let changed=false;
   for(const d of reply.childDecisions||[]){
    const previous=s.design.plan[d.field],unchanged=!turn||JSON.stringify(previous)===JSON.stringify(turn.prior[d.field]);
    const correction=!!turn&&isExplicitPlanRevision(turn.text)&&turn.text.includes(d.quote);
    if(unchanged&&(!creationPlan(s)[d.field]?.accepted||previous?.delegated||correction)){
     s.design.plan[d.field]={value:d.quote,origin:turn?.text.includes(d.quote)?turn.origin:sourceOf(s,d.quote),accepted:true,delegated:false};changed=true;
    }
   }
   for(const p of reply.planSuggestions){const current=s.design.plan[p.field];if(!current||current.delegated||current.origin==='helper'&&!current.accepted){s.design.plan[p.field]={value:p.value,origin:'helper',accepted:false,delegated:false};changed=true;}}
   // Remember only turns fully represented by a saved field. A later revision
   // may replace that answer without reviving it as an unrelated extra rule.
   for(const message of s.messages){
    if(message.role!=='child'||!Object.values(s.design.plan).some(choice=>choice?.accepted&&!choice.delegated&&choice.value.trim()===message.text.trim()))continue;
    const id='plan-answer:'+message.id;
    if(!s.design.ideas.some(idea=>idea.id===id))s.design.ideas.push({id,text:message.text.slice(0,1000),origin:sourceOf(s,message.text),adopted:true});
   }
   for(const text of [...reply.suggestions,...(reply.proposedChange?[reply.proposedChange.request]:[])]){
    const bounded=text.slice(0,1000);if(!s.design.ideas.some(idea=>idea.origin==='helper'&&idea.text===bounded))s.design.ideas.push({id:crypto.randomUUID(),text:bounded,origin:'helper',adopted:false});
   }
   if(changed)s.design.approvedPlan=false;
   if(mode==='model'&&turn?.reviewCurrent&&isNewIdea(s)&&reply.creationReadiness){
    try{s.design.creationReview=recordCreationReview(s,reply.creationReadiness,s.design.creationStandard===2?2:1);}catch{delete s.design.creationReview;reviewUnavailable=true;}
   }
  });
  h.onSavedDesignChange?.(before,h.notebook.get(captured.id,captured.owner));
  const question=reply.question,text=reply.text;
  // The connected coach's reflection and contextual question are the actual
  // conversation. Never replace them with a fixed interview or answer buttons.
  if(text.trim())h.message(captured,'helper',text);
  if(reply.suggestions.length&&turn?.requestMode==='ideas')h.message(captured,'helper','Some ideas from jems:\n'+reply.suggestions.join('\n'));
  if(question)h.message(captured,'helper',question);
  const box=$('coachProposals');box.replaceChildren();
  if(reply.proposedChange&&!isNewIdea(captured)){const proposal=reply.proposedChange;box.append(action('Try this idea: '+proposal.title,()=>{if(isCurrent(captured))return request(proposal.request,'helper',proposal.depth);}));}
  renderPlan();
  h.onCoachReply?.(text+(question?' '+question:''));
 }
 async function discuss(mode:CoachContext['mode'],supplied?:string,preserveDraft=false,reviewMessageId?:string){
  const reviewOnly=!!reviewMessageId;
  let captured:StudioSession|undefined,seq=0,turn:AbortController|undefined;
  try{
   captured=h.current();const input=$<HTMLTextAreaElement>('studioPrompt'),submittedDraft=input.value,submittedVersion=promptVersion;
   const planAtSubmission=captured.design?.plan;
   const text=(supplied??submittedDraft).trim()||(mode==='ideas'?'Please help me find ideas.':mode==='explain'?'Explain the relevant game-design choice.':'What could I think about next?');
   const submittedOrigin=sourceOf(captured,text);
   // Stop/play are immediate child requests, never interpreted as build consent.
   const disposition=conversationDisposition(text);
   if(disposition!=='continue'&&!reviewOnly){
    if((window as any).FG?.learning?.active){h.status('Finish the current learning activity before leaving the conversation.');return;}
    cancelDiscussion();
    h.message(captured,'child',text);
    const response=disposition==='cancel'?'Okay! No game changed. Your ideas are saved if you want to return.':
      captured.game==='new'?'Okay! Your idea is saved for when you want to come back.':'Okay! Let’s play your game. Nothing has changed.';
    h.message(captured,'helper',response);
    if(!preserveDraft&&input.value===submittedDraft){h.notebook.update(captured.id,captured.owner,s=>{s.draft='';});input.value='';}
    h.onCoachReply?.(response);
    h.render();
    if(disposition==='play'&&captured.game!=='new'&&(captured.projectId||captured.remoteId||captured.candidate))await h.playMain();
    return;
   }
   if(thinking){h.status('Your design coach is still replying. You can keep playing.');return;}
   if(!h.pauseForThinking())return;document.body.classList.add('studio-designing');
   seq=++generation;controller?.abort();turn=new AbortController();controller=turn;thinking=true;reviewUnavailable=false;
   h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();s.design.paused=false;s.playOnly=false;if(/don.t know|stuck/i.test(text))s.design.helpLevel=Math.min(3,s.design.helpLevel+1);});
   if(!reviewOnly)h.message(captured,'child',text);
   const submittedMessage=reviewOnly?visibleConversation(h.current().messages).find(message=>message.role==='child'&&message.id===reviewMessageId):h.current().messages.at(-1);
   if(!submittedMessage)throw Error('Your saved idea could not be found. Reopen it and try again.');
   if(submittedOrigin==='helper')h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();s.design.ideas.push({id:'helper-turn:'+submittedMessage.id,text:text.slice(0,1000),origin:'helper',adopted:true});});
   const submittedFingerprint=creationInputFingerprint(h.current());
   const c=context(text,mode);$('coachModeStatus').textContent='jems is thinking about your idea…';$('coachModeStatus').classList.add('is-thinking');
   let reply:CoachReply,used:'model'|'local'='local',reason='',safetyRefusal=false;
   try{const config=h.config();if(config.mode!=='remote')throw Error('LOCAL');
    const response=await familyFetch(config.apiBaseUrl!,'/v1/coach',{method:'POST',credentials:'include',signal:turn.signal,headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify({requestId:crypto.randomUUID(),context:c})});
    const data=await response.json();if(!response.ok)throw Error(data.errorCode||'COACH_UNAVAILABLE');if(data.mode!=='model')throw Error('COACH_UNAVAILABLE');reply=validateCoachReply(data.reply,c);used='model';
   }catch(error){
    if(turn.signal.aborted)return;
    reason=error instanceof Error?error.message:'COACH_UNAVAILABLE';
    // A model/moderation refusal is a safety decision. Never route that
    // rejected child request through a separate unreviewed local helper.
    safetyRefusal=reason==='COACH_REFUSED'||reason==='PRIVATE_INFORMATION';
    reply=safetyRefusal?
     {move:'listen',text:'I can help with safe game ideas. Let’s try another idea without sharing private details.',
      question:'What would you like to create instead?',suggestions:[],proposedChange:null,
      planSuggestions:[],childDecisions:[],evidenceIds:[]}:
     localCoach(c);
   }
   if(seq!==generation||!isCurrent(captured))return;
   if(safetyRefusal)h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();const id='refused-turn:'+submittedMessage.id;if(!s.design.ideas.some(idea=>idea.id===id))s.design.ideas.push({id,text:text.slice(0,1000),origin:submittedOrigin,adopted:false});});
   const reviewCurrent=used==='model'&&creationInputFingerprint(h.current())===submittedFingerprint;
   const correctionFields=[...new Set([...Object.keys(explicitPlanChoices(text)),...(reply.childDecisions||[]).filter(choice=>text.includes(choice.quote)).map(choice=>choice.field)])] as PlanField[];
   const now=h.current(),supersededCorrection=!safetyRefusal&&isNewIdea(captured)&&isExplicitPlanRevision(text)&&correctionFields.some(field=>JSON.stringify(now.design?.plan[field])!==JSON.stringify(planAtSubmission?.[field]));
   if(supersededCorrection){
    h.notebook.update(captured.id,captured.owner,s=>{s.design ||= freshDesign();const id='superseded-turn:'+submittedMessage.id;if(!s.design.ideas.some(idea=>idea.id===id))s.design.ideas.push({id,text:text.slice(0,1000),origin:submittedOrigin,adopted:false});});
    reply={move:'listen',text:'Your newer choice is saved.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
   }
   if(!safetyRefusal&&!supersededCorrection&&isNewIdea(captured)&&mode==='discuss'){
    const modelFields=(reply.childDecisions||[]).filter(choice=>text.includes(choice.quote)).map(choice=>choice.field);
    saveLiteralChoices(h.current(),text,planAtSubmission,submittedOrigin,modelFields);
   }
   if(used==='local'&&!safetyRefusal&&guidedDelegation(text))reply={...reply,text:'I can help you think of your own idea.',question:'Imagine one moment you would want to play. What happens in it?',suggestions:[],planSuggestions:[]};
   if(used==='local'&&!safetyRefusal&&isNewIdea(captured)){
    reviewUnavailable=true;
    reply={move:'listen',text:'Chat could not answer just now. Your idea is saved.',question:null,suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
   }
   present(reply,used,captured,{text,prior:planAtSubmission||{},origin:submittedOrigin,messageId:submittedMessage.id,reviewCurrent:reviewCurrent&&!supersededCorrection,requestMode:mode});
   // A content refusal is not evidence that chat disconnected. In particular,
   // the gateway can reject private details before contacting the provider.
   if(!safetyRefusal)h.onCoachState?.(used==='model'&&!reviewUnavailable?'connected':['UNAUTHENTICATED','FORBIDDEN','ADULT_PILOT_ACCESS_REQUIRED'].includes(reason)?'sign-in':h.config().mode==='remote'?'limited':'unavailable');
   $('coachModeStatus').textContent=used==='model'&&!reviewUnavailable?'Connected AI coach · no game changed':safetyRefusal?'This request could not be used safely · no game changed':reviewUnavailable?'Chat could not check your idea · no game changed':'Local reflection help · conversational AI is not connected';
   // A reply may arrive after the child has started another thought. Preserve it
   // immediately, including edits whose ordinary draft debounce has not fired yet.
   const nextDraft=preserveDraft?input.value:promptVersion===submittedVersion&&input.value===submittedDraft?'':input.value;
   h.notebook.update(captured.id,captured.owner,s=>{s.draft=nextDraft;});input.value=nextDraft;h.render();
   // The model may understand an indirect wish to play that did not match our
   // narrow immediate-skip vocabulary. Navigating back is not a build action.
   if(reply.move==='play'&&captured.game!=='new'&&(captured.projectId||captured.remoteId||captured.candidate))await h.playMain();
  }catch(error){if(captured&&isCurrent(captured)&&(!seq||seq===generation)){$('coachModeStatus').textContent='Your reply could not be saved. Your draft is still here.';report(error,captured);}}
  finally{if(seq&&seq===generation){thinking=false;$('coachModeStatus').classList.remove('is-thinking');if(controller===turn)controller=null;renderPlan();h.render();}}
 }
 async function intercept(prompt:string,explicitTry=false):Promise<boolean>{
  if((window as any).FG.learning?.active){h.status('Finish the current learning question before changing this game.');return true;}
  const s=h.current();if(force||explicitTry){
   if(isNewIdea(s)){
    const readiness=buildReadiness();
    if(!readiness.ready){h.status(readiness.reason);h.showTalk();focusGuidedQuestion();return true;}
    if(prompt.trim()&&!s.messages.some(message=>message.role==='child'&&message.text.trim()===prompt.trim())){h.status('Send your new idea so we can think it through first.');h.showTalk();return true;}
   }
   return false;
  }
  if(!isNewIdea(s)&&h.localSupported(prompt))return false;
  // The legacy implicit-send path stays conversational; explicit Try means build/plan.
  await discuss('discuss',prompt);return true;
 }
 function renderShelf(){const s=h.current(),tests=s.experiments||[];shelf.replaceChildren(node('h2','My test ideas'),node('p','Try alternatives. Your main game changes only when you choose. Notes are optional.'));
  if(!tests.length){shelf.append(node('p','Your first experiment will appear here.'));return;}
  for(const e of tests){const card=node('article','','studio-version-card experiment-card');card.dataset.experiment=e.id;card.append(node('strong',e.label+' · '+e.title),node('p',e.candidate.summary),node('small',`${e.origin==='child'?'Your idea':'Helper suggestion you chose'} · ${{tune:'Small adjustment',redesign:'New way to play',rethink:'New direction'}[e.depth]} · ${e.parents.length?'Developed from '+e.parents.map(id=>tests.find(t=>t.id===id)?.label).join(' + '):'Started from the main game at that time'}`));
   if(e.prediction)card.append(node('p','Your prediction: '+e.prediction));
   const note=document.createElement('textarea');note.rows=2;note.maxLength=2000;note.value=e.notes;note.setAttribute('aria-label','Notes for '+e.label);note.placeholder='What did you notice? Or just remember it.';note.oninput=()=>run(()=>{if(isCurrent(s)){const before=h.notebook.get(s.id,s.owner);h.notebook.note(s.id,s.owner,e.id,note.value);h.onSavedDesignChange?.(before,h.notebook.get(s.id,s.owner));}});
   const include=document.createElement('input');include.type='checkbox';include.checked=combineSelection.has(e.id);include.setAttribute('aria-label','Combine '+e.label);include.onchange=()=>{if(include.checked)combineSelection.add(e.id);else combineSelection.delete(e.id);};const combineLabel=node('label','Include in a combined test');combineLabel.prepend(include);card.append(combineLabel);
   card.append(action('Play '+e.label,()=>h.playTest(e.id)),action('Develop this test',()=>{h.notebook.selectExperiment(s.id,s.owner,e.id);$<HTMLSelectElement>('experimentStart').value='continue';$<HTMLDetailsElement>('coachExperimentOptions').open=true;h.showTalk();h.status('Your next test will start from '+e.label+'. This test stays on the shelf.');}),note);shelf.append(card);
  }
  const combine=action('Try selected ideas together',()=>{if(combineSelection.size<2){h.status('Choose at least two tests. Their originals will stay on the shelf.');return;}return h.combineTests([...combineSelection]);});combine.id='combineExperiments';combine.classList.add('studio-button');shelf.append(combine);
 }
 function newBase(){return $<HTMLSelectElement>('experimentStart').value==='continue';}
 function details(){const s=h.current();return {continueTest:newBase(),parents:newBase()&&s.candidate&&s.selectedTest===s.candidate.id?[s.selectedTest]:[],depth,origin:force?origin:sourceOf(s,s.draft)};}
 function flushDrafts(){
  // Navigation must not clear a failed field save merely because the main prompt
  // is already durable. Let the caller keep this view open if storage still fails.
  for(const key of pendingFields.keys())saveField(key,false);
  const s=h.current(),prediction=$<HTMLInputElement>('designPrediction').value,friction=$<HTMLInputElement>('coachFriction').value;
  if(s.hypothesis!==prediction||(s.design?.friction||'')!==friction)h.notebook.update(s.id,s.owner,x=>{x.hypothesis=prediction;x.design ||= freshDesign();x.design.friction=friction;});
 }
 function openSession(){
  combineSelection.clear();cancelDiscussion();cancelRequest();helperFields.clear();pendingFields.clear();planStatus.textContent='';reviewUnavailable=false;
  plan.classList.remove('guided');
  $('coachProposals').replaceChildren();$<HTMLSelectElement>('experimentStart').value='main';
  $<HTMLDetailsElement>('coachExperimentOptions').open=false;$<HTMLDetailsElement>('coachSupportOptions').open=false;plan.open=false;
  document.body.classList.remove('studio-designing');const s=h.current();if(!s.design)h.notebook.update(s.id,s.owner,x=>{x.design=freshDesign();});
  $<HTMLInputElement>('designPrediction').value=s.hypothesis;$<HTMLSelectElement>('coachSupport').value=s.design?.support||'balanced';$<HTMLInputElement>('coachFriction').value=s.design?.friction||'';
  renderPlan(true);
 }
 return {intercept,buildPrompt,buildReadiness,canReassess,reassess,details,renderShelf,renderPlan,flushDrafts,openSession,discuss,tryPreset:(prompt:string)=>request(prompt,'helper','tune'),reset:()=>{cancelDiscussion();cancelRequest();helperFields.clear();pendingFields.clear();reviewUnavailable=false;},afterOutcome:(text:string,testId:string|null)=>{const s=h.current();h.notebook.observe(s.id,s.owner,text,'runtime',testId);},pauseReflection:()=>{const s=h.current();h.notebook.update(s.id,s.owner,x=>{x.design ||= freshDesign();x.design.paused=true;});}};
}
