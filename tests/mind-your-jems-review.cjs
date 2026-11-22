/* Visual evidence is tied to the built revision. Baselines are accepted only by
 * an explicit local command after reviewing the actual browser artwork. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const directory=path.resolve('test-results/mind-your-jems');
const baselineDirectory=path.resolve('tests/visual/mind-your-jems');
const baselineStates=new Set(['idle','warning','ready']);
const baselineDevices=new Set(['desktop','tablet-portrait','mobile']);

async function compareImages(page,actual,expected){
 return page.evaluate(async ({actual,expected})=>{
  const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
  const [a,b]=await Promise.all([load(actual),load(expected)]);
  if(a.width!==b.width||a.height!==b.height)return {dimensions:false,actual:[a.width,a.height],expected:[b.width,b.height]};
  const canvas=document.createElement('canvas');canvas.width=a.width;canvas.height=a.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(a,0,0);const current=context.getImageData(0,0,a.width,a.height);
  context.clearRect(0,0,a.width,a.height);context.drawImage(b,0,0);
  const previous=context.getImageData(0,0,a.width,a.height),diff=context.createImageData(a.width,a.height);
  let changed=0,totalDelta=0;
  for(let i=0;i<current.data.length;i+=4){
   const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(current.data[i+c]-previous.data[i+c])));
   totalDelta+=delta;
   // A small channel tolerance ignores rasterizer rounding without hiding
   // missing artwork, moved controls, clipping, or material color changes.
   if(delta>20){changed++;diff.data[i]=255;diff.data[i+1]=35;diff.data[i+2]=100;diff.data[i+3]=255;}
   else {const grey=Math.round((current.data[i]+current.data[i+1]+current.data[i+2])/3);diff.data[i]=diff.data[i+1]=diff.data[i+2]=grey;diff.data[i+3]=90;}
  }
  context.putImageData(diff,0,0);
  return {dimensions:true,width:a.width,height:a.height,changed,ratio:changed/(a.width*a.height),meanDelta:totalDelta/(a.width*a.height),diff:canvas.toDataURL('image/png')};
 },{actual:'data:image/png;base64,'+actual.toString('base64'),expected:'data:image/png;base64,'+expected.toString('base64')});
}

exports.createReview=async browser=>{
 fs.mkdirSync(directory,{recursive:true});
 const manifest={build:JSON.parse(fs.readFileSync('dist/build-info.json','utf8')),browser:browser.version(),
  artifactKind:'actual-browser-capture',surface:'shared native play view',backend:'deterministic mocked build statuses; no paid AI generation',
  viewports:[],captures:[],checks:[],errors:[]};
 const comparisonPage=await browser.newPage({viewport:{width:32,height:32}});
 const update=process.env.MYJ_UPDATE_BASELINES==='1',compare=process.env.MYJ_VISUAL_COMPARE==='1';
 assert.ok(!(update&&compare),'Use baseline update or comparison, never both together.');
 if(update)assert.ok(!process.env.CI,'CI cannot silently approve new visual baselines.');
 const baselineCandidates=new Map();
 let comparisonCount=0;
 const visualFailures=[];
 return {
  manifest,directory,
  async capture(page,arcade,device,state){
   await page.evaluate(()=>document.fonts.ready);
   const file=device+'-'+state+'.png';
   // Native pointer captures and keyboard captures are separate evidence.
   // Keep focus visibility intact; never remove the focus outline for a test.
   // Include the ordinary exit, fullscreen and ready menu in the reviewed
   // composition. The mine no longer owns a separate dialog or build banner.
   const frame=page.locator('#page-studio.studio-play-mode');
   const surface=await frame.isVisible()?frame:arcade;
   const bytes=await surface.screenshot({path:path.join(directory,file),animations:'disabled',caret:'hide'});
   const box=await surface.boundingBox();
   manifest.captures.push({device,state,file,width:Math.round(box.width),height:Math.round(box.height)});
   if(state==='idle'&&['desktop','tablet-portrait','mobile'].includes(device)){
    fs.copyFileSync(path.join(directory,file),'test-results/mind-your-jems-'+(device==='tablet-portrait'?'tablet':device)+'.png');
   }
   if(!baselineDevices.has(device)||!baselineStates.has(state))return;
   const baseline=path.join(baselineDirectory,file);
   if(update){baselineCandidates.set(file,bytes);return;}
   if(!compare)return;
   if(!fs.existsSync(baseline)){
    visualFailures.push('Missing reviewed visual baseline '+file+'. Review actual art and explicitly run MYJ_UPDATE_BASELINES=1.');
    return;
   }
   const result=await compareImages(comparisonPage,bytes,fs.readFileSync(baseline));
   comparisonCount++;
   const {diff,...metrics}=result;manifest.checks.push({device,state,kind:'visual-regression',...metrics});
   if(!result.dimensions||result.ratio>0.008){
    if(diff)fs.writeFileSync(path.join(directory,file.replace('.png','-diff.png')),Buffer.from(diff.split(',')[1],'base64'));
    fs.copyFileSync(baseline,path.join(directory,file.replace('.png','-expected.png')));
    // Keep collecting actual gameplay and all nine states, then fail the same
    // visual gate. A changed first frame must not hide later loss or input bugs.
    visualFailures.push('Visual regression '+file+': '+JSON.stringify(metrics));
   }
  },
  check(device,kind,details){manifest.checks.push({device,kind,...details});},
  async finish(){
   const gameplayFailed=manifest.errors.length>0;
   if(compare&&process.env.MYJ_DEVICES===undefined&&!gameplayFailed&&comparisonCount!==9)
    visualFailures.push('Expected all nine approved views; compared '+comparisonCount+'.');
   manifest.errors.push(...visualFailures);
   fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   await comparisonPage.close();
   if(update&&!manifest.errors.length){
    assert.equal(baselineCandidates.size,9,'Review all three devices and all three states before accepting the baseline set.');
    fs.mkdirSync(baselineDirectory,{recursive:true});
    for(const [file,bytes] of baselineCandidates)fs.writeFileSync(path.join(baselineDirectory,file),bytes);
    fs.writeFileSync(path.join(baselineDirectory,'review.json'),JSON.stringify({
     build:manifest.build,browser:manifest.browser,acceptedBy:'Explicit MYJ_UPDATE_BASELINES command after visual review',
     states:[...baselineStates],devices:[...baselineDevices],channelTolerance:20,maximumChangedRatio:0.008
    },null,2)+'\n');
   }
   if(visualFailures.length&&!gameplayFailed)throw new AggregateError(visualFailures.map(message=>new Error(message)),'Mind Your Jems visual acceptance failed; all available captures are retained.');
  }
 };
};
