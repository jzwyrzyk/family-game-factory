import { createHash } from 'node:crypto';
export interface GeneratedGame {
 kind:'generated-module-v1'; title:string; instructions:string; source:string;
 controls:('left'|'right'|'up'|'down'|'action')[];
 compiled?:{code:string;sourceHash:string;codeHash:string;tests:{desktop:boolean;mobile:boolean;replay:boolean;isolation:boolean}};
}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function validateGenerated(value:unknown):GeneratedGame {
 const g=value as GeneratedGame;
 if(!g||g.kind!=='generated-module-v1'||Object.keys(g).some(k=>!['kind','title','instructions','source','controls'].includes(k))||typeof g.title!=='string'||g.title.trim().length<1||g.title.length>60||typeof g.instructions!=='string'||g.instructions.length<5||g.instructions.length>250||typeof g.source!=='string'||Buffer.byteLength(g.source)>30000||g.source.length<30||!Array.isArray(g.controls)||g.controls.length>5||new Set(g.controls).size!==g.controls.length||g.controls.some(k=>!['left','right','up','down','action'].includes(k)))throw Error('GENERATED_ARTIFACT_REJECTED');
 return {kind:g.kind,title:g.title,instructions:g.instructions,source:g.source,controls:[...g.controls]};
}
export function validateCompiled(game:GeneratedGame,tested:GeneratedGame):GeneratedGame {
 const c=tested.compiled;
 if(!c||tested.kind!==game.kind||tested.title!==game.title||tested.instructions!==game.instructions||tested.source!==game.source||JSON.stringify(tested.controls)!==JSON.stringify(game.controls)||typeof c.code!=='string'||Buffer.byteLength(c.code)>100000||c.sourceHash!==hash(game.source)||c.codeHash!==hash(c.code)||c.tests?.desktop!==true||c.tests.mobile!==true||c.tests.replay!==true||c.tests.isolation!==true)throw Error('SANDBOX_ATTESTATION_REQUIRED');
 return {...game,compiled:c};
}
