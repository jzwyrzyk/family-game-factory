import test from 'node:test';import assert from 'node:assert/strict';
import {solution,evaluate,connect} from '../src/games/construction.js';
test('structural construction supports substitute bodies, different geometry and solvable progression',()=>{for(let level=1;level<=100;level++){for(const substitute of [false,true]){const s=solution(level,substitute,substitute?15:0);assert.equal(evaluate(s,level).ok,true,`level ${level}`);assert.ok(s.joints.length<=10)}}});
test('disconnected structures, gum budgets and invalid attachments are enforced',()=>{const s=solution();s.joints.pop();assert.match(evaluate(s).reason,/disconnected/);const before=JSON.stringify(s.joints);assert.equal(connect(s,'nose','nose'),false);assert.equal(JSON.stringify(s.joints),before);assert.equal(connect(s,'body','engine',s.joints.length),false);assert.equal(JSON.stringify(s.joints),before);});

test('rotation changes support geometry and stretched joints need repair',()=>{const s=solution();s.parts.find(p=>p.id==='left')!.angle=90;assert.match(evaluate(s).reason,/Rotate/);s.parts.find(p=>p.id==='left')!.angle=0;s.parts.find(p=>p.id==='left')!.x=0;assert.match(evaluate(s).reason,/stretched/)});
