const {exploreWelcome,openProfiles}=require('./studio-entry.cjs');
/* Production-dist tablet voice journey. All requests are browser fixtures;
 * no microphone, Google speech service, model or real child data is processed. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  headless:true,args:['--no-sandbox']
 });
 try{for(const [device,viewport] of [['desktop',{width:1280,height:850}],['mobile',{width:390,height:844}]]){
  const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',isMobile:device==='mobile',reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let audioRequests=0,modelRequests=0,buildRequests=0,authorized=true;
  const unexpectedPosts=[];
  await page.addInitScript(()=>{
   window.__privateStarts=0;window.__privateTracksStopped=0;
   window.__privatePermissionDelay=false;window.__grantPrivateMic=null;
   window.__privateSpoken=[];window.__privateSpeaking=false;window.__privateAudioAtStart=[];
   window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
   class Speech extends EventTarget {
    getVoices(){return [{name:'Samantha (Enhanced)',voiceURI:'Samantha',lang:'en-US',localService:true,default:false}];}
    speak(utterance){window.__privateSpoken.push(utterance.text);window.__privateSpeaking=true;utterance.onstart?.();}
    cancel(){window.__privateSpeaking=false;}
   }
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:new Speech()});
   const stream={getTracks(){return [{stop(){window.__privateTracksStopped++;}}];}};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
    if(window.__privatePermissionDelay)return new Promise(resolve=>{window.__grantPrivateMic=()=>resolve(stream);});
    return stream;
   }}});
   class Recorder {
    static isTypeSupported(type){return type==='audio/webm;codecs=opus';}
    state='inactive';mimeType='audio/webm;codecs=opus';ondataavailable=null;onstop=null;onerror=null;
    constructor(_stream,{mimeType}){this.mimeType=mimeType;}
    start(){window.__privateAudioAtStart.push(window.__privateSpeaking);this.state='recording';window.__privateStarts++;}
    stop(){this.state='inactive';const arr=new Uint8Array(180);arr.set([0x1a,0x45,0xdf,0xa3]);
     this.ondataavailable?.({data:new Blob([arr],{type:this.mimeType})});this.onstop?.();}
   }
   Object.defineProperty(window,'MediaRecorder',{configurable:true,value:Recorder});
  });
  const base='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
  const cors={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Credentials':'true',
   'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
   'Access-Control-Allow-Headers':'Content-Type,X-Factory-Request,X-Factory-Audio-Id'};
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',
   body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://private-stt.test',previewOrigin:'https://preview.private-stt.test'})}));
  await page.route('https://private-stt.test/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
   const reply=(data,status=200)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(data)});
   if(path==='/v1/sessions/status')return reply({connected:true,trusted:true,expiresAt:Date.now()+3600000});
   if(path==='/v1/coach/audio/status')return reply({available:authorized,mode:authorized?'private':'unavailable'});
   if(path==='/v1/coach/status')return reply({available:false,mode:'unavailable'});
   if(path==='/v1/coach/audio'){
    audioRequests++;assert.equal(req.method(),'POST');assert.equal(req.headers()['x-factory-request'],'1');
    assert.equal(req.postDataBuffer().subarray(0,4).toString('hex'),'1a45dfa3');
    return reply({text:'The robot sneezes rainbow spaghetti!'});
   }
   if(path==='/v1/coach'){modelRequests++;return reply({errorCode:'COACH_UNAVAILABLE'},503);}
   if(path==='/v1/jobs'){buildRequests++;return reply({errorCode:'UNAVAILABLE'},503);}
   if(req.method()==='POST')unexpectedPosts.push(path);
   return reply({errorCode:'NOT_FOUND'},404);
  });
  try{
   await page.goto(base);await page.waitForFunction(()=>FG.studio?.mode()==='remote');await exploreWelcome(page);
   await page.click('#studioNavCreate');
   await page.waitForSelector('#studioPrivateMic:visible');
   assert.match(await page.locator('#studioPrivateMic').textContent(),/Speak/);
   assert.equal(await page.locator('#studioMic').isVisible(),false,'one visible Speak action');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.click('#studioPrivateMic');
   await page.waitForFunction(()=>window.__privateStarts===1);
   assert.equal(await page.locator('#studioPrivateMic').getAttribute('aria-pressed'),'true');
   await page.click('#studioPrivateMic');
   await page.waitForFunction(()=>document.getElementById('studioPrompt').value.includes('The robot sneezes rainbow spaghetti!'));
   assert.equal(audioRequests,1);assert.equal(modelRequests,0);assert.equal(buildRequests,0);
   assert.equal(await page.locator('#studioMessages').textContent().then(t=>t.includes('The robot sneezes rainbow spaghetti!')),false,'transcription must not auto-send');
   await page.click('#studioTalk');
   await page.waitForFunction(()=>document.getElementById('studioMessages').textContent.includes('The robot sneezes rainbow spaghetti!'));
   await page.waitForFunction(()=>document.getElementById('coachModeStatus')?.textContent.includes('Chat could not check your idea'));
   assert.equal(modelRequests,1,'one explicit Send makes a coach request');
   assert.equal(buildRequests,0,'Send never starts a game build');
   assert.equal(await page.locator('#studioPrivateMic').getAttribute('aria-pressed'),'false');
   assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions.at(-1).job),null);
   assert.equal(await page.evaluate(()=>Object.values(localStorage).some(t=>String(t).includes('GkXfo')||String(t).includes('data:audio/'))),false,'never persist raw audio');
   const childOne=await page.evaluate(()=>FG.store.current().id);
   // Saved replies have their own narrator, separate from the composer. Private
   // recording must stop either reader across an asynchronous permission wait.
   const savedReader=page.locator('.studio-message.helper [data-action="read-aloud"]').last();
   await savedReader.click();await page.waitForFunction(()=>window.__privateSpeaking);
   await page.evaluate(()=>{window.__privatePermissionDelay=true;});
   await page.click('#studioPrivateMic');await page.waitForFunction(()=>!!window.__grantPrivateMic);
   assert.equal(await page.evaluate(()=>window.__privateSpeaking),false,'opening private microphone permission stops saved-message audio');
   if(!await savedReader.isDisabled())await savedReader.click();
   await page.evaluate(()=>window.__grantPrivateMic());
   await page.waitForFunction(()=>window.__privateStarts===2);
   assert.equal(await page.evaluate(()=>window.__privateAudioAtStart[1]),false,'actual private capture starts with no reading audio');
   const spokenBefore=await page.evaluate(()=>window.__privateSpoken.length);
   if(!await savedReader.isDisabled())await savedReader.click();
   if(!await page.locator('#studioHear').isDisabled())await page.locator('#studioHear').click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>window.__privateSpoken.length),spokenBefore,'saved and current-reply reading cannot start during private recording');
   assert.equal(await page.evaluate(()=>window.__privateSpeaking),false);
   await openProfiles(page);
   await page.locator('.profile-choice').nth(1).click();
   assert.ok(await page.evaluate(()=>window.__privateTracksStopped)>=2,'switching child releases microphone');
   assert.notEqual(await page.evaluate(()=>FG.store.current().id),childOne);
   assert.equal(await page.locator('#studioMessages').textContent(),'','other child has no original session conversation');
   authorized=false;
   await exploreWelcome(page);
   await page.click('#studioNavCreate');
   await page.waitForFunction(()=>document.getElementById('studioPrivateMic').hidden===true);
   assert.equal(audioRequests,1,'new child cannot capture audio without fresh approval');
   assert.deepEqual(unexpectedPosts,[]);assert.deepEqual(errors,[]);
   console.log('PASS '+device+': one Speak control, approved recording to editable draft, explicit Send only, reading/capture exclusion through delayed permission, no build, profile cleanup, no raw audio storage');
  }finally{await ctx.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
