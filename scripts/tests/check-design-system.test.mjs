import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDesignSource, check} from '../check-design-system.mjs';
const tokens=new Set(['--jems-color-text']);
test('rejects local palette, unknown tokens and undersized child text',()=>{
 const issues=inspectDesignSource('src/design-system/components/test.css','.label{color:#abcdef;background:rgb(1,2,3);font-size:12px;border-color:var(--missing)}',tokens);
 assert.deepEqual(issues.map(i=>i.rule),['semantic-color','semantic-color','unknown-token','child-type-size']);
});
test('permits semantic colors, adaptive sizes and unrelated ID selectors',()=>{
 assert.deepEqual(inspectDesignSource('src/design-system/components/test.css','#page{color:var(--jems-color-text);font-size:clamp(18px,2vw,20px)}',tokens),[]);
});
test('presentation must not gain storage, transport or reward authority',()=>{
 for(const source of ["import {store} from '../../storage/rewards';",'localStorage.setItem("x", "y")','fetch("/api/reward")'])assert.ok(inspectDesignSource('src/design-system/test.ts',source,tokens).length);
});
test('repository wrappers, actual consumers, breakpoints and exceptions remain valid',()=>assert.deepEqual(check().issues,[]));
