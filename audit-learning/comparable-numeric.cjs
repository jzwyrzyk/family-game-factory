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
    for(const skillId of ['g2-money','g2-length','g3-divide','g3-area','g4-angles','g3-groups','g3-multiply']){
     const item=AuditMath.generateItem(skillId,{tier:1,random:()=>.41,representation:'symbolic'});
     const profile={id:'synth',grade:4,hints:false,age:8,skills:{}};
     const a=AuditMath.mountMathActivity(document.querySelector('main'),{item,profile,mode:'both',onComplete(){},onSave(){}});
     const root=document.querySelector('.math-activity');
     const button=[...root.querySelectorAll('button')].find(b=>b.textContent==='Build an answer' && !b.closest('[hidden]'));button?.click();
     const quantity=root.querySelector('.math-built-number');
     const build=Boolean(quantity&&!quantity.closest('[hidden]')&&root.querySelector('[data-place="1"]'));
     const model=root.querySelector('.math-model')?.dataset?.model;
     result.push({skillId,op:item.parameters.operation,answer:item.answer,availableQuantity:build,model});
     a.dispose();
    }
    return result;
   });await p.close();
  }
 }finally{await b.close()}
 fs.writeFileSync(path.join(__dirname,'comparable-numeric.json'),JSON.stringify(comparisons,null,2)+'\n');console.log(JSON.stringify(comparisons));
})().catch(e=>{console.error(e);process.exitCode=1});
