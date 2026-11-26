import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';
import {generateItem,evaluateAnswer} from '../src/learning/content';
import {SKILLS} from '../src/learning/curriculum';
import {planMathModel} from '../src/learning/workspace/math';
import {quantityPlaces} from '../src/learning/visuals';
import type {MathItem} from '../src/learning/types';

let browser:Browser, bundle:string;
before(async()=>{
  const output=await build({stdin:{contents:"export * from './src/learning/workspace/math';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'MathWorkspace',write:false});
  bundle=output.outputFiles[0].text;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

const fixture=(id:string,seed=0,tier=0)=>generateItem(id,{random:()=>seed,tier,representation:'visual'});
async function mount(item:MathItem, width=390) {
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.setContent('<style>'+readFileSync('src/learning/workspace/math.css','utf8')+'</style><main class="math-activity"></main>');
  await page.addScriptTag({content:bundle});
  await page.evaluate(item=>{
    const w=window as any,api=w.MathWorkspace,ac=new AbortController();
    w.answers=[];w.controller=ac;
    api.mountMathModel(document.querySelector('main'),item,api.planMathModel(item),{submit(value:string){w.answers.push(value);},signal:ac.signal,isLocked(){return ac.signal.aborted;}});
  },item);
  return page;
}
const button=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
async function raw(page:Page){return page.evaluate(()=>(window as any).answers);}
async function clickAt(page:Page,selector:string,x:number,y:number){
  const box=await page.locator(selector).first().boundingBox();assert.ok(box);
  await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
}

test('every generated construction can represent its answer in all seeded grades and tiers',()=>{
  let checked=0;
  for(const skill of SKILLS)for(const tier of [0,1,2])for(const seed of [0,.13,.41,.75,.99999]){
    const item=fixture(skill.id,seed,tier),plan=planMathModel(item);
    assert.deepEqual(planMathModel({...item,answer:'hidden from interface selection'}),plan);
    if(plan?.role!=='answer')continue;
    checked++;
    const answer=String(item.answer), [n,d=1]=answer.split('/').map(Number);
    const accepts=(a:number,b=1)=>evaluateAnswer(item,b===1?String(a):a+'/'+b).correct;
    let reachable=false;
    switch(plan.kind){
      case 'frames': {
        const fixed=item.parameters.operation==='missing-addend'?Number(item.parameters.a):0;
        const cells=item.skillId==='g1-make-ten'||item.skillId==='g1-add-10'?10:20;
        reachable=n>=0&&n<=cells-fixed&&Number.isInteger(n)&&accepts(n);break;
      }
      case 'numberLine': {
        const fraction=item.skillId==='g3-fraction-number';
        const high=fraction?Number(item.parameters.d):item.skillId==='g1-subtract-10'?10:20;
        reachable=Array.from({length:high+1},(_,i)=>accepts(i,fraction?high:1)).some(Boolean);break;
      }
      case 'fractions':{
        if(item.parameters.operation==='equivalent-numerator'){reachable=Number.isInteger(n)&&n<=Number(item.parameters.target)&&n>=0&&accepts(n);break;}
        const wholes=item.skillId==='g4-multiply-fraction'?5:item.skillId==='g4-add-fraction'?2:1;
        for(let parts=1;parts<=12&&!reachable;parts++){
          const shaded=Math.round(n/d*parts);
          reachable=shaded>=0&&shaded<=wholes*parts&&accepts(shaded,parts);
        }break;
      }
      case 'blocks':{
        const places=quantityPlaces(item);
        const smallest=places.at(-1)!;
        const units=Math.round(n/smallest);
        reachable=n>=0 && n<=places.reduce((sum,p)=>sum+p*9,0)+1e-8 && accepts(Number((units*smallest).toFixed(2)));break;
      }
      default:assert.fail('Unexpected answer model '+plan.kind);
    }
    assert.ok(reachable,skill.id+' '+item.question+' requires '+answer);
  }
  assert.ok(checked>200);
});
test('frame edits, moves, zero, undo and submit are distinct actions',async()=>{
  const page=await mount(fixture('g1-add-20'));
  try{
    const check=page.locator('[data-action=check-interaction]');
    assert.equal(await check.isDisabled(),true);
    await page.locator('[data-place-at="0"]').click();
    const from=await page.locator('[data-place-at="0"]').boundingBox(),to=await page.locator('[data-place-at="11"]').boundingBox();
    assert.ok(from&&to);
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
    await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:6});await page.mouse.up();
    assert.equal(await page.locator('[data-place-at="11"]').getAttribute('aria-pressed'),'true');
    await button(page,'Undo').click();assert.equal(await page.locator('[data-place-at="0"]').getAttribute('aria-pressed'),'true');
    await button(page,'Move a counter').click();await page.locator('[data-place-at="0"]').click();await page.locator('[data-place-at="8"]').click();
    assert.equal(await page.locator('[data-place-at="8"]').getAttribute('aria-pressed'),'true');
    await check.click();assert.deepEqual(await raw(page),['1']);
    await button(page,'Start over').click();assert.equal(await check.isDisabled(),true);
    await button(page,'Choose zero').click();await check.click();assert.deepEqual(await raw(page),['1','0']);
  }finally{await page.close();}
});
test('grouping ten and splitting one preserve place value',async()=>{
  const page=await mount(fixture('g2-hundreds'));
  try{
    const ones=page.locator('[data-place="1"]'),out=page.locator('.math-built-number');
    for(let i=0;i<10;i++)await ones.click();
    await page.locator('.model-column').filter({has:ones}).getByRole('button',{name:'Group 10'}).click();
    assert.equal(await out.textContent(),'10');assert.equal(await page.locator('.model-built-block').count(),1);
    await page.locator('.model-column').filter({has:page.locator('[data-place="10"]')}).getByRole('button',{name:'Split one'}).click();
    assert.equal(await out.textContent(),'10');assert.equal(await page.locator('.model-built-block').count(),10);
    await button(page,'Start over').click();assert.equal(await out.textContent(),'0');
  }finally{await page.close();}
});
test('fraction sectors, improper fractions and mixed-number equivalence',async()=>{
  const page=await mount(fixture('g4-add-fraction'));
  try{
    await button(page,'Use a circle').click();await clickAt(page,'.model-disc svg',.8,.5);
    assert.equal(await page.locator('.math-built-number').textContent(),'1/2');
    await button(page,'Increase Whole').click();await clickAt(page,'.model-disc svg',.8,.5);
    assert.equal(await page.locator('.math-built-number').textContent(),'3/2');
    await page.locator('[data-action=check-interaction]').click();assert.deepEqual(await raw(page),['3/2']);
    await button(page,'Undo').click();assert.equal(await page.locator('.math-built-number').textContent(),'1/2');
  }finally{await page.close();}
});
test('number line accepts keyboard steps and preserves chosen fraction positions',async()=>{
  const page=await mount(fixture('g3-fraction-number'));
  try{
    const slider=page.getByRole('slider');await slider.focus();await page.keyboard.press('ArrowRight');
    assert.equal(await slider.getAttribute('aria-valuetext'),'1/2');
    await page.locator('[data-action=check-interaction]').click();assert.deepEqual(await raw(page),['1/2']);
    await button(page,'Undo').click();assert.equal(await slider.getAttribute('aria-valuetext'),'0');
    await clickAt(page,'.model-line svg',.96,.7);
    assert.equal(await slider.getAttribute('aria-valuetext'),'1');
  }finally{await page.close();}
});
test('array size is directly adjustable without submitting a product',async()=>{
  const page=await mount(fixture('g3-multiply'),320);
  try{
    await clickAt(page,'.model-array svg',.625,.29);
    assert.equal(await page.locator('.model-array').getAttribute('aria-label'),'4 rows, 8 columns');
    await button(page,'Increase Rows').click();assert.equal(await page.locator('.model-array').getAttribute('aria-label'),'5 rows, 8 columns');
    assert.deepEqual(await raw(page),[]);assert.equal(await page.locator('[data-action=check-interaction]').count(),0);
  }finally{await page.close();}
});
test('clock hands, rulers, coins, angle rays, plots and triangle composition respond to pointer input',async()=>{
  const clock=await mount(fixture('g1-time'));
  try{
    await button(clock,'Forward one minute').click();
    assert.match(await clock.locator('svg').getAttribute('aria-label')||'',/1 small tick/);
    await button(clock,'Hour hand').click();await button(clock,'Forward one hour').click();
    assert.match(await clock.locator('svg').getAttribute('aria-label')||'',/between 1 and 2/);
  }finally{await clock.close();}
  const ruler=await mount(fixture('g2-length'));
  try{
    await clickAt(ruler,'.model-ruler svg',.5,.8);assert.equal(await button(ruler,'Marker 1 · 5 cm').count(),1);
    await button(ruler,'Next 10 cm').click();await clickAt(ruler,'.model-ruler svg',.5,.8);assert.equal(await button(ruler,'Marker 1 · 15 cm').count(),1);
  }finally{await ruler.close();}
  const money=await mount(fixture('g2-money'));
  try{
    await button(money,'Add a dime, 10¢').click();await button(money,'Remove a dime').click();assert.equal(await money.locator('.model-coin-small').count(),0);
    assert.deepEqual(await raw(money),[]);
  }finally{await money.close();}
  const angle=await mount(fixture('g4-angles'));
  try{
    await clickAt(angle,'.math-visual svg',115/360,.1);
    assert.equal(await angle.locator('.model-step-value').textContent(),'90');
  }finally{await angle.close();}
  for(const id of ['g4-data','g1-data']){
    const page=await mount(fixture(id));try{
      const mark=page.locator('.model-observation,.model-chart-bar').first();
      await mark.click();assert.equal(await mark.getAttribute('aria-pressed'),'true');
      await button(page,'Undo').click();assert.equal(await mark.getAttribute('aria-pressed'),'false');
    }finally{await page.close();}
  }
  const triangle=await mount(fixture('k-compose'));
  try{
    await button(triangle,'Turn').click();await clickAt(triangle,'.model-compose svg',.45,.8);
    assert.equal(await triangle.locator('polygon').first().getAttribute('transform'),'translate(100 100) rotate(90 50 50)');
    assert.deepEqual(await raw(triangle),[]);
  }finally{await triangle.close();}
});

test('moving a counter between groups preserves the given number on an even/odd task',async()=>{
  const page=await mount(fixture('g2-even-odd',.7));
  try{
    const all=page.locator('.model-group-tray [data-piece]');
    const before=await all.count();
    await all.first().click();
    assert.equal(await all.count(),before);
    assert.equal(await page.locator('.model-group-column').nth(1).locator('[data-piece]').count(),1);
    await button(page,'Undo').click();
    assert.equal(await page.locator('.model-group-column').nth(1).locator('.model-empty').textContent(),'Empty');
  }finally{await page.close();}
});
