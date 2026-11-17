/**
 * Operator-only, stop-only utility. It never enables a feature, provisions infrastructure,
 * prints secrets or requires a new code deployment to disable cloud operations.
 *
 * Example (no mutation): npm run safety:stop -- --project=factory-project --workspace=family-001 --reason=INCIDENT
 * Authorize a real stop only by appending --execute with reviewed operator IAM.
 */
import {Firestore} from '@google-cloud/firestore';
import {disabledPolicy,type SafetyPolicyV1} from './contract';
export interface StopArguments {project:string;workspace:string;reason:string;execute:boolean}
export function parseStopArguments(args:readonly string[]):StopArguments {
 const allowed=new Set(['project','workspace','reason','execute']),seen=new Set<string>();
 const values:Record<string,string>={};
 for(const arg of args){
  if(!arg.startsWith('--'))throw Error('INVALID_STOP_ARGUMENTS');
  const [key,...rest]=arg.slice(2).split('=');
  if(!allowed.has(key)||seen.has(key)||((key==='execute')!==!rest.length))throw Error('INVALID_STOP_ARGUMENTS');
  seen.add(key);values[key]=rest.join('=');
 }
 if(!/^[a-z][a-z0-9-]{5,63}$/.test(values.project||'')||
    !/^[A-Za-z0-9_-]{1,100}$/.test(values.workspace||'')||
    ['__proto__','constructor','prototype'].includes(values.workspace)||
    !/^[A-Z][A-Z0-9_]{2,40}$/.test(values.reason||''))throw Error('INVALID_STOP_ARGUMENTS');
 return {project:values.project,workspace:values.workspace,reason:values.reason,execute:seen.has('execute')};
}
/** Monotonic epoch invalidates already queued owner-pilot jobs across stop/resume. */
export function nextEmergencyPolicy(prior:unknown,now=Date.now()):SafetyPolicyV1 {
 const previous=prior&&typeof prior==='object'?Number((prior as any).epoch):NaN;
 const epoch=Number.isSafeInteger(previous)&&previous>=1&&previous<Number.MAX_SAFE_INTEGER?previous+1:now;
 return disabledPolicy(now,epoch);
}
async function main(){
 const args=parseStopArguments(process.argv.slice(2));
 if(!args.execute){console.log('DRY RUN: would deny all cloud capabilities and increment the policy epoch. No write performed.');return;}
 const db=new Firestore({projectId:args.project});
 const ref=db.doc('factorySafetyPolicies/'+args.workspace);
 await db.runTransaction(async tx=>{
  const current=await tx.get(ref);
  tx.set(ref,nextEmergencyPolicy(current.exists?current.data():null));
 });
 // Operator records the reason in a restricted incident ticket. Never put child text here.
 console.log('Emergency policy stop committed; cloud capabilities are denied. Verify gateway and preview from an authorized test account.');
}
if(process.argv[1]&&/owner-stop\.(?:ts|js)$/.test(process.argv[1]))void main().catch(()=>{
 console.error('Safety stop failed. Do not assume the service is disabled; use the approved cloud incident procedure.');
 process.exitCode=1;
});
