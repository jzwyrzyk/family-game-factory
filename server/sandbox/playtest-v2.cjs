// Trusted, independent browser probe. Generated source supplies neither tests nor win callbacks.
const {renderGeneratedV2}=require('./preview-v2.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function completed(frame,timeout=4500){
 const end=Date.now()+timeout;
 while(Date.now()<end){const state=await frame.locator('#status').getAttribute('data-state');if(state==='error')throw Error('RUNTIME_FAILED');if(await frame.locator('#game').getAttribute('data-audit-complete')==='true')return;await pause(40);}
 throw Error('NO_STABLE_SIMULATION');
}
async function snapshot(frame){return {commands:await frame.locator('#game').getAttribute('data-snapshot'),state:await frame.locator('#status').getAttribute('data-state'),score:await frame.locator('#score').textContent()};}
async function touchGesture(session,start,end,{steps=8,holdMs=35,cancel=false}={}){
 const point=(x,y)=>({x,y,id:1,radiusX:5,radiusY:5});await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(start.x,start.y)]});await pause(25);
 for(let i=1;i<=steps;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(start.x+(end.x-start.x)*i/steps,start.y+(end.y-start.y)*i/steps)]});await pause(5);}
 await pause(holdMs);await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
}
async function playtestV2(page,game,options={}){
 const touch=options.touch?await page.context().newCDPSession(page):null,activate=locator=>options.touch?locator.tap():locator.click();
 try{
 const artifact=renderGeneratedV2(game,'sandbox-test','sandbox-channel',{auditTicks:120});
 await page.setContent('<iframe title="Isolated preview" sandbox="allow-scripts" style="width:100%;height:760px;border:0"></iframe>');
 await page.locator('iframe').evaluate((el,html)=>el.srcdoc=html,artifact.html);
 const frame=page.frameLocator('iframe'),canvas=frame.locator('#game');
 await activate(frame.getByRole('button',{name:'Play!',exact:true}));
 await completed(frame);const idle=await snapshot(frame),initial=await canvas.getAttribute('data-initial');
 // Replay is a fresh worker and fresh world. Exercise ordinary UI controls at the same 120 fixed ticks.
 await activate(frame.getByRole('button',{name:'Play again',exact:true}));
 await canvas.locator(':scope[data-frames]').waitFor({timeout:3000});
 for(let i=0;i<20;i++){
  if(await canvas.getAttribute('data-audit-complete')==='true')break;
  if(await frame.locator('#status').getAttribute('data-state')==='error')throw Error('RUNTIME_FAILED');
  const controls=frame.locator('[data-control]'),count=await controls.count();if(count)await activate(controls.nth(i%count));
  if(await canvas.getAttribute('data-audit-complete')==='true')break;
  const commands=JSON.parse(await canvas.getAttribute('data-snapshot')||'[]'),camera=JSON.parse(await canvas.getAttribute('data-camera')||'{"x":0,"y":0,"zoom":1}');
  const sprites=commands.filter(c=>c.type==='sprite'&&c.width<250&&c.height<250),item=sprites[i%Math.max(1,sprites.length)];
  const x=item?(item.x-camera.x)*camera.zoom:80+(i*53)%520,y=item?(item.y-camera.y)*camera.zoom:70+(i*31)%230,box=await canvas.boundingBox();
  if(box){const start={x:box.x+Math.max(10,Math.min(710,x))/720*box.width,y:box.y+Math.max(10,Math.min(390,y))/400*box.height},end={x:Math.min(box.x+box.width-8,start.x+45),y:Math.max(box.y+8,start.y-30)};if(touch)await touchGesture(touch,start,end);else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.waitForTimeout(35);await page.mouse.up();}}
  await page.waitForTimeout(45);
 }
 await completed(frame);const active=await snapshot(frame);
 const scene=frame=>JSON.stringify(JSON.parse(frame.commands||'[]').filter(command=>command.type!=='text'));
 // Generic random taps can miss a valid drag/grid mechanic entirely.
 // Only a SEPARATE, already-passed, source-bound independent intent probe may
 // replace the exploratory input-effect heuristic. Never bypass actual
 // resource, pause/replay, isolation, responsive layout or worker checks.
 if(!options.independentIntentProof){
  if(scene(idle)===scene(active))throw Error('NO_MEANINGFUL_INPUT_EFFECT');
  if(Number(await canvas.getAttribute('data-inputs'))<1||Number(await canvas.getAttribute('data-changed'))<2)
   throw Error('NO_VISIBLE_GAMEPLAY_CHANGE');
 }
 if(!['playing','won','lost'].includes(active.state))throw Error('INVALID_GAMEPLAY_OUTCOME');
 const bodyCount=Number(await canvas.getAttribute('data-bodies')),jointCount=Number(await canvas.getAttribute('data-joints'));if(bodyCount>40||jointCount>60)throw Error('RESOURCE_LIMIT');
 await activate(frame.getByRole('button',{name:'Play again',exact:true}));await canvas.locator(':scope[data-frames]').waitFor({timeout:3000});
 if(await frame.locator('#status').getAttribute('data-state')!=='playing'||await canvas.getAttribute('data-initial')!==initial)throw Error('REPLAY_DID_NOT_RESET');
 await activate(frame.getByRole('button',{name:'Pause',exact:true}));await page.waitForTimeout(100);const pausedTicks=await canvas.getAttribute('data-ticks');await page.waitForTimeout(160);
 if(await canvas.getAttribute('data-ticks')!==pausedTicks||await canvas.getAttribute('data-paused')!=='true')throw Error('PAUSE_DID_NOT_STOP');
 await activate(frame.getByRole('button',{name:'Resume',exact:true}));await page.waitForTimeout(150);const resumed=Number(await canvas.getAttribute('data-ticks'))-Number(pausedTicks);if(resumed<1||resumed>16)throw Error('RESUME_CATCHUP');
 const accessible=await frame.locator('body').evaluate(()=>{try{return !!parent.document.body}catch{return false}});if(accessible)throw Error('ISOLATION_FAILED');
 const bounds=await canvas.boundingBox();if(!bounds||bounds.width>page.viewportSize().width)throw Error('RESPONSIVE_LAYOUT_FAILED');
 return {input:true,resources:true,pause:true,replay:true,isolation:true};
 }finally{if(touch)await touch.detach();}
}
module.exports={playtestV2,touchGesture};
