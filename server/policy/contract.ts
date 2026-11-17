/**
 * Wave 01 production-safety policy, versioned separately from the game/learning protocols.
 * This contract is server-only. The client, prompts and generated games never select it.
 * A missing, stale, malformed or unexpectedly permissive document is NOT an approval.
 */
export const SAFETY_POLICY_VERSION = 1 as const;
export const ACTIVE_CAPABILITIES = ['cloud_generation','private_preview'] as const;
export const DEFERRED_CAPABILITIES = [
  'cloud_coach','remote_vision','new_family_enrollment','public_sharing','messaging',
  'crowdsourced_favorites','behavioral_ads','child_checkout'
] as const;
export const ALL_CAPABILITIES = [...ACTIVE_CAPABILITIES,...DEFERRED_CAPABILITIES] as const;
export type SafetyCapability = typeof ALL_CAPABILITIES[number];
export type ActiveCapability = typeof ACTIVE_CAPABILITIES[number];
export type CapabilityFlags = Record<SafetyCapability,boolean>;
export interface SafetyPolicyV1 {
  version: typeof SAFETY_POLICY_VERSION;
  scope: 'owner_pilot';
  epoch: number;
  updatedAt: number;
  expiresAt: number;
  emergencyStop: boolean;
  capabilities: CapabilityFlags;
}
export const SAFETY_POLICY_BLOCKED = 'SAFETY_POLICY_BLOCKED';
export const MAX_POLICY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=(o:unknown):o is Record<string,unknown> =>
  o!==null && typeof o==='object' && !Array.isArray(o) && (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o:Record<string,unknown>,keys:readonly string[])=>
  Object.keys(o).length===keys.length && keys.every(k=>own(o,k));
export function deniedCapabilities():CapabilityFlags {
  return Object.fromEntries(ALL_CAPABILITIES.map(k=>[k,false])) as CapabilityFlags;
}
export function disabledPolicy(now=Date.now(),epoch=1):SafetyPolicyV1 {
  return {version:1,scope:'owner_pilot',epoch,updatedAt:now,expiresAt:now+MAX_POLICY_AGE_MS,
    emergencyStop:true,capabilities:deniedCapabilities()};
}
export function validateSafetyPolicy(raw:unknown,now=Date.now()):SafetyPolicyV1|null {
  if(!plain(raw)||!exact(raw,['version','scope','epoch','updatedAt','expiresAt','emergencyStop','capabilities']))return null;
  if(raw.version!==SAFETY_POLICY_VERSION||raw.scope!=='owner_pilot'||typeof raw.emergencyStop!=='boolean')return null;
  const epoch=raw.epoch,updatedAt=raw.updatedAt,expiresAt=raw.expiresAt;
  if(typeof epoch!=='number'||!Number.isSafeInteger(epoch)||epoch<1||
    typeof updatedAt!=='number'||!Number.isSafeInteger(updatedAt)||
    typeof expiresAt!=='number'||!Number.isSafeInteger(expiresAt)||
    updatedAt>now+60_000||updatedAt<now-MAX_POLICY_AGE_MS||
    expiresAt<=now||expiresAt>updatedAt+MAX_POLICY_AGE_MS)return null;
  const flags=raw.capabilities;
  if(!plain(flags)||!exact(flags,ALL_CAPABILITIES)||
    ALL_CAPABILITIES.some(k=>typeof flags[k]!=='boolean')||
    DEFERRED_CAPABILITIES.some(k=>flags[k]!==false))return null;
  // Do not expose the untrusted source document as a mutable reference.
  return {version:1,scope:'owner_pilot',epoch,updatedAt,expiresAt,
    emergencyStop:raw.emergencyStop,capabilities:{...flags} as CapabilityFlags};
}
