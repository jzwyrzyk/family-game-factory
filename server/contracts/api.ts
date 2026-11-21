/** Server-only contracts. No credentials, cloud clients or deployment are bundled into the static app. */
import type { GameId, Mechanics } from '../../src/runtime/types';
export type Role = 'designer' | 'parent';
export interface VerifiedSession {
  // Obtained from verified identity middleware, NEVER from request JSON.
  subject: string; familyId: string; role: Role; expiresAt: number; deviceId?: string;
  // Attached by the adult cookie + per-tab proof middleware, never a profile
  // name, client JSON field or an ambient family-session cookie.
  adultSessionId?:string; adultProfileId?:string;
  /** Server-attached lease for an IAP-verified adult testing synthetic child UI. */
  devTestGrantId?:string;
}
export interface PrivateResource { familyId: string; id: string }
export type GenerationState = 'queued' | 'running' | 'validating' | 'ready' | 'failed' | 'cancelled';
export interface GenerationJob extends PrivateResource {
  state: GenerationState; baseRevisionId: string; idempotencyKey: string;
  artifact?: { objectKey: string; sha256: string }; error?: string;
}
export interface ArtifactProvenance {
  source: 'child-drawing' | 'licensed' | 'generated';
  permissionForCutout: boolean; permissionForRigging: boolean;
  originalPrivateObjectKey: string;
}
export interface CreateSession { version: 1 }
export interface InterpretRequest { version: 1; revisionId: string; prompt: string }
export interface RevisionRequest { version: 1; parentId: string; game: GameId; config: Mechanics; idempotencyKey: string }
export interface GenerationRequest { version: 1; baseRevisionId: string; prompt: string; idempotencyKey: string }
export interface CoachRequest { version: 1; revisionId: string; playId: string; reflection?: string; skip?: boolean }
export const endpoints = [
  ['POST','/v1/sessions'],['POST','/v1/interpret'],['POST','/v1/revisions'],['POST','/v1/generations'],
  ['GET','/v1/generations/{id}'],['POST','/v1/generations/{id}/cancel'],['GET','/v1/revisions/{id}'],
  ['POST','/v1/revisions/{id}/fork'],['POST','/v1/revisions/{id}/publish'],['POST','/v1/coach'],
] as const;
export function requireFamily(session: VerifiedSession | null, resource: PrivateResource, now=Date.now()): VerifiedSession {
  if (!session || !session.subject || session.expiresAt<=now || session.familyId!==resource.familyId) throw Error('Forbidden');
  return session;
}
export function requirePublish(session: VerifiedSession | null, resource: PrivateResource, evidence:{testsPassed:boolean;artifactValidated:boolean;parentApproved:boolean}) {
  const verified=requireFamily(session,resource);
  if (verified.role!=='parent' || !evidence.testsPassed || !evidence.artifactValidated || !evidence.parentApproved) throw Error('Release gate not satisfied');
}
export interface BudgetPort {
  // Atomic reservation in Firestore, fail CLOSED on store failure. Hard application cap, not a billing alert.
  reserve(familyId:string,idempotencyKey:string,maxCostUnits:number):Promise<{reservationId:string}>;
  release(reservationId:string):Promise<void>;
}
export interface PrivateVersionPort {
  get(familyId:string,revisionId:string):Promise<PrivateResource>;
  // Immutable, tenant-scoped, conditional writes and per-family idempotency keys.
  create(familyId:string,request:RevisionRequest):Promise<PrivateResource>;
}
export interface ArtifactPort {
  // Private Cloud Storage: no public buckets, no caller-selected paths, short-lived scoped URLs only.
  authorizedPreview(session:VerifiedSession,artifact:PrivateResource):Promise<{url:string;expiresAt:number}>;
}
export interface IsolatedBuildPort {
  // External worker only. No app credentials, metadata access, arbitrary outbound network, or main-origin execution.
  validate(job:GenerationJob,limits:{cpuMs:number;memoryMb:number;outputBytes:number;network:'none'}):Promise<{validated:boolean;sha256:string}>;
  cancel(familyId:string,jobId:string):Promise<void>;
}
export interface AIProviderAdapter {
  // Implement only on the server; provider key is resolved by workload identity from Secret Manager.
  propose(input:{prompt:string;baseConfig:Mechanics;signal:AbortSignal}):Promise<{kind:'parameter-change';config:Mechanics}|{kind:'isolated-build-needed';specification:string}>;
}
export class UnconfiguredAIProvider implements AIProviderAdapter {
  async propose():Promise<never> { throw Error('AI provider is not configured. Generation is unavailable.'); }
}
export function validateGenerationRequest(input:unknown):GenerationRequest {
  const r=input as GenerationRequest;
  if(!r || r.version!==1 || Object.keys(r).some(k=>!['version','baseRevisionId','prompt','idempotencyKey'].includes(k)) || typeof r.baseRevisionId!=='string' || !/^[\w-]{1,100}$/.test(r.baseRevisionId) || typeof r.prompt!=='string' || r.prompt.trim().length<1 || r.prompt.length>2000 || typeof r.idempotencyKey!=='string' || !/^[\w-]{8,100}$/.test(r.idempotencyKey)) throw Error('Invalid generation request');
  return {version:1,baseRevisionId:r.baseRevisionId,prompt:r.prompt,idempotencyKey:r.idempotencyKey};
}
export const allowedTransitions: Record<GenerationState,readonly GenerationState[]> = {
  queued:['running','cancelled'],running:['validating','failed','cancelled'],validating:['ready','failed','cancelled'],ready:[],failed:[],cancelled:[],
};
export function transition(job:GenerationJob,next:GenerationState):GenerationJob {
  if(!allowedTransitions[job.state].includes(next))throw Error('Invalid job transition');
  if(next==='ready'&&(!job.artifact||!/^([a-f0-9]{64})$/.test(job.artifact.sha256)))throw Error('Validated artifact required');
  return {...job,state:next};
}
