/* Production-dist first-learner journeys. Edits use public UI; scene/snapshot
 * inspection is read-only. The only fixture writes isolate learning pacing. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');

const {inputs}=require('./creation-learner-input.cjs');
const layouts=[
  ['desktop',{width:1440,height:900}],
  ['laptop',{width:1366,height:768}],
  ['portrait',{width:768,height:1024}],
  ['large-portrait',{width:820,height:1180}],
  ['tablet',{width:1024,height:768}],
  ['phone',{width:390,height:844}],
  ['small-phone',{width:320,height:667}],
  ['landscape',{width:844,height:390}],
];
const minimumStage={desktop:[695,390],laptop:[650,365],portrait:[395,222],'large-portrait':[495,278],tablet:[480,270],phone:[300,168],'small-phone':[240,135],landscape:[320,180]};

async function fittedStage(page,label,minimum){
  // ResizeObserver sizing is asynchronous. Wait for the actual element to fill
  // the largest aspect-preserving rectangle available inside its stage.
  await page.waitForFunction(()=>{
    const canvas=document.getElementById('creationCanvas'),wrap=canvas.parentElement;
    const c=canvas.getBoundingClientRect(),w=wrap.getBoundingClientRect(),scene=FG.creation.scene();
    return scene&&c.width>0&&w.height>0&&Math.abs(c.width-Math.min(w.width,w.height*scene.width/scene.height))<1.5;
  });
  const geometry=await page.locator('#creationCanvas').evaluate(canvas=>{
    const box=canvas.getBoundingClientRect(),wrap=canvas.parentElement.getBoundingClientRect(),scene=FG.creation.scene();
    return {canvas:{x:box.x,y:box.y,width:box.width,height:box.height,right:box.right,bottom:box.bottom},
      wrap:{x:wrap.x,y:wrap.y,width:wrap.width,height:wrap.height,right:wrap.right,bottom:wrap.bottom},
      ratio:scene.width/scene.height,viewport:{width:innerWidth,height:innerHeight}};
  });
  const {canvas,wrap,ratio,viewport}=geometry;
  assert.ok(Math.abs(canvas.width/canvas.height-ratio)<.005,label+': canvas aspect matches the saved scene');
  assert.ok(canvas.x>=wrap.x-1&&canvas.y>=wrap.y-1&&canvas.right<=wrap.right+1&&canvas.bottom<=wrap.bottom+1,label+': no scene edge is clipped');
  assert.ok(canvas.x>=-1&&canvas.y>=-1&&canvas.right<=viewport.width+1&&canvas.bottom<=viewport.height+1,label+': scene remains in the viewport');
  assert.ok(Math.abs(canvas.width-Math.min(wrap.width,wrap.height*ratio))<1.5,label+': scene uses the largest undistorted rectangle');
  if(minimum)assert.ok(canvas.width>=minimum[0]-.5&&canvas.height>=minimum[1]-.5,label+': stage retains useful dimensions '+JSON.stringify(geometry));
  return geometry;
}

async function readableSurface(page,label){
  const result=await page.locator('#page-creation').evaluate(root=>{
    const visible=element=>{
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&
        !element.closest('[hidden],.creation-sr,[aria-hidden="true"]');
    };
    const small=[];
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const text=walker.currentNode.textContent.trim(),element=walker.currentNode.parentElement;
      if(!text||!element||!visible(element)||element.closest('svg,style,script,option'))continue;
      if(parseFloat(getComputedStyle(element).fontSize)<18)small.push({text:text.slice(0,65),size:getComputedStyle(element).fontSize});
    }
    for(const element of root.querySelectorAll('input,select,textarea'))if(visible(element)&&parseFloat(getComputedStyle(element).fontSize)<18)
      small.push({text:element.getAttribute('aria-label')||element.id,size:getComputedStyle(element).fontSize});
    const undersized=[];
    for(const element of root.querySelectorAll('button,summary,input,select,textarea')){
      if(!visible(element))continue;
      const rect=element.getBoundingClientRect();
      const minimum=element.matches('#creationRun,#creationKeep,[data-add-block]')?48:44;
      if(rect.width<43.5||rect.height<minimum-.5)undersized.push({text:element.getAttribute('aria-label')||element.textContent.trim().slice(0,55),width:rect.width,height:rect.height,minimum});
    }
    const overflow=document.documentElement.scrollWidth>innerWidth+1;
    const overflowing=overflow?[...document.querySelectorAll('body *')].filter(element=>{
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0&&
        (rect.left< -1||rect.right>innerWidth+1);
    }).slice(0,16).map(element=>({name:element.tagName.toLowerCase(),id:element.id,
      className:typeof element.className==='string'?element.className.slice(0,90):'',
      left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right)})):[];
    return {small,undersized,overflow,overflowing,documentWidth:document.documentElement.scrollWidth};
  });
  assert.equal(result.overflow,false,label+': no page-wide horizontal overflow '+JSON.stringify({width:result.documentWidth,offenders:result.overflowing}));
  assert.deepEqual(result.small,[],label+': visible child text stays at least 18px');
  assert.deepEqual(result.undersized,[],label+': controls retain usable touch targets');
}

async function pacing(page){
  await page.evaluate(()=>{
    FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];
    if(!FG.store.save())throw Error('Could not save pacing fixture');
  });
}

async function capture(page,name){
  await page.screenshot({path:'test-results/creation-learner-'+name+'.png',fullPage:false});
}

async function openSceneFile(page,scene,tap){
  const choosing=page.waitForEvent('filechooser');
  await tap(page.locator('#creationShelfImport'));
  await (await choosing).setFiles({name:'saved-scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scene))});
  await page.waitForFunction(()=>document.getElementById('creationImport').value==='');
  await page.locator('#creationWorkspace:not([hidden])').waitFor();
}

// Browser-level page zoom changes both CSS viewport width and devicePixelRatio.
// Use an isolated regular Chromium profile for its native settings page.
async function browserZoom(port){
  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport:null,
    executablePath:process.env.CHROMIUM_PATH || (!process.env.CI && fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
    args:['--no-sandbox','--window-size=1366,768']});
  try{
    const page=await context.newPage(), {tap,reach}=await inputs(page,false);
    await page.route('**/factory-config.json',r=>r.fulfill({json:{version:1,mode:'unavailable'}}));
    await page.goto(`http://127.0.0.1:${port}/arcade/?creation=1`);
    if(await page.locator('#creationIntroduction').isVisible())await tap(page.locator('#creationIntroSkip'));
        await tap(page.locator('#creationFreeMode'));await tap(page.locator('[data-creation-starter="blank"]'));
    await tap(page.locator('[data-add-block="move"]'));
    const authored=await page.evaluate(()=>FG.creation.scene());
    const settings=await context.newPage();
    await settings.goto('chrome://settings/appearance');
    const zoom=async scale=>{
      await settings.evaluate(s=>chrome.settingsPrivate.setDefaultZoom(s),scale);
      await page.bringToFront();
      await page.waitForFunction(s=>Math.abs(devicePixelRatio-s)<.01,scale);
    };
    await zoom(1.5);
    await reach(page.locator('#creationCodeView'),false);
    for(const type of ['move','jump','say','dance','wait','repeat']) await reach(page.locator(`[data-add-block="${type}"]`));
    await tap(page.locator('#creationPlayView'));
    await fittedStage(page,'150% browser zoom');
    await zoom(1);
    assert.deepEqual(await page.evaluate(()=>FG.creation.scene()),authored);
    console.log('PASS native Chromium 150% zoom and restoration');
  }finally{await context.close();}
}

const complexScene={
  schema:'jems.creation.v1',id:'preserved-complex-scene',title:'My saved signal story',width:800,height:450,background:'night',
  actors:[{id:'dragon',name:'Dragon',assetId:'dragon',x:150,y:300,size:120},{id:'bucket',name:'Bucket',assetId:'bucket-blue',x:600,y:300,size:90}],
  variables:{gems:7,counter:1},provenance:{createdBy:'child',sourceKind:'creation',sourceProjectId:'my-first-story',sourceRevisionId:'my-first-kept-version'},
  programs:[
    {id:'dragon-start',actorId:'dragon',trigger:{type:'start'},actions:[
      {id:'custom-move',type:'move',x:417,y:222,durationMs:1370,origin:'child'},
      {id:'signal',type:'emit',name:'your-turn',origin:'child'},
    ]},
    {id:'bucket-signal',actorId:'bucket',trigger:{type:'event',name:'your-turn'},actions:[
      {id:'choose',type:'if',condition:{type:'variable',variable:'gems',operator:'gte',value:3},then:[
        {id:'repeat',type:'repeat',count:7,actions:[{id:'counter',type:'change',variable:'counter',amount:2,origin:'child'}],origin:'child'},
        {id:'cheer',type:'say',text:'My rule still works',durationMs:1330,origin:'child'},
      ],else:[{id:'wait',type:'wait',durationMs:370,origin:'child'}],origin:'child'},
    ]},
  ],
};

(async()=>{
  const server=start();if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
    .catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
  fs.mkdirSync('test-results',{recursive:true});
  const results=[];
  try{
    for(const [name,viewport] of layouts){
      if(process.env.CREATION_LEARNER_DEVICE&&process.env.CREATION_LEARNER_DEVICE!==name)continue;
      const context=await browser.newContext({viewport,hasTouch:!['desktop','laptop'].includes(name),reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],paidRequests=[];
      page.setDefaultTimeout(12000);
      // Browser refusal is deterministic here; real native fullscreen remains
      // a separate device check, while the usable expanded fallback is required.
      await page.addInitScript(()=>{
        const native=Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen=async()=>{Element.prototype.requestFullscreen=native;throw new DOMException('Synthetic fullscreen refusal','NotAllowedError');};
      });
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      page.on('request',request=>{if(request.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url()))paidRequests.push(request.url());});
      await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
      const {tap,reach,set,choose,drag}=await inputs(page,!['desktop','laptop'].includes(name));
      const switchView=async view=>{
        const button=page.locator(view==='code'?'#creationCodeView':'#creationPlayView');
        if(await button.isVisible() && await button.getAttribute('aria-pressed')==='false') await tap(button);
      };
      const scene=()=>page.evaluate(()=>FG.creation.scene());
      const snapshot=()=>page.evaluate(()=>FG.creation.snapshot());
      const state=()=>page.evaluate(()=>FG.creation.export());
      const block=id=>page.locator(`[data-block-id="${id}"]`);
      const edit=async id=>{const button=page.locator(`[data-edit-block="${id}"]`);if(await button.getAttribute('aria-expanded')!=='true')await tap(button);};
      const add=type=>tap(page.locator(`[data-add-block="${type}"]`));
      const backToScenes=async()=>{
        if(await page.locator('#creationBack').isVisible())await tap(page.locator('#creationBack'));
        else {
          // On 320px and short-landscape screens the same scene-shelf action
          // is inside More, keeping My Games and the stage visible.
          await tap(page.locator('#creationMore > summary'));
          await tap(page.locator('#creationMoreScenes'));
        }
      };
      try{
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?creation=1`);
        await page.waitForFunction(()=>window.FG?.creation&&window.FG?.studio);
        await pacing(page);
        await capture(page,name+'-shelf');
        await readableSurface(page,name+' shelf');
        if(await page.locator('#creationIntroduction').isVisible())await tap(page.locator('#creationIntroSkip'));
        await tap(page.locator('#creationFreeMode'));await tap(page.locator('[data-creation-starter="blank"]'));
        const initial=await scene(),id=initial.id;
        assert.equal(await page.locator('#creationSimpleMode').getAttribute('aria-pressed'),'true','First steps is the ordinary entrance');
        assert.equal(await page.locator('#creationFullMode').getAttribute('aria-pressed'),'false');
        assert.equal(await page.locator('#creationActorSettings').isVisible(),false,'numeric actor inspector is optional');
        assert.equal(await page.locator('#creationVariables').isVisible(),false,'variables do not crowd the beginner');
        assert.equal(await page.locator('#creationAddScript').isVisible(),false,'extra script management is optional');
        assert.equal(await page.locator('#creationRead').isVisible(),true,'read-aloud remains discoverable');
        assert.equal(await page.locator('.site-header.studio-practice-navigation').isVisible(),false,'shared shell header must not intercept child editor controls');
        await page.evaluate(()=>document.fonts.ready);
        const actions=['move','jump','say','dance','wait','repeat'];
        for(const action of actions) await reach(page.locator(`[data-add-block="${action}"]`),false);
        const pane=await page.locator('#creationCodePane').boundingBox();
        const grid=await page.locator('.creation-workspace-grid').boundingBox();
        const compact=await page.locator('#creationCodeView').isVisible();
        if(compact) assert.ok(pane.width>=290 && pane.width>=grid.width-1 && pane.height>=grid.height-1 && pane.height>=245);
        else if(viewport.width>viewport.height) assert.ok(pane.width>=480 && Math.abs(pane.width/grid.width-.5)<.025 && pane.height>=550);
        else assert.ok(Math.abs(pane.height/grid.height-.65)<.025 && pane.height>=550);
        await capture(page,name+'-beginner');
        assert.deepEqual(await page.locator('#creationCodePane').evaluate(pane=>
          [...pane.querySelectorAll('*')].filter(el=>
            el.clientHeight>0 && el.scrollHeight>el.clientHeight+1 && /auto|scroll/.test(getComputedStyle(el).overflowY)
          ).map(el=>el.id)),[],'the code pane owns all vertical program scrolling');
        await readableSurface(page,name+' code');
        for(const action of ['emit','set','change'])assert.equal(await page.locator(`[data-add-block="${action}"]`).isVisible(),false,'advanced action is optional: '+action);
        await switchView('play');
        const stage=await fittedStage(page,name+' beginner',minimumStage[name]);
        await readableSurface(page,name+' beginner');
        const actor=initial.actors[0],destination={x:300,y:285};
        const point=p=>({x:stage.canvas.x+p.x/initial.width*stage.canvas.width,y:stage.canvas.y+p.y/initial.height*stage.canvas.height});
        for (const pos of [point(actor),point(destination)]) assert.ok(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id==='creationCanvas',pos));
        await drag(point(actor),point(destination));
        assert.ok(Math.abs((await scene()).actors[0].x-destination.x)<=1&&Math.abs((await scene()).actors[0].y-destination.y)<=1,'pointer placement matches the visible scene coordinates');
        await tap(page.locator('#creationUndo'));assert.deepEqual(await scene(),initial,'pointer experiment remains recoverable');
        await tap(page.locator('#creationFullscreen'));
        await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('Expanded view'));
        assert.equal(await page.locator('#creationFullscreen').getAttribute('aria-pressed'),'true');
        assert.equal(await page.evaluate(()=>document.fullscreenElement),null,'refused native fullscreen is not claimed');
        assert.equal(await page.locator('#creationHome').isVisible(),true,'expanded view retains an exit');
        const expanded=await fittedStage(page,name+' expanded');
        const oldArea=stage.canvas.width*stage.canvas.height,newArea=expanded.canvas.width*expanded.canvas.height;
        assert.equal(await page.locator('.creation-code-card').isVisible(),false,'expanded view gives the dock space to the stage');
        if(!compact) assert.ok(expanded.wrap.width*expanded.wrap.height>stage.wrap.width*stage.wrap.height*1.15,'expanded view materially increases the stage rectangle');
        if(stage.canvas.width<stage.wrap.width*.9)assert.ok(newArea>oldArea*1.15,'a height-limited scene becomes materially larger');
        else assert.ok(newArea>=oldArea*.99,'a width-limited portrait scene keeps its maximal uncropped size');
        await capture(page,name+'-expanded');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#creationFullscreen').getAttribute('aria-pressed'),'false');
        assert.deepEqual(await scene(),initial,'entering and leaving expanded view cannot edit the scene');

        await tap(page.locator('#creationFullscreen'));
        await page.waitForFunction(()=>document.fullscreenElement?.id==='page-creation');
        await tap(page.locator('#creationFullscreen'));
        await page.waitForFunction(()=>!document.fullscreenElement);
        assert.deepEqual(await scene(),initial,'native fullscreen exit preserves the project');
        await switchView('code');
        // Undoing a container must not leave the next action aimed at a deleted group.
        await add('repeat');await tap(page.locator('#creationUndo'));await add('dance');
        assert.deepEqual((await scene()).programs[0].actions.map(action=>action.type),['dance'],'a new action after Undo uses a live program container');
        await tap(page.locator('#creationUndo'));assert.deepEqual(await scene(),initial);

        // One sequence, one nested repeat and one explicit correction use the same real engine.
        await add('move');
        const moveId=(await scene()).programs[0].actions[0].id;
        await choose(block(moveId).getByRole('combobox',{name:'Direction',exact:true}),'right');
        await set(block(moveId).getByRole('spinbutton',{name:'Steps',exact:true}),160);
        await choose(block(moveId).getByRole('combobox',{name:'Time',exact:true}),'500');
        await add('say');
        let current=await scene();
        const [move,say]=current.programs[0].actions;
        await set(block(say.id).getByRole('textbox',{name:'Words',exact:true}),'I made this happen!');
        await choose(block(say.id).getByRole('combobox',{name:'Time',exact:true}),'500');
        assert.equal(await page.locator('#creationBlocks .creation-block-fields:visible').count(),1,'only the selected action exposes its fields');
        await edit(move.id);
        assert.equal(await block(move.id).getByRole('spinbutton',{name:'Steps',exact:true}).inputValue(),'160');
        assert.equal(await page.locator('#creationBlocks .creation-block-fields:visible').count(),1,'changing selection replaces the open inspector');
        await edit(say.id);await tap(block(say.id).getByRole('button',{name:'Move block up',exact:true}));
        assert.deepEqual((await scene()).programs[0].actions.map(action=>action.type),['say','move']);
        await tap(page.locator('#creationUndo'));
        assert.deepEqual((await scene()).programs[0].actions.map(action=>action.type),['move','say']);
        await add('repeat');
        const repeatId=(await scene()).programs[0].actions[2].id;
        await set(block(repeatId).getByRole('spinbutton',{name:'Times',exact:true}),2);
        await add('jump');await add('wait');
        current=await scene();const repeat=current.programs[0].actions[2];
        assert.equal(repeat.type,'repeat');assert.deepEqual(repeat.actions.map(action=>action.type),['jump','wait']);
        const savedBeforePlay=structuredClone(current);
        await reach(page.locator(`[data-edit-block="${repeat.actions[1].id}"]`));
        await capture(page,name+'-edited');
        await switchView('play');await pacing(page);await tap(page.locator('#creationRun'));
        // The engine starts before its first animation frame paints the playbar.
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='running' &&
          !document.getElementById('creationPause').disabled);
        assert.ok(await page.locator('#creationCanvas').isVisible());
        await tap(page.locator('#creationPause'));
        const paused=await snapshot();assert.equal(paused.status,'paused');
        await page.waitForTimeout(150);assert.equal((await snapshot()).timeMs,paused.timeMs,'Pause stops logical time');
        await tap(page.locator('#creationPause'));
        await page.waitForFunction(()=>{
          const words=document.getElementById('creationSceneWords'), box=words.getBoundingClientRect();
          return !words.hidden && words.textContent.includes('I made this happen!') &&
            words.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
        });
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed',null,{timeout:12000});
        const finished=await snapshot();
        assert.equal(finished.actors[0].x,initial.actors[0].x+(move.dx||0));
        assert.equal(finished.actors[0].jumpOffset,0);
        assert.deepEqual(await scene(),savedBeforePlay,'running does not rewrite the program');
        await readableSurface(page,name+' sequence');await capture(page,name+'-sequence');
        await tap(page.locator('#creationKeep'));
        const kept=(await state()).projects.find(project=>project.id===id).keptId;
        await backToScenes();await tap(page.locator(`[data-scene="${id}"]`));
        assert.deepEqual(await scene(),savedBeforePlay,'reopening preserves the authored plan');
        assert.equal((await state()).projects.find(project=>project.id===id).keptId,kept);

        // A tap rule is a separate program, not a destructive reassignment of On Play.
        const originalPlay=(await scene()).programs[0];
        await tap(page.locator('#creationOnTap'));
        assert.equal((await scene()).programs.length,2);
        assert.deepEqual((await scene()).programs[0],originalPlay);
        await add('move');
        const tapMove=(await scene()).programs.find(program=>program.trigger.type==='tap').actions[0];
        await choose(block(tapMove.id).getByRole('combobox',{name:'Direction',exact:true}),'left');
        await set(block(tapMove.id).getByRole('spinbutton',{name:'Steps',exact:true}),40);
        await choose(block(tapMove.id).getByRole('combobox',{name:'Time',exact:true}),'500');
        await tap(page.locator('#creationOnPlay'));await tap(page.locator('#creationOnTap'));
        assert.equal((await scene()).programs.length,2,'revisiting event tabs does not duplicate programs');
        assert.deepEqual((await scene()).programs[0],originalPlay);
        assert.equal((await state()).projects.find(project=>project.id===id).keptId,kept,'trying a new event never silently chooses Keep');
        await switchView('play');await tap(page.locator('#creationReset'));await tap(page.locator('#creationTapActor'));
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
        assert.equal((await snapshot()).actors[0].x,initial.actors[0].x-40,'Try tap dispatches the authored tap behavior');

        // Correct a real challenge by changing order. Check feedback must be visible near the stage.
        await backToScenes();await tap(page.locator('#creationChallengeMode'));
        await tap(page.locator('[data-challenge="early-cheer"]'));
        const challengeBefore=await scene();
        for(const action of actions) await reach(page.locator(`[data-add-block="${action}"]`),false);
        await pacing(page);await tap(page.locator('#creationCheck'));
        assert.equal((await state()).attempts.at(-1).passed,false,'the actual wrong-order starter fails');
        assert.equal(await page.locator('#creationFeedback').isVisible(),true);
        assert.deepEqual(await scene(),challengeBefore,'checking observes the child program without replacing it');
        await tap(page.locator('#creationCloseFeedback'));
        const moveBlock=challengeBefore.programs[0].actions.find(action=>action.type==='move');
        await edit(moveBlock.id);await tap(block(moveBlock.id).getByRole('button',{name:'Move block up',exact:true}));
        const scrollBeforeCheck=await page.evaluate(()=>scrollY);
        await tap(page.locator('#creationCheck'));
        assert.equal((await state()).attempts.at(-1).passed,true,'reordering genuinely repairs the behavior');
        assert.equal(await page.locator('#creationFeedback').isVisible(),true);
        await readableSurface(page,name+' feedback');await capture(page,name+'-feedback');
        const feedbackBounds=await page.locator('#creationFeedback').boundingBox();
        assert.ok(feedbackBounds.y<viewport.height&&feedbackBounds.y+feedbackBounds.height>0,'check feedback is in the visible view');
        assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scrollBeforeCheck)<2,'checking does not scroll the child away from the scene');

        // Opening and viewing a complex saved scene cannot silently simplify its data.
        await backToScenes();
        await openSceneFile(page,complexScene,tap);
        const imported=await scene();
        assert.deepEqual(imported.actors,complexScene.actors);
        assert.deepEqual(imported.programs,complexScene.programs);
        assert.deepEqual(imported.variables,complexScene.variables);
        assert.equal(imported.provenance.sourceRevisionId,complexScene.provenance.sourceRevisionId);
        if(compact) await tap(page.locator('#creationCharacterTools'));
        await tap(page.locator('#creationFullMode'));
        await tap(page.locator('#creationActors [data-actor="bucket"]'));
        await choose(page.locator('#creationScript'),'bucket-signal');
        assert.equal(await page.getByRole('combobox',{name:'When',exact:true}).inputValue(),'event');
        assert.equal(await page.getByRole('textbox',{name:'Signal name',exact:true}).inputValue(),'your-turn');
        await tap(page.locator('#creationSimpleMode'));
        assert.deepEqual(await scene(),imported,'changing editor view or selected script never rewrites complex scenes');
        await switchView('play');await pacing(page);await tap(page.locator('#creationRun'));
        await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed',null,{timeout:10000});
        const complexResult=await snapshot();assert.equal(complexResult.actors.find(actor=>actor.id==='dragon').x,417);
        assert.equal(complexResult.variables.counter,15,'named event, condition and nested repeat still run');
        assert.deepEqual(await scene(),imported,'viewing/running preserves custom durations, exact destinations and source pins');
        await tap(page.locator('#creationKeep'));await backToScenes();
        await tap(page.locator(`[data-scene="${imported.id}"]`));assert.deepEqual(await scene(),imported);
        if(name==='phone' || name==='tablet'){
          await add('repeat');await add('repeat');
          const nested=(await scene()).programs[0].actions.at(-1).actions[0];
          for(let i=0;i<10;i++) await add('wait');
          const group=block(nested.id);
          assert.equal((await scene()).programs[0].actions.at(-1).actions[0].actions.length,10);
          const last=group.locator('[data-block-id]').last();
          await tap(last.getByRole('button',{name:'Remove Wait block',exact:true}));
          assert.equal((await scene()).programs[0].actions.at(-1).actions[0].actions.length,9);
          await tap(page.locator('#creationUndo'));
          const long=await scene();
          assert.equal(long.programs[0].actions.at(-1).actions[0].actions.length,10);
          await page.setViewportSize({width:viewport.height,height:viewport.width});
          await switchView('play');await fittedStage(page,name+' rotated');
          await switchView('code');await reach(group.locator('[data-edit-block]').last());
          await page.setViewportSize(viewport);
          assert.deepEqual(await scene(),long,'rotation preserves the edited nested group');
        }
        // A due checkpoint owns playback and its learning/exit controls across layouts.
        await page.evaluate(()=>{FG.store.current().mathWindow=[];FG.store.save();});
        const beforeLearning=await scene();
        await switchView('play');await tap(page.locator('#creationRun'));
        await page.waitForFunction(()=>FG.learning.active);
        const attempt=await page.evaluate(()=>FG.learning.activeAttemptId);
        await reach(page.locator('#creationLearning [data-action="read-aloud"]'));
        if(compact) {
          await tap(page.locator('#creationCodeView'));
          assert.equal(await page.locator('#creationPlayView').getAttribute('aria-pressed'),'true');
        }
        assert.deepEqual(await scene(),beforeLearning);
        await tap(page.locator('#creationHome'));
        assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id)?.outcome,attempt),'interrupted');
        assert.equal(await page.locator('#page-creation').isVisible(),false,'exit remains usable');
        const navigation=page.locator('#studioNavScenes');
        if(!await navigation.isVisible()) await tap(page.locator('#studioNavMenu'));
        await tap(navigation);
        await reach(page.locator('#creationFreeMode'));
        assert.deepEqual(errors,[],name+': no application exceptions');
        assert.deepEqual(paidRequests,[],name+': local coding makes no paid request');
        results.push({layout:name,status:'passed',viewport,pane,actions});
        console.log('PASS first-learner creation '+name);
      }catch(error){
        await capture(page,name+'-failure').catch(()=>{});
        results.push({layout:name,status:'failed',message:error.message,errors,paidRequests});
        console.error('FAIL first-learner creation '+name+': '+error.message);
      }finally{await context.close();}
    }
    assert.ok(results.length,'requested learner viewport must exist');
    if(!process.env.CREATION_LEARNER_DEVICE || process.env.CREATION_LEARNER_DEVICE==='laptop')
      await browserZoom(server.address().port);
    assert.deepEqual(results.filter(result=>result.status==='failed'),[],'every first-learner layout and journey must pass');
  }finally{
    fs.writeFileSync('test-results/creation-learner-results.json',JSON.stringify({suite:'production-dist first-learner creation',results},null,2));
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
