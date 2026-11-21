/* Isolated handoff component: no model, remote job, player data or paid service. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = `
import {createBuildHandoff} from './src/studio/build-handoff';
import './src/brand/art-library.css';
window.handoffActions=[];
window.handoffScope={ownerId:'player1',sessionId:'idea1',learning:false};
const handoff=createBuildHandoff({
  isCurrent:identity=>identity.ownerId===window.handoffScope.ownerId&&identity.sessionId===window.handoffScope.sessionId&&!window.handoffScope.learning,
  onPlayWhileWaiting:identity=>window.handoffActions.push(['wait',identity]),
  onPlayReady:identity=>window.handoffActions.push(['ready',identity]),
  onStay:()=>document.getElementById('idea').focus({preventScroll:true}),
});
window.handoff=handoff;
window.beginHandoff=(attemptId,state={phase:'sending'})=>handoff.begin({ownerId:'player1',sessionId:'idea1',attemptId},state);
window.updateHandoff=(attemptId,state)=>handoff.update({ownerId:'player1',sessionId:'idea1',attemptId},state);
document.getElementById('build').onclick=()=>window.beginHandoff('first');
`;

(async () => {
  const bundle = await build({absWorkingDir:root,stdin:{contents:fixture,resolveDir:root,sourcefile:'build-handoff-fixture.ts'},bundle:true,format:'iife',outdir:'build-handoff-fixture',write:false,external:['/fonts/*','/jems-art/*']});
  const js = bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const css = bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/arcade/"><title>Build handoff fixture</title><link rel="stylesheet" href="./bundle.css"><style>body{margin:0;background:#faf7ff;font-family:system-ui;overflow:auto}main{padding:24px}button{min-height:48px;padding:12px 20px}h1{font-size:28px}</style></head><body style="overflow:auto"><main><h1>Your game idea</h1><button id="build">Build my game</button><button id="other">Keep thinking</button><input id="idea" aria-label="Your idea"></main><script src="./bundle.js"></script></body></html>';
  const mime={'.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
  const server = http.createServer((request,response)=>{
    const pathname = new URL(request.url,'http://localhost').pathname;
    if(pathname==='/arcade/') {response.setHeader('content-type','text/html');response.end(html);return;}
    if(pathname==='/arcade/bundle.js') {response.setHeader('content-type','application/javascript');response.end(js);return;}
    if(pathname==='/arcade/bundle.css') {response.setHeader('content-type','text/css');response.end(css);return;}
    const file=path.resolve(root,'public',pathname.replace(/^\/arcade\//,''));
    if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) {response.writeHead(404);response.end();return;}
    response.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));
  });
  let browser;
  try {
    server.listen(0,'127.0.0.1');await once(server,'listening');
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
    for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}],['small-phone',{width:320,height:568}]]) {
      const context=await browser.newContext({viewport,reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
      await page.waitForFunction(()=>!!window.handoff);
      const dialog=page.locator('#studioBuildHandoff'),play=page.locator('#studioBuildHandoffPlay'),stay=page.locator('#studioBuildHandoffStay');
      await page.locator('#build').click();
      assert.equal(await dialog.isVisible(),true,'Build immediately opens its own handoff');
      assert.equal(await play.isDisabled(),true,'submission is not an accepted build');
      assert.equal(await stay.isEnabled(),true,'the child can leave during submission');
      assert.match(await page.locator('#studioBuildHandoffDescription').innerText(),/Sending your idea/);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'studioBuildHandoffTitle');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'studioBuildHandoffStay','keyboard reaches the only enabled action');
      await page.evaluate(()=>window.updateHandoff('first',{phase:'queued',canPlayWhileWaiting:true}));
      assert.equal(await play.isEnabled(),true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'studioBuildHandoffStay','acceptance preserves focus');
      assert.equal(await play.innerText(),'Play while I wait');
      await play.focus();
      await page.evaluate(()=>window.updateHandoff('first',{phase:'testing',canPlayWhileWaiting:true}));
      assert.equal(await page.evaluate(()=>document.activeElement.id),'studioBuildHandoffPlay','polling preserves the action focus');
      await page.locator('.studio-handoff-art img').evaluate(image=>image.decode());
      assert.equal(await page.locator('.studio-handoff-art img').evaluate(image=>getComputedStyle(image).animationName),'none','reduced motion is respected');
      const geometry=await dialog.evaluate(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};});
      assert.ok(geometry.left>=0&&geometry.right<=geometry.width&&geometry.top>=0&&geometry.bottom<=geometry.height,'the complete handoff fits '+device);
      assert.ok(geometry.scrollWidth<=geometry.width,'the dialog does not cause page overflow');
      const sizes=await dialog.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.hidden).map(button=>({height:button.getBoundingClientRect().height,text:parseFloat(getComputedStyle(button).fontSize)})));
      assert.ok(sizes.every(size=>size.height>=48&&size.text>=18),'child-readable targets on '+device);
      fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
      await page.screenshot({path:path.join(root,`test-results/build-handoff-${device}.png`)});
      await play.click();
      assert.equal(await dialog.isVisible(),false);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto','closing restores the prior scroll state');
      assert.deepEqual(await page.evaluate(()=>window.handoffActions),[['wait',{ownerId:'player1',sessionId:'idea1',attemptId:'first'}]]);
      await page.locator('#other').focus();
      await page.evaluate(()=>{window.updateHandoff('first',{phase:'ready',canPlayReady:true});window.beginHandoff('first',{phase:'ready',canPlayReady:true});});
      assert.equal(await dialog.isVisible(),false,'a ready poll and duplicate begin never reopen a dismissed handoff');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'other','background readiness cannot seize focus');
      await page.evaluate(()=>window.beginHandoff('second',{phase:'ready'}));
      assert.equal(await play.isDisabled(),true,'remote Ready is not enough without a saved candidate');
      assert.equal(await page.locator('#studioBuildHandoffTitle').innerText(),'Saving your game…');
      await page.evaluate(()=>window.updateHandoff('second',{phase:'ready',canPlayReady:true}));
      assert.equal(await play.innerText(),'Play my game');
      await play.click();
      assert.equal(await page.evaluate(()=>window.handoffActions.at(-1)[0]),'ready','ready play remains explicit');

      // Unknown outcomes never grow a retry button or a fake accepted-job claim.
      await page.evaluate(()=>{document.getElementById('build').focus();window.beginHandoff('uncertain',{phase:'uncertain'});document.getElementById('build').disabled=true;});
      assert.equal(await play.isVisible(),false);
      assert.match(await page.locator('#studioBuildHandoffDescription').innerText(),/might still be building/);
      await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'idea','explicit dismissal restores a useful target even when the Build trigger is disabled');
      await page.evaluate(()=>document.getElementById('build').disabled=false);
      await page.evaluate(()=>window.beginHandoff('unavailable',{phase:'unavailable',canPlayWhileWaiting:true}));
      assert.equal(await play.isVisible(),false,'unavailable is never an accepted wait arcade');
      await stay.click();

      // Stale owners, attempts and learning checkpoints cannot operate the popup.
      await page.evaluate(()=>window.beginHandoff('third',{phase:'building',canPlayWhileWaiting:true}));
      await page.evaluate(()=>window.updateHandoff('first',{phase:'failed'}));
      assert.equal(await dialog.getAttribute('data-phase'),'building','old attempt cannot overwrite current status');
      await page.evaluate(()=>{window.handoffScope.ownerId='player2';document.getElementById('studioBuildHandoffPlay').click();});
      assert.equal(await dialog.isVisible(),false);
      assert.equal(await page.evaluate(()=>window.handoffActions.length),2,'stale action cannot play another owner’s game');
      await page.evaluate(()=>{window.handoffScope.ownerId='player1';window.handoffScope.learning=true;window.beginHandoff('blocked');});
      assert.equal(await dialog.isVisible(),false,'required learning prevents opening');
      await page.evaluate(()=>{window.handoffScope.learning=false;window.beginHandoff('fourth');window.beginHandoff('fifth',{phase:'building',canPlayWhileWaiting:true});});
      await page.waitForTimeout(30);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','an earlier queued close event cannot unlock the newer dialog');
      await play.focus();
      await page.evaluate(()=>window.updateHandoff('fifth',{phase:'failed'}));
      assert.equal(await page.evaluate(()=>document.activeElement.id),'studioBuildHandoffStay','a removed play action leaves a useful focus target');
      await page.evaluate(()=>window.handoff.dispose());
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto');
      assert.equal(await dialog.count(),0);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('PASS build handoff '+device+': truthful phases, explicit play, focus/owner/learning guards, dismissal and responsive readable controls');
    }
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
