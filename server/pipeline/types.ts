export type JobStatus = 'draft'|'queued'|'building'|'testing'|'ready'|'failed'|'cancelled';
export interface StarGame { kind:'star-catcher-v1'; target:number; seconds:number }
export interface CandidateArtifact { format:'declarative-v1'; game:StarGame }
export interface AgentInput {
  gameManifest:{id:string;allowedMechanics:readonly string[]}; baseRevision:{id:string;game?:StarGame;config?:Record<string,number|boolean>};
  childIntent:string; allowedCapabilities:readonly ['declarative-star-catcher']; budget:{maxUnits:number;timeoutMs:number}; signal:AbortSignal;
}
export interface AgentAdapter {
  available:boolean;
  kind:'local-rule'|'mock'|'codex-subscription'|'metered-api';
  generate(input:AgentInput):Promise<{candidate:CandidateArtifact;usageUnits:number}>;
}
export interface BuildRequest { gameId:string; baseRevisionId:string|null; prompt:string; clientRequestId:string; retryOf?:string }
export interface Job extends BuildRequest {
  id:string;familyId:string;status:JobStatus;adapter:'mock'|'metered-api'|'codex-subscription'|'local-rule';
  maxUnits:number;usedUnits:number;revisionId?:string;errorCode?:string;retryCount:number;
}
export interface BuiltRevision { id:string;familyId:string;parentId:string|null;game:StarGame|null;projectId:string;sourceGame?:string;config?:Record<string,number|boolean>;name?:string;sourceRevisionId?:string;adapter?:string }
export interface AuditEvent { jobId:string;familyId:string;status:JobStatus;at:string;code?:string }
export interface Ledger { allowance:number;used:number;reserved:number;paidEnabled:boolean;month:string }
export interface PipelineState { version:1;jobs:Job[];revisions:BuiltRevision[];active:Record<string,string>;ledgers:Record<string,Ledger>;audit:AuditEvent[] }
export interface Repository { transaction<T>(update:(state:PipelineState)=>T):Promise<T>; snapshot():Promise<PipelineState> }
