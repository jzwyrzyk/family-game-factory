import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LANGUAGE_SKILLS} from '../src/language/curriculum';
import {ACTIVE_LANGUAGE_PACK,LANGUAGE_PACKS,LANGUAGE_BANK,generateLanguageItem,evaluateLanguageAnswer,languageContentErrors} from '../src/language/content';

test('language curriculum spans four grades with 48 authored, prerequisite-linked skill units',()=>{
  assert.equal(LANGUAGE_SKILLS.length,48);
  for(const grade of [1,2,3,4])assert.equal(LANGUAGE_SKILLS.filter(s=>s.grade===grade).length,12);
  assert.deepEqual(languageContentErrors(),[]);
  assert.equal(Object.values(LANGUAGE_BANK).reduce((n,x)=>n+x.items.length,0),192);
  const required=['phonics','spelling','vocabulary','grammar','comprehension','writing'];
  for(const domain of required)assert.ok(LANGUAGE_SKILLS.some(x=>x.domain===domain));
  const seen=new Set<string>();
  const visit=(id:string,stack=new Set<string>())=>{
    assert.equal(stack.has(id),false,'cycle at '+id);
    if(seen.has(id))return;const next=new Set(stack);next.add(id);
    const skill=LANGUAGE_SKILLS.find(s=>s.id===id)!;
    for(const p of skill.prerequisites)visit(p,next);
    seen.add(id);
  };
  LANGUAGE_SKILLS.forEach(s=>visit(s.id));
});

test('192 authored examples have independent answer oracles, unique choices, no guessed writing scores',()=>{
  let sampled=0;
  for(const skill of LANGUAGE_SKILLS)for(const tier of [0,1,2]){
    for(let i=0;i<20;i++){
      const item=generateLanguageItem(skill.id,{tier,random:()=>((i*.173)%1)});
      assert.equal(item.source,'reviewed-local');
      assert.equal(item.grade,skill.grade);
      assert.equal(item.hints.length,3);
      assert.ok(item.explanation);
      if(item.kind==='creative'){
        assert.equal(item.answer,undefined);
        assert.equal(evaluateLanguageAnswer(item,'any writing').valid,false);
      }else{
        const result=evaluateLanguageAnswer(item,item.answer!);
        assert.equal(result.valid,true);
        assert.equal(result.correct,true,skill.id);
        assert.equal(evaluateLanguageAnswer(item,'').valid,false);
        if(item.kind==='choice'){
          assert.equal(item.choices!.length,4);
          assert.equal(new Set(item.choices!.map(c=>c.value)).size,4);
          for(const d of item.choices!.filter(c=>c.value!==item.answer)){
            const wrong=evaluateLanguageAnswer(item,d.value);
            assert.equal(wrong.valid,true);
            assert.equal(wrong.correct,false);
          }
          assert.equal(evaluateLanguageAnswer(item,'__invented_answer__').valid,false);
        }
        if(item.kind==='word-tiles')assert.deepEqual(item.tiles!.slice().sort(),item.answer!.split('').sort());
        if(item.kind==='sentence-tiles')assert.deepEqual(item.tiles!.slice().sort(),item.answer!.split(/\s+/).sort());
        if(item.kind==='edit')assert.equal(evaluateLanguageAnswer(item,item.answer!.toLowerCase()).correct,false);
      }
      sampled++;
    }
  }
  assert.ok(sampled>2000);
});

test('shuffled choices do not systematically put the correct answer first',()=>{
  const positions=new Set<number>();
  for(let i=1;i<100;i++){
    const random=()=>((i*.131)%1);
    const item=generateLanguageItem('g4-theme',{tier:0,random});
    positions.add(item.choices!.findIndex(c=>c.value===item.answer));
  }
  assert.ok(positions.size>2);
});

test('published v1 examples have a pinned snapshot; never mutate archived reviewed packs',()=>{
  assert.equal(ACTIVE_LANGUAGE_PACK,'v1');
  assert.ok(Object.hasOwn(LANGUAGE_PACKS,'v1'));
  assert.equal(Object.isFrozen(LANGUAGE_BANK),true);
  assert.equal(Object.isFrozen(LANGUAGE_BANK['g1-short-i-o-u']),true);
  assert.equal(Object.isFrozen(LANGUAGE_BANK['g1-short-i-o-u'].items),true);
  assert.equal(Object.isFrozen(LANGUAGE_BANK['g1-short-i-o-u'].items[2].d),true);
  const data=JSON.stringify(LANGUAGE_BANK);
  let h=0x811c9dc5;
  for(let i=0;i<data.length;i++)h=Math.imul(h^data.charCodeAt(i),0x01000193)>>>0;
  assert.equal(h.toString(16).padStart(8,'0'),'5448ee3f',
    'Archived pack changed. Publish corrected examples as v2, retain v1 for saved learner history.');
  assert.equal(createHash('sha256').update(data).digest('hex').length,64);
  const item=generateLanguageItem('g1-short-i-o-u',{tier:1,random:()=>0});
  assert.equal(item.contentPack,'v1');
  assert.match(item.id,/:v1:\d+$/);
});

test('word and sentence construction never print the complete correct answer in the prompt',()=>{
  for(const [skill,bank] of Object.entries(LANGUAGE_BANK))for(const [index,item] of bank.items.entries()){
    if(item.kind==='word-tiles'||item.kind==='sentence-tiles'){
      assert.equal(item.q.toLocaleLowerCase('en-US').includes(item.a.toLocaleLowerCase('en-US')),false,
        skill+':'+index+' leaks the constructed answer into the instructions');
    }
  }
  const plural=LANGUAGE_BANK['g1-plural-s'].items[0];
  assert.equal(plural.q.toLowerCase().includes(plural.a.toLowerCase()),false,
    'Plural-choice checkpoint should not print the correct choice in its question');
});
