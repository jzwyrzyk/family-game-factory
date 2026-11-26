// Deployed TEST acceptance. Only fixed synthetic hosts, protected household and exact management route receive credentials.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {setTimeout:delay} = require('node:timers/promises');
const {exploreWelcome,navigate,openProfiles} = require('../../tests/studio-entry.cjs');
const {sha} = require('./test-frontend.cjs');
const uuid=/^[a-f0-9-]{36}$/;
const valid = (value) => {assert(uuid.test(value),'TEST_UUID_REQUIRED');return value;};
function client(context,origin,headers={}) {
  return async function api(path,body,expectStatus) {
    const url=new URL(path,origin);
    assert.equal(url.origin,origin);
    const result=await context.request.fetch(url.href,{method:body===undefined?'GET':'POST',maxRedirects:0,timeout:35000,
      headers:{origin,'x-factory-request':'1',...headers},...(body===undefined?{}:{data:body})});
    try {
      if(expectStatus) {assert.equal(result.status(),expectStatus);return;}
      assert(result.ok(),'TEST_ROUTE_FAILED:'+url.pathname+':'+result.status());
      return await result.json();
    } finally {await result.dispose();}
  };
}
function seed(origin,secret) {
  // Only a short-lived, already-enrolled synthetic device session enters the runner.
  assert(secret&&typeof secret.session==='string'&&/^[A-Za-z0-9_-]{20,8000}\.[A-Za-z0-9_-]{43}$/.test(secret.session)&&typeof secret.passphrase==='string'&&secret.passphrase.length>=12);
  return [{name:'__Host-factory_session',value:secret.session,url:origin+'/',secure:true,httpOnly:true,sameSite:'Strict'}];
}
async function protectedBrowser(context,target,token) {
  const household='https://'+target.household, family='https://f-'+target.familyId+'.'+target.hub, preview='https://'+target.preview;
  await context.addInitScript(()=>{
    let service;
    try{service=navigator.serviceWorker;}catch{return;}
    if(service) Object.defineProperty(Object.getPrototypeOf(service),'register',{configurable:false,
      value:async()=>{throw new DOMException('Offline registration is outside integrated TEST','NotAllowedError');}});
  });
  await context.routeWebSocket('**/*',s=>s.close());
  await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(![household,family,preview].includes(url.origin)) return route.abort('blockedbyclient');
    const frame=r.frame();
    if(frame.parentFrame()) {
      // Opaque game frames can navigate only by the original first-party preview grant POST.
      if(!r.isNavigationRequest()||r.method()!=='POST'||url.origin!==preview||
        !['/family-preview','/household-preview'].includes(url.pathname)||url.search||
        ![family,household].includes(new URL(frame.parentFrame().url()).origin))return route.abort('blockedbyclient');
    } else if (url.origin===preview) return route.abort('blockedbyclient');
    const headers={...r.headers()};delete headers.authorization;
    if(url.origin===household)headers.authorization='Bearer '+token;
    const response=await route.fetch({headers,maxRedirects:0,timeout:25000});
    try {return await route.fulfill({response});} finally {await response.dispose();}
  });
}
async function householdJourneys(browser,target,token) {
  const journeys={};
  for(const viewport of [{width:1400,height:960},{width:820,height:1180},{width:390,height:844}]) {
    const ctx=await browser.newContext({viewport,reducedMotion:'reduce',hasTouch:viewport.width<1200});
    try {
      await protectedBrowser(ctx,target,token);
      const p=await ctx.newPage(),check=async selector=>{
        await p.locator(selector).waitFor({state:'visible'});
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      };
      await p.goto('https://'+target.household+'/');await exploreWelcome(p);
      await p.locator('#studioNavMenu').click();await check('#studioMenuDialog');await p.keyboard.press('Escape');
      assert.equal(await p.evaluate(()=>document.activeElement.id),'studioNavMenu');journeys.accessibility='success';
      await check('#studioJourneyTile');journeys['home-navigation']='success';
      await navigate(p,'studioNavRewards');await check('#page-jems-rewards');journeys.rewards='success';
      await navigate(p,'studioNavHome');await p.locator('#studioSavedIdeas').click();await check('#page-creations');journeys['my-creations']='success';
      await navigate(p,'studioNavHome');await p.locator('[data-starter="factory"]').click();
      await p.waitForFunction(()=>window.FG.runtime.snapshot()?.config.orderSize===2);
      const initial=await p.evaluate(()=>FG.runtime.snapshot().state);
      const wrong=initial.nextGem===initial.pattern.next?'route-return':'route-order';
      await p.locator('.gem-factory .gf-sort-basket[data-action="'+wrong+'"]').click();
      await p.waitForFunction(n=>FG.runtime.snapshot().state.sortingMistakes>n,initial.sortingMistakes);journeys['ready-to-play']='success';
      await navigate(p,'studioNavHome');await p.locator('#studioScenes').click();
      for(let i=0;i<3;i++)await p.locator('[data-intro-move="right"]').click();
      await p.locator('#creationIntroPlay').click();
      await p.waitForFunction(()=>document.querySelector('#creationIntroResult').textContent.includes('You reached it'));
      await p.locator('#creationIntroDone').click();journeys.coding='success';
      await navigate(p,'studioMenuArt');await p.locator('#artDrawButton').click();
      const paint=p.locator('.drawing-paint[open]'),paper=paint.locator('[data-paper]'),b=await paper.boundingBox();
      assert(b);await p.mouse.move(b.x+b.width/3,b.y+b.height/3);await p.mouse.down();
      await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:6});await p.mouse.up();await paint.locator('[data-save]').click();
      await p.getByRole('region',{name:'Your saved drawing'}).waitFor();journeys.artwork='success';
      await navigate(p,'studioMenuParent');await p.locator('[data-parent-tab="settings"]').click();
      await p.selectOption('#parentSubject','both');await p.locator('#saveParent').click();
      await p.waitForFunction(()=>FG.store.current().allowSubjectSwitch===true);
      await navigate(p,'studioNavPowers');
      for(const [button,activity] of [['Math','math'],['Language','language']]) {
        await p.locator('#labSubject'+button).click();await p.locator('#lab-next').click();
        const panel=p.locator('#lab-question .'+activity+'-activity');await panel.waitFor();
        await panel.locator('[data-action="show-solution"]').click();await panel.locator('[data-action="continue-supported"]').click();
        await p.waitForFunction(()=>!FG.learning.active);
      }
      journeys['math-language']='success';
      await navigate(p,'studioMenuParent');await check('#page-parent');
      await p.locator('[data-parent-tab="settings"]').click();await check('#parentGrade');await openProfiles(p);
      assert(await p.locator('#profile-choices .profile-choice').count()>=2);journeys['parent-profiles']='success';
    } finally {await ctx.close();}
  }
  journeys['responsive-desktop-tablet-phone']='success';
  return journeys;
}
async function submit(api,gameId,baseRevisionId,prompt,requestId) {
  let job=await api('/v1/jobs',{gameId,baseRevisionId,prompt,clientRequestId:requestId});
  const id=valid(job.jobId),deadline=Date.now()+15*60000;
  while(['queued','building','testing'].includes(job.status)&&Date.now()<deadline){
    await delay(3500);job=await api('/v1/jobs/'+id);assert.equal(job.jobId,id);
  }
  assert.equal(job.status,'ready','TEST_BUILD_NOT_READY');valid(job.revisionId);
  return job;
}
async function play(page,preview,origin,n,route) {
  assert.equal(preview.url,origin+route);assert(typeof preview.grant==='string'&&preview.grant.length<=3000);
  await page.evaluate(({preview,channel})=>{
    document.getElementById('uat-game')?.remove();
    const frame=document.createElement('iframe');frame.id='uat-game';frame.name='jems-'+channel;
    frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='display:block;width:100%;height:720px';document.body.append(frame);
    const form=document.createElement('form');form.method='POST';form.target=frame.name;form.action=preview.url;
    for(const [name,value] of Object.entries({channel,grant:preview.grant})){
      const node=document.createElement('input');node.type='hidden';node.name=name;node.value=value;form.append(node);
    }
    document.body.append(form);form.submit();form.remove();
  },{preview,channel:randomUUID()});
  const frame=page.frameLocator('#uat-game'),status=frame.locator('#status'),action=frame.locator('[data-control="action"]');
  await frame.locator('#start').click();
  if(route==='/family-preview'){
    await action.hover();const bounds=await action.boundingBox();assert(bounds);
    await page.mouse.down();
    try{await frame.locator('#status[data-state="won"]').waitFor({timeout:5000});}
    finally{await page.mouse.move(bounds.x+bounds.width+2,bounds.y+bounds.height/2);await page.mouse.up();}
  }else{
    for(let i=0;i<n;i++){
      await action.click({delay:50});
      await frame.locator('#score').filter({hasText:new RegExp('^Score: '+(i+1)+'$')}).waitFor({timeout:2500});
    }
  }
  assert.equal(await status.getAttribute('data-state'),'won');assert.equal(await frame.locator('#score').textContent(),'Score: '+n);
  await frame.locator('#replay').click();
  await frame.locator('#score').filter({hasText:/^Score: 0$/}).waitFor({timeout:2500});
}
module.exports={client,seed,protectedBrowser,householdJourneys,submit,play,valid,sha};
