import assert from 'node:assert/strict';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium,type Page} from 'playwright';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {makeRasterAsset} from '../server/agent/game-assets';
import {hash,type GeneratedGame} from '../server/agent/generated';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {transformSync} from 'esbuild';
import {pixelGame,illustratedGame,compileArtFixture,undecodableWebP} from './generated-art-fixtures';

// These reviewed source fixtures exercise the actual archived browser/worker, never a model key.
async function load(page:Page,game:GeneratedGame,alreadyCompiled=false){
 const artifact=renderGeneratedV2(alreadyCompiled?game:compileArtFixture(game),'art-fixture','art-channel',{auditTicks:600});
 const marker=artifact.html.lastIndexOf('FactoryClient.startClient('),tail=artifact.html.slice(marker+'FactoryClient.startClient('.length),config=JSON.parse(tail.slice(0,tail.indexOf(');</script>')));
 for(const asset of game.assets?.assets||[])assert.ok(!config.worker.includes(asset.data),'raster bytes never enter the generated worker');
 await page.setContent('<button id="parent">Parent remains usable</button><iframe title="Art preview" sandbox="allow-scripts" style="width:100%;height:850px;border:0"></iframe>');
 await page.locator('iframe').evaluate((el,html)=>(el as HTMLIFrameElement).srcdoc=html,artifact.html);
 return page.frameLocator('iframe');
}
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  for(const [device,viewport]of [['desktop',{width:1100,height:900}],['tablet',{width:820,height:1180}],['phone',{width:390,height:844}]] as const){
   const context=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'no-preference'}),page=await context.newPage();let requests=0;
   await context.route('**/*',route=>{requests++;return route.abort();});
   try{
    let frame=await load(page,pixelGame());
    await frame.locator('#game[data-assets-ready=true]').waitFor();await frame.getByRole('button',{name:'Play!',exact:true}).click();await frame.locator('#game[data-frames]').waitFor();await page.waitForTimeout(60);
    const colors=await frame.locator('#game').evaluate(el=>{const ctx=(el as HTMLCanvasElement).getContext('2d')!;return [Array.from(ctx.getImageData(179,180,1,1).data),Array.from(ctx.getImageData(180,180,1,1).data)];});
    assert.deepEqual(colors,[[255,0,0,255],[0,0,255,255]],'pixel-art boundary remains crisp at actual canvas pixels');
    const position=async()=>JSON.parse(await frame.locator('#game').getAttribute('data-snapshot')||'[]').find((c:any)=>c.key==='tile').x;
    const before=await position();await page.keyboard.down('ArrowRight');await page.waitForTimeout(160);await page.keyboard.up('ArrowRight');assert.ok(await position()>before+10,'approved image responds to real keyboard input');
    await frame.getByRole('button',{name:'Pause',exact:true}).click();const paused=await position();await page.waitForTimeout(160);assert.equal(await position(),paused);await frame.getByRole('button',{name:'Resume',exact:true}).click();
    assert.equal(await frame.locator('body').evaluate(()=>{try{return !!parent.document.body}catch{return false}}),false);
    assert.ok((await frame.locator('#game').boundingBox())!.width<=viewport.width);
    frame=await load(page,illustratedGame());await frame.locator('#game[data-assets-ready=true]').waitFor();await frame.getByRole('button',{name:'Play!',exact:true}).click();await frame.locator('#game[data-frames]').waitFor();await page.waitForTimeout(100);
    const initial=JSON.parse(await frame.locator('#game').getAttribute('data-snapshot')||'[]'),helperBefore=initial.find((c:any)=>c.key==='helper').x;
    if(device==='desktop'){await page.keyboard.down('ArrowRight');await page.waitForTimeout(180);await page.keyboard.up('ArrowRight');}
    else{const button=frame.locator('[data-control=right]'),box=(await button.boundingBox())!,touch=await context.newCDPSession(page);try{await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1,radiusX:5,radiusY:5}]});await page.waitForTimeout(180);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await touch.detach();}}
    const active=JSON.parse(await frame.locator('#game').getAttribute('data-snapshot')||'[]');assert.ok(active.find((c:any)=>c.key==='helper').x>helperBefore+10,'illustrated actor moves independently above its scenery');assert.deepEqual(active.find((c:any)=>c.key==='room'),initial.find((c:any)=>c.key==='room'));
    mkdirSync('test-results/generated-art',{recursive:true});await page.locator('iframe').screenshot({path:`test-results/generated-art/${device}-illustrated.png`});
    await frame.getByRole('button',{name:'Play again',exact:true}).click();await page.waitForTimeout(70);assert.equal(JSON.parse(await frame.locator('#game').getAttribute('data-snapshot')||'[]').find((c:any)=>c.key==='helper').x,150,'replay resets live actors and retains exact artwork');
    assert.equal(requests,0,'artwork makes no external requests');
    console.log(`PASS art browser ${device}: crisp pixel rendering, illustrated layers, ordinary input, pause/replay, bounded layout, no network or parent access.`);
   }finally{await context.close();}
  }
  const context=await browser.newContext(),page=await context.newPage();let requests=0;await context.route('**/*',route=>{requests++;return route.abort();});
  try{
   const bad={...pixelGame(),assets:{version:'game-assets-v1' as const,style:'pixel' as const,assets:[makeRasterAsset({id:'twoColors',role:'actor',mime:'image/webp',bytes:undecodableWebP(),sampling:'pixelated',provenance:{kind:'approved-library',sourceId:'corrupt-decode-fixture'}})]}};
   let frame=await load(page,bad);await frame.locator('#status[data-state=error]').waitFor();assert.equal(await frame.getByRole('button',{name:'Play!',exact:true}).isDisabled(),true,'invalid raster decode fails before play');assert.equal(await frame.locator('#game').getAttribute('data-frames'),null);
   frame=await load(page,{...pixelGame(),source:pixelGame().source.replace("assetId:'twoColors'","assetId:'notApproved'")});await frame.locator('#game[data-assets-ready=true]').waitFor();await frame.getByRole('button',{name:'Play!',exact:true}).click();await frame.locator('#status[data-state=error]').waitFor();
   // A saved v2.0.3 game retains its original archive and primitive renderer.
   const old=runtimeBundle('quality-runtime-v2.0.3'),source=`export function createGame(){return {init:()=>({}),step:s=>s,draw:()=>[{type:'circle',key:'old',x:100,y:100,radius:20,color:'#ea698f'}],outcome:()=>({status:'playing',score:0})};}`,code=transformSync(source,{loader:'ts',format:'iife',globalName:'GameModule'}).code;
   const legacy:GeneratedGame={kind:'generated-module-v2',title:'Saved game',instructions:'Your original game still plays.',controls:[],source,compiled:{code,sourceHash:hash(source),codeHash:hash(code),runtimeVersion:old.version,runtimeHash:old.hash,tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}}};
   frame=await load(page,legacy,true);await frame.getByRole('button',{name:'Play!',exact:true}).click();await frame.locator('#game[data-frames]').waitFor();assert.equal(await frame.locator('#status').getAttribute('data-state'),'playing');assert.equal(requests,0);
   console.log('PASS art browser negatives: decode failures block Play, unknown IDs stop safely, old saved runtime plays unchanged.');
  }finally{await context.close();}
 }finally{await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
