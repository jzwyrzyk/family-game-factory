import {OpenAIResponsesAgent,type AgentApproval} from '../agent/openai';
import type { AgentAdapter,AgentInput } from './types';
export class UnavailableAgent implements AgentAdapter {
 readonly available=false;
 constructor(public kind:'codex-subscription'|'metered-api'){}
 async generate(_input:AgentInput):Promise<never>{throw Error('ADAPTER_UNAVAILABLE');}
}
// Adapter activation must be explicit. Owning a ChatGPT plan/connector does not enable a public build API.
export function productionAgent(kind:'codex-subscription'|'metered-api',options?:{approval:AgentApproval;key:()=>string;transport?:typeof fetch}):AgentAdapter{if(kind==='metered-api'&&options)return new OpenAIResponsesAgent(options.approval,options.key,options.transport);return new UnavailableAgent(kind);}
