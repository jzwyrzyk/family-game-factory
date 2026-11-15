import type { AgentAdapter,AgentInput } from './types';
export class UnavailableAgent implements AgentAdapter {
 readonly available=false;
 constructor(public kind:'codex-subscription'|'metered-api'){}
 async generate(_input:AgentInput):Promise<never>{throw Error('ADAPTER_UNAVAILABLE');}
}
// Adapter activation must be explicit. Owning a ChatGPT plan/connector does not enable a public build API.
export function productionAgent(kind:'codex-subscription'|'metered-api'):AgentAdapter{return new UnavailableAgent(kind);}
