import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {collectQualityEvidence} from '../server/sandbox/quality-capture.cjs';
import {bindGameProductionPlan} from '../server/quality/presentation-plan';
import {validateQualityEvidence} from '../server/quality/game-quality';
import type {AgentInput} from '../server/pipeline/types';
import {fixturePremiumPlanProposal} from '../server/testing/presentation-quality-fixtures';
import {compileArtFixture} from './generated-art-fixtures';

// Authored two-action, long-route fixture. Neither an AI benchmark game nor a
// quality verdict. Every unit of distance requires an actual held player input.
const input:AgentInput={gameManifest:{id:'fixture',allowedMechanics:[]},baseRevision:{id:'new'},
 childIntent:'Lower a signal, then drive a little cart to the golden station.',allowedCapabilities:[],budget:{maxUnits:1,timeoutMs:90000},signal:new AbortController().signal};
const proposal=fixturePremiumPlanProposal();
const plan=bindGameProductionPlan({...proposal,payoff:'The cart reaches the golden station.',design:{...proposal.design,payoffState:'won',interactions:[
 {input:'down',action:'Lower the signal.',consequence:'The signal turns green.'},
 {input:'right',action:'Drive right on the rail.',consequence:'The cart advances toward the station.'}
]}},input,true);
const game=compileArtFixture({kind:'generated-module-v2',title:'Long route fixture',instructions:'Lower the signal, then drive right to the station.',
 controls:['down','right'],productionPlan:plan,playthrough:[{type:'hold',control:'down',frames:24},...Array.from({length:5},()=>({type:'hold' as const,control:'right' as const,frames:180}))],
 source:`export function createGame(){
  return {
   init:()=>({open:false,distance:0}),
   step(s,input){
    if(input.pressed.includes('down'))s.open=true;
    if(s.open&&input.pressed.includes('right'))s.distance+=1;
    return s;
   },
   draw(s){
    return [
     {type:'rect',x:0,y:0,width:720,height:400,color:'#e8f4ff'},
     {type:'rect',x:0,y:250,width:720,height:15,color:'#465660'},
     {type:'circle',key:'signal',x:65,y:185,radius:24,color:s.open?'#0d9c78':'#e95445'},
     {type:'rect',key:'station',x:575,y:120,width:100,height:130,color:s.distance>=650?'#ffca26':'#79694f'},
     {type:'rect',key:'cart',x:30+s.distance*.84,y:205,width:48,height:45,color:'#3479b8'}
    ];
   },
   outcome:s=>({status:s.distance>=650?'won':'playing',score:s.distance})
  };
 }`});

async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const e=validateQualityEvidence(game,await collectQualityEvidence(browser,game));
  const dir='test-results/quality-capture';
  mkdirSync(dir,{recursive:true});
  for(const c of e.captures)writeFileSync(dir+'/premium-long-route-'+c.id+'.png',Buffer.from(c.data,'base64'));
  writeFileSync(dir+'/premium-long-route-receipts.json',JSON.stringify({...e,captures:e.captures.map(({data,...meta})=>meta)},null,2));
  const imageInspection=await browser.newPage();
  for(const s of e.sessions){
   assert.equal(s.outcome,'won');assert.ok(s.simulatedTicks>650);
   assert.equal(s.touch,s.device==='tablet');assert.equal(s.pause,true);assert.equal(s.replay,true);
   const inputs=s.actionTrace.filter(t=>t.action.type==='hold'&&t.beforeHash!==t.afterHash).map(t=>t.action);
   assert.deepEqual([...new Set(inputs.map(a=>a.type==='hold'?a.control:null))],['down','right']);
   assert.ok(s.actionTrace.at(-1)!.endTick>600,'the final ordinary input extended beyond the legacy capture window');
   const shots=e.captures.filter(c=>c.device===s.device);
   assert.deepEqual(shots.map(c=>c.phase),['initial','interaction','interaction','outcome']);
   assert.equal(new Set(shots.map(c=>c.sha256)).size,4);
   // Independently inspect the known painted objects in decoded PNGs. A
   // screen/title change or a terminal flag alone cannot pass this fixture.
   for(const [index,shot] of shots.entries()){
    const colors=await imageInspection.evaluate(async data=>{
     const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
     const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
     const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
     const {data:rgba}=ctx.getImageData(0,0,canvas.width,canvas.height);
     const areas:Record<string,{pixels:number;minX:number;maxX:number}>={};
     for(let offset=0;offset<rgba.length;offset+=4){
      const rgb=(rgba[offset]<<16)+(rgba[offset+1]<<8)+rgba[offset+2];
      const key=rgb===0x3479b8?'cart':rgb===0x0d9c78?'green':rgb===0xe95445?'red':rgb===0xffca26?'gold':'';
      if(!key)continue;
      const x=(offset/4)%canvas.width,area=areas[key]??={pixels:0,minX:x,maxX:x};
      area.pixels++;area.minX=Math.min(area.minX,x);area.maxX=Math.max(area.maxX,x);
     }
     return areas;
    },shot.data);
    assert.ok(colors.cart?.pixels>300);
    if(index===0){
     assert.ok(colors.red?.pixels>300&&colors.cart.maxX<shot.width/3,'the cart starts at the red signal');
     assert.ok(!colors.gold);
    }else{
     assert.ok(colors.green?.pixels>300,'the actual lowered signal is green');
     if(shot.phase==='outcome'){
      assert.ok(colors.gold?.pixels>300&&colors.cart.minX>=colors.gold.minX&&colors.cart.minX<colors.gold.maxX,
       'the rendered cart arrives inside the golden station');
     }
    }
   }
  }
  console.log('PASS premium long route: actual signal and movement input, distinct PNGs, visible terminal route after 650+ ticks, touch, keyboard, pause and replay.');
 }finally{await browser.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
