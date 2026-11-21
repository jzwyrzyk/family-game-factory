import {adultPilotAllowed} from '../adult-pilot';
import {requireFamily,type VerifiedSession} from '../contracts/api';
import {assertActiveTrustedDevice} from '../trusted-devices';
import type {PipelineState} from './types';

/** Temporary adult work stays separate from the family workspace. A local
 * profile name is never authorization to retrieve or remix an adult artifact. */
export function requireResourceAudience(
 state:PipelineState,
 session:VerifiedSession,
 resource:{id:string;familyId:string;adultPilotProfileId?:string;adultPilotDeviceId?:string}
):void {
 requireFamily(session,resource);
 assertActiveTrustedDevice(state,session);
 const audience=resource.adultPilotProfileId||
  (resource.adultPilotDeviceId?`adult:${resource.adultPilotDeviceId}`:undefined);
 if(audience!==session.adultProfileId)throw Error('FORBIDDEN');
 const adultTagged=audience!==undefined||session.adultSessionId!==undefined||session.adultProfileId!==undefined;
 if(adultTagged&&(session.devTestGrantId!==undefined||!adultPilotAllowed(state,session)))throw Error('FORBIDDEN');
}
