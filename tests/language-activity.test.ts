import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';
import {generateLanguageItem} from '../src/language/content';
import type {LanguageItem} from '../src/language/types';

let browser:Browser,bundle:string;
const styles=readFileSync('src/language/activity.css','utf8')+'\n'+readFileSync('src/brand/icons.css','utf8')+'\n'+readFileSync('src/speech/read-aloud.css','utf8');
const iconSprite=readFileSync('public/jems-art/icons/jems-icons.svg','utf8');
before(async()=>{
  mkdirSync('test-results',{recursive:true});
  const built=await build({entryPoints:['src/language/activity.ts'],bundle:true,format:'iife',globalName:'ELATest',platform:'browser',write:false});
  bundle=built.outputFiles[0].text;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});
async function mount(item:LanguageItem,viewport:{width:number;height:number}={width:390,height:844},offset=0,hints=false){
  const page=await browser.newPage({viewport,hasTouch:viewport.width<500,reducedMotion:'reduce'});
  // The real app supplies its icon sprite from the same origin as the page.
  await page.route('http://jems.test/**',route=>{
    const sprite=new URL(route.request().url()).pathname==='/jems-art/icons/jems-icons.svg';
    return route.fulfill({contentType:sprite?'image/svg+xml':'text/html',body:sprite?iconSprite:
      '<style>html{scroll-behavior:smooth}body{margin:0;font-family:system-ui;background:#16374a}*{box-sizing:border-box}'+styles+'</style><header style="height:'+offset+'px"></header><main id="mount"></main>'});
  });
  await page.goto('http://jems.test/');
  await page.addScriptTag({content:bundle});
  await page.evaluate(({item,hints})=>{
    const w=window as any;w.profile={id:'child',age:9,grade:4,skills:{},learningSubject:'language',hints};
    w.results=[];w.saves=0;
    w.activity=w.ELATest.mountLanguageActivity(document.getElementById('mount'),{
      profile:w.profile,item,onSave(){w.saves++;},onComplete(result:any){w.results.push(result);}
    });
  },{item,hints});
  return page;
}
const state=(page:Page)=>page.evaluate(()=>{const w=window as any;return {p:w.profile,results:w.results,saves:w.saves};});
test('mobile reading passage: heading focused, no overflow, wrong response and graduated help',async()=>{
  // Keep the question below the fold even after removing the old metadata copy.
  const item=generateLanguageItem('g3-inference',{tier:0,random:()=>0}),page=await mount(item,{width:390,height:720},950,true);
  try{
    const view=await page.locator('.language-question').evaluate(el=>{const r=el.getBoundingClientRect();return {bottom:r.bottom,focused:document.activeElement===el,scroll:scrollY};});
    assert.equal(view.focused,true);
    assert.ok(view.scroll>0&&view.bottom<=721,JSON.stringify(view));
    assert.ok(await page.locator('.language-passage').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const wrong=item.choices!.find(x=>x.value!==item.answer)!;
    await page.locator('.language-choice').filter({hasText:wrong.label}).first().click();
    assert.equal(await page.locator('.language-hint').isVisible(),true);
    assert.equal((await state(page)).p.language.attempts[0].answers.length,1);
    await page.screenshot({path:'test-results/language-mobile-reading-help.png',fullPage:true});
    await page.locator('[data-action="show-solution"]').click();
    await page.locator('[data-action="continue-supported"]').click();
    const result=await state(page);
    assert.equal(result.results[0].independent,false);
    assert.equal(result.p.language.totals.shown,1);
  }finally{await page.close();}
});
test('correct multiple-choice answer records independent success',async()=>{
  const item=generateLanguageItem('g2-prefix-un-re',{tier:1,random:()=>.1}),page=await mount(item,{width:900,height:760});
  try{
    await page.locator('.language-choice').filter({hasText:item.answer!}).click();
    await page.waitForFunction(()=>(window as any).results.length===1);
    const result=await state(page);
    assert.equal(result.results[0].independent,true);
    assert.equal(result.p.language.totals.independent,1);
  }finally{await page.close();}
});
test('letter tiles allow undo and checked construction',async()=>{
  const item=generateLanguageItem('g1-plural-s',{tier:0,random:()=>.999999}),page=await mount(item);
  try{
    assert.equal(item.kind,'word-tiles');
    await page.locator('.language-tile:not([disabled])').first().click();
    await page.getByRole('button',{name:'Undo last'}).click();
    assert.equal(await page.locator('.language-built').textContent(),'Your word will appear here');
    for(const char of item.answer!.split('')){
      const available=page.locator('.language-tile:not([disabled])');
      const tiles=await available.all();
      let matched=false;
      for(const tile of tiles)if((await tile.textContent())===char){await tile.click();matched=true;break;}
      assert.ok(matched,'letter must be available');
    }
    assert.equal(await page.locator('.language-built').textContent(),item.answer);
    await page.locator('[data-action="check-tiles"]').click();
    await page.waitForFunction(()=>(window as any).results.length===1);
    assert.equal((await state(page)).p.language.totals.independent,1);
    await page.screenshot({path:'test-results/language-word-tiles.png',fullPage:true});
  }finally{await page.close();}
});
test('sentence construction and exact editing produce truthful evidence',async()=>{
  const sentence=generateLanguageItem('g3-agreement',{tier:2,random:()=>.999999}),page=await mount(sentence);
  try{
    assert.equal(sentence.kind,'sentence-tiles');
    for(const word of sentence.answer!.split(/\s+/)){
      const available=await page.locator('.language-tile:not([disabled])').all();
      let chosen=false;
      for(const tile of available)if((await tile.textContent())===word){await tile.click();chosen=true;break;}
      assert.ok(chosen,'word is available');
    }
    await page.locator('[data-action="check-tiles"]').click();
    await page.waitForFunction(()=>(window as any).results.length===1);
    assert.equal((await state(page)).p.language.totals.independent,1);
  }finally{await page.close();}
  const edit=generateLanguageItem('g1-punctuation',{tier:2,random:()=>.999999});
  const edited=await mount(edit);
  try{
    assert.equal(edit.kind,'edit');
    await edited.locator('.language-edit-input').fill(edit.answer!.toLowerCase());
    await edited.getByRole('button',{name:'Check my sentence'}).click();
    assert.equal((await state(edited)).p.language.attempts[0].answers[0].correct,false);
    await edited.locator('.language-edit-input').fill(edit.answer!);
    await edited.getByRole('button',{name:'Check my sentence'}).click();
    await edited.waitForFunction(()=>(window as any).results.length===1);
    assert.equal((await state(edited)).p.language.totals.assisted,1);
  }finally{await edited.close();}
});
test('creative writing persists unscored and abandoning a separate task is not failure',async()=>{
  const item=generateLanguageItem('g4-revision',{tier:0,random:()=>.1}),page=await mount(item);
  try{
    assert.equal(item.kind,'creative');
    await page.locator('.language-creative-input').fill('Our dragon found a lost donut on the moon.');
    await page.getByRole('button',{name:/Save my writing/}).click();
    const result=await state(page);
    assert.equal(result.p.language.attempts[0].outcome,'explored');
    assert.equal(result.p.language.attempts[0].draft,'Our dragon found a lost donut on the moon.');
    assert.equal(result.p.language.totals.independent,0);
  }finally{await page.close();}
  const interrupted=await mount(generateLanguageItem('g4-viewpoint',{tier:0,random:()=>0}));
  try{
    await interrupted.evaluate(()=>(window as any).activity.dispose());
    const result=await state(interrupted);
    assert.equal(result.p.language.attempts[0].outcome,'interrupted');
    assert.equal(result.p.language.attempts[0].answers.length,0);
  }finally{await interrupted.close();}
});

test('supported read-aloud includes displayed choices and never counts as independent reading',async()=>{
  const item=generateLanguageItem('g1-short-i-o-u',{tier:1,random:()=>.1}),page=await mount(item);
  try{
    const speak=page.locator('[data-action="read-aloud"]');
    assert.equal(await speak.count(),1,'read-aloud stays visible even before device voices load');
    await page.evaluate(()=>{
      const w=window as any;w.spoken='';
      w.SpeechSynthesisUtterance=class {
        voice:SpeechSynthesisVoice|null=null;lang='';rate=1;pitch=1;
        onstart:(()=>void)|null=null;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;
        constructor(public text:string){}
      };
      window.speechSynthesis.getVoices=()=>[
        {name:'David',voiceURI:'David',lang:'en-US',localService:true,default:true},
        {name:'Samantha',voiceURI:'Samantha',lang:'en-US',localService:true,default:false},
      ] as SpeechSynthesisVoice[];
      window.speechSynthesis.speak=(u:SpeechSynthesisUtterance)=>{
        w.spoken=u.text;w.speakingVoice=u.voice?.name;
        u.onstart?.call(u,new Event('start') as SpeechSynthesisEvent);
      };
      window.speechSynthesis.cancel=()=>{};
    });
    await speak.click();
    const spoken=await page.evaluate(()=>(window as any).spoken);
    assert.equal(await page.evaluate(()=>(window as any).speakingVoice),'Samantha');
    assert.ok(spoken.includes(item.question));
    for(const choice of item.choices||[])assert.ok(spoken.includes(choice.label),
      'Listening support should read the displayed answer choices as well as the question.');
    await page.locator('.language-choice').filter({hasText:item.answer!}).click();
    await page.waitForFunction(()=>(window as any).results.length===1);
    const result=await state(page);
    assert.equal(result.p.language.attempts[0].readTargetAt>0,true);
    assert.equal(result.results[0].independent,false);
    assert.equal(result.p.language.totals.assisted,1);
  }finally{await page.close();}
});

test('unavailable friendly voice stays readable and does not record listening support',async()=>{
  const item=generateLanguageItem('g1-short-i-o-u',{tier:1,random:()=>.1}),page=await mount(item);
  try{
    const speak=page.locator('[data-action="read-aloud"]');
    assert.equal(await speak.count(),1,'read-aloud remains discoverable even if voice is unavailable');
    await page.evaluate(()=>{
      const w=window as any;w.spokenCount=0;
      window.speechSynthesis.getVoices=()=>[
        {name:'Microsoft David',voiceURI:'David',lang:'en-US',localService:true,default:true},
        {name:'Microsoft Jenny Online (Natural)',voiceURI:'Jenny',lang:'en-US',localService:false,default:false},
      ] as SpeechSynthesisVoice[];
      window.speechSynthesis.speak=()=>{w.spokenCount++;};window.speechSynthesis.cancel=()=>{};
    });
    await speak.click();
    await page.waitForFunction(()=>document.querySelector('.language-reading-notice')?.textContent?.includes('Voice is not ready'));
    assert.equal(await page.evaluate(()=>(window as any).spokenCount),0);
    assert.equal((await state(page)).p.language.attempts[0].readTargetAt,undefined);
    await page.locator('.language-choice').filter({hasText:item.answer!}).click();
    await page.waitForFunction(()=>(window as any).results.length===1);
    assert.equal((await state(page)).results[0].independent,true);
  }finally{await page.close();}
});

test('leaving while voice choices load prevents delayed read-aloud or assistance credit',async()=>{
  const item=generateLanguageItem('g1-short-i-o-u',{tier:1,random:()=>.1}),page=await mount(item);
  try{
    const speak=page.locator('[data-action="read-aloud"]');
    assert.equal(await speak.count(),1,'read-aloud remains discoverable even if voice is unavailable');
    await page.evaluate(()=>{
      const w=window as any;w.spokenCount=0;
      window.speechSynthesis.getVoices=()=>[];
      window.speechSynthesis.speak=()=>{w.spokenCount++;};window.speechSynthesis.cancel=()=>{};
    });
    await speak.click();
    await page.evaluate(()=>{
      const w=window as any;w.activity.dispose();
      window.speechSynthesis.getVoices=()=>[
        {name:'Samantha',voiceURI:'Samantha',lang:'en-US',localService:true,default:false},
      ] as SpeechSynthesisVoice[];
      window.speechSynthesis.dispatchEvent(new Event('voiceschanged'));
    });
    assert.equal(await page.evaluate(()=>(window as any).spokenCount),0);
    const result=await state(page);
    assert.equal(result.p.language.attempts[0].readTargetAt,undefined);
    assert.equal(result.p.language.attempts[0].outcome,'interrupted');
  }finally{await page.close();}
});
