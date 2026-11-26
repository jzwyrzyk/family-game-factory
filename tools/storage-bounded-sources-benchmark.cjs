/* Supplemental real-browser bounded profile/learning/APS measurements.
 * TARGET must be built. Synthetic only; no provider or gateway requests. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {buildSync}=require('esbuild'),{chromium}=require('playwright');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
assert.equal(execFileSync('git',['diff','--name-only','HEAD','--','src'],{cwd:root,encoding:'utf8'}).trim(),'');
const bridge=buildSync({stdin:{contents:`
 export {beginAttempt,submitAnswer} from './src/learning/engine';
 export {legacyFactItem} from './src/learning/content';
 export {beginLanguageAttempt,submitLanguageAnswer,finishLanguageAttempt} from './src/language/engine';
 export {generateLanguageItem} from './src/language/content';
 export {ProblemSolvingStore} from './src/problem-solving/storage';
 export {validateProblemSolvingWorkspace,PROBLEM_SOLVING_KEY} from './src/problem-solving/model';
 `,resolveDir:root},bundle:true,format:'iife',globalName:'BoundedBenchmark',write:false}).outputFiles[0].text;
(async()=>{const server=require(path.join(root,'tests/browser-server.cjs')).start(path.join(root,'dist'));
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const origin=`http://127.0.0.1:${server.address().port}`,rows=[];
 try{for(const [scenario,profiles,attempts,facts,episodes]of [['small',1,10,10,20],['medium',3,60,100,100],['large',6,120,100,200],['bounded-quota-stress',6,120,250,200]]){
  const context=await browser.newContext(),page=await context.newPage();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/arcade/');await page.waitForFunction(()=>window.FG?.studio&&window.FG?.store);await page.addScriptTag({content:bridge});
  rows.push(await page.evaluate(({scenario,profiles,attempts,facts,episodes})=>{
   const B=BoundedBenchmark,t=Date.UTC(2026,10,25),template=structuredClone(FG.store.current()),family=FG.store.data;
   const mathItem=B.legacyFactItem('mul:8x7'),languageItem=B.generateLanguageItem('g3-main-idea',{random:()=>.1});
   const model={...template,grade:3,skills:{},learningSetupComplete:true};
   for(let i=0;i<attempts;i++){const a=B.beginAttempt(model,mathItem,{now:t+i*1000,sessionId:'fixture-'+i,gameId:'dragon'});B.submitAnswer(model,a.id,String(mathItem.answer),t+i*1000+100);const l=B.beginLanguageAttempt(model,languageItem,{now:t+i*1000,gameId:'dragon'});B.submitLanguageAnswer(model,l.id,languageItem.answer,t+i*1000+100);B.finishLanguageAttempt(model,l.id,'completed',t+i*1000+200);}
   const fact=structuredClone(Object.values(model.learning.facts)[0]);model.learning.facts=Object.fromEntries(Array.from({length:facts},(_,i)=>['synthetic-fact-'+i,structuredClone(fact)]));
   family.profiles=Array.from({length:profiles},(_,i)=>({...structuredClone(model),id:'bounded-player-'+i,name:'Synthetic '+i}));family.activeProfile=family.profiles[0].id;
   FG.store.validateBackup(JSON.stringify(family));if(!FG.store.save())throw Error('Synthetic profile fixture exceeds available storage');
   const data={schema:'jems.problem-solving.workspace.v1',episodes:family.profiles.flatMap(p=>Array.from({length:episodes},(_,i)=>({schema:'jems.problem-solving.episode.v1',id:'context-'+i,owner:p.id,sessionId:'fixture-'+i,source:'studio',kind:'context-only',task:{id:'context',family:'synthetic',version:'v1',label:'Synthetic source observation',exposure:'unknown',firstAttempt:false},startedAt:new Date(t+i*1000).toISOString(),completedAt:new Date(t+i*1000+100).toISOString(),observations:[],context:'Synthetic saved source result; not an assessment.'}))),drafts:[],discardedByOwner:{}};
   B.validateProblemSolvingWorkspace(data);const apsRaw=JSON.stringify(data),priorAps=localStorage.getItem(B.PROBLEM_SOLVING_KEY),priorProfile=localStorage.getItem('family-game-factory-state-v1');try{localStorage.setItem(B.PROBLEM_SOLVING_KEY,apsRaw);}catch(error){if(error.name!=='QuotaExceededError')throw error;return {scenario,status:'refused-capacity',phase:'synthetic-APS-seed',profiles,attemptsPerSubjectPerProfile:attempts,factsPerProfile:facts,initialApsEpisodesPerProfile:episodes,profileUtf8Bytes:new TextEncoder().encode(priorProfile).length,attemptedApsUtf8Bytes:new TextEncoder().encode(apsRaw).length,errorName:error.name,profilePreserved:priorProfile===localStorage.getItem('family-game-factory-state-v1'),priorApsPreserved:priorAps===localStorage.getItem(B.PROBLEM_SOLVING_KEY)};}
   const store=new B.ProblemSolvingStore(localStorage,()=>family.activeProfile),runs=[];
   const measure=fn=>{const at=performance.now();fn();return performance.now()-at;};
   for(let i=0;i<5;i++){const run={};let raw;run.profileStringifyMs=measure(()=>raw=JSON.stringify(family));run.profileParseMs=measure(()=>JSON.parse(raw));run.profileSaveMs=measure(()=>{if(!FG.store.save())throw Error('Profile save rejected');});run.profileValidateMs=measure(()=>FG.store.validateBackup(raw));run.apsListMs=measure(()=>store.list(family.activeProfile));run.apsExportMs=measure(()=>store.export());const next={...data.episodes.find(e=>e.owner===family.activeProfile),id:'supplemental-'+i,startedAt:new Date(t+999000+i*1000).toISOString(),completedAt:new Date(t+999100+i*1000).toISOString()};run.apsRecordMs=measure(()=>store.record(next));runs.push(run);}
   return {scenario,profiles,attemptsPerSubjectPerProfile:attempts,factsPerProfile:facts,initialApsEpisodesPerProfile:episodes,profileUtf8Bytes:new TextEncoder().encode(localStorage.getItem('family-game-factory-state-v1')).length,apsUtf8Bytes:new TextEncoder().encode(localStorage.getItem(B.PROBLEM_SOLVING_KEY)).length,apsRetention:store.retention(family.activeProfile),runs};
  },{scenario,profiles,attempts,facts,episodes}));await context.close();console.error('Measured bounded sources '+scenario);
 }
 const report={schema:'jems.bounded-sources-benchmark.v1',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),harnessSha256:createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),browser:browser.version(),samples:5,notes:['Actual built FG.store save/validate and real localStorage ProblemSolvingStore APIs; synthetic source seed, desktop Chromium; no cloud.','Not maximum simultaneous capacity: large six profiles each use100 of1500 allowed fact summaries; APS1200 total remains under1million-character envelope.','Additional250fact-per-profile stress case records simultaneous localStorage quota refusal explicitly, without counting failed fixture setup as a successful save.','Five APS writes exercise existing retention semantics: large current owner remains200 episodes with discarded count; this benchmark changes no retention policy.','Independent supplemental run, not part of game/art library timings; warm API CPU/wall observations include shared host scheduling.'],rows};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
