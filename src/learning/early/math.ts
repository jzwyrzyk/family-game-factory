import type {Domain, MathItem, SkillDefinition} from '../types';
import type {Grade} from '../grades';

type Topic = 'touch'|'small'|'count'|'numeral'|'build'|'compare'|'equal'|'shape'|'classify'|'pattern'|'position'|'size'|'join'|'remove'|'missing'|'teen'|'solid'|'compose'|'order'|'compare-numeral'|'sort-shape'|'sort-size'|'numeral-group'|'attributes';
type Row = [Topic,string,Domain,string,Topic?];
const preschool: Row[] = [
 ['touch','Touch each object once','operations','P-MATH 3'],
 ['small','Recognize a small group','operations','P-MATH 2'],
 ['count','Count a collection','operations','P-MATH 3','touch'],
 ['numeral','Match numbers and collections','place-value','P-MATH 5','count'],
 ['build','Build a collection','operations','P-MATH 3','count'],
 ['compare','Compare two groups','operations','P-MATH 4','small'],
 ['equal','Match equal groups','operations','P-MATH 4','small'],
 ['shape','Match familiar shapes','geometry','P-MATH 9'],
 ['classify','Sort familiar objects','data','P-SCI 3'],
 ['pattern','Continue repeating patterns','operations','P-MATH 7'],
 ['position','Find an object in space','geometry','P-MATH 10'],
 ['size','Compare lengths','measurement','P-MATH 8'],
 ['join','Join small collections','operations','P-MATH 6','count'],
 ['remove','Take objects away','operations','P-MATH 6','count'],
 ['sort-shape','Classify objects by shape','geometry','P-MATH 9','shape'],
 ['sort-size','Classify objects by size','measurement','P-MATH 8','size'],
 ['numeral-group','Match a printed numeral to a group','place-value','P-MATH 5','count']
];
const kindergarten: Row[] = [
 ['touch','Count each object','operations','K.CC.B.4a'],
 ['count','Count up to twenty','operations','K.CC.B.5','touch'],
 ['numeral','Recognize numerals through twenty','place-value','K.CC.A.3'],
 ['build','Make a requested quantity','operations','K.CC.B.5','count'],
 ['compare','Which group has more or fewer?','operations','K.CC.C.6','count'],
 ['compare-numeral','Compare written numerals','place-value','K.CC.C.7','numeral'],
 ['equal','Find equal quantities','operations','K.CC.C.6','count'],
 ['join','Add concrete quantities within ten','operations','K.OA.A.1','count'],
 ['remove','Subtract concrete quantities within ten','operations','K.OA.A.2','count'],
 ['missing','Find the missing part','operations','K.OA.A.3','join'],
 ['teen','Ten and some more','place-value','K.NBT.A.1','count'],
 ['classify','Count one category','data','K.MD.B.3','count'],
 ['pattern','Continue a repeating pattern','operations','Local pattern extension'],
 ['shape','Identify shapes in varied orientations','geometry','K.G.A.2'],
 ['solid','Match solid objects','geometry','K.G.A.3'],
 ['position','Locate an object','geometry','K.G.A.1'],
 ['compose','Join two equal triangles','geometry','K.G.B.6','shape'],
 ['size','Compare two lengths','measurement','K.MD.A.2'],
 ['order','Put quantities in order','operations','K.CC.B.4c','count'],
 ['sort-shape','Classify shapes by type','data','K.MD.B.3','shape'],
 ['sort-size','Classify objects by size','data','K.MD.B.3','size'],
 ['numeral-group','Match numerals and sets through twenty','place-value','K.CC.B.4b','count'],
 ['attributes','Identify shapes by their attributes','geometry','K.G.B.4','shape']
];
const describe = (rows: Row[],grade: Grade,prefix: string):SkillDefinition[] =>
 rows.map(([topic,title,domain,reference,prior])=>({id:prefix+topic,title,grade,domain,standards:[reference],
  prerequisites:prior?[prefix+prior]:[],description:title+' using local illustrated materials.'}));
export const EARLY_MATH = [...describe(preschool,-1,'pk-'),...describe(kindergarten,0,'k-')];
export const earlyMathTopic = (id:string) => id.slice(id.indexOf('-')+1) as Topic;
export const shapes = ['circle','triangle','square','rectangle'] as const;
/** A seed reconstructs the complete item, including every option, on backup import. */
export function earlyMathItem(skill:SkillDefinition,tier:number,seed:number):MathItem {
 let state=seed;
 const random=(limit:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/4294967296*limit);};
 const topic=earlyMathTopic(skill.id),pk=skill.grade===-1;
 const max=pk?[3,5,10][tier]:[5,10,20][tier];
 const a=1+random(max), b=1+random(Math.max(1,Math.min(a,4)));
 const object=['gem','apple','fish','star','pear','frog'][random(6)];
 const shape=shapes[random(shapes.length)],flip=random(2), layout=random(3);
 let n=a, question='', answer='',prompt='',choices:string[]=[],style='numbers';
 const group=(count:number)=>'group-'+count;
 const quantities=(correct:number,ceiling:number,floor=0)=>{
   const candidates=Array.from({length:ceiling-floor+1},(_,i)=>i+floor).filter(i=>i!==correct);
   const pool=[correct];
   while(pool.length<3&&candidates.length)pool.push(...candidates.splice(random(candidates.length),1));
   return pool;
 };
 switch(topic){
  case 'numeral-group':
    n=pk?1+random(max):random(max+1);prompt=String(n);style='groups';
    question='Look at the number. Choose its group.';break;
  case 'attributes':{
    const examples=[
      ['triangle','Which shape has three straight sides?'],
      ['circle','Which shape has no corners?'],
      ['square','Find four equal straight sides and four square corners.']
    ];
    [answer,question]=examples[random(examples.length)];choices=[...shapes];break;
  }
  case 'sort-shape':case 'sort-size':{
    const size=topic==='sort-size';
    const pool=size?['small-gem','large-gem']:[...shapes];
    const target=pool[random(pool.length)],width=4+2*tier;
    const others=pool.filter(value=>value!==target);
    const board=Array.from({length:width},(_,i)=>i%2===0?target:others[random(others.length)]);
    for(let i=board.length-1;i>0;i--){const j=random(i+1);[board[i],board[j]]=[board[j],board[i]];}
    style='sort';prompt=[target,...board].join(' ');
    question='Tap every '+target.replace('-',' ')+'. Then tap the check mark.';
    const mask=board.map(value=>value===target?'1':'0');
    answer=mask.join('');
    choices=[answer,...[0,1].map(index=>mask.map((bit,i)=>i===index?(bit==='1'?'0':'1'):bit).join(''))];
    break;
  }
  case 'touch': question='Tap each picture once. Then tap the check mark.';style='touch';break;
  case 'small': n=1+random(4);question=`Find the group of ${n}.`;style='groups';break;
  case 'count':question='How many do you see?';prompt=group(a);break;
  case 'numeral':n=pk?1+random(5):random([6,11,21][tier]);question=`Tap the number ${n}.`;break;
  case 'build':question=`Make a group of ${n}. Then tap the check mark.`;style='build';break;
  case 'equal':question='Find a group with just as many.';prompt=group(a);style='groups';break;
  case 'compare':
  case 'compare-numeral':{
   const cap=pk?5:10,small=1+random(cap-1),big=small+1+random(cap-small);
   n=flip?big:small;question=`Tap the ${flip?'larger':'smaller'} ${topic==='compare'?'group':'number'}.`;
   style=topic==='compare'?'groups':'numbers';choices=[small,big].map(String);break;
  }
  case 'pattern':{const seq=tier===2?['gem','star','star']:['gem','star'];const index=random(seq.length);
   const parts=Array.from({length:seq.length*2},(_,i)=>seq[(i+index)%seq.length]);prompt=parts.join(' ');answer=seq[index];choices=['gem','star','apple'];question='What comes next?';break;}
  case 'shape':question=pk?'Find the matching shape.':`Find the ${shape}.`;prompt=pk?shape:'';choices=[...shapes];answer=shape;break;
  case 'position':question=`Which picture is ${flip?'above':'below'} the gem?`;prompt='position';choices=['star','apple','fish'];answer=flip?'star':'apple';break;
  case 'classify':if(pk){const animals=['fish','frog','cat'],fruits=['apple','pear','banana'];answer=(flip?animals:fruits)[random(3)];choices=[answer,...(flip?fruits:animals)];question=`Find the ${flip?'animal':'fruit'}.`;}
    else {n=1+random(5);prompt='category';question='How many apples are there?';}break;
  case 'size':question=`Tap the ${flip?'longer':'shorter'} strip.`;choices=['short','long'];answer=flip?'long':'short';break;
  case 'join': case 'remove': case 'missing':{
   const cap=pk?5:10,total=2+random(cap-1),part=1+random(total-1);
   n=topic==='join'?total:total-part;prompt=topic+'-'+total+'-'+part;
   question=topic==='join'?'Put the groups together. How many now?':topic==='remove'?'Some go away. How many stay?':`Make ${total}. How many more do we need?`;
   style=pk?'groups':'numbers';break;}
  case 'teen':n=11+random(9);question='Ten and some more. How many altogether?';prompt='teen';break;
  case 'solid':{const solids=['cube','cone','ball','can'];const i=random(4);choices=solids;answer=solids[i];question='Which object is shaped like a '+['cube','cone','sphere','cylinder'][i]+'?';break;}
  case 'compose':prompt='triangles';question='Slide these triangles together in your mind. Which shape do they make?';choices=[...shapes];answer='square';break;
  case 'order':n=1+random(8);prompt=group(n)+' '+group(n+1);n+=2;question='One more each time. Which group comes next?';style='groups';break;
 }
 if(!choices.length)choices=quantities(n,Math.max(n,topic==='teen'?19:topic==='numeral'&&!pk?20:max),pk?1:0).map(String);
 if(!answer)answer=String(n);
 for(let i=choices.length-1;i>0;i--){const j=random(i+1);[choices[i],choices[j]]=[choices[j],choices[i]];}
 const identity=JSON.stringify([question,prompt,style,object,layout,n,topic==='classify'?b:0,[...choices].sort()]);
 let signature=2166136261;
 for(const char of identity)signature=Math.imul(signature^char.charCodeAt(0),16777619);
 return {id:`${skill.id}:early1:${(signature>>>0).toString(36)}`,skill:skill.title,skillId:skill.id,grade:skill.grade,tier,question,answer,answerKind:'choice',
  choices:choices.map(value=>({value,label:value})),representation:topic==='numeral'||topic==='compare-numeral'?'symbolic':'visual',
  parameters:{seed,style,prompt,n,object,layout,b},hints:[{text:'Look at one picture at a time.'},{text:'Compare each choice with the question.'},{text:'Try making the group or shape with your hands.'}],
  workedExample:`The matching answer is ${answer}. Try it together.`};
}
export function validEarlyMath(item:MathItem,skill:SkillDefinition):boolean {
 const seed=item.parameters?.seed;
 if(typeof seed!=='number'||!Number.isInteger(seed)||seed<0||seed>0xffffffff||![0,1,2].includes(item.tier))return false;
 const expected=earlyMathItem(skill,item.tier,seed);
 return Object.entries(expected).every(([key,value])=>JSON.stringify(item[key as keyof MathItem])===JSON.stringify(value));
}
