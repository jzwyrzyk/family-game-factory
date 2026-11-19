/** Real browser behavior of the Grown-ups privacy form, with all server
 * actions mocked; HTTP trust and external receipt semantics are separately
 * covered by tests/parent-privacy.test.ts.
 */
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {chromium}=require('playwright');

(async()=>{
 const bundle=await build({entryPoints:['src/builder/privacy.ts'],bundle:true,platform:'browser',
  format:'iife',globalName:'ParentPrivacy',write:false,logLevel:'silent'});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const device of [{name:'desktop',viewport:{width:1240,height:850}},
   {name:'mobile',viewport:{width:390,height:844}}]){
   const page=await browser.newPage({viewport:device.viewport,hasTouch:device.name==='mobile'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<main><section id="parent"></section></main>');
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.evaluate(()=>{
    window.__data={status:'not-requested',scopes:{generation:false,conversation:false,remoteSpeech:false}};
    window.__calls=[];
    const client={api:async(path,body)=>{
     window.__calls.push({path,body});
     if(path==='/v1/devices/privacy'&&body===undefined)return window.__data;
     if(path==='/v1/devices/privacy'&&body){
      if(!body.guardianAffirmed||!body.providerAcknowledged)throw Error('invalid');
      window.__data={status:'pending',choiceId:'12345678-1234-4123-8123-123456789abc',scopes:body.scopes};
      return {status:'pending'};
     }
     if(path==='/v1/devices/privacy/erase'){if(body.confirm!==true)throw Error('Missing confirmation');return {erased:3};}
     if(path==='/v1/devices/privacy/revoke'){window.__data={status:'revoked',scopes:window.__data.scopes};return {status:'revoked'};}
     throw Error('Unexpected API route');
    }};
    window.__panel=ParentPrivacy.installParentPrivacy(client,document.querySelector('#parent'));
   });
   assert.equal(await page.locator('#builderPrivacyPanel').isVisible(),false,'hidden before parent unlock');
   await page.evaluate(()=>window.__panel.show());
   assert.equal(await page.locator('#builderPrivacyPanel').isVisible(),true);
   assert.match(await page.locator('#builderPrivacyPanel details').first().textContent(),/Zero Data Retention/);
   await page.locator('#privacyGeneration').check();
   await page.locator('#privacyConversation').check();
   await page.locator('#privacyGuardian').check();
   await page.locator('#privacyProvider').check();
   await page.getByRole('button',{name:'Submit choices for verification'}).click();
   await page.waitForFunction(()=>window.__data.status==='pending');
   const chosen=await page.evaluate(()=>window.__calls.find(x=>x.path==='/v1/devices/privacy'&&x.body)?.body);
   assert.equal(chosen.noticeVersion,'jems-parent-privacy-2026-11-v1');
   assert.deepEqual(chosen.scopes,{generation:true,conversation:true,remoteSpeech:false});
   assert.equal(chosen.guardianAffirmed,true);
   assert.equal(chosen.providerAcknowledged,true);
   await page.waitForFunction(()=>document.querySelector('#builderPrivacyStatus')?.textContent?.includes('awaiting separate guardian verification'));
   assert.match(await page.locator('#builderPrivacyStatus').innerText(),/awaiting separate guardian verification/);
   assert.equal(await page.locator('#privacyGuardian').isChecked(),false);
   assert.match(await page.locator('#privacyChoiceReference').textContent(),/Request reference: 12345678-1234-4123-8123-123456789abc/);
   page.once('dialog',dialog=>void dialog.accept());
   await page.getByRole('button',{name:'Withdraw permissions'}).click();
   await page.waitForFunction(()=>window.__data.status==='revoked');
   await page.waitForFunction(()=>document.querySelector('#builderPrivacyStatus')?.textContent?.includes('withdrawn'));
   assert.match(await page.locator('#builderPrivacyStatus').innerText(),/withdrawn/i);
   await page.getByText('Clear temporary server conversation records',{exact:true}).click();
   page.once('dialog',dialog=>void dialog.accept());
   await page.click('#privacyErase');
   await page.waitForFunction(()=>document.getElementById('builderPrivacyStatus').textContent.includes('Cleared 3 temporary server records'));
   assert.match(await page.locator('#builderPrivacyStatus').textContent(),/Local notebooks, saved games and billing totals remain/);
   assert.deepEqual(await page.evaluate(()=>window.__calls.find(x=>x.path==='/v1/devices/privacy/erase').body),{confirm:true});
   await page.evaluate(()=>window.__panel.hide());
   assert.equal(await page.locator('#builderPrivacyPanel').isVisible(),false);
   assert.deepEqual(errors,[],'no JavaScript errors on '+device.name);
   await page.close();
  }
  console.log('PASS parent privacy consent screen desktop/mobile: no implicit approval, pending, revocation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
