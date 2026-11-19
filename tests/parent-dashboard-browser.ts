/** Production-dist UI regression. All learner records are synthetic; no provider calls. */
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {chromium, type Page} from 'playwright';
import {start} from './browser-server.cjs';
import {parentDashboardFixture} from './parent-dashboard-fixture';
import {CREATION_KEY} from '../src/creation/storage';

const STATE_KEY='family-game-factory-state-v1';
const tabs=(page:Page,id:string)=>page.locator(`[data-parent-tab="${id}"]`);
const visibleText=(page:Page)=>page.locator('#parentDashboard').innerText();
const noOverflow=async(page:Page,label:string)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' stays within viewport');
async function readableText(page:Page,selector:string) {
  const samples=await page.locator(selector).evaluateAll(elements=>elements.map(element=>{
    const rgb=(color:string)=>color.match(/[\d.]+/g)!.map(Number);
    let background:Element|null=element,fill=[255,255,255,1];
    while(background){const value=rgb(getComputedStyle(background).backgroundColor);if((value[3]??1)>0){fill=value;break;}background=background.parentElement;}
    const light=(color:number[])=>color.slice(0,3).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:Math.pow((channel+0.055)/1.055,2.4)}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
    const ink=light(rgb(getComputedStyle(element).color)),paper=light(fill);
    return {text:element.textContent?.slice(0,80),contrast:(Math.max(ink,paper)+0.05)/(Math.min(ink,paper)+0.05)};
  }));
  assert.ok(samples.length,selector+' is present');
  for(const sample of samples)assert.ok(sample.contrast>=4.5,`${selector}: readable text contrast for ${sample.text} (observed ${sample.contrast.toFixed(2)})`);
}
async function demoLabel(page:Page) {
  await page.evaluate(()=>{
    if(document.getElementById('parentDemoLabel'))return;
    const label=document.createElement('p');label.id='parentDemoLabel';
    label.textContent='DEMO RECORDS · Simulated learning history for interface review';
    label.style.cssText='margin:0 0 12px;padding:8px 12px;border-radius:10px;background:#eaf0ff;color:#254980;font-size:14px;font-weight:650';
    document.getElementById('parentDashboard')!.prepend(label);
  });
}

async function main() {
  const server=start();if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
    .catch(async error=>{await new Promise<void>(resolve=>server.close(()=>resolve()));throw error;});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/arcade/`;
  mkdirSync('test-results',{recursive:true});
  mkdirSync('test-results/parent-dashboard',{recursive:true});
  const results:string[]=[];
  try {
    // Empty histories must be useful and cannot invent a diagnosis or score.
    const emptyContext=await browser.newContext({viewport:{width:1280,height:900}});
    const emptyPage=await emptyContext.newPage();
    await emptyPage.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
    await emptyPage.goto(base);await emptyPage.waitForFunction(()=>window.FG?.parentDashboard&&window.FG?.studio);
    const before=await emptyPage.evaluate(()=>JSON.stringify(window.FG.store.current()));
    await emptyPage.locator('footer [data-page="parent"]').click();
    assert.equal(await emptyPage.locator('[data-parent-domain]').count(),4);
    assert.match(await visibleText(emptyPage),/No retained observations|first discoveries/);
    assert.match(await visibleText(emptyPage),/Not connected/);
    assert.equal(await emptyPage.evaluate(()=>JSON.stringify(window.FG.store.current())),before,'opening a report is read-only even for an empty profile');
    await tabs(emptyPage,'overview').focus();await emptyPage.keyboard.press('ArrowRight');
    assert.equal(await tabs(emptyPage,'skills').getAttribute('aria-selected'),'true','keyboard tabs work');
    await emptyContext.close();results.push('empty histories, read-only reporting and keyboard tabs');

    for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['tablet',{width:820,height:1180}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}]] as const) {
      const fixture=parentDashboardFixture();
      const context=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'reduce',acceptDownloads:true});
      await context.addInitScript(({state,creation,key,stateKey})=>{
        // Seed only the app. Sandboxed game frames intentionally cannot access storage.
        if(window !== window.top)return;
        if(!localStorage.getItem(stateKey))localStorage.setItem(stateKey,JSON.stringify(state));
        if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(creation));
      },{...fixture,key:CREATION_KEY,stateKey:STATE_KEY});
      const page=await context.newPage(),errors:string[]=[],paid:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>void dialog.accept());
      page.on('request',request=>{if(request.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url()))paid.push(request.url());});
      await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
      try {
        await page.goto(base);await page.waitForFunction(()=>window.FG?.parentDashboard&&window.FG?.creation&&window.FG?.studio);
        const storedBefore=await page.evaluate(key=>localStorage.getItem(key),STATE_KEY);
        await page.locator('footer [data-page="parent"]').click();
        await page.locator('[data-parent-domain="math"]').waitFor({state:'visible'});
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/24/);
        assert.match(await page.locator('[data-parent-domain="creation"]').innerText(),/1/,'identical scene checks count once');
        assert.doesNotMatch(await visibleText(page),/PRIVATE SIBLING SCENE/);
        await readableText(page,'.pd-comparable-date');
        await readableText(page,'#parentPanel-overview .pd-evidence-copy > strong');
        await noOverflow(page,device+' overview');await demoLabel(page);
        await page.locator('.pd-companion').evaluate(async image=>{await (image as HTMLImageElement).decode();});
        await page.screenshot({path:`test-results/parent-dashboard/parent-overview-${device}.png`,fullPage:true});
        if(device==='desktop'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/parent-dashboard/parent-overview-desktop-top.png'});}
        await page.locator('#parentReportRange').selectOption('7');
        assert.doesNotMatch(await page.locator('[data-parent-domain="math"]').innerText(),/24/,'date range changes counts');
        await page.locator('#parentReportRange').selectOption('all');
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/24/);
        await tabs(page,'skills').click();
        await readableText(page,'.pd-skill-summary strong');
        await noOverflow(page,device+' skills');
        if(device==='desktop')await page.screenshot({path:'test-results/parent-dashboard/parent-skills-desktop.png',fullPage:true});
        await tabs(page,'evidence').click();
        await page.getByRole('combobox',{name:'Filter evidence by learning area'}).selectOption('creation');
        assert.equal(await page.locator('#parentPanel-evidence [data-evidence-id]').count(),2,'all repeated checks remain inspectable');
        await page.locator('#parentPanel-evidence [data-evidence-id] summary').first().click();
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/Exact revision/);
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/hint/);
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/Demo: Dance on a click/,'checked scene title is visible without a scored first response');
        await noOverflow(page,device+' evidence');
        if(device==='desktop')await page.screenshot({path:'test-results/parent-dashboard/parent-evidence-desktop.png',fullPage:true});
        await page.getByRole('combobox',{name:'Filter evidence by learning area'}).selectOption('language');
        await page.locator('#parentPanel-evidence [data-evidence-id]').filter({hasText:'Writing explored'}).locator('summary').first().click();
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/Demo story: The moon dragon built a rocket from leaves/,'unscored writing remains inspectable');
        await page.getByRole('combobox',{name:'Filter evidence by learning area'}).selectOption('math');
        await page.locator('#parentPanel-evidence [data-evidence-id] summary').first().click();
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/What was asked/);
        await tabs(page,'school').click();
        assert.match(await page.locator('#parentPanel-school').innerText(),/SmartScore/);
        assert.match(await page.locator('#parentPanel-school').innerText(),/not convert/);
        await readableText(page,'.pd-comparison th');
        await noOverflow(page,device+' school connections');
        if(device==='desktop')await page.screenshot({path:'test-results/parent-dashboard/parent-school-desktop.png',fullPage:true});
        const downloadPending=page.waitForEvent('download');await page.locator('#parentDownloadSummary').click();
        const download=await downloadPending,downloadPath=await download.path();assert.ok(downloadPath);
        const summary=readFileSync(downloadPath,'utf8');
        assert.match(summary,/Demo Explorer/);assert.match(summary,/Task:/);assert.match(summary,/not a standardized score/);
        assert.doesNotMatch(summary,/Demo Sibling|PRIVATE SIBLING SCENE/,'export stays within current learner');
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),STATE_KEY),storedBefore,'report/filter/export does not mutate the learner');
        // Existing family controls remain live, including persistence and a separate sibling.
        await tabs(page,'settings').click();
        await page.locator('#parentNickname').fill('Demo Explorer Edited');await page.locator('#saveParent').click();
        assert.equal(await page.evaluate(()=>window.FG.store.current().name),'Demo Explorer Edited');
        await page.locator('#parentReportLearner').selectOption('player2');
        await tabs(page,'overview').click();
        assert.match(await visibleText(page),/Demo Sibling/);assert.doesNotMatch(await visibleText(page),/Demo: Dance on a click/);
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/No retained observations/);
        await tabs(page,'evidence').click();assert.match(await page.locator('#parentPanel-evidence').innerText(),/PRIVATE SIBLING SCENE|Robot/);
        await page.locator('#parentReportLearner').selectOption('player1');await tabs(page,'overview').click();
        if(device==='desktop'){
          // Exercise the existing adult lifecycle's event shape only, not remote authentication.
          await tabs(page,'evidence').click();await tabs(page,'settings').click();
          await page.evaluate(()=>{window.FG.store.enterAdultProfile('adult:00000000-0000-4000-8000-000000000000');window.FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));});
          assert.equal(await page.locator('#parentNickname').inputValue(),'Adult','adult lifecycle refreshes original settings');
          assert.doesNotMatch(await page.locator('#parentPanel-evidence').textContent()||'',/Demo: Dance on a click/,'hidden report panels scrub the former profile');
          await page.evaluate(()=>{window.FG.store.leaveAdultProfile();window.FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));});
          assert.equal(await page.locator('#parentNickname').inputValue(),'Demo Explorer Edited','adult exit restores family settings');
        }
        await page.reload();await page.waitForFunction(()=>window.FG?.parentDashboard&&window.FG?.studio);
        await page.locator('footer [data-page="parent"]').click();
        assert.equal(await page.locator('#parentReportLearner').inputValue(),'player1');
        assert.match(await visibleText(page),/Demo Explorer Edited/);
        assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);
        results.push(`${device}: filters, actual examples, repeated-check deduplication, school connections, private export, settings, sibling separation and reload`);
      } catch(error) {
        await page.screenshot({path:`test-results/parent-dashboard/failure-${device}.png`,fullPage:true}).catch(()=>{});
        writeFileSync(`test-results/parent-dashboard/failure-${device}.json`,JSON.stringify({device,error:String(error),pageErrors:errors,paidRequests:paid},null,2));
        throw error;
      } finally {await context.close();}
    }
    writeFileSync('test-results/parent-dashboard-browser.json',JSON.stringify({scope:'synthetic production-dist browser checks',results},null,2));
    console.log('PASS parent dashboard browser:',results.join('; '));
  } finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
