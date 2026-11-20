/* Real production-dist journeys. All program edits use the public UI; FG.creation is read-only inspection. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');

(async()=>{
  const server=start();
  if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    headless:true,args:['--no-sandbox'],
  }).catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
  fs.mkdirSync('test-results',{recursive:true});
  const results=[];
  try {
    for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['tablet',{width:820,height:1180}]]) {
      if(process.env.CREATION_TEST_DEVICE&&process.env.CREATION_TEST_DEVICE!==device)continue;
      const touch=device==='tablet';
      const context=await browser.newContext({viewport,hasTouch:touch,reducedMotion:'reduce',acceptDownloads:true});
      const page=await context.newPage();
      const errors=[],paidRequests=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      page.on('request',request=>{
        if(request.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url()))paidRequests.push(request.url());
      });
      await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
      const activate=async target=>{
        const locator=typeof target==='string'?page.locator(target):target;
        if(touch)await locator.tap();else await locator.click();
      };
      const set=async(locator,value)=>{await locator.fill(String(value));await locator.press('Tab');};
      const scene=()=>page.evaluate(()=>FG.creation.scene());
      const snapshot=()=>page.evaluate(()=>FG.creation.snapshot());
      const workspace=()=>page.evaluate(()=>FG.creation.export());
      const block=id=>page.locator(`[data-block-id="${id}"]`);
      const add=type=>activate(`[data-add-block="${type}"]`);
      const pacing=()=>page.evaluate(()=>{
        // Fixture only: isolate editor/history tests from the ordinary learning budget.
        // A separate journey below exercises the actual mandatory checkpoint.
        FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];
        if(!FG.store.save())throw Error('Could not save the test pacing fixture');
      });
      const more=async()=>{if(!await page.locator('#creationMore').evaluate(element=>element.open))await activate('#creationMore summary');};
      const profiles=async()=>{
        if(!await page.locator('#studioProfileMenu').evaluate(element=>element.open))await activate('#studioProfileMenu summary');
        const bounds=await page.locator('.profile-choice').evaluateAll(elements=>elements.map(element=>{
          const box=element.getBoundingClientRect();return {name:element.textContent,left:box.left,right:box.right,viewport:innerWidth};
        }));
        assert.ok(bounds.every(box=>box.left>=0&&box.right<=box.viewport),`Profile choices must remain inside the viewport: ${JSON.stringify(bounds)}`);
      };
      const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${device}: no document-wide horizontal overflow`);
      const chooseChallenge=async id=>{
        await activate('#creationBack');await activate('#creationChallengeMode');await activate(`[data-challenge="${id}"]`);
      };
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?creation=1`);
        await page.waitForFunction(()=>window.FG?.creation&&window.FG?.studio);
        await pacing();
        assert.equal(await page.locator('#page-creation').isVisible(),true);
        assert.equal(await page.locator('[data-creation-starter]').count(),4);
        await noOverflow();
        await page.screenshot({path:`test-results/creation-shelf-${device}.png`,fullPage:true});

        // Files open directly from the shelf, without creating a throwaway scene.
        const fileScene={schema:'jems.creation.v1',id:'file-fixture-'+device,title:'Imported scene '+device,width:800,height:450,background:'meadow',
          actors:[{id:'gem',name:'File gem',assetId:'gem',x:400,y:225,size:90}],programs:[{id:'gem-start',actorId:'gem',trigger:{type:'start'},actions:[]}],variables:{}};
        const importFromShelf=async value=>{
          const choosing=page.waitForEvent('filechooser');await activate('#creationShelfImport');
          await (await choosing).setFiles({name:'my-scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
          await page.waitForFunction(()=>document.getElementById('creationImport').value==='');
        };
        assert.equal((await workspace()).projects.length,0);
        await importFromShelf(fileScene);
        const importedScene=await scene();
        assert.equal((await workspace()).projects.length,1,'Shelf import creates exactly the imported project');
        assert.notEqual(importedScene.id,fileScene.id,'Import assigns a new project identity');
        assert.equal(importedScene.title,fileScene.title);
        assert.equal(importedScene.provenance.createdBy,'assisted');
        await activate('#creationBack');
        const beforeInvalidImport=await workspace();
        await importFromShelf({...fileScene,actors:[{...fileScene.actors[0],assetId:'unavailable-character'}]});
        assert.deepEqual(await workspace(),beforeInvalidImport,'Rejected shelf imports preserve existing scenes');
        assert.match(await page.locator('#creationStatus').textContent(),/artwork that is not available/);

        // A challenge resumes the latest own scene; starting another is explicit.
        await activate('#creationChallengeMode');await activate('[data-challenge="robot-route"]');
        const firstChallenge=await scene();await add('say');await activate('#creationKeep');
        await activate('#creationBack');
        assert.equal(await page.locator(`[data-scene="${firstChallenge.id}"]`).isVisible(),true);
        await activate('#creationChallengeMode');
        assert.equal(await page.locator(`[data-scene="${firstChallenge.id}"]`).isVisible(),true,'Saved challenges remain visible on the challenge tab');
        assert.equal(await page.locator(`[data-scene="${importedScene.id}"]`).isVisible(),true,'Free scenes remain visible on the challenge tab');
        assert.match(await page.locator('[data-challenge="robot-route"]').textContent(),/Continue my scene/);
        const beforeResume=(await workspace()).projects.length;
        await activate('[data-challenge="robot-route"]');
        assert.equal((await scene()).id,firstChallenge.id);
        assert.deepEqual((await scene()).programs[0].actions.map(action=>action.type),['say']);
        assert.equal((await workspace()).projects.length,beforeResume,'Resuming creates no duplicate challenge');
        await activate('#creationBack');await activate('#creationChallengeMode');
        await activate('[data-challenge-new="robot-route"]');
        const nextChallenge=await scene();assert.notEqual(nextChallenge.id,firstChallenge.id);
        assert.equal((await workspace()).projects.length,beforeResume+1,'Start new adds one separate attempt');
        await activate('#creationBack');await activate('#creationChallengeMode');
        await activate('[data-challenge="robot-route"]');assert.equal((await scene()).id,nextChallenge.id,'The newer scene is the default continuation');
        assert.equal((await workspace()).projects.length,beforeResume+1);
        await activate('#creationBack');await activate(`[data-scene="${firstChallenge.id}"]`);
        await pacing();await activate('#creationCheck');
        await activate('#creationBack');await activate('#creationChallengeMode');await activate('[data-challenge="robot-route"]');
        assert.equal((await scene()).id,firstChallenge.id,'A newly checked earlier scene becomes the latest continuation');
        assert.equal((await workspace()).projects.length,beforeResume+1);
        await activate('#creationHome');await profiles();await activate(page.locator('.profile-choice').nth(1));
        await activate('#studioNavScenes');await activate('#creationChallengeMode');
        assert.equal(await page.locator('#creationSaved [data-scene]').count(),0);
        assert.equal(await page.locator('[data-challenge-new]').count(),0);
        assert.doesNotMatch(await page.locator('#creationChallenges').textContent(),/Continue my scene/,'A sibling has no continuation into another owner’s scenes');
        await activate('#creationHome');await profiles();await activate(page.locator('.profile-choice').first());
        await pacing();await activate('#studioNavScenes');

        // Unsupported games offer a separate scene before the click, not a failed conversion.
        for(const unsupported of ['factory','hill']){
          await activate('#creationHome');await activate(`[data-starter="${unsupported}"]`);
          if(!await page.locator('#studioMakeScene').isVisible())await activate('#studioChange');
          assert.equal((await page.locator('#studioMakeScene').textContent()).trim(),'Start a separate scene');
          const nativeBefore=await page.evaluate(()=>({games:localStorage.getItem('family-game-factory-workspace-v2'),scenes:FG.creation.export()}));
          await activate('#studioMakeScene');
          await page.locator('#page-creation:not(.hidden)').waitFor();
          assert.equal(await scene(),null,`${unsupported}: the child still chooses which scene to create`);
          assert.deepEqual(await page.evaluate(()=>({games:localStorage.getItem('family-game-factory-workspace-v2'),scenes:FG.creation.export()})),nativeBefore,`${unsupported}: source versions and scene storage remain unchanged`);
          assert.equal(await page.locator('#creationFreeShelf').isVisible(),true,'Independent free creation remains available');
          assert.equal(await page.locator('[data-creation-starter]').count(),4);
        }

        // Carry real saved-game characters and provenance into a scene, then return.
        await activate('#creationHome');await activate('[data-starter="dragon"]');
        const gameSession=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(session=>session.game==='dragon'));
        assert.ok(gameSession?.projectId);
        const gameBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
        const gameEntry=gameBefore.projects.find(project=>project.id===gameSession.projectId);
        if(!await page.locator('#studioMakeScene').isVisible())await activate('#studioChange');
        await activate('#studioMakeScene');await page.waitForSelector('#page-creation:not(.hidden)');
        const fromGame=await scene();
        assert.equal(fromGame.provenance.sourceGameId,'dragon');
        assert.equal(fromGame.provenance.sourceProjectId,gameSession.projectId);
        assert.equal(fromGame.provenance.sourceRevisionId,gameEntry.headId);
        assert.ok(fromGame.actors.some(actor=>actor.assetId==='dragon'));
        await page.screenshot({path:`test-results/creation-from-dragon-${device}.png`,fullPage:true});
        await activate(page.getByRole('button',{name:'Back to my game',exact:true}));
        assert.equal(await page.locator('#page-creation').isVisible(),false);
        const gameAfter=await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
        assert.deepEqual(gameAfter,gameBefore,'Making and viewing a scene does not rewrite the saved game');
        const sourceSceneCount=(await workspace()).projects.length;
        if(!await page.locator('#studioMakeScene').isVisible())await activate('#studioChange');
        await activate('#studioMakeScene');
        assert.equal((await scene()).id,fromGame.id,'The same source revision reopens its scene rather than creating a duplicate');
        assert.equal((await workspace()).projects.length,sourceSceneCount);
        await activate('#creationBack');

        // Build an original scene by touching/clicking actual blocks and fields.
        await activate('[data-creation-starter="blank"]');
        const start=await scene(),title=`My moving gem ${device}`,projectId=start.id;
        assert.deepEqual(start.programs[0].actions,[]);
        await set(page.locator('#creationTitle'),title);
        await add('move');let current=await scene(),moveId=current.programs[0].actions[0].id;
        await set(block(moveId).getByRole('spinbutton',{name:'right / left',exact:true}),160);
        await set(block(moveId).getByRole('spinbutton',{name:'seconds',exact:true}),1);
        await add('say');current=await scene();const sayId=current.programs[0].actions[1].id;
        await set(block(sayId).getByRole('textbox',{name:'Words',exact:true}),'My gem is ready!');
        await set(block(sayId).getByRole('spinbutton',{name:'seconds',exact:true}),.5);
        await activate(block(sayId).getByRole('button',{name:'Move block up',exact:true}));
        assert.deepEqual((await scene()).programs[0].actions.map(item=>item.type),['say','move']);
        await activate('#creationUndo');
        assert.deepEqual((await scene()).programs[0].actions.map(item=>item.type),['move','say']);
        await activate('#creationRedo');
        assert.deepEqual((await scene()).programs[0].actions.map(item=>item.type),['say','move']);
        await activate(block(sayId).getByRole('button',{name:'Move block down',exact:true}));
        await add('repeat');current=await scene();const repeatId=current.programs[0].actions[2].id;
        await set(block(repeatId).getByRole('spinbutton',{name:'times',exact:true}),2);
        await add('jump');current=await scene();const jumpId=current.programs[0].actions[2].actions[0].id;
        await set(block(jumpId).getByRole('spinbutton',{name:'seconds',exact:true}),.4);
        await add('wait');current=await scene();const waitId=current.programs[0].actions[2].actions[1].id;
        await set(block(waitId).getByRole('spinbutton',{name:'seconds',exact:true}),.2);
        assert.deepEqual((await scene()).programs[0].actions[2].actions.map(item=>item.type),['jump','wait']);
        await noOverflow();

        await pacing();await activate('#creationRun');
        await page.waitForFunction(()=>FG.creation.snapshot()?.timeMs>=150&&FG.creation.snapshot()?.status==='running');
        if(touch)await activate('#creationPause');
        else {await page.locator('#creationPause').focus();await page.keyboard.press('Space');}
        const paused=await snapshot();assert.equal(paused.status,'paused');
        assert.equal(await page.getByRole('button',{name:'Resume',exact:true}).getAttribute('id'),'creationPause','the changed visible label remains the accessible name');
        assert.equal(await page.locator('#creationPause svg').getAttribute('data-jems-icon'),'play','paused playback retains the approved resume icon');
        if(!touch)assert.equal(await page.evaluate(()=>document.activeElement.id),'creationPause','repainting an icon label preserves keyboard focus');
        await page.waitForTimeout(150);assert.equal((await snapshot()).timeMs,paused.timeMs,'Pause really stops simulation time');
        await activate('#creationStep');const stepped=await snapshot();
        assert.equal(stepped.timeMs,paused.timeMs+100);assert.equal(stepped.status,'paused');
        await activate('#creationPause');
        assert.equal(await page.locator('#creationPause svg').getAttribute('data-jems-icon'),'pause','resuming updates the icon without duplicating it');
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed',null,{timeout:8000});
        const played=await snapshot();
        assert.equal(played.actors[0].x,start.actors[0].x+160);
        assert.equal(played.actors[0].y,start.actors[0].y);
        assert.equal(played.actors[0].jumpOffset,0);
        assert.equal(played.trace.filter(item=>item.type==='complete'&&item.actionType==='jump').length,2);

        // Switching to the chat creator must actually leave a running scene.
        // My journey then coexists with both creators without a hidden player.
        await pacing();await activate('#creationRun');
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='running');
        const beforeNavigation=await workspace(),beforeNavigationScene=await scene();
        await activate('#studioNavCreate');
        assert.equal(await page.locator('#page-studio').isVisible(),true);
        assert.equal(await page.locator('#page-creation').isVisible(),false);
        assert.equal(await page.evaluate(()=>document.body.classList.contains('creation-open')),false);
        const stopped=await snapshot();assert.equal(stopped.status,'paused','Leaving the scene stops its player');
        await page.waitForTimeout(180);
        assert.equal((await snapshot()).timeMs,stopped.timeMs,'The hidden scene cannot keep advancing');
        await activate('#studioNavJourney');
        assert.equal(await page.locator('#page-jems-journey').isVisible(),true);
        assert.equal(await page.locator('#page-creation').isVisible(),false);
        assert.equal((await snapshot()).timeMs,stopped.timeMs);
        assert.deepEqual(await workspace(),beforeNavigation,'Navigation does not Keep or rewrite the scene');
        await activate('#studioNavScenes');await activate(`[data-scene="${projectId}"]`);
        assert.deepEqual((await scene()).programs,beforeNavigationScene.programs);

        // A pending scene edit must be saved before selecting a chat project.
        await set(page.locator('#creationTitle'),title+' draft');
        const beforeDraftExit=(await workspace()).projects.find(item=>item.id===projectId);
        await activate('#studioNavCreate');
        const afterDraftExit=(await workspace()).projects.find(item=>item.id===projectId);
        assert.notEqual(afterDraftExit.headId,beforeDraftExit.headId,'Leaving saves the pending scene version');
        assert.equal(afterDraftExit.keptId,beforeDraftExit.keptId,'Saving on navigation does not silently Keep');
        await activate('#studioNavScenes');await activate(`[data-scene="${projectId}"]`);
        assert.equal((await scene()).title,title+' draft');
        assert.equal(await page.locator('#creationRecovery').isVisible(),false,'A completed navigation save needs no draft recovery');
        await set(page.locator('#creationTitle'),title);
        await activate('#creationKeep');
        let saved=await workspace(),entry=saved.projects.find(item=>item.id===projectId);
        assert.equal(entry.keptId,entry.headId,'Only explicit Keep selects this version');
        await page.screenshot({path:`test-results/creation-workspace-${device}.png`,fullPage:true});

        // Export actual editable bytes through the download control.
        await more();const downloadPromise=page.waitForEvent('download');await activate('#creationDownload');
        const download=await downloadPromise,jsonPath=`test-results/creation-scene-${device}.json`;
        await download.saveAs(jsonPath);
        const exported=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
        assert.equal(exported.id,projectId);assert.equal(exported.programs[0].actions[2].count,2);
        assert.equal(exported.schema,'jems.creation.v1');
        await pacing();await activate('#creationVideo');
        await page.waitForFunction(()=>document.querySelector('#creationVideo')?.textContent.trim()==='Stop & save video');
        assert.equal(await page.getByRole('button',{name:'Stop & save video',exact:true}).getAttribute('id'),'creationVideo');
        assert.equal(await page.locator('#creationVideo svg').getAttribute('data-jems-icon'),'stop','recording has a visible stop affordance');
        await page.waitForTimeout(1000);
        const videoPromise=page.waitForEvent('download');await activate('#creationVideo');
        const video=await videoPromise,extension=video.suggestedFilename().endsWith('.mp4')?'mp4':'webm';
        const videoPath=`test-results/creation-video-${device}.${extension}`;await video.saveAs(videoPath);
        const videoBytes=fs.readFileSync(videoPath);assert.ok(videoBytes.length>1000,'Canvas video contains recorded data');
        if(extension==='webm')assert.equal(videoBytes.subarray(0,4).toString('hex'),'1a45dfa3','A genuine WebM container was exported');
        else assert.equal(videoBytes.subarray(4,8).toString(),'ftyp','A genuine MP4 container was exported');
        if(await page.locator('#creationMore').evaluate(element=>element.open))await activate('#creationMore summary');

        await page.reload();await page.waitForFunction(()=>window.FG?.creation);
        await pacing();await activate(`[data-scene="${projectId}"]`);
        assert.equal((await scene()).title,title);
        assert.deepEqual((await scene()).programs,exported.programs);

        // Profile changes hide the other child's projects and clear the rendered scene.
        await activate('#creationHome');await profiles();await activate(page.locator('.profile-choice').nth(1));
        await pacing();await activate('#studioNavScenes');
        assert.equal(await page.locator('#creationSaved [data-scene]').count(),0);
        assert.equal(await scene(),null);
        assert.equal(await page.locator('#creationBlocks').textContent(),'');
        await activate('#creationHome');await profiles();await activate(page.locator('.profile-choice').first());
        await pacing();await activate('#studioNavScenes');await activate(`[data-scene="${projectId}"]`);
        assert.deepEqual((await scene()).programs,exported.programs);

        // The watchable target is a preview only; it must not supply or replace the child script.
        await chooseChallenge('dragon-bounces');
        const challengeStart=await scene(),emptyPrograms=JSON.stringify(challengeStart.programs);
        assert.equal(challengeStart.programs[0].actions.length,0);
        await pacing();await activate('#creationWatchTarget');
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors.some(actor=>actor.id==='dragon'&&actor.jumpOffset< -15));
        assert.equal(await page.locator('#creationTargetBadge').isVisible(),true);
        assert.equal(JSON.stringify((await scene()).programs),emptyPrograms,'Watching never copies target blocks into work');
        await activate('#creationReset');
        assert.equal(await page.locator('#creationTargetBadge').isVisible(),false);
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),false);
        await activate('#creationHint');
        await add('repeat');await add('jump');await add('wait');
        current=await scene();const childRepeat=current.programs[0].actions[0],childWait=childRepeat.actions[1].id;
        await set(block(childWait).getByRole('spinbutton',{name:'seconds',exact:true}),.2);
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),true);
        assert.match(await page.textContent('#creationFeedback'),/with a hint/);
        saved=await workspace();let attempt=saved.attempts.at(-1);
        assert.equal(attempt.passed,true);assert.equal(attempt.hintUsed,true);
        assert.equal(attempt.projectId,challengeStart.id);
        assert.equal(saved.projects.find(item=>item.id===challengeStart.id).keptId,null,'A successful check does not silently Keep');
        await page.reload();await page.waitForFunction(()=>window.FG?.creation);await pacing();
        await activate(`[data-scene="${challengeStart.id}"]`);await activate('#creationCheck');
        assert.equal((await workspace()).attempts.at(-1).hintUsed,true,'A revealed hint stays recorded after reload');
        await pacing();await activate('#creationRun');
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed',null,{timeout:8000});
        assert.equal((await snapshot()).trace.filter(item=>item.type==='complete'&&item.actionType==='jump').length,3);
        await set(block(childRepeat.id).getByRole('spinbutton',{name:'times',exact:true}),2);
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),false);
        await activate('#creationUndo');await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),true);
        await page.screenshot({path:`test-results/creation-challenge-${device}.png`,fullPage:true});
        await noOverflow();

        // Event-trigger editing and actual tap input use the same visible editor.
        await chooseChallenge('robot-taps');
        await page.getByRole('combobox',{name:'When',exact:true}).selectOption('tap');await add('move');
        current=await scene();const tapMove=current.programs[0].actions[0].id;
        await set(block(tapMove).getByRole('spinbutton',{name:'right / left',exact:true}),120);
        await set(block(tapMove).getByRole('spinbutton',{name:'seconds',exact:true}),.4);
        await pacing();await activate('#creationRun');
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
        assert.equal((await snapshot()).actors.find(actor=>actor.id==='robot').x,150);
        await activate('#creationTapActor');
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors.find(actor=>actor.id==='robot')?.x===270);
        await activate('#creationTapActor');
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors.find(actor=>actor.id==='robot')?.x===390);
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),true);

        // Build both branches of a state-dependent rule through the nested editor.
        await chooseChallenge('bucket-rule');await activate('#creationActors [data-actor="bucket"]');
        await activate('#creationAddScript');await page.getByRole('combobox',{name:'When',exact:true}).selectOption('tap');
        await add('if');current=await scene();
        const bucketProgram=current.programs.find(program=>program.actorId==='bucket'&&program.trigger.type==='tap'),ruleId=bucketProgram.actions[0].id;
        await add('say');current=await scene();
        let rule=current.programs.find(program=>program.actorId==='bucket'&&program.trigger.type==='tap').actions[0];
        await set(block(rule.then[0].id).getByRole('textbox',{name:'Words',exact:true}),'Ready');
        await set(block(rule.then[0].id).getByRole('spinbutton',{name:'seconds',exact:true}),1);
        await activate(block(ruleId).locator(':scope > .creation-block-list').nth(1).locator(':scope > .creation-insert'));
        await add('say');current=await scene();rule=current.programs.find(program=>program.actorId==='bucket'&&program.trigger.type==='tap').actions[0];
        await set(block(rule.else[0].id).getByRole('textbox',{name:'Words',exact:true}),'More');
        await set(block(rule.else[0].id).getByRole('spinbutton',{name:'seconds',exact:true}),1);
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),true);
        await pacing();await activate('#creationRun');await activate('#creationTapActor');
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors.find(actor=>actor.id==='bucket')?.speech==='More');
        await activate('#creationVariables summary');
        await set(page.locator('#creationVariables').getByRole('spinbutton',{name:'gems',exact:true}),3);
        await activate('#creationRun');await activate('#creationTapActor');
        await page.waitForFunction(()=>FG.creation.snapshot()?.actors.find(actor=>actor.id==='bucket')?.speech==='Ready');
        await block(ruleId).getByRole('combobox',{name:'Rule',exact:true}).selectOption('eq');
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),false,'Equals three is wrong when five gems are supplied');
        await block(ruleId).getByRole('combobox',{name:'Rule',exact:true}).selectOption('gte');
        await activate('#creationCheck');
        assert.equal(await page.locator('#creationFeedback').evaluate(element=>element.classList.contains('is-success')),true);
        await page.screenshot({path:`test-results/creation-condition-${device}.png`,fullPage:true});

        // A direct stage tap must honor a newly due checkpoint too, even after Play ended.
        await activate('#creationRun');
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
        await page.evaluate(()=>{FG.store.current().mathWindow=[];FG.store.save();});
        const canvas=page.locator('#creationCanvas');await canvas.scrollIntoViewIfNeeded();
        const canvasBox=await canvas.boundingBox(),tappedActor=(await snapshot()).actors.find(actor=>actor.id==='bucket');
        const tapX=canvasBox.x+tappedActor.x/800*canvasBox.width,tapY=canvasBox.y+tappedActor.y/450*canvasBox.height;
        if(touch)await page.touchscreen.tap(tapX,tapY);else await page.mouse.click(tapX,tapY);
        await page.waitForFunction(()=>FG.learning.active);
        const guarded=await page.evaluate(()=>({id:FG.learning.activeAttemptId,time:FG.creation.snapshot().timeMs}));
        assert.ok(guarded.id);
        await activate('#creationRun');await activate('#creationStep');await activate('#creationWatchTarget');
        const notebookBeforeGuard=await page.evaluate(()=>FG.studio.exportNotebook());
        await activate('#studioNavCreate');await activate('#studioNavJourney');
        assert.equal(await page.locator('#page-creation').isVisible(),true,'Creator and Journey navigation preserve an open scene checkpoint');
        assert.deepEqual(await page.evaluate(()=>FG.studio.exportNotebook()),notebookBeforeGuard,'Blocked navigation creates no empty chat project');
        assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),guarded.id);
        assert.equal((await snapshot()).timeMs,guarded.time,'Editor controls do not bypass the learning host');
        await page.screenshot({path:`test-results/creation-checkpoint-${device}.png`,fullPage:true});
        await activate('#creationHome');
        assert.equal(await page.evaluate(()=>FG.learning.active),false);
        assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(item=>item.id===id).outcome,guarded.id),'interrupted');
        assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(item=>item.id===id).correct,guarded.id),false);
        await activate('#studioNavPowers');
        assert.equal(await page.locator('#creationLabProgress').isVisible(),true);
        const observationCount=await page.locator('#creationLabProgress [data-project-id]').count();
        assert.ok(observationCount>0&&observationCount<=5);
        assert.match(await page.textContent('#creationLabProgress'),/Matched this goal/);
        assert.match(await page.textContent('#creationLabProgress'),/hint was opened/);
        await page.screenshot({path:`test-results/creation-progress-${device}.png`,fullPage:true});
        await profiles();await activate(page.locator('.profile-choice').nth(1));
        await activate('#studioNavPowers');
        assert.equal(await page.locator('#creationLabProgress [data-project-id]').count(),0,'Progress contains only the selected profile’s checked scenes');
        assert.match(await page.textContent('#creationLabProgress'),/Try a scene challenge/);
        assert.equal(await page.locator('#creationParentProgress').textContent(),'','Hidden parent observations do not retain the other profile’s content');
        await noOverflow();
        assert.deepEqual(paidRequests,[],'Local creation never requests a model or paid build');
        assert.deepEqual(errors,[],'No unhandled production UI errors');
        results.push({device,viewport,touchEmulated:touch,status:'passed',paidRequests:0,pageErrors:0,
          verified:['shelf import without throwaway scene','invalid import preserves collection','saved scenes visible across shelf modes','challenge resume without duplicate','explicit fresh challenge','latest checked-scene continuation','owner-isolated challenge continuation','honest separate scene entry for unsupported games','saved-game source continuity','same-source scene reopen','UI-authored blocks','reorder and undo','nested repeat and condition branches','play/pause/step','scene-to-Create-to-Journey cleanup','scene draft save without Keep on navigation','Keep/reload','editable file export','real canvas video export','profile isolation','target separation','behavioral challenge feedback','persistent hint history','event taps','variable boundary behavior','learning checkpoint guard','profile-scoped progress','overflow']});
        console.log(`PASS ${device}: production Creation Studio UI, real block edits and playback, saved ownership, target reconstruction, tap behavior and learning guard`);
      } catch(error) {
        await page.screenshot({path:`test-results/creation-failure-${device}.png`,fullPage:true}).catch(()=>{});
        console.error('Creation UI failure details',device,await page.locator('#creationStatus').textContent().catch(()=>''),errors);
        throw error;
      } finally {await context.close();}
    }
    fs.writeFileSync('test-results/creation-browser-results.json',JSON.stringify({runtime:'production-dist',realChildrenTested:false,realTabletTested:false,results},null,2));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
