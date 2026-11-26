const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.join(__dirname,process.env.AUDIT_TREE||'quantity-final');process.chdir(root);
const filename=path.join(root,'tests/storage-native-ui.cjs');let source=fs.readFileSync(path.join(__dirname,'quantity-final/tests/storage-native-ui.cjs'),'utf8');
const mode=process.argv[2]||'default';
const instrument=async()=>{
 window.navAudit=[];
 const state=(type,e)=>{
  const pages=[...document.querySelectorAll('main .page:not(.hidden)')].map(p=>p.id);
  const button=document.querySelector('#returnLive');
  const rect=button?.getBoundingClientRect();
  window.navAudit.push({t:Math.round(performance.now()),type,page:pages.join(' '),target:e?.target?.closest?.('button')?.id||e?.target?.tagName,x:e?.clientX,y:e?.clientY,scroll:scrollY,returnTop:Math.round(rect?.top??0),route:e?.detail?.game||((typeof e?.detail==='string')?e.detail:undefined)});
 };
 for(const type of ['pointerdown','pointerup','click','factory-page','factory-game'])window.addEventListener(type,e=>state(type,e),true);
};
source=source.replace("page.on('dialog',dialog=>dialog.accept());","page.on('dialog',dialog=>dialog.accept());await page.addInitScript("+instrument.toString()+");");
const tgt="await page.locator('#returnLive').click();await page.locator('#liveKeep').click();";
if(!source.includes(tgt))throw Error('test point missing');
const delay=mode==='held'?200:0;
const raw=mode.startsWith('raw-');
if(mode==='raw-instant')source=source.replace("await page.fill('#livePrompt','Give me four buckets')","await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});await page.fill('#livePrompt','Give me four buckets')");
if(mode==='raw-fixed')source=source.replace("await page.fill('#livePrompt','Give me four buckets')","await page.evaluate(()=>{const nativeScroll=window.scrollTo.bind(window);window.scrollTo=function(opts,...rest){if(opts?.top===0&&opts.behavior==='auto')return nativeScroll({...opts,behavior:'instant'});return nativeScroll(opts,...rest);}});await page.fill('#livePrompt','Give me four buckets')");
if(mode.startsWith('raw-paint')) {
 const installPaint=mode=>{
  if(mode==='raw-paint-fixed'){
   const nativeScroll=window.scrollTo.bind(window);
   window.scrollTo=(opts,...rest)=>opts?.top===0&&opts.behavior==='auto'?nativeScroll({...opts,behavior:'instant'}):nativeScroll(opts,...rest);
  }
  const orig=FG.app.openGame.bind(FG.app);
  FG.app.openGame=(...args)=>{
   const out=orig(...args);
   window.navAudit.push({type:'after gameOpen',scroll:scrollY});
   requestAnimationFrame(()=>{
    const el=document.getElementById('returnLive');let rect=el.getBoundingClientRect();
    if(rect.top<0||rect.bottom>innerHeight){el.scrollIntoView({block:'center',behavior:'instant'});rect=el.getBoundingClientRect();}
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    window.__returnPaint={x,y};window.navAudit.push({type:'paintAim',scroll:scrollY,returnTop:rect.top,x,y,target:document.elementFromPoint(x,y)?.closest('button')?.id});
   });
   return out;
  };
 };
 source=source.replace("await page.fill('#livePrompt','Give me four buckets')","await page.evaluate("+installPaint.toString()+","+JSON.stringify(mode)+");await page.fill('#livePrompt','Give me four buckets')");
}
const click=mode.startsWith('raw-paint')?"await page.waitForFunction(()=>!!window.__returnPaint);const {x,y}=await page.evaluate(()=>window.__returnPaint);await page.mouse.move(x,y);await page.mouse.down();await new Promise(resolve=>setTimeout(resolve,130));await page.mouse.up();":raw?`await page.locator('#returnLive').evaluate(e=>{const r=e.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)e.scrollIntoView({behavior:'instant',block:'center'});});const rect=await page.locator('#returnLive').boundingBox();await page.evaluate(({x,y})=>window.navAudit.push({type:'aim',target:document.elementFromPoint(x,y)?.closest('button')?.id,scroll:scrollY,returnTop:document.getElementById('returnLive').getBoundingClientRect().top,x,y}),{x:rect.x+rect.width/2,y:rect.y+rect.height/2});await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await new Promise(resolve=>setTimeout(resolve,130));await page.mouse.up();`:`await page.locator('#returnLive').click({delay:${delay}});`;
source=source.replace(tgt, `${click}const trace=await page.evaluate(()=>({active:document.querySelector('.page:not(.hidden)')?.id,keep:!!document.getElementById('liveKeep').getClientRects().length,editorHidden:document.getElementById('liveEditor').hidden,grade:FG.store.current().grade,route:location.search,events:window.navAudit.slice(-16)}));fs.writeFileSync(${JSON.stringify(path.join(__dirname,'native-return-'+(process.env.AUDIT_TREE?process.env.AUDIT_TREE+'-':'')+mode+'-'))}+name+'.json',JSON.stringify(trace,null,2));await page.locator('#liveKeep').click({timeout:5000});`);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(source,filename);
