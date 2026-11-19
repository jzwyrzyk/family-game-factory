import test from 'node:test';
import assert from 'node:assert/strict';
import {BAG_CAPACITY,newMineState,moveMine} from '../src/games/mind-your-jems-rules';

test('Mind Your Jems starts empty, with no child data or build assumptions',()=>{
 assert.deepEqual(newMineState(),{banked:0,loose:0,lost:0,mined:0,shakes:0,holding:false,phase:'mining'});
});
test('mining carries at most eight Jems and rare gems are capped',()=>{
 let s=newMineState();
 s=moveMine(s,{type:'mine',value:3});
 assert.equal(s.loose,3);
 for(let i=0;i<7;i++)s=moveMine(s,{type:'mine',value:1});
 assert.equal(s.loose,BAG_CAPACITY);
 assert.equal(s.mined,BAG_CAPACITY);
 assert.equal(moveMine(s,{type:'mine',value:3}),s,'full bag refuses extra mining');
});
test('banking empties the bag and makes the Jems permanently safe',()=>{
 let s=newMineState();
 s=moveMine(s,{type:'mine',value:3});
 s=moveMine(s,{type:'bank'});
 assert.deepEqual({banked:s.banked,loose:s.loose},{banked:3,loose:0});
 s=moveMine(s,{type:'warn'});
 s=moveMine(s,{type:'shake'});
 assert.equal(s.banked,3);
 assert.equal(s.lost,0);
});
test('a big idea gives warning, grab protects the miner but only banking saves loose Jems',()=>{
 let s=moveMine(newMineState(),{type:'mine',value:3});
 assert.equal(moveMine(s,{type:'grab'}),s,'grab needs an actual warning');
 s=moveMine(s,{type:'warn'});
 assert.equal(s.phase,'warning');
 s=moveMine(s,{type:'grab'});
 assert.equal(s.holding,true);
 s=moveMine(s,{type:'shake'});
 assert.equal(s.phase,'shaking');
 assert.equal(s.loose,0);
 assert.equal(s.lost,3,'held miner still loses unbanked cargo');
 assert.equal(moveMine(s,{type:'mine',value:1}),s,'mining is blocked during the shake');
 assert.equal(moveMine(s,{type:'bank'}),s,'banking is blocked during the shake');
 s=moveMine(s,{type:'settle'});
 assert.equal(s.phase,'mining');assert.equal(s.holding,false);assert.equal(s.shakes,1);
});
test('banking during warning is allowed and never erases earlier banked Jems',()=>{
 let s=newMineState();
 s=moveMine(s,{type:'mine',value:1});
 s=moveMine(s,{type:'warn'});
 s=moveMine(s,{type:'bank'});
 s=moveMine(s,{type:'shake'});
 s=moveMine(s,{type:'settle'});
 s=moveMine(s,{type:'mine',value:3});
 assert.deepEqual({banked:s.banked,loose:s.loose,lost:s.lost,shakes:s.shakes},{banked:1,loose:3,lost:0,shakes:1});
});
test('all mining value remains accounted for across 200 deterministic rounds',()=>{
 let s=newMineState();
 for(let i=0;i<200;i++){
   s=moveMine(s,{type:'mine',value:i%4===0?3:1});
   if(i%3===0)s=moveMine(s,{type:'bank'});
   if(i%7===0){
     s=moveMine(s,{type:'warn'});
     if(i%2===0)s=moveMine(s,{type:'grab'});
     s=moveMine(s,{type:'shake'});
     s=moveMine(s,{type:'settle'});
   }
   assert.equal(s.mined,s.banked+s.loose+s.lost);
   assert.ok(s.loose>=0&&s.loose<=BAG_CAPACITY);
 }
});
