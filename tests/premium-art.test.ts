import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {extractSheet,reusableSheet,rgbaPng} from '../server/agent/sprite-sheet';
import {assetPackHash,validateAssetPack} from '../server/agent/game-assets';
import {requirePlannedAssets,readArtDirection} from '../server/quality/art-direction';
import {assertProductionPlanBinding,bindGameProductionPlan,validateGameProductionPlan,presentationBrief,permitsNewArt} from '../server/quality/presentation-plan';
import {artCases,authoredCase} from '../tools/premium-art-cases';
import {compareSchedule} from '../tools/premium-art-scheduling';
import {produceGameArt} from '../server/agent/illustrations';
import {fixtureApproval} from '../tools/premium-art-benchmark';
import {createGame as fox} from '../tools/premium-art/fox.game.js';
import {createGame as factory} from '../tools/premium-art/factory.game.js';
import {createGame as horse} from '../tools/premium-art/horse.game.js';
import {privateGenerationPreflight} from '../server/quality/private-generation-preflight';
const origin={kind:'approved-library' as const,sourceId:'fixed-sheet-v1'};
const sample=authoredCase('fox'),direction=sample.proposal.artDirection;
const input={gameManifest:{id:'new',allowedMechanics:['generated-module-v2']},childIntent:sample.request,baseRevision:{id:'new'},
 allowedCapabilities:['generated-module-v2'],budget:{maxUnits:1000000,timeoutMs:10000},signal:new AbortController().signal};

test('exact grid, decoded gutter, opaque content, coverage and independent PNG bytes are required',()=>{
 const plan={...direction,columns:1,rows:1,subjects:direction.subjects.slice(0,1)};
 function cell(indices:number[]){
  const b=Buffer.alloc(8*8*4);
  for(const i of indices)b.fill(255,i*4,i*4+4);
  return rgbaPng(8,8,b);
 }
 for(const [points,error] of [[[],/EMPTY/],[[0,1,8,9],/CLIPPED/],[[9,10,17,18,54],/AMBIGUOUS/]] as const){
  assert.throws(()=>extractSheet(cell([...points]),plan,origin,'smooth'),error);
 }
 const good=cell([9,10,17,18]);
 const assets=extractSheet(good,plan,origin,'smooth');
 assert.deepEqual(extractSheet(good,plan,origin,'smooth'),assets);
 const saved={version:'game-assets-v1',style:'illustrated',assets};
 assert.deepEqual(validateAssetPack(saved),saved);
 assert.notEqual(extractSheet(good,plan,{...origin,sourceId:'different-revision'},'smooth')[0].provenance.sourceId,assets[0].provenance.sourceId);
 const corrupt=Buffer.from(good);corrupt[corrupt.length-14]^=8;
 assert.throws(()=>extractSheet(corrupt,plan,origin,'smooth'));
 assert.throws(()=>readArtDirection({...direction,subjects:[...direction.subjects,direction.subjects[0]]}),/INVALID/);
 assert.throws(()=>extractSheet(good,{...plan,columns:3,subjects:direction.subjects.slice(0,3)},origin,'smooth'),/GRID_MISMATCH/);
 assert.throws(()=>requirePlannedAssets([],plan,[]),/MISSING/);
});
test('new directions bind to request and revision, retain old plan and asset readers, and keep essential orbit explicit',()=>{
 const bound=bindGameProductionPlan(sample.proposal,input,true);
 if(bound.version!=='game-production-plan-v2')throw Error('wrong plan');
 assert.deepEqual(assertProductionPlanBinding(bound,input,true),bound);
 assert.throws(()=>assertProductionPlanBinding(bound,{...input,baseRevision:{id:'other'}},true),/BINDING/);
 const {artDirection,...old}=bound;
 assert.deepEqual(validateGameProductionPlan(old),old);
 assert.equal(presentationBrief({...input,childIntent:'Pixel-art fox in an isometric maze.'}).preferredStyle,'pixel');
 assert.throws(()=>privateGenerationPreflight({...input,childIntent:'Explore a castle with a free-orbit camera.'}),/GAME_FORM/);
 const pack=validateAssetPack({version:'game-assets-v1',style:'illustrated',assets:extractSheet(sample.sheet,direction,origin,'smooth')});
 assert.equal(permitsNewArt({...input,childIntent:'Make my character jump higher.',baseRevision:{id:'old',game:{...sample.module,assets:pack}}}),false);
});
test('unavailable PNG approval and absent approved references stop before credentials or transport',async()=>{
 const approval=fixtureApproval().images!,plan={...sample.proposal,presentationStyle:'illustrated' as const,artRequests:[
  {id:'pieces',role:'actor' as const,sampling:'smooth' as const,prompt:'A glowing fox bounding along.'}]};
 let keys=0;
 const options={plan,signal:input.signal,budgetMicroUsd:50000,approval:{...approval,sheetFormat:undefined},key:()=>{keys++;return '';}};
 await assert.rejects(produceGameArt(options),/SHEET_ROUTE_UNAVAILABLE/);
 await assert.rejects(produceGameArt({...options,plan:{...plan,artDirection:{...direction,subjects:[...direction.subjects,{...direction.subjects[0],id:'old',supply:'approved'}]}}}),/ASSET_MISSING/);
 assert.equal(keys,0);
});
test('authored inputs independently exercise the hundredth leaf, wrong die, different paths and replay',()=>{
 const api={sound:()=>{}},f=fox(api),s=f.init();
 const step=(g:any,state:any,key:string,count:number)=>{for(let i=0;i<count;i++)g.step(state,{pressed:key?[key]:[]});};
 step(f,s,'down',16);assert.equal(s.cleared,0);assert.ok(s.bump>0);step(f,s,'',25);
 for(let wave=0;wave<10;wave++){
  const key=wave%2?'down':'action';
  for(let i=0;i<144;i++){
   if(Number(s.cleared)===99)assert.equal(f.outcome(s).status,'playing');
   step(f,s,key,1);
   if(s.cleared===(wave+1)*10)break;
  }
  assert.equal(s.cleared,(wave+1)*10);step(f,s,'',1);
 }
 step(f,s,'',60);assert.deepEqual(f.outcome(s),{status:'won',score:100});assert.equal(f.init().cleared,0);
 const fac=factory(api),lot=fac.init();step(fac,lot,'right',40);assert.equal(lot.last,-1);assert.equal(lot.lot,0);
 step(fac,lot,'',1);step(fac,lot,'left',12);assert.ok(lot.travel>0);step(fac,lot,'left',28);assert.equal(lot.lot,1);
 const h=horse(api);
 for(const route of [['left','right','right'],['right','right','left','right','right']]){
  const rider=h.init();for(const key of route){step(h,rider,key,36);step(h,rider,'',1);}
  assert.equal(h.outcome(rider).status,'won');assert.ok(h.draw(rider).some((c:any)=>c.assetId==='ribbon'));
 }
});
test('offline join rejects interrupted art, stale code and timeout without publishing partial work',async()=>{
 for(const mode of ['serial','overlap'] as const){
  for(const fault of ['partial-art','stale-contract'] as const)await assert.rejects(compareSchedule('factory',mode,input.signal,fault),/INTERRUPTED|MISMATCH/);
  const aborted=AbortSignal.timeout(1);await new Promise(resolve=>setTimeout(resolve,5));
  await assert.rejects(compareSchedule('horse',mode,aborted),e=>(e as Error).name==='TimeoutError');
 }
 for(const id of artCases){
  const raw=authoredCase(id);
  assert.ok(assetPackHash(validateAssetPack({version:'game-assets-v1',style:raw.proposal.presentationStyle,assets:extractSheet(raw.sheet,raw.proposal.artDirection,origin,'smooth')})));
 }
});
test('private execution includes the producer while sandbox and browser renderer depend only on the compatible raster reader',()=>{
 function closure(path:string){return Object.keys(buildSync({entryPoints:[path],bundle:true,platform:'node',packages:'external',write:false,metafile:true,logLevel:'silent'}).metafile.inputs);}
 assert.ok(closure('server/actions/worker-cli.ts').includes('server/agent/sprite-sheet.ts'));
 for(const path of ['server/sandbox/worker.cjs','server/sandbox/preview-v2.cjs']){
  const files=closure(path);
  assert.ok(files.includes('server/agent/game-assets.cjs'));assert.ok(!files.some(f=>/sprite-sheet|openai\.ts|illustrations\.ts/.test(f)));
 }
});

test('sheet reuse requires every original derivative from the same request and parent bytes',()=>{
 const args=authoredCase('factory'),d=args.proposal.artDirection;
 const cells=extractSheet(args.sheet,d,{kind:'generated',sourceId:'source-a'},'smooth');
 assert.ok(reusableSheet(cells,d,'source-a','smooth'));
 assert.ok(!reusableSheet(cells.slice(1),d,'source-a','smooth'));
 assert.ok(!reusableSheet(cells,d,'source-b','smooth'));
 const changed=structuredClone(cells);changed[1].provenance.sourceId=changed[1].provenance.sourceId.slice(0,-43)+'a'.repeat(43);
 assert.ok(!reusableSheet(changed,d,'source-a','smooth'));
});
