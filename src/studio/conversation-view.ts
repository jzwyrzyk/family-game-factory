import type {Message} from './notebook';

const legacyPlanMarker='\n\nApproved game plan (full choices remain in this notebook):\n';
const legacyBuildUpdates=new Set([
 'Your request is queued.', 'Building a separate preview…', 'Testing the preview…',
 'Repairing the preview…', 'Your new preview is ready.',
 'The build did not work. Your current game is safe.', 'Build cancelled. Your current game is unchanged.'
]);

/** Presentation compatibility only. Never mutate old notebooks or build records. */
export function visibleConversation(messages:readonly Message[]):Message[]{
 const visible:Message[]=[];
 for(const message of messages){
  if(message.role==='helper'&&legacyBuildUpdates.has(message.text.replace(/^Test builder \(mock\): /,'')))continue;
  const marker=message.role==='child'?message.text.indexOf(legacyPlanMarker):-1;
  if(marker>=0){
   const plan=message.text.slice(marker+legacyPlanMarker.length);
   // Recognize only the old host-produced eight-field envelope, not prose
   // about plans or a child's unrelated use of any of these words.
   if(['fun','action','goal','setback','score','style','progression','special'].every(key=>new RegExp('^'+key+': ','m').test(plan))){
    const idea=message.text.slice(0,marker).trim();
    if(idea&&!visible.some(prior=>prior.role==='child'&&prior.text===idea))visible.push({...message,text:idea});
    continue;
   }
  }
  visible.push(message);
 }
 return visible;
}

/** Longer explanations are optional; a trailing question stays above More. */
export function helperPreview(text:string):{lead:string;question:string;more:string}{
 if(text.length<=260)return {lead:text,question:'',more:''};
 const questionMatch=text.match(/(?:^|[.!?]\s+|\n)([^.!?\n]{1,350}\?)\s*$/);
 const question=questionMatch?.[1]?.trim()||'';
 const explanation=question?text.slice(0,text.lastIndexOf(question)).trim():text;
 const first=explanation.match(/^.*?[.!?](?:\s|$)/s)?.[0]?.trim();
 const lead=first&&first.length<=240?first:explanation.slice(0,220).replace(/\s+\S*$/,'')+'…';
 return {lead,question,more:text};
}
