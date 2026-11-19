/** Synthetic transport/evidence helpers for unit contracts ONLY. These images
 * are generated test colors, not gameplay screenshots or quality proof. */
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import type {GeneratedGame} from '../agent/generated';
import type {GameProductionPlan,SuggestedPlaythrough} from '../quality/presentation-plan';
import {qualityArtifactHash,bindQualityReview,type GameQualityEvidence} from '../quality/game-quality';

export const fixturePlaythrough:SuggestedPlaythrough=[{type:'hold',control:'action',frames:60},{type:'wait',frames:180},{type:'wait',frames:180},{type:'wait',frames:180}];
export function fixturePlanProposal(request:any){
 const data=typeof request.input==='string'?JSON.parse(request.input):{};
 return {presentationStyle:data.presentationBrief?.preferredStyle||'flat-2d',playerAction:'Use ordinary controls to move and change the visible game.',payoff:'Reach the requested visible result through ordinary play.',variation:'Try different choices and recover, with variation appropriate to the request.',openEnded:false,artRequests:[]};
}
export function fixtureProviderResponse(value:unknown,inputTokens=100,outputTokens=600){
 return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:inputTokens,output_tokens:outputTokens}}));
}
export function fixtureModuleReply(game:GeneratedGame){
 return {kind:game.kind,title:game.title,instructions:game.instructions,source:game.source,controls:game.controls,playthrough:game.playthrough||fixturePlaythrough};
}
const digest=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name:string,data:Buffer){const n=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([n,data])));return Buffer.concat([length,n,data,crc]);}
export function syntheticEvidencePng(color:number,width=320,height=240){
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++){const row=y*(width*3+1);for(let x=0;x<width;x++){pixels[row+1+x*3]=(color+x)%256;pixels[row+2+x*3]=(y+color)%256;pixels[row+3+x*3]=color;}}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export function syntheticQualityEvidence(game:GeneratedGame):GameQualityEvidence {
 if(!game.compiled)throw Error('SYNTHETIC_COMPILED_FIXTURE_REQUIRED');
 const captures:GameQualityEvidence['captures']=[];
 for(const [device,color]of [['desktop',20],['tablet',100]] as const){
  for(const [phase,offset,tick]of [['initial',0,0],['progress',35,600]] as const){
   const bytes=syntheticEvidencePng(color+offset);
   captures.push({id:`${device}-${phase}`,device,phase,tick,width:320,height:240,sha256:digest(bytes),data:bytes.toString('base64')});
  }
 }
 return {version:'game-quality-evidence-v1',motion:'normal',artifactHash:qualityArtifactHash(game),sourceHash:game.compiled.sourceHash,codeHash:game.compiled.codeHash,
  runtimeVersion:game.compiled.runtimeVersion||'legacy-v1',runtimeHash:game.compiled.runtimeHash||digest('legacy-v1'),captures,
  sessions:(['desktop','tablet'] as const).map(device=>({device,inputs:2,visibleChanges:2,simulatedTicks:600,outcome:'playing',replay:true,pause:true,touch:device==='tablet',consoleErrors:0,
   actionTrace:[{index:0,action:{type:'hold',control:'action',frames:60},startTick:0,endTick:60,beforeHash:digest('synthetic-before'),afterHash:digest('synthetic-after')}]}))};
}
export function syntheticReviewAnswer(){
 return {axes:{visual:'pass',intent:'pass',gameplay:'pass',input:'pass'},findings:[],evidenceByAxis:Object.fromEntries(['visual','intent','gameplay','input'].map(axis=>[axis,['desktop-initial','desktop-progress','tablet-initial','tablet-progress']]))};
}
export function syntheticQualityReview(game:GeneratedGame,evidence=syntheticQualityEvidence(game)){
 return bindQualityReview(game,evidence,syntheticReviewAnswer());
}
