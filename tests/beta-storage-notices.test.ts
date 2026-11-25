import test from 'node:test';
import assert from 'node:assert/strict';
import {syncFixture} from './storage-sync-fixture';
import {storageConsent,continuityRequest} from '../server/beta/continuity';
import {renewParticipation,internalCookies,acknowledge,requirePlay} from '../server/beta/access';
import {betaNotice,participationNotice} from '../server/beta/model';
import {acknowledgments,cookieHeader,fixtureKey} from './beta-fixture';

test('notice renewal clears effective copy selections without erasing history or implicitly renewing cloud scopes',async()=>{
 const x=await syncFixture();await x.activate();
 const original=await storageConsent(x.d,x.a.id,x.cookies,fixtureKey);assert.ok(original.selected);
 await x.d.withFamily(x.a.id,async(tx,f)=>{f.guardian.noticeVersion='old-notice';f.guardian.participationVersion='old-terms';tx.set(x.d.path(f.id),f);});
 await renewParticipation(x.d,x.a.id,{adult:true,notice:betaNotice,terms:participationNotice,passphrase:acknowledgments.passphrase},internalCookies(x.cookies),fixtureKey);
 const after=await storageConsent(x.d,x.a.id,x.cookies,fixtureKey);assert.equal(after.selected,null);assert.equal(after.reviewRequired,true);
 const saved=await x.d.db.run(tx=>tx.get(x.d.path(x.a.id)+'/continuity/authorization'));assert.deepEqual(saved,original.selected,'History remains available in the approved export.');
 const play=await acknowledge(x.d,x.a.id,acknowledgments,internalCookies(x.cookies),fixtureKey),raw=x.cookies.split('; ').filter(pair=>!pair.startsWith('__Host-jems-play=')).join('; ')+'; '+cookieHeader([play]);await requirePlay(x.d,x.a.id,raw,fixtureKey,'entry');
 const status=()=>continuityRequest(x.d,x.a.id,raw,fixtureKey,'/v1/storage/status',{profile:x.profile});
 await assert.rejects(status(),/STORAGE_CONSENT_REQUIRED/);
 await storageConsent(x.d,x.a.id,x.cookies,fixtureKey,{notice:x.d.config.continuity!.notice,profiles:[x.profile],domains:['games','artwork','conversation'],acknowledged:true});
 assert.equal((await storageConsent(x.d,x.a.id,x.cookies,fixtureKey)).reviewRequired,false);assert.ok(await status());
});

test('guardian UI does not advertise stale privacy, participation or guardian bindings as selected',async()=>{
 const x=await syncFixture();await x.activate();const path=x.d.path(x.a.id)+'/continuity/authorization',original=await x.d.db.run(tx=>tx.get<any>(path));
 for(const patch of [{notice:'old-copy-notice'},{guardianNotice:'old-privacy'},{participation:'old-participation'},{renewedAt:-1},{guardian:'previous-guardian'}]){
  await x.d.db.run(async tx=>tx.set(path,{...original,...patch}));const view=await storageConsent(x.d,x.a.id,x.cookies,fixtureKey);assert.equal(view.selected,null);assert.equal(view.reviewRequired,true);
 }
 delete x.d.config.continuity;const disabled=await storageConsent(x.d,x.a.id,x.cookies,fixtureKey);assert.equal(disabled.enabled,false);assert.equal(disabled.selected,null);assert.equal(disabled.withdrawable,true,'Disabling deployment configuration must not hide withdrawal.');
 await x.d.db.run(async tx=>tx.set(path,{...original,revokedAt:Date.now()}));const withdrawn=await storageConsent(x.d,x.a.id,x.cookies,fixtureKey);assert.equal(withdrawn.selected,null);assert.equal(withdrawn.reviewRequired,false);
});
