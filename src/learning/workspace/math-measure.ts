import type {MathItem} from '../types';
import {renderMathVisual} from '../visuals';
import {action, graphic, group, model, node, stepper, type MathModelOptions} from './math-view';

export function clock(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const elapsed=item.parameters.operation==='elapsed';
  const start=elapsed?Number(item.parameters.start):0;
  model(host,options,'Move the hands',{minutes:start%720,hour:false},({panel,state,update})=>{
    const select=(n:number)=>update({...state,minutes:(n%720+720)%720});
    const hours=Math.floor(state.minutes/60),minutes=state.minutes%60;
    const face=renderMathVisual({kind:'clock',hours,minutes});
    const drawing=face.querySelector('svg')!;
    face.querySelector('figcaption')?.remove();
    face.classList.add('model-clock');
    // Measure the same centred SVG coordinates regardless of the rendered viewport.
    const setHand=(event:PointerEvent)=>{
      if(event.button!==0)return;
      const ctm=drawing.getScreenCTM();if(!ctm)return;
      const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(ctm.inverse());
      if(Math.hypot(p.x-180,p.y-105)>90)return;
      const turn=(Math.atan2(p.y-105,p.x-180)/Math.PI/2+1.25)%1;
      select(state.hour?Math.round(turn*12)%12*60+minutes:hours*60+Math.round(turn*60)%60);
    };
    drawing.onpointerup=setHand;
    const hands=group('Hand to move');
    for(const [name,hour] of [['Hour hand',true],['Minute hand',false]] as const){
      const hand=action(name,()=>update({...state,hour}));
      hand.setAttribute('aria-pressed',String(state.hour===hour));hands.append(hand);
    }
    const step=state.hour?60:1,unit=state.hour?'hour':'minute';
    const minus=action('Back one '+unit,()=>select(state.minutes-step),'less-hand');
    const plus=action('Forward one '+unit,()=>select(state.minutes+step),'more-hand');
    panel.append(face,hands,minus,plus);
    // A child reads the fixed clock stimulus independently. The practice face never translates it into digital time.
  });
}
export function coins(host:HTMLElement,_item:MathItem,options:MathModelOptions) {
  const names=['Quarter','Dime','Nickel','Penny'],values=[25,10,5,1];
  model(host,options,'Sort coins',{counts:[0,0,0,0]},({panel,state,update})=>{
    const tray=node('div','model-coins');
    const set=(i:number,n:number)=>{const counts=state.counts.slice();counts[i]=n;update({counts});};
    names.forEach((name,i)=>{
      const column=node('div','model-coin-group'), value=values[i]+'¢';
      const add=action('',()=>set(i,state.counts[i]+1));
      add.dataset.modelKey='add-'+name;add.className='model-coin';add.dataset.coin=name;
      add.setAttribute('aria-label','Add a '+name.toLowerCase()+', '+value);add.disabled=state.counts[i]>=20;
      add.append(node('b','',value),node('span','',name));column.append(add);
      const pile=node('div','model-coin-pile');
      for(let j=0;j<state.counts[i];j++){
        const coin=action(value,()=>set(i,state.counts[i]-1),'take-'+name+'-'+j);
        coin.className='model-coin-small';coin.dataset.coin=name;coin.setAttribute('aria-label','Remove a '+name.toLowerCase());pile.append(coin);
      }
      column.append(pile);tray.append(column);
    });
    panel.append(tray);
  });
}
export function ruler(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const max=item.skillId==='g1-length'?20:100;
  model(host,options,'Measure on the ruler',{offset:0,marks:[0,0],active:0},({panel,state,update})=>{
    const range=10;
    const ruler=node('div','model-ruler');
    const set=(n:number)=>{const marks=state.marks.slice();marks[state.active]=n;update({...state,marks});};
    const svg=graphic('svg',{viewBox:'0 0 300 60',preserveAspectRatio:'none','aria-hidden':'true'});
    for(let i=0;i<=range*10;i++){
      const x=10+280*i/(range*10);
      svg.append(graphic('line',{x1:x,x2:x,y1:60,y2:i%10===0?30:i%5===0?44:53,stroke:'currentColor','stroke-width':i%10===0?2:1}));
    }
    state.marks.forEach((n,i)=>{
      if(n<state.offset||n>state.offset+range)return;
      const x=10+280*(n-state.offset)/range;
      svg.append(graphic('path',{d:i?'M '+x+' 30 l -5 -8 h 10 Z':'M '+x+' 14 l -5 -8 h 10 Z',fill:i?'#6651b6':'#216292'}));
    });
    ruler.append(svg);
    ruler.onpointerup=e=>{
      if(e.button!==0)return;
      const b=svg.getBoundingClientRect(),n=Math.round((((e.clientX-b.left)/b.width)*300-10)/280*range);
      if(n>=0&&n<=range)set(n+state.offset);
    };
    const labels=node('div','model-ruler-labels');
    for(let i=0;i<=range;i+=2)labels.append(node('span','',String(i+state.offset)));
    const markers=group('Choose a marker');
    state.marks.forEach((n,i)=>{
      const mark=action('Marker '+(i+1)+' · '+n+' cm',()=>update({...state,active:i}),'marker-'+i);
      mark.setAttribute('aria-pressed',String(state.active===i));markers.append(mark);
    });
    const turn=group('Ruler section');
    for(const [name,delta] of [['Previous 10 cm',-10],['Next 10 cm',10]] as const){
      const n=state.offset+delta,b=action(name,()=>update({...state,offset:n}));
      b.disabled=n<0||n>=max;turn.append(b);
    }
    const adjust=stepper('Marker in cm',state.marks[state.active],0,max,n=>{
      const marks=state.marks.slice();marks[state.active]=n;
      update({...state,marks,offset:Math.min(max-10,Math.floor(n/10)*10)});
    });
    panel.append(ruler,labels,markers,adjust.wrapper,turn);
  });
}
export function angles(host:HTMLElement,_item:MathItem,options:MathModelOptions) {
  model(host,options,'Turn the ray',{degrees:0},({panel,state,update})=>{
    const fig=renderMathVisual({kind:'angle',degrees:state.degrees}),svg=fig.querySelector('svg')!;
    fig.querySelector('figcaption')?.remove();
    svg.onpointerup=e=>{
      if(e.button!==0 || !svg.getScreenCTM())return;
      const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
      if(p.y>155 || Math.hypot(p.x-115,p.y-155)<8)return;
      update({degrees:Math.round(Math.atan2(155-p.y,p.x-115)*180/Math.PI)});
    };
    panel.append(fig,stepper('Degrees',state.degrees,0,180,degrees=>update({degrees})).wrapper);
  });
}
export function chart(host:HTMLElement,item:MathItem,options:MathModelOptions) {
  const stimulus=item.visual;
  if(!stimulus||stimulus.kind!=='line-plot'&&stimulus.kind!=='chart')return;
  const plot=stimulus.kind==='line-plot',max=Math.max(...stimulus.values,1);
  model(host,options,plot?'Mark the observations':'Explore the chart',{marked:[] as string[]},({panel,state,update})=>{
    const graph=node('div','model-chart'), unit=stimulus.unit||'';
    for(let i=0;i<stimulus.labels.length;i++){
      const column=node('div','model-chart-column'),label=stimulus.labels[i],value=stimulus.values[i];
      const bars=node('div','model-chart-marks');
      bars.setAttribute('role','group');bars.setAttribute('aria-label',label);
      const toggle=(key:string)=>update({marked:state.marked.includes(key)?state.marked.filter(m=>m!==key):[...state.marked,key]});
      if(plot){
        for(let j=0;j<value;j++){
          const key=i+'-'+j,mark=action('×',()=>toggle(key),'mark-'+key);
          mark.className='model-observation';
          mark.setAttribute('aria-pressed',String(state.marked.includes(key)));
          mark.setAttribute('aria-label','One ribbon at '+label);
          bars.append(mark);
        }
      }else{
        const key=String(i),bar=action('',()=>toggle(key),'bar-'+key);
        bar.className='model-chart-bar';
        bar.setAttribute('aria-pressed',String(state.marked.includes(key)));
        bar.setAttribute('aria-label',label+' bar. '+Array(value).fill('One unit').join('. '));
        const segments=node('span','model-chart-stack');
        for(let j=0;j<value;j++)segments.append(node('span','model-chart-segment'));
        segments.style.height=(100*value/max)+'%';
        bar.append(segments);bars.append(bar);
      }
      column.append(bars,node('span','model-chart-label',label));graph.append(column);
    }
    panel.append(graph);
    if(unit)panel.append(node('p','model-chart-unit',plot?'Each × is one ribbon.':unit));
  });
}
export function compose(host:HTMLElement,_item:MathItem,options:MathModelOptions) {
  type Piece={x:number;y:number;turn:number};
  model(host,options,'Move the triangles',{pieces:[{x:0,y:0,turn:0},{x:2,y:1,turn:2}],active:0},({panel,state,update})=>{
    const board=node('div','model-compose'),drawing=graphic('svg',{viewBox:'0 0 300 200','aria-hidden':'true'});
    const place=(patch:Partial<Piece>)=>update({...state,pieces:state.pieces.map((p,i)=>i===state.active?{...p,...patch}:p)});
    state.pieces.forEach((p,i)=>drawing.append(graphic('polygon',{points:'0,0 100,0 0,100',fill:i?'#79c8bb':'#a893db',stroke:'#443860','stroke-width':2,transform:'translate('+p.x*100+' '+p.y*100+') rotate('+p.turn*90+' 50 50)'})));
    board.append(drawing);board.onpointerup=e=>{
      if(e.button!==0)return;
      const b=drawing.getBoundingClientRect(),x=Math.floor((e.clientX-b.left)*3/b.width),y=Math.floor((e.clientY-b.top)*2/b.height);
      if(x>=0&&x<3&&y>=0&&y<2)place({x,y});
    };
    const select=group('Choose a triangle');
    for(let i=0;i<2;i++){
      const which=action('Triangle '+(i+1),()=>update({...state,active:i}));
      which.setAttribute('aria-pressed',String(state.active===i));select.append(which);
    }
    const current=state.pieces[state.active],controls=group('Move the triangle');
    for(const [name,dx,dy] of [['Left',-1,0],['Right',1,0],['Up',0,-1],['Down',0,1]] as const){
      const x=current.x+dx,y=current.y+dy,b=action(name,()=>place({x,y}));
      b.disabled=x<0||x>=3||y<0||y>=2;controls.append(b);
    }
    controls.append(action('Turn',()=>place({turn:(current.turn+1)%4})));
    panel.append(board,select,controls);
  });
}
