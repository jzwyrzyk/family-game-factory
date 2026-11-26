import {drawingPage, saveDrawing, updateDrawing, type DrawingCategory} from '../../src/assets/private-drawings';
import {includeCrayonSource, renderStrokes, paperHeight, paperWidth, type Stroke} from '../../src/drawing/crayon-source';

function stroke(color:string, coordinates:number[][]):Stroke{
  return {color,size:22,points:coordinates.map(([x,y])=>({x,y}))};
}

const ink='#202b39',purple='#6d61ca',green='#7dbc58',gold='#ffb541';
const fixtures:{name:string;category:DrawingCategory;semantic:string;strokes:Stroke[]}[]=[
  {name:'My Rock',category:'prop',semantic:'rock',strokes:[
    stroke(purple,[[249,372],[292,259],[408,172],[536,211],[656,335],[602,393],[415,411],[249,372]]),
    stroke(purple,[[337,321],[410,246],[468,249]]),stroke(ink,[[493,321],[541,317]])]},
  {name:'Clover Cat',category:'character',semantic:'moon cat',strokes:[
    stroke(green,[[278,366],[262,141],[375,224],[485,221],[601,136],[616,346],[541,417],[369,420],[278,366]]),
    stroke(ink,[[368,292],[373,306]]),stroke(ink,[[505,292],[510,306]]),stroke(ink,[[409,349],[441,374],[468,349]])]},
  {name:'Rocket Bus',category:'vehicle',semantic:'flying bus',strokes:[
    stroke(purple,[[177,338],[230,196],[545,200],[656,286],[686,346],[177,338]]),
    stroke(gold,[[237,351],[251,393],[304,401],[330,368],[302,348],[237,351]]),
    stroke(gold,[[526,353],[541,402],[599,398],[620,351],[526,353]])]},
  {name:'My Hill World',category:'world',semantic:'hills',strokes:[
    stroke(green,[[20,371],[168,271],[286,356],[468,188],[620,354],[761,235],[878,309]]),
    stroke(gold,[[685,140],[674,97],[714,76],[756,89],[764,133],[725,154],[685,140]])]},
];

/** Review-only drawings exercise the real PNG and editable-source formats. */
export async function seedCreativeFixtures(){
  const owner='player1';
  const {items}=await drawingPage(owner,{limit:100});
  for(const fixture of fixtures){
    if(items.some(item=>item.name===fixture.name))continue;
    const canvas=document.createElement('canvas');
    canvas.width=paperWidth;canvas.height=paperHeight;
    renderStrokes(canvas.getContext('2d')!,fixture.strokes,true);
    const png=await new Promise<Blob>((ok,no)=>canvas.toBlob(value=>value?ok(value):no(Error('Review picture unavailable.')),'image/png'));
    const picture=await saveDrawing(owner,fixture.name,includeCrayonSource(png,{transparent:true,strokes:fixture.strokes}));
    await updateDrawing(owner,picture.id,{category:fixture.category,semanticIdentity:fixture.semantic});
  }
}
