import {ACTIVE_CAPABILITIES,SAFETY_POLICY_BLOCKED,validateSafetyPolicy,type ActiveCapability,type SafetyCapability,type SafetyPolicyV1} from './contract';
export interface SafetyPolicyReader { read():Promise<unknown> }
export interface PolicyGrant { epoch:number; capability:SafetyCapability }
export class SafetyGate {
  constructor(private readonly reader:SafetyPolicyReader){}
  /** Every protected boundary reads the authoritative policy; no client cache or silent allow. */
  async current():Promise<SafetyPolicyV1|null>{
    try{return validateSafetyPolicy(await this.reader.read());}catch{return null;}
  }
  async check(capability:SafetyCapability):Promise<PolicyGrant|null>{
    if(!ACTIVE_CAPABILITIES.some(k=>k===capability))return null;
    const policy=await this.current();
    if(!policy||policy.emergencyStop||policy.capabilities[capability]!==true)return null;
    return {epoch:policy.epoch,capability};
  }
  async require(capability:SafetyCapability):Promise<PolicyGrant>{
    const grant=await this.check(capability);
    if(!grant)throw Error(SAFETY_POLICY_BLOCKED);
    return grant;
  }
  /** Persisted job epochs become invalid after any policy change, including stop/resume. */
  async requireEpoch(capability:ActiveCapability,epoch:number):Promise<void>{
    const grant=await this.require(capability);
    if(!Number.isSafeInteger(epoch)||epoch!==grant.epoch)throw Error(SAFETY_POLICY_BLOCKED);
  }
}
export class DenyPolicyReader implements SafetyPolicyReader {
  async read():Promise<null>{return null;}
}
