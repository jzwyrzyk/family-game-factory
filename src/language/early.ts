import type {LanguageSkill} from './types';
import type {LanguageTemplate,LanguageTemplateBank} from './content';
import type {Grade} from '../learning/grades';

type Row = [string,string,string[]?,string?]; // spoken instruction, answer, alternatives, silent print/picture
type Topic = {key:string;title:string;domain:LanguageSkill['domain'];standard:string;prior?:string;rows:Row[]};
const words = ['cat','dog','hat','bat','log','frog','fox','box','hen','pen','pig','fish','dish','sock','rock','boat','goat','bee','tree','key','cup','bus','bed','moon','spoon','apple','pear','banana','carrot','rabbit','duck','turtle'];
const vocabulary:Row[]=words.map(word=>[`Find the ${word}.`,word]);
const descriptions:Row[]=[
 ['Which animal has whiskers and meows?','cat'],['Which animal barks?','dog'],['Which fruit grows in a bunch and has a peel?','banana'],
 ['What can you wear on your foot?','sock'],['Which animal swims with fins?','fish'],['What can open a lock?','key'],
 ['What has pages you can turn?','book'],['Which animal has a hard shell?','turtle'],['What do you use to eat soup?','spoon'],
 ['Which animal has long ears and hops?','rabbit'],['Which animal buzzes from flower to flower?','bee'],['What do you take when it rains?','umbrella']
];
const rhymePairs=[['cat','hat'],['dog','log'],['fox','box'],['hen','pen'],['fish','dish'],['sock','rock'],['boat','goat'],['bee','tree'],['moon','spoon']];
const rhymes=rhymePairs.flatMap(([a,b])=>[[a,b],[b,a]].map(([cue,target]):Row=>[
 `What rhymes with ${cue}?`,target,['apple','bus','pig']]));
const starts=[['sun','sock','S'],['dog','duck','D'],['fish','frog','F'],['bee','bus','B'],['cup','cat','C'],['hat','hen','H'],['log','log','L'],['moon','map','M'],['pig','pen','P'],['rabbit','rock','R'],['tree','turtle','T'],['goat','goat','G']];
const onsets=starts.filter(([a,b])=>a!==b).map(([cue,answer]):Row=>[`Which starts like ${cue}?`,answer,['apple','bed','moon'].filter(word=>word[0]!==cue[0]).concat(['egg']).slice(0,3)]);
const syllables=[['cat',1],['apple',2],['banana',3],['dog',1],['turtle',2],['umbrella',3],['fish',1],['rabbit',2],['carrot',2],['spoon',1],['goat',1],['turtle',2]] as const;
const blends:Row[]=[
 ['rain','bow','rainbow'],['sun','flower','sunflower'],['cup','cake','cupcake'],['snow','man','snowman'],
 ['pan','cake','pancake'],['pop','corn','popcorn'],['tooth','brush','toothbrush'],['butter','fly','butterfly']
].map(([first,last,answer])=>[`Listen. ${first} ... ${last}. Put the parts together. Find the picture.`,answer,['book','cat','shoe']]);
const countSyllables=syllables.map(([word,n]):Row=>[`Listen. ${word}. How many beats are in that word?`,String(n),['1','2','3','4'].filter(x=>x!==String(n))]);
const letters=[...'SDBCFHMPRTGL'];
const chooseLetters=(right:string)=>letters.filter(x=>x.toLowerCase()!==right.toLowerCase()).slice(0,3).map(x=>right===right.toUpperCase()?x:x.toLowerCase());
const names=letters.map((letter):Row=>[`Find the letter ${letter}.`,letter,chooseLetters(letter)]);
const cases=letters.flatMap((letter,i)=>[letter,letter.toLowerCase()].map(stimulus=>{
 const answer=stimulus===letter?letter.toLowerCase():letter;
 return ['Find its letter partner.',answer,chooseLetters(answer),stimulus] as Row;
}));
const letterSound=starts.map(([cue,,letter]):Row=>[`Which letter starts ${cue}?`,letter,chooseLetters(letter)]);
const categories:Row[]=[
 ...['fish','dog','bee','goat','cat','duck'].map((v):Row=>['Find an animal.',v,['hat','cup','bed']]),
 ...['apple','pear','banana'].map((v):Row=>['Find a fruit.',v,['frog','book','key']]),
 ...['cup','spoon','dish'].map((v):Row=>['Find something used at a meal.',v,['bat','tree','bus']])
];
const pairs=[['sock','shoe'],['book','pen'],['dish','spoon'],['rain','umbrella'],['egg','hen'],['boat','fish'],['flower','bee'],['tree','apple'],['bed','moon'],['seed','flower'],['bus','map'],['hat','sock']];
const related:Row[]=pairs.map(([cue,answer])=>['Find the picture that goes with this one.',answer,['rock','cube','fox'],'picture:'+cue]);
const stories: [string,string,string,string][]=[
 ['Luz packed a pear. She put her book in a bag. Then she rode the bus.','pear','book','bus'],
 ['The cat spotted a bee. It jumped over a log. Then it slept on a bed.','bee','log','bed'],
 ['Max picked an apple. He washed his cup. Then he rang a bell.','apple','cup','bell'],
 ['The duck passed a frog. It rested near a rock. Then it saw a fish.','frog','rock','fish'],
 ['Sam found a key. He opened a box. Inside was a ball.','key','box','ball'],
 ['A goat ate a carrot. It walked past a tree. Then it watched a kite.','carrot','tree','kite']
];
const storiesAt=(time:number):Row[]=>stories.map(([story,...events])=>[story+' '+['What came first?','What came next, after the first thing?','What came last?'][time],events[time],[...events.filter((_,i)=>i!==time),'hat']]);
const directions:Row[]=descriptions.map(([q,a])=>['Listen, then tap. '+q,a]);
const decoding:Row[]=['cat','dog','sun','hat','bat','log','fox','box','hen','pen','pig','cup','bus','bed','bag','map'].map(word=>['Look at the word. Tap its picture.',word,undefined,word]);
const listeningStories=[...storiesAt(0),...storiesAt(1),...storiesAt(2)];
const core=(k:boolean):Topic[]=>[
 {key:'vocabulary',title:'Understand spoken words',domain:'vocabulary',standard:k?'L.K.5c':'P-LC 6',rows:vocabulary},
 {key:'description',title:'Identify an object from clues',domain:'listening',standard:k?'SL.K.2':'P-LC 2',rows:descriptions,prior:'vocabulary'},
 {key:'category',title:'Choose a category member',domain:'vocabulary',standard:k?'L.K.5a':'P-LC 7',rows:categories},
 {key:'related',title:'Match related pictures',domain:'vocabulary',standard:k?'L.K.5c':'P-LC 7',rows:related},
 {key:'directions',title:'Follow a spoken direction',domain:'listening',standard:k?'SL.K.2':'P-LC 2',rows:directions},
 {key:'rhyme',title:'Recognize rhyming words',domain:'phonological-awareness',standard:k?'RF.K.2a':'P-LIT 1',rows:rhymes},
 {key:'letters',title:'Recognize a named letter',domain:'phonics',standard:k?'RF.K.1d':'P-LIT 3',rows:names},
 {key:'onset',title:'Match a beginning sound',domain:'phonological-awareness',standard:k?'RF.K.2d':'P-LIT 1',rows:onsets},
 {key:'syllables',title:'Count spoken syllables',domain:'phonological-awareness',standard:k?'RF.K.2b':'P-LIT 1',rows:countSyllables},
 {key:'story',title:'Understand a short spoken story',domain:'listening',standard:k?'RL.K.1':'P-LIT 5',rows:listeningStories},
 {key:'sequence',title:'Recall story events in order',domain:'listening',standard:k?'RL.K.2':'P-LIT 4',rows:listeningStories,prior:'story'}
];
const kindergarten:Topic[]=[
 ...core(true),
 {key:'blend',title:'Blend spoken word parts',domain:'phonological-awareness',standard:'RF.K.2b',rows:blends,prior:'syllables'},
 {key:'case',title:'Match uppercase and lowercase letters',domain:'phonics',standard:'RF.K.1d',rows:cases,prior:'letters'},
 {key:'sound-letter',title:'Match a spoken onset to a letter',domain:'phonics',standard:'RF.K.3a',rows:letterSound,prior:'onset'},
 {key:'printed-word',title:'Recognize a printed CVC word',domain:'early-reading',standard:'RF.K.3',rows:decoding,prior:'sound-letter'},
 {key:'common-word',title:'Read a common position word',domain:'early-reading',standard:'RF.K.3c',
  rows:['in','on','up','down'].map(word=>['Read the word. Tap its picture.',word,['in','on','up','down'].filter(x=>x!==word),word])}
];
export const EARLY_LANGUAGE:LanguageSkill[]=[];
export const EARLY_LANGUAGE_BANK:Record<string,LanguageTemplateBank>={};
function addGrade(grade:Grade,prefix:string,topics:Topic[]){
 for(const {key,title,domain,standard,prior,rows} of topics){
  const id=prefix+key;
  EARLY_LANGUAGE.push({id,title,domain,grade,standards:[standard],prerequisites:prior?[prefix+prior]:[],objective:title});
  const items:LanguageTemplate[]=[];
  // Adjacent tiers overlap a little for short reflected word lists. Every tier
  // has several distinct targets. Higher tiers include later examples.
  for(const t of [0,1,2]){
   const slice=rows.length>=12?rows.slice(Math.floor(t*rows.length/3),Math.floor((t+1)*rows.length/3)):rows;
   for(const [q,a,options,stimulus] of slice){
    const at=words.indexOf(a),ordered=[...words.slice(Math.max(0,at+3+t)),...words];
    const d=options??[...new Set(ordered.filter(x=>x!==a))].slice(0,3);
    items.push({kind:'choice',q,a,d,t,ex:`The matching choice is ${a}. Try the example together.`,...(stimulus?{stimulus}:{})});
   }
  }
  if(key==='sequence'){
   for(const tier of [0,1,2])for(const [story,...events] of stories){
    const sequence=events.slice(0,grade===-1&&tier===0?2:3);
    items.push({kind:'sentence-tiles',q:story+' Tap these pictures in story order.',a:sequence.join(' '),
     ex:'In the story, the pictures appear in this order: '+sequence.join(', ')+'.',t:tier});
   }
  }
  EARLY_LANGUAGE_BANK[id]={h:['Listen to the instruction once more.','Look at each choice before picking.','Compare two pictures or letters at a time.'],items};
 }
}
addGrade(-1,'pk-ela-',core(false));addGrade(0,'k-ela-',kindergarten);
