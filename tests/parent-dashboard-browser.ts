/** Production-dist UI regression. All learner records are synthetic; no provider calls. */
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {chromium, type Page} from 'playwright';
import {start} from './browser-server.cjs';
import {parentDashboardFixture} from './parent-dashboard-fixture';
import {CREATION_KEY} from '../src/creation/storage';
import {PROBLEM_SOLVING_KEY} from '../src/problem-solving/model';

const STATE_KEY='family-game-factory-state-v1';
const tabs=(page:Page,id:string)=>page.locator(`[data-parent-tab="${id}"]`);
const visibleText=(page:Page)=>page.locator('#parentDashboard').innerText();
const noOverflow=async(page:Page,label:string)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label+' stays within viewport');
async function separateControls(page:Page,selector:string,label:string) {
  const controls=page.locator(selector).filter({hasText:/\S/}),boxes=[];
  for(let index=0;index<await controls.count();index++){const box=await controls.nth(index).boundingBox();if(box)boxes.push(box);}
  assert.ok(boxes.length>=2,label+' has visible controls');
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    const horizontal=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),vertical=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
    assert.ok(horizontal<=1||vertical<=1,`${label}: items ${i+1} and ${j+1} do not overlap`);
  }
}
async function readableText(page:Page,selector:string) {
  const rgb=(color:string)=>color.match(/[\d.]+/g)!.map(Number);
  const light=(color:number[])=>color.slice(0,3).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:Math.pow((channel+0.055)/1.055,2.4)}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
  const samples=await page.locator(selector).evaluateAll(elements=>elements.map(element=>{
    let background:Element|null=element,fill='rgb(255, 255, 255)';
    while(background){const value=getComputedStyle(background).backgroundColor;const channels=value.match(/[\d.]+/g)!.map(Number);if((channels[3]??1)>0){fill=value;break;}background=background.parentElement;}
    return {text:element.textContent?.slice(0,80),color:getComputedStyle(element).color,background:fill};
  }));
  assert.ok(samples.length,selector+' is present');
  for(const sample of samples){const ink=light(rgb(sample.color)),paper=light(rgb(sample.background)),contrast=(Math.max(ink,paper)+0.05)/(Math.min(ink,paper)+0.05);assert.ok(contrast>=4.5,`${selector}: readable text contrast for ${sample.text} (observed ${contrast.toFixed(2)})`);}
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
    assert.match(await emptyPage.locator('[data-parent-domain="problem-solving"]').innerText(),/Ready to explore/);
    assert.doesNotMatch(await emptyPage.locator('[data-parent-domain="problem-solving"]').innerText(),/Not connected/);
    assert.equal(await emptyPage.evaluate(()=>JSON.stringify(window.FG.store.current())),before,'opening a report is read-only even for an empty profile');
    await tabs(emptyPage,'overview').focus();await emptyPage.keyboard.press('ArrowRight');
    assert.equal(await tabs(emptyPage,'skills').getAttribute('aria-selected'),'true','keyboard tabs work');
    await emptyContext.close();results.push('empty histories, read-only reporting and keyboard tabs');

    for(const [device,viewport] of [['desktop',{width:1440,height:1080}],['tablet',{width:820,height:1180}],['phone',{width:390,height:844}],['small-phone',{width:320,height:800}]] as const) {
      const fixture=parentDashboardFixture();
      const context=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'reduce',acceptDownloads:true});
      await context.addInitScript(({state,creation,problemSolving,key,stateKey,problemSolvingKey})=>{
        // Seed only the app. Sandboxed game frames intentionally cannot access storage.
        if(window !== window.top)return;
        if(!localStorage.getItem(stateKey))localStorage.setItem(stateKey,JSON.stringify(state));
        if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(creation));
        if(!localStorage.getItem(problemSolvingKey))localStorage.setItem(problemSolvingKey,JSON.stringify(problemSolving));
      },{...fixture,key:CREATION_KEY,stateKey:STATE_KEY,problemSolvingKey:PROBLEM_SOLVING_KEY});
      const page=await context.newPage(),errors:string[]=[],paid:string[]=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>void dialog.accept());
      page.on('request',request=>{if(request.method()==='POST'&&/\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url()))paid.push(request.url());});
      await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
      try {
        await page.goto(base);await page.waitForFunction(()=>window.FG?.parentDashboard&&window.FG?.creation&&window.FG?.studio);
        const storedBefore=await page.evaluate(key=>localStorage.getItem(key),STATE_KEY);
        const evidenceBefore=await page.evaluate(key=>localStorage.getItem(key),PROBLEM_SOLVING_KEY);
        await page.locator('footer [data-page="parent"]').click();
        await page.locator('[data-parent-domain="math"]').waitFor({state:'visible'});
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/24/);
        assert.match(await page.locator('[data-parent-domain="creation"]').innerText(),/1/,'identical scene checks count once');
        assert.match(await page.locator('[data-parent-domain="problem-solving"]').innerText(),/3\s+structured practice decisions/);
        assert.match(await page.locator('[data-parent-domain="problem-solving"]').innerText(),/1 separate unscored activity records/);
        assert.equal(await page.locator('#problemSolvingParentProgress').count(),0,'APS has one native parent report');
        assert.doesNotMatch(await visibleText(page),/PRIVATE SIBLING SCENE/);
        await readableText(page,'.pd-comparable-date');
        await readableText(page,'#parentPanel-overview .pd-evidence-copy > strong');
        await separateControls(page,'.pd-toolbar > *',device+' report controls');
        await separateControls(page,'.pd-chart-label',device+' chart dates');
        if(viewport.width<=600){for(const id of ['parentReportLearner','parentReportRange']){const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.width>=160&&box.height>=44,device+' readable '+id);}}
        await noOverflow(page,device+' overview');await demoLabel(page);
        await page.locator('.pd-companion').evaluate(async image=>{await (image as HTMLImageElement).decode();});
        await page.screenshot({path:`test-results/parent-dashboard/parent-overview-${device}.png`,fullPage:true});
        if(device==='desktop'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/parent-dashboard/parent-overview-desktop-top.png'});}
        await page.locator('#parentReportRange').selectOption('7');
        assert.doesNotMatch(await page.locator('[data-parent-domain="math"]').innerText(),/24/,'date range changes counts');
        await page.locator('#parentReportRange').selectOption('all');
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/24/);
        await tabs(page,'skills').click();
        const skillState=page.getByRole('combobox',{name:'Filter skills by evidence'});
        assert.equal(await skillState.inputValue(),'observed','skills initially foreground actual observations');
        assert.ok(await page.locator('#parentPanel-skills [data-parent-skill]').count()<12,'unobserved catalog does not crowd the initial evidence view');
        await skillState.selectOption('all');await page.locator('#parentReportRange').selectOption('7');
        assert.equal(await skillState.inputValue(),'all','date refresh preserves the parent’s selected skill filter');
        await skillState.selectOption('observed');await page.locator('#parentReportRange').selectOption('all');
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
        await page.getByRole('combobox',{name:'Filter evidence by learning area'}).selectOption('problem-solving');
        assert.equal(await page.locator('#parentPanel-evidence [data-evidence-id]').count(),4,'three structured decisions and one separate source record');
        assert.match(await page.locator('#problemSolvingEvidenceNote').innerText(),/Math: 1/);
        assert.match(await page.locator('#problemSolvingEvidenceNote').innerText(),/not standardized scores/);
        await page.locator('#parentPanel-evidence [data-evidence-id$=":revise"] summary').click();
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/Authorship\s+learner/);
        assert.match(await page.locator('#parentPanel-evidence').innerText(),/Help type\s+strategy/);
        await noOverflow(page,device+' problem-solving evidence');
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
        assert.match(summary,/3 structured practice decisions/);assert.match(summary,/Unscored source records · math: 1/);
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),STATE_KEY),storedBefore,'report/filter/export does not mutate the learner');
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),PROBLEM_SOLVING_KEY),evidenceBefore,'APS reporting and export are read-only');
        // Existing family controls remain live, including persistence and a separate sibling.
        await tabs(page,'settings').click();
        assert.equal(await page.locator('#clearProblemSolving').count(),1,'one profile-scoped APS clear control');
        await page.locator('#parentNickname').fill('Demo Explorer Edited');await page.locator('#saveParent').click();
        assert.equal(await page.evaluate(()=>window.FG.store.current().name),'Demo Explorer Edited');
        await page.locator('#parentReportLearner').selectOption('player2');
        await tabs(page,'overview').click();
        assert.match(await visibleText(page),/Demo Sibling/);assert.doesNotMatch(await visibleText(page),/Demo: Dance on a click/);
        assert.match(await page.locator('[data-parent-domain="math"]').innerText(),/No retained observations/);
        assert.match(await page.locator('[data-parent-domain="problem-solving"]').innerText(),/No retained observations/);
        assert.doesNotMatch(await visibleText(page),/Demo: Test where the robot stops/);
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
