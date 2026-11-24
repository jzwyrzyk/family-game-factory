// Authored offline fixture only. This comparison cannot enter the production
// evidence validator or provider transport. Originals and receipts are retained.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,type Page} from 'playwright';
import {authoredCase} from './premium-art-cases';
import {extractSheet} from '../server/agent/sprite-sheet';
import {makeRasterAsset,assetPackHash} from '../server/agent/game-assets';
import {bindGameProductionPlan} from '../server/quality/presentation-plan';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {compileArtFixture} from '../tests/generated-art-fixtures';
const hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const directory='test-results/premium-evidence';
const sample=authoredCase('factory');
const provenance={kind:'approved-library' as const,sourceId:'offline-foundry'};
const assets={version:'game-assets-v1' as const,style:'dimensional' as const,assets:[
 makeRasterAsset({id:'floor',role:'background',bytes:sample.scene,mime:'image/webp',provenance}),
 ...extractSheet(sample.sheet,sample.proposal.artDirection,provenance,'smooth')
]};
const input={gameManifest:{id:'new',allowedMechanics:[]},baseRevision:{id:'new'},childIntent:sample.request,
 allowedCapabilities:[],signal:new AbortController().signal,budget:{maxUnits:0,timeoutMs:60000}};
const plan=bindGameProductionPlan(sample.proposal,input,true);
const mutations={
 good:(s:string)=>s,
 inert:(s:string)=>s.replace("const choice=input.pressed.includes('left')?-1:input.pressed.includes('right')?1:0;",'const choice=0;'),
 decorative:(s:string)=>s.replace('if(match)s.lot++;','if(match)s.last=1;'),
 unreachable:(s:string)=>s.replace('if(match)s.lot++;','if(match)s.lot=Math.min(3,s.lot+1);'),
 falseCelebration:(s:string)=>s.replace("status:s.lot===4?'won':'playing'","status:s.t>20?'won':'playing'"),
 missingRight:(s:string)=>s.replace("input.pressed.includes('right')?1:0",'false?1:0'),
 lostMechanicOnRepair:(s:string)=>s.replace('const match=s.route===(s.lot%2===0?-1:1);','const match=true;'),
 lostArtOnRepair:(s:string)=>s.replace("assetId:'crystal'","assetId:'press'"),
 brokenTouch:(s:string)=>s
};
type Snapshot={status:string;commands:any[];ticks:number;inputs:number};
async function state(page:Page):Promise<Snapshot>{return page.locator('#game').evaluate(canvas=>({
 status:document.querySelector('#status')!.getAttribute('data-state')!,commands:JSON.parse((canvas as HTMLElement).dataset.snapshot||'[]'),
 ticks:Number((canvas as HTMLElement).dataset.ticks),inputs:Number((canvas as HTMLElement).dataset.inputs)
}));}
async function main(){
 mkdirSync(directory,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const results:any[]=[],originals:any[]=[];
 try{
  for(const [name,mutate] of Object.entries(mutations)){
   const source=mutate(sample.module.source);
   if(name!=='good'&&name!=='brokenTouch')assert.notEqual(source,sample.module.source,name+' mutation missed');
   const game=compileArtFixture({...sample.module,source,assets,productionPlan:plan});
   const html=renderGeneratedV2(game,'offline-proof','offline-proof-channel',{auditTicks:600}).html;
   for(const device of ['desktop','tablet'] as const){
    const context=await browser.newContext({viewport:device==='desktop'?{width:960,height:800}:{width:600,height:900},hasTouch:device==='tablet'});
    const page=await context.newPage();await page.route('**/*',route=>route.abort());
    await page.setContent(html);await page.getByRole('button',{name:'Play!',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('#game')?.dataset.ticks)>2);
    if(name==='brokenTouch'&&device==='tablet')await page.locator('#controls').evaluate(el=>(el as HTMLElement).style.pointerEvents='none');
    const receipts:any[]=[],failures:string[]=[],captures:any[]=[];
    let before=await state(page);
    const shot=async(label:string,s:Snapshot)=>{
     // Read actual canvas pixels and the latest simulation snapshot in the
     // same browser task. The normal renderer interpolates positions, so the
     // snapshot is associated state, not a claim of pixel/command equivalence.
     const sample=await page.locator('#game').evaluate(canvas=>({
      png:(canvas as HTMLCanvasElement).toDataURL('image/png').split(',')[1],
      state:{status:document.querySelector('#status')!.getAttribute('data-state')!,
       commands:JSON.parse((canvas as HTMLElement).dataset.snapshot||'[]'),
       ticks:Number((canvas as HTMLElement).dataset.ticks),inputs:Number((canvas as HTMLElement).dataset.inputs)}
     }));
     s=sample.state;const bytes=Buffer.from(sample.png,'base64');
     const id=name+'-'+device+'-'+label;writeFileSync(directory+'/'+id+'.png',bytes);
     const record={id,device,sourceHash:hash(source),htmlHash:hash(html),assetsHash:assetPackHash(assets),tick:s.ticks,
      stateHash:hash(JSON.stringify(s.commands)),frameState:s,frameMode:'normal-motion-interpolated',
      hostFault:name==='brokenTouch'&&device==='tablet'?'controls-pointer-events-none':null,
      sha256:hash(bytes),path:id+'.png'};
     if(name==='good')originals.push(record);
     captures.push(record);
     return record;
    };
    let prior=await shot('initial',before);
    const route=['right','left','right','left','right'];
    for(let index=0;index<route.length;index++){
     const control=route[index];const button=page.locator('[data-control="'+control+'"]');
     const box=await button.boundingBox();assert.ok(box);
     if(device==='tablet'){
      const session=await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
      await page.waitForTimeout(700);
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
     }else{
      await page.keyboard.down(control==='left'?'ArrowLeft':'ArrowRight');await page.waitForTimeout(700);
      await page.keyboard.up(control==='left'?'ArrowLeft':'ArrowRight');
     }
     await page.waitForTimeout(70);const after=await state(page),capture=await shot('action-'+index,after);
     const packed=after.commands.filter(c=>/^packed\d$/.test(c.key||''));
     const expected=index===0?0:index;
     if(packed.length!==expected)failures.push('packing-'+index);
     if(after.status!==(index===4?'won':'playing'))failures.push('payoff-'+index);
     if(after.commands.some(c=>c.key==='shipment'&&c.assetId!=='crystal'))failures.push('art-identity-'+index);
     receipts.push({index,control,before:prior.id,after:capture.id,beforeState:prior.stateHash,
      afterState:capture.stateHash,actualInputDelta:after.inputs-before.inputs,expectedPacked:expected,observedPacked:packed.length});
     before=after;prior=capture;
    }
    const detected=failures.length>0;
    assert.equal(detected,name!=='good'&&!(name==='brokenTouch'&&device==='desktop'),name+'/'+device);
    results.push({name,device,sourceHash:hash(source),htmlHash:hash(html),detected,failures,receipts,captures,
     evidenceBoundary:'independent authored expectations; no model judgment; touch defect injected in host controls'});
    await context.close();
   }
  }
  // Six full frames per device demonstrate five independently checked inputs.
  // Downsampling is measured, never assumed equivalent to original evidence.
  const page=await browser.newPage();
  const sheets=[];
  for(const device of ['desktop','tablet'])for(const scale of [1,0.5]){
   const captures=originals.filter(c=>c.device===device);
   const {readFileSync}=await import('node:fs');
   const data=captures.map(c=>({...c,data:readFileSync(directory+'/'+c.path).toString('base64')}));
   const composed=await page.evaluate(async({data,scale})=>{
    const images=await Promise.all(data.map(async c=>{const im=new Image();im.src='data:image/png;base64,'+c.data;await im.decode();return im;}));
    const w=Math.max(...images.map(im=>im.width)),h=Math.max(...images.map(im=>im.height));
    const canvas=document.createElement('canvas');canvas.width=w*2*scale;canvas.height=(h+30)*3*scale;
    const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width/scale,canvas.height/scale);
    let exact=true;
    images.forEach((im,index)=>{
     const x=index%2*w,y=Math.floor(index/2)*(h+30);ctx.fillStyle='#111';ctx.font='15px sans-serif';ctx.fillText(data[index].id,x+4,y+20);ctx.drawImage(im,x,y+30);
     if(scale===1){
      const original=document.createElement('canvas');original.width=im.width;original.height=im.height;
      const oc=original.getContext('2d')!;oc.drawImage(im,0,0);
      const a=oc.getImageData(0,0,im.width,im.height).data,b=ctx.getImageData(x,y+30,im.width,im.height).data;
      exact=exact&&a.every((v,i)=>v===b[i]);
     }
    });
    return {data:canvas.toDataURL('image/png').split(',')[1],width:canvas.width,height:canvas.height,originalPixelsEqual:scale===1?exact:null};
   },{data,scale});
   const bytes=Buffer.from(composed.data,'base64'),id=device+'-sheet-'+scale;writeFileSync(directory+'/'+id+'.png',bytes);
   if(scale===1)assert.equal(composed.originalPixelsEqual,true);
   sheets.push({id,scale,width:composed.width,height:composed.height,sha256:hash(bytes),bytes:bytes.length,originalPixelsEqual:composed.originalPixelsEqual,
    cells:captures.map((c,index)=>({index,originalSha256:c.sha256,captureId:c.id,stateHash:c.stateHash,sourceHash:c.sourceHash}))});
  }
  writeFileSync(directory+'/comparison.json',JSON.stringify({version:'offline-evidence-prototype-v1',paidCalls:0,
   productionPolicyChanged:false,modelFalsePositiveRate:null,providerImageTokenUsage:null,
   originalCaptureCount:originals.length,originals,sheets,results,
   decision:'Retain eight-image production policy: full-size sheets exceed current dimensions; reduced sheets lose pixels; model/human detection equivalence unmeasured.'},null,2)+'\n');
  console.log(JSON.stringify({sessions:results.length,brokenDetected:results.filter(r=>r.detected).length,originals:originals.length,sheets:sheets.length}));
 }finally{await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
