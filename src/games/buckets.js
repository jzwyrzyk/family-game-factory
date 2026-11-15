import {rand,shuffle,make,button,startCanvas,rounded,text} from './helpers.js';
function Buckets(mount,ctx){const positions=Array.from({length:ctx.config.bucketCount},(_,i)=>480+(i-(ctx.config.bucketCount-1)/2)*(ctx.config.bucketCount===3?250:Math.min(250,800/ctx.config.bucketCount))),count=positions.length;let level=1,selected=1,safe=rand(0,count-1),phase='choose',progress=0,last=0,animId=0,alive=true;const {c,canvas,controls}=startCanvas(mount);
 const go=button('🪣 Choose bucket',commit,'btn primary');const random=button('🎲 Randomize (↓)',()=>{if(phase==='choose'){selected=rand(0,count-1);draw()}},'btn secondary');controls.append(button('◀ Left',()=>step(-1),'btn secondary'),go,button('Right ▶',()=>step(1),'btn secondary'),random);
 const help=make('div','mini-help','← → choose a bucket · ↓ randomly select (optional) · SPACE make your choice');mount.append(help);
 const choices=make('div','bucket-choices');controls.before(choices);
 function updateChoices(){choices.replaceChildren();positions.forEach((x,i)=>{const b=button(`Bucket ${i+1}${ctx.config.revealSafe&&i===safe?' ⭐ Safe':''}`,()=>{if(phase==='choose'){selected=i;updateChoices();draw()}},'btn secondary bucket-choice');b.setAttribute('aria-pressed',String(selected===i));b.disabled=phase!=='choose';choices.append(b)})}
 function step(d){if(phase==='choose'){selected=(selected+d+count)%count;updateChoices();draw()}}
 function commit(){if(phase!=='choose')return;phase='pour';progress=0;go.disabled=true;updateChoices()}
 function keyboard(e){if(!alive)return;if(!['ArrowLeft','ArrowRight','ArrowDown','Space',' '].includes(e.code)&&!['ArrowLeft','ArrowRight','ArrowDown',' '].includes(e.key))return;e.preventDefault();if(e.code==='ArrowLeft')step(-1);if(e.code==='ArrowRight')step(1);if(e.code==='ArrowDown'){if(phase==='choose'){selected=rand(0,count-1)}}if(e.code==='Space')commit()}
 function click(e){if(phase!=='choose')return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*960;const choice=Math.round((x-positions[0])/(positions[1]-positions[0]));if(choice>=0&&choice<count){selected=choice;updateChoices();draw()}}
 canvas.addEventListener('pointerdown',click);window.addEventListener('keydown',keyboard);
 function draw(){const bg=c.createLinearGradient(0,0,0,480);bg.addColorStop(0,'#7fdcff');bg.addColorStop(1,'#f9dfeb');c.fillStyle=bg;c.fillRect(0,0,960,480);text(c,`SPLASH OR PASS · LEVEL ${level}`,480,34,28,'#1c3c5b');if(ctx.config.revealSafe)text(c,'⭐',positions[safe],95,30,'#1c3c5b');
 // Park scenery + ground
 c.fillStyle='#7ac87a';c.fillRect(0,397,960,83);for(let x=24;x<960;x+=77){text(c,x%3===0?'🌷':'🌼',x,412,21)}
 positions.forEach((x,i)=>{if(selected===i&&phase==='choose'){rounded(c,x-90,105,180,280,25,'#ffef7f77');rounded(c,x-89,107,178,276,25,'#ffda7099')}text(c,'🪣',x,147,105);text(c,String(i+1),x,224,22,'#153454');c.strokeStyle='#7b638b';c.lineWidth=7;c.beginPath();c.moveTo(x,0);c.lineTo(x,95);c.stroke();});
 // Kid avatar stands below choice
 const px=positions[selected];text(c,'😄',px,332,85);text(c,'👕',px,391,55);
 if(phase==='choose'){text(c,'Pick a bucket!',480,268,30,'#124264')}
 if(phase==='pour'){const t=Math.min(1,progress/(ctx.config.splashMs*.66)),x=px;const bad=selected!==safe;const liquid=bad?(level%2===0?'#e94641':'#66bf4f'):'#aee9ff';
 c.fillStyle=liquid;for(let i=0;i<13;i++){let dx=Math.sin(i*2.9+progress*.004)*24;c.fillRect(x-40+i*5+dx,175,8,Math.max(0,t*225-rand(0,11)))}
 if(t>.6){for(let i=0;i<15;i++){const xx=x-85+i*12;const yy=395+Math.sin(i*2)*8;c.fillStyle=liquid;c.beginPath();c.arc(xx,yy,12+8*t,0,Math.PI*2);c.fill()}if(bad&&level%2===0)for(let i=0;i<7;i++)text(c,'🍝',x-100+i*30,330+Math.sin(i)*28,26)}
 if(t>.85){text(c,bad?'OH NO! SAUCE ATTACK!':'YOU STAYED DRY!',480,273,36,bad?'#9d223e':'#11694d')}}
 }
 function tick(ts){if(!alive)return;const dt=Math.min(48,ts-(last||ts));last=ts;if(phase==='pour'){progress+=dt;if(progress>ctx.config.splashMs){const won=selected===safe;phase='done';ctx.finish({won,level,title:won?'🎉 Safe and sound!':'🫗 Splaaaaash!',description:won?'Brilliant choice! Ready for the next level?':'A hilarious bucket got you. Try again!'});}}draw();animId=requestAnimationFrame(tick)}
 function reset(){safe=rand(0,count-1);selected=1;phase='choose';progress=0;go.disabled=false;updateChoices();draw()}
 this.snapshot=()=>({level,selected,bucketCount:count,phase,splashMs:ctx.config.splashMs,revealSafe:ctx.config.revealSafe});this.next=()=>{level++;reset()};this.restart=()=>{level=1;reset()};this.unmount=()=>{alive=false;cancelAnimationFrame(animId);window.removeEventListener('keydown',keyboard);mount.replaceChildren()};reset();animId=requestAnimationFrame(tick)
}

export default Buckets;
