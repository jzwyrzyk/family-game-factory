import assert from 'node:assert/strict';
import type {Browser,FrameLocator,Locator} from 'playwright';
import {transformSync} from 'esbuild';
import {hopper} from '../server/testing/generated-fixtures';
import {hash} from '../server/agent/generated';
import {renderGenerated} from '../server/sandbox/preview.cjs';

/** Browser regression for the precise v1 gate race, using the unchanged authored fixture. */
export async function verifyV1InputOrdering(browser:Browser){
 const context=await browser.newContext({viewport:{width:1000,height:1000}}),page=await context.newPage();
 try{
  const time=new Date('2026-01-01T00:00:00Z');
  await page.clock.install({time});await page.clock.pauseAt(new Date(time.getTime()+1000));
  const code=transformSync(hopper.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
  const game={...hopper,compiled:{code,sourceHash:hash(hopper.source),codeHash:hash(code),tests:{desktop:true,mobile:true,replay:true,isolation:true}}};
  await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:900px;border:0"></iframe>');
  await page.locator('iframe').evaluate((el,html)=>(el as HTMLIFrameElement).srcdoc=html,renderGenerated(game,'v1-input-fixture','v1-input-channel').html);
  const frame=page.frameLocator('iframe'),canvas=frame.locator('#game'),action=frame.locator('[data-control="action"]');
  // Force skips animation-based actionability while the clock is deliberately
  // frozen; Playwright still dispatches ordinary pointer/mouse input events.
  await frame.getByRole('button',{name:'Play!',exact:true}).click({force:true});
  await waitFrames(frame,canvas,1);
  let baseline=Number(await canvas.getAttribute('data-frames'));
  await action.click({force:true});await canvas.click({force:true,position:{x:80,y:60}});
  await page.clock.runFor(100);await waitFrames(frame,canvas,baseline+2);
  assert.equal(await frame.locator('#score').textContent(),'Score: 0','click then immediate canvas movement loses the unsampled control pulse');
  assert.equal(await frame.locator('#status').getAttribute('data-state'),'playing');
  // Let the old failed click's 120 ms cleanup expire before the independent held gesture.
  baseline=Number(await canvas.getAttribute('data-frames'));await page.clock.runFor(50);await waitFrames(frame,canvas,baseline+1);

  // Observe the same two 50 ms samples while the pointer stays down on Action.
  baseline=Number(await canvas.getAttribute('data-frames'));
  await action.hover({force:true});const bounds=await action.boundingBox();assert.ok(bounds);await page.mouse.down();
  try{await page.clock.runFor(100);await waitFrames(frame,canvas,baseline+2);}finally{try{await page.mouse.move(bounds.x+bounds.width+2,bounds.y+bounds.height/2);}finally{await page.mouse.up();}}
  assert.equal(await frame.locator('#score').textContent(),'Score: 2');
  baseline=Number(await canvas.getAttribute('data-frames'));
  await canvas.click({force:true,position:{x:80,y:60}});await page.clock.runFor(50);await waitFrames(frame,canvas,baseline+1);
  assert.equal(await frame.locator('#score').textContent(),'Score: 2','pointerleave after held samples only clears subsequent input');
  baseline=Number(await canvas.getAttribute('data-frames'));
  await action.hover({force:true});await page.mouse.down();
  try{await page.clock.runFor(50);await waitFrames(frame,canvas,baseline+1);}finally{try{await page.mouse.move(bounds.x+bounds.width+2,bounds.y+bounds.height/2);}finally{await page.mouse.up();}}
  assert.equal(await frame.locator('#status').getAttribute('data-state'),'won');
  console.log('PASS v1 gate input regression: ordinary held controls reach simulation before canvas pointerleave; no injected win or runtime change');
 }finally{await context.close();}
}

async function waitFrames(frame:FrameLocator,canvas:Locator,minimum:number){
 const deadline=Date.now()+3000;
 while(Date.now()<deadline){
  const state=await frame.locator('#status').getAttribute('data-state');
  if(state==='error'||state==='lost')throw Error('V1_INPUT_REGRESSION_'+state.toUpperCase());
  if(Number(await canvas.getAttribute('data-frames'))>=minimum)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('V1_INPUT_REGRESSION_FRAME_TIMEOUT');
}
