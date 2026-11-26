const {test}=require('node:test');
const assert=require('node:assert/strict');
test('manual TEST service build binds repository, approved recipe and all three registry digests',async()=>{
 const {triggerFor,verifyImages}=await import('../../scripts/beta/test-service-images.mjs');
 const source='a'.repeat(40),id='12345678-abcd-abcd-abcd-0123456789ab',build='22345678-abcd-abcd-abcd-0123456789ab';
 const repo='projects/jems-jzw-nonprod/locations/us-east5/connections/jems/repositories/family-game-factory';
 function fixture(){
  const t={...triggerFor(source,repo),id};
  const b={...structuredClone(t.build),id:build,projectId:'jems-jzw-nonprod',buildTriggerId:id,status:'SUCCESS',approval:{state:'APPROVED'},
   serviceAccount:t.serviceAccount,sourceProvenance:{resolvedConnectedRepository:{repository:repo,revision:source}},
   results:{images:t.build.images.map((name,i)=>({name,digest:'sha256:'+String(i+1).repeat(64)}))}};
  const observed={remoteUri:'https://github.com/jzwyrzyk/family-game-factory.git'};
  return {t,b,observed,read(args){if(args[1]==='repositories')return observed;if(args[1]==='triggers')return t;
   if(args[0]==='builds')return b;return {image_summary:{digest:args[4].split('@')[1]}};}};
 }
 const x=fixture();assert.equal(Object.keys(verifyImages(source,id,build,x.read).images).length,3);
 for(const mutate of [
  s=>s.b.steps[0].args.push('--no-cache'),s=>s.b.sourceProvenance.resolvedConnectedRepository.revision='b'.repeat(40),
  s=>s.t.sourceToBuild.ref='refs/heads/untrusted',s=>s.t.approvalConfig.approvalRequired=false,
  s=>s.t.repositoryEventConfig={},s=>s.b.approval.state='PENDING',s=>s.b.serviceAccount+='x',
  s=>s.b.results.images.pop(),s=>s.b.results.images[2].digest='latest',s=>s.b.options.requestedVerifyOption='NOT_VERIFIED',
  s=>s.b.options.env=['DOCKER_HOST=foreign'],s=>s.observed.remoteUri='https://github.com/example/fork',
 ]){const s=fixture();mutate(s);assert.throws(()=>verifyImages(source,id,build,s.read));}
});
