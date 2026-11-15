import test from 'node:test';import assert from 'node:assert/strict';
import {solution,evaluate,connect} from '../src/games/construction.js';
test('structural construction supports substitute bodies, different geometry and solvable progression',()=>{for(let level=1;level<=100;level++){for(const substitute of [false,true]){const s=solution(level,substitute,substitute?15:0);assert.equal(evaluate(s,level).ok,true,`level ${level}`);assert.ok(s.joints.length<=10)}}});
test('disconnected structures, gum budgets and invalid attachments are enforced',()=>{const s=solution();s.joints.pop();assert.match(evaluate(s).reason,/disconnected/);const before=JSON.stringify(s.joints);assert.equal(connect(s,'nose','nose'),false);assert.equal(JSON.stringify(s.joints),before);assert.equal(connect(s,'body','engine',s.joints.length),false);assert.equal(JSON.stringify(s.joints),before);});

test('rotation changes support geometry and stretched joints need repair',()=>{const s=solution();s.parts.find(p=>p.id==='left')!.angle=90;assert.match(evaluate(s).reason,/Rotate/);s.parts.find(p=>p.id==='left')!.angle=0;s.parts.find(p=>p.id==='left')!.x=0;assert.match(evaluate(s).reason,/stretched/)});

test('seeded household kits always include a construction within ten gum sticks',()=>{for(let seed=0;seed<500;seed++){const level=seed%30+1;const state=solution(level,seed%2===0,0,seed);assert.ok(evaluate(state,level).ok);assert.ok(state.joints.length<=10)}});

test('gum joints store attachment points on each piece, not just a connectivity flag',()=>{const s=solution();assert.ok(s.joints.every(j=>j.anchorA&&j.anchorB));assert.ok(s.joints.some(j=>j.anchorA.x!==0||j.anchorA.y!==0));});
