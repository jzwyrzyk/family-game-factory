import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {generateItem} from '../src/learning/content';
import {planMathModel} from '../src/learning/workspace/math';
import {polygonVertices} from '../src/learning/workspace/math-geometry-points';

test('polygon representations have the assessed sides, parallel pairs and reflection axes', () => {
  for(const skillId of ['g1-shapes','g2-shapes','g3-shapes','g4-shapes','g4-symmetry']) {
    for(let seed=0;seed<30;seed++) {
      const item=generateItem(skillId,{random:()=>seed/30});
      assert.deepEqual(planMathModel(item),{kind:'shapes',role:'explore'});
      const name = String(item.parameters.shape);
      if(name==='cube')continue;
      const spec=item.visual?.kind==='shape'?item.visual:undefined;
      const v=polygonVertices(name,spec?.width,spec?.height);
      assert.ok(v.length>=3);
      if(item.parameters.operation==='shape-count')assert.equal(v.length,item.answer);
      if(item.parameters.operation==='parallel-pairs') {
        const directions=v.map(([x,y],i)=>[v[(i+1)%v.length][0]-x,v[(i+1)%v.length][1]-y]);
        let pairs=0;
        directions.forEach(([x,y],i)=>directions.slice(i+1).forEach(([xx,yy])=>{if(Math.abs(x*yy-y*xx)<0.001)pairs++;}));
        assert.equal(pairs,item.answer);
      }
      if(item.parameters.operation==='symmetry') {
        const cx=v.reduce((n,p)=>n+p[0],0)/v.length, cy=v.reduce((n,p)=>n+p[1],0)/v.length;
        const centered=v.map(([x,y])=>[x-cx,y-cy]);
        let axes=0;
        for(let angle=0;angle<180;angle+=15) {
          const c=Math.cos(2*angle*Math.PI/180),s=Math.sin(2*angle*Math.PI/180);
          if(centered.every(([x,y])=>centered.some(([xx,yy])=>Math.hypot(xx-(c*x+s*y),yy-(s*x-c*y))<.001)))axes++;
        }
        assert.equal(axes,item.answer);
      }
    }
  }
});

test('shape marks, hidden cube faces and trial folds remain local until the child answers', async () => {
  const out=await build({entryPoints:['src/learning/activity.ts'],write:false,bundle:true,format:'iife',globalName:'MathTest',platform:'browser'});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await page.setContent('<base href="http://jems.test/"><main></main>');
    await page.route('http://jems.test/**',route=>route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
    await page.addScriptTag({content:out.outputFiles[0].text});
    async function mount(skill: string, random: number) {
      const item=generateItem(skill,{random:()=>random});
      await page.evaluate(item=>{
        const app=window as any;
        app.activity?.dispose();
        app.profile={id:'geometry-fixture',grade:4,skills:{}};
        app.activity=app.MathTest.mountMathActivity(document.querySelector('main'),{profile:app.profile,item,mode:'interaction',onSave(){},onComplete(){}});
      },item);
      return item;
    }
    const model=page.locator('[data-model="shapes"]');
    const button=(name:string)=>model.getByRole('button',{name,exact:true});
    await mount('g1-shapes',0);
    assert.equal(await button('Mark side').getAttribute('aria-pressed'),'false');
    await button('Mark side').focus();
    await page.keyboard.press('Space');
    assert.equal(await button('Unmark side').getAttribute('aria-pressed'),'true');
    await button('Next side').tap();
    assert.equal(await button('Mark side').getAttribute('aria-pressed'),'false');
    await button('Corners').tap();
    await model.locator('[data-shape-part="2"]').tap();
    assert.equal(await button('Unmark corner').getAttribute('aria-pressed'),'true');
    await button('Start over').tap();
    assert.equal(await button('Mark side').getAttribute('aria-pressed'),'false');

    const cube=await mount('g2-shapes',.99);
    assert.equal(cube.parameters.shape,'cube');
    const front=model.locator('[data-face="0"]');
    await front.tap();
    await button('Turn right').tap();
    assert.equal(await front.count(),0);
    await button('Turn left').tap();
    assert.equal(await button('Unmark front face').getAttribute('aria-pressed'),'true');
    await button('Tip up').tap();
    assert.equal(await button('Mark front face').getAttribute('aria-pressed'),'false');

    await mount('g4-symmetry',.9);
    assert.equal(await model.locator('[data-trial-line]').count(),0);
    await button('Place a line').tap();
    await button('Turn right').tap();
    await button('Keep this line').tap();
    await button('Turn left').tap();
    assert.equal(await model.locator('[data-trial-line="30"]').count(),1);
    assert.equal(await model.locator('[data-trial-line="15"]').count(),1);
    assert.deepEqual(await page.evaluate(()=>{const a=(window as any).profile.learning.attempts[0];return {answers:a.answers.length,hints:a.hintLevel};}),{answers:0,hints:0});
    await button('Start over').tap();
    assert.equal(await model.locator('[data-trial-line]').count(),0);
  } finally {await browser.close();}
});
