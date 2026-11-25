/* Diagnostics do not measure layout until a native resize error has already
 * fired. Native scheduling, callback binding, setters and error delivery remain
 * in control; no extra resize or frame is requested. */
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
 window.__nativeResizeSubscriptions=()=>[...observed].map(([observer,targets])=>({observer,targets:[...targets].map(label)}));
 for(const property of ['width','height']){
  const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,property);
  Object.defineProperty(HTMLCanvasElement.prototype,property,{...descriptor,set(value){
   const before=descriptor.get.call(this);descriptor.set.call(this,value);
   if(delivering&&this.matches('.quality-hill .q-canvas')){
    const effect={observer:delivering,property,before,after:descriptor.get.call(this)};
    if(window.__hillResizeEffects.length<100)window.__hillResizeEffects.push(effect);
    record({kind:'hill-canvas-write-during-delivery',...effect});
   }
  }});
 }
 window.requestAnimationFrame=callback=>{
  if(!delivering)return nativeFrame(callback);
  const observer=delivering,stack=new Error('Frame scheduled during observer delivery').stack?.slice(0,2000);
  const frame=nativeFrame(function(time){
   record({kind:'observer-frame-start',observer,frame});
   try{return callback.call(this,time);}finally{record({kind:'observer-frame-end',observer,frame});}
  });record({kind:'observer-frame-scheduled',observer,frame,stack});return frame;
 };
 window.ResizeObserver=class extends NativeObserver{
  constructor(callback){
   const definition={id:++nextObserver,stack:new Error('ResizeObserver creation').stack?.slice(0,4000),targets:[]};
   super((entries,observer)=>{
    const reported=entries.map(entry=>({target:label(entry.target),width:entry.contentRect.width,height:entry.contentRect.height}));
    const previous=delivering;delivering=definition.id;
    try{callback.call(observer,entries,observer);}
    finally{
     delivering=previous;
     record({kind:'delivery',observer:definition.id,reported});
    }
   });
   observers.push(definition);observed.set(definition.id,new Set());if(observers.length>20)observed.delete(observers.shift().id);this.definition=definition;
  }
  observe(target,options){this.definition.targets.push(label(target));if(this.definition.targets.length>16)this.definition.targets.shift();const targets=observed.get(this.definition.id);if(targets?.size<16)targets.add(target);record({kind:'observe',observer:this.definition.id,target:label(target)});return super.observe(target,options);}
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

/* Independent control: the observer, animation frame and canvas descriptors
 * are completely untouched. Geometry is sampled only after a native error. */
exports.installNativeResizeErrorCapture=function(){
 const observer=ResizeObserver,frame=requestAnimationFrame,width=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width'),height=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'height');let reports=0;
 window.__nativeResizeErrors=[];
 window.__nativeResizeUntouched=()=>ResizeObserver===observer&&requestAnimationFrame===frame&&Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width').set===width.set&&Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'height').set===height.set;
 addEventListener('error',event=>{
  if(!event.message?.includes('ResizeObserver'))return;
  window.__nativeResizeErrors.push(event.message);if(reports++>=3)return;
  console.error('JEMS_NATIVE_RESIZE_CONTROL '+JSON.stringify({message:event.message,documentStarted:performance.timeOrigin,url:location.href,ready:document.readyState,
   fitted:document.getElementById('page-studio')?.classList.contains('studio-play-mode'),
   current:[...document.querySelectorAll('.site-header,#studioGameHost,.quality-hill .q-stage')].map(element=>({tag:element.tagName,id:element.id,classes:element.className,rect:element.getBoundingClientRect().toJSON()}))}));
 });
};
