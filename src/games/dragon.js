import {rand,shuffle,make,button,startCanvas,rounded,text} from './helpers.js';
const HEROES=[['Ruby','🦊','#ff967a'],['Pip','🐼','#faf0ce'],['Luna','🐰','#cfb2f4'],['Jax','🐸','#9cdb9f']];
function Dragon(mount,ctx){let level=1,playerIdx=null,alive=true,anim=0,keys={},shots=[],breath=[],frame=0,player={x:175,y:320,vy:0,hp:4,immune:0},dragonHP=7,mode='select',emerge=0,sauce=0,finishDelay=0,theme=0;let ui,canvas,c,controls,finished=false;
 function start(){mount.replaceChildren();const el=startCanvas(mount);canvas=el.canvas;c=el.c;controls=el.controls;ui=el;controls.append(button('Left',()=>{keys.ArrowLeft=true;setTimeout(()=>keys.ArrowLeft=false,180)},'btn secondary','arrow','jems-icon--back'),button('Jump',jump,'btn secondary','arrow','jems-icon--up'),button('Throw meatball',shoot,'btn primary','send'),button('Right',()=>{keys.ArrowRight=true;setTimeout(()=>keys.ArrowRight=false,180)},'btn secondary','arrow'));const help=make('div','mini-help','← → move · ↑ jump · SPACE throw meatballs · three friends help automatically');mount.append(help);mode='playing';frame=0;finished=false;draw();}
 function heroSelect(){mount.replaceChildren();const block=make('div','builder-wrap');block.style.textAlign='center';block.innerHTML='<h2>🏰 Choose your hero!</h2><p>All four friends will fight beside you. Who do you want to control?</p>';const cards=make('div','builder-pieces');cards.style.justifyContent='center';HEROES.forEach(([name,emoji],i)=>{const b=button(`${emoji} ${name}`,()=>{playerIdx=i;resetWorld();start()},'builder-piece');b.style.fontSize='20px';cards.append(b)});block.append(cards);mount.append(block)}
 function resetWorld(){player={x:175,y:320,vy:0,hp:ctx.config.hearts,immune:0};dragonHP=Math.max(5,7+Math.floor(level/3));shots=[];breath=[];frame=0;emerge=0;mode='playing';sauce=0;finishDelay=0;finished=false;keys={};theme=rand(0,3)}
 function keydown(e){if(!alive||mode!=='playing')return;if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();if(e.code==='ArrowUp'&&!e.repeat)jump();if(e.code==='Space'&&!e.repeat)shoot();if(e.code==='ArrowLeft'||e.code==='ArrowRight')keys[e.code]=true}
 function keyup(e){if(e.code==='ArrowLeft'||e.code==='ArrowRight')keys[e.code]=false}
 function jump(){if(mode==='playing'&&player.y>=320)player.vy=-12}
 function shoot(){if(mode!=='playing'||frame-(shoot.last||-100)>12){if(mode!=='playing')return;shots.push({x:player.x+36,y:player.y+25,v:9,from:'hero'});shoot.last=frame}}
 function sky(){const skies=[['#a9e6fe','#eefcff'],['#ffcca6','#fff1c5'],['#c4b9f7','#ece9ff'],['#a5dfdc','#dff6c9']];const s=skies[theme];let gr=c.createLinearGradient(0,0,0,480);gr.addColorStop(0,s[0]);gr.addColorStop(1,s[1]);c.fillStyle=gr;c.fillRect(0,0,960,480)}
 function draw(){if(!c)return;sky();text(c,theme===1?'☀️':theme===2?'🌙':'☁️',500,72,45);text(c,'🏰',104,251,170);for(let i=0;i<14;i++)text(c,theme===2?'🌸':'🌼',18+i*73,395+Math.sin(i)*12,27);c.fillStyle=theme===1?'#86b15e':'#70c78a';c.fillRect(0,410,960,70);c.fillStyle='#5b8551';c.fillRect(0,432,960,13);
 // Cave opens on the right. Dragon emerges gradually.
 c.fillStyle='#797279';c.beginPath();c.ellipse(834,311,145,133,0,Math.PI,0);c.lineTo(980,410);c.lineTo(695,410);c.fill();c.fillStyle='#30313b';c.beginPath();c.ellipse(843,317,96,104,0,0,Math.PI*2);c.fill();text(c,'DRAGON CAVE',829,211,20,'#fff6db');
 if(emerge>0){text(c,'🐲',853-Math.min(emerge,1)*68,313,155)}
 for(let i=0;i<HEROES.length;i++){if(i===playerIdx)continue;const x=55+(i>playerIdx?i-1:i)*61;text(c,HEROES[i][1],x,374,49)}
 if(playerIdx!==null){if(player.immune>0&&Math.floor(player.immune/5)%2===0){}else text(c,HEROES[playerIdx][1],player.x,player.y+45,62)}
 shots.forEach(s=>text(c,'🍝',s.x,s.y,27));breath.forEach(b=>text(c,'🔥',b.x,b.y,31));
 text(c,`LEVEL ${level}     🐲 ${'♥'.repeat(Math.max(0,dragonHP))}     YOU ${'♥'.repeat(Math.max(0,player.hp))}`,480,30,23,'#293953');
 if(mode==='playing'&&emerge<1)text(c,'The dragon is coming out!',470,139,26,'#45285c');
 if(mode==='loss'){c.fillStyle='#d62e2e';for(let i=0;i<18;i++)c.fillRect(player.x-65+i*7,0,8,Math.min(480,sauce*5+Math.sin(i)*26));for(let i=0;i<12;i++)text(c,'🍅',player.x-115+i*19,Math.min(460,sauce*4.2+Math.sin(i)*22),23);text(c,'MEATBALL SAUCE AVALANCHE!',480,126,28,'#a52237')}
 }
 function update(){if(mode==='loss'){sauce+=1;finishDelay++;if(finishDelay>95&&!finished){finished=true;ctx.finish({won:false,level,title:'🍝 Sauce everywhere!',description:'The dragon smashed the ground! Try again with your friends.'})}return}
 if(mode!=='playing')return;frame++;emerge=Math.min(1,emerge+.007);
 if(keys.ArrowLeft)player.x=Math.max(30,player.x-4.2);if(keys.ArrowRight)player.x=Math.min(665,player.x+4.2);
 player.vy+=.68;player.y=Math.min(320,player.y+player.vy);if(player.y===320)player.vy=0;if(player.immune>0)player.immune--;
 if(frame%85===0&&emerge>=.6){shots.push({x:170+rand(0,180),y:347,v:8,from:'friend'})}
 if(frame%140===0&&emerge>=1){breath.push({x:757,y:354,v:Math.max(2.4,3+level*.15)*ctx.config.breathSpeed})}
 shots.forEach(s=>s.x+=s.v);breath.forEach(b=>b.x-=b.v);const pre=shots.length;shots=shots.filter(s=>{if(s.x>725&&emerge>=.8){dragonHP--;return false}return s.x<970});
 breath=breath.filter(b=>{if(Math.abs(b.x-player.x)<33&&Math.abs(b.y-(player.y+28))<48&&player.immune===0){player.hp--;player.immune=85;return false}return b.x>-20});
 if(dragonHP<=0&&!finished){finished=true;mode='win';ctx.finish({won:true,level,title:'🏆 Dragon defeated!',description:'Your whole team saved the castle! A new world is waiting.'})}
 if(player.hp<=0&&mode==='playing'){mode='loss';sauce=0;finishDelay=0}
 }
 function loop(){if(!alive)return;update();draw();anim=requestAnimationFrame(loop)}
 window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
 this.snapshot=()=>({level,hearts:player.hp,mode,breathSpeed:ctx.config.breathSpeed});this.next=()=>{level++;resetWorld();start()};this.restart=()=>{level=1;resetWorld();playerIdx=null;heroSelect()};this.unmount=()=>{alive=false;cancelAnimationFrame(anim);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);mount.replaceChildren()};heroSelect();anim=requestAnimationFrame(loop)
}

export default Dragon;
