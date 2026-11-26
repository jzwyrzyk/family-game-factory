/* Isolated, synthetic regression diagnosis for WebKit's fitted Rally controls. */
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const file = path.resolve('tests/studio-native-ui.cjs');
const localRequire = createRequire(file);
const original = '27c2868957d8477326036b36d6138b094a24e6a7';
const baseline = process.env.RALLY_INPUT === 'locator';
let source = baseline ? execFileSync('git', ['show', original + ':tests/studio-native-ui.cjs'], {encoding:'utf8'}) : fs.readFileSync(file, 'utf8');
async function trace(page, selector, phase) {
  const control = page.locator(selector);
  const inspect = async step => {
    const data = await control.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width/2, y = rect.top + rect.height/2;
      const hit = document.elementFromPoint(x,y);
      const parents = [];
      for (let p = element; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (p.scrollHeight > p.clientHeight + 1 || style.position === 'fixed')
          parents.push({id:p.id||p.tagName, y:p.scrollTop, scrollHeight:p.scrollHeight, height:p.clientHeight, overflow:style.overflowY, behavior:style.scrollBehavior});
      }
      return {x,y,width:rect.width,height:rect.height,hit:!!hit&&element.contains(hit),hitId:hit?.id||hit?.tagName,
        scrollY, visualHeight:visualViewport?.height, active:document.activeElement?.id, parents};
    });
    console.log('RALLY_POINT '+JSON.stringify({phase,selector,step,which:process.env.RALLY_INPUT,authority:process.env.STUDIO_NOTEBOOK,viewport:page.viewportSize(),...data}));
  };
  await inspect('before');
  const interval = setInterval(()=>void inspect('pending').catch(()=>{}),4000);
  try{
    if (baseline) await control.click();
    else await localRequire('./studio-fitted-input.cjs').clickFittedControl(page, selector);
  } catch(e) {await inspect('failed').catch(()=>{});throw e;} finally {clearInterval(interval);}
}
const phase = "(typeof phase==='undefined'?'pending change':phase)";
if (baseline) {
  source=source.replaceAll("await page.click('#studioChange')", "await trace(page,'#studioChange',"+phase+")")
    .replaceAll("await page.locator('.quality-hill summary').click()", "await trace(page,'.quality-hill summary',"+phase+")");
} else {
  source=source.replaceAll("await clickFittedControl(page,'#studioChange')", "await trace(page,'#studioChange',"+phase+")")
    .replaceAll("await clickFittedControl(page,'.quality-hill summary')", "await trace(page,'.quality-hill summary',"+phase+")");
}
new Function('require','trace',source)(localRequire,trace);
