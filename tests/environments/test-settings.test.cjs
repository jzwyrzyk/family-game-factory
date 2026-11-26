const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
test('TEST settings preserve private keys across renders and bind the application, worker, named database, preview and administrator scopes',async()=>{
 require('tsx/cjs');const {initialInputs,render}=await import('tsx/esm/api').then(({tsImport})=>tsImport('../../scripts/beta/prepare-test-settings.mjs',__filename));
 const source='a'.repeat(40),worker='b'.repeat(40),project='jems-jzw-nonprod',number='1092405124984';
 const usere='https://jems-test-coach-'+number+'.us-east5.run.app';
 const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 const seed=initialInputs({githubAppId:'42',githubInstallationId:'65',githubPrivateKey:key,managementSubject:'operator',resetSubject:'synthetic-reset',
  householdSubject:'adult',operatorContact:'operator@example.invalid',managementPassphrase:'a fixture passphrase only',fixtureExpiresAt:Date.now()+3600000});
 const b={project,projectNumber:number,artifactBucket:project+'-jems-test-artifacts',database:'jems-test',hosts:{preview:'p.test.example',hub:'h.test.example',household:'a.test.example'},
  coachOrigin:usere,iapAssertionAudiences:{management:'/projects/'+number+'/global/backendServices/1',household:'/projects/'+number+'/global/backendServices/2'},
  worker:{repository:'family-game-factory-lab/family-game-factory-worker-test',repositoryId:'987654321',source:worker,callback:'https://h.test.example'}};
 const s=render(source,b,seed);assert.deepEqual(render(source,b,seed),s);
 assert.equal(s.gateway.testExecution.providerMode,'fixture');assert.equal(s.household.active,false);
 assert.equal(s.preview.householdViewer.previewKey,s.household.previewKey);assert.notEqual(s.preview.previewKey,s.household.previewKey);
 assert.equal(s.preview.githubPrivateKey,undefined);assert.equal(s.gateway.approvedSha,source);
 for(const mutate of [t=>t.gateway.active=true,t=>t.household.active=true,t=>t.gateway.sessionKey=t.household.sessionKey,
  t=>t.gateway.beta.testReset.subject=t.gateway.beta.administrator.subject,t=>t.gateway.beta.providerEvidence=[{}],
  t=>t.gateway.githubPrivateKey='invalid',t=>t.fixtureExpiresAt=0]){
  const t=structuredClone(seed);mutate(t);assert.throws(()=>render(source,b,t));
 }
 for(const mutate of [t=>t.database='(default)',t=>t.worker.repositoryId='1458899834',t=>t.hosts.household=t.hosts.hub]){
  const t=structuredClone(b);mutate(t);assert.throws(()=>render(source,t,seed));
 }
});
