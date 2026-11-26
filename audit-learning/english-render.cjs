const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../learning');
const {build} = require(root + '/node_modules/esbuild');
const {chromium} = require(root + '/node_modules/playwright');
async function main(){
  const bundle = await build({stdin:{contents:"export * from './src/language/content'; export * from './src/language/activity';",resolveDir:root},platform:'browser',format:'iife',globalName:'LearningReview',bundle:true,write:false});
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',route=>{
    const u = new URL(route.request().url());
    if(u.origin!=='http://audit.test')return route.abort();
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<main></main>'});
    const f=path.join(root,'public',decodeURIComponent(u.pathname));
    if(fs.existsSync(f))return route.fulfill({path:f});
    return route.abort();
  });
  await page.goto('http://audit.test');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.clock.install();
  const cases = await page.evaluate(()=>{
    const api=window.LearningReview, result=[];
    for(const [pack,bank] of Object.entries(api.LANGUAGE_PACKS))for(const [skill,{items}] of Object.entries(bank)){
      for(let i=0;i<items.length;i++){
        const id=skill+':'+pack+':'+i, tier=items[i].t;
        const otherIds=Object.entries(api.LANGUAGE_PACKS).flatMap(([key,b])=>(b[skill]?.items || []).map((_,j)=>skill+':'+key+':'+j)).filter(x=>x!==id);
        const item=api.generateLanguageItem(skill,{tier,excludeIds:otherIds,random:()=>.43});
        if(item.id!==id)throw Error('Failed exact sample '+id);
        result.push(item);
      }
    }
    return result;
  });
  const failures=[],counts={},families={},grades={};
  for(const item of cases) {
    try {
      const mode=await page.evaluate(item=>{
        const profile={id:'synthetic',age:8,grade:item.grade,hints:false,skills:{},learningSubject:'language'};
        window.auditResult=[];
        window.auditActivity=window.LearningReview.mountLanguageActivity(document.querySelector('main'),{profile,item,onSave(){},onComplete(r){window.auditResult.push(r)}});
        window.auditProfile=profile;
        const root=document.querySelector('.language-activity');
        if(document.activeElement!==root.querySelector('h2'))throw Error('question did not receive focus');
        const interaction=root.dataset.interaction;
        const get=s=>{const el=root.querySelector(s);if(!el)throw Error('Missing '+s);return el;};
        if(item.grade<=0){const helper=Array.from(root.querySelectorAll('button')).find(b=>b.textContent.includes('A grown-up read'));if(!helper)throw Error('Missing required fallback');helper.click();}
        if(interaction==='sound-taps'){for(let n=0;n<Number(item.answer);n++)get('.language-beat-tap').click();get('[data-action="check-beats"]').click();}
        else if(['evidence','select-word'].includes(interaction)){
          const b=Array.from(root.querySelectorAll('.language-evidence-line')).find(e=>e.textContent===item.answer);if(!b)throw Error('Missing exact assessed text');b.click();get('[data-action="check-evidence"]').click();
        }else if(item.kind==='choice'){
          const b=Array.from(root.querySelectorAll('.language-choice')).find(e=>e.dataset.value===item.answer);if(!b)throw Error('Missing authored choice');b.click();root.querySelector('[data-action="check-gap"]')?.click();
        }else if(item.kind==='edit'){get('textarea').value=item.answer;get('form').requestSubmit();}
        else if(item.kind==='creative'){get('textarea').value='My synthetic moon garden.';get('form').requestSubmit();}
        else{
          const supplied=item.tiles.map((v,index)=>({v,index})), ordered=item.kind==='word-tiles'?Array.from(item.answer):item.answer.split(/\s+/);
          for(const token of ordered){const i=supplied.findIndex(x=>x.v===token);if(i<0)throw Error('Missing tile '+token);const {index}=supplied.splice(i,1)[0];get('[data-tile="'+index+'"]').click();}
          get('[data-action="check-tiles"]').click();
        }
        return interaction;
      },item);
      await page.clock.fastForward(700);
      const state=await page.evaluate(()=>({results:window.auditResult.map(r=>({outcome:r.outcome,independent:r.independent})),attempt:window.auditProfile.language.attempts[0].outcome}));
      if(state.results.length!==1||state.results[0].outcome!==(item.kind==='creative'?'explored':'completed')||state.results[0].independent!==Boolean(item.grade>0&&item.kind!=='creative'))throw Error('Wrong evidence '+JSON.stringify(state));
      counts[item.contentPack]=(counts[item.contentPack]||0)+1;
      families[mode]=(families[mode]||0)+1;
      grades[item.grade]=(grades[item.grade]||0)+1;
    } catch(e){failures.push({id:item.id,message:e.message});}
    await page.evaluate(()=>{window.auditActivity?.dispose();window.auditActivity=null;});
  }
  const receipt={source:'64973864679ced02b82811210c6d4ffd11710771',browser:browser.version(),viewport:{width:390,height:844},sampleCount:cases.length,counts,families,grades,failures,errors};
  fs.writeFileSync(path.join(__dirname,'english-render.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({...receipt,failures:failures.slice(0,8)}));await browser.close();
}
main().catch(e=>{console.error(e);process.exitCode=1});
