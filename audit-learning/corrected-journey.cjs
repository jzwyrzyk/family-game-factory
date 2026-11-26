const {chromium}=require('./corrected/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const file=path.join(__dirname,'corrected/dist-review/jems-ui-review.html');
(async()=>{
  const url='http://localhost:43199/',browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const result={sha:'dea2915f17fa9f40dc20ead85b7672c8573b5335',browser:browser.version(),artifactSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),gradeRoutes:[],responses:[],errors:[],requests:[]};
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    page.on('pageerror',e=>result.errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)result.requests.push(r.url())});
    await page.route(url,r=>r.fulfill({contentType:'text/html',path:file}));await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#loading').hidden);
    const active=(action,grade)=>page.waitForFunction(({action,grade})=>{
      const w=document.querySelector('#appFrame').contentWindow,m=window.__jemsReview.learningSamples.find(m=>m.action===action);
      return document.querySelector('#destination').value===action && document.querySelector('#status').textContent.endsWith('synthetic review') && w.FG?.learning?.active && w.FG.learning.activeItem.skillId===m.skill && w.FG.store.current().grade===grade;
    },{action,grade});
    async function examine(action,grade) {
      await active(action,grade);
      const state=await page.evaluate(()=>{
        const w=document.querySelector('#appFrame').contentWindow;
        return {action:document.querySelector('#destination').value,grade:w.FG.store.current().grade,enabled:[...document.querySelectorAll('#grade option:enabled')].map(o=>Number(o.value)).sort((a,b)=>a-b),skill:w.FG.learning.activeItem.skillId};
      });result.gradeRoutes.push(state);return state;
    }
    async function open(action,grade) {await page.selectOption('#destination',action);return examine(action,grade);}
    const g4='learn:g4-add-fraction',g1='learn:g1-make-ten',pk='learn:pk-touch',groups='learn:g3-groups';
    assert.deepEqual((await open(g4,4)).enabled,[4]);await page.locator('#grade').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#grade').inputValue(),'4');
    assert.deepEqual((await open(g1,1)).enabled,[1,2,3,4]);await page.selectOption('#grade','4');await examine(g1,4);
    assert.deepEqual((await open(pk,-1)).enabled,[-1,0,1,2,3,4]);await page.selectOption('#grade','0');await examine(pk,0);
    await page.selectOption('#destination','home');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Home / My Games · synthetic review');
    assert.equal(await page.locator('#grade option:enabled').count(),6);await page.locator('#back').click();await examine(pk,0);
    await open(groups,3);
    const frame=()=>page.frames().find(f=>f.parentFrame()===page.mainFrame());
    for(const pathName of ['blocks','written']){
      await page.locator('#hide').click();
      const f=frame(),root=f.locator('#lab-question .math-activity'),array=root.locator('[data-model=arrays]');
      const id=await root.getAttribute('data-attempt-id');
      const item=await f.evaluate(()=>FG.learning.activeItem);
      const answer=Number(item.answer),p=item.parameters;
      assert.equal(answer,p.a*p.b);assert.equal(await array.isVisible(),true);
      await array.getByRole('button',{name:'Increase Rows'}).click();await array.getByRole('button',{name:'Increase Columns'}).click();await array.locator('.model-array svg').click();
      const built=await array.locator('.model-array').getAttribute('aria-label');assert.notEqual(built,'0 rows, 0 columns');
      await root.getByRole('button',{name:'Build an answer',exact:true}).click();
      const blocks=root.locator('[data-model=blocks]');
      assert.equal(await blocks.locator('.math-built-number').innerText(),'0');
      await blocks.locator('[data-place="10"][data-delta="1"]').click();
      await root.getByRole('button',{name:'Write an answer',exact:true}).click();
      assert.equal(await array.locator('.model-array').getAttribute('aria-label'),built);
      if(pathName==='blocks'){
        await root.getByRole('button',{name:'Build an answer',exact:true}).click();
        assert.equal(await blocks.locator('.math-built-number').innerText(),'10');
        for(let i=1;i<Math.floor(answer/10);i++)await blocks.locator('[data-place="10"][data-delta="1"]').click();
        for(let i=0;i<answer%10;i++)await blocks.locator('[data-place="1"][data-delta="1"]').click();
        await blocks.locator('[data-action=check-interaction]').click();
      }else{await root.locator('input.math-answer').count().then(async n=>{const input=n?root.locator('input.math-answer'):root.locator('.math-answer-area input');await input.fill(String(answer));await input.press('Enter');});}
      await f.waitForFunction(id=>FG.store.current().learning.attempts.some(a=>a.id===id&&a.outcome==='completed'&&a.independent),id);
      const rec=await f.evaluate(id=>{const p=FG.store.current(),a=p.learning.attempts.find(a=>a.id===id);return {count:p.learning.attempts.filter(a=>a.id===id).length,responses:a.answers.length,normalized:a.answers[0].normalized,outcome:a.outcome,independent:a.independent,representation:a.item.representation};},id);
      assert.deepEqual(rec,{count:1,responses:1,normalized:answer+'/1',outcome:'completed',independent:true,representation:'visual'});result.responses.push({path:pathName,product:answer,arrayState:built,...rec});
      if(pathName==='blocks'){await page.locator('#return').click();await page.selectOption('#destination',g4);await active(g4,4);await open(groups,3);}
    }
    assert.deepEqual(result.requests,[]);assert.deepEqual(result.errors,[]);
    result.passed=true;
  }finally{fs.writeFileSync(path.join(__dirname,'corrected-journey.json'),JSON.stringify(result,null,2)+'\n');await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
