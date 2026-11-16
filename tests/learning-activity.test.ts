import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';
import {generateItem} from '../src/learning/content';
import type {MathItem,LearningMode} from '../src/learning/types';

let browser:Browser,bundle:string;
const styles=readFileSync('src/learning/activity.css','utf8');
before(async()=>{
  const output=await build({stdin:{contents:"export * from './src/learning/activity'; export * from './src/learning/visuals';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'LearningUITest',platform:'browser',write:false});
  bundle=output.outputFiles[0].text;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

async function mount(item:MathItem,mode:LearningMode='checkpoint',hints=false,challenge=false) {
  const page=await browser.newPage({viewport:{width:390,height:850}});
  await page.setContent(`<style>body{margin:0;background:#10132d;font-family:system-ui}button,input{font:inherit}*{box-sizing:border-box}${styles}</style><main id="mount"></main>`);
  await page.addScriptTag({content:bundle});
  await page.evaluate(({item,mode,hints,challenge})=>{
    const w=window as any;w.profile={id:'test-child',grade:4,age:9,skills:{},hints};w.results=[];w.saves=0;
    w.activity=w.LearningUITest.mountMathActivity(document.getElementById('mount'),{profile:w.profile,item,mode,legacyIds:true,challenge,onComplete:(result:unknown)=>w.results.push(result),onSave:()=>w.saves++});
  },{item,mode,hints,challenge});
  return page;
}
const multiply=()=>generateItem('g3-multiply',{factId:'mul:8x7',representation:'symbolic',random:()=>0});
async function evidence(page:Page){return page.evaluate(()=>{const w=window as any;return {profile:w.profile,results:w.results,saves:w.saves};});}

test('help is available before an error and the successful answer remains assisted',async()=>{
  const page=await mount(multiply());try{
    await page.locator('[data-action=hint]').click();
    assert.equal((await evidence(page)).profile.learning.attempts[0].hintLevel,1);
    await page.fill('#math-answer','56');await page.click('#math-submit');
    await page.waitForFunction(()=>(window as any).results.length===1);
    const e=await evidence(page);assert.equal(e.results[0].independent,false);assert.equal(e.profile.learning.attempts[0].answers.length,1);assert.ok(e.saves>=3);
    assert.equal(await page.locator('[data-action=hint]').isDisabled(),true);
  }finally{await page.close();}
});

test('errors survive abandonment and disposing twice does not add another outcome',async()=>{
  const page=await mount(multiply());try{
    await page.fill('#math-answer','55');await page.click('#math-submit');
    assert.equal((await evidence(page)).profile.learning.attempts[0].answers[0].raw,'55');
    await page.evaluate(()=>{(window as any).activity.dispose();(window as any).activity.dispose();});
    const e=await evidence(page);assert.equal(e.profile.learning.attempts[0].outcome,'interrupted');assert.equal(e.profile.learning.totals.interrupted,1);assert.equal(e.results.length,0);
  }finally{await page.close();}
});

test('three errors provide a worked example and a supportive way back to play',async()=>{
  const page=await mount(multiply());try{
    for(let i=0;i<3;i++){await page.fill('#math-answer','1');await page.click('#math-submit');}
    assert.equal(await page.locator('[data-action=continue-supported]').isVisible(),true);
    assert.match(await page.locator('.math-hint').textContent()||'',/56/);
    await page.locator('[data-action=continue-supported]').click();
    const e=await evidence(page);assert.equal(e.results[0].outcome,'shown');assert.equal(e.results[0].independent,false);assert.equal(e.profile.learning.attempts[0].answers.length,3);assert.equal(e.profile.learning.attempts[0].hintLevel,4);
  }finally{await page.close();}
});

test('interaction mode constructs a quantity without pre-filling the answer',async()=>{
  const page=await mount(multiply(),'interaction');try{
    assert.equal(await page.locator('.math-built-number').textContent(),'0');
    assert.equal(await page.locator('#math-answer').isVisible(),false);
    for(let i=0;i<5;i++)await page.locator('button[data-place="10"][data-delta="1"]').click();
    for(let i=0;i<6;i++)await page.locator('button[data-place="1"][data-delta="1"]').click();
    assert.equal(await page.locator('.math-built-number').textContent(),'56');
    await page.locator('[data-action=check-interaction]').click();await page.waitForFunction(()=>(window as any).results.length===1);
    const e=await evidence(page);assert.equal(e.results[0].independent,true);assert.equal(e.profile.learning.attempts[0].item.representation,'visual');assert.equal(e.profile.learning.attempts[0].answers[0].normalized,'56/1');
  }finally{await page.close();}
});

test('fraction construction is checked mathematically and keeps a single attempt across views',async()=>{
  const item=generateItem('g3-unit-fraction',{random:()=>0,representation:'symbolic'}),page=await mount(item,'both');try{
    await page.getByRole('button',{name:'Build an answer',exact:true}).click();
    assert.equal(await page.locator('.math-built-number').textContent(),'0/2');
    await page.locator('[data-fraction-part=numerator][data-delta="1"]').click();
    await page.locator('[data-action=check-interaction]').click();await page.waitForFunction(()=>(window as any).results.length===1);
    const e=await evidence(page);assert.equal(e.profile.learning.attempts.length,1);assert.equal(e.results[0].independent,true);
  }finally{await page.close();}
});

test('invalid input is not a mathematical error and choice tiles submit stable values',async()=>{
  const page=await mount(multiply());try{
    await page.fill('#math-answer','banana');await page.click('#math-submit');assert.equal((await evidence(page)).profile.learning.attempts[0].answers.length,0);
  }finally{await page.close();}
  const item=generateItem('g1-compare',{random:()=>.8}),choicePage=await mount(item);try{
    await choicePage.locator('.math-choice-grid button').filter({hasText:item.choices!.find(c=>c.value===item.answer)!.label}).click();
    await choicePage.waitForFunction(()=>(window as any).results.length===1);assert.equal((await evidence(choicePage)).results[0].independent,true);
  }finally{await choicePage.close();}
});

test('optional challenge closes a first error but never manufactures a correct response',async()=>{
  const page=await mount(multiply(),'checkpoint',false,true);try{
    await page.fill('#math-answer','1');await page.click('#math-submit');
    const e=await evidence(page);assert.equal(e.results[0].outcome,'incorrect');assert.equal(e.results[0].independent,false);assert.equal(e.profile.learning.attempts[0].correct,false);assert.equal(e.profile.learning.attempts[0].answers.length,1);
  }finally{await page.close();}
});

test('a disposed activity cannot call back into another game after its success delay',async()=>{
  const page=await mount(multiply());try{
    await page.fill('#math-answer','56');await page.click('#math-submit');await page.evaluate(()=>(window as any).activity.dispose());
    await page.waitForTimeout(500);const e=await evidence(page);assert.equal(e.results.length,0);assert.equal(e.profile.learning.attempts[0].outcome,'completed');
  }finally{await page.close();}
});

test('diagrams are mathematical, mobile-safe and curriculum text is never HTML',async()=>{
  const item={...multiply(),question:'<img src=x onerror="alert(1)"> stays text'},page=await mount(item);try{
    assert.equal(await page.locator('.math-activity img').count(),0);
    const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert.ok(dimensions.scroll<=dimensions.client);
    const result=await page.evaluate(()=>{
      const w=window as any, triangle=w.LearningUITest.renderMathVisual({kind:'shape',shape:'triangle'}),rect=w.LearningUITest.renderMathVisual({kind:'shape',shape:'rectangle',width:6,height:3}),line=w.LearningUITest.renderMathVisual({kind:'number-line',min:0,max:1,start:0,jumps:[1/3,1/3]});
      const points=(node:HTMLElement)=>node.querySelector('polygon')!.getAttribute('points')!.split(' ').map(p=>p.split(',').map(Number));
      const plot=w.LearningUITest.renderMathVisual({kind:'line-plot',labels:['1/4 m','2/4 m','3/4 m'],values:[2,4,1]});
      return {triangle:points(triangle),rectangle:points(rect),line:line.textContent,plotMarks:plot.querySelectorAll('[data-frequency-mark]').length,plot:plot.textContent};
    });
    const distances=result.triangle.map((p:number[],i:number)=>Math.hypot(p[0]-result.triangle[(i+1)%3][0],p[1]-result.triangle[(i+1)%3][1]));
    assert.ok(Math.max(...distances)-Math.min(...distances)<.001);
    assert.equal((result.rectangle[1][0]-result.rectangle[0][0])/(result.rectangle[2][1]-result.rectangle[1][1]),2);
    assert.match(result.line||'',/1\/3/);assert.doesNotMatch(result.line||'',/0\.3333/);
    assert.equal(result.plotMarks,7);assert.match(result.plot||'',/1\/4 m/);
  }finally{await page.close();}
});
