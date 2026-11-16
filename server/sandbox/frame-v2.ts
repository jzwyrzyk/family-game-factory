/** Copy only bounded primitive records BEFORE structured cloning across the Worker boundary. */
export type DrawCommand=Record<string,any>;
const SPRITES=new Set(['bottle','carton','can','spoon','plank','cone','wheel','fan','balloon','capsule','chassis','star','hero']);
export const finite=(v:unknown,min:number,max:number):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('DISPLAY_VALUE');return v;};
function record(value:any,allowed:string[]){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('DISPLAY_RECORD');const keys=Object.keys(value);if(keys.length>allowed.length)throw Error('DISPLAY_FIELDS');const result:DrawCommand=Object.create(null);
 for(let i=0;i<keys.length;i++){const key=keys[i];if(!allowed.includes(key))throw Error('DISPLAY_FIELD');const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('DISPLAY_ACCESSOR');result[key]=descriptor.value;}
 return result;
}
export function copyCommand(value:any):DrawCommand{
 const c=record(value,['type','key','x','y','width','height','radius','color','text','size','spriteId','angle','x2','y2','screen','style','power']);
 if(!['rect','circle','text','sprite','line','background'].includes(c.type))throw Error('DISPLAY_COMMAND');
 if(c.key!==undefined&&(typeof c.key!=='string'||c.key.length>60))throw Error('DISPLAY_KEY');if(c.screen!==undefined&&typeof c.screen!=='boolean')throw Error('DISPLAY_SCREEN');
 if(c.type==='background'){if(!['workshop','hills'].includes(c.style))throw Error('DISPLAY_BACKGROUND');return {type:c.type,style:c.style};}
 finite(c.x,-10000,10000);finite(c.y,-10000,10000);if(c.type!=='sprite'&&(typeof c.color!=='string'||c.color.length>9||!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.color)))throw Error('DISPLAY_COLOR');
 if(c.type==='rect'||c.type==='sprite'){finite(c.width,0,2000);finite(c.height,0,2000);}if(c.type==='circle')finite(c.radius,0,1000);if(c.angle!==undefined)finite(c.angle,-100000,100000);
 if(c.type==='line'){finite(c.x2,-10000,10000);finite(c.y2,-10000,10000);finite(c.width,0,50);}
 if(c.type==='text'){if(typeof c.text!=='string'||c.text.length>100)throw Error('DISPLAY_TEXT');finite(c.size,8,80);}
 if(c.type==='sprite'&&!SPRITES.has(c.spriteId))throw Error('SPRITE_NOT_APPROVED');if(c.power!==undefined)finite(c.power,0,1);
 // Reject oversized/unvalidated extra values even when an approved field is irrelevant to this command.
 for(const key of Object.keys(c)){const v=c[key];if(typeof v==='string'){if(v.length>(key==='text'?100:key==='key'?60:24))throw Error('DISPLAY_STRING');}else if(typeof v==='number'){finite(v,-100000,100000);}else if(typeof v!=='boolean'&&v!==undefined)throw Error('DISPLAY_PRIMITIVE');}
 return c;
}
export function copyCommands(value:any):DrawCommand[]{
 if(!Array.isArray(value))throw Error('FRAME_LIMIT');const length=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isInteger(length)||length<0||length>240)throw Error('FRAME_LIMIT');const result:DrawCommand[]=[];let backgrounds=0,sprites=0,texts=0;
 for(let i=0;i<length;i++){const item=Object.getOwnPropertyDescriptor(value,String(i));if(!item||!Object.hasOwn(item,'value'))throw Error('DISPLAY_ACCESSOR');const command=copyCommand(item.value);if(command.type==='background'&&++backgrounds>1||command.type==='sprite'&&++sprites>80||command.type==='text'&&++texts>40)throw Error('DRAW_WORK_LIMIT');result.push(command);}return result;
}
export function copyOutcome(value:any):{status:'playing'|'won'|'lost';score:number}{
 const result=record(value,['status','score']);if(!['playing','won','lost'].includes(result.status)||!Number.isInteger(result.score)||result.score<0||result.score>1000000)throw Error('OUTCOME_REJECTED');return {status:result.status,score:result.score};
}
