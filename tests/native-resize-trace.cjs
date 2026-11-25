/* Read-only geometry diagnostics. Native scheduling, callback binding, and
 * error delivery are preserved. No extra resize or frame is requested. */
exports.installNativeResizeTrace=function(){
 const NativeObserver=ResizeObserver,nativeFrame=requestAnimationFrame.bind(window),observers=[],trace=[],observed=new Map();let nextObserver=0,nextSequence=0,reports=0,delivering=0;
 window.__hillResizeEffects=[];
 const label=element=>({tag:element.tagName,id:element.id,classes:element.getAttribute('class')||''});
 const bounds=element=>{
  const rect=element.getBoundingClientRect(),canvas=element instanceof HTMLCanvasElement?element:element.querySelector('canvas');
  return {...label(element),connected:element.isConnected,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
   canvas:canvas?{width:canvas.width,height:canvas.height,style:canvas.getAttribute('style')||''}:null};
 };
 const record=entry=>{trace.push({...entry,sequence:++nextSequence,at:performance.now()});if(trace.length>40)trace.shift();};
 const current=observer=>[...(observed.get(observer)||[])].map(bounds);
 window.requestAnimationFrame=callback=>{
  if(!delivering)return nativeFrame(callback);
  const observer=delivering,stack=new Error('Frame scheduled during observer delivery').stack?.slice(0,2000);
  const frame=nativeFrame(function(time){
   record({kind:'observer-frame-start',observer,frame,current:current(observer)});
   try{return callback.call(this,time);}finally{record({kind:'observer-frame-end',observer,frame,current:current(observer)});}
  });record({kind:'observer-frame-scheduled',observer,frame,stack});return frame;
 };
 window.ResizeObserver=class extends NativeObserver{
  constructor(callback){
   const definition={id:++nextObserver,stack:new Error('ResizeObserver creation').stack?.slice(0,4000),targets:[]};
   super((entries,observer)=>{
    const before=entries.map(entry=>({element:entry.target,state:bounds(entry.target),reported:{width:entry.contentRect.width,height:entry.contentRect.height}}));
    const previous=delivering;delivering=definition.id;
    try{callback.call(observer,entries,observer);}
    finally{
     delivering=previous;
     const after=before.map(item=>bounds(item.element));record({kind:'delivery',observer:definition.id,before:before.map(({state,reported})=>({state,reported})),after});
     before.forEach((item,index)=>{const next=after[index];if(item.element.matches('.quality-hill .q-stage')&&next.connected&&(item.state.rect.width!==next.rect.width||item.state.rect.height!==next.rect.height))window.__hillResizeEffects.push({before:item.state.rect,after:next.rect});});
    }
   });
   observers.push(definition);observed.set(definition.id,new Set());if(observers.length>20)observed.delete(observers.shift().id);this.definition=definition;
  }
  observe(target,options){this.definition.targets.push(label(target));if(this.definition.targets.length>16)this.definition.targets.shift();const targets=observed.get(this.definition.id);if(targets?.size<16)targets.add(target);record({kind:'observe',observer:this.definition.id,target:bounds(target)});return super.observe(target,options);}
  unobserve(target){observed.get(this.definition.id)?.delete(target);record({kind:'unobserve',observer:this.definition.id,target:label(target)});return super.unobserve(target);}
  disconnect(){observed.get(this.definition.id)?.clear();record({kind:'disconnect',observer:this.definition.id});return super.disconnect();}
 };
 addEventListener('error',event=>{
  if(!event.message?.includes('ResizeObserver')||reports++>=3)return;
  // Report without preventDefault/stopPropagation: Playwright's strict pageerror
  // assertion still receives the original native error.
  console.error('JEMS_NATIVE_RESIZE_TRACE '+JSON.stringify({message:event.message,documentStarted:performance.timeOrigin,url:location.href,ready:document.readyState,
   focus:document.activeElement?label(document.activeElement):null,
   fitted:document.getElementById('page-studio')?.classList.contains('studio-play-mode'),observers:observers.slice(-20),current:[...observed.keys()].map(observer=>({observer,targets:current(observer)})),trace}));
 });
};
