/** Private generation-environment implementation. Not imported or instantiated by
 * the public gateway. It must never ship in browser bundles or a gateway image.
 * Model credentials are injected only into the separately approved private executor.
 */
import {COACH_POLICY,COACH_SCHEMA} from './policy';
import {approved,type CoachConfig,type CoachProvider} from './service';
import type {CoachContext} from '../../src/studio/design';
export type PrivateCoachConfig = CoachConfig & {apiKey:string};
export class OpenAICoachProvider implements CoachProvider {
 constructor(private config:PrivateCoachConfig,private transport:typeof fetch=fetch){}
 private async moderate(input:string,signal:AbortSignal){
  const response=await this.transport('https://api.openai.com/v1/moderations',{method:'POST',signal,headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input})});
  if(!response.ok)throw Error('COACH_PROVIDER_FAILED');const raw=await response.text();if(raw.length>100000)throw Error('COACH_PROVIDER_FAILED');const result=JSON.parse(raw);if(!Array.isArray(result.results)||!result.results.length||result.results.some((r:any)=>typeof r.flagged!=='boolean'||r.flagged))throw Error('COACH_REFUSED');
 }
 async complete(context:CoachContext,signal:AbortSignal){
  if(!approved(this.config)||!this.config.apiKey||this.config.apiKey.length<16)throw Error('COACH_UNAVAILABLE');
  const c=this.config,serialized=JSON.stringify(context);
  if(serialized.length>c.maxInputChars)throw Error('INVALID_REQUEST');
  // UTF-8 bytes are a conservative token ceiling; include policy, schema and envelope overhead.
  const inputCeiling=Buffer.byteLength(serialized+COACH_POLICY+JSON.stringify(COACH_SCHEMA))+2048;
  if(Math.ceil((inputCeiling*c.inputMicroUsdPerMillion+c.maxOutputTokens*c.outputMicroUsdPerMillion)/1000000)>c.maxTurnMicroUsd)throw Error('SPENDING_CUTOFF');
  await this.moderate(serialized,signal);
  const response=await this.transport('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,store:false,max_output_tokens:c.maxOutputTokens,input:[{role:'developer',content:COACH_POLICY},{role:'user',content:serialized}],text:{format:{type:'json_schema',name:'child_owned_design_coach',strict:true,schema:COACH_SCHEMA}}})});
  if(!response.ok)throw Error('COACH_PROVIDER_FAILED');
  const raw=await response.text();if(raw.length>100000)throw Error('COACH_PROVIDER_FAILED');
  const body=JSON.parse(raw);if(body.status!=='completed'||body.output?.some((m:any)=>m.content?.some((c:any)=>c.type==='refusal')))throw Error('COACH_REFUSED');
  const output=body.output?.flatMap((m:any)=>m.type==='message'?m.content||[]:[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
  const u=body.usage;if(!Number.isSafeInteger(u?.input_tokens)||u.input_tokens<0||!Number.isSafeInteger(u?.output_tokens)||u.output_tokens<0)throw Error('COACH_PROVIDER_FAILED');
  const usedMicroUsd=Math.ceil((u.input_tokens*c.inputMicroUsdPerMillion+u.output_tokens*c.outputMicroUsdPerMillion)/1000000);
  await this.moderate(output,signal);
  return {reply:JSON.parse(output),usedMicroUsd};
 }
}
