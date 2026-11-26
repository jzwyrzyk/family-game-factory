/* Real My Art and scene journeys, synthetic drawings only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');
const {exploreWelcome} = require('./studio-entry.cjs');

(async () => {
  const server = start(process.env.ART_BUILD_DIR || 'dist');
  if (!server.listening) await once(server, 'listening');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox']});
  try {
    const phone = process.env.ART_TEST_DEVICE === 'phone';
    const page = await browser.newPage({viewport:phone ? {width:390,height:844} : {width:1180,height:880}, hasTouch:phone, reducedMotion:'reduce'});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/arcade/');
    await page.waitForFunction(() => window.FG?.artStudio?.open);
    await exploreWelcome(page);
    await page.evaluate(() => FG.artStudio.open());
    const picture = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width=180; canvas.height=150;
      const ctx=canvas.getContext('2d'); ctx.lineWidth=5; ctx.lineJoin='round';
      ctx.fillStyle='#9873af'; ctx.strokeStyle='#543b73'; ctx.beginPath(); ctx.moveTo(27,114);
      for (const [x,y] of [[35,64],[71,31],[109,38],[150,77],[152,107],[123,121],[56,124]]) ctx.lineTo(x,y);
      ctx.closePath(); ctx.fill();ctx.stroke();
      ctx.fillStyle='#352745';ctx.beginPath();ctx.arc(75,76,4,0,2*Math.PI);ctx.fill();ctx.beginPath();ctx.arc(103,75,4,0,2*Math.PI);ctx.fill();
      ctx.beginPath();ctx.moveTo(77,89);ctx.quadraticCurveTo(90,98,102,87);ctx.stroke();
      return canvas.toDataURL().split(',')[1];
    });
    await page.setInputFiles('#artUpload',{name:'My moon rock.png',mimeType:'image/png',buffer:Buffer.from(picture,'base64')});
    await page.getByRole('textbox',{name:'What is it? (optional)'}).fill('pebble');
    await page.getByRole('combobox',{name:'Artwork collection'}).selectOption('prop');
    await page.getByRole('button',{name:'Save details'}).click();
    await page.waitForFunction(()=>document.querySelector('#artStatus').textContent.includes('details saved'));
    await page.locator('#artBrowseAssets').click();
    const picker=page.locator('#page-art-studio dialog[open]');
    await picker.getByRole('searchbox').fill('pebble');
    await picker.getByRole('combobox').selectOption('world');
    assert.equal(await picker.locator('[data-private-art]').count(),0);
    await picker.getByRole('combobox').selectOption('prop');
    const choice=picker.locator('[data-private-art]');
    await choice.waitFor(); const pin=await choice.getAttribute('data-private-art');
    assert.ok(await picker.evaluate(el => el.scrollWidth<=el.clientWidth+1),'picker fits viewport');
    const evidence=process.env.ART_EVIDENCE_DIR || 'test-results/creative-picker';
    fs.mkdirSync(evidence,{recursive:true});
    await choice.locator('img').evaluate(el=>el.decode());
    await page.screenshot({path:path.join(evidence,phone ? 'my-things-phone.png' : 'my-things.png')});
    await choice.click(); await picker.waitFor({state:'detached'});
    await page.locator('#artUseScene').click();
    await page.waitForFunction(id=>FG.creation.scene()?.actors[0]?.assetId===id,pin);
    const characterTools = page.locator('#creationCharacterTools');
    if (await characterTools.isVisible() && await characterTools.getAttribute('aria-expanded') === 'false') await characterTools.click();
    await page.locator('#creationAddActor').click();
    const actorPicker=page.locator('#creationPrivateActorChoices');
    await actorPicker.getByRole('searchbox').fill('pebble');
    await actorPicker.locator('canvas').waitFor();
    assert.equal(await actorPicker.locator('[data-private-art]').getAttribute('data-private-art'),pin);
    await page.screenshot({path:path.join(evidence,phone ? 'scene-asset-picker-phone.png' : 'scene-asset-picker.png')});
    await actorPicker.getByRole('combobox').selectOption('jems');
    await actorPicker.getByRole('searchbox').fill('');
    await actorPicker.locator('[data-catalogue-choice="dragon"]').click();
    await page.waitForFunction(()=>FG.creation.scene()?.actors.some(actor=>actor.assetId==='dragon'));
    assert.deepEqual(errors,[]);
    console.log('My Art semantics, category filtering, rendered thumbnails, scene pin continuity and Jems catalogue actor passed.');
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
