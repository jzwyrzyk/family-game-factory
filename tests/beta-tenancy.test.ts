import test from 'node:test';
import assert from 'node:assert/strict';
import {FamilyDirectory} from '../server/beta/store';
import {FixtureDocuments} from '../server/beta/documents';
import {closedPolicy,createFamily,platformMode,validateBeta} from '../server/beta/model';

import {fixtureConfig} from './beta-fixture';
test('two invited workspaces and unmapped household retain independent records',async()=>{
 const db=new FixtureDocuments(),d=new FamilyDirectory(db,fixtureConfig);
 const a=createFamily('adult-a'),b=createFamily('adult-b');
 await db.run(async tx=>{for(const f of [a,b])tx.create(d.path(f.id),f);tx.set('factoryWorkspaces/owner/state/current',{household:true});});
 const revision={id:'same-id',familyId:a.id,parentId:null,game:null,projectId:'project'};
 await d.repository(a.id).transaction(s=>{s.revisions.push(revision);return true;});
 assert.deepEqual((await d.repository(b.id).snapshot()).revisions,[]);
 assert.deepEqual((await d.repository(a.id).snapshot()).revisions,[revision]);
 assert.deepEqual(await db.run(tx=>tx.get('factoryWorkspaces/owner/state/current')),{household:true});
 await db.run(async tx=>tx.set(d.path(b.id),{...b,workspace:a.workspace}));
 await assert.rejects(d.repository(b.id).snapshot(),/MAPPING/);
});
test('mode and provider evidence fail closed',()=>{
 for(const bad of [null,'','public','PUBLIC',true])assert.throws(()=>platformMode(bad));
 assert.equal(platformMode(undefined),'HOUSEHOLD');
 assert.equal(platformMode('PRIVATE_FAMILY_BETA'),'PRIVATE_FAMILY_BETA');
 assert.throws(()=>validateBeta({...fixtureConfig,providerEvidence:[{} as never]},'owner'));
 assert.throws(()=>validateBeta(fixtureConfig,'beta-household'));
 assert.equal(closedPolicy().stop,true);
});
