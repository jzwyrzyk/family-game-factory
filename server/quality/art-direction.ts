// Geometry is sealed with the production plan. No raster data or family identifiers enter the model schema.
const views = ['side','top-down','isometric','guided-perspective'] as const;
const supplies = ['sheet','approved','native','optional'] as const;
export interface ArtSubject {
 id:string; supply:typeof supplies[number]; role:'actor'|'object'|'effect'; pose:string;
 displayWidth:number; displayHeight:number; pivotX:number; pivotY:number; footprint:number;
}
export interface ArtDirection {
 version:'art-direction-v1'; view:typeof views[number]; scenery:string; actionSpace:string;
 lightingPalette:string; foreground:string; sheetId:string|null; columns:number; rows:number;
 subjects:ArtSubject[];
}
const words={type:'string',minLength:1,maxLength:240};
const id={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,39}$'};
const fraction={type:'number',minimum:0,maximum:1};
const dimension={type:'integer',minimum:1,maximum:2048};
const subjectProperties={id,supply:{type:'string',enum:supplies},role:{type:'string',enum:['actor','object','effect']},
 pose:words,displayWidth:dimension,displayHeight:dimension,pivotX:fraction,pivotY:fraction,footprint:fraction};
const gridSize={type:'integer',minimum:0,maximum:7};
const properties={version:{type:'string',enum:['art-direction-v1']},view:{type:'string',enum:views},scenery:words,
 actionSpace:words,lightingPalette:words,foreground:words,sheetId:{anyOf:[id,{type:'null'}]},columns:gridSize,rows:gridSize,
 subjects:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:Object.keys(subjectProperties),properties:subjectProperties}}};
export const artDirectionSchema={type:'object',additionalProperties:false,required:Object.keys(properties),properties};

function reject():never {throw Error('ART_DIRECTION_INVALID');}
function exact(value:unknown,fields:object){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(fields).length||
    !Object.keys(fields).every(k=>Object.hasOwn(value,k)))reject();
}
export function readArtDirection(value:unknown):ArtDirection {
 exact(value,properties);
 const d=value as ArtDirection;
 const phrase=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=240&&!/[\x00-\x1f]/.test(v);
 const validId=(v:unknown)=>typeof v==='string'&&new RegExp(id.pattern).test(v);
 if(d.version!=='art-direction-v1'||!views.includes(d.view)||![d.actionSpace,d.scenery,d.lightingPalette,d.foreground].every(phrase)||
    !Array.isArray(d.subjects)||!d.subjects.length||d.subjects.length>8||
    ![d.columns,d.rows].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=7))reject();
 const ids=new Set<string>();
 for(const s of d.subjects){
  exact(s,subjectProperties);
  if(!validId(s.id)||ids.has(s.id)||s.id===d.sheetId||!supplies.includes(s.supply)||!['actor','object','effect'].includes(s.role)||
     ![s.displayWidth,s.displayHeight].every(n=>Number.isInteger(n)&&n>=1&&n<=2048)||!phrase(s.pose)||![s.pivotX,s.pivotY,s.footprint].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||s.footprint===0)reject();
  ids.add(s.id);
 }
 const cells=d.subjects.filter(s=>s.supply==='sheet').length;
 if(cells?(!validId(d.sheetId)||cells!==d.columns*d.rows||cells>7):(d.sheetId!==null||d.columns!==0||d.rows!==0))reject();
 return structuredClone(d);
}

export function requirePlannedAssets(requests:readonly {id:string;role:string}[],direction:ArtDirection|undefined,assets:readonly {id:string;role:string}[]){
 const required=[...requests.filter(r=>r.id!==direction?.sheetId),
  ...(direction?.subjects.filter(s=>s.supply==='sheet'||s.supply==='approved')||[])];
 if(required.some(r=>!assets.some(a=>a.id===r.id&&a.role===r.role)))throw Error('ART_PLAN_ASSET_MISSING');
}
