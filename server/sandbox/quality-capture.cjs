// Runs in the same credential-free browser sandbox as the functional gate.
// Suggested paths supply ordinary inputs, never assertions, state injection or
// a verdict. The separate reviewer receives actual pixels and action receipts.
const {createHash}=require('node:crypto');
const {renderGeneratedV2}=require('./preview-v2.cjs');
const {touchGesture}=require('./playtest-v2.cjs');
const {qualityArtifactHash,validateQualityEvidence}=require('../quality/game-quality-evidence.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const keys={left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',action:'Space'};
function safeActions(game){
 const proposed=game.playthrough||[
  ...game.controls.slice(0,4).map(control=>({type:'hold',control,frames:50})),
  {type:'tap',x:180,y:200,frames:30},{type:'drag',x:180,y:200,x2:480,y2:200,frames:45},
  {type:'tap',x:360,y:200,frames:30},{type:'wait',frames:120}
 ];
 if(!Array.isArray(proposed)||proposed.length<1||proposed.length>16)throw Error('QUALITY_PLAYTHROUGH_INVALID');
 let total=0;
 const actions=proposed.map(a=>{
  const fields=a?.type==='tap'?['type','x','y','frames']:a?.type==='drag'?['type','x','y','x2','y2','frames']:a?.type==='hold'?['type','control','frames']:a?.type==='wait'?['type','frames']:[];
  if(!fields.length||fields.some(k=>!Object.hasOwn(a,k))||Object.keys(a).some(k=>!fields.includes(k))||!Number.isInteger(a.frames)||a.frames<1||a.frames>180)throw Error('QUALITY_PLAYTHROUGH_INVALID');
  for(const k of ['x','x2'])if(Object.hasOwn(a,k)&&(!Number.isFinite(a[k])||a[k]<0||a[k]>720))throw Error('QUALITY_PLAYTHROUGH_INVALID');
  for(const k of ['y','y2'])if(Object.hasOwn(a,k)&&(!Number.isFinite(a[k])||a[k]<0||a[k]>400))throw Error('QUALITY_PLAYTHROUGH_INVALID');
  if(a.type==='hold'&&(!Object.hasOwn(keys,a.control)||!game.controls.includes(a.control)))throw Error('QUALITY_PLAYTHROUGH_CONTROL_MISSING');
  total+=a.frames;return {...a};
 });
 if(total>600)throw Error('QUALITY_PLAYTHROUGH_INVALID');return actions;
}
async function read(frame,diagnostics){
 if(frame.isDetached())throw Error('QUALITY_CAPTURE_FRAME_DETACHED');
 const raw=await frame.locator('#game').evaluate(canvas=>({
  state:document.getElementById('status')?.dataset.state,
  tick:Number(canvas.dataset.ticks||0),inputs:Number(canvas.dataset.inputs||0),
  changed:Number(canvas.dataset.changed||0),snapshot:canvas.dataset.snapshot||'[]',
  initial:canvas.dataset.initial||'',paused:canvas.dataset.paused,
  width:canvas.getBoundingClientRect().width
 }));
 if(diagnostics){diagnostics.lastTick=raw.tick;diagnostics.lastState=['idle','loading','playing','won','lost','error'].includes(raw.state)?raw.state:'unknown';diagnostics.paused=raw.paused==='true';diagnostics.reads++;}
 if(raw.state==='error'||!Number.isFinite(raw.tick))throw Error('QUALITY_CAPTURE_RUNTIME_FAILED');
 let commands;try{commands=JSON.parse(raw.snapshot);}catch{throw Error('QUALITY_CAPTURE_RUNTIME_FAILED');}
 return {...raw,sceneHash:digest(JSON.stringify(commands.filter(c=>c.type!=='text')))};
}
async function waitTicks(page,frame,target,diagnostics){
 const limit=Date.now()+Math.min(6000,Math.max(1800,(target-(await read(frame,diagnostics)).tick)*35));
 while(Date.now()<limit){const state=await read(frame,diagnostics);if(state.tick>=target||state.state!=='playing')return state;await page.waitForTimeout(30);}
 throw Error('QUALITY_CAPTURE_STALLED');
}
async function ordinaryInput(page,frame,action,touch,session,diagnostics){
 const before=await read(frame,diagnostics),canvas=frame.locator('#game'),box=await canvas.boundingBox();
 if(!box)throw Error('QUALITY_CAPTURE_CANVAS_MISSING');
 const at=(x,y)=>({x:box.x+x/720*box.width,y:box.y+y/400*box.height});
 const ms=Math.max(90,Math.min(3000,action.frames*1000/60));
 if(action.type==='wait'){await waitTicks(page,frame,Math.min(600,before.tick+action.frames),diagnostics);return;}
 if(action.type==='tap'){
  const point=at(action.x,action.y);
  if(touch){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await page.waitForTimeout(90);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else await page.mouse.click(point.x,point.y,{delay:90});
 }else if(action.type==='drag'){
  const from=at(action.x,action.y),to=at(action.x2,action.y2);
  if(touch)await touchGesture(session,from,to,{steps:12,holdMs:Math.min(180,ms)});
  else{await page.mouse.move(from.x,from.y);await page.mouse.down();try{await page.waitForTimeout(90);await page.mouse.move(to.x,to.y,{steps:12});await page.waitForTimeout(90);}finally{await page.mouse.up();}}
 }else{
  const control=frame.locator('[data-control="'+action.control+'"]'),bounds=await control.boundingBox();
  if(!bounds||bounds.width<44||bounds.height<44)throw Error('QUALITY_CAPTURE_CONTROL_INACCESSIBLE');
  if(touch){
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,id:1}]});
   try{await waitTicks(page,frame,Math.min(600,before.tick+action.frames),diagnostics);}finally{await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  }else{
   await canvas.focus();await page.keyboard.down(keys[action.control]);
   try{await waitTicks(page,frame,Math.min(600,before.tick+action.frames),diagnostics);}finally{await page.keyboard.up(keys[action.control]);}
  }
 }
 await waitTicks(page,frame,Math.min(600,before.tick+action.frames),diagnostics);
 // Let the released pointer reach the real worker before a new action.
 await page.waitForTimeout(40);
}
async function capture(page,frame,device,phase,index,diagnostics){
 const observed=await read(frame,diagnostics);
 const height=await frame.locator('body').evaluate(body=>Math.ceil(body.scrollHeight));
 if(height>1200)throw Error('QUALITY_CAPTURE_LAYOUT_TOO_TALL');
 await page.locator('iframe').evaluate((iframe,height)=>iframe.style.height=height+'px',height);
 const bytes=await page.locator('iframe').screenshot({type:'png',animations:'allow',timeout:4000});
 if(bytes.length>1024*1024)throw Error('QUALITY_CAPTURE_IMAGE_LIMIT');
 return {id:device+'-'+phase+'-'+index,device,phase,tick:observed.tick,
  width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:digest(bytes),data:bytes.toString('base64')};
}
async function captureSession(browser,game,device){
 const touch=device==='tablet',viewport=touch?{width:600,height:1000}:{width:1000,height:1000};
 const context=await browser.newContext({viewport,hasTouch:touch,reducedMotion:'no-preference'}),page=await context.newPage();
 page.setDefaultTimeout(4000);let external=0,consoleErrors=0;
 const diagnostics={device,phase:'setup',actionIndex:-1,lastTick:0,lastState:'unknown',paused:false,reads:0,pageCrashed:false,pageClosed:false,detachedFrames:0,consoleErrors:0,consoleMessages:0,externalRequests:0};
 page.on('crash',()=>{diagnostics.pageCrashed=true;});page.on('close',()=>{diagnostics.pageClosed=true;});page.on('framedetached',()=>diagnostics.detachedFrames++);
 page.on('console',message=>{if(message.type()==='error')diagnostics.consoleMessages++;});
 await context.route('**/*',route=>{external++;return route.abort();});
 page.on('pageerror',()=>consoleErrors++);
 const session=touch?await context.newCDPSession(page):null;
 try{
  const artifact=renderGeneratedV2(game,'quality-capture','quality-capture-channel',{auditTicks:600});
  await page.setContent('<style>body{margin:0;background:#fff}iframe{display:block;width:100%;max-width:720px;height:950px;border:0;margin:0 auto}</style><iframe title="Game quality capture" sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate((iframe,html)=>iframe.srcdoc=html,artifact.html);
  // Bind polling to this exact sandbox frame. Re-resolving a FrameLocator on
  // every 30 ms sample adds a nested selector/context lookup and can silently
  // follow a replacement frame; neither is appropriate for bound evidence.
  const iframe=await page.locator('iframe').elementHandle(),frame=await iframe.contentFrame();
  if(!frame)throw Error('QUALITY_CAPTURE_FRAME_MISSING');
  await page.bringToFront();
  await frame.getByRole('button',{name:'Play!',exact:true}).click();
  await frame.locator('#game[data-snapshot]').waitFor();
  diagnostics.phase='initial';
  const first=await read(frame,diagnostics);if(first.state!=='playing')throw Error('QUALITY_INITIAL_STATE_INVALID');
  const captures=[await capture(page,frame,device,'initial',0,diagnostics)],actionTrace=[];
  const actions=safeActions(game);
  for(let index=0;index<actions.length;index++){
   diagnostics.phase='action';diagnostics.actionIndex=index;
   const before=await read(frame,diagnostics);if(before.state!=='playing'||before.tick>=600)break;
   await ordinaryInput(page,frame,actions[index],touch,session,diagnostics);
   const after=await read(frame,diagnostics);
   actionTrace.push({action:actions[index],index:actionTrace.length,startTick:before.tick,endTick:after.tick,beforeHash:before.sceneHash,afterHash:after.sceneHash});
   if(captures.length===1&&actions[index].type!=='wait'&&before.sceneHash!==after.sceneHash)
    captures.push(await capture(page,frame,device,'interaction',1,diagnostics));
  }
  diagnostics.phase='progress';
  let final=await read(frame,diagnostics);
  while(final.state==='playing'&&final.tick<600){await waitTicks(page,frame,Math.min(600,final.tick+180),diagnostics);final=await read(frame,diagnostics);}
  captures.push(await capture(page,frame,device,final.state==='playing'?'progress':'outcome',captures.length,diagnostics));
  // Independent technical acceptance is required for this exact compiled game.
  // Also check fresh ordinary pause/replay here; no generated callback is trusted.
  diagnostics.phase='replay';await frame.getByRole('button',{name:'Play again',exact:true}).click();
  await frame.locator('#game[data-snapshot]').waitFor();
  const replay=await read(frame,diagnostics);if(replay.initial!==first.initial||replay.state!=='playing')throw Error('QUALITY_REPLAY_FAILED');
  diagnostics.phase='pause';
  await frame.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(80);
  const paused=await read(frame,diagnostics);await page.waitForTimeout(100);const still=await read(frame,diagnostics);
  if(paused.tick!==still.tick||still.paused!=='true')throw Error('QUALITY_PAUSE_FAILED');
  await frame.getByRole('button',{name:'Resume',exact:true}).click();
  await waitTicks(page,frame,Math.min(600,still.tick+3),diagnostics);
  diagnostics.phase='verify';
  const isolated=await frame.locator('body').evaluate(()=>{try{return !parent.document.body;}catch{return true;}});
  const layout=await frame.locator('body').evaluate(body=>({scroll:body.scrollWidth,width:innerWidth,
   controls:[...document.querySelectorAll('[data-control]')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))}));
  if(!isolated||external)throw Error('QUALITY_CAPTURE_ISOLATION_FAILED');
  if(layout.scroll>layout.width+1||layout.controls.some(b=>b.w<44||b.h<44))throw Error('QUALITY_CAPTURE_CONTROL_INACCESSIBLE');
  if(consoleErrors)throw Error('QUALITY_CAPTURE_RUNTIME_FAILED');
  return {captures,session:{device,inputs:final.inputs,visibleChanges:actionTrace.filter(t=>t.action.type!=='wait'&&t.beforeHash!==t.afterHash).length,
   simulatedTicks:final.tick,outcome:final.state,replay:true,pause:true,touch,consoleErrors:0,actionTrace}};
 }catch(error){
  const safeCodes=new Set(['QUALITY_CAPTURE_RUNTIME_FAILED','QUALITY_CAPTURE_STALLED','QUALITY_CAPTURE_FRAME_MISSING','QUALITY_CAPTURE_FRAME_DETACHED','QUALITY_CAPTURE_CANVAS_MISSING','QUALITY_CAPTURE_CONTROL_INACCESSIBLE','QUALITY_CAPTURE_LAYOUT_TOO_TALL','QUALITY_CAPTURE_IMAGE_LIMIT','QUALITY_INITIAL_STATE_INVALID','QUALITY_REPLAY_FAILED','QUALITY_PAUSE_FAILED','QUALITY_CAPTURE_ISOLATION_FAILED','QUALITY_PLAYTHROUGH_INVALID','QUALITY_PLAYTHROUGH_CONTROL_MISSING']);
  const failure=Error(safeCodes.has(error?.message)?error.message:'QUALITY_CAPTURE_BROWSER_FAILED');
  // Counts and trusted phase/state only. Never log child source, console text,
  // exception messages, URLs, artwork bytes or generated drawing commands.
  failure.diagnostics={...diagnostics,consoleErrors,externalRequests:external,browserConnected:browser.isConnected()};throw failure;
 }finally{if(session)await session.detach().catch(()=>{});await context.close();}
}
async function collectQualityEvidence(browser,game){
 if(game.kind!=='generated-module-v2'||!game.compiled)throw Error('QUALITY_CAPTURE_REQUIRES_V2');
 const captures=[],sessions=[];
 for(const device of ['desktop','tablet']){const result=await captureSession(browser,game,device);captures.push(...result.captures);sessions.push(result.session);}
 const c=game.compiled;
 return validateQualityEvidence(game,{version:'game-quality-evidence-v1',motion:'normal',artifactHash:qualityArtifactHash(game),
  sourceHash:c.sourceHash,codeHash:c.codeHash,runtimeVersion:c.runtimeVersion,runtimeHash:c.runtimeHash,captures,sessions});
}
module.exports={collectQualityEvidence,captureSession,safeActions};
