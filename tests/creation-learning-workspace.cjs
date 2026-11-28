const assert = require('node:assert/strict');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

/** A local supported scene file goes through its real import, playback and
 * checkpoint. The fixture doesn't write learning progress or award a receipt. */
async function run() {
  const server = start();
  if (!server.listening) await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
    for (const viewport of [{width: 844, height: 390}, {width: 1024, height: 768}]) {
      const page = await browser.newPage({viewport,hasTouch:true});
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?creation=1`);
        await page.locator('#creationIntroSkip').click();
        const project = {schema:'jems.creation.v1',id:'source',title:'Garden',width:800,height:450,background:'meadow',
          actors:[{id:'gem',name:'Gem',assetId:'gem',x:400,y:225,size:90}],
          programs:[{id:'start',actorId:'gem',trigger:{type:'start'},actions:[]}],variables:{}};
        await page.locator('#creationImport').setInputFiles({name:'garden.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(()=>window.FG?.creation.scene()?.title==='Garden');
        const scene = await page.evaluate(()=>FG.creation.scene());
        assert.notEqual(scene.id,project.id);
        const playView=page.locator('#creationPlayView');
        if(await playView.isVisible()) await playView.tap();
        if (viewport.width===1024) {
          await page.locator('#creationFullscreen').tap();
          await page.waitForFunction(()=>document.fullscreenElement?.id==='page-creation');
        }
        const startPlay=page.locator('#creationRun');
        await startPlay.tap();
        const dialog=page.locator('#creationLearning:modal');
        await dialog.waitFor();
        assert.equal(await dialog.locator('.workspace-question').evaluate(title=>title===document.activeElement),true);
        const width=(await dialog.boundingBox()).width;
        assert.ok(width>=viewport.width*.94,`workspace has full usable width (${width} of ${viewport.width})`);
        await page.keyboard.press('Escape');
        const attemptId=await page.evaluate(()=>FG.learning.activeAttemptId);
        assert.ok(attemptId);
        assert.equal(await dialog.locator('[data-learning-theme="jems"]').count(),1);
        await dialog.locator('[data-action="show-solution"]').tap();
        await dialog.locator('[data-action="continue-supported"]').tap();
        await page.waitForFunction(()=>!FG.learning.active && !document.querySelector('#creationLearning').open);
        assert.equal(await startPlay.evaluate(button=>button===document.activeElement),true);
        assert.deepEqual(await page.evaluate(()=>FG.creation.scene()),scene);
        const attempt=await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id),attemptId);
        assert.equal(attempt.outcome,'shown');
        assert.equal(attempt.independent,false);
        assert.equal(attempt.context.gameId,'creation');
        assert.equal(attempt.context.projectId,scene.id);
        // Force only the existing time budget due again to exercise the exit.
        await page.evaluate(()=>{ FG.store.current().mathWindow=[]; FG.store.save(); });
        await startPlay.tap();
        await dialog.waitFor();
        const exitAttempt=await page.evaluate(()=>FG.learning.activeAttemptId);
        await dialog.locator('[data-action="leave-game"]').tap();
        await page.waitForFunction(()=>!FG.learning.active && !document.querySelector('#creationLearning').open);
        assert.equal(await page.evaluate(id=>FG.store.current().learning.attempts.find(a=>a.id===id)?.outcome,exitAttempt),'interrupted');
        console.log(`PASS imported scene ${viewport.width}×${viewport.height}: fitted checkpoint, modal focus, supported return and saved evidence`);
      } finally { await page.close(); }
    }
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
