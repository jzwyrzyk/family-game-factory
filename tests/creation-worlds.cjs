/* Synthetic artwork and reviewed Pal pixels in the actual offline-capable application. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');
const {exploreWelcome} = require('./studio-entry.cjs');

const output = process.env.CREATIVE_WORLD_EVIDENCE || 'test-results/creation-worlds';
const layouts = [['desktop',1440,960],['tablet',820,1180],['phone',390,844]];
const worlds = ['forest','workshop','cloud','moon'];
const scene = page => page.evaluate(() => FG.creation.scene());
const save = (locator,name) => locator.screenshot({path:path.join(output,name+'.jpg'),type:'jpeg',quality:86,animations:'disabled'});
async function settings(page) {
  const details = page.locator('#creationSceneOptions');
  if (!await details.isVisible()) {
    const code = page.locator('#creationCodeView');
    if (await code.isVisible()) await code.click();
    const toggle = page.locator('#creationCharacterTools');
    if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  }
  if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
}
async function showStage(page) {
  const play = page.locator('#creationPlayView');
  if (await play.isVisible()) await play.click();
}
async function prepared(page) {
  // The app awaits every selected picture before starting Play or recording.
  await showStage(page);
  await page.locator('#creationRun').click();
  await page.waitForFunction(() => ['completed','running'].includes(FG.creation.snapshot()?.status));
  assert.ok(!/unavailable|could not load/i.test(await page.locator('#creationStatus').innerText()));
}
async function checkWorldPixels(page, key, foreground = true) {
  const result = await page.evaluate(async ({key, foreground}) => {
    const actual = document.getElementById('creationCanvas'), expected = document.createElement('canvas');
    expected.width = actual.width; expected.height = actual.height;
    const c = expected.getContext('2d'), w = actual.width, h = actual.height;
    for (const layer of ['background','middle',...(foreground ? ['foreground'] : [])]) {
      const image = new Image();
      image.src = './art/creative-worlds/v1/'+key+'-'+layer+'.webp'; await image.decode();
      const scale = Math.max(w/image.width, h/image.height);
      c.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);
    }
    const a = actual.getContext('2d').getImageData(0,0,w,h).data, b = c.getImageData(0,0,w,h).data;
    const actors = FG.creation.scene().actors;
    let same = 0, count = 0;
    for (let y=6;y<h;y+=9) for (let x=6;x<w;x+=9) {
      if (actors.some(actor=>Math.abs(x-actor.x)<actor.size && Math.abs(y-actor.y)<actor.size)) continue;
      const i = 4*(y*w+x);
      if (Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2])) <= 2) same++;
      count++;
    }
    return {same,count};
  }, {key,foreground});
  assert.ok(result.count>500 && result.same/result.count>.995, 'stage pixels match selected illustration layers '+JSON.stringify(result));
}
async function decorationFixture(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 150;
    const c = canvas.getContext('2d'); c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(9,113); c.lineTo(25,74); c.lineTo(44,68); c.lineTo(76,29);
    c.lineTo(115,36); c.lineTo(152,65); c.lineTo(169,108); c.lineTo(146,128);
    c.lineTo(98,119); c.lineTo(57,134); c.closePath(); c.fillStyle = '#af85d6'; c.fill();
    c.lineWidth = 6; c.strokeStyle = '#47294e'; c.stroke();
    for (const [x,y] of [[67,72],[110,76]]) { c.beginPath(); c.arc(x,y,5,0,Math.PI*2); c.fillStyle='#47294e'; c.fill(); }
    c.beginPath(); c.moveTo(69,96); c.quadraticCurveTo(87,112,103,98); c.lineWidth=4; c.stroke();
    const file = await new Promise(resolve => canvas.toBlob(resolve));
    const art = await universeFixture.saveDrawing(FG.store.current().id,'My pebble',file);
    return {id:art.id, sha:art.sha256, pin:'art:image:'+art.id+':'+art.sha256};
  });
}

(async () => {
  fs.mkdirSync(output,{recursive:true});
  const fixture = await build({stdin:{contents:`export {saveDrawing} from './src/assets/private-drawings';export {createPalPlayground} from './src/pals/creation';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.MODE':'"test"'},globalName:'universeFixture'});
  const server = start(process.env.STUDIO_BUILD_DIR || 'dist');
  if (!server.listening) await once(server,'listening');
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox'],headless:true});
    for (const [layout,width,height] of layouts) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:layout!=='desktop',reducedMotion:'reduce',acceptDownloads:true});
      const page = await context.newPage(), errors=[];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(15000);
      await page.route('**/factory-config.json',route => route.fulfill({contentType:'application/json',body:'{"version":1,"mode":"unavailable"}'}));
      try {
        await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');
        await page.waitForFunction(()=>window.FG?.creation && window.FG?.studio);
        await exploreWelcome(page);
        await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();return FG.creation.openMake();});
        if (layout==='desktop') await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
        const tiles=page.locator('#creationWorldTiles');
        assert.equal(await tiles.locator('button').count(),4);
        await tiles.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
        await save(tiles,'world-picker-'+layout);
        for (const key of layout==='desktop' ? worlds : [layout==='tablet'?'workshop':'moon']) {
          await tiles.locator('[data-world="world-'+key+'-v1"]').click();
          await prepared(page);
          assert.equal((await scene(page)).background,'world-'+key+'-v1');
          await checkWorldPixels(page,key);
          const canvas=page.locator('#creationCanvas');
          await save(canvas,'stage-'+key+'-'+layout);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'viewport width');
          if (key==='forest' || layout!=='desktop') await save(page,'after-'+layout);
          if (layout==='desktop' && key==='forest') {
            await settings(page);
            const prop=page.locator('#creationWorldTools [data-prop]').nth(1), id=await prop.getAttribute('data-prop');
            await prop.click();
            await page.waitForFunction(id=>FG.creation.scene().actors.some(a=>a.assetId===id),id);
            await settings(page);
            await page.getByLabel('Front scenery',{exact:true}).uncheck();
            await page.waitForFunction(()=>FG.creation.scene().worldLayers?.foreground===false);
            await checkWorldPixels(page,key,false);
            await page.locator('#creationCloseSettings').click();
            await page.locator('#creationKeep').click();
            const kept=await scene(page);
            await page.locator('#creationBack').click();
            const card=page.locator('[data-scene="'+kept.id+'"]');
            await card.scrollIntoViewIfNeeded();await card.locator('canvas').waitFor();
            await save(card,'kept-world-preview');
            await card.click();assert.deepEqual(await scene(page),kept);
            await page.locator('#creationFullscreen').click();
            await page.waitForFunction(()=>document.getElementById('creationFullscreen').getAttribute('aria-pressed')==='true');
            await checkWorldPixels(page,key,false);
            await save(page,'forest-expanded');
            await page.locator('#creationFullscreen').click();
          }
          await page.evaluate(()=>FG.creation.openMake());
        }
        if (layout==='desktop') {
          await page.addScriptTag({content:fixture.outputFiles[0].text});
          const pebble=await decorationFixture(page);
          const pal=await page.evaluate(()=>universeFixture.createPalPlayground('kip'));
          const file=page.locator('#creationImport');
          await file.setInputFiles({name:'approved-pal-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pal))});
          await page.waitForFunction(()=>FG.creation.scene()?.actors[0]?.name==='Nook');
          await page.locator('#creationAddActor').click();
          await page.locator('#creationPrivateActorChoices [data-private-art="'+pebble.pin+'"]').click();
          await page.waitForFunction(pin=>FG.creation.scene().actors.some(a=>a.assetId===pin),pebble.pin);
          await settings(page);await page.getByLabel('World',{exact:true}).selectOption('world-cloud-v1');
          await page.locator('#creationCloseSettings').click();
          const box=await page.locator('#creationCanvas').boundingBox(), old=await scene(page);
          const actor=old.actors.find(item=>item.assetId===pebble.pin);
          await page.mouse.move(box.x+box.width*actor.x/old.width,box.y+box.height*actor.y/old.height);
          await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.66,{steps:9});await page.mouse.up();
          await page.waitForFunction(pin=>FG.creation.scene().actors.find(a=>a.assetId===pin).x>500,pebble.pin);
          await prepared(page);
          await save(page.locator('#creationCanvas'),'cloud-nook-and-child-style-pebble');
          await settings(page);await page.locator('#creationMyBackdrop').click();
          await page.locator('.creative-picker-dialog [data-private-art="'+pebble.pin+'"]').click();
          await page.waitForFunction(pin=>FG.creation.scene().actors.some(a=>a.layer==='backdrop'&&a.assetId===pin),pebble.pin);
          assert.equal((await scene(page)).worldLayers.middle,false);
          if (await page.locator('#creationCloseSettings').isVisible()) await page.locator('#creationCloseSettings').click();
          await page.locator('#creationKeep').click();
          const held=await scene(page);
          await page.locator('#creationBack').click();await page.locator('[data-scene="'+held.id+'"]').click();
          assert.deepEqual(await scene(page),held);
          await page.locator('#creationMore summary').click();
          const download=page.waitForEvent('download');await page.locator('#creationDownload').click();
          const bundle=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
          assert.equal(bundle.scene.actors.find(a=>a.layer==='backdrop').assetId,pebble.pin);
          assert.ok(bundle.art.drawings.some(d=>d.sha256===pebble.sha));
          if (!await page.locator('#creationCopy').isVisible()) await page.locator('#creationMore > summary').click();
          await page.locator('#creationCopy').click();
          await page.waitForFunction(id => FG.creation.scene().id !== id, held.id);
          const copy = await scene(page);
          assert.deepEqual(copy.actors,held.actors);
          assert.equal(copy.background,held.background);
          await settings(page); await page.getByLabel('World',{exact:true}).selectOption('world-moon-v1');
          await page.waitForFunction(()=>FG.creation.scene().background==='world-moon-v1');
          await page.locator('#creationCloseSettings').click();await page.locator('#creationKeep').click();
          await page.locator('#creationBack').click();await page.locator('[data-scene="'+held.id+'"]').click();
          assert.deepEqual(await scene(page),held,'a copied world never changes its kept source');
          await context.setOffline(true);
          await page.reload();
          await page.waitForFunction(()=>!!window.FG?.creation);
          await page.evaluate(id=>FG.creation.open(id),held.id);
          await prepared(page);
          assert.deepEqual(await scene(page),held,'offline reload recovers the world, exact private art and Pal');
          await context.setOffline(false);
        }
        assert.deepEqual(errors,[]);
        console.log('PASS illustrated worlds',layout,width,height);
      } catch (error) {
        await page.screenshot({path:path.join(output,'failure-'+layout+'.jpg')});
        console.error('scene:',await scene(page).catch(()=>null),'status:',await page.locator('#creationStatus').textContent().catch(()=>null));
        throw error;
      } finally {await context.close();}
    }
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
