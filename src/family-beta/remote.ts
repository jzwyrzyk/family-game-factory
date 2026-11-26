import {BuilderClient,isKnownBuildRejection,validateBuilderConfig,type JobView} from '../builder/client';
import type {BuildSubmission} from '../builder/submission';
import {familyFetch} from '../builder/session';
import {openPreviewFrame} from '../builder/open-preview';
import {freshDesign,validateCoachReply,type CoachContext} from '../studio/design';
import {installStudioPrivateSpeech} from '../studio/private-speech';

interface Notebook {draft:string;conversation:CoachContext['conversation'];turn?:{requestId:string;context:CoachContext};submission?:BuildSubmission;job?:JobView;revision?:string}
export async function open(root:HTMLElement){
 const config=validateBuilderConfig(await (await fetch('/play/factory-config.json',{cache:'no-store'})).json());
 const profile=String((window as any).FG.store.current().id),caps=JSON.parse(document.documentElement.dataset.capabilities!);
 const namespace='jems-beta-remote-v1:'+profile;
 const read=():Notebook=>JSON.parse(localStorage.getItem(namespace)??'{"draft":"","conversation":[]}');
 const write=(edit:(n:Notebook)=>void)=>{const n=read();edit(n);localStorage.setItem(namespace,JSON.stringify(n));};
 let active=true;
 function add<K extends keyof HTMLElementTagNameMap>(tag:K,text=''){const el=document.createElement(tag);el.textContent=text;root.append(el);return el;}
 const heading=add('h2','Your creative workshop'),history=add('div'),label=add('label','Your game idea'),draft=add('textarea'),status=add('p');
 status.setAttribute('role','status');draft.id='family-idea';label.htmlFor=draft.id;draft.maxLength=1200;draft.value=read().draft;
 const render=()=>{if(!active)return;history.replaceChildren();for(const line of read().conversation){const p=document.createElement('p');p.textContent=(line.role==='child'?'You · ':'Jems · ')+line.text;history.append(p);}};
 draft.oninput=()=>{try{write(n=>{n.draft=draft.value;});}catch{status.textContent='Your device could not save this idea. Keep this screen open.';}};
 render();
 function action(title:string,fn:()=>Promise<void>){
  const btn=add('button',title);btn.onclick=async()=>{btn.disabled=true;try{
   await navigator.locks.request(namespace,{ifAvailable:true},async lock=>{if(!lock)throw Error('This workshop is busy in another tab.');await fn();});
  }catch(error){if(active)status.textContent=error instanceof Error?error.message:'This activity is currently unavailable.';}finally{btn.disabled=false;}};
 }
 const client=new BuilderClient(config,(job,id)=>{if(!active)return;write(n=>{n.job=job;if(id===n.submission?.clientRequestId)delete n.submission;if(job.revisionId)n.revision=job.revisionId;});status.textContent='Game build · '+job.status;});
 if(caps.conversation)action('Talk about this idea',async()=>{
  let turn=read().turn;
  if(!turn){
   const text=draft.value.trim();if(!text)throw Error('Tell Jems one thing about your game.');
   const d=freshDesign(),context:CoachContext={message:text,mode:'discuss',game:'A brand-new game',plan:d.plan,friction:d.friction,helpLevel:d.helpLevel,support:d.support,conversation:read().conversation.slice(-8),observations:[],tests:[],creation:{version:2}};
   turn={requestId:crypto.randomUUID(),context};write(n=>{n.turn=turn;});
  }
  try{
   const data=await client.api('/v1/coach',turn);if(!active)return;if(data.mode!=='model')throw Error('Coaching is currently unavailable.');
   const reply=validateCoachReply(data.reply,turn.context),phrase=[reply.text,reply.question].filter(Boolean).join(' ');
   write(n=>{n.conversation.push({role:'child',text:turn!.context.message},{role:'helper',text:phrase});n.conversation=n.conversation.slice(-40);delete n.turn;if(n.draft===turn!.context.message)n.draft='';});
   draft.value=read().draft;render();status.textContent='';
  }catch(e){if(active&&e instanceof Error&&['PRIVATE_INFORMATION','COACH_REFUSED','GUARDIAN_CONSENT_REQUIRED','FORBIDDEN'].includes(e.message))write(n=>{delete n.turn;});throw e;}
 });
 if(caps.generation){
  action('Build or revise my game',async()=>{
   const saved=read();
   if(saved.submission||saved.job&&['queued','building','testing'].includes(saved.job.status))throw Error('Check your existing build first.');
   const prompt=draft.value.trim();if(!prompt)throw Error('Describe the game or a change you want to try.');
   const existing=saved.revision;
   try{await client.submit({gameId:'generated-module',baseRevisionId:existing??null,prompt},request=>write(n=>{n.submission=request;delete n.job;}));}
   catch(e){if(active&&isKnownBuildRejection(e))write(n=>{delete n.submission;});throw e;}
  });
  action('Check my existing build',async()=>{
   const n=read();if(n.submission){const job=await client.lookupSubmission(n.submission);if(!job){status.textContent='Waiting for the original build acknowledgment.';return;}if(active)await client.check(job.jobId);}
   else if(n.job)await client.check(n.job.jobId);else status.textContent='You have no pending build.';
  });
  action('Send my saved request again',async()=>{
   const saved=read().submission;if(!saved)throw Error('There is no unacknowledged build to resend.');
   await client.resendSavedSubmission(saved);
  });
  const cancel=add('button','Cancel my pending game');
  cancel.onclick=async()=>{const job=read().job;if(!job||!['queued','building','testing'].includes(job.status))return;
   try{await client.cancel(job.jobId);}catch{if(active)status.textContent='Reconnect and check the existing build.';}};
  action('Play my saved game',async()=>{
   const id=read().revision;if(!id)throw Error('A completed game will appear here.');
   const preview=await client.preview(id);if(!active)return;root.querySelector('iframe')?.remove();const frame=add('iframe');frame.title='Private game preview';frame.setAttribute('sandbox','allow-scripts');openPreviewFrame(frame,preview,crypto.randomUUID());
  });
 }
 const microphone=add('button','Speak');microphone.hidden=true;
 const speech=installStudioPrivateSpeech({button:microphone,status,scope:()=>active?profile:'',canListen:()=>active&&caps.remoteSpeech===true,
  available:async signal=>{const r=await familyFetch(location.origin,'/v1/coach/audio/status',{method:'GET',credentials:'same-origin',signal});if(!r.ok)return false;const v=await r.json();return v.available===true&&v.mode==='private';},
  transcribe:async(blob,signal)=>{const r=await familyFetch(location.origin,'/v1/coach/audio',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{'Content-Type':blob.type,'X-Factory-Request':'1','X-Factory-Audio-Id':crypto.randomUUID()},body:blob});
   if(!r.ok)throw Error('Transcription unavailable.');const result=await r.json();if(typeof result.text!=='string'||!result.text.trim()||result.text.length>2000)throw Error('Transcription unavailable.');return result.text;},
  onTranscript:text=>{if(active){draft.value=(draft.value+' '+text).trim().slice(0,draft.maxLength);draft.dispatchEvent(new Event('input'));}}});
 if(caps.remoteSpeech)void speech.refresh();
 heading.tabIndex=-1;heading.focus();
 return ()=>{active=false;speech.cancel();client.disconnect();};
}
