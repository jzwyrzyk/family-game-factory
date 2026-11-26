const {chromium}=require('./source/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.route('http://localhost:43199/',r=>r.fulfill({contentType:'text/html',path:path.join(__dirname,'source/dist-review/jems-ui-review.html')}));
 await page.goto('http://localhost:43199/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#loading').hidden);
 await page.selectOption('#destination','learn:g4-add-fraction');
 await page.waitForFunction(()=>document.querySelector('#appFrame').contentWindow.FG?.learning.activeItem?.skillId==='g4-add-fraction');
 await page.selectOption('#grade','1');
 await page.waitForFunction(()=>document.querySelector('#appFrame').contentWindow.FG?.store.current().grade===1 && document.querySelector('#status').textContent.includes('Could not open state'));
 const result=await page.evaluate(()=>({status:document.querySelector('#status').textContent,grade:document.querySelector('#grade').value,route:document.querySelector('#destination').value,active:document.querySelector('#appFrame').contentWindow.FG.learning.active}));
 console.log(result);fs.writeFileSync(path.join(__dirname,'grade-switch.json'),JSON.stringify(result,null,2)+'\n');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
