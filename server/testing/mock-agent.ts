import type { AgentAdapter,AgentInput,CandidateArtifact } from '../pipeline/types';
/** Test fixture only. A genuine new playable mechanic, NOT an AI integration. */
export class MockAgent implements AgentAdapter {
 readonly kind='mock' as const;readonly available=true;
 async generate(input:AgentInput):Promise<{candidate:CandidateArtifact;usageUnits:number}>{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,80);input.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('CANCELLED'))},{once:true});});
  const words:Record<string,number>={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};const match=input.childIntent.toLowerCase().match(/(?:catch|collect) (two|three|four|five|six|seven|eight|nine|ten|\d+) stars/);
  if(!match)throw Error('MOCK_FIXTURE_UNSUPPORTED');
  return {candidate:{format:'declarative-v1',game:{kind:'star-catcher-v1',target:words[match[1]]||Number(match[1]),seconds:input.baseRevision.game?.seconds||15}},usageUnits:0};
 }
}
