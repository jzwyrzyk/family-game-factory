/** Truthful, child-readable creation-state copy; no UI state is evidence of a remote job. */
export type CoachConnection = 'checking'|'available'|'connected'|'limited'|'sign-in'|'unavailable';
export type BuilderReadiness = 'checking'|'available'|'not-configured'|'sign-in'|'allowance-required'|'unavailable';
export type BuildView = {status:'queued'|'building'|'testing'|'ready'|'failed'|'cancelled'; phase?:string; errorCode?:string};
export function coachConnectionCopy(state:CoachConnection):string {
 const copy:Record<CoachConnection,string>={
  checking:'Checking if jems can chat…',
  available:'AI conversation is available · no game is building',
  connected:'jems is chatting with you · no build started',
  limited:'Limited conversation · AI coach could not respond',
  'sign-in':'Conversation needs a grown-up to reconnect',
  unavailable:'Limited conversation · AI coach is not connected'
 };
 return copy[state];
}
export function builderReadinessCopy(state:BuilderReadiness):string {
 const copy:Record<BuilderReadiness,string>={
  checking:'Checking the game workshop…',
  available:'The game workshop is available',
  'not-configured':'Game building is not connected here',
  'sign-in':'Game workshop needs a grown-up to reconnect',
  'allowance-required':'Game building is paused for this family',
  unavailable:'Game workshop is unavailable right now'
 };
 return copy[state];
}
export function buildErrorCopy(code:string|undefined):string {
 switch(code){
  case 'UNAUTHENTICATED': case 'FORBIDDEN':return 'The workshop needs a grown-up to reconnect. Your idea is saved; nothing was built.';
  case 'SPENDING_CUTOFF':return 'The family workshop allowance has been reached. Your idea is saved; nothing was built.';
  case 'BUILDER_UNAVAILABLE':return 'The workshop is not available right now. Your idea is saved; no game build started.';
  case 'RATE_LIMIT':return 'The workshop needs a short break before another try. Your idea is safe.';
  case 'PRIVATE_INFORMATION':return 'That request needs a safer description. Your idea is saved; no game build started.';
  case 'REQUEST_REJECTED': case 'INVALID_REQUEST':return 'The workshop could not accept that change. Nothing was built; your original is safe.';
  default:return 'The workshop did not confirm a build. Your idea is saved and your working game is safe.';
 }
}
export function buildProgressCopy(job:BuildView|undefined, sending:boolean, uncertain=false){
 if(uncertain)return {title:'Checking the workshop connection',description:'A build might still be running. We have not confirmed its latest state.',phase:'uncertain' as const};
 if(!job)return sending?{title:'Sending your idea…',description:'Waiting for the workshop to accept it. No build is confirmed yet.',phase:'sending' as const}:null;
 switch(job.status){
  case 'queued':return {title:'Your idea reached the workshop!',description:'Your build was accepted and is waiting to start.',phase:'queued' as const};
  case 'building':return {title:'jems is building your game!',description:job.phase==='repairing'?'The workshop is repairing a test version.':'Your new game is being created in the workshop.',phase:'building' as const};
  case 'testing':return {title:'Testing your game!',description:job.phase==='repairing'?'The workshop is checking a repair.':'The workshop is checking your playable version.',phase:'testing' as const};
  case 'ready':return {title:'Your new game is ready! ✨',description:'You can try the preview. Your original game is safe.',phase:'ready' as const};
  case 'failed':return {title:'That build needs help',description:'The game was not completed. Your idea and last working version are safe.',phase:'failed' as const};
  case 'cancelled':return {title:'Build cancelled',description:'Your original game and idea are safe.',phase:'cancelled' as const};
 }
}
/** Comparison is a deliberate activity, not an always-visible requirement. */
export function canCompareExperiments(count:number){return count>=2;}
