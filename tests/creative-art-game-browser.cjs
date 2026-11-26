/* Synthetic local game fixture. Build the dedicated creative-art-review mode first. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');

async function createFixture(page) {
  // A deliberately irregular ink outline, translucent body and asymmetric feet
  // make changes to appearance visible in the browser capture.
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 174; canvas.height = 138;
    const pen = canvas.getContext('2d');
    pen.lineWidth = 6; pen.lineJoin = 'round'; pen.lineCap = 'round';
    pen.strokeStyle = '#41364d'; pen.fillStyle = '#ffacd1';
    pen.beginPath(); pen.moveTo(19, 99); pen.lineTo(13, 70); pen.lineTo(30, 64);
    pen.lineTo(37, 31); pen.lineTo(59, 44); pen.lineTo(78, 24); pen.lineTo(94, 37);
    pen.lineTo(130, 27); pen.lineTo(125, 52); pen.lineTo(151, 64);
    pen.lineTo(158, 84); pen.lineTo(137, 100); pen.lineTo(107, 105);
    pen.lineTo(91, 113); pen.lineTo(56, 109); pen.closePath(); pen.fill(); pen.stroke();
    for (const [x, y] of [[61,65],[107,63]]) {
      pen.beginPath(); pen.arc(x, y, 5, 0, Math.PI*2); pen.fillStyle = '#41364d'; pen.fill();
    }
    pen.beginPath(); pen.moveTo(73,81); pen.quadraticCurveTo(83,92,95,77); pen.stroke();
    pen.beginPath(); pen.moveTo(50,110); pen.lineTo(48,122); pen.lineTo(36,122);
    pen.moveTo(116,106); pen.lineTo(118,118); pen.lineTo(130,119); pen.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#artUploadButton').click();
  await (await chooser).setFiles({name:'Pink pebble.png', mimeType:'image/png', buffer:Buffer.from(data,'base64')});
  await page.waitForFunction(() => document.getElementById('artStatus')?.textContent.includes('picture is saved'));
  return data;
}

async function main() {
  const server = start('test-results/creative-art-review');
  if (!server.listening) await once(server,'listening');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'});
    const page = await context.newPage(), requests = [];
    await page.route('**/factory-config.json', route => route.fulfill({json:{version:1,mode:'unavailable'}}));
    page.on('request', req => { if (req.method() !== 'GET') requests.push(req.url()); });
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?art=1');
    const privateBytes = await createFixture(page);
    // The same host entry used after authorization and manifest retrieval.
    const original = await page.evaluate(async () => {
      const manifest = {schema:'jems.creation.v1',id:'review-scene',title:'Walk',width:800,height:450,background:'workshop',
        actors:[{id:'traveler',name:'Explorer',assetId:'robot',x:140,y:300,size:120}],
        programs:[{id:'walk',actorId:'traveler',trigger:{type:'start'},actions:[{id:'go',type:'move',dx:120,durationMs:200}]}],variables:{}};
      await FG.creation.fromStudio({id:'local-session',owner:'player1',name:'Workshop walk',projectId:'workshop-walk',remoteId:'revision-A',game:'new'},undefined,manifest);
      return FG.creation.scene();
    });
    await page.locator('#creationSceneOptions > summary').click();
    await page.locator('#creationReplaceActorArt').click();
    await page.locator('#creationVersionPicker [data-private-art]').filter({hasText:'Pink pebble'}).click();
    await page.waitForFunction(() => FG.creation.scene().actors[0].assetId.startsWith('art:image:'));
    const edited = await page.evaluate(() => FG.creation.scene());
    assert.deepEqual(edited, {...original, actors:[{...original.actors[0], assetId:edited.actors[0].assetId}]});
    assert.equal(edited.provenance.sourceRevisionId,'revision-A');
    await page.locator('#creationKeep').click();
    const versions = await page.evaluate(() => FG.creation.export().revisions.map(row=>row.scene).filter(scene=>scene.provenance?.sourceRevisionId==='revision-A'));
    assert.ok(versions.some(version=>version.actors[0].assetId==='robot'),'historical version retains its original appearance');
    assert.ok(versions.some(version=>version.actors[0].assetId===edited.actors[0].assetId),'edited version keeps its exact private pin');
    if (!await page.locator('#creationSceneOptions').evaluate(el=>el.open)) await page.locator('#creationSceneOptions > summary').click();
    await page.locator('#creationLocalArtGame').click();
    const game = page.locator('.art-game-review'), status = game.locator('[role=status]');
    await game.getByRole('button',{name:'Right →'}).waitFor();
    await page.waitForFunction(() => document.querySelector('.art-game-review [data-step=right]')?.disabled === false);
    const pinkBounds = async () => game.locator('canvas').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let left=canvas.width, right=-1, count=0;
      for (let offset=0; offset<pixels.length; offset+=4) {
        if (pixels[offset]===255 && pixels[offset+1]===172 && pixels[offset+2]===209 && pixels[offset+3]===255) {
          const x=(offset/4)%canvas.width; left=Math.min(left,x); right=Math.max(right,x); count++;
        }
      }
      return {left,right,count};
    });
    const initialBounds = await pinkBounds();
    assert.ok(initialBounds.count>1000,'selected synthetic sprite contributes its original fill pixels');
    const messages = () => game.locator('iframe').evaluate(el => el.srcdoc);
    const srcdoc = await messages();
    for (const secret of [edited.actors[0].assetId, 'player1','Pink pebble',privateBytes]) assert.ok(!srcdoc.includes(secret));
    assert.equal(await game.locator('iframe').getAttribute('sandbox'),'allow-scripts');
    assert.match(srcdoc,/connect-src 'none'/);
    await context.setOffline(true);
    await game.locator('canvas').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('.art-game-review[aria-busy=false]');
    const movedBounds=await pinkBounds();
    assert.deepEqual(movedBounds,{left:initialBounds.left+90,right:initialBounds.right+90,count:initialBounds.count},'the entire pink shape moves one tile with no redraw');
    mkdirSync('test-results/creative-art-game-evidence',{recursive:true});
    await game.screenshot({path:'test-results/creative-art-game-evidence/e-gem-hunt.png'});
    for (const key of ['right','right','right','left','left','left','right','right','right','right','right']) {
      await game.locator('[data-step="'+key+'"]').click();
      // Tick replies come from a separate Worker; wait for each atomic turn.
      await page.waitForSelector('.art-game-review[aria-busy=false]');
    }
    assert.equal(await status.textContent(),'You found all three gems!');
    await game.getByRole('button',{name:'Play again'}).click();
    await page.waitForFunction(() => document.querySelector('.art-game-review [role=status]').textContent.startsWith('Gems: 0'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('factory-learning-active',{detail:true})));
    await game.waitFor({state:'detached'});
    assert.deepEqual(requests,[]);
    await context.close();
    console.log('PASS generated companion actor replacement, exact source revision, opaque game rules, offline three-gem victory, replay and learning teardown.');
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
