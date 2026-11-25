import {readFileSync} from 'node:fs';
import {cases} from './premium-benchmark-cases';
import type {ArtDirection,ArtSubject} from '../server/quality/art-direction';
import type {GeneratedGame} from '../server/agent/generated';
import type {SuggestedAction} from '../server/quality/presentation-plan';
import type {ProductionInteraction} from '../server/quality/production-design';

const hold=(control:'action'|'down'|'left'|'right',frames:number):SuggestedAction=>({type:'hold',control,frames});
const displayWidths:Record<string,number>={fox:116,duck:116,twirl:116,leaf:42,horse:157,ribbon:85,press:78,crystal:56};
const subject=(id:string,role:ArtSubject['role'],pose:string):ArtSubject=>({id,role,pose,supply:'sheet',displayWidth:displayWidths[id],
 displayHeight:id==='leaf'?39:displayWidths[id],pivotX:.5,pivotY:.88,footprint:.52});
const action=(input:ProductionInteraction['input'],action:string,consequence:string)=>({input,action,consequence});
const briefs = {
 fox:{title:'The Leafwood Jubilee',request:cases[0].request, pairedCase:'fox-and-leaves', style:'illustrated',
  instructions:'Hold Action over the low leaves and Down under the high leaves. Clear 100 to start the jubilee.',
  view:'side',background:'leafwood',sceneId:'forest',lighting:'Apricot sun, copper fur, celadon trees and cool pine shadows.',
  space:'Keep the forest trail open across the lower third.',foreground:'Leaves approach in front of distant firs. Fox paws meet the path.',
  subjects:[subject('fox','actor','Bounding fox'),subject('duck','actor','Crouched fox'),subject('leaf','object','Angled copper leaf'),subject('twirl','actor','Celebratory turn')],
  interactions:[action('action','Bound over low leaves','Fox springs above a stream of leaves.'),action('down','Duck under high leaves','Fox crouches underneath the stream.')],
  variation:'Faster leaf streams as more leaves are cleared.',recovery:'After brushing a leaf, release and choose the right pose.',payoff:'Clear one hundred leaves and dance in a shower of petals.',
  route:[...Array.from({length:10},(_,i)=>hold(i%2?'down':'action',144))]},
 factory:{title:'Copperline Foundry',request:'In an isometric factory, send moving gems to the left and right dies to fill four orders. Return a mistaken shipment so I can try again.',
  pairedCase:null,style:'dimensional',instructions:'Read the order. Press Left or Right to send the gem to its die. Pack four gems.',
  view:'isometric',background:'foundry',sceneId:'floor',lighting:'Warm copper, sea glass, pale amber skylight, cool contact shadows.',
  space:'Leave the diagonal conveyor and two die stations open.',foreground:'Dies and gems above the belt. Packed gems sit on the loading ledge.',
  subjects:[subject('crystal','object','Faceted cargo'),subject('press','object','Copper routing die')],
  interactions:[action('left','Route to the left die','Gem moves down the belt to the left.'),action('right','Route to the right die','Gem moves up the belt to the right.')],
  variation:'Alternate between the two dies as each new order arrives.',recovery:'The wrong die returns the gem.',payoff:'All four packed gems remain visible for dispatch.',
  route:['right','left','right','left','right'].map(k=>hold(k as 'left'|'right',40))},
 horse:{title:'The Bridle Valley Ribbon',request:'Ride my horse through a guided maze from the saddle. Show its ears and head, take different paths and find the valley ribbon.',
  pairedCase:null,style:'illustrated',instructions:'Use Left or Right at each fork. Follow the signs to Ribbon meadow. You can turn back at the hollow.',
  view:'guided-perspective',background:'bridle-valley',sceneId:'valley',lighting:'Soft lavender ridges, sage meadows, chestnut mane and honey-gold ribbon.',
  space:'Forked trail meets the horizon with open space for destination signs.',foreground:'Signs grow on approach. The horse head and mane turn nearest the rider.',
  subjects:[subject('horse','actor','Saddle view with ears pricked'),subject('ribbon','object','Valley rosette')],
  interactions:[action('left','Choose the left path','Horse leans left and reaches the marked junction.'),action('right','Choose the right path','Horse leans right toward a different junction.')],
  variation:'Two entrances and connecting loops reward different routes.',recovery:'Follow a return sign to revisit an earlier fork.',payoff:'Reach Ribbon meadow and see the ribbon beside the horse.',
  route:['left','left','right','left','right'].map(k=>hold(k as 'left'|'right',42))}
} as const;
export type ArtCase=keyof typeof briefs;
export const artCases=Object.keys(briefs) as ArtCase[];
export function authoredCase(id:ArtCase){
 const b=briefs[id],asset=(file:string)=>readFileSync(new URL('./premium-art/'+file,import.meta.url));
 const artDirection:ArtDirection={version:'art-direction-v1',view:b.view,scenery:b.background,actionSpace:b.space,
  lightingPalette:b.lighting,foreground:b.foreground,sheetId:'pieces',columns:2,rows:b.subjects.length/2,subjects:[...b.subjects]};
 const proposal={presentationStyle:b.style,playerAction:b.instructions,payoff:b.payoff,variation:b.variation,openEnded:false,artDirection,
  design:{consequence:b.payoff,purpose:b.request,world:b.space,mood:b.lighting,controls:b.instructions,feedback:b.foreground,
   recovery:b.recovery,payoffState:'won',interactions:b.interactions},artRequests:[
   {id:b.sceneId,role:'background',sampling:'smooth',prompt:b.space+' '+b.lighting},
   {id:'pieces',role:'actor',sampling:'smooth',prompt:b.foreground+' '+b.subjects.map(s=>s.pose).join(', ')}]};
 const module:GeneratedGame={kind:'generated-module-v2',title:b.title,instructions:b.instructions,source:asset(id+'.game.js').toString(),
  controls:b.interactions.map(i=>i.input as GeneratedGame['controls'][number]),playthrough:[...b.route]};
 return {request:b.request,pairedCase:b.pairedCase,proposal,module,scene:asset(b.background+'.webp'),sheet:asset(id+'-sheet.png')};
}
