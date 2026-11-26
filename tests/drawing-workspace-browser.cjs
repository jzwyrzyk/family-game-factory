/* Exercise the visible tools on the actual build with synthetic artwork. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start } = require('./browser-server.cjs');
const output = path.resolve('test-results/drawing-workspace');
fs.mkdirSync(output,{recursive:true});

async function open(page,base) {
  await page.goto(base+'?art=1');
  await page.locator('#artDrawButton').click();
  await page.locator('.drawing-paint[open]').waitFor();
}
async function reveal(details) {
  if (!await details.evaluate(el=>el.open)) await details.locator('summary').click();
}
async function location(paper,x,y) {
  await paper.scrollIntoViewIfNeeded();
  const b=await paper.boundingBox();
  return {x:b.x+(x/900)*b.width,y:b.y+(y/560)*b.height};
}
async function stroke(page,paper,points) {
  const first=await location(paper,...points[0]);
  await page.mouse.move(first.x,first.y); await page.mouse.down();
  for (const p of points.slice(1)) {
    const next=await location(paper,...p); await page.mouse.move(next.x,next.y,{steps:3});
  }
  await page.mouse.up();
}
const pixel=(paper,x,y)=>paper.evaluate((c,[x,y])=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data),[x,y]);
const raster=paper=>paper.evaluate(c=>c.toDataURL());
async function run() {
  const server=start(); await new Promise(r=>server.listening?r():server.once('listening',r));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  const base='http://127.0.0.1:'+server.address().port+'/arcade/';
  const context=await browser.newContext({viewport:{width:1366,height:900},hasTouch:true});
  const page=await context.newPage(); const traffic=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST')traffic.push(r.url());});
  await page.route('**/factory-config.json',r=>r.abort());
  try {
    await open(page,base);
    const editor=page.locator('.drawing-paint'), paper=editor.locator('[data-paper]');
    const opts=editor.locator('[data-options]');
    const choose=async tool=>{
      const button=editor.locator('[data-tool="'+tool+'"]');
      if(!await button.isVisible())await reveal(editor.locator('[data-more-tools]'));
      await button.click();
    };
    for(const transparent of [false,true]) {
      await reveal(opts); await opts.locator('[data-background]').selectOption(transparent?'clear':'white');
      await choose('rectangle'); await stroke(page,paper,[[200,120],[640,410]]);
      await editor.getByRole('button',{name:'Berry',exact:true}).click();
      await choose('fill'); await stroke(page,paper,[[400,200]]);
      assert.deepEqual(await pixel(paper,400,200),[219,86,121,255],'bucket fills the enclosed region');
      assert.deepEqual(await pixel(paper,50,50),transparent?[0,0,0,0]:[255,255,255,255]);
      await choose('eraser'); await stroke(page,paper,[[390,200],[420,200]]);
      assert.deepEqual(await pixel(paper,400,200),transparent?[0,0,0,0]:[255,255,255,255]);
      const erased=await raster(paper);
      await editor.locator('[data-undo]').click(); assert.deepEqual(await pixel(paper,400,200),[219,86,121,255]);
      await editor.locator('[data-redo]').click(); assert.equal(await raster(paper),erased);
      page.once('dialog',d=>d.accept());
      await editor.locator('[data-clear]').click();
      await editor.locator('[data-undo]').click(); assert.equal(await raster(paper),erased,'clear can be recovered');
      await editor.locator('[data-redo]').click();
    }
    // Use the freehand tools, straight lines, all four shapes, the approved stamp and selection.
    await editor.getByRole('button',{name:'Charcoal',exact:true}).click();
    const tools=['pencil','crayon','brush','marker','line','circle','rectangle','triangle','star'];
    for(const [i,tool] of tools.entries()){
      await choose(tool); const before=await raster(paper);
      const x=55+i%5*155,y=75+Math.floor(i/5)*180;
      await stroke(page,paper,[[x,y],[x+45,y+45],[x+80,y+65]]);
      assert.notEqual(await raster(paper),before,tool+' produces visible pixels');
    }
    await editor.locator('[data-stamp=blue]').click();
    await stroke(page,paper,[[600,280],[720,390]]);
    const stamped=await raster(paper);
    await editor.locator('[data-undo]').click(); assert.notEqual(await raster(paper),stamped);
    await editor.locator('[data-redo]').click(); assert.equal(await raster(paper),stamped);
    await choose('select'); await stroke(page,paper,[[660,335],[750,370]]);
    await editor.locator('[data-grow]').click(); await choose('crayon');
    assert.notEqual(await raster(paper),stamped);
    await paper.press('Enter'); await paper.press('ArrowLeft');
    await paper.focus(); await page.keyboard.down('Space'); await paper.press('ArrowUp'); await page.keyboard.up('Space');
    const pen=await context.newCDPSession(page);
    const from=await location(paper,100,430),to=await location(paper,310,445);
    await pen.send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1,pointerType:'pen',force:0.2});
    await pen.send('Input.dispatchMouseEvent',{type:'mouseMoved',...to,button:'left',buttons:1,pointerType:'pen',force:0.8});
    await pen.send('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,pointerType:'pen'});
    await editor.locator('[data-title]').fill('My drawing tools');
    await editor.locator('[data-save]').click(); await editor.waitFor({state:'detached'});
    const saved=page.getByRole('region',{name:'Your saved drawing'});
    await saved.waitFor(); await saved.getByRole('button',{name:'Make it move'}).click();
    const motion=page.locator('dialog[open]'); await motion.waitFor(); await page.keyboard.press('Escape');
    if(await motion.count())await motion.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
    await paper.press('Enter'); await editor.locator('[data-save]').click(); await editor.waitFor({state:'detached'});
    await saved.getByRole('button',{name:'Make a scene',exact:true}).click();
    await page.locator('#page-creation').waitFor({state:'visible'});

    for(const [label,w,h] of [['phone',320,667],['tablet',820,1180],['desktop',1440,900]]) {
      await page.setViewportSize({width:w,height:h});
      await open(page,base);
      await choose('crayon'); await editor.getByRole('button',{name:'Teal',exact:true}).click();
      await stroke(page,paper,[[260,400],[235,320],[270,200],[355,145],[475,130],[585,175],[635,250],[675,360],[640,400],[500,415],[260,400]]);
      await choose('fill'); await stroke(page,paper,[[400,280]]);
      await choose('crayon'); await editor.getByRole('button',{name:'Charcoal',exact:true}).click();
      const dot=await location(paper,362,255); await page.touchscreen.tap(dot.x,dot.y);
      await stroke(page,paper,[[520,250]]); await stroke(page,paper,[[405,308],[425,321],[460,324],[490,310]]);
      await editor.locator('[data-title]').fill('My Rock');
      await editor.evaluate(e=>{e.scrollTop=0;});
      assert.ok(await editor.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no horizontal scrolling at '+w);
      await page.screenshot({path:path.join(output,label+'.png')});
      await editor.locator('[data-save]').click(); await editor.waitFor({state:'detached'});
      await saved.waitFor(); await saved.locator('summary').click();
      assert.ok(await saved.getByRole('button',{name:'Build a Rally car'}).isVisible());
      if(label==='desktop'){
        await page.locator('#artDetails').screenshot({path:path.join(output,'kept-art.png')});
        await saved.getByRole('button',{name:'Build a Rally car'}).click();
        await page.locator('dialog [data-kind]').waitFor();
      }else await saved.getByRole('button',{name:'Keep it in My Art'}).click();
    }
    assert.deepEqual(traffic,[]); assert.deepEqual(errors,[]);
    console.log('PASS all drawing tools, two paper modes, fill boundaries, undo, redo, clear, transforms, keyboard, pen and touch, actual saved-art continuations and three viewport captures.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
