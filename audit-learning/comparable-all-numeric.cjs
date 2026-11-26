const {build}=require('./corrected/node_modules/esbuild');
const {chromium}=require('./corrected/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const comparisons={};
 try{
  for(const dir of ['shared-original','corrected']){
   const p=await b.newPage();await p.route('http://audit.test/**',r=>r.fulfill({contentType:'text/html',body:'<main></main>'}));await p.goto('http://audit.test/');
   const root=path.join(__dirname,dir);
   const compiled=await build({stdin:{contents:"export * from './src/learning/content';export * from './src/learning/activity';export * from './src/learning/curriculum';",resolveDir:root,loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'AuditMath',write:false});
   await p.addScriptTag({content:compiled.outputFiles[0].text});
   comparisons[dir]=await p.evaluate(()=>{
    const result=[];
    for(const {id:skillId,grade} of AuditMath.SKILLS.filter(s=>s.grade>0))for(const seed of [.12,.41,.85])for(const tier of [0,1,2]){
     const item=AuditMath.generateItem(skillId,{tier,random:()=>seed,representation:'symbolic'});
     const profile={id:'synth',grade:4,hints:false,age:8,skills:{}};
     const a=AuditMath.mountMathActivity(document.querySelector('main'),{item,profile,mode:'both',onComplete(){},onSave(){}});
     const root=document.querySelector('.math-activity');
     const button=[...root.querySelectorAll('button')].find(b=>b.textContent==='Build an answer' && !b.closest('[hidden]'));button?.click();
     const quantity=root.querySelector('.math-built-number');
     const build=Boolean(quantity&&!quantity.closest('[hidden]')&&root.querySelector('[data-place="1"]'));
     const model=root.querySelector('.math-model')?.dataset?.model;
     const assessedConstruction=Boolean([...root.querySelectorAll('[data-action=check-interaction]')].find(e=>!e.closest('[hidden]')));
     result.push({skillId,grade,seed,tier,op:item.parameters.operation,answer:item.answer,kind:item.answerKind,availableQuantity:build,assessedConstruction,model});
     a.dispose();
    }
    return result;
   });await p.close();
  }
 }finally{await b.close()}
 fs.writeFileSync(path.join(__dirname,'comparable-all-numeric.json'),JSON.stringify(comparisons,null,2)+'\n');console.log(Object.fromEntries(Object.entries(comparisons).map(([name,items])=>[name,items.length])));
})().catch(e=>{console.error(e);process.exitCode=1});
