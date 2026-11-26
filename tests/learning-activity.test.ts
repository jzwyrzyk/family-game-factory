import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {build,buildSync} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';
import {generateItem} from '../src/learning/content';
import type {MathItem,LearningMode} from '../src/learning/types';

let browser:Browser,bundle:string;
const styles=buildSync({entryPoints:['src/learning/activity.css'],bundle:true,write:false}).outputFiles[0].text+'\n'+readFileSync('src/speech/read-aloud.css','utf8')+'\n'+readFileSync('src/brand/icons.css','utf8');
before(async()=>{
  const output=await build({stdin:{contents:"export * from './src/learning/activity'; export * from './src/learning/visuals';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'LearningUITest',platform:'browser',write:false});
  bundle=output.outputFiles[0].text;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

async function mount(item:MathItem,mode:LearningMode='checkpoint',hints=false,challenge=false,layout:{offset?:number;height?:number}={}) {
  const page=await browser.newPage({viewport:{width:390,height:layout.height||850}});
  await page.route('http://jems.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:readFileSync('public/jems-art/icons/jems-icons.svg','utf8')}));
  await page.setContent(`<base href="http://jems.test/"><style>html{scroll-behavior:smooth}body{margin:0;background:#10132d;font-family:system-ui}button,input{font:inherit}*{box-sizing:border-box}${styles}</style><header style="height:${layout.offset||0}px"></header><main id="mount"></main><footer style="height:200px"></footer>`);
  await page.addScriptTag({content:bundle});
  await page.evaluate(({item,mode,hints,challenge})=>{
    const w=window as any;w.profile={id:'test-child',grade:4,age:9,skills:{},hints};w.results=[];w.saves=0;
    // Native methods remain self-contained when Playwright serializes this
    // function; tsx's named-arrow transform would reference a Node-only helper.
    w.activity=w.LearningUITest.mountMathActivity(document.getElementById('mount'),{profile:w.profile,item,mode,legacyIds:true,challenge,onComplete(result:unknown){w.results.push(result);},onSave(){w.saves++;}});
  },{item,mode,hints,challenge});
  return page;
}
const multiply=()=>generateItem('g3-multiply',{factId:'mul:8x7',representation:'symbolic',random:()=>0});
async function evidence(page:Page){return page.evaluate(()=>{const w=window as any;return {profile:w.profile,results:w.results,saves:w.saves};});}

test('a below-fold question receives visible heading focus without opening a text input',async()=>{
  const page=await mount(multiply(),'checkpoint',false,false,{offset:1100,height:568});try{
    const state=await page.locator('.math-activity h2').evaluate(node=>{
      const box=node.getBoundingClientRect();return {focused:document.activeElement===node,top:box.top,bottom:box.bottom,height:innerHeight,scroll:scrollY};
    });
    assert.equal(state.focused,true);assert.ok(state.scroll>0);assert.ok(state.top>=0&&state.bottom<=state.height,'the actual question is in the mobile viewport');
    assert.equal(await page.locator('#math-answer').evaluate(node=>document.activeElement===node),false,'entry does not request the software keyboard');
    await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action=read-aloud]').evaluate(node=>document.activeElement===node),true,'the optional speaker is the first action after the question');
    await page.keyboard.press('Tab');assert.equal(await page.locator('#math-answer').evaluate(node=>document.activeElement===node),true,'the next keyboard step reaches the answer');
    const e=await evidence(page);assert.equal(e.profile.learning.attempts.length,1);assert.equal(e.profile.learning.attempts[0].answers.length,0);
  }finally{await page.close();}
});

test('requested hints expose their reasoning and offer a visible way back to the same answer',async()=>{
  const item=multiply(),page=await mount(item,'checkpoint',false,false,{offset:900,height:568});try{
    const id=await page.locator('.math-activity').getAttribute('data-attempt-id');
    await page.getByRole('button',{name:'Give me a hint',exact:true}).click();
    const help=await page.locator('.math-hint h3').evaluate(node=>{
      const box=node.getBoundingClientRect(),description=document.getElementById(node.getAttribute('aria-describedby')||'');
      return {focused:document.activeElement===node,text:description?.textContent,top:box.top,bottom:box.bottom,height:innerHeight};
    });
    assert.equal(help.focused,true);assert.equal(help.text,item.hints[0].text);assert.ok(help.top>=0&&help.bottom<=help.height);
    await page.getByRole('button',{name:'Back to my answer',exact:true}).click();
    const answer=await page.locator('#math-answer').evaluate(node=>{const box=node.getBoundingClientRect();return {focused:document.activeElement===node,visible:box.top>=0&&box.bottom<=innerHeight};});
    assert.deepEqual(answer,{focused:true,visible:true});assert.equal(await page.locator('.math-activity').getAttribute('data-attempt-id'),id);
    const e=await evidence(page);assert.equal(e.profile.learning.attempts[0].answers.length,0);assert.equal(e.profile.learning.attempts[0].hintLevel,1);
  }finally{await page.close();}
});

test('automatic hints announce the reasoning while keeping the current answer control',async()=>{
  const item=multiply(),page=await mount(item,'checkpoint',true);try{
    await page.fill('#math-answer','55');await page.click('#math-submit');
    assert.equal(await page.locator('#math-submit').evaluate(node=>document.activeElement===node),true);
    const announcement=page.locator('[data-math-announcement="help"]');
    assert.equal(await announcement.getAttribute('aria-live'),'polite');assert.equal(await announcement.getAttribute('aria-atomic'),'true');
    assert.equal(await announcement.textContent(),`Hint 1. ${item.hints[0].text}`);
    const e=await evidence(page);assert.equal(e.profile.learning.attempts[0].answers.length,1);assert.equal(e.profile.learning.attempts[0].hintLevel,1);
  }finally{await page.close();}
});

test('worked examples focus the explanation before a keyboard continuation',async()=>{
  const item=multiply(),page=await mount(item,'checkpoint',false,false,{offset:900,height:568});try{
    for(let i=0;i<3;i++){await page.fill('#math-answer','1');await page.click('#math-submit');}
    const help=await page.locator('.math-hint h3').evaluate(node=>{
      const box=node.getBoundingClientRect();return {focused:document.activeElement===node,text:document.getElementById(node.getAttribute('aria-describedby')||'')?.textContent,visible:box.top>=0&&box.bottom<=innerHeight};
    });
    assert.deepEqual(help,{focused:true,text:item.workedExample,visible:true});
    await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action=continue-supported]').evaluate(node=>document.activeElement===node),true);
    await page.keyboard.press('Enter');const e=await evidence(page);
    assert.equal(e.results.length,1);assert.equal(e.results[0].outcome,'shown');assert.equal(e.results[0].independent,false);assert.equal(e.profile.learning.attempts[0].answers.length,3);
  }finally{await page.close();}
});

test('focus recovery does not revive a disposed activity or steal navigation focus',async()=>{
  const page=await mount(multiply());try{
    const recovered=await page.evaluate(()=>{
      const w=window as any,exit=document.createElement('button');exit.id='left-math';exit.textContent='My games';document.body.append(exit);exit.focus();w.activity.dispose();
      return {focused:w.activity.focus(),active:document.activeElement?.id};
    });
    assert.deepEqual(recovered,{focused:false,active:'left-math'});
    const e=await evidence(page);assert.equal(e.profile.learning.attempts[0].outcome,'interrupted');assert.equal(e.results.length,0);
  }finally{await page.close();}
});

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
  const item=generateItem('g2-hundreds',{random:()=>0});
  const page=await mount(item,'interaction');try{
    assert.equal(await page.locator('.math-built-number').textContent(),'0');
    assert.equal(await page.locator('#math-answer').isVisible(),false);
    await page.locator('button[data-place="100"][data-delta="1"]').click();
    await page.locator('button[data-place="10"][data-delta="1"]').click();
    assert.equal(await page.locator('.math-built-number').textContent(),String(item.answer));
    await page.locator('[data-action=check-interaction]').click();await page.waitForFunction(()=>(window as any).results.length===1);
    const e=await evidence(page);assert.equal(e.results[0].independent,true);assert.equal(e.profile.learning.attempts[0].item.representation,'visual');assert.equal(e.profile.learning.attempts[0].answers[0].normalized,item.answer+'/1');
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

test('dense number lines keep every exact tick label readable at mobile widths',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:844}});try{
    await page.route('http://jems.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:readFileSync('public/jems-art/icons/jems-icons.svg','utf8')}));
  await page.setContent(`<base href="http://jems.test/"><style>body{margin:0;background:#10132d;font-family:system-ui}main{padding:0 24px}${styles}</style><main><div class="math-activity" id="diagrams"></div></main>`);
    await page.addScriptTag({content:bundle});
    await page.evaluate(()=>{
      const w=window as any,host=document.getElementById('diagrams')!;
      host.append(w.LearningUITest.renderMathVisual({kind:'number-line',min:0,max:20,start:18,jumps:[]}),w.LearningUITest.renderMathVisual({kind:'number-line',min:0,max:1,start:0,jumps:[1/12]}));
    });
    for(const width of [320,390,960]){
      await page.setViewportSize({width,height:844});
      const diagrams=await page.locator('.math-visual').evaluateAll(figures=>figures.map(figure=>{
        const bounds=figure.querySelector('svg')!.getBoundingClientRect();
        return {left:bounds.left,right:bounds.right,bottom:bounds.bottom,labels:Array.from(figure.querySelectorAll('[data-number-line-label]')).map(node=>{
          const box=node.getBoundingClientRect();return {text:node.textContent,left:box.left,right:box.right,top:box.top,bottom:box.bottom};
        })};
      }));
      assert.deepEqual(diagrams[0].labels.map(label=>label.text),Array.from({length:21},(_,i)=>String(i)),'every integer remains labelled');
      assert.equal(diagrams[1].labels.length,13);assert.ok(diagrams[1].labels.some(label=>label.text==='11/12'),'fraction ticks remain exact');
      for(const diagram of diagrams)for(let i=0;i<diagram.labels.length;i++){
        const label=diagram.labels[i];
        assert.ok(label.left>=diagram.left&&label.right<=diagram.right&&label.bottom<=diagram.bottom,`${width}px: ${label.text} stays inside its drawing`);
        for(const other of diagram.labels.slice(i+1))if(label.top<other.bottom&&other.top<label.bottom){
          const gap=Math.max(other.left-label.right,label.left-other.right);
          assert.ok(gap>=4,`${width}px: labels ${label.text} and ${other.text} have visible separation (${gap}px)`);
        }
      }
    }
  }finally{await page.close();}
});

test('diagrams are mathematical, mobile-safe and curriculum text is never HTML',async()=>{
  const item={...multiply(),question:'<img src=x onerror="alert(1)"> stays text'},page=await mount(item);try{
    assert.equal(await page.locator('.math-activity img').count(),0);
    const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert.ok(dimensions.scroll<=dimensions.client);
    const result=await page.evaluate(()=>{
      const w=window as any, triangle=w.LearningUITest.renderMathVisual({kind:'shape',shape:'triangle'}),rect=w.LearningUITest.renderMathVisual({kind:'shape',shape:'rectangle',width:6,height:3}),line=w.LearningUITest.renderMathVisual({kind:'number-line',min:0,max:1,start:0,jumps:[1/3,1/3]});
      const plot=w.LearningUITest.renderMathVisual({kind:'line-plot',labels:['1/4 m','2/4 m','3/4 m'],values:[2,4,1]});
      return {triangle:triangle.querySelector('polygon')!.getAttribute('points')!.split(' ').map((p:string)=>p.split(',').map(Number)),rectangle:rect.querySelector('polygon')!.getAttribute('points')!.split(' ').map((p:string)=>p.split(',').map(Number)),line:line.textContent,plotMarks:plot.querySelectorAll('[data-frequency-mark]').length,plot:plot.textContent};
    });
    const distances=result.triangle.map((p:number[],i:number)=>Math.hypot(p[0]-result.triangle[(i+1)%3][0],p[1]-result.triangle[(i+1)%3][1]));
    assert.ok(Math.max(...distances)-Math.min(...distances)<.001);
    assert.equal((result.rectangle[1][0]-result.rectangle[0][0])/(result.rectangle[2][1]-result.rectangle[1][1]),2);
    assert.match(result.line||'',/1\/3/);assert.doesNotMatch(result.line||'',/0\.3333/);
    assert.equal(result.plotMarks,7);assert.match(result.plot||'',/1\/4 m/);
  }finally{await page.close();}
});


test('Math question and help share explicit read-aloud without reading the answer or adding a hint',async()=>{
  const item=multiply(),page=await mount(item);
  try{
    await page.evaluate(()=>{
      const w=window as any;w.spoken=[];w.SpeechSynthesisUtterance=class {constructor(public text:string){};onstart:(()=>void)|null=null;};
      window.speechSynthesis.getVoices=()=>[{name:'Samantha (Enhanced)',voiceURI:'Samantha',lang:'en-US',localService:true,default:false}] as SpeechSynthesisVoice[];
      window.speechSynthesis.speak=utterance=>{w.spoken.push(utterance.text);utterance.onstart?.call(utterance,new Event('start') as SpeechSynthesisEvent);};window.speechSynthesis.cancel=()=>{};
    });
    await page.locator('[data-action=read-aloud]').click();
    assert.equal(await page.evaluate(()=>(window as any).spoken[0]),item.question);
    assert.equal((await evidence(page)).profile.learning.attempts[0].hintLevel,0);
    await page.getByRole('button',{name:'Give me a hint',exact:true}).click();
    await page.locator('[data-action=read-help]').click();
    assert.ok((await page.evaluate(()=>(window as any).spoken.at(-1))).includes(item.hints[0].text));
    assert.equal((await evidence(page)).profile.learning.attempts[0].hintLevel,1);
    await page.evaluate(()=>(window as any).activity.dispose());
    assert.equal(await page.locator('[data-action=read-aloud]').count(),0);
  }finally{await page.close();}
});
