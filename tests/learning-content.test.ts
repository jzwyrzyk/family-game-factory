import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, getSkill } from '../src/learning/curriculum';
import { evaluateAnswer, generateItem, legacyFactItem } from '../src/learning/content';
import type { MathItem, MathVisual } from '../src/learning/types';

const seeded=(initial:number)=>{let seed=initial>>>0;return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);};
const numeric=(value:string|number):number=>{if(typeof value==='number')return value;if(value.includes('/')){const [n,d]=value.split('/').map(Number);return n/d;}return Number(value);};
const cmp=(a:number,b:number)=>a===b?'=':a<b?'<':'>';
/** Independent semantic oracle: calculated from presented quantities, never generator answers. */
function expected(item:MathItem):number|string {
 const p=item.parameters,n=(key:string)=>Number(p[key]);
 switch(p.operation){
 case 'add':return n('a')+n('b');case 'subtract':return n('a')-n('b');case 'multiply':return n('a')*n('b');case 'divide':return n('a')/n('b');
 case 'missing-addend':return n('total')-n('a');case 'equality':return String(n('a')+n('b')===n('c')+n('d'));
 case 'compose':return n('hundreds')*100+n('tens')*10+n('ones');case 'compare':return cmp(n('a'),n('b'));
 case 'maximum-index':{const values=[n('a'),n('b'),n('c')];return ['Red ribbon','Blue ribbon','Green ribbon'][values.indexOf(Math.max(...values))];}
 case 'clock':return `${n('hours')}:${String(n('minutes')).padStart(2,'0')}`;
 case 'chart-difference':return (n('b')-n('a'))*n('scale');case 'chart-value':return n('a');
 case 'shape-count':return ({triangle:3,square:4,rectangle:4,pentagon:5,hexagon:6,cube:6} as Record<string,number>)[String(p.shape)];
 case 'part-name':return ({2:'half',3:'third',4:'fourth'} as Record<number,string>)[n('denominator')];
 case 'pattern':{let x=n('start');for(let i=0;i<3;i++)x=p.multiply?x*n('step'):x+n('step');return x;}
 case 'parity':return n('a')%2?'odd':'even';
 case 'coins':return n('quarters')*25+n('dimes')*10+n('nickels')*5+n('pennies');
 case 'add-subtract':return n('a')+n('b')-n('c');case 'multiply-subtract':return n('a')*n('b')-n('c');
 case 'missing-factor':return n('total')/n('a');case 'round':return Math.round(n('a')/n('place'))*n('place');
 case 'fraction':return n('n')/n('d');case 'equivalent-numerator':return n('n')*n('target')/n('d');
 case 'fraction-compare':return cmp(n('n')*n('otherD'),n('otherN')*n('d'));case 'elapsed':return n('end')-n('start');
 case 'area':return n('width')*n('height');case 'perimeter':return n('width')*2+n('height')*2;
 case 'shape-category':return p.shape==='triangle'?'triangle':p.shape==='pentagon'?'pentagon':'quadrilateral';
 case 'digit-value':return Math.floor(n('a')/n('place'))%10*n('place');
 case 'remainder':return n('a')%n('b');case 'quotient':return Math.floor(n('a')/n('b'));case 'factor':return n('a')%n('b')===0?'yes':'no';
 case 'fraction-add':return (n('n')+n('otherN'))/n('d');case 'fraction-subtract':return (n('n')-n('otherN'))/n('d');case 'fraction-multiply':return n('a')*n('n')/n('d');
 case 'decimal':return n('n')/n('d');case 'missing-area-side':return n('total')/n('width');case 'missing-perimeter-side':return (n('total')-2*n('width'))/2;
 case 'frequency':return [n('a'),n('b'),n('c')][n('selected')];
 case 'fraction-data-range':return (n('max')-n('min'))/n('d');case 'fraction-data-total':return (n('a')+2*n('b')+3*n('c'))/n('d');
 case 'angle-kind':return n('degrees')<90?'acute':n('degrees')===90?'right':'obtuse';
 case 'parallel-pairs':return p.shape==='triangle'?0:p.shape==='trapezoid'?1:2;
 case 'symmetry':return ({triangle:3,square:4,rectangle:2} as Record<string,number>)[String(p.shape)];
 default:throw Error(`Missing independent oracle for ${p.operation}`);
 }
}
function validateVisual(visual:MathVisual){
 switch(visual.kind){
 case 'array':assert.ok(visual.rows>=1&&visual.rows<=12);assert.ok(visual.columns>=1&&visual.columns<=12);break;
 case 'groups':assert.ok(visual.groups>=1&&visual.groups<=12);assert.ok(visual.each>=0&&visual.each<=12);break;
 case 'fraction':assert.ok(visual.denominator>=2&&visual.denominator<=12);assert.ok(visual.numerator>=0&&visual.numerator<=visual.denominator);break;
 case 'clock':assert.ok(visual.hours>=1&&visual.hours<=12);assert.ok(visual.minutes>=0&&visual.minutes<60);break;
 case 'number-line':assert.ok(visual.max>visual.min);assert.ok(visual.start>=visual.min&&visual.start<=visual.max);break;
 case 'chart':case 'line-plot':assert.equal(visual.labels.length,visual.values.length);assert.ok(visual.values.every(Number.isFinite));break;
 default:break;
 }
}

test('curriculum provides explicit supported coverage for every grade and an acyclic prerequisite graph',()=>{
 assert.equal(SKILLS.length,73);assert.equal(new Set(SKILLS.map(s=>s.id)).size,SKILLS.length);
 for(const grade of [1,2,3,4]){const skills=SKILLS.filter(s=>s.grade===grade);assert.ok(skills.length>=16);for(const domain of ['operations','place-value','measurement','geometry','data'])assert.ok(skills.some(s=>s.domain===domain),`grade ${grade} ${domain}`);}
 function visit(id:string,path:string[]){assert.ok(!path.includes(id),`cycle ${[...path,id]}`);const s=getSkill(id);assert.ok(s);assert.ok(s.standards.length&&s.description);for(const parent of s.prerequisites){const before=getSkill(parent);assert.ok(before,`missing ${parent}`);assert.ok(before.grade<=s.grade);visit(parent,[...path,id]);}}
 for(const skill of SKILLS)visit(skill.id,[]);
});

test('all 73 skill generators have valid independent answers and graduated support over 6,570 samples',()=>{
 let checked=0;
 for(const skill of SKILLS)for(let seed=1;seed<=30;seed++)for(const representation of ['symbolic','story','visual'] as const){
  const item=generateItem(skill.id,{random:seeded(seed*193+skill.grade),tier:seed%3,representation});
  const label=`${skill.id} seed ${seed} ${representation}`;
  assert.equal(item.skillId,skill.id,label);assert.equal(item.grade,skill.grade,label);
  assert.match(item.id,/^[a-zA-Z0-9:._/\-]{1,179}$/,label);
  assert.equal(item.hints.length,3,label);assert.ok(item.hints.every(h=>h.text.trim().length>5),label);assert.equal(new Set(item.hints.map(h=>h.text)).size,3,label);assert.ok(item.workedExample.length>5,label);
  assert.ok(!/undefined|NaN|Infinity/.test(JSON.stringify(item)),label);
  const oracle=expected(item);
  if(typeof oracle==='number'){assert.ok(Number.isFinite(oracle),label);assert.ok(Math.abs(numeric(item.answer)-oracle)<1e-10,label+` expected ${oracle}; got ${item.answer}`);}
  else assert.equal(item.answer,oracle,label);
  assert.equal(evaluateAnswer(item,String(item.answer)).correct,true,label);
  assert.equal(evaluateAnswer(item,'').valid,false,label);assert.equal(evaluateAnswer(item,'<script>alert(1)</script>').valid,false,label);
  if(item.answerKind==='choice'){assert.ok(item.choices&&item.choices.length>=2,label);assert.equal(new Set(item.choices.map(c=>c.value)).size,item.choices.length,label);assert.ok(item.choices.some(c=>c.value===item.answer),label);}
  if(item.visual){assert.equal(item.representation,'visual',label);validateVisual(item.visual);}
  for(const step of item.hints)if(step.visual)validateVisual(step.visual);
  checked++;
 }
 assert.equal(checked,6570);
});

test('fraction checking accepts equivalent values and mixed numbers without floating-point grading',()=>{
 const item=generateItem('g3-unit-fraction',{random:()=>0});assert.equal(item.answer,'1/2');
 for(const raw of ['1/2','2/4','10/20','0.5','.5','  1 / 2  '])assert.equal(evaluateAnswer(item,raw).correct,true,raw);
 for(const raw of ['1/0','1/','1//2','Infinity','NaN','0x0.5','5e-1','0.500000001','1,2',''])assert.equal(evaluateAnswer(item,raw).valid,false,raw);
 for(const raw of ['1/3','0.6','2'])assert.equal(evaluateAnswer(item,raw).correct,false,raw);
 const mixed={...item,answer:'3/2'};assert.equal(evaluateAnswer(mixed,'1 1/2').correct,true);assert.equal(evaluateAnswer(mixed,'6/4').correct,true);assert.equal(evaluateAnswer(mixed,'1 2/2').valid,false);
 const decimal=generateItem('g4-decimal',{random:()=>0});assert.equal(evaluateAnswer(decimal,String(decimal.answer)).correct,true);
});

test('legacy fact identities are exact, bounded and assigned appropriate content grades',()=>{
 for(const [id,answer,grade] of [['mul:8x7',56,3],['mul:1x12',12,3],['div:56/8',7,3],['div:0/4',0,3],['add:0:0',0,1],['add:8:7',15,1],['add:48:52',100,2],['sub:83:17',66,2],['add:1250:4500',5750,4],['sub:900000:800000',100000,4]] as const){const item=legacyFactItem(id);assert.ok(item,id);assert.equal(item.factId,id);assert.equal(item.answer,answer);assert.equal(item.grade,grade);}
 for(const id of ['mul:0x9','mul:13x7','div:4/0','div:13/4','sub:1:2','add:1000000:1','__proto__','add:1:-2'])assert.equal(legacyFactItem(id),undefined,id);
});

test('content grade ranges, representations and nontrivial variants remain honest',()=>{
 for(let seed=0;seed<80;seed++){
  const rng=seeded(seed+19);
  for(const id of ['g1-add-10','g1-add-20','g2-add-100','g2-add-1000']){const item=generateItem(id,{random:rng});const max=id.endsWith('-10')?10:id.endsWith('-20')?20:id.endsWith('-100')?100:1000;assert.ok(Number(item.answer)<=max);}
  const multiplication=generateItem('g3-multiply',{random:rng,tier:2});assert.ok(Number(multiplication.answer)<=100);
  const fraction=generateItem('g3-unit-fraction',{random:rng});assert.ok([2,3,4,6,8].includes(Number(fraction.parameters.d)));
  const equivalent=generateItem('g4-equivalent-fraction',{random:rng});assert.ok([2,3,4,5,6,8,10,12,100].includes(Number(equivalent.parameters.target)));
  const sequence=generateItem('g2-skip-count',{random:rng});assert.ok(Number(sequence.answer)<=1000);
  const division=generateItem('g4-divide',{random:rng,tier:2});assert.ok(Number(division.parameters.a)<=9999);assert.ok(Number(division.parameters.b)<=9);
 }
 const symbolic=generateItem('g3-multiply',{factId:'mul:8x7',representation:'symbolic'}),story=generateItem('g3-multiply',{factId:'mul:8x7',representation:'story'}),visual=generateItem('g3-multiply',{factId:'mul:8x7',representation:'visual'});
 assert.equal(symbolic.representation,'symbolic');assert.equal(story.representation,'story');assert.equal(visual.representation,'visual');assert.notEqual(symbolic.id,story.id);assert.equal(symbolic.factId,visual.factId);
 const answers=new Set(Array.from({length:40},(_,seed)=>generateItem('g4-shapes',{random:seeded(seed*13+41)}).answer));assert.ok(answers.size>=2,'parallel-pair questions must not always have one fixed answer');
 const positions=new Set(Array.from({length:80},(_,seed)=>{const item=generateItem('g2-time',{random:seeded(seed*37+71)});return item.choices!.findIndex(option=>option.value===item.answer);}));assert.equal(positions.size,4,'the correct clock answer must not have a fixed position');
 const minutes=new Set(Array.from({length:30},(_,seed)=>generateItem('g3-time',{random:seeded(seed*43+19),tier:2}).parameters.start));assert.ok([...minutes].some(value=>Number(value)%5!==0),'grade 3 includes minute precision');
 assert.ok(!generateItem('g2-arrays',{random:seeded(9)}).workedExample.includes('×'),'grade 2 arrays teach repeated addition');
});

test('grade 4 fraction-data answers agree with the actual line-plot labels and frequencies',()=>{
 for(let seed=1;seed<=40;seed++)for(const tier of [0,1,2]){
  const item=generateItem('g4-data',{random:seeded(seed*179),tier}),visual=item.visual;
  assert.equal(visual?.kind,'line-plot');if(visual?.kind!=='line-plot')throw Error('Expected a line plot');
  const lengths=visual.labels.map(label=>numeric(label.replace(/ m$/,''))),counts=visual.values;
  assert.ok(counts.every(count=>Number.isInteger(count)&&count>0&&count<=5));
  let answer:number;
  if(tier===0){const target=visual.labels.findIndex(label=>item.question.includes(`measure ${label}?`));assert.ok(target>=0);answer=counts[target];}
  else if(tier===1)answer=Math.max(...lengths)-Math.min(...lengths);
  else answer=lengths.reduce((total,length,index)=>total+length*counts[index],0);
  assert.ok(Math.abs(numeric(item.answer)-answer)<1e-10,`${item.id}: expected ${answer}`);
 }
});

test('invalid generation inputs fail explicitly and hostile random sources stay bounded',()=>{
 assert.throws(()=>generateItem('not-a-skill'),/UNKNOWN_MATH_SKILL/);
 for(const random of [()=>-1,()=>1,()=>NaN,()=>Infinity])for(const id of ['g1-add-10','g3-multiply','g4-equivalent-fraction']){const item=generateItem(id,{random,tier:100});assert.ok(Number.isFinite(numeric(item.answer)));assert.equal(item.tier,2);}
 assert.equal(generateItem('g1-add-10',{tier:NaN}).tier,1);
});
