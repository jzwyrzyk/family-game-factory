const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('./corrected/node_modules/playwright'),{build}=require('./corrected/node_modules/esbuild');
const root=path.join(__dirname,'quantity-final'),source=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
(async()=>{
 const d=JSON.parse(fs.readFileSync(path.join(__dirname,'comparable-all-numeric.json'),'utf8'));
 const selected=d.corrected.filter((b,i)=>d['shared-original'][i].availableQuantity&&!b.availableQuantity);
 const receipt={source,items:selected.length,passed:{specialized:0,blocks:0,written:0},failures:[],errors:[],byModel:{}};
 const bundle=await build({stdin:{contents:"export * from './src/learning/activity';export * from './src/learning/content';",resolveDir:root,loader:'ts'},bundle:true,format:'iife',globalName:'AuditMath',platform:'browser',write:false});
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>receipt.errors.push(e.message));
  await p.route('http://audit.test/**',r=>r.fulfill({contentType:'text/html',body:'<main></main>'}));await p.goto('http://audit.test/');await p.addScriptTag({content:bundle.outputFiles[0].text});await p.clock.install();
  for(const it of selected)for(const route of it.assessedConstruction?['specialized','blocks','written']:['blocks']){
   try{
    await p.evaluate(({it,route})=>{
     const item=AuditMath.generateItem(it.skillId,{tier:it.tier,random:()=>it.seed,representation:'symbolic'});
     const profile={id:'synthetic',grade:it.grade,hints:false,age:9,skills:{}};const results=[];const host=document.querySelector('main');
     const a=AuditMath.mountMathActivity(host,{item,profile,mode:'both',onComplete:r=>results.push(r),onSave(){}});
     window.runState={a,profile,results};const root=host.querySelector('.math-activity'),id=root.dataset.attemptId,answer=Number(item.answer);
     const must=(ok,msg)=>{if(!ok)throw Error(msg)};
     const visible=e=>e&&!e.closest('[hidden]');
     const button=(container,selector)=>{const b=[...container.querySelectorAll(selector)].find(visible);must(b&&!b.disabled,'missing/disabled '+selector);return b;};
     const tab=text=>{const t=[...root.querySelectorAll('.math-mode-tabs button')].find(b=>b.textContent===text&&visible(b));must(t,'missing tab '+text);t.click();must(t.getAttribute('aria-pressed')==='true','wrong active tab');must(root.dataset.attemptId===id,'changed attempt');};
     const blocksTab=it.assessedConstruction?'Build with base-ten blocks':'Build an answer';
     const preferred=root.querySelector('[data-model="'+it.model+'"]');must(visible(preferred),'default model hidden');
     tab(blocksTab);let blocks=root.querySelector('[data-model=blocks]');must(visible(blocks),'blocks hidden');
     if(it.assessedConstruction)must(!visible(preferred),'competing active check');
     else must(visible(preferred),'exploration lost');
     button(blocks,'button[data-place="1"][data-delta="1"]').click();
     tab('Write an answer');must(visible(root.querySelector('.math-answer-input')),'input hidden');
     tab(blocksTab);must(blocks.querySelector('.math-built-number').textContent==='1','lost blocks when toggling');
     button(blocks,'[data-piece]').click();
     tab('Write an answer');tab('Build an answer');
     if(it.assessedConstruction)must(visible(preferred),'lost specialized path');
     must(profile.learning.attempts.length===1&&profile.learning.attempts[0].answers.length===0,'editing saved a response');
     if(route==='specialized'){
      if(it.model==='frames'){
       for(let i=0;i<answer;i++)button(preferred,'button.model-cell[aria-pressed="false"]:not(:disabled)').click();
       if(answer===0)[...preferred.querySelectorAll('button')].find(b=>b.textContent==='Choose zero').click();
      }else if(it.model==='numberLine'){
       const r=preferred.querySelector('input[type=range]');r.value=String(answer);r.dispatchEvent(new Event('change',{bubbles:true}));
      }else if(it.model==='fractions'){
       for(let i=0;i<answer;i++)button(preferred,'button[data-fraction-part="numerator"][data-delta="1"]').click();
       if(answer===0)[...preferred.querySelectorAll('button')].find(b=>b.textContent==='Choose zero').click();
      }else throw Error('unknown '+it.model);
      button(preferred,'[data-action=check-interaction]').click();
     }else if(route==='blocks'){
      tab(blocksTab);let remaining=Math.round(answer*100);
      for(const add of [...blocks.querySelectorAll('button[data-place][data-delta="1"]')]){
       const place=Number(add.dataset.place);const unit=Math.round(place*100),n=Math.floor(remaining/unit);remaining-=n*unit;
       for(let i=0;i<n;i++)button(blocks,'button[data-place="'+place+'"][data-delta="1"]').click();
      }
      if(answer===0)[...blocks.querySelectorAll('button')].find(b=>b.textContent==='Choose zero').click();
      must(Number(blocks.querySelector('.math-built-number').textContent)===answer,'constructed value mismatch');
      button(blocks,'[data-action=check-interaction]').click();
     }else{
      tab('Write an answer');const input=root.querySelector('.math-answer-input');input.value=String(answer);input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();
     }
    },{it,route});
    await p.clock.fastForward(600);
    const state=await p.evaluate(()=>{const {profile,results}=window.runState,att=profile.learning.attempts[0];return {attempts:profile.learning.attempts.length,answers:att.answers.length,correct:att.correct,independent:att.independent,representation:att.item.representation,outcome:att.outcome,callbacks:results.length};});
    assert.deepEqual(state,{attempts:1,answers:1,correct:true,independent:true,representation:'visual',outcome:'completed',callbacks:1});receipt.passed[route]++;
    receipt.byModel[it.model]=(receipt.byModel[it.model]||0)+1;
   }catch(e){receipt.failures.push({skill:it.skillId,seed:it.seed,tier:it.tier,route,message:e.message.slice(0,300)});}
   await p.evaluate(()=>{window.runState?.a.dispose();});
  }
 }finally{await b.close();}
 fs.writeFileSync(path.join(__dirname,'final-answer-routes.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({...receipt,failures:receipt.failures.slice(0,2)}));if(receipt.failures.length||receipt.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
