import assert from 'node:assert/strict';
import { builderLevel, gemStage } from '../src/brand/gem-progress';
import type { StudioSession } from '../src/studio/notebook';

const evidence = (opts: {author?:boolean; test?:boolean; observed?:boolean; source?:'runtime'|'child'} = {}) =>
 ({messages:opts.author?[{role:'child'}]:[{role:'helper'}],
   experiments:opts.test?[{id:'test-1'}]:[],
   design:{ideas:[],observations:opts.observed?[{source:opts.source||'child',experimentId:'test-1',text:'It jumped better.'}]:[]}
 } as unknown as StudioSession);

assert.equal(gemStage(evidence()),'none','Opening a game or helper text earns nothing');
assert.equal(gemStage(evidence({author:true})),'rough','A saved child idea earns a rough jem');
assert.equal(gemStage(evidence({author:true,test:true})),'rough','An untested experiment does not polish');
assert.equal(gemStage(evidence({author:true,observed:true})),'rough','A reflection without a saved experiment does not count');
assert.equal(gemStage(evidence({author:true,test:true,observed:true,source:'runtime'})),'rough','Automation alone does not claim child reflection');
assert.equal(gemStage(evidence({author:true,test:true,observed:true})),'cut','An observed experiment earns a cut facet');
assert.equal(gemStage(evidence({author:true,test:true,observed:true}),true),'polished','Keeping an observed test polishes the jem');
assert.equal(builderLevel(['none']).level,0);
assert.equal(builderLevel(['rough','none']).level,1);
assert.equal(builderLevel(['rough','cut']).level,2);
assert.deepEqual(builderLevel(['polished','cut']).level,3);
console.log('Gem progress evidence and builder-level tests passed.');
