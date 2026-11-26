const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const crypto=require('node:crypto');
const {chromium}=require('./release-a/node_modules/playwright');
const {start}=require('./release-a/tests/browser-server.cjs');
const source={approved:'approved-195',candidate:'release-a'};
const localKey='family-game-factory-state-v1';
const browserPath=process.env.CHROMIUM_PATH||'/tmp/jems-audit-chromium-141/official/chrome-headless-shell-linux64/chrome-headless-shell';
const rounds=Number(process.argv[2]||12);
const results=[];
const base={version:1,activeProfile:'bench',createdAt:1750000000000,feedback:[],profiles:[{
 id:'bench',name:'Synthetic learner',icon:'⭐',grade:2,age:7,focus:'adaptive',intensity:'gentle',rate:3,hints:true,punish:false,
 skills:{},stats:{},mathWindow:[],learningSetupComplete:true,allowSubjectSwitch:false,
 skillFocus:['g2-hundreds'],languageFocus:['g2-cause-effect']
}]};
const fixtureFor=subject=>{const fixture=structuredClone(base);fixture.profiles[0].learningSubject=subject;return JSON.stringify(fixture);};
async function run(browser,url,which,device,viewport,subject,round){
 const touch=device==='phone';
 const context=await browser.newContext({viewport,hasTouch:touch,reducedMotion:'reduce'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const fixture=fixtureFor(subject),fixtureSha=crypto.createHash('sha256').update(fixture).digest('hex');
 await context.addInitScript(({key,fixture})=>{if(window.top===window&&location.protocol==='http:')localStorage.setItem(key,fixture);},{key:localKey,fixture});
 try{
  await page.goto(url);await page.waitForFunction(()=>window.FG?.learning&&window.FG?.app&&!window.FG.store.loadError);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
   const nav=document.querySelector('nav [data-page="lab"]');
   const info=window.openingTiming={firstRaf:null,firstVisible:null,focused:null,visibleAndFocused:null,last:null};
   let begun;
   function measure(now){
    const target=document.querySelector('#lab-question .workspace-question');
    let geometry=null;
    if(target){
     const b=target.getBoundingClientRect(),style=getComputedStyle(target);
     const onscreen=b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth;
     const hit=onscreen&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
     geometry={y:Math.round(b.y),bottom:Math.round(b.bottom),scrollY:Math.round(scrollY),inViewport:onscreen,
      visible:!!(target.offsetWidth&&style.visibility!=='hidden'&&Number(style.opacity)>0&&hit&&target.contains(hit)),
      focused:document.activeElement===target};
     info.skill=target.closest('[data-skill-id]').dataset.skillId;
     info.question=target.textContent.trim();
    }
    const t=Number((now-begun).toFixed(2));
    if(info.firstRaf===null)info.firstRaf={ms:t,geometry};
    if(geometry?.visible&&info.firstVisible===null)info.firstVisible=t;
    if(geometry?.visible&&geometry.focused&&info.visibleAndFocused===null)info.visibleAndFocused=t;
    info.last=geometry;
    if((info.visibleAndFocused!==null&&t>=130)||t>1200){info.complete=true;return;}
    requestAnimationFrame(()=>measure(performance.now()));
   }
   document.addEventListener('focusin',e=>{if(begun&&e.target.matches('.workspace-question')&&info.focused===null)info.focused=Number((performance.now()-begun).toFixed(2));},true);
   document.addEventListener('click',e=>{
    if(!nav.contains(e.target))return;
    begun=performance.now();
    let state=39173;Math.random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
    requestAnimationFrame(()=>measure(performance.now()));
   },{capture:true,once:true});
  });
  const nav=page.getByRole('navigation').getByRole('button',{name:'My Powers',exact:true});
  if(touch)await nav.tap();else await nav.click();
  await page.waitForFunction(()=>window.openingTiming.complete,null,{timeout:12000});
  const m=await page.evaluate(()=>({...window.openingTiming,grade:window.FG.store.current().grade,authority:window.FG.learning.subject}));
  assert.equal(m.grade,2);assert.equal(m.authority,subject);assert.equal(m.skill,subject==='language'?'g2-cause-effect':'g2-hundreds');assert.deepEqual(errors,[]);
  return {which,device,width:viewport.width,height:viewport.height,subject,round,fixtureSha,...m};
 }finally{await context.close();}
}
(async()=>{
 const servers={};
 const browser=await chromium.launch({executablePath:browserPath,args:['--no-sandbox']});
 const out='opening-'+(rounds===1?'probe':'measurement')+'.json';
 try{
  for(const [k,dir] of Object.entries(source)){
   const server=start(path.join(__dirname,dir,'dist'));if(!server.listening)await once(server,'listening');servers[k]=server;
  }
  for(let round=0;round<rounds;round++)for(const [device,viewport] of Object.entries({desktop:{width:1280,height:960},phone:{width:390,height:844}}))for(const subject of ['math','language']){
   for(const which of (round%2===0?['approved','candidate']:['candidate','approved'])){
    const url='http://127.0.0.1:'+servers[which].address().port+'/arcade/?arcade=1';
    const measurement=await run(browser,url,which,device,viewport,subject,round+1);results.push(measurement);
    console.log(which,device,subject,round+1,measurement.firstVisible,measurement.focused,measurement.visibleAndFocused,measurement.last);
   }
  }
 }finally{
  fs.writeFileSync(path.join(__dirname,out),JSON.stringify({sources:Object.fromEntries(Object.entries(source).map(([k,dir])=>[k,JSON.parse(fs.readFileSync(path.join(__dirname,dir,'dist','build-info.json'))).sha])),browser:browser.version(),rounds,results},null,2)+'\n');
  await browser.close();for(const server of Object.values(servers))await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
