import {earlyMathItem} from './early/math';
import {isEarlyGrade} from './grades';
import { getSkill } from './curriculum';
import type { AnswerCheck, HintStep, MathItem, MathVisual, Representation } from './types';

export interface ItemOptions { random?: () => number; tier?: number; representation?: Representation; factId?: string }
type Draft = Omit<MathItem,'id'|'skillId'|'skill'|'grade'|'representation'|'tier'> & { representation?: Representation };
const fmt = (n: number) => n.toLocaleString('en-US');
const comparison = (a: number,b: number) => a<b?'<':a>b?'>':'=';
const comparisonChoices = [{value:'<',label:'Less than (<)'},{value:'=',label:'Equal to (=)'},{value:'>',label:'Greater than (>)'}];
const gcd = (a:number,b:number):number => b ? gcd(b,a%b) : Math.abs(a);
const fraction = (n:number,d:number):string => { const g=gcd(n,d); return `${n/g}/${d/g}`; };
const clockText = (h:number,m:number) => `${((h-1)%12+12)%12+1}:${String(m).padStart(2,'0')}`;
const hint = (text:string,visual?:MathVisual):HintStep => ({text,...(visual?{visual}:{})});
const fractionVisual = (n:number,d:number):MathVisual => ({kind:'fraction',numerator:n%d,denominator:d,whole:Math.floor(n/d)});

/** Numeric work is generated and checked locally; no language model decides correctness. */
export function generateItem(skillId:string,options:ItemOptions={}):MathItem {
 const definition=getSkill(skillId); if(!definition) throw new Error(`UNKNOWN_MATH_SKILL:${skillId}`);
 const rng=options.random||Math.random;
 const int=(min:number,max:number)=>{const value=rng();return min+Math.floor(Math.max(0,Math.min(0.999999999999,Number.isFinite(value)?value:0))*(max-min+1));};
 const choose=<T>(xs:T[]):T=>xs[int(0,xs.length-1)];
 const tier=Number.isFinite(options.tier)?Math.max(0,Math.min(2,Math.round(options.tier!))):1;
 if(isEarlyGrade(definition.grade)) return earlyMathItem(definition,tier,int(0,0xffffffff));
 const requested=options.representation||choose<Representation>(['symbolic','story','visual']);
 const number=(question:string,answer:number,parameters:Draft['parameters'],hints:HintStep[],workedExample:string,visual?:MathVisual,unit?:string):Draft=>({question,answer,answerKind:'number',parameters,hints,workedExample,...(visual?{visual}:{}),...(unit?{unit}:{})});
 const choice=(question:string,answer:string,choices:MathItem['choices'],parameters:Draft['parameters'],hints:HintStep[],workedExample:string,visual?:MathVisual):Draft=>({question,answer,answerKind:'choice',choices,parameters,hints,workedExample,...(visual?{visual}:{})});
 let item:Draft;
 const binary=(operation:'add'|'subtract'|'multiply'|'divide',a:number,b:number):Draft=>{
  const answer=operation==='add'?a+b:operation==='subtract'?a-b:operation==='multiply'?a*b:a/b;
  const symbol={add:'+',subtract:'−',multiply:'×',divide:'÷'}[operation];
  const factId=operation==='multiply'?`mul:${a}x${b}`:operation==='divide'?`div:${a}/${b}`:`${operation==='add'?'add':'sub'}:${a}:${b}`;
  let question=`${fmt(a)} ${symbol} ${fmt(b)} = ?`,hints:HintStep[],visual:MathVisual|undefined,worked:string;
  if(operation==='add'){
   const ten=10-a,makeTen=a<10&&b>=ten&&answer>10;
   const ones=a%10+b%10,tens=Math.floor(a/10)+Math.floor(b/10);
   if(requested==='story')question=`You have ${fmt(a)} building pieces and collect ${fmt(b)} more. How many pieces do you have now?`;
   if(a<=20&&b<=20&&answer<=20)visual={kind:'ten-frame',count:a,extra:b};
   else visual={kind:'place-value',value:a};
   hints=makeTen?[
    hint(`Start with ${a}. How many more make 10?`,{kind:'ten-frame',count:a}),
    hint(`Split ${b} into ${ten} and ${b-ten}. Add ${ten} to ${a} to make 10.`),
    hint(`Now add the remaining ${b-ten} to 10.`,{kind:'number-line',min:0,max:20,start:a,jumps:[ten,b-ten]})
   ]:[hint(answer<=20?`Start at ${a} and count ${b} steps forward.`:'Keep the same place values together: ones with ones, tens with tens.'),hint(answer<=20?`You can split ${b} into smaller jumps.`:`The ones total ${ones}. ${ones>=10?'Trade 10 ones for 1 ten.':'Keep those ones.'}`),hint(answer<=20?`Count the combined pieces. You can check by taking ${b} away again.`:`The tens before any new trade total ${tens}. Add any ten you made from the ones.`)];
   worked=makeTen?`${a} + ${b} = ${a} + ${ten} + ${b-ten} = 10 + ${b-ten} = ${answer}.`:`${fmt(a)} + ${fmt(b)} = ${fmt(answer)}. Check: ${fmt(answer)} − ${fmt(b)} = ${fmt(a)}.`;
  }else if(operation==='subtract'){
   if(requested==='story')question=`There are ${fmt(a)} gems. You use ${fmt(b)} of them. How many gems remain?`;
   visual=a<=20?{kind:'number-line',min:0,max:20,start:a,jumps:[]}:{kind:'place-value',value:a};
   hints=[hint(`Think: ${b} plus what makes ${a}?`),hint(a<=20?`Start at ${a} and move back ${b}.`:`Work by place value. If a column does not have enough, exchange 1 of the next place for 10 of this place.`),hint(`Check your answer by adding ${b} back. The total should be ${a}.`,a<=20?{kind:'number-line',min:0,max:20,start:a,jumps:[-b]}:undefined)];
   worked=`${fmt(a)} − ${fmt(b)} = ${fmt(answer)} because ${fmt(b)} + ${fmt(answer)} = ${fmt(a)}.`;
  }else if(operation==='multiply'){
   if(requested==='story')question=`There are ${a} boxes with ${b} gems in every box. How many gems are there altogether?`;
   visual=a<=12&&b<=12?{kind:'array',rows:a,columns:b}:undefined;
   const part=a<=12?Math.floor(a/2):Math.floor(a/10)*10,remainder=a-part;
   hints=[hint(`Multiplication combines equal groups. This is ${a} groups of ${b}.`,visual),hint(`Split ${a} into ${part} and ${remainder}. Find ${part} × ${b} and ${remainder} × ${b}.`,a<=12&&b<=12?{kind:'array',rows:a,columns:b,splitAfter:part}:undefined),hint(`${part} × ${b} = ${fmt(part*b)}. ${remainder} × ${b} = ${fmt(remainder*b)}. Add those two amounts.`)];
   worked=`${fmt(a)} × ${fmt(b)} = (${fmt(part)} × ${fmt(b)}) + (${fmt(remainder)} × ${fmt(b)}) = ${fmt(part*b)} + ${fmt(remainder*b)} = ${fmt(answer)}.`;
   if(a>12||b>12){
    const parts=(value:number)=>String(value).split('').map((digit,index,array)=>Number(digit)*10**(array.length-index-1)).filter(value=>value>0);
    const left=parts(a),right=parts(b),products=left.flatMap(x=>right.map(y=>({x,y,value:x*y})));
    hints=[hint('Split the numbers into their place values. Multiply the smaller parts, then combine their products.'),hint(`${fmt(a)} = ${left.map(fmt).join(' + ')}; ${fmt(b)} = ${right.map(fmt).join(' + ')}.`),hint(`Partial products: ${products.map(p=>`${fmt(p.x)} × ${fmt(p.y)} = ${fmt(p.value)}`).join('; ')}. Add them.`)];
    worked=`${fmt(a)} × ${fmt(b)} = ${products.map(p=>fmt(p.value)).join(' + ')} = ${fmt(answer)}. Each partial product accounts for one pair of place-value parts.`;
   }
  }else{
   if(requested==='story')question=`Share ${a} gems equally between ${b} treasure boxes. How many gems go in each box?`;
   hints=[hint(`Think of a related multiplication: ${b} × ? = ${a}.`),hint(`Count equal groups of ${b} until you reach ${a}.`),hint(`Your answer times ${b} must equal ${a}.`,a<=100&&answer<=12&&b<=12?{kind:'groups',groups:b,each:answer}:undefined)];
   worked=`${a} ÷ ${b} = ${answer} because ${b} × ${answer} = ${a}. Every equal share contains ${answer}.`;
  }
  return {...number(question,answer,{operation,a,b},hints,worked,requested==='visual'?visual:undefined),factId};
 };

 switch(skillId){
 case 'g1-add-10':case 'g1-add-20':case 'g2-add-100':case 'g2-add-1000':{
  const max=skillId==='g1-add-10'?10:skillId==='g1-add-20'?20:skillId==='g2-add-100'?100:1000;
  let a=int(max<=20?1:10,max-1),b=int(1,max-a);
  const m=/^add:(\d+):(\d+)$/.exec(options.factId||'');if(m&&+m[1]+ +m[2]<=max){a=+m[1];b=+m[2];}
  item=binary('add',a,b);break;
 }
 case 'g1-subtract-10':case 'g1-subtract-20':case 'g2-subtract-100':case 'g2-subtract-1000':{
  const max=skillId==='g1-subtract-10'?10:skillId==='g1-subtract-20'?20:skillId==='g2-subtract-100'?100:1000;
  let a=int(2,max),b=int(1,a);
  const m=/^sub:(\d+):(\d+)$/.exec(options.factId||'');if(m&&+m[1]<=max&&+m[2]<=+m[1]){a=+m[1];b=+m[2];}
  item=binary('subtract',a,b);break;
 }
 case 'g1-make-ten':{
  const a=int(1,9),b=10-a;item={...number(`${a} + ? = 10. How many more make ten?`,b,{operation:'missing-addend',a,total:10},[hint('A full ten frame has 10 spaces.',{kind:'ten-frame',count:a}),hint(`There are ${a} counters. Count the empty spaces.`),hint(`Count up from ${a} to 10. Each step is one missing counter.`)],`${a} + ${b} = 10. The missing part is ${b}.`,{kind:'ten-frame',count:a}),factId:`make-ten:${a}`};break;
 }
 case 'g1-missing-addend':{
  const a=int(1,10),b=int(1,20-a),total=a+b;item=number(requested==='story'?`You have ${a} gems and need ${total}. How many more gems do you need?`:`${a} + ? = ${total}`,b,{operation:'missing-addend',a,total},[hint('The missing part joins the known part to make the whole.'),hint(`Count up from ${a} to ${total}.`),hint(`You can also find ${total} − ${a}.`)],`${total} − ${a} = ${b}, so ${a} + ${b} = ${total}.`,requested==='visual'?{kind:'number-line',min:0,max:20,start:a,jumps:[]}:undefined);break;
 }
 case 'g1-equality':{
  const a=int(1,7),b=int(1,10-a),c=int(1,a+b),d=a+b-c+(int(0,1)?0:1),equal=a+b===c+d;item=choice(`Is this equation true? ${a} + ${b} = ${c} + ${d}`,String(equal),[{value:'true',label:'True: both sides have the same value'},{value:'false',label:'False: the values are different'}],{operation:'equality',a,b,c,d},[hint('The equals sign means both sides have the same value.'),hint(`Find ${a} + ${b}, then find ${c} + ${d}.`),hint(`The left side is ${a+b}. Compare it with ${c+d} on the right.`)],`${a} + ${b} is ${a+b}; ${c} + ${d} is ${c+d}. The statement is ${equal?'true':'false'}.`);break;
 }
 case 'g1-tens-ones':case 'g2-hundreds':{
  const hundreds=skillId==='g2-hundreds'?int(1,9):0,tens=int(1,9),ones=int(0,9),value=hundreds*100+tens*10+ones;
  item=number(`${hundreds?`${hundreds} hundreds, `:''}${tens} tens and ${ones} ones make what number?`,value,{operation:'compose',hundreds,tens,ones},[hint('Each ten is a group of 10. Each hundred is a group of 100.'),hint(`${tens} tens = ${tens*10}.${hundreds?` ${hundreds} hundreds = ${hundreds*100}.`:''}`),hint(`Combine ${hundreds?`${hundreds*100} + `:''}${tens*10} + ${ones}.`)],`${hundreds?`${hundreds*100} + `:''}${tens*10} + ${ones} = ${value}.`);break;
 }
 case 'g1-compare':case 'g2-compare':case 'g4-compare':{
  const max=skillId==='g1-compare'?99:skillId==='g2-compare'?999:1000000,min=skillId==='g1-compare'?10:skillId==='g2-compare'?100:1000;
  const a=int(min,max),b=int(0,4)===0?a:int(min,max),sign=comparison(a,b);item=choice(`Choose the symbol: ${fmt(a)} ? ${fmt(b)}`,sign,comparisonChoices,{operation:'compare',a,b},[hint('Compare the greatest place first. If those digits match, move one place right.'),hint(`${fmt(a)} and ${fmt(b)} refer to whole quantities. More digits usually means a greater whole number.`),hint('The open side of > or < faces the greater number. Use = if every place matches.')],`${fmt(a)} ${sign} ${fmt(b)}. Compare from the greatest place until a different digit appears.`);break;
 }
 case 'g1-add-tens':case 'g1-subtract-tens':{
  const subtract=skillId==='g1-subtract-tens';let a=int(2,9),b=subtract?int(1,a):int(1,10-a);item=binary(subtract?'subtract':'add',a*10,b*10);break;
 }
 case 'g1-length':{
  const values=[int(2,5),int(6,9),int(10,14)],offset=int(0,2),names=['Red ribbon','Blue ribbon','Green ribbon'],ordered=values.map((_,i)=>values[(i+offset)%3]),longest=ordered.indexOf(Math.max(...ordered));item=choice(`Which ribbon is longest? ${names.map((n,i)=>`${n}: ${ordered[i]} cm`).join('; ')}.`,names[longest],names.map(n=>({value:n,label:n})),{operation:'maximum-index',a:ordered[0],b:ordered[1],c:ordered[2],index:longest},[hint('All three lengths use centimeters, so their numbers can be compared.'),hint('Find the greatest of the three measurements.'),hint(`Compare ${ordered[0]}, ${ordered[1]} and ${ordered[2]}. A longer ribbon has a larger measurement.`)],`${names[longest]} measures ${ordered[longest]} cm, the greatest length.`,{kind:'chart',labels:names,values:ordered,unit:'cm'});break;
 }
 case 'g1-time':case 'g2-time':{
  const hours=int(1,12),minutes=skillId==='g1-time'?choose([0,30]):int(0,11)*5,answer=clockText(hours,minutes);
  const alternatives=[answer,clockText(hours+1,minutes),clockText(hours,(minutes+30)%60),clockText(hours+2,(minutes+15)%60)];
  for(let i=alternatives.length-1;i>0;i--){const j=int(0,i);[alternatives[i],alternatives[j]]=[alternatives[j],alternatives[i]];}
  item=choice('What time does the clock show?',answer,alternatives.map(value=>({value,label:value})),{operation:'clock',hours,minutes},[hint('The short hand shows the hour. The long hand shows the minutes.'),hint('Start at 12 and count 5 minutes for each number the long hand passes.'),hint(`The long hand shows ${minutes} minutes. The short hand is at or after ${hours}.`)],`The hour is ${hours} and the minutes are ${minutes}, so the time is ${answer}.`,{kind:'clock',hours,minutes});break;
 }
 case 'g1-data':case 'g2-data':case 'g3-data':{
  const values=[int(1,6),int(7,10),int(2,5)],labels=['Moon','Star','Sun'],scale=skillId==='g3-data'?choose([2,5,10]):1;
  const compare=skillId!=='g1-data',answer=compare?(values[1]-values[0])*scale:values[0];
  item=number(compare?`The chart counts crates. Each crate holds ${scale} gem${scale===1?'':'s'}. How many more gems are in Star crates than Moon crates?`:'How many Moon stickers are shown in the chart?',answer,{operation:compare?'chart-difference':'chart-value',a:values[0],b:values[1],scale},[hint('Read the two relevant categories and check what one count represents.'),hint(compare?`Star has ${values[1]} counts and Moon has ${values[0]}. Find the difference.`:`Find the bar labelled Moon and read its height.`),hint(compare?`There are ${values[1]-values[0]} more crates. ${scale===1?'Each holds one gem.':`Multiply that difference by ${scale}.`}`:'The height of the Moon bar gives its quantity.')],compare?`(${values[1]} − ${values[0]}) × ${scale} = ${answer} more gems.`:`Moon has ${answer} stickers.`,{kind:'chart',labels,values,unit:compare?'crates':'stickers'});break;
 }
 case 'g1-shapes':case 'g2-shapes':{
  const names=skillId==='g1-shapes'?['triangle','square','rectangle','hexagon']:['triangle','pentagon','hexagon','cube'];const shape=choose(names);
  const properties:Record<string,[number,string]>={triangle:[3,'straight sides'],square:[4,'equal sides and 4 square corners'],rectangle:[4,'sides and 4 square corners'],pentagon:[5,'straight sides'],hexagon:[6,'straight sides'],cube:[6,'square faces']};const [count,label]=properties[shape];
  item=number(`How many ${shape==='cube'?'square faces':'straight sides'} does this ${shape} have?`,count,{operation:'shape-count',shape,attribute:shape==='cube'?'faces':'sides'},[hint(shape==='cube'?'A face is one flat surface. Think about the hidden faces too.':'Trace around the outside. Count each straight side once.'),hint(shape==='cube'?'A cube has a top, a bottom, and four side faces.':'Mark a starting corner so you do not count a side twice.'),hint(`A ${shape} is described by ${count} ${label}.`)],`A ${shape} has ${count} ${shape==='cube'?'square faces':'straight sides'}.`,{kind:'shape',shape});break;
 }
 case 'g1-halves-quarters':case 'g2-fractions':{
  const denominator=choose(skillId==='g1-halves-quarters'?[2,4]:[2,3,4]),name=denominator===2?'half':denominator===3?'third':'fourth';
  item=choice('The whole is split into equal parts. What is one shaded part called?',name,[{value:'half',label:'One half'},{value:'third',label:'One third'},{value:'fourth',label:'One fourth (quarter)'}],{operation:'part-name',denominator},[hint('Count all the equal parts in the whole, not only the shaded part.'),hint('Two equal parts are halves. Three are thirds. Four are fourths.'),hint(`This whole has ${denominator} equal parts.`)],`There are ${denominator} equal parts, so one part is one ${name}.`,{kind:'fraction',numerator:1,denominator});break;
 }
 case 'g2-skip-count':case 'g3-patterns':case 'g4-patterns':{
  const step=skillId==='g2-skip-count'?choose([5,10,100]):int(2,9),start=skillId==='g2-skip-count'?int(0,3)*step:int(1,8),multiply=skillId==='g4-patterns'&&tier>=1&&int(0,1)===1;
  const values=multiply?[start,start*step,start*step*step]:[start,start+step,start+2*step],answer=multiply?start*step**3:start+3*step;
  item=number(`Rule: ${multiply?'multiply by':'add'} ${step}. What comes next? ${values.join(', ')}, ?`,answer,{operation:'pattern',start,step,multiply:multiply?1:0},[hint('Use the same stated rule for each step.'),hint(`Look at the last shown number: ${values[2]}.`),hint(`Calculate ${values[2]} ${multiply?'×':'+'} ${step}.`)],`${values[2]} ${multiply?'×':'+'} ${step} = ${answer}.`);break;
 }
 case 'g2-even-odd':{
  const a=int(1,20),answer=a%2===0?'even':'odd';item=choice(`Is ${a} even or odd?`,answer,[{value:'even',label:'Even: every object has a partner'},{value:'odd',label:'Odd: one object is left over'}],{operation:'parity',a},[hint('Try putting the objects into pairs.'),hint('If every object has a partner, the number is even.'),hint(`${a} makes ${Math.floor(a/2)} pairs${a%2?' and one extra object':', with none left over'}.`)],`${a} is ${answer} because ${a%2?'one object remains after pairing':'all objects can be paired'}.`);break;
 }
 case 'g2-arrays':case 'g3-groups':{
  const a=int(2,skillId==='g2-arrays'?5:8),b=int(2,5);item=binary('multiply',a,b);item.question=`There are ${a} rows of ${b} counters. How many counters altogether?`;item.visual={kind:'array',rows:a,columns:b};item.hints=[hint(`Every row has the same number: ${b}.`),hint(`Add ${b} once for each of the ${a} rows.`),hint(`You can count in steps of ${b}: ${Array.from({length:a},(_,i)=>(i+1)*b).join(', ')}.`)];item.workedExample=`${Array.from({length:a},()=>b).join(' + ')} = ${a*b}. Add one ${b} for each of the ${a} equal rows.`;break;
 }
 case 'g2-length':{
  const a=int(20,90),b=int(3,a-1);item=number(`A ribbon is ${a} cm long. Another is ${b} cm long. How many centimeters longer is the first ribbon?`,a-b,{operation:'subtract',a,b},[hint('Both lengths use centimeters. Find the difference.'),hint(`Start with ${a} and subtract ${b}.`),hint(`Check by adding your difference to ${b}; it should make ${a}.`)],`${a} − ${b} = ${a-b}. The first ribbon is ${a-b} cm longer.`,undefined,'cm');break;
 }
 case 'g2-money':{
  const quarters=int(0,2),dimes=int(1,3),nickels=int(0,2),pennies=int(0,4),answer=quarters*25+dimes*10+nickels*5+pennies;
  item=number(`You have ${quarters} quarter${quarters===1?'':'s'} (25¢ each), ${dimes} dimes (10¢ each), ${nickels} nickels (5¢ each), and ${pennies} pennies (1¢ each). How many cents altogether?`,answer,{operation:'coins',quarters,dimes,nickels,pennies},[hint('Find the value of each group of coins, then combine the groups.'),hint(`The quarters are worth ${quarters*25}¢ and the dimes are worth ${dimes*10}¢.`),hint(`Add ${quarters*25} + ${dimes*10} + ${nickels*5} + ${pennies}.`)],`The coins total ${answer} cents.`,undefined,'cents');break;
 }
 case 'g2-word-problems':{
  const a=int(15,45),b=int(3,20),c=int(1,a+b-1);item=number(`You begin with ${a} blocks, find ${b} more, then use ${c}. How many blocks remain?`,a+b-c,{operation:'add-subtract',a,b,c},[hint('Follow the story in order: first add, then take away.'),hint(`${a} + ${b} = ${a+b} blocks before building.`),hint(`Now subtract the ${c} blocks you used from ${a+b}.`)],`${a} + ${b} − ${c} = ${a+b} − ${c} = ${a+b-c}.`);break;
 }
 case 'g3-multiply':case 'g3-divide':{
  const divide=skillId==='g3-divide';let a=int(2,tier===0?5:10),b=int(2,10);
  const m=/^mul:(\d+)x(\d+)$/.exec(options.factId||'');const d=/^div:(\d+)\/(\d+)$/.exec(options.factId||'');
  if(!divide&&m&&+m[1]>=1&&+m[1]<=12&&+m[2]>=1&&+m[2]<=12){a=+m[1];b=+m[2];}
  if(divide&&d&&+d[2]>=1&&+d[2]<=12&&+d[1]>=0&&+d[1]/+d[2]<=12&&+d[1]%+d[2]===0){a=+d[1]/+d[2];b=+d[2];}
  item=divide?binary('divide',a*b,b):binary('multiply',a,b);break;
 }
 case 'g3-missing-factor':{
  const a=int(2,10),b=int(2,10),total=a*b;item=number(`${a} × ? = ${total}. What is the missing factor?`,b,{operation:'missing-factor',a,total},[hint('The missing factor tells how many are in each equal group.'),hint(`Use division: ${total} ÷ ${a}.`),hint(`Count multiples of ${a} until you reach ${total}.`)],`${a} × ${b} = ${total}, so the missing factor is ${b}.`);break;
 }
 case 'g3-two-step':{
  const a=int(2,8),b=int(2,8),c=int(1,a*b-1);item=number(`There are ${a} boxes with ${b} gems each. You give away ${c} gems. How many remain?`,a*b-c,{operation:'multiply-subtract',a,b,c},[hint('First find the total in all the equal boxes.'),hint(`${a} × ${b} = ${a*b}.`),hint(`Take ${c} away from that total.`)],`${a} × ${b} − ${c} = ${a*b} − ${c} = ${a*b-c}.`);break;
 }
 case 'g3-round':case 'g4-round':{
  const place=skillId==='g3-round'?choose([10,100]):choose([10,100,1000,10000,100000]),max=skillId==='g3-round'?999:999999,a=int(place,Math.max(place,max)),low=Math.floor(a/place)*place,high=low+place,answer=a-low>=place/2?high:low;
  item=number(`Round ${fmt(a)} to the nearest ${fmt(place)}.`,answer,{operation:'round',a,place},[hint(`Find the two multiples of ${fmt(place)} around the number.`),hint(`${fmt(a)} lies between ${fmt(low)} and ${fmt(high)}. The midpoint is ${fmt(low+place/2)}.`),hint('Below the midpoint, choose the lower multiple. At or above the midpoint, choose the higher multiple.')],`${fmt(a)} rounds to ${fmt(answer)} because it is ${a-low>=place/2?'at or above':'below'} the midpoint.`);break;
 }
 case 'g3-add-subtract':case 'g4-add-subtract':{
  const max=skillId==='g3-add-subtract'?1000:1000000,sub=int(0,1)===1;let a=int(20,max-10),b=sub?int(1,a):int(1,max-a);
  const m=/^(add|sub):(\d+):(\d+)$/.exec(options.factId||'');if(m&&(m[1]==='add'?+m[2]+ +m[3]<=max:+m[3]<=+m[2]&&+m[2]<=max))item=binary(m[1]==='add'?'add':'subtract',+m[2],+m[3]);else item=binary(sub?'subtract':'add',a,b);break;
 }
 case 'g3-multiply-tens':{
  const a=int(2,9),b=int(1,9)*10;item=binary('multiply',a,b);item.hints=[hint(`Think of ${b} as ${b/10} tens.`),hint(`First find ${a} × ${b/10} = ${a*b/10}.`),hint(`That is ${a*b/10} tens. Multiply by 10 to find the number of ones.`)];item.workedExample=`${a} × ${b} = (${a} × ${b/10}) × 10 = ${a*b/10} × 10 = ${a*b}.`;break;
 }
 case 'g3-unit-fraction':{
  const d=choose([2,3,4,6,8]);item={question:`A whole is split into ${d} equal parts. Write the fraction for one part.`,answer:`1/${d}`,answerKind:'fraction',parameters:{operation:'fraction',n:1,d},hints:[hint('The bottom number counts all the equal parts.'),hint('The top number counts the parts we are talking about: one.'),hint(`Write 1 above ${d}.`)],workedExample:`One of ${d} equal parts is 1/${d}.`,visual:{kind:'fraction',numerator:1,denominator:d}};break;
 }
 case 'g3-fraction-number':{
  const d=choose([2,3,4,6,8]),n=int(1,d);item={question:`A number line from 0 to 1 is split into ${d} equal steps. What fraction is reached after ${n} steps?`,answer:`${n}/${d}`,answerKind:'fraction',parameters:{operation:'fraction',n,d},hints:[hint(`Each step is 1/${d} of the distance from 0 to 1.`),hint(`You take ${n} of those steps, so count ${n} parts.`),hint(`The numerator is ${n} and the denominator is ${d}.`,{kind:'fraction',numerator:n,denominator:d})],workedExample:`${n} steps of 1/${d} reach ${n}/${d}${n===d?' = 1':''}.`,visual:requested==='visual'?{kind:'number-line',min:0,max:1,start:0,jumps:Array.from({length:n},()=>1/d)}:undefined};break;
 }
 case 'g3-equivalent-fraction':case 'g4-equivalent-fraction':{
  const small=skillId==='g3-equivalent-fraction',d=small?choose([2,3,4]):choose([2,3,4,5,6]),n=int(1,d-1),allowedTargets=[2,3,4,5,6,8,10,12],factor=small?2:choose([2,3,4,5,6].filter(f=>allowedTargets.includes(d*f))),target=d*factor;
  item=number(`Fill the missing numerator: ${n}/${d} = ?/${target}`,n*factor,{operation:'equivalent-numerator',n,d,target},[hint('Equivalent fractions describe the same amount of the same whole.'),hint(`The denominator changes from ${d} to ${target}: multiply by ${factor}.`),hint(`Multiply the numerator by that same ${factor}.`)],`${n}/${d} = (${n} × ${factor})/(${d} × ${factor}) = ${n*factor}/${target}.`,{kind:'fraction',numerator:n,denominator:d});break;
 }
 case 'g3-compare-fraction':case 'g4-compare-fraction':{
  const third=skillId==='g3-compare-fraction',sameNumerator=third&&int(0,1)===1,d=choose([2,3,4,6,8]),otherD=third?(sameNumerator?choose([2,3,4,6,8]):d):choose([2,3,4,5,6,8,10,12]),n=int(1,sameNumerator?Math.min(d,otherD):d),otherN=sameNumerator?n:int(1,otherD),sign=comparison(n*otherD,otherN*d);
  const support=third?(d===otherD?[hint('The denominators match, so every part has the same size.'),hint(`The first fraction has ${n} parts. The second has ${otherN} parts.`),hint('With the same denominator, more parts means a greater fraction. Equal part counts mean equal fractions.')]:[hint('The numerators match, so both fractions take the same number of parts.'),hint(`One whole split into ${d} equal parts has different-sized pieces from the same whole split into ${otherD} parts.`),hint('Fewer equal pieces in a whole means each piece is larger. With the same part count, compare those piece sizes.')]):[hint(d===otherD?'The parts are the same size. Compare how many parts are taken.':'First think about 1/2 and 1. For a precise comparison, use equal-size parts.'),hint(`A common denominator is ${d*otherD}. ${n}/${d} becomes ${n*otherD}/${d*otherD}.`),hint(`${otherN}/${otherD} becomes ${otherN*d}/${d*otherD}. Now compare the numerators.`)];
  const explanation=third?(d===otherD?`${n}/${d} ${sign} ${otherN}/${otherD}: the parts are equally sized, so compare ${n} and ${otherN}.`:`${n}/${d} ${sign} ${otherN}/${otherD}: both take ${n} parts; a whole split into fewer parts gives larger pieces.`):`${n}/${d} ${sign} ${otherN}/${otherD}, since ${n*otherD} ${sign} ${otherN*d} when the denominators match.`;
  item=choice(`Both fractions refer to the same-sized whole. Choose the symbol: ${n}/${d} ? ${otherN}/${otherD}`,sign,comparisonChoices,{operation:'fraction-compare',n,d,otherN,otherD},support,explanation);break;
 }
 case 'g3-time':{
  const hours=int(1,10),minutes=tier===0?int(0,11)*5:int(0,59),elapsed=tier===0?int(1,6)*5:int(1,60),start=hours*60+minutes,end=start+elapsed;
  item=number(`A trip starts at ${clockText(hours,minutes)} and ends at ${clockText(Math.floor(end/60),end%60)} on the same morning. How many minutes pass?`,elapsed,{operation:'elapsed',start,end},[hint('Count forward from the start time to the end time.'),hint(`There are ${60-minutes} minutes from ${clockText(hours,minutes)} to the next hour.`),hint('Count forward in useful jumps, or subtract the times after writing both in minutes.')],`${end} − ${start} = ${elapsed} minutes pass.`,undefined,'minutes');break;
 }
 case 'g3-mass-volume':{
  const a=int(2,8),b=int(2,8),unit=choose(['liters','kilograms']);item=number(`There are ${a} containers. Each holds ${b} ${unit} of material. How many ${unit} altogether?`,a*b,{operation:'multiply',a,b},[hint('The containers hold equal amounts, so use equal groups.'),hint(`Multiply the number of containers by the amount in each: ${a} × ${b}.`),hint(`Split ${a} into ${a-1} and 1: find ${(a-1)} × ${b}, then add ${b}.`)],`${a} × ${b} = ${a*b} ${unit}.`,requested==='visual'?{kind:'groups',groups:a,each:b}:undefined,unit);break;
 }
 case 'g3-area':case 'g3-perimeter':{
  const width=int(2,9),height=int(2,8),area=skillId==='g3-area',answer=area?width*height:2*(width+height);
  item=number(`A rectangle is ${width} units wide and ${height} units tall. What is its ${area?'area in square units':'perimeter in units'}?`,answer,{operation:area?'area':'perimeter',width,height},[hint(area?'Area measures the surface covered. Count unit squares in equal rows.':'Perimeter is the distance all the way around the outside.'),hint(area?`There are ${height} rows with ${width} squares in each.`:`Opposite sides match: the four sides are ${width}, ${height}, ${width}, ${height}.`),hint(area?`Multiply ${width} × ${height}.`:`Add ${width} + ${height} + ${width} + ${height}.`)],area?`${width} × ${height} = ${answer} square units.`:`${width} + ${height} + ${width} + ${height} = ${answer} units.`,area?{kind:'array',rows:height,columns:width}:{kind:'shape',shape:'rectangle',width,height},area?'square units':'units');break;
 }
 case 'g3-shapes':{
  const shape=choose(['square','rectangle','rhombus','triangle','pentagon']),sides=shape==='triangle'?3:shape==='pentagon'?5:4,answer=sides===3?'triangle':sides===5?'pentagon':'quadrilateral';item=choice(`Which side-count category contains this ${shape}?`,answer,[{value:'triangle',label:'Triangles: three sides'},{value:'quadrilateral',label:'Quadrilaterals: four sides'},{value:'pentagon',label:'Pentagons: five sides'}],{operation:'shape-category',shape},[hint('A shape can belong to more than one category.'),hint('Count its straight sides.'),hint('Three sides make a triangle, four make a quadrilateral, and five make a pentagon.')],`A ${shape} has ${sides} sides, so it belongs to the ${answer} category.`,{kind:'shape',shape});break;
 }
 case 'g4-place-value':{
  const a=int(10000,999999),place=choose([1,10,100,1000,10000,100000].filter(p=>p<=a)),digit=Math.floor(a/place)%10,names:Record<number,string>={1:'ones',10:'tens',100:'hundreds',1000:'thousands',10000:'ten-thousands',100000:'hundred-thousands'};item=number(`In ${fmt(a)}, what is the value of the digit in the ${names[place]} place?`,digit*place,{operation:'digit-value',a,place},[hint('A digit’s value depends on its place, not just its shape.'),hint(`The digit in the ${names[place]} place is ${digit}.`),hint(`Multiply that digit by ${fmt(place)}.`)],`${digit} × ${fmt(place)} = ${fmt(digit*place)}.`,{kind:'place-value',value:a,highlight:place});break;
 }
 case 'g4-multiply':{
  const a=int(tier===0?10:100,tier===0?99:9999),b=int(2,9);if(tier===2&&int(0,1))item=binary('multiply',int(10,99),int(10,99));else item=binary('multiply',a,b);break;
 }
 case 'g4-divide':{
  const divisor=int(2,9),quotient=int(11,tier===0?30:1000),remainder=tier>=1?int(0,divisor-1):0,dividend=divisor*quotient+remainder,askRemainder=tier>=1&&int(0,1)===1;
  item=number(`Share ${fmt(dividend)} counters into groups of ${divisor}. ${askRemainder?'How many counters are left over after making all the full groups?':'How many full groups can you make?'}`,askRemainder?remainder:quotient,{operation:askRemainder?'remainder':'quotient',a:dividend,b:divisor},[hint('Find how many complete groups fit. A leftover amount must be smaller than one full group.'),hint(`Estimate using easy multiples of ${divisor}, then work toward ${fmt(dividend)}.`),hint(`${divisor} × ${quotient} = ${fmt(divisor*quotient)}. Subtract that amount from ${fmt(dividend)} to find leftovers.`)],`${fmt(dividend)} ÷ ${divisor} gives ${quotient} full groups and ${remainder} left over, because ${divisor} × ${quotient} + ${remainder} = ${fmt(dividend)}.`);break;
 }
 case 'g4-comparison':{
  const a=int(2,9),b=int(3,12);item=number(`A blue team has ${b} tokens. A gold team has ${a} times as many tokens. How many tokens does the gold team have?`,a*b,{operation:'multiply',a,b},[hint('“Times as many” means equal copies of the original amount.'),hint(`Make ${a} groups of ${b}; do not just add ${a}.`),hint(`Calculate ${a} × ${b}.`)],`${a} × ${b} = ${a*b} tokens.`);break;
 }
 case 'g4-factors':{
  const a=int(12,100),b=int(2,10),answer=a%b===0?'yes':'no';item=choice(`Is ${b} a factor of ${a}?`,answer,[{value:'yes',label:'Yes: it divides the number with no remainder'},{value:'no',label:'No: there is a remainder'}],{operation:'factor',a,b},[hint('A factor divides a whole number exactly.'),hint(`Find the nearest multiple of ${b} that does not exceed ${a}.`),hint(`${b} × ${Math.floor(a/b)} = ${b*Math.floor(a/b)}. Check whether anything is left over.`)],`${b} ${answer==='yes'?'is':'is not'} a factor of ${a}: ${a} ÷ ${b} has remainder ${a%b}.`);break;
 }
 case 'g4-add-fraction':{
  const d=choose([2,3,4,5,6,8,10,12]),n=int(1,d),otherN=int(1,d),subtract=int(0,1)===1,a=subtract?Math.max(n,otherN):n,b=subtract?Math.min(n,otherN):otherN,result=subtract?a-b:a+b;
  item={question:`${a}/${d} ${subtract?'−':'+'} ${b}/${d} = ?`,answer:fraction(result,d),answerKind:'fraction',parameters:{operation:subtract?'fraction-subtract':'fraction-add',n:a,otherN:b,d},hints:[hint('The denominators match, so the parts are the same size.'),hint(`Keep denominator ${d}; ${subtract?'subtract':'add'} the numerators.`),hint(`Work out ${a} ${subtract?'−':'+'} ${b}. Put that many parts over ${d}.`)],workedExample:`${a}/${d} ${subtract?'−':'+'} ${b}/${d} = ${result}/${d} = ${fraction(result,d)}. Equivalent fractions and mixed numbers are accepted.`};break;
 }
 case 'g4-multiply-fraction':{
  const a=int(2,5),d=choose([2,3,4,6,8]),n=int(1,d-1);item={question:`${a} × ${n}/${d} = ?`,answer:fraction(a*n,d),answerKind:'fraction',parameters:{operation:'fraction-multiply',a,n,d},hints:[hint(`This is ${a} equal groups of ${n}/${d}.`),hint(`Each group contains ${n} parts of size 1/${d}.`),hint(`Multiply ${a} × ${n} to count all the parts. Keep denominator ${d}.`)],workedExample:`${a} × ${n}/${d} = ${a*n}/${d} = ${fraction(a*n,d)}.`,visual:requested==='visual'?fractionVisual(n,d):undefined};break;
 }
 case 'g4-decimal':{
  const d=choose([10,100]),n=int(1,d-1);item=number(`Write ${n}/${d} as a decimal.`,n/d,{operation:'decimal',n,d},[hint(`The denominator tells whether these are tenths or hundredths.`),hint(d===10?'Use the first place after the decimal point for tenths.':'Use two places after the decimal point for hundredths.'),hint(`Think of ${n} parts out of ${d} equal parts of one.`)],`${n}/${d} = ${(n/d).toFixed(d===10?1:2)}.`);break;
 }
 case 'g4-compare-decimal':{
  const a=int(1,199),b=int(0,4)===0?a:int(1,199),sign=comparison(a,b);item=choice(`Choose the symbol: ${(a/100).toFixed(2)} ? ${(b/100).toFixed(2)}`,sign,comparisonChoices,{operation:'compare',a:a/100,b:b/100},[hint('Compare whole-number parts first, then tenths, then hundredths.'),hint(`These values are ${a} hundredths and ${b} hundredths.`),hint('Compare the counts of equal-sized hundredths.')],`${(a/100).toFixed(2)} ${sign} ${(b/100).toFixed(2)} because ${a} ${sign} ${b}.`);break;
 }
 case 'g4-measurement':{
  const units=choose<[string,string,number]>([['meters','centimeters',100],['kilometers','meters',1000],['liters','milliliters',1000],['kilograms','grams',1000],['feet','inches',12],['hours','minutes',60]]),a=int(2,9),[from,to,factor]=units;
  const singular=from==='feet'?'foot':from.replace(/s$/,'');item=number(`One ${singular} equals ${factor} ${to}. How many ${to} are in ${a} ${from}?`,a*factor,{operation:'multiply',a,b:factor},[hint('A larger unit contains several smaller units.'),hint(`There are ${a} equal groups of ${factor} ${to}.`),hint(`Calculate ${a} × ${factor}.`)],`${a} × ${factor} = ${fmt(a*factor)} ${to}.`,undefined,to);break;
 }
 case 'g4-time-money':{
  if(int(0,1)===0){const paid=int(5,20)*100,cost=int(100,paid-1);item=number(`You pay $${(paid/100).toFixed(2)} for an item costing $${(cost/100).toFixed(2)}. How many cents of change should you receive?`,paid-cost,{operation:'subtract',a:paid,b:cost},[hint('Write both amounts in cents before subtracting.'),hint(`You paid ${paid} cents and the cost is ${cost} cents.`),hint(`Calculate ${paid} − ${cost}.`)],`${paid} − ${cost} = ${paid-cost} cents, or $${((paid-cost)/100).toFixed(2)}.`,undefined,'cents');}
  else{const start=int(7,10)*60+int(0,59),elapsed=int(15,150),end=start+elapsed;item=number(`An activity starts at ${clockText(Math.floor(start/60),start%60)} a.m. and ends at ${clockText(Math.floor(end/60),end%60)} ${end>=720?'p.m.':'a.m.'} the same day. How many minutes does it last?`,elapsed,{operation:'elapsed',start,end},[hint('Count to the next hour, then add whole hours and remaining minutes.'),hint(`The start is ${start} minutes after midnight; the end is ${end} minutes after midnight.`),hint('Subtract the starting count from the ending count.')],`${end} − ${start} = ${elapsed} minutes.`,undefined,'minutes');}break;
 }
 case 'g4-area-perimeter':{
  const width=int(3,12),height=int(2,10),useArea=int(0,1)===0,total=useArea?width*height:2*(width+height);
  item=number(`A rectangle has ${useArea?'area':'perimeter'} ${total} ${useArea?'square units':'units'} and width ${width} units. What is its height?`,height,{operation:useArea?'missing-area-side':'missing-perimeter-side',total,width},[hint(useArea?'Area = width × height.':'Perimeter = twice the width plus twice the height.'),hint(useArea?`Find the missing number in ${width} × ? = ${total}.`:`Half the perimeter is ${total/2}, equal to width + height.`),hint(useArea?`Calculate ${total} ÷ ${width}.`:`Subtract the width ${width} from ${total/2}.`)],useArea?`${total} ÷ ${width} = ${height} units.`:`${total} ÷ 2 − ${width} = ${height} units.`,undefined,'units');break;
 }
 case 'g4-data':{
  const d=choose([2,4,8]),counts=[int(1,5),int(1,5),int(1,5)],selected=int(0,2),lengths=[1,2,3],labels=lengths.map(n=>`${n}/${d} m`);
  const visual:MathVisual={kind:'line-plot',labels,values:counts,unit:'ribbons'};
  if(tier===0)item=number(`Each X represents one ribbon of the labelled length. How many ribbons measure ${labels[selected]}?`,counts[selected],{operation:'frequency',a:counts[0],b:counts[1],c:counts[2],selected,denominator:d},[hint('The fraction labels show length. Each X counts one ribbon.'),hint(`Find the label ${labels[selected]}.`),hint('Count the X marks above that label; do not add the fraction labels.')],`${counts[selected]} ribbons have length ${labels[selected]}.`,visual);
  else if(tier===1)item={question:'What is the difference in meters between the longest and shortest ribbon shown?',answer:fraction(2,d),answerKind:'fraction',parameters:{operation:'fraction-data-range',min:1,max:3,d},hints:[hint('Find the leftmost and rightmost lengths with an X above them.'),hint(`The longest is 3/${d} m and the shortest is 1/${d} m.`),hint(`Subtract 1/${d} from 3/${d}. The denominator stays the same.`)],workedExample:`3/${d} − 1/${d} = 2/${d} = ${fraction(2,d)} meter.`,visual};
  else{const n=counts[0]+2*counts[1]+3*counts[2];item={question:'What is the total length, in meters, of all the ribbons shown?',answer:fraction(n,d),answerKind:'fraction',parameters:{operation:'fraction-data-total',a:counts[0],b:counts[1],c:counts[2],d},hints:[hint('Each X is one ribbon. Count every ribbon’s fractional length.'),hint(`There are ${counts[0]} ribbons of 1/${d} m, ${counts[1]} of 2/${d} m, and ${counts[2]} of 3/${d} m.`),hint(`The numerator total is ${counts[0]} × 1 + ${counts[1]} × 2 + ${counts[2]} × 3. Keep denominator ${d}.`)],workedExample:`(${counts[0]} × 1 + ${counts[1]} × 2 + ${counts[2]} × 3)/${d} = ${n}/${d} = ${fraction(n,d)} meters.`,visual};}break;
 }
 case 'g4-angles':{
  if(tier===0){const degrees=choose([30,45,60,90,120,135,150]),answer=degrees<90?'acute':degrees===90?'right':'obtuse';item=choice(`This angle measures ${degrees}°. What kind of angle is it?`,answer,[{value:'acute',label:'Acute: smaller than a right angle'},{value:'right',label:'Right: exactly 90°'},{value:'obtuse',label:'Obtuse: between 90° and 180°'}],{operation:'angle-kind',degrees},[hint('A right angle measures 90 degrees.'),hint(`Compare ${degrees} degrees with 90 degrees.`),hint('Less than 90° is acute; exactly 90° is right; more than 90° but less than 180° is obtuse.')],`${degrees}° is ${answer}.`,{kind:'angle',degrees});}
  else{const a=int(1,8)*10,b=int(1,8)*10,total=a+b;item=tier===1?number(`Two non-overlapping angles share a side. One is ${a}° and the other is ${b}°. What is the combined angle in degrees?`,total,{operation:'add',a,b},[hint('Adjacent non-overlapping angles add to make the whole angle.'),hint(`Combine ${a} degrees and ${b} degrees.`),hint(`Calculate ${a} + ${b}.`)],`${a}° + ${b}° = ${total}°.`,undefined,'degrees'):number(`A ${total}° angle is split into two non-overlapping angles. One is ${a}°. How many degrees is the other?`,b,{operation:'subtract',a:total,b:a},[hint('The two parts add up to the whole angle.'),hint(`Think: ${a} + ? = ${total}.`),hint(`Subtract ${a} from ${total}.`)],`${total}° − ${a}° = ${b}°.`,undefined,'degrees');}break;
 }
 case 'g4-shapes':{
  const shape=choose(['square','rectangle','parallelogram','rhombus','trapezoid','triangle']),parallel=shape==='triangle'?0:shape==='trapezoid'?1:2;item=number(`How many pairs of parallel sides does this ${shape} have?`,parallel,{operation:'parallel-pairs',shape},[hint('Parallel straight lines stay the same distance apart and never meet.'),hint('Imagine extending each side as a straight line. Which pairs would never meet?'),hint('Count pairs, not individual sides.')],`This ${shape} has ${parallel} pair${parallel===1?'':'s'} of parallel sides.`,{kind:'shape',shape});break;
 }
 case 'g4-symmetry':{
  const shape=choose(['square','rectangle','triangle']),answer=shape==='square'?4:shape==='rectangle'?2:3,name=shape==='triangle'?'equilateral triangle':shape==='rectangle'?'rectangle that is not a square':shape;
  item=number(`How many lines of symmetry does this ${name} have?`,answer,{operation:'symmetry',shape},[hint('A line of symmetry folds a shape into matching halves.'),hint(shape==='square'?'Try a vertical fold, a horizontal fold, and the corner-to-corner folds.':shape==='rectangle'?'Try vertical and horizontal folds. A diagonal does not match for a non-square rectangle.':'Each corner can fold onto the middle of the opposite side.'),hint('Count each different matching fold once.')],`This ${name} has ${answer} lines of symmetry.`,{kind:'shape',shape,...(shape==='rectangle'?{width:6,height:3}:{})});break;
 }
 default: throw new Error(`UNIMPLEMENTED_MATH_SKILL:${skillId}`);
 }
 const narrative=/(?:you (?:have|begin|pay)|there are|a trip|an activity|a blue team|share \d|containers|crates|ribbons|a ribbon)/i.test(item.question);
 const representation:Representation=item.representation||(item.visual?'visual':narrative?'story':'symbolic');
 const signature=Object.entries(item.parameters).map(([key,value])=>`${key}-${String(value).replace(/[^a-zA-Z0-9._/-]/g,'-')}`).join(':');
 return {...item,id:`${skillId}:${signature}:${representation}`,skillId,skill:definition.title,grade:definition.grade,tier,representation};
}

/** Translate the old fact IDs without treating legacy streaks as proven retention. */
export function legacyFactItem(factId:string):MathItem|undefined {
 let match=/^mul:(\d+)x(\d+)$/.exec(factId);
 if(match){const a=+match[1],b=+match[2];if(a>=1&&a<=12&&b>=1&&b<=12)return generateItem('g3-multiply',{factId,representation:'symbolic',random:()=>0});return undefined;}
 match=/^div:(\d+)\/(\d+)$/.exec(factId);
 if(match){const a=+match[1],b=+match[2];if(b>=1&&b<=12&&a>=0&&a/b<=12&&a%b===0)return generateItem('g3-divide',{factId,representation:'symbolic',random:()=>0});return undefined;}
 const arithmetic=/^(add|sub):(\d+):(\d+)$/.exec(factId);
 if(!arithmetic)return undefined;
 const operation=arithmetic[1],a=+arithmetic[2],b=+arithmetic[3],bound=operation==='add'?a+b:a;
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||bound>1000000||(operation==='sub'&&b>a))return undefined;
 const prefix=operation==='add'?'add':'subtract';
 const skillId=bound<=10?`g1-${prefix}-10`:bound<=20?`g1-${prefix}-20`:bound<=100?`g2-${prefix}-100`:bound<=1000?`g2-${prefix}-1000`:'g4-add-subtract';
 const item=generateItem(skillId,{factId,representation:'symbolic',random:()=>0});
 return item.factId===factId?item:undefined;
}

function rational(raw:string):[number,number]|null {
 const simple=/^([+-]?\d+)\s*\/\s*(\d+)$/.exec(raw);
 if(simple){const n=Number(simple[1]),d=Number(simple[2]);return d>0&&d<=1000000&&Math.abs(n)<=1000000000?[n,d]:null;}
 const mixed=/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(raw);
 if(mixed){const whole=+mixed[1],n=+mixed[2],d=+mixed[3];return d>0&&d<=1000000&&n<d&&whole<=1000000?[whole*d+n,d]:null;}
 const normalized=raw.replace(/,/g,'');
 if(!/^[+-]?(?:\d+(?:\.\d{1,8})?|\.\d{1,8})$/.test(normalized))return null;
 if(raw.includes(',')&&!/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d{1,8})?$/.test(raw))return null;
 const value=Number(normalized);if(!Number.isFinite(value)||Math.abs(value)>1000000000)return null;
 const places=normalized.split('.')[1]?.length||0,d=10**places,n=Math.round(value*d);return Number.isSafeInteger(n)?[n,d]:null;
}

export function evaluateAnswer(item:MathItem,raw:string):AnswerCheck {
 if(typeof raw!=='string'||raw.length>80)return {valid:false,correct:false,normalized:'',message:'Enter a short answer.'};
 const value=raw.trim().replace(/−/g,'-');
 if(!value)return {valid:false,correct:false,normalized:'',message:'Enter an answer, or choose a hint.'};
 if(isEarlyGrade(item.grade) && ['touch','build'].includes(String(item.parameters.style))){
  const valid=/^(?:0|[1-9]|1[0-9]|20)$/.test(value);
  return {valid,correct:valid&&value===String(item.answer),normalized:value};
 }
 if(item.answerKind==='choice'){
  const option=item.choices?.find(c=>c.value.toLowerCase()===value.toLowerCase()||c.label.toLowerCase()===value.toLowerCase());
  return option?{valid:true,correct:option.value===String(item.answer),normalized:option.value}:{valid:false,correct:false,normalized:value,message:'Choose one of the offered answers.'};
 }
 if(item.answerKind==='text')return {valid:true,correct:value.toLowerCase().replace(/\s+/g,' ')===String(item.answer).trim().toLowerCase().replace(/\s+/g,' '),normalized:value};
 const actual=rational(value),expected=rational(String(item.answer));
 if(!actual||!expected)return {valid:false,correct:false,normalized:value,message:item.answerKind==='fraction'?'Use a fraction such as 3/4, a mixed number such as 1 1/2, or an equivalent decimal.':'Enter a number such as 12 or 0.5.'};
 // Exact rational comparison for elementary values. BigInt avoids floating-point grading errors.
 const correct=BigInt(actual[0])*BigInt(expected[1])===BigInt(expected[0])*BigInt(actual[1]);
 return {valid:true,correct,normalized:fraction(actual[0],actual[1])};
}
