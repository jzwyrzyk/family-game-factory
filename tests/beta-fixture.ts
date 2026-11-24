import {BetaAdministration} from '../server/beta/admin';
import {FamilyDirectory} from '../server/beta/store';
import {FixtureDocuments} from '../server/beta/documents';
import {newParentAuth} from '../server/trusted-devices';
import {betaNotice,participationNotice,type BetaConfig} from '../server/beta/model';
import {acknowledge,internalCookies,redeem,requirePlay} from '../server/beta/access';

export const fixtureConfig:BetaConfig={environment:'synthetic',hubOrigin:'https://workshop.example',ownerActivation:'private-family-beta-v1',
 administrator:{audience:'/projects/123/global/backendServices/456',subject:'test-owner',verifier:{salt:'a'.repeat(32),digest:'a'.repeat(64)}},
 operatorContact:'operator@example.invalid',providerEvidence:[]};
export const fixtureKey='synthetic-device-signing-key-for-test-only';
export const parent='synthetic parent passphrase',operator='synthetic operator passphrase';
export const redemption=(invitation:string,purpose='new-family')=>({invitation,purpose,passphrase:parent,notice:betaNotice,terms:participationNotice,guardianAffirmed:true});
export const acknowledgments={adult:true,supervise:true,avoidIdentifying:true,notice:betaNotice,terms:participationNotice,passphrase:parent};
export const cookieHeader=(values:string[])=>values.map(c=>c.split(';')[0]).join('; ');
export async function betaFixture(){
 const config=structuredClone(fixtureConfig);config.administrator.verifier=newParentAuth(operator);
 const d=new FamilyDirectory(new FixtureDocuments(),config),admin=new BetaAdministration(d);
 const mutate=(action:string,target:string,params:unknown={})=>admin.change('test-owner',{action,target,params,confirm:action+' '+target,passphrase:operator});
 await mutate('platform','platform',{invitations:true,participation:true,stop:false,monthlyCents:100});
 async function invite(label:string){
  const {familyId}=await mutate('create','new',{contactRef:label});const id=String(familyId);
  const {invitation}=await mutate('invite',id);return {id,invitation:String(invitation)};
 }
 async function enroll(label:string){
  const {id,invitation}=await invite(label),opened=await redeem(d,id,redemption(invitation),fixtureKey);
  const raw=cookieHeader(opened.cookies);
  await mutate('verify',id,{pairingCode:opened.pairingCode,receipt:'fixture-verification-'+label});
  const play=await acknowledge(d,id,acknowledgments,internalCookies(raw),fixtureKey);
  const cookies=raw+'; '+cookieHeader([play]);
  await requirePlay(d,id,cookies,fixtureKey,'entry');
  return {id,raw,cookies};
 }
 return {d,admin,mutate,invite,enroll};
}
