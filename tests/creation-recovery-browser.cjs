/* Production-dist backup journeys. Scenes and checks use public UI; raw-storage fixtures
 * deliberately simulate corruption and one quota failure. No live provider is configured. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const CREATION_KEY='family-game-factory-creation-v1';
const STATE_KEYS=['family-game-factory-state-v1','family-game-factory-workspace-v2','family-game-factory-studio-v1',CREATION_KEY];
const clone=value=>JSON.parse(JSON.stringify(value));

(async()=>{
  const server=start();if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
    .catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
  const context=await browser.newContext({viewport:{width:1360,height:1000},reducedMotion:'reduce',acceptDownloads:true});
  const page=await context.newPage(),errors=[],paidRequests=[],checks=[],dialogs=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});return dialog.accept();});
  await context.addInitScript(()=>{
    window.recoveryRewardToasts=[];
    new MutationObserver(records=>{for(const record of records)for(const added of record.addedNodes){
      if(!(added instanceof Element))continue;
      if(added.matches('.jems-rewards-toast'))window.recoveryRewardToasts.push(added.textContent);
      for(const toast of added.querySelectorAll('.jems-rewards-toast'))window.recoveryRewardToasts.push(toast.textContent);
    }}).observe(document,{childList:true,subtree:true});
  });
  page.on('request',request=>{if(request.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url()))paidRequests.push(request.url());});
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
  fs.mkdirSync('test-results',{recursive:true});
  const ready=()=>page.waitForFunction(()=>window.FG?.creation&&window.FG?.studio&&document.getElementById('creationParentProgress'));
  const pacing=()=>page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];if(!FG.store.save())throw Error('Pacing fixture did not save');});
  const parent=async()=>{await page.locator('footer [data-page="parent"]').click();await page.locator('#page-parent:not(.hidden)').waitFor();};
  const switchProfile=async index=>{if(!await page.locator('#studioProfileMenu').evaluate(element=>element.open))await page.locator('#studioProfileMenu summary').click();await page.locator('.profile-choice').nth(index).click();};
  const reopenUnfinished=async id=>{await page.locator('#studioNavHome').click();await switchProfile(1);await switchProfile(0);await page.locator('#studioNavScenes').click();await page.locator(`[data-scene="${id}"]`).click();};
  const raw=()=>page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),STATE_KEYS);
  const ledger=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const opened=indexedDB.open('family-game-factory-rewards-v1',1);opened.onerror=()=>reject(opened.error);
    opened.onsuccess=()=>{const database=opened.result,transaction=database.transaction('workspaces','readonly'),request=transaction.objectStore('workspaces').get('family-game-factory-rewards-v1');let value=null;
      request.onsuccess=()=>{value=request.result??null;};transaction.oncomplete=()=>{database.close();resolve(value);};transaction.onerror=transaction.onabort=()=>{database.close();reject(transaction.error);};};
  }));
  const upload=backup=>page.locator('#importData').setInputFiles({name:'scene-backup-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  const rejected=async(backup,pattern)=>{
    await upload(backup);await page.waitForFunction(()=>document.getElementById('importData').files.length===0);
    assert.match(await page.locator('#studioGlobalStatus').textContent(),pattern);
  };
  const restore=async backup=>{
    const prior=await page.evaluate(()=>performance.timeOrigin);await upload(backup);
    await page.waitForFunction(value=>performance.timeOrigin!==value&&window.FG?.creation,prior);await ready();
  };
  const exported=async name=>{
    const pending=page.waitForEvent('download');await page.locator('#exportData').click();const download=await pending;
    const path='test-results/'+name;await download.saveAs(path);return JSON.parse(fs.readFileSync(path,'utf8'));
  };
  const corrupt=async value=>{
    await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:CREATION_KEY,value});
    await page.reload();await ready();await parent();
  };
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?creation=1`);await ready();await pacing();
    // Include actual Studio notebook/workspace state so rollback covers all four keys.
    await page.locator('#creationHome').click();await page.locator('[data-starter="dragon"]').click();
    await page.locator('#studioNavScenes').click();await page.locator('#creationChallengeMode').click();
    await page.locator('[data-challenge="robot-route"]').click();
    await page.locator('#creationTitle').fill('My backup robot experiment');await page.locator('#creationTitle').press('Tab');
    await page.locator('#creationHint').click();await page.locator('#creationCheck').click();
    await page.waitForFunction(()=>FG.creation.export().attempts.length===1);
    await page.locator('#creationKeep').click();const projectId=await page.evaluate(()=>FG.creation.scene().id);
    await parent();assert.match(await page.locator('#creationParentProgress').textContent(),/My backup robot experiment/);
    assert.match(await page.locator('#creationParentProgress').textContent(),/hint was opened/i);
    const backup=await exported('creation-family-backup.json');
    assert.ok(backup.factoryWorkspace.projects.length&&backup.factoryStudio.sessions.length);
    assert.equal(backup.factoryCreation.projects[0].hintUsed,true);assert.equal(backup.factoryCreation.attempts[0].hintUsed,true);
    assert.equal(backup.factoryCreation.projects[0].keptId,backup.factoryCreation.projects[0].headId);
    checks.push('actual parent export includes scenes, immutable versions, Keep, source state and supported checks');

    const unchanged=await raw();
    for(const bad of [null,false,{schema:'jems.creation.workspace.v999'}]){
      await rejected({...backup,factoryCreation:bad},/unsupported|damaged/i);assert.deepEqual(await raw(),unchanged);
    }
    const unsafe=clone(backup);unsafe.factoryCreation.revisions[0].scene.actors[0].assetId='untrusted-art-url';
    await rejected(unsafe,/artwork/i);assert.deepEqual(await raw(),unchanged);
    checks.push('provided null, false, unsupported schema and unknown artwork are rejected before any family write');

    const damaged='{scene-history: deliberately truncated fixture';
    await corrupt(damaged);
    const recovery=await exported('creation-corrupt-recovery.json');
    assert.equal(recovery.factoryCreationRecoveryRaw,damaged);assert.equal(Object.hasOwn(recovery,'factoryCreation'),false);
    const preserved=await raw();await rejected(recovery,/preserves damaged scene data/i);assert.deepEqual(await raw(),preserved);
    checks.push('corrupt scene bytes remain exportable and a recovery-only file cannot overwrite valid family data');

    const replacement=clone(backup);
    replacement.profiles[0].name='Replacement fixture';replacement.factoryWorkspace.projects[0].name='Incoming game';
    replacement.factoryStudio.sessions[0].name='Incoming notebook';
    const incoming=replacement.factoryCreation.projects[0];incoming.title='Incoming scene';
    replacement.factoryCreation.revisions.find(revision=>revision.id===incoming.headId).scene.title=incoming.title;
    // The coordinated transaction rolls back the exact saved source bytes and
    // ledger, then reloads so no cached store can overwrite the recovered state.
    const priorFamily=await page.evaluate(()=>structuredClone(FG.store.data)),priorLedger=await ledger(),dialogStart=dialogs.length;
    let quotaFailures=0;await page.exposeFunction('__recordCreationQuotaFailure',()=>{quotaFailures++;});
    await page.evaluate(key=>{
      const original=Storage.prototype.setItem;window.__quotaFixture={original,failures:0};
      Storage.prototype.setItem=function(name,value){
        if(this===localStorage&&name===key&&window.__quotaFixture.failures===0){window.__quotaFixture.failures++;void window.__recordCreationQuotaFailure();throw new DOMException('Synthetic quota failure','QuotaExceededError');}
        return original.call(this,name,value);
      };
    },CREATION_KEY);
    const reloaded=page.waitForNavigation({waitUntil:'load'});await upload(replacement);await reloaded;await ready();
    assert.equal(quotaFailures,1,'The actual creation persistence failure was observed before the document reloaded');
    assert.ok(dialogs.slice(dialogStart).some(dialog=>dialog.type==='alert'&&/Could not save this creation/i.test(dialog.message)),'The rollback outcome is shown before automatic recovery reload');
    assert.equal(dialogs.slice(dialogStart).some(dialog=>/restored successfully/i.test(dialog.message)),false,'A failed replacement never claims success');
    const rolledBack=await raw();assert.equal(rolledBack[CREATION_KEY],damaged,'Rollback preserves the exact original corrupt bytes');
    assert.deepEqual(rolledBack,preserved,'Rollback preserves every source string, including the family learning state');
    assert.deepEqual(await ledger(),priorLedger,'Rollback preserves the exact prior reward ledger');
    assert.deepEqual(await page.evaluate(()=>window.recoveryRewardToasts),[],'Recovery cannot replay earned rewards');
    assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-reward-backup-journal-v1')),null,'The new document clears the completed rollback marker');
    await parent();
    assert.deepEqual(await page.evaluate(()=>FG.store.data),priorFamily,'Rollback restores the current family and learning state');
    checks.push('a creation quota failure rolls back exact family, game, notebook, corrupt scene bytes and reward ledger, then reloads without success or reward replay');

    await restore(backup);
    assert.deepEqual(await page.evaluate(()=>FG.creation.export()),backup.factoryCreation);
    assert.equal(await page.evaluate(()=>Object.hasOwn(FG.store.data,'factoryCreation')||Object.hasOwn(FG.store.data,'factoryCreationRecoveryRaw')),false);
    await pacing();await page.locator(`[data-scene="${projectId}"]`).click();
    assert.equal(await page.locator('#creationHint').textContent(),'See my hint again');
    await page.locator('#creationCheck').click();await page.waitForFunction(()=>FG.creation.export().attempts.length===2);
    assert.ok((await page.evaluate(()=>FG.creation.export().attempts)).every(attempt=>attempt.hintUsed));
    await parent();assert.equal(await page.locator('#creationParentProgress li').count(),2);
    assert.match(await page.locator('#creationParentProgress').textContent(),/specific scene goal/i);
    checks.push('a valid parent backup repairs corrupt current storage and retains hint history across reload and later checks');

    const legacy=clone(backup);delete legacy.factoryCreation;delete legacy.factoryWorkspace;delete legacy.factoryStudio;
    await restore(legacy);const empty=await page.evaluate(()=>FG.creation.export());
    assert.deepEqual(empty,{schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]});
    await parent();assert.equal(await page.locator('#creationParentProgress li').count(),0);
    assert.doesNotMatch(await page.locator('#creationParentProgress').textContent(),/My backup robot experiment/);
    checks.push('legacy family replacement without creation data clears old scenes and observations');

    const retired=clone(backup);retired.factoryCreation.projects[0].challengeId='retired-goal';
    retired.factoryCreation.attempts.forEach(attempt=>attempt.challengeId='retired-goal');
    await restore(retired);await page.locator(`[data-scene="${projectId}"]`).click();
    assert.equal(await page.locator('#creationChallengeBrief').isVisible(),false);
    assert.equal(await page.locator('#creationTitle').inputValue(),'My backup robot experiment');
    assert.equal(await page.evaluate(()=>FG.creation.export().projects[0].challengeId),'retired-goal');
    checks.push('a retired challenge reopens its preserved scene for free editing without fabricating a goal');

    // Global navigation can retain a recovery draft without creating a revision.
    // Reopening that draft must require the explicit Resume / Use saved decision.
    await page.locator('#creationBack').click();await page.locator('#creationChallengeMode').click();
    await page.locator('[data-challenge="robot-route"]').click();await page.locator('[data-add-block="say"]').click();
    const unfinishedId=await page.evaluate(()=>FG.creation.scene().id);await reopenUnfinished(unfinishedId);
    assert.equal(await page.locator('#creationRecovery').isVisible(),true);
    const untouched=await page.evaluate(()=>FG.creation.export());
    assert.deepEqual(untouched.drafts.find(draft=>draft.projectId===unfinishedId).scene.programs[0].actions.map(action=>action.type),['say']);
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().programs[0].actions),[]);
    for(const selector of ['[data-add-block="move"]','#creationKeep','#creationCheck','#creationRun','#creationStep','#creationReset','#creationAddActor']){
      await page.locator(selector).click();assert.match(await page.locator('#creationStatus').textContent(),/Resume my draft.*Use saved version/);
      assert.deepEqual(await page.evaluate(()=>FG.creation.export()),untouched,'Unresolved recovery survives '+selector);
      assert.equal(await page.evaluate(()=>FG.learning.active),false);assert.equal(await page.evaluate(()=>FG.creation.snapshot().status),'idle');
    }
    assert.equal(await page.locator('#creationUndo').isDisabled(),true);assert.equal(await page.locator('#creationRedo').isDisabled(),true);
    await page.locator('#creationMore summary').click();
    for(const selector of ['#creationCopy','#creationHistory']){await page.locator(selector).click();assert.deepEqual(await page.evaluate(()=>FG.creation.export()),untouched);}
    await page.locator('#creationMore summary').click();
    await page.locator('#creationResumeDraft').click();
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().programs[0].actions.map(action=>action.type)),['say']);
    await page.locator('[data-add-block="move"]').click();await page.locator('#creationKeep').click();
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().programs[0].actions.map(action=>action.type)),['say','move']);
    await page.locator('[data-add-block="wait"]').click();await reopenUnfinished(unfinishedId);
    assert.equal(await page.locator('#creationRecovery').isVisible(),true);await page.locator('#creationDiscardDraft').click();
    assert.equal(await page.evaluate(id=>FG.creation.export().drafts.some(draft=>draft.projectId===id),unfinishedId),false);
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().programs[0].actions.map(action=>action.type)),['say','move']);
    await page.locator('[data-add-block="jump"]').click();
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene().programs[0].actions.map(action=>action.type)),['say','move','jump']);
    checks.push('unresolved recovery blocks edits, Keep, checks, playback, copy and history until explicit Resume or Use saved; both choices preserve their selected content');
    assert.deepEqual(errors,[],'No unhandled browser errors');assert.deepEqual(paidRequests,[],'No generation or coach provider requests');
    fs.writeFileSync('test-results/creation-recovery-browser-results.json',JSON.stringify({passed:checks.length,checks,errors,paidRequests},null,2)+'\n');
    console.log('PASS creation backup recovery browser: '+checks.length+' journeys; corrupt export, invalid input, atomic rollback, valid recovery, hint retention, legacy replacement, retired goals and explicit draft recovery');
  }catch(error){
    await page.screenshot({path:'test-results/creation-recovery-failure.png',fullPage:true}).catch(()=>{});
    throw error;
  }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
