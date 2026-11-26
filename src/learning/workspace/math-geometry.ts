import type {MathItem} from '../types';
import {action, graphic, group, model, node, type MathModelOptions} from './math-view';
import {pointsAttribute, polygonVertices, type Vertex} from './math-geometry-points';

function diagram(label: string) {
  const svg = graphic('svg', {viewBox:'0 0 360 230', width:'100%', role:'img', 'aria-label':label});
  svg.style.maxWidth = '32rem';
  svg.style.display = 'block';
  svg.style.marginInline = 'auto';
  return svg;
}
const fill = '#c9defa', ink = '#2e4370', mark = '#51338a';
const toggle = (marks: readonly number[], index: number) =>
  marks.includes(index) ? marks.filter(n => n !== index) : [...marks, index];

function sides(host: HTMLElement, vertices: readonly Vertex[], shape: string, options: MathModelOptions) {
  const initial = {corners:false, current:0, edges:[] as number[], points:[] as number[]};
  model(host, options, 'Trace the shape', initial, ({panel, state, update}) => {
    const name = state.corners ? 'corner' : 'side';
    const svg = diagram(shape + ' with a movable marker');
    svg.append(graphic('polygon',{points:pointsAttribute(vertices),fill,stroke:ink,'stroke-width':4}));
    function markPart(i: number) {
      const field = state.corners ? 'points' : 'edges';
      update({...state,current:i,[field]:toggle(state[field],i)});
    }
    vertices.forEach(([x,y],i) => {
      const [xx,yy] = vertices[(i+1)%vertices.length];
      const cx=(x+xx)/2, cy=(y+yy)/2;
      if (state.edges.includes(i)) {
        svg.append(graphic('line',{x1:x,y1:y,x2:xx,y2:yy,stroke:mark,'stroke-width':8}));
        const angle = Math.atan2(yy-y,xx-x) + Math.PI/2;
        const dx = Math.cos(angle)*9, dy = Math.sin(angle)*9;
        svg.append(graphic('line',{x1:cx-dx,y1:cy-dy,x2:cx+dx,y2:cy+dy,stroke:mark,'stroke-width':4}));
      }
      if (state.points.includes(i)) svg.append(graphic('rect',{x:x-7,y:y-7,width:14,height:14,fill:mark}));
      if (state.current === i) svg.append(graphic('circle',{cx:state.corners?x:cx,cy:state.corners?y:cy,r:11,fill:'none',stroke:ink,'stroke-width':3,'stroke-dasharray':'3 2'}));
    });
    vertices.forEach(([x,y],i) => {
      const [xx,yy] = vertices[(i+1)%vertices.length];
      const target = state.corners
        ? graphic('circle',{cx:x,cy:y,r:26,fill:'transparent'})
        : graphic('line',{x1:x,y1:y,x2:xx,y2:yy,stroke:'transparent','stroke-width':44});
      target.style.cursor='pointer';
      target.dataset.shapePart = String(i);
      target.addEventListener('click', () => markPart(i));
      svg.append(target);
    });
    const modes = group('What to trace');
    for(const [label,corners] of [['Sides',false],['Corners',true]] as const){
      const button = action(label, () => update({...state,corners,current:0}));
      button.setAttribute('aria-pressed',String(corners===state.corners));
      modes.append(button);
    }
    const controls = group('Trace a '+name);
    const [x,y] = vertices[state.current];
    const [xx,yy] = vertices[(state.current+1)%vertices.length];
    const px=state.corners?x:(x+xx)/2, py=state.corners?y:(y+yy)/2;
    const place=[py<80?'upper':py>130?'lower':'middle',px<157?'left':px>203?'right':'center'].join(' ');
    const description=node('span','model-instruction','Marker: '+place+' '+name+'.');
    description.setAttribute('role','status');
    const marks = state.corners ? state.points : state.edges;
    const move = (delta:number) => update({...state,current:(state.current+delta+vertices.length)%vertices.length});
    const markButton = action(marks.includes(state.current)?'Unmark '+name:'Mark '+name, () => markPart(state.current), 'mark');
    markButton.setAttribute('aria-pressed',String(marks.includes(state.current)));
    controls.append(action('Previous '+name,()=>move(-1),'previous'),markButton,action('Next '+name,()=>move(1),'next'));
    panel.append(svg,description,modes,controls);
  });
}

function symmetry(host: HTMLElement, vertices: readonly Vertex[], options: MathModelOptions) {
  const cx = vertices.reduce((sum,point) => sum+point[0],0)/vertices.length;
  const cy = vertices.reduce((sum,point) => sum+point[1],0)/vertices.length;
  model(host,options,'Try a fold',{direction:15,visible:false,kept:[] as number[]},({panel,state,update}) => {
    const svg = diagram('Shape and your fold lines');
    svg.append(graphic('polygon',{points:pointsAttribute(vertices),fill,stroke:ink,'stroke-width':4}));
    const line = (degrees:number, selected:boolean) => {
      const angle = degrees*Math.PI/180;
      const dx = 134*Math.cos(angle), dy = 134*Math.sin(angle);
      svg.append(graphic('line',{x1:cx-dx,y1:cy-dy,x2:cx+dx,y2:cy+dy,stroke:selected?mark:ink,
        'stroke-width':selected?4:2, 'stroke-dasharray':selected?'8 4':'2 4','data-trial-line':degrees}));
    };
    state.kept.forEach(angle=>line(angle,false));
    if(state.visible)line(state.direction,true);
    const controls = group('Fold direction');
    function turn(delta:number) { update({...state,visible:true,direction:(state.direction+delta+180)%180}); }
    if(!state.visible) controls.append(action('Place a line',()=>update({...state,visible:true})));
    else {
      const keep = action(state.kept.includes(state.direction)?'Remove this line':'Keep this line',
        ()=>update({...state,kept:toggle(state.kept,state.direction)}),'keep');
      keep.setAttribute('aria-pressed',String(state.kept.includes(state.direction)));
      controls.append(action('Turn left',()=>turn(-15)),keep,action('Turn right',()=>turn(15)));
    }
    panel.append(svg,controls);
    if(state.visible){
      const direction=node('span','model-instruction','Your line: '+state.direction+'° clockwise from horizontal.');
      direction.setAttribute('role','status');
      panel.append(direction);
    }
  });
}

const cubeFaces: readonly Vertex[][] = [
  [[88,72],[211,72],[211,195],[88,195]],
  [[211,72],[265,33],[265,156],[211,195]],
  [[88,72],[142,33],[265,33],[211,72]],
];
const facePalette = ['#bae1fb','#dbd0f7','#fee4a2','#bfdcce','#e3d8f3','#ffc9cf'];

function cube(host: HTMLElement, options: MathModelOptions) {
  model(host,options,'Turn the cube',{order:[0,1,2,3,4,5],current:0,marked:[] as number[]},({panel,state,update})=>{
    const svg = diagram('Cube with front, right and top faces visible');
    const [front,right,back,left,top,bottom] = state.order;
    const visible = [front,right,top];
    function touch(index:number) {update({...state,current:index,marked:toggle(state.marked,visible[index])});}
    cubeFaces.forEach((vertices,i)=>{
      const id = visible[i], marked = state.marked.includes(id), current = state.current===i;
      const face = graphic('polygon',{points:pointsAttribute(vertices),fill:facePalette[id],stroke:ink,'stroke-width':3,'data-face':id});
      face.style.cursor='pointer';
      face.addEventListener('click',()=>touch(i));
      svg.append(face);
      const cx=vertices.reduce((sum,p)=>sum+p[0],0)/4,cy=vertices.reduce((sum,p)=>sum+p[1],0)/4;
      if(current)svg.append(graphic('circle',{cx,cy,r:12,fill:'none',stroke:ink,'stroke-width':3,'stroke-dasharray':'3 2','pointer-events':'none'}));
      if(marked)svg.append(graphic('path',{d:'M '+(cx-6)+' '+cy+' l 4 5 9 -10',fill:'none',stroke:mark,'stroke-width':4,'pointer-events':'none'}));
    });
    const controls = group('Move the cube');
    controls.append(action('Turn left',()=>update({...state,order:[left,front,right,back,top,bottom]})),
      action('Turn right',()=>update({...state,order:[right,back,left,front,top,bottom]})),
      action('Tip up',()=>update({...state,order:[top,right,bottom,left,back,front]})));
    const marker = group('Mark a face');
    const markButton = action(state.marked.includes(visible[state.current])?'Unmark face':'Mark face',()=>touch(state.current),'mark');
    markButton.setAttribute('aria-pressed',String(state.marked.includes(visible[state.current])));
    marker.append(action('Next face',()=>update({...state,current:(state.current+1)%3})),markButton);
    const name=['front','right','top'][state.current];
    markButton.setAttribute('aria-label',(state.marked.includes(visible[state.current])?'Unmark ':'Mark ')+name+' face');
    panel.append(svg,controls,marker);
  });
}

/** Child-placed marks describe observations. The original choice/input is the only response. */
export function shapes(host: HTMLElement, item: MathItem, options: MathModelOptions) {
  const name = String(item.parameters.shape);
  if(name==='cube') { cube(host,options); return; }
  const spec = item.visual?.kind==='shape' ? item.visual : undefined;
  const vertices = polygonVertices(name,spec?.width,spec?.height);
  if(!vertices.length)return;
  if(item.parameters.operation==='symmetry')symmetry(host,vertices,options);
  else sides(host,vertices,name,options);
}
