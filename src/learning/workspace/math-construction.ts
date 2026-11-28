import type {MathItem} from '../types';
import {quantityPlaces} from '../visuals';
import {action, graphic, group, model, moves, node, stepper, type MathModelOptions} from './math-view';

export function frames(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const missing=item.parameters.operation==='missing-addend';
  const fixed=missing?Number(item.parameters.a):0;
  const size=item.skillId==='g1-make-ten'||item.skillId==='g1-add-10'?10:20;
  type FrameState={filled:boolean[];picked:number;moving:boolean;edited:boolean};
  const initial:FrameState={filled:Array<boolean>(size).fill(false),picked:-1,moving:false,edited:false};
  model(host,options,missing?'Add the missing counters':'Build your answer',initial,({panel,state,update})=>{
    const grid=node('div','model-frames');
    const toggle=(i:number)=>{
      if(i<fixed)return;
      if(state.moving){
        if(state.filled[i]){update({...state,picked:state.picked===i?-1:i});return;}
        if(state.picked>=0)move(state.picked,i);
        return;
      }
      const filled=state.filled.slice();filled[i]=!filled[i];
      update({...state,filled,edited:true});
    };
    const move=(from:number,to:number)=>{
      if(!state.filled[from]||to<fixed||to>=size||state.filled[to])return;
      const filled=state.filled.slice();filled[from]=false;filled[to]=true;
      update({...state,filled,picked:-1,edited:true});
    };
    let frame=group('First ten frame');
    for(let i=0;i<size;i++){
      if(i%10===0){
        frame=group(i===0?'First ten frame':'Second ten frame');
        frame.className='model-frame';
        grid.append(frame);
      }
      const occupied=i<fixed||state.filled[i];
      const cell=action('',()=>toggle(i),'cell-'+i);
      cell.className='model-cell';cell.disabled=i<fixed;
      cell.setAttribute('aria-label','Space '+(i%10+1)+(i<fixed?', given counter':occupied?', your counter':', empty'));
      cell.setAttribute('aria-pressed',String(state.filled[i]));
      cell.dataset.placeAt=String(i);
      if(state.filled[i])cell.dataset.piece=String(i);
      if(occupied)cell.append(node('span',i<fixed?'model-counter given':'model-counter'));
      if(state.picked===i)cell.classList.add('picked');
      frame.append(cell);
    }
    const controls=group('Counters');
    const reposition=action(state.moving?'Finish moving':'Move a counter',()=>update({...state,moving:!state.moving,picked:-1}),'move');
    reposition.setAttribute('aria-pressed',String(state.moving));
    reposition.disabled=!state.filled.some(Boolean);
    controls.append(reposition);
    if(!state.filled.some(Boolean))controls.append(action('Choose zero',()=>update({...state,edited:true})));
    panel.append(grid,controls);
    if(state.moving)panel.append(node('p','model-instruction','Tap your counter, then an empty space.'));
    moves(panel,(from,to)=>move(Number(from),Number(to)));
  },state=>state.edited?String(state.filled.filter(Boolean).length):undefined);
}
export function numberLine(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const fractional=item.skillId==='g3-fraction-number';
  const denominator=fractional?Number(item.parameters.d):1;
  const high=fractional?denominator:item.skillId==='g1-subtract-10'?10:20;
  const start=fractional?0:Number(item.parameters.a)||0;
  const value=(i:number)=>fractional?(i===0?'0':i===high?'1':i+'/'+denominator):String(i);
  model(host,options,'Move along the line',{stops:[start],edited:false},({panel,state,update})=>{
    const last=state.stops.at(-1)!;
    const change=(n:number)=>update({stops:[...state.stops.slice(-20),n],edited:true});
    const track=node('div','model-line');
    const drawing=graphic('svg',{viewBox:'0 0 300 92','aria-hidden':'true',preserveAspectRatio:'none'});
    const x=(n:number)=>12+276*n/high;
    drawing.append(graphic('line',{x1:x(0),x2:x(high),y1:68,y2:68,stroke:'currentColor','stroke-width':2}));
    for(let i=0;i<=high;i++)drawing.append(graphic('line',{x1:x(i),x2:x(i),y1:62,y2:75,stroke:'currentColor','stroke-width':1.5}));
    state.stops.slice(1).forEach((n,i)=>{
      const previous=state.stops[i];
      if(previous===n)return;
      const curve='M '+x(previous)+' 57 Q '+((x(previous)+x(n))/2)+' 0 '+x(n)+' 57';
      drawing.append(graphic('path',{d:curve,fill:'none',stroke:i%2?'#2459b9':'#7448bf','stroke-width':3}));
      drawing.append(graphic('path',{d:'M '+(x(n)-4)+' 50 L '+x(n)+' 57 L '+(x(n)+4)+' 50',fill:'none',stroke:'currentColor','stroke-width':2}));
    });
    const marker=graphic('circle',{cx:x(last),cy:68,r:7,fill:'#6242ae',stroke:'white','stroke-width':2});
    drawing.append(marker);
    const nearest=(e:PointerEvent)=>{
      const bounds=drawing.getBoundingClientRect();
      return Math.max(0,Math.min(high,Math.round(((e.clientX-bounds.left)*300/bounds.width-12)*high/276)));
    };
    drawing.onpointerdown=e=>{
      if(e.button!==0)return;
      drawing.setPointerCapture(e.pointerId);
      marker.setAttribute('cx',String(x(nearest(e))));
    };
    drawing.onpointermove=e=>{if(drawing.hasPointerCapture(e.pointerId))marker.setAttribute('cx',String(x(nearest(e))));};
    drawing.onpointerup=e=>{if(drawing.hasPointerCapture(e.pointerId))change(nearest(e));};
    drawing.onpointercancel=()=>marker.setAttribute('cx',String(x(last)));
    const range=node('input','model-rail-input');
    range.type='range';range.min='0';range.max=String(high);range.step='1';range.value=String(last);
    range.setAttribute('aria-label','Marker position');range.setAttribute('aria-valuetext',value(last));
    range.dataset.modelKey='marker';range.onchange=()=>change(Number(range.value));
    track.append(drawing,range);
    const labels=node('div','model-line-labels');
    for(const position of [0,Math.floor(high/2),high]){
      const tick=node('span','',value(position));
      tick.style.left=x(position)/3+'%';labels.append(tick);
    }
    const controls=stepper('Marker',last,0,high,change);
    controls.wrapper.querySelector('.model-step-value')!.textContent=value(last);
    panel.append(track,labels,controls.wrapper);
    if(!state.edited)panel.append(action('Choose this position',()=>change(last)));
  },s=>s.edited?(fractional?s.stops.at(-1)+'/'+denominator:String(s.stops.at(-1))):undefined);
}
const placeNames:Record<number,string>={1:'Ones',10:'Tens',100:'Hundreds',1000:'Thousands',10000:'Ten thousands',100000:'Hundred thousands',1000000:'Millions',0.1:'Tenths',0.01:'Hundredths'};
function blockArt(place:number) {
  const svg=graphic('svg',{viewBox:'0 0 40 40','aria-hidden':'true'});
  const rect=(x:number,y:number,w:number,h:number,color:string)=>graphic('rect',{x,y,width:w,height:h,rx:1,fill:color,stroke:'#3c446e','stroke-width':.7});
  if(place>=1000){
    svg.append(graphic('path',{d:'M 3 12 L 17 3 L 37 10 L 23 20 Z',fill:'#dfccff',stroke:'#4f3c78'}),graphic('path',{d:'M 23 20 L 37 10 L 37 29 L 23 38 Z',fill:'#8b72c1',stroke:'#4f3c78'}),graphic('path',{d:'M 3 12 L 23 20 L 23 38 L 3 30 Z',fill:'#b6a2e7',stroke:'#4f3c78'}));
  } else if(place===100){
    svg.append(rect(2,2,36,36,'#6cdabd'));
    for(let i=1;i<10;i++)svg.append(graphic('path',{d:'M '+(2+i*3.6)+' 2 v 36 M 2 '+(2+i*3.6)+' h 36',stroke:'#328775','stroke-width':.55}));
  }else if(place===10){
    svg.append(rect(16,2,8,36,'#ffd177'));
    for(let i=1;i<10;i++)svg.append(graphic('line',{x1:16,x2:24,y1:2+i*3.6,y2:2+i*3.6,stroke:'#876a31','stroke-width':.65}));
  }else svg.append(rect(12,12,16,16,'#a2c1ff'));
  return svg;
}
export function blocks(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const places=quantityPlaces(item);
  model(host,options,'Build with place-value blocks',{counts:places.map(()=>0),edited:false},({panel,state,update})=>{
    const value=Number(state.counts.reduce((sum,count,i)=>sum+count*places[i],0).toFixed(2));
    const board=node('div','model-columns');
    function set(index:number,delta:number){
      const counts=state.counts.slice();
      if(counts[index]+delta<0||counts[index]+delta>19)return;
      counts[index]+=delta;update({counts,edited:true});
    }
    function trade(from:number,to:number){
      if(Math.abs(from-to)!==1)return;
      const counts=state.counts.slice(),bundling=from>to,take=bundling?10:1,give=bundling?1:10;
      if(counts[from]<take||counts[to]+give>19)return;
      counts[from]-=take;counts[to]+=give;update({counts,edited:true});
    }
    places.forEach((place,i)=>{
      const name=placeNames[place],count=state.counts[i],column=node('div','model-column');
      column.dataset.placeAt=String(i);
      column.append(node('strong','model-column-title',name));
      const add=action('',()=>set(i,1),'add-'+place);add.className='model-block-source';
      add.setAttribute('aria-label','Add one '+name.toLowerCase()+' block');add.dataset.place=String(place);add.dataset.delta='1';add.disabled=count>=19;
      add.append(blockArt(place),node('span','','+'));
      const tray=node('div','model-block-tray');
      for(let j=0;j<count;j++){
        const piece=action('',()=>set(i,-1),'remove-'+place+'-'+j);
        piece.className='model-built-block';piece.setAttribute('aria-label','Remove one '+name.toLowerCase()+' block');piece.dataset.piece=String(i);piece.append(blockArt(place));tray.append(piece);
      }
      column.append(add,node('output','',String(count)),tray);
      if(i>0){
        const bundle=action('Group 10',()=>trade(i,i-1),'group-'+place);
        bundle.disabled=count<10||state.counts[i-1]>=19;column.append(bundle);
      }
      if(i<places.length-1){
        const split=action('Split one',()=>trade(i,i+1),'split-'+place);
        split.disabled=!count||state.counts[i+1]>9;column.append(split);
      }
      board.append(column);
    });
    panel.append(board,node('output','math-built-number',String(value)));
    if(!value)panel.append(action('Choose zero',()=>update({...state,edited:true})));
    moves(panel,(from,to)=>trade(Number(from),Number(to)));
  },s=>s.edited?String(Number(s.counts.reduce((sum,count,i)=>sum+count*places[i],0).toFixed(2))):undefined);
}
type FractionState={parts:number;shaded:number;circle:boolean;page:number;edited:boolean};
function fractionWhole(state:FractionState,shade:(n:number)=>void) {
  const {parts,shaded,page,circle}=state;
  const wrapper=node('div',circle?'model-disc':'model-strip');
  const size=200,center=100,radius=94;
  const svg=graphic('svg',{viewBox:circle?'0 0 200 200':'0 0 200 56',preserveAspectRatio:circle?'xMidYMid meet':'none','aria-hidden':'true'});
  for(let i=0;i<parts;i++){
    const filled=page*parts+i<shaded;
    const attrs={fill:filled?'#7960cf':'#fff',stroke:'#544a69','stroke-width':1};
    if(!circle)svg.append(graphic('rect',{x:1+i*198/parts,y:2,width:198/parts,height:52,...attrs}));
    else if(parts===1)svg.append(graphic('circle',{cx:center,cy:center,r:radius,...attrs}));
    else {
      const at=(i:number)=>{const a=i*2*Math.PI/parts-Math.PI/2;return (center+radius*Math.cos(a))+' '+(center+radius*Math.sin(a));};
      const path='M 100 100 L '+at(i)+' A 94 94 0 0 1 '+at(i+1)+' Z';
      svg.append(graphic('path',{d:path,...attrs}));
    }
  }
  // The steppers expose the same exact operation to keyboard and screen-reader users.
  wrapper.append(svg);
  wrapper.onpointerup=event=>{
    if(event.button!==0)return;
    const rect=svg.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
    if(circle && Math.hypot(x-.5,y-.5)>radius/size)return;
    const fraction=circle?(Math.atan2(y-.5,x-.5)/(2*Math.PI)+1.25)%1:x;
    const part=Math.min(parts,Math.max(1,Math.floor(fraction*parts)+1));
    const end=page*parts+part;
    shade(end===shaded?end-1:end);
  };
  return wrapper;
}
export function fractions(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const equivalent=item.parameters.operation==='equivalent-numerator';
  const compare=item.parameters.operation==='fraction-compare';
  const initial:FractionState={parts:equivalent?Number(item.parameters.target):2,shaded:0,circle:false,page:0,edited:false};
  model(host,options,compare?'Compare the parts':equivalent?'Shade an equal amount':'Build a fraction',initial,({panel,state,update})=>{
    const maxWholes=item.skillId==='g4-multiply-fraction'?5:item.skillId==='g4-add-fraction'?2:1;
    const changeShaded=(n:number)=>update({...state,shaded:n,page:Math.min(maxWholes-1,Math.floor(Math.max(0,n-1)/state.parts)),edited:true});
    const controls=group('Fraction tools');
    const diagram=action(state.circle?'Use a bar':'Use a circle',()=>update({...state,circle:!state.circle}),'shape');
    controls.append(diagram);
    if(compare){
      const givens=node('div','model-comparison');
      for(const [n,d] of [[item.parameters.n,item.parameters.d],[item.parameters.otherN,item.parameters.otherD]]){
        const example={...state,parts:Number(d),shaded:Number(n),page:0};
        const reference=fractionWhole(example,()=>{});reference.onpointerup=null;
        reference.setAttribute('role','img');reference.setAttribute('aria-label',n+' of '+d+' equal pieces');
        givens.append(reference);
      }
      panel.append(givens,controls);return;
    }
    const whole=fractionWhole(state,changeShaded);
    const stateReadout=node('output','math-built-number',state.shaded+'/'+state.parts);
    const steppers=node('div','model-steppers');
    function addPartStepper(name:string,id:string,n:number,min:number,max:number,change:(next:number)=>void){
      const s=stepper(name,n,min,max,change);
      s.minus.dataset.fractionPart=s.plus.dataset.fractionPart=id;
      s.minus.dataset.delta='-1';s.plus.dataset.delta='1';steppers.append(s.wrapper);
    }
    addPartStepper('Shaded parts','numerator',state.shaded,0,maxWholes*state.parts,changeShaded);
    if(!equivalent)addPartStepper('Parts per whole','denominator',state.parts,1,12,n=>update({...state,parts:n,shaded:Math.min(state.shaded,n*maxWholes),page:Math.min(maxWholes-1,Math.floor(Math.max(0,state.shaded-1)/n)),edited:state.edited}));
    if(maxWholes>1){
      const pages=stepper('Whole',state.page+1,1,maxWholes,p=>update({...state,page:p-1}));
      controls.append(pages.wrapper);
    }
    panel.append(whole,stateReadout,controls,steppers);
    if(!state.shaded)panel.append(action('Choose zero',()=>update({...state,edited:true})));
  }, compare?undefined:s=>s.edited?(equivalent?String(s.shaded):s.shaded+'/'+s.parts):undefined);
}
export function arrays(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const area=/area|perimeter/.test(String(item.parameters.operation));
  model(host,options,area?'Build a rectangle':'Make equal groups',{rows:0,columns:0},({panel,state,update})=>{
    const max=12,board=node('div','model-array');
    board.setAttribute('aria-label',state.rows+' rows, '+state.columns+' columns');
    const svg=graphic('svg',{viewBox:'0 0 240 240','aria-hidden':'true'});
    for(let r=0;r<max;r++)for(let c=0;c<max;c++){
      const on=r<state.rows&&c<state.columns;
      if(area)svg.append(graphic('rect',{x:c*20+1,y:r*20+1,width:18,height:18,fill:on?'#9f86e6':'#f5f1ff',stroke:on?'#634a96':'#baafcc'}));
      else svg.append(graphic('circle',{cx:c*20+10,cy:r*20+10,r:on?7:2,fill:on?(r%2?'#425daf':'#7653b6'):'#a99ab9'}));
    }
    board.append(svg);
    board.onpointerup=e=>{
      if(e.button!==0)return;
      const b=svg.getBoundingClientRect(),rows=1+Math.floor(max*(e.clientY-b.top)/b.height),columns=1+Math.floor(max*(e.clientX-b.left)/b.width);
      if(rows>0&&rows<=max&&columns>0&&columns<=max)update({rows,columns});
    };
    const controls=node('div','model-steppers');
    controls.append(stepper('Rows',state.rows,0,max,rows=>update({...state,rows})).wrapper,stepper('Columns',state.columns,0,max,columns=>update({...state,columns})).wrapper);
    panel.append(board,controls);
    // Deliberately do not calculate or submit a product, quotient, perimeter or side.
  });
}
export function counterGroups(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const count=item.parameters.operation==='parity'?Number(item.parameters.a):0;
  model(host,options,'Move counters between groups',{counts:[count,0]},({panel,state,update})=>{
    const groups=node('div','model-comparison-groups');
    function move(from:number,to:number) {
      if(from===to || !state.counts[from] || state.counts[to]>=20)return;
      const counts=state.counts.slice();counts[from]--;counts[to]++;update({counts});
    }
    for(let i=0;i<2;i++){
      const column=node('div','model-group-column');
      column.dataset.placeAt=String(i);
      column.append(node('h4','',i===0?'First group':'Second group'));
      const tray=node('div','model-group-tray');
      if(!state.counts[i])tray.append(node('span','model-empty','Empty'));
      for(let j=0;j<state.counts[i];j++){
        const counter=action('',()=>move(i,1-i),'counter-'+i+'-'+j);
        counter.dataset.piece=String(i);
        counter.setAttribute('aria-label','Move one counter to the '+(i===0?'second':'first')+' group');
        counter.append(node('span','model-counter'));tray.append(counter);
      }
      column.append(tray);
      if(!count){
        const adjust=stepper('Counters in group '+(i+1),state.counts[i],0,20,n=>{
          const counts=state.counts.slice();counts[i]=n;update({counts});
        });
        column.append(adjust.wrapper);
      }
      groups.append(column);
    }
    panel.append(groups);
    moves(panel,(from,to)=>move(Number(from),Number(to)));
  });
}
