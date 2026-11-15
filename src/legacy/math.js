/* Skill-specific, explainable adaptive practice. Experimental, NOT IXL scoring. */
(function () {
'use strict';
const FG=window.FG=window.FG||{};
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick=a=>a[rnd(0,a.length-1)];
function bank(profile){
 const list=[];const age=Number(profile.age)||7;const focus=profile.focus||'adaptive';
 function add(a,b,op){const plus=op==='+';list.push({id:`${plus?'add':'sub'}:${a}:${b}`,skill:plus?'Addition':'Subtraction',question:`${a} ${op} ${b} = ?`,answer:plus?a+b:a-b,hint:plus?`Try counting ${b} steps forward from ${a}.`:`Start at ${a} and count back ${b}.`})}
 function mult(a,b){list.push({id:`mul:${a}x${b}`,skill:`× ${a}`,question:`${a} × ${b} = ?`,answer:a*b,hint:`Break it up: ${a} × ${Math.max(1,b-1)} plus one more ${a}.`})}
 function div(a,b){list.push({id:`div:${a*b}/${b}`,skill:'Division',question:`${a*b} ÷ ${b} = ?`,answer:a,hint:`Think: what number times ${b} gives ${a*b}?`})}
 if(focus==='add'||(focus==='adaptive'&&age<=7)){
  const max=age<=5?10:age<=7?20:50;
  // Stable fact IDs make historical evidence useful on later sessions.
  for(let a=1;a<=max;a++)for(let b=1;b<=max;b++){
    if(a+b<=max)add(a,b,'+');
    if(a>=b)add(a,b,'-');
  }
 }else if(focus==='times8'){for(let b=2;b<=10;b++)mult(8,b)}
 else if(focus==='mul'){for(let a=2;a<=9;a++){for(let b=2;b<=10;b++)mult(a,b)}}
 else if(focus==='div'){for(let b=2;b<=9;b++)for(let a=2;a<=10;a++)div(a,b)}
 else{
  for(let a=2;a<=9;a++)for(let b=2;b<=10;b++)mult(a,b);
  for(let i=0;i<16;i++)add(rnd(2,24),rnd(1,12),'+');
  for(let b=2;b<=7;b++)for(let a=2;a<=8;a++)div(a,b);
 }
 return list;
}
function estimate(skill){if(!skill||!skill.tries)return null;return Math.round((skill.right+1)/(skill.tries+2)*100)}
function select(profile){const pool=bank(profile);const intensity=profile.intensity||'balanced';const candidate=pool.map(q=>{
 const rec=profile.skills[q.id];const score=estimate(rec);
 // Strong emphasis on unmastered facts; still mix in retrieval of known skills.
 const weakness=score===null?.8:Math.max(.12,(100-score)/100);
 const weight=Math.random() < (intensity==='gentle'?.35:intensity==='stretch'?.82:.64)?weakness*weakness+.05:.28;
 return {q,weight};
 });
 const total=candidate.reduce((sum,x)=>sum+x.weight,0);let roll=Math.random()*total;
 for(const c of candidate){roll-=c.weight;if(roll<=0)return {...c.q}}
 return {...candidate[candidate.length-1].q};
}
function record(profile,q,firstTryCorrect,helpUsed){const rec=profile.skills[q.id] ||= {tries:0,right:0,hints:0,streak:0,last:null};rec.tries++;if(firstTryCorrect){rec.right++;rec.streak++}else{rec.streak=0}if(helpUsed)rec.hints++;rec.last=new Date().toISOString();FG.store.save()}
function review(profile){const entries=Object.entries(profile.skills).filter(([,v])=>v&&v.tries>0);const weak=entries.filter(([,v])=>estimate(v)<70).sort((a,b)=>estimate(a[1])-estimate(b[1]));return {attempts:entries.reduce((n,[,v])=>n+v.tries,0),practiced:entries.length,weak:weak.slice(0,6).map(([id,v])=>({id,confidence:estimate(v),tries:v.tries})),entries:entries.sort((a,b)=>a[0].localeCompare(b[0]))};}
function canAsk(profile){const rate=Number(profile.rate)||0;if(rate<1)return false;const now=Date.now(),begin=now-600000;profile.mathWindow=(profile.mathWindow||[]).filter(t=>t>begin);if(profile.mathWindow.length>=rate)return false;const last=profile.mathWindow.at(-1)||0;return now-last>=Math.max(30000,600000/(rate*2));}
function didAsk(profile){profile.mathWindow=(profile.mathWindow||[]).filter(t=>t>Date.now()-600000);profile.mathWindow.push(Date.now());FG.store.save()}
FG.math={bank,select,record,review,estimate,canAsk,didAsk};
})();
