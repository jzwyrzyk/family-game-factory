import type { MathItem, MathVisual } from './types';

const SVG = 'http://www.w3.org/2000/svg';
const BLUE = '#78b9ff', GOLD = '#ffe28a', INK = '#f3f7ff', EDGE = '#8ea1c8';
function svg<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}
function label(root: SVGElement, x: number, y: number, value: string, size = 15) {
  const node = svg('text', {x, y, fill: INK, 'text-anchor': 'middle', 'font-size': size, 'font-family': 'system-ui, sans-serif'});
  node.textContent = value; root.append(node);
}
function line(root: SVGElement, x1: number, y1: number, x2: number, y2: number, color = EDGE, width = 2) {
  root.append(svg('line', {x1, y1, x2, y2, stroke: color, 'stroke-width': width}));
}
function dot(root: SVGElement, cx: number, cy: number, r: number, fill = BLUE) {
  root.append(svg('circle', {cx, cy, r, fill}));
}
const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const fmt = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
function fractionLabel(value: number) {
  if(Number.isInteger(value))return String(value);
  for(let denominator=2;denominator<=16;denominator++)if(Math.abs(value*denominator-Math.round(value*denominator))<1e-8)return `${Math.round(value*denominator)}/${denominator}`;
  return fmt(value);
}

/** A verbal equivalent, including the full quantities, accompanies every diagram. */
export function describeVisual(visual: MathVisual): string {
  switch (visual.kind) {
    case 'ten-frame': return `${visual.count} counters${visual.extra ? ` and ${visual.extra} more counters` : ''}, arranged in frames of ten.`;
    case 'number-line': return `Number line from ${fractionLabel(visual.min)} to ${fractionLabel(visual.max)}, starting at ${fractionLabel(visual.start)}${visual.jumps.length ? ` with jumps of ${visual.jumps.map(fractionLabel).join(', ')}` : ''}.`;
    case 'array': return `${visual.rows} rows, with ${visual.columns} objects in every row${visual.splitAfter ? `; divided after row ${visual.splitAfter}` : ''}.`;
    case 'groups': return `${visual.groups} equal groups, with ${visual.each} objects in each group.`;
    case 'fraction': return `${visual.whole ? `${visual.whole} whole${visual.whole === 1 ? '' : 's'} and ` : ''}${visual.numerator} of ${visual.denominator} equal parts.`;
    case 'place-value': return `Place-value model for ${fmt(visual.value)}${visual.highlight !== undefined ? `; the ${fmt(visual.highlight)} place is highlighted` : ''}.`;
    case 'clock': {
      const hour=((visual.hours-1)%12+12)%12+1, next=hour%12+1, minute=((visual.minutes%60)+60)%60;
      const minuteNumber=Math.floor(minute/5)||12, ticks=minute%5;
      const short=minute===0?`at ${hour}`:minute===30?`halfway between ${hour} and ${next}`:`between ${hour} and ${next}`;
      const long=ticks?`${ticks} small tick${ticks===1?'':'s'} past ${minuteNumber}`:`at ${minuteNumber}`;
      return `Analog clock. The short hand points ${short}. The long hand points ${long}.`;
    }
    case 'shape': return `${visual.shape.replaceAll('-', ' ')}${visual.width !== undefined ? `, width ${visual.width}` : ''}${visual.height !== undefined ? `, height ${visual.height}` : ''}${visual.labels?.length ? `. ${visual.labels.join('. ')}` : ''}.`;
    case 'chart': return `Bar chart. ${visual.labels.map((name, i) => `${name}: ${visual.values[i]}${visual.unit ? ` ${visual.unit}` : ''}`).join('; ')}.`;
    case 'line-plot': return `Line plot. Each X represents one observation. ${visual.labels.map((name, i) => `${name}: ${visual.values[i]} observations`).join('; ')}${visual.unit ? `. ${visual.unit}` : ''}.`;
    case 'angle': return `Two rays form the given ${visual.degrees}° angle; the curved mark shows the angle between them.`;
  }
}

/** Creates diagrams with DOM APIs only. No curriculum text is interpreted as HTML. */
export function renderMathVisual(visual: MathVisual): HTMLElement {
  const figure = document.createElement('figure'); figure.className = 'math-visual'; figure.dataset.visualKind = visual.kind;
  const caption = document.createElement('figcaption'); caption.textContent = describeVisual(visual);
  const drawing = svg('svg', {viewBox: '0 0 360 220', role: 'img', 'aria-label': describeVisual(visual)});
  // A real caption is always available. Reading a clock or angle is itself the task,
  // so those captions describe its structure without announcing the answer.
  figure.append(drawing, caption);
  switch (visual.kind) {
    case 'ten-frame': {
      const first = Math.max(0, Math.floor(finite(visual.count))), second = Math.max(0, Math.floor(finite(visual.extra)));
      const total = first + second;
      if (total > 40) { label(drawing, 180, 110, 'Use the quantities in the description.'); break; }
      const frames = Math.max(1, Math.ceil(total / 10)), size = frames > 2 ? 23 : 30;
      for (let f = 0; f < frames; f++) {
        const ox = 12 + (f % 2) * 178, oy = 24 + Math.floor(f / 2) * 95;
        for (let j = 0; j < 10; j++) {
          const x = ox + j % 5 * (size + 3), y = oy + Math.floor(j / 5) * (size + 3), index = f * 10 + j;
          drawing.append(svg('rect', {x, y, width: size, height: size, rx: 4, fill: '#172443', stroke: EDGE}));
          if (index < total) dot(drawing, x + size / 2, y + size / 2, size / 3, index < first ? BLUE : GOLD);
        }
      }
      break;
    }
    case 'number-line': {
      const min = finite(visual.min), max = finite(visual.max, min + 10), span = Math.max(.001, max - min), pos = (n: number) => 25 + (n - min) / span * 310;
      line(drawing, 25, 145, 335, 145, INK, 3);
      const fractionalStep=visual.jumps.find(j=>Math.abs(j)>0&&Math.abs(j)<1);
      const parts=fractionalStep?Math.round(span/Math.abs(fractionalStep)):0;
      const ticks = parts>=2&&parts<=16&&Math.abs(parts*Math.abs(fractionalStep!)-span)<1e-8 ? parts : span <= 20 && Number.isInteger(span) ? Math.max(1, span) : 10;
      for (let i = 0; i <= ticks; i++) { const v = min + span * i / ticks, x = pos(v); line(drawing, x, 137, x, 153); label(drawing, x, 178, span<=2?fractionLabel(v):fmt(v), ticks > 12 ? 11 : 13); }
      if (visual.start >= min && visual.start <= max) dot(drawing, pos(visual.start), 145, 7, GOLD);
      let start = visual.start;
      visual.jumps.slice(0, 12).forEach((jump, i) => {
        const end = start + jump;
        if (start >= min && start <= max && end >= min && end <= max) {
          const x1 = pos(start), x2 = pos(end), height = Math.min(85, 24 + Math.abs(x2 - x1) * .35);
          drawing.append(svg('path', {d: `M ${x1} 134 Q ${(x1+x2)/2} ${134-height*2} ${x2} 134`, fill:'none',stroke: i%2 ? GOLD : BLUE,'stroke-width':3}));
          drawing.append(svg('path', {d: `M ${x2-5} 124 L ${x2} 134 L ${x2+5} 124`, fill:'none',stroke: i%2 ? GOLD : BLUE,'stroke-width':3}));
          label(drawing, (x1+x2)/2, 126-height, `${jump > 0 ? '+' : ''}${span<=2?fractionLabel(jump):fmt(jump)}`, 13);
        }
        start = end;
      });
      break;
    }
    case 'array': {
      const rows = Math.max(0, Math.floor(finite(visual.rows))), cols = Math.max(0, Math.floor(finite(visual.columns)));
      if (rows > 20 || cols > 20) { label(drawing, 180, 110, `${rows} rows of ${cols}`); break; }
      const gap = Math.min(28, 150 / Math.max(1, rows), 290 / Math.max(1, cols));
      const x0 = 180 - (cols-1)*gap/2, y0 = 110 - (rows-1)*gap/2;
      for (let r=0;r<rows;r++) for(let c=0;c<cols;c++) dot(drawing,x0+c*gap,y0+r*gap,Math.max(2,gap*.29),visual.splitAfter!==undefined&&r>=visual.splitAfter?GOLD:BLUE);
      if (visual.splitAfter && visual.splitAfter < rows) line(drawing,x0-gap/2,y0+(visual.splitAfter-.5)*gap,x0+(cols-.5)*gap,y0+(visual.splitAfter-.5)*gap,GOLD,2);
      label(drawing,180,202,`${rows} rows · ${cols} in each row`,14); break;
    }
    case 'groups': {
      const groups = Math.max(0, Math.floor(finite(visual.groups))), each = Math.max(0, Math.floor(finite(visual.each)));
      if (groups > 12 || each > 20) { label(drawing,180,105,`${groups} groups`);label(drawing,180,135,`${each} in every group`);break; }
      const across = Math.min(4,Math.max(1,groups)), rows = Math.ceil(groups/across), width = 320/across, height = 160/Math.max(1,rows);
      for(let g=0;g<groups;g++) {
        const x=20+g%across*width,y=12+Math.floor(g/across)*height;
        drawing.append(svg('rect',{x:x+3,y:y+3,width:width-8,height:height-8,rx:10,fill:'#172443',stroke:EDGE}));
        const perRow=Math.min(5,Math.max(1,each)), gap=Math.min((width-20)/perRow,(height-15)/Math.max(1,Math.ceil(each/perRow)));
        for(let i=0;i<each;i++) dot(drawing,x+12+(i%perRow+.5)*gap,y+9+(Math.floor(i/perRow)+.5)*gap,Math.max(2,gap*.27));
      }
      label(drawing,180,202,`${groups} equal groups · ${each} in each`,14);break;
    }
    case 'fraction': {
      const denominator=Math.max(1,Math.floor(finite(visual.denominator,1))), numerator=Math.max(0,Math.floor(finite(visual.numerator))), whole=Math.max(0,Math.floor(finite(visual.whole)));
      const units=Math.max(1,whole+Math.ceil(numerator/denominator));
      if(denominator>16||units>6){label(drawing,180,105,`${whole?`${whole} + `:''}${numerator}/${denominator}`);break;}
      const rowHeight=Math.min(46,160/units);
      for(let unit=0;unit<units;unit++) {
        const shaded=unit<whole?denominator:Math.min(denominator,Math.max(0,numerator-(unit-whole)*denominator));
        for(let part=0;part<denominator;part++) drawing.append(svg('rect',{x:20+part*320/denominator,y:15+unit*rowHeight,width:320/denominator,height:rowHeight-8,fill:part<shaded?BLUE:'#182444',stroke:EDGE,'stroke-width':1.4}));
      }
      label(drawing,180,204,'Each bar is one whole.',14);break;
    }
    case 'place-value': {
      const value=finite(visual.value), text=String(Math.abs(value)), [integer,fraction='']=text.split('.');
      const cells=[...integer].map((digit,i)=>({digit,place:10**(integer.length-i-1)})).concat([...fraction].map((digit,i)=>({digit,place:10**(-i-1)})));
      const width=Math.min(64,330/Math.max(1,cells.length));
      cells.forEach((cell,i)=>{const x=180-cells.length*width/2+i*width;
        drawing.append(svg('rect',{x:x+2,y:55,width:width-4,height:100,rx:8,fill:cell.place===visual.highlight?'#435777':'#192b4a',stroke:cell.place===visual.highlight?GOLD:EDGE}));
        label(drawing,x+width/2,82,fmt(cell.place),width<45?10:13);label(drawing,x+width/2,128,cell.digit,28);
      });
      label(drawing,180,194,'A digit’s place changes its value.',14);break;
    }
    case 'clock': {
      const cx=180,cy=105,r=85,hours=finite(visual.hours)%12,minutes=finite(visual.minutes);
      drawing.append(svg('circle',{cx,cy,r,fill:'#192b4a',stroke:EDGE,'stroke-width':3}));
      for(let i=0;i<60;i++){const a=i*Math.PI/30-Math.PI/2;line(drawing,cx+Math.cos(a)*(r-5),cy+Math.sin(a)*(r-5),cx+Math.cos(a)*(r-(i%5?9:14)),cy+Math.sin(a)*(r-(i%5?9:14)),EDGE,i%5?1:2);}
      for(let i=1;i<=12;i++){const a=i*Math.PI/6-Math.PI/2;label(drawing,cx+Math.cos(a)*(r-27),cy+Math.sin(a)*(r-27)+5,String(i),15);}
      const hourAngle=(hours+minutes/60)*Math.PI/6-Math.PI/2,minuteAngle=minutes*Math.PI/30-Math.PI/2;
      line(drawing,cx,cy,cx+Math.cos(hourAngle)*39,cy+Math.sin(hourAngle)*39,GOLD,6);line(drawing,cx,cy,cx+Math.cos(minuteAngle)*65,cy+Math.sin(minuteAngle)*65,BLUE,4);dot(drawing,cx,cy,5,INK);break;
    }
    case 'shape': {
      const name=visual.shape.toLowerCase(), attrs={fill:'#294e74',stroke:BLUE,'stroke-width':3};
      const paths:Record<string,string>={triangle:'180,25 90,180.8846 270,180.8846',square:'100,25 260,25 260,185 100,185',rectangle:'60,45 300,45 300,165 60,165',pentagon:'180,20 270,80 235,180 125,180 90,80',hexagon:'110,35 250,35 295,105 250,175 110,175 65,105',parallelogram:'110,45 300,45 250,175 60,175',rhombus:'180,25 295,105 180,185 65,105',trapezoid:'120,45 240,45 300,175 60,175'};
      if(name==='rectangle'&&visual.width&&visual.height){const scale=Math.min(260/visual.width,150/visual.height),w=visual.width*scale,h=visual.height*scale;paths.rectangle=`${180-w/2},${105-h/2} ${180+w/2},${105-h/2} ${180+w/2},${105+h/2} ${180-w/2},${105+h/2}`;}
      if(name==='circle')drawing.append(svg('circle',{cx:180,cy:105,r:80,...attrs}));
      else if(name==='cube'){
        drawing.append(svg('polygon',{points:'100,65 225,65 225,185 100,185',...attrs}));drawing.append(svg('polygon',{points:'100,65 150,25 275,25 225,65',...attrs,fill:'#3f7093'}));drawing.append(svg('polygon',{points:'225,65 275,25 275,145 225,185',...attrs,fill:'#23405f'}));
      }else if(paths[name])drawing.append(svg('polygon',{points:paths[name],...attrs}));
      else label(drawing,180,105,visual.shape,24);
      if(visual.width!==undefined)label(drawing,180,211,String(visual.width),17);
      if(visual.height!==undefined)label(drawing,30,112,String(visual.height),17);
      break;
    }
    case 'chart': {
      const count=Math.min(8,visual.labels.length,visual.values.length), maximum=Math.max(1,...visual.values.slice(0,count).map(n=>Math.max(0,finite(n)))),width=290/Math.max(1,count);
      line(drawing,40,20,40,172);line(drawing,40,172,340,172);
      for(let i=0;i<count;i++) {const value=Math.max(0,finite(visual.values[i])),height=value/maximum*120,x=46+i*width;
        drawing.append(svg('rect',{x,y:172-height,width:width-10,height,rx:3,fill:i%2?GOLD:BLUE}));label(drawing,x+(width-10)/2,164-height,fmt(value),13);label(drawing,x+(width-10)/2,194,visual.labels[i],count>5?10:13);
      }
      if(visual.unit)label(drawing,180,216,visual.unit,12);break;
    }
    case 'line-plot': {
      const count=Math.min(visual.labels.length,visual.values.length);
      if(count>8){label(drawing,180,110,'Use the frequencies in the description.');break;}
      const values=visual.values.slice(0,count).map(n=>Math.max(0,Math.floor(finite(n))));
      const maximum=Math.max(1,...values),gap=Math.min(21,130/maximum),radius=Math.min(5.5,gap*.32);
      line(drawing,24,168,336,168,INK,2.5);
      for(let i=0;i<count;i++){
        const x=count===1?180:45+i*270/(count-1);
        line(drawing,x,162,x,175,INK,2);
        for(let mark=0;mark<values[i];mark++){
          const y=155-mark*gap,group=svg('g',{'data-frequency-mark':i});
          line(group,x-radius,y-radius,x+radius,y+radius,BLUE,2.5);
          line(group,x-radius,y+radius,x+radius,y-radius,BLUE,2.5);
          drawing.append(group);
        }
        label(drawing,x,195,visual.labels[i],count>5?11:14);
      }
      label(drawing,180,216,visual.unit||'Each X = 1 observation',12);break;
    }
    case 'angle': {
      const degrees=Math.max(0,Math.min(360,finite(visual.degrees))),cx=115,cy=155,r=105,a=-degrees*Math.PI/180;
      line(drawing,cx,cy,cx+r,cy,BLUE,4);line(drawing,cx,cy,cx+Math.cos(a)*r,cy+Math.sin(a)*r,GOLD,4);
      if(degrees>0&&degrees<360)drawing.append(svg('path',{d:`M ${cx+35} ${cy} A 35 35 0 ${degrees>180?1:0} 0 ${cx+Math.cos(a)*35} ${cy+Math.sin(a)*35}`,stroke:INK,fill:'none','stroke-width':2}));
      dot(drawing,cx,cy,5,INK);break;
    }
  }
  return figure;
}

export type InteractionKind = 'quantity' | 'fraction' | 'choice' | 'answer';
export function interactionKind(item: MathItem): InteractionKind {
  if (item.answerKind === 'choice' && item.choices?.length) return 'choice';
  if (item.answerKind === 'fraction') return 'fraction';
  if (item.answerKind === 'number' && typeof item.answer === 'number' && Number.isFinite(item.answer) && item.answer >= 0 && item.answer <= 9999999) return 'quantity';
  return 'answer';
}

/** Ranges come from the given quantities and grade ceiling, never the answer. */
export function quantityPlaces(item: MathItem): number[] {
  const decimal = /decimal|tenths|hundredths/i.test(`${item.skillId} ${item.skill}`) || /dollars|\$/i.test(item.unit||'');
  const ceiling=item.grade === 4 ? 1000000 : item.grade === 3 ? 1000 : item.grade === 2 ? 1000 : 100;
  const knownNumbers=Object.values(item.parameters).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n));
  for(const match of item.question.matchAll(/\d[\d,]*(?:\.\d+)?/g))knownNumbers.push(Number(match[0].replaceAll(',','')));
  const given=Math.max(10,...knownNumbers.map(Math.abs));
  const multiplication=/multiply|multiplication|times|area|groups|pattern/i.test(`${item.skillId} ${item.skill} ${item.parameters.operation||''}`);
  const bound=Math.min(ceiling,Math.max(10,multiplication?given*given:given*2));
  const most=/compose|place-value/.test(String(item.parameters.operation)) ? (item.grade===1?10:item.grade===2?100:ceiling) : 10**Math.floor(Math.log10(bound));
  const integers:number[]=[];for(let p=most;p>=1;p/=10)integers.push(p);
  return decimal ? [...integers,.1,.01] : integers;
}
