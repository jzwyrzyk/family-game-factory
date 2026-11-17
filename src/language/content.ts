import {getLanguageSkill, LANGUAGE_SKILLS} from './curriculum';
import {LANGUAGE_G1} from './data-g1';
import {LANGUAGE_G2} from './data-g2';
import {LANGUAGE_G3} from './data-g3';
import {LANGUAGE_G4} from './data-g4';
import type {LanguageItem, LanguageKind, LanguageLevel, LanguageForm} from './types';

export interface LanguageTemplate {
  kind:LanguageKind; q:string; a:string; d?:string[]; ex:string; t:number; passage?:string;
}
export interface LanguageTemplateBank {
  h:string[]; items:LanguageTemplate[];
}
// Version-1 content is immutable after a child begins using it. Future corrections
// belong in a NEW pack, while the original pack remains available for history validation.
// Changing an archived pack can otherwise make legitimate saved attempts unreadable.
export const ACTIVE_LANGUAGE_PACK = 'v1' as const;
export const LANGUAGE_BANK_V1:Readonly<Record<string,LanguageTemplateBank>> = Object.freeze({
  ...LANGUAGE_G1, ...LANGUAGE_G2, ...LANGUAGE_G3, ...LANGUAGE_G4,
});
export const LANGUAGE_PACKS:Readonly<Record<string,Readonly<Record<string,LanguageTemplateBank>>>> =
  Object.freeze({v1:LANGUAGE_BANK_V1});
export const LANGUAGE_BANK = LANGUAGE_BANK_V1;
const unit=(random:()=>number):number=>{
  const n=random(); return Number.isFinite(n)?Math.max(0,Math.min(0.999999,n)):0;
};
const shuffle=<T>(array:T[],random:()=>number):T[]=>{
  const copy=array.slice();
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(unit(random)*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
};
export interface LanguageItemOptions {
  random?:()=>number; tier?:number; excludeIds?:string[];
}
/** Reviewed templates only. Generated game code never authors or grades these items. */
export function generateLanguageItem(skillId:string,options:LanguageItemOptions={}):LanguageItem {
  const skill=getLanguageSkill(skillId);
  const bank=LANGUAGE_PACKS[ACTIVE_LANGUAGE_PACK][skillId];
  if(!bank?.items.length)throw Error('Language skill has no reviewed examples: '+skillId);
  const random=options.random||Math.random;
  const tier=Math.max(0,Math.min(2,Math.floor(options.tier??0))) as LanguageLevel;
  const nearest=Math.min(...bank.items.map(x=>Math.abs(x.t-tier)));
  const matches=bank.items.map((item,index)=>({item,index})).filter(x=>Math.abs(x.item.t-tier)===nearest);
  const notRecent=matches.filter(x=>!options.excludeIds?.includes(skillId+':'+ACTIVE_LANGUAGE_PACK+':'+x.index));
  const eligible=notRecent.length?notRecent:matches;
  const chosen=eligible[Math.floor(unit(random)*eligible.length)];
  const draft=chosen.item;
  const kind=draft.kind;
  const form:LanguageForm=kind==='word-tiles'?'encoding':kind==='sentence-tiles'||kind==='edit'?'syntax':
    kind==='creative'?'expression':skill.domain==='comprehension'?'comprehension':'pattern';
  const choices=kind==='choice' ? shuffle([draft.a,...(draft.d||[])].map(value=>({value,label:value})),random) : undefined;
  const tiles=(kind==='word-tiles'?shuffle(draft.a.split(''),random):
    kind==='sentence-tiles'?shuffle(draft.a.split(/\s+/),random):undefined);
  return {
    id:skillId+':'+ACTIVE_LANGUAGE_PACK+':'+chosen.index,contentPack:ACTIVE_LANGUAGE_PACK,
    skillId,title:skill.title,grade:skill.grade,domain:skill.domain,
    kind,form,tier:draft.t as LanguageLevel,question:draft.q,
    ...(draft.passage?{passage:draft.passage}:{}),
    ...(choices?{choices}:{}),...(tiles?{tiles}:{}),
    ...(kind==='creative'?{}:{answer:draft.a}),
    hints:bank.h.slice(0,3) as [string,string,string],explanation:draft.ex,
    source:'reviewed-local',
  };
}
const collapsed=(s:string)=>s.trim().replace(/\s+/g,' ');
/** Correctness is evaluated exactly against a reviewed answer, never by an LLM. */
export function evaluateLanguageAnswer(item:LanguageItem,raw:string):{valid:boolean;correct:boolean;normalized:string;message?:string}{
  if(item.kind==='creative')return {valid:false,correct:false,normalized:'',message:'Creative writing is practice, not a scored answer.'};
  if(typeof raw!=='string'||raw.length>400)return {valid:false,correct:false,normalized:'',message:'Please try a shorter answer.'};
  const input=collapsed(raw);
  if(!input)return {valid:false,correct:false,normalized:'',message:'Choose or build an answer first.'};
  if(item.kind==='choice'){
    const choice=item.choices?.find(c=>c.value===input);
    if(!choice)return {valid:false,correct:false,normalized:input,message:'Choose one of the displayed answers.'};
    return {valid:true,correct:input===item.answer,normalized:input};
  }
  if(item.kind==='word-tiles'&&!/^[a-z]+$/i.test(input))return {valid:false,correct:false,normalized:input,message:'Use the letter tiles to build the word.'};
  const normalize=item.kind==='edit'?collapsed:(s:string)=>collapsed(s).toLocaleLowerCase('en-US');
  return {valid:true,correct:normalize(input)===normalize(item.answer||''),normalized:input};
}
/** Structural content validator used by the independent test oracle. */
export function languageContentErrors():string[] {
  const errors:string[]=[];
  const ids=new Set(LANGUAGE_SKILLS.map(s=>s.id));
  if(ids.size!==LANGUAGE_SKILLS.length)errors.push('duplicate skill id');
  for(const skill of LANGUAGE_SKILLS){
    const bank=LANGUAGE_BANK[skill.id];
    if(!bank||bank.items.length<4){errors.push(skill.id+': insufficient curated examples');continue;}
    if(bank.h.length!==3||bank.h.some(s=>!s||s.length<15))errors.push(skill.id+': missing instruction');
    for(const prerequisite of skill.prerequisites){
      const prior=LANGUAGE_SKILLS.find(x=>x.id===prerequisite);
      if(!prior||prior.grade>skill.grade||prior.id===skill.id)errors.push(skill.id+': invalid prerequisite '+prerequisite);
    }
    bank.items.forEach((item,index)=>{
      const key=skill.id+':'+index;
      if(!item.q||!item.ex||item.ex.length<12||![0,1,2].includes(item.t))errors.push(key+': missing educational detail');
      if(item.kind==='choice'){
        if(!item.a||!item.d||item.d.length!==3||new Set([item.a,...item.d]).size!==4)errors.push(key+': ambiguous/missing choices');
      } else if(item.kind==='word-tiles'){
        if(!/^[a-z]{3,20}$/i.test(item.a))errors.push(key+': unsupported spelling construction');
      } else if(item.kind==='sentence-tiles'){
        if(item.a.split(/\s+/).length<4)errors.push(key+': incomplete sentence construction');
      } else if(item.kind==='edit'){
        if(item.a.length<5)errors.push(key+': missing exact model answer');
      } else if(item.kind==='creative'){
        if(item.a)errors.push(key+': creative work must not carry a correct answer');
      } else errors.push(key+': unknown task kind');
    });
  }
  for(const key of Object.keys(LANGUAGE_BANK))if(!ids.has(key))errors.push(key+': orphan content');
  return errors;
}
