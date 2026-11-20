/* Real Pal components with explicit visual fixtures. This verifies presentation,
 * routing callbacks and interruption handling; it does not grant live rewards. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const script = `
import {createPalsPage,createPalsWidget,createPalCameo} from './src/pals/ui';
import './src/brand/art-library.css';
const preferences={showCompanion:true,encouragement:true};
const empty={owner:'player1',profile:{owner:'player1',starterId:null,activeId:null,owned:[],availableIds:[],preferences},lifetimeGems:0,loading:false};
const state={owner:'player1',profile:{owner:'player1',starterId:'glim',activeId:'glim',availableIds:[],preferences,owned:[
 {id:'glim',joinedAt:'2026-11-19T12:00:00.000Z',source:'starter',adventures:8,practiceActivities:17,creationAdventures:5,stage:2,form:'mature',stageName:'Grown',nextStageAt:null,adventuresToNext:0,practiceToNextAdventure:3},
 {id:'kip',joinedAt:'2026-11-19T13:00:00.000Z',source:'gems',adventures:1,practiceActivities:6,creationAdventures:0,stage:1,form:'base',stageName:'Base',nextStageAt:5,adventuresToNext:4,practiceToNextAdventure:4}
]},lifetimeGems:138,loading:false};
window.palActions=[];
const control={fail:false,defer:false,resolve:null,reject:null};
const act=name=>async (...args)=>{window.palActions.push([name,...args]);if(control.fail)throw Error('Fixture storage is full. Your Pals are still safe.');if(control.defer)await new Promise((resolve,reject)=>{control.resolve=resolve;control.reject=reject;});};
const page=createPalsPage({state,onBack:act('back'),onChooseStarter:act('starter'),onCollect:act('collect'),onEquip:act('equip'),onCreate:act('create'),onPreferences:act('preferences'),onRetry:act('retry')});
const widget=createPalsWidget({state,onOpen:act('open'),onCreate:act('create-widget')});
const cameo=createPalCameo({state,onOpen:act('cameo'),onHelp:act('help')});
document.querySelector('main').append(page.element);
document.querySelector('footer').prepend(widget.element,cameo.element);
page.show();
window.palsFixture={page,widget,cameo,state,empty,control,update(next){page.update(next);widget.update(next);cameo.update(next);}};
`;

(async () => {
  const output = await build({absWorkingDir:root,stdin:{contents:script,resolveDir:root,sourcefile:'pals-ui-fixture.ts'},bundle:true,format:'iife',outdir:'pals-ui-fixture',write:false,external:['/fonts/*','/jems-art/*']});
  const js = output.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const css = output.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/arcade/"><title>My Pals component fixture</title><link rel="stylesheet" href="./bundle.css"><style>body{margin:0;background:#FDFCFF;font-family:Inter,system-ui}header,footer{max-width:1120px;margin:auto;padding:18px}header img{width:145px;max-width:100%}main{max-width:1160px;margin:auto;padding:0 16px}.hidden{display:none!important}#outside{min-height:44px;padding:10px 20px}</style></head><body><header><img src="./jems-logo.svg" alt="jems"></header><main></main><footer><button id="outside">Keep playing</button></footer><script src="./bundle.js"></script></body></html>`;
  const mime={'.svg':'image/svg+xml','.webp':'image/webp','.woff':'font/woff'};
  const server = http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/arcade/'||pathname==='/'){response.setHeader('content-type','text/html');response.end(html);return;}
    if(pathname==='/arcade/bundle.js'){response.setHeader('content-type','application/javascript');response.end(js);return;}
    if(pathname==='/arcade/bundle.css'){response.setHeader('content-type','text/css');response.end(css);return;}
    const file=path.resolve(root,'public',pathname.replace(/^\/arcade\//,'').replace(/^\//,''));
    if(!file.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
    response.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));
  });
  let browser;
  const results=[];
  try {
    server.listen(0,'127.0.0.1');await once(server,'listening');
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:1400,height:1050},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(()=>!!window.palsFixture);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
    assert.equal(await page.locator('#jemsPalsCount').innerText(),'2 / 3 Pals');
    assert.equal(await page.locator('#jemsPalDetailTitle').innerText(),'Glim');
    assert.match(await page.locator('.pals-detail .pals-growth').innerText(),/8 adventures together/);
    assert.deepEqual(await page.locator('.pals-growth-stages > li').allTextContents(),['✓Base','✓Grown']);
    assert.equal(await page.locator('.pals-hero-portrait').getAttribute('data-form'),'mature');
    assert.equal(await page.locator('.pals-hero-portrait').getAttribute('data-artwork'),'preview');
    assert.match(await page.locator('[data-pals-focus="create-glim"]').innerText(),/Make something/);
    assert.match(await page.locator('.pals-card[data-pal="riff"]').innerText(),/12 more gems/);
    assert.ok(await page.locator('.pals-portrait img').evaluateAll(images=>images.every(image=>image.naturalWidth>0&&image.src.includes('/arcade/jems-art/'))));
    results.push('base-path artwork, honest growth and unlock progress');

    await page.locator('[data-pals-focus="create-glim"]').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.palActions.some(action=>action[0]==='create'));
    assert.deepEqual(await page.evaluate(()=>window.palActions[0]),['create','glim','player1']);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.palsFocus),'create-glim');
    await page.evaluate(()=>window.palsFixture.page.update(window.palsFixture.state));
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.palsFocus),'create-glim','refresh retains keyboard focus');
    await page.locator('[data-pals-focus="details-kip"]').click();
    assert.equal(await page.locator('#jemsPalDetailTitle').innerText(),'Kip');
    const before=await page.evaluate(()=>JSON.stringify(window.palsFixture.state.profile));
    await page.locator('#jemsPalPlay').click();
    assert.match(await page.locator('#jemsPalPlayLine').innerText(),/boing|duck/);
    assert.equal(await page.locator('#jemsPalPlay .pals-portrait').evaluate(element=>getComputedStyle(element).animationName),'none');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.palsFixture.state.profile)),before,'play does not add rewards or growth');
    results.push('keyboard create callback, focus continuity, playful reaction without false growth');

    const noOverflow=async()=>{
      const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(element=>element.getBoundingClientRect().right>innerWidth+2).map(element=>({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right})).slice(0,8)}));
      assert.ok(overflow.scrollWidth<=overflow.width+2,`Pal interface fits the viewport: ${JSON.stringify(overflow)}`);
    };
    const containedArt=async()=>assert.ok(await page.locator('#jemsPalPlay img').evaluate(image=>image.getBoundingClientRect().bottom<=image.closest('button').getBoundingClientRect().bottom+1),'hero portrait stays inside its control');
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await noOverflow();await containedArt();
    await page.screenshot({path:path.join(root,'test-results/pals-ui-desktop.png'),fullPage:true});
    for(const width of [768,390,320]){
      await page.setViewportSize({width,height:900});await noOverflow();await containedArt();
      const small=await page.locator('#page-jems-pals button').evaluateAll(buttons=>buttons.filter(button=>button.getClientRects().length&&button.getBoundingClientRect().height<43).map(button=>button.dataset.palsFocus));
      assert.deepEqual(small,[],'all visible buttons retain touch targets');
      if(width===390)await page.screenshot({path:path.join(root,'test-results/pals-ui-mobile.png'),fullPage:true});
    }
    await page.setViewportSize({width:800,height:900});await page.evaluate(()=>document.body.style.zoom='2');await noOverflow();await page.evaluate(()=>document.body.style.zoom='');
    results.push('desktop, tablet, 390px and 320px reflow, touch targets and 200% zoom');

    await page.evaluate(()=>window.palsFixture.update(window.palsFixture.empty));
    assert.equal(await page.locator('[data-pals-focus="starter-glim"]').count(),1);
    assert.equal(await page.locator('[data-pals-focus="starter-kip"]').count(),1);
    await page.evaluate(()=>window.palsFixture.control.fail=true);
    await page.locator('[data-pals-focus="starter-kip"]').click();
    await page.waitForFunction(()=>document.getElementById('jemsPalsStatus').textContent.includes('storage is full'));
    assert.equal(await page.locator('#jemsPalsCount').innerText(),'0 / 3 Pals','failed selection never fabricates an owned Pal');
    assert.equal(await page.locator('[data-pals-focus="starter-kip"]').isEnabled(),true);
    await page.screenshot({path:path.join(root,'test-results/pals-ui-save-error.png'),fullPage:true});
    await page.evaluate(()=>{window.palsFixture.control.fail=false;window.palsFixture.control.defer=true;});
    await page.locator('[data-pals-focus="starter-glim"]').click();
    assert.equal(await page.locator('[data-pals-focus="starter-kip"]').isDisabled(),true);
    await page.evaluate(()=>{
      const fixture=window.palsFixture;
      fixture.update({...fixture.empty,owner:'player2',profile:{...fixture.empty.profile,owner:'player2'}});
      fixture.control.reject(Error('Old player failure'));
      fixture.control.defer=false;
    });
    await page.waitForTimeout(50);
    assert.doesNotMatch(await page.locator('#jemsPalsStatus').innerText(),/Old player/);
    assert.equal(await page.locator('#page-jems-pals').getAttribute('data-owner'),'player2');
    results.push('failure preserves collection and stale save cannot cross profiles');

    await page.evaluate(()=>window.palsFixture.update({...window.palsFixture.state,owner:'player2',loading:false}));
    assert.equal(await page.locator('.pals-card').count(),0,'mismatched owner hides former collection');
    assert.equal(await page.locator('#jemsPalsCount').innerText(),'Your collection');
    await page.evaluate(()=>window.palsFixture.update({...window.palsFixture.empty,profile:null,lifetimeGems:null,loading:true}));
    assert.equal(await page.locator('.pals-gem-count').count(),0,'loading is not a fake zero balance');
    await page.screenshot({path:path.join(root,'test-results/pals-ui-owner-loading.png'),fullPage:true});
    await page.evaluate(()=>window.palsFixture.update(window.palsFixture.state));
    await page.locator('#outside').focus();
    assert.equal(await page.evaluate(()=>window.palsFixture.cameo.say('growth',0)),true);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'outside','reaction never takes focus');
    await page.evaluate(()=>window.palsFixture.cameo.setVisible(false));
    assert.equal(await page.evaluate(()=>window.palsFixture.cameo.say('practice',0)),false,'hidden host never announces encouragement');
    await page.evaluate(()=>{const fixture=window.palsFixture;fixture.cameo.setVisible(true);fixture.update({...fixture.state,profile:{...fixture.state.profile,preferences:{showCompanion:false,encouragement:false}}});});
    assert.equal(await page.locator('.pals-cameo').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.palsFixture.cameo.say('practice',0)),false);
    assert.equal(await page.locator('#page-jems-pals').isVisible(),true,'collection remains available when cameo is disabled');
    results.push('owner-safe loading, voluntary encouragement and nonblocking host reactions');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,'test-results/pals-ui-results.json'),JSON.stringify({scope:'Synthetic component fixture; not observed child or live award evidence',checks:results,errors},null,2)+'\n');
    console.log(`PASS: ${results.length} Pal component groups: ${results.join('; ')}.`);
  } finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
