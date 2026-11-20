import {setIconLabel} from '../brand/icons';
const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
function make(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e}
function button(label,click,cls='btn secondary',icon,iconClass=''){const b=make('button',cls,label);b.type='button';if(icon)setIconLabel(b,icon,label,iconClass);b.addEventListener('click',click);return b}
function startCanvas(mount){const holder=make('div','canvas-wrap'),canvas=make('canvas');canvas.width=960;canvas.height=480;holder.append(canvas);mount.replaceChildren(holder);const controls=make('div','canvas-controls');mount.append(controls);return {canvas,c:canvas.getContext('2d'),controls,holder}}
function rounded(c,x,y,w,h,r,color){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill()}
function text(c,s,x,y,size=26,color='#fff',align='center'){c.textAlign=align;c.textBaseline='middle';c.font=`800 ${size}px system-ui, sans-serif`;c.fillStyle=color;c.fillText(s,x,y)}

export {rand,shuffle,make,button,startCanvas,rounded,text};
