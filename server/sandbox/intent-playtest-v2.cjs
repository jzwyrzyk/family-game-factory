// O5: independently drive the trusted rendered v2 preview against externally
// authored requirements. No source-code self-rating, no direct worker APIs.
// This file supplies a reusable driver; only a separate trusted gateway or
// test harness may provide a validated contract. Arbitrary generated code
// must run in the existing credential-free gVisor worker, never Node/vm.
const {renderGeneratedV2}=require('./preview-v2.cjs');
const {touchGesture}=require('./playtest-v2.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ID=/^[a-z][a-z0-9-]{0,39}$/;
function safePlan(contract){
 if(!contract||contract.version!=='jems-working-game-v1'||
    contract.status!=='authored-unverified-not-release-approved'||
    !Array.isArray(contract.probes)||contract.probes.length<1||contract.probes.length>12||
    !Array.isArray(contract.requirements)||contract.requirements.length<1||contract.requirements.length>12)
  throw Error('INTENT_PLAN_UNTRUSTED');
 for(const p of contract.probes){
  if(!ID.test(p.id)||!Array.isArray(p.actions)||p.actions.length<1||p.actions.length>24||
     !Array.isArray(p.checkpoints)||p.checkpoints.length<1||p.checkpoints.length>26||
     p.deterministicReplay!==true)throw Error('INTENT_PLAN_UNTRUSTED');
 }
}
async function read(frame){
 return frame.locator('#game').evaluate(canvas=>{
  const state=document.getElementById('status')?.dataset.state;
  const data=canvas.dataset;
  let commands=[];
  try{commands=JSON.parse(data.snapshot||'[]');}catch{}
  return {status:state,commands,frames:Number(data.frames||0),ticks:Number(data.ticks||0),
   bodies:Number(data.bodies||0),joints:Number(data.joints||0),
   inputs:Number(data.inputs||0),paused:data.paused,initial:data.initial||''};
 });
}
function visibleCommand(c){
 if(!c||typeof c.x!=='number'||typeof c.y!=='number')return false;
 // The test must reject an off-canvas key that only claims to be visible.
 const w=c.width||c.radius*2||1,h=c.height||c.radius*2||1;
 return c.x+w>0&&c.x-w<720&&c.y+h>0&&c.y-h<400;
}
function matches(frame,initial,check){
 if(frame.status!==check.outcome)return false;
 for(const item of check.observations){
  if(item.kind==='world'){
   const n=frame[item.metric];
   if(!(item.operator==='eq'?n===item.value:n>=item.value))return false;
   continue;
  }
  const c=frame.commands.find(x=>x.key===item.key);
  if(item.kind==='hidden'){if(c&&visibleCommand(c))return false;continue;}
  if(!visibleCommand(c))return false;
  if(item.kind==='visible')continue;
  const coordinate=c[item.axis];
  if(typeof coordinate!=='number'||!Number.isFinite(coordinate))return false;
  if(item.kind==='coordinate'&&!(item.operator==='lt'?coordinate<item.value:coordinate>item.value))return false;
  if(item.kind==='changed'){
   const start=initial.commands.find(x=>x.key===item.key);
   if(!start||typeof start[item.axis]!=='number'||
      Math.abs(coordinate-start[item.axis])<item.minDelta)return false;
  }
 }
 return true;
}
async function checkpoint(frame,initial,check,probeId,index,timeout=1400){
 const end=Date.now()+timeout;
 let last;
 while(Date.now()<end){
  last=await read(frame);
  if(last.status==='error')throw Error('INTENT_PREVIEW_RUNTIME_FAILED');
  if(matches(last,initial,check))return last;
  await wait(45);
 }
 throw Error('INTENT_PLAYTEST_FAILED:'+probeId+':'+index);
}
const P={left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',action:'Space'};
const absolute=(box,p)=>({
 x:box.x+p.x/720*box.width,y:box.y+p.y/400*box.height
});
async function perform(page,frame,action,touch,session){
 const box=await frame.locator('#game').boundingBox();
 if(!box)throw Error('INTENT_GAME_CANVAS_MISSING');
 if(action.kind==='wait'){
  await page.waitForTimeout(Math.ceil(action.frames*1000/60));
  return;
 }
 if(action.kind==='tap'){
  const point=absolute(box,action.at);
  if(touch){
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
   await wait(90);
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await page.mouse.click(point.x,point.y,{delay:90});
  }
  await wait(90);return;
 }
 if(action.kind==='drag'){
  const from=absolute(box,action.from),to=absolute(box,action.to);
  if(touch)await touchGesture(session,from,to,{steps:16,holdMs:160});
  else{
   await page.mouse.move(from.x,from.y);
   await page.mouse.down();await wait(110);
   await page.mouse.move(to.x,to.y,{steps:16});await wait(110);
   await page.mouse.up();
  }
  await wait(110);return;
 }
 const control=frame.locator('[data-control="'+action.button+'"]');
 if(await control.count()!==1)throw Error('INTENT_CONTROL_MISSING');
 if(action.kind==='press'){
  if(touch)await control.tap();else await control.click({delay:90});
  await wait(95);
  return;
 }
 if(action.kind==='hold'){
  const target=await control.boundingBox();
  if(!target)throw Error('INTENT_CONTROL_MISSING');
  const x=target.x+target.width/2,y=target.y+target.height/2;
  if(touch){
   await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   await wait(Math.ceil(action.frames*1000/60));
   await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
   await page.mouse.move(x,y);await page.mouse.down();
   await wait(Math.ceil(action.frames*1000/60));
   await page.mouse.up();
  }
  await wait(100);return;
 }
 throw Error('INTENT_ACTION_UNSUPPORTED');
}
/**
 * Return only a bounded aggregate, no child text, screenshots, source or
 * provider response. A missing independently authored spec is NOT a pass.
 * Running arbitrary source outside the approved private sandbox is forbidden.
 */
async function playtestIntentV2(page,game,contract,options={}){
 if(!contract)return {status:'not-tested',reason:'NO_TRUSTED_EXPECTATIONS',passed:0,failed:0};
 safePlan(contract);
 if(!game?.compiled||game.kind!=='generated-module-v2')throw Error('INTENT_GAME_FORMAT_UNSUPPORTED');
 const touch=options.touch===true;
 const artifact=renderGeneratedV2(game,'intent-test','intent-test-channel',{auditTicks:600});
 let external=0;
 const context=page.context();
 await context.route('**/*',route=>{external++;return route.abort();});
 const session=touch?await context.newCDPSession(page):null;
 try{
  await page.setContent('<button id="outside">App remains accessible</button><iframe title="Isolated preview" sandbox="allow-scripts" style="width:100%;height:760px;border:0"></iframe>');
  await page.locator('iframe').evaluate((el,html)=>{el.srcdoc=html;},artifact.html);
  const frame=page.frameLocator('iframe');
  let passed=0;
  for(const probe of contract.probes){
   const begin=passed===0?'Play!':'Play again';
   await (touch?frame.getByRole('button',{name:begin,exact:true}).tap():frame.getByRole('button',{name:begin,exact:true}).click());
   await frame.locator('#game[data-snapshot]').waitFor({timeout:4000});
   const start=await read(frame);
   if(start.status!=='playing')throw Error('INTENT_INITIAL_STATE_INVALID');
   const checkpoints=new Map(probe.checkpoints.map((cp,index)=>[cp.after,{cp,index}]));
   const initial=checkpoints.get(0);
   if(initial)await checkpoint(frame,start,initial.cp,probe.id,initial.index,1000);
   for(let i=0;i<probe.actions.length;i++){
    await perform(page,frame,probe.actions[i],touch,session);
    const expected=checkpoints.get(i+1);
    if(expected)await checkpoint(frame,start,expected.cp,probe.id,expected.index);
   }
   passed++;
  }
  // Host origin isolation must remain true even when a contract passes.
  const isolation=await frame.locator('body').evaluate(()=>{
   try{return !!parent.document.body;}catch{return false;}
  });
  if(isolation||external)throw Error('INTENT_PREVIEW_ISOLATION_FAILED');
  return {status:'pass',method:'independent-rendered-input-and-outcome',
   passed,failed:0,sourceSha256:contract.sourceSha256};
 }finally{
  if(session)await session.detach().catch(()=>{});
  await context.unroute('**/*');
 }
}
module.exports={playtestIntentV2};
