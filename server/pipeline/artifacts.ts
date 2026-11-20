import {validateGenerated, type GeneratedGame} from '../agent/generated';
import { createHash } from 'node:crypto';
import type { CandidateArtifact,StarGame } from './types';
export function validateArtifact(value:unknown):StarGame|GeneratedGame {
 if((value as {format?:string})?.format==='generated-source-v1'){const a=value as {format:string;game:unknown};if(Object.keys(a).some(k=>!['format','game'].includes(k)))throw Error('ARTIFACT_REJECTED');return validateGenerated(a.game);}
 const artifact=value as {format:'declarative-v1';game:StarGame},g=artifact?.game;
 if(!artifact||artifact.format!=='declarative-v1'||Object.keys(artifact).some(k=>!['format','game'].includes(k))||!g||g.kind!=='star-catcher-v1'||Object.keys(g).some(k=>!['kind','target','seconds'].includes(k))||!Number.isInteger(g.target)||g.target<2||g.target>10||!Number.isInteger(g.seconds)||g.seconds<3||g.seconds>60)throw Error('ARTIFACT_REJECTED');
 return {kind:'star-catcher-v1',target:g.target,seconds:g.seconds};
}
// A trusted, closed renderer for the validated declarative artifact. Agent JS/HTML never reaches the app.
export function renderPreview(game:StarGame,artifactId:string,channel:string):{html:string;csp:string;sha256:string} {
 if(!/^[\w-]{1,100}$/.test(artifactId)||!/^[\w-]{8,100}$/.test(channel))throw Error('INVALID_CHANNEL');validateArtifact({format:'declarative-v1',game});
 const script=`
const config=${JSON.stringify(game)},channel=${JSON.stringify(channel)},artifactId=${JSON.stringify(artifactId)};
let count=0,remaining=config.seconds,timer=null,ended=false,paused=false,connected=false,roundId=0,validatedPlayRound=0;
const target=document.getElementById('field'),status=document.getElementById('status'),score=document.getElementById('score');
function report(event,extra={}){parent.postMessage({type:'factory-preview',channel,artifactId,event,roundId,...extra},'*')}
function pause(){paused=true;document.getElementById('restart').disabled=true;target.inert=true;}
addEventListener('message',event=>{const d=event.data;if(event.source!==parent||!d||d.type!=='factory-learning'||d.channel!==channel||d.artifactId!==artifactId)return;
 if(d.action==='connect'){connected=true;report('ready',{learningProtocol:1,height:Math.ceil(document.body.scrollHeight)});if(validatedPlayRound===roundId&&roundId>0)report('play-started',{learningProtocol:1});}
 if(d.action==='pause')pause();
 if(d.action==='resume'){paused=false;document.getElementById('restart').disabled=false;target.inert=false;}
});
function draw(){score.textContent=count+' / '+config.target+' stars · '+remaining+' seconds'}
function finish(won){ended=true;clearInterval(timer);target.replaceChildren();status.textContent=won?'You caught the stars!':'Time is up. Try another way!';if(connected)pause();report('round-complete',{won,score:count})}
function place(){target.replaceChildren();for(let i=0;i<3;i++){const star=document.createElement('button');star.textContent='⭐';star.setAttribute('aria-label','Catch star');star.style.left=(5+i*30+Math.random()*3)+'%';star.style.top=(5+Math.random()*65)+'%';star.onclick=()=>{if(ended||paused)return;count++;draw();if(count>=config.target)finish(true);else place()};target.append(star)}}
function start(){if(paused)return;clearInterval(timer);roundId++;count=0;remaining=config.seconds;ended=false;status.textContent='Tap the stars before time runs out!';draw();place();timer=setInterval(()=>{if(paused||document.hidden)return;remaining--;draw();if(remaining<=0)finish(false)},1000);validatedPlayRound=roundId;report('play-started',{learningProtocol:1})}
document.getElementById('restart').onclick=start;start();report('ready',{learningProtocol:1,height:Math.ceil(document.body.scrollHeight)});`;
 const scriptHash=createHash('sha256').update(script).digest('base64');
 const csp=`default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors *`;
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp.replace('; frame-ancestors *','')}"><title>Catch the Stars · private preview</title><style>body{margin:0;background:#211942;color:#fff;font:18px system-ui;text-align:center}h1{font-size:25px}#field{height:270px;position:relative;background:#312457;border-radius:20px;margin:12px}button{font:inherit;min-height:48px;min-width:48px;border:2px solid #ffe590;border-radius:16px;background:#ffd668;color:#20163d;padding:10px}#field button{position:absolute;font-size:32px;background:#65518b}button:focus-visible{outline:4px solid #8dffdf}p{padding:0 12px}</style><h1>🌟 Catch the Stars</h1><p id="score"></p><p id="status" role="status"></p><div id="field"></div><button id="restart">Play again</button><script>${script}</script></html>`;
 return {html,csp,sha256:createHash('sha256').update(html).digest('hex')};
}
