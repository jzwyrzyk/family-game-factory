import type {CoachReceipt} from '../coach/service';
import type {FamilyCoachConsent} from '../coach/consent';
import type {ParentPrivacyChoice} from '../privacy/parent-consent';
import type {AdultPilotPermit,AdultPilotSession} from '../adult-pilot';
import type {AudioReceipt} from '../coach/speech';
import type {NarrationReceipt} from '../coach/narration';
import type {TrustedDevice,FamilyParentAuth} from '../trusted-devices';
import type {Invitation} from '../sessions';
import type {ActionExecution} from '../actions/coordinator';
import type { GeneratedGame } from '../agent/generated';
import type {FunctionalGameContract} from '../quality/functional-game-contract';
import type {GameQualityEvidence,GameQualityReview} from '../quality/game-quality';
export type JobStatus = 'draft'|'queued'|'building'|'testing'|'ready'|'failed'|'cancelled';
export interface StarGame { kind:'star-catcher-v1'; target:number; seconds:number }
export type PlayableGame = StarGame | GeneratedGame;
export type CandidateArtifact = {format:'declarative-v1';game:StarGame}|{format:'generated-source-v1';game:GeneratedGame};
export interface AgentInput {
  gameManifest:{id:string;allowedMechanics:readonly string[]}; baseRevision:{id:string;game?:PlayableGame;config?:Record<string,number|boolean>;sourceGame?:string;projectId?:string};
  childIntent:string; allowedCapabilities:readonly string[]; budget:{maxUnits:number;timeoutMs:number}; signal:AbortSignal;
}
export interface AgentAdapter {
  available:boolean;
  readonly testFixture?:boolean;
  kind:'local-rule'|'mock'|'codex-subscription'|'metered-api';
  repair?(input:AgentInput,previous:GeneratedGame,diagnostics:string,context?:{qualityEvidence?:GameQualityEvidence}):Promise<{candidate:CandidateArtifact;usageUnits:number}>;
  review?(input:AgentInput,game:GeneratedGame,evidence:GameQualityEvidence):Promise<{review:GameQualityReview;usageUnits:number}>;
  generate(input:AgentInput):Promise<{candidate:CandidateArtifact;usageUnits:number}>;
}
export interface BuildRequest { gameId:string; baseRevisionId:string|null; prompt:string; clientRequestId:string; retryOf?:string }
export interface Job extends BuildRequest {
 /** Server-owned acceptance policy. Public submissions cannot set or disable it. */
 qualityRequired?:'game-quality-v1';
 execution?:ActionExecution;
  /** Internal-only, independently authored and source-validated O5 probe;
   * BuildRequest rejects this field from clients, so it is never user-supplied.
   * Disabled for ordinary public submissions unless a trusted server process
   * explicitly attaches an approved contract.
   */
  independentIntentPlan?:FunctionalGameContract;
  adultPilotDeviceId?:string;
  /** Internal authorization and audience; never accepted in a BuildRequest. */
  adultPilotSessionId?:string;
  adultPilotProfileId?:string;
  id:string;familyId:string;status:JobStatus;adapter:'mock'|'metered-api'|'codex-subscription'|'local-rule';
  maxUnits:number;usedUnits:number;attempts?:number;phase?:string;revisionId?:string;errorCode?:string;retryCount:number;
}
export interface BuiltRevision { id:string;familyId:string;parentId:string|null;game:PlayableGame|null;projectId:string;sourceGame?:string;config?:Record<string,number|boolean>;name?:string;sourceRevisionId?:string;adapter?:string;adultPilotProfileId?:string }
export interface AuditEvent {
 jobId:string;familyId:string;status:JobStatus;at:string;code?:string;
 /** Allowance accounting only; never request, response or recording content. */
 usage?:{kind:'coach'|'audio'|'narration';month:string;reservedMicroUsd:number;usedMicroUsd:number;outcome:'settled'|'interrupted'};
}
export interface Ledger { allowance:number;used:number;reserved:number;paidEnabled:boolean;month:string }
export interface PipelineState { narrationReceipts?:NarrationReceipt[]; parentPrivacyChoices?:ParentPrivacyChoice[]; adultPilotPermits?:AdultPilotPermit[]; adultPilotSessions?:AdultPilotSession[]; coachReceipts?:CoachReceipt[]; audioReceipts?:AudioReceipt[]; coachConsent?:FamilyCoachConsent[]; invitations?:Invitation[]; devices?:TrustedDevice[]; parentAuth?:Record<string,FamilyParentAuth>; version:1;jobs:Job[];revisions:BuiltRevision[];active:Record<string,string>;ledgers:Record<string,Ledger>;audit:AuditEvent[] }
export interface Repository { transaction<T>(update:(state:PipelineState)=>T):Promise<T>; snapshot():Promise<PipelineState> }
