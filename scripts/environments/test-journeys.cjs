const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {client,seed,protectedBrowser,householdJourneys,submit,play,valid,sha}=require('./test-browser.cjs');
const conversation={message:'How do I play Moon Hopper?',mode:'discuss',game:'Moon Hopper',plan:{},friction:'',helpLevel:0,support:'balanced',conversation:[],observations:[],tests:[]};
const canon=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0)));
const receiptSha=x=>sha(JSON.stringify(x));
async function sessions(ctx,origin,secret,headers={},adult=false) {
  await ctx.addCookies(seed(origin,secret));
  const api=client(ctx,origin,headers);
  const status=await api('/v1/sessions/status');
  assert.equal(status.trusted,true);assert(status.expiresAt>Date.now()+45*60000,'FRESH_SYNTHETIC_SESSION_REQUIRED');
  if(adult){
    const unlocked=await api('/v1/sessions/adult/unlock',{parentPassphrase:secret.passphrase});
    assert(unlocked.active&&unlocked.expiresAt>Date.now()&&unlocked.sessionToken);
    return {api:client(ctx,origin,{...headers,'x-factory-adult-session':unlocked.sessionToken}),profile:unlocked.profileId};
  }
  await api('/v1/devices/unlock',{parentPassphrase:secret.passphrase});
  const enter=async()=>{
    const entry=await api('/entry/status');
    assert(entry.family&&entry.connected&&entry.status==='active'&&!entry.needsNoticeRenewal&&!entry.needsProfile);
    await api('/entry/acknowledge',{adult:true,supervise:true,avoidIdentifying:true,notice:entry.notice,terms:entry.terms,passphrase:secret.passphrase});
  };
  await enter();
  return {api,enter};
}
async function fixture(browser,target,bound,token,credentials) {
  const household='https://'+target.household,hub='https://'+target.hub,family='https://f-'+target.familyId+'.'+target.hub, preview='https://'+target.preview;
  const journeys=await householdJourneys(browser,target,token);
  const ctx=await browser.newContext();await protectedBrowser(ctx,target,token);
  try{
    // Verify the enrolled synthetic adult can enter and lock its TEST-only workspace.
    const adult=await sessions(ctx,household,credentials.household,{authorization:'Bearer '+token},true);
    assert((await adult.api('/v1/sessions/status')).adultPilot.active);
    await adult.api('/v1/sessions/adult/lock',{});
    assert.equal((await adult.api('/v1/sessions/status')).adultPilot.active,false);journeys['adult-workspace']='success';
    // The nonproduction UAT account can pass the management IAP edge only for the separate scoped reset action.
    await client(ctx,hub,{authorization:'Bearer '+token})('/manage/state',undefined,403);
    const {api,enter}=await sessions(ctx,family,credentials.family,{'x-jems-learner':target.profile});
    const page=await ctx.newPage();await page.goto(family+'/play/');assert.equal(new URL(page.url()).origin,family);
    const current=await api('/v1/test-fixture/status');
    assert.equal(current.providerMode,'fixture');assert.equal(current.paidExecution,false);assert.equal(current.publicSourceSha,target.source);
    assert.equal(current.workerSha,bound.testWorker.sourceSha);assert.equal(current.workerRepositoryId,target.workerRepositoryId);
    assert.equal(current.service,'jems-test-gateway');assert(current.expiresAt>Date.now());
    const coaching=await api('/v1/coach/status');assert.equal(coaching.mode,'fixture');
    const reply=await api('/v1/coach',{requestId:randomUUID(),context:conversation});
    assert.equal(reply.mode,'fixture');assert.equal(reply.reply.text,'Tap Action three times to reach the moon gate.');journeys['conversation-coaching']='success';
    const records=[],runs=[];
    for (const [prompt,n] of [['Build Moon Hopper',3],['Change Moon Hopper to four hops',4]]) {
      const job=await submit(api,records.length?'generated-module':'new',records.at(-1)?.revisionId||null,prompt,randomUUID());
      const evidence=await api('/v1/test-fixture/jobs/'+job.jobId);
      assert.equal(evidence.jobId,job.jobId);assert.equal(evidence.revisionId,job.revisionId);assert.equal(evidence.workerSha,current.workerSha);
      assert.equal(evidence.workerRepositoryId,current.workerRepositoryId);assert.equal(evidence.runAttempt,1);
      assert(/^[1-9][0-9]*$/.test(String(evidence.runId)));runs.push(evidence);
      const game=await api('/v1/revisions/'+job.revisionId+'/preview');valid(game.projectId);
      if(records.length)assert.equal(game.projectId,records[0].projectId);
      await play(page,game,preview,n,'/family-preview');
      assert.equal((await api('/v1/revisions/'+job.revisionId+'/keep',{})).revisionId,job.revisionId);
      records.push({revisionId:job.revisionId,projectId:game.projectId});
    }
    journeys['ai-generation-modification']='success';
    const projectId=records[0].projectId,revisionId=records[1].revisionId;
    const presence=async()=> (await api('/v1/creations')).some(r=>r.projectId===projectId&&r.id===revisionId);
    assert(await presence());
    await api('/v1/devices/unlock',{parentPassphrase:credentials.family.passphrase});
    const recover=(op,fields)=>api('/v1/recovery/generated/'+op,{profile:target.profile,...fields});
    const capture=await recover('capture',{requestId:randomUUID()});
    assert(/^[a-f0-9]{64}$/.test(capture.sourceHash)&&/^[a-f0-9]{64}$/.test(capture.checksum));
    const {pointId,checksum}=capture,backup=await recover('preview',{pointId});
    assert.equal(backup.checksum,checksum);assert(backup.games.some(g=>g.id===projectId));
    let reset,restore;
    const restoration={pointId,checksum,approved:true,attemptId:randomUUID()};
    try {
      reset=await client(ctx,hub,{authorization:'Bearer '+token})('/manage/test-reset',{familyId:target.familyId,profile:target.profile,projectId,
        expectedRevisions:records.map(r=>r.revisionId),pointId,checksum,requestId:randomUUID()});
      assert.equal(reset.projectId,projectId);assert.equal(reset.checksum,checksum);assert.equal(reset.removed,2);assert.equal(await presence(),false);
    } finally {
      // Even an ambiguous reset HTTP response may follow a committed transaction.
      // The recovery operation is additive, guarded by the previously read checksum and attempt ID.
      restore=await recover('restore',restoration);
    }
    assert.equal(restore.added,2);assert.equal(restore.opened,1);assert.equal(restore.checksum,checksum);assert(await presence());
    await enter();await page.goto(family+'/play/');assert.equal(page.url(),family+'/play/');await play(page,await api('/v1/revisions/'+revisionId+'/preview'),preview,4,'/family-preview');journeys['saving-recovery']='success';
    return {journeys,workerRuns:runs,recovery:{captureSha256:receiptSha(capture),resetSha256:receiptSha(reset),restoreSha256:receiptSha(restore),replayedRevisionSha256:sha(revisionId)},providerMode:'fixture'};
  }finally{await ctx.close();}
}
async function live(browser,target,bound,token,credentials,authorization) {
  const origin='https://'+target.household,ctx=await browser.newContext();
  try{
    assert(authorization.sourceSha===target.source&&authorization.workerSha===bound.testWorker.sourceSha&&
      Number.isSafeInteger(authorization.limitMicrousd)&&authorization.limitMicrousd>0&&authorization.limitMicrousd<=5000000&&
      Date.parse(authorization.startsAt)<=Date.now()&&Date.now()<Date.parse(authorization.expiresAt));
    const authorizationSha256=sha(canon(authorization));
    await protectedBrowser(ctx,target,token);
    const {api,profile}=await sessions(ctx,origin,credentials.liveHousehold,{authorization:'Bearer '+token,'x-jems-trial-authorization':authorizationSha256},true);
    assert.equal(profile,authorization.adultProfileId);
    const pre=await api('/v1/test-trial/preflight',{});
    assert.equal(pre.authorizationSha256,authorizationSha256);assert.equal(pre.sourceSha,target.source);assert.equal(pre.workerSha,authorization.workerSha);
    assert(pre.allowanceMicrousd<=authorization.limitMicrousd&&pre.usedMicrousd===0&&pre.reservedMicrousd===0,'FRESH_FUNDED_ALLOWANCE_REQUIRED');
    const page=await ctx.newPage();await page.goto(origin+'/');assert.equal(new URL(page.url()).origin,origin);
    const [buildId,editId,coachId]=['build','edit','coach'].map(stage=>{
      // Stable authorization-bound request IDs make interrupted/repeated dispatches idempotent.
      const h=createHash('sha256').update(stage+authorizationSha256).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
    });
    const jobs=[];
    for(const [n,id] of [[3,buildId],[4,editId]]){
      const prompt='Make Moon Hopper a game with a visible Action control. Each distinct press adds exactly one point. Win at '+n+' points. Show the score, support replay, and use only native shapes. No images or network.';
      const job=await submit(api,jobs.length?'generated-module':'new',jobs.at(-1)?.revisionId||null,prompt,id);jobs.push(job);
      await play(page,await api('/v1/revisions/'+job.revisionId+'/preview'),'https://'+target.preview,n,'/household-preview');
      assert.equal((await api('/v1/revisions/'+job.revisionId+'/keep',{})).revisionId,job.revisionId);
    }
    const reply=await api('/v1/coach',{requestId:coachId,context:conversation});assert.equal(reply.mode,'model');assert(reply.reply.text.trim());
    const proof=await api('/v1/test-trial/settlement',{build:jobs[0].jobId,edit:jobs[1].jobId,coach:coachId});
    assert.deepEqual(proof.revisionIds,jobs.map(j=>j.revisionId));assert.equal(proof.authorizationSha256,authorizationSha256);
    assert.equal(proof.limitMicrousd,authorization.limitMicrousd);assert(proof.spendMicrousd>0&&proof.spendMicrousd<=proof.limitMicrousd);
    assert(Number.isSafeInteger(proof.repairAttempts)&&proof.repairAttempts>0,'PREMIUM_REPAIR_UNOBSERVED');
    return {providerMode:'live',journeys:{'ai-generation-modification':'success','conversation-coaching':'success'},authorizationSha256,limitMicrousd:proof.limitMicrousd,spendMicrousd:proof.spendMicrousd,settlementSha256:receiptSha(proof),repairAttempts:proof.repairAttempts};
  }finally{await ctx.close();}
}
module.exports={fixture,live};
