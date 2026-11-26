import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {learningTheme} from '../src/learning/workspace/theme';
import {generateItem} from '../src/learning/content';

test('trusted game IDs resolve local counter artwork and unknown IDs share one fallback', () => {
  for (const id of ['mining','factory','gum','dragon','moon']) {
    const theme = learningTheme(id);
    assert.equal(theme.id,id);
    assert.equal(Object.isFrozen(theme),true);
    assert.match(theme.counter,/^(learning-counters|early-pictures)\/[a-z_]+\.webp$/);
    assert.ok(existsSync('public/'+theme.counter));
  }
  for (const unknown of ['generated','creation','__proto__','constructor','https://invalid.example/new.webp','']) {
    assert.equal(learningTheme(unknown),learningTheme());
  }
});

test('themed counting, unchanged named stimuli and owner-bound Pal reactions in a real browser', async () => {
  const output = await build({stdin:{resolveDir:process.cwd(),contents:`
    export * from './src/learning/early/render';
    export * from './src/learning/workspace/theme';
    export {createPalPortrait, retirePortrait} from './src/pals/ui';
    export {open as openFamilyPractice} from './src/family-beta/learning';
  `},bundle:true,format:'iife',globalName:'WorkspaceTest',outdir:'out',write:false});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),args:['--no-sandbox']});
  try {
    const page=await browser.newPage();
    await page.route('http://workspace.test/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/')await route.fulfill({contentType:'text/html',body:'<main></main><aside></aside><button id="help">Help</button>'});
      else if(existsSync('public'+path))await route.fulfill({path:'public'+path});
      else await route.fulfill({status:404});
    });
    await page.goto('http://workspace.test');
    await page.addScriptTag({content:output.outputFiles.find(f=>f.path.endsWith('.js'))!.text});
    const count=generateItem('pk-touch',{random:()=>0.4});
    await page.evaluate(item=>{
      const w=window as any;
      w.WorkspaceTest.mountEarlyMath(document.querySelector('main'),item,(v:string)=>{w.answer=v;},'dragon');
    },count);
    const pictures=page.locator('main .early-counter img');
    assert.equal(await pictures.count(),Number(count.parameters.n));
    for(const tile of await page.locator('.early-counter button').all())await tile.click();
    await page.getByRole('button',{name:'Check my group'}).click();
    assert.equal(await page.evaluate(()=>(window as any).answer),count.answer);
    assert.deepEqual(new Set(await pictures.evaluateAll(xs=>xs.map(x=>(x as HTMLImageElement).alt))),new Set(['flower']));
    const item=generateItem('k-classify',{random:()=>0.25});
    await page.evaluate(item=>{
      const host=document.querySelector('main')!;
      host.replaceChildren();
      (window as any).WorkspaceTest.mountEarlyMath(host,item,()=>{},'mining');
    },item);
    const apples=page.locator('main .early-scene img[alt="apple"]');
    assert.equal(await apples.count(),Number(item.answer));
    assert.equal(await page.locator('main .early-scene img[alt="pear"]').count(),Number(item.parameters.b));

    await page.evaluate(()=>{
      const w=window as any,api=w.WorkspaceTest;
      w.select=(owner:string,encouragement:boolean)=>{
        api.presentWorkspaceCompanion({owner,id:'navi',stage:2,encouragement,portrait(expression:string){
          const element=api.createPalPortrait('navi',2,'',expression,true);
          return {element,dispose(){api.retirePortrait(element);}};
        }});
      };
      w.pal=api.mountWorkspacePal(document.querySelector('aside'),'owner-a',document.querySelector('#help'));
      w.select('owner-b',true);
    });
    const portrait=page.locator('aside .pals-portrait');
    assert.equal(await portrait.count(),0);
    await page.evaluate(()=>(window as any).select('owner-a',true));
    await page.locator('aside [data-state=ready]').waitFor();
    assert.equal(await portrait.getAttribute('data-form'),'mature');
    assert.equal(await page.locator('button[data-pal-hint=navi]').count(),1);
    for(const [state,expression] of [['hint','thinking'],['incorrect','encouraging_retry'],['correct','celebrate']]){
      await page.evaluate(value=>(window as any).pal.setState(value),state);
      await page.locator('aside [data-state=ready]').waitFor();
      assert.equal(await portrait.getAttribute('data-expression'),expression);
      assert.equal(await portrait.locator('img').getAttribute('alt'),'');
    }
    await page.evaluate(()=>(window as any).select('owner-a',false));
    assert.equal(await portrait.getAttribute('data-expression'),'neutral');
    await page.evaluate(()=>(window as any).select('owner-b',true));
    assert.equal(await portrait.count(),0);
    assert.equal(await page.locator('[data-pal-hint]').count(),0);
    await page.evaluate(()=>{
      const w=window as any;w.pal.dispose(); w.select('owner-a',true);w.pal.setState('correct');
    });
    assert.equal(await portrait.count(),0);

    const familyProfile={id:'fixture',grade:2,skills:{}};
    for (const subject of ['math','language']) {
      await page.evaluate(profile=>{
        const w=window as any,main=document.querySelector('main')!;
        main.replaceChildren();
        w.FG={store:{current(){return profile;},save(){return true;}}};
        w.disposeFamilyPractice=w.WorkspaceTest.openFamilyPractice(main,()=>{
          w.disposeFamilyPractice();main.replaceChildren();
        });
        w.fixtureProfile=profile;
      },familyProfile);
      await page.getByRole('button',{name:subject==='math'?'Practice math':'Practice English'}).click();
      await page.getByRole('button',{name:'Back to activities'}).click();
      const outcome=await page.evaluate(key=>{
        const profile=(window as any).fixtureProfile;
        return profile[key].attempts.at(-1).outcome;
      },subject==='math'?'learning':'language');
      assert.equal(outcome,'interrupted');
    }
  } finally { await browser.close(); }
});
