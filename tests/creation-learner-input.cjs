// Read geometry only. Interactions go through Chromium's mouse, touch and keyboard.
const assert = require('node:assert/strict');

async function inspect(locator) {
  return locator.evaluate(el => {
    const box = el.getBoundingClientRect();
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    let scroller = null;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a), r = a.getBoundingClientRect();
      if (a === document.documentElement || a === document.body) continue;
      if (s.overflowX !== 'visible') {
        left = Math.max(left, r.left + a.clientLeft);
        right = Math.min(right, r.left + a.clientLeft + a.clientWidth);
      }
      if (s.overflowY !== 'visible') {
        top = Math.max(top, r.top + a.clientTop);
        bottom = Math.min(bottom, r.top + a.clientTop + a.clientHeight);
        if (!scroller && /auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight) scroller = a;
      }
    }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const inside = box.left >= left - 1 && box.right <= right + 1 &&
      box.top >= top - 1 && box.bottom <= bottom + 1;
    const hit = [[.5,.5],[.18,.18],[.82,.18],[.18,.82],[.82,.82]].every(([u,v]) =>
      el.contains(document.elementFromPoint(box.x + box.width*u, box.y + box.height*v)));
    const bounds = scroller?.getBoundingClientRect();
    return { x, y, width:box.width, height:box.height, inside, hit, top, bottom,
      swipeX: bounds ? Math.max(8,bounds.left + 12) : innerWidth / 2,
      delta:y - (top + bottom)/2, scrollTop:(scroller || document.scrollingElement).scrollTop };
  });
}

async function inputs(page, touch) {
  const cdp = await page.context().newCDPSession(page);
  async function drag(a, b) {
    if (!touch) {
      await page.mouse.move(a.x,a.y); await page.mouse.down();
      await page.mouse.move(b.x,b.y,{steps:6}); await page.mouse.up();
      return;
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    for (let i=1;i<=6;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
        {x:a.x+(b.x-a.x)*i/6,y:a.y+(b.y-a.y)*i/6}
      ]});
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(90);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  async function reach(locator, scroll=true) {
    await locator.waitFor({state:'attached'});
    let last;
    for (let i=0;i<50;i++) {
      const g=await inspect(locator);
      if (g.inside && g.hit && g.width>=43.5 && g.height>=43.5) return g;
      assert.ok(scroll && g.height && g.width && !g.inside && g.scrollTop!==last,
        'Unreachable '+locator+' '+JSON.stringify(g));
      last=g.scrollTop;
      const span=g.bottom-g.top, distance=Math.sign(g.delta)*Math.min(Math.abs(g.delta)+20,span*.65);
      const y=g.delta>0?g.bottom-span*.15:g.top+span*.15;
      if (touch) await drag({x:g.swipeX,y},{x:g.swipeX,y:y-distance});
      else { await page.mouse.move(g.swipeX,y); await page.mouse.wheel(0,distance); }
      await page.waitForTimeout(100);
    }
    throw Error('Gesture limit reaching '+locator);
  }
  async function tap(locator) {
    const g=await reach(locator);
    assert.ok(await locator.isEnabled(),'Enabled '+locator);
    if (touch) await page.touchscreen.tap(g.x,g.y);
    else await page.mouse.click(g.x,g.y);
  }
  async function set(locator,value) {
    await tap(locator);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(String(value));
    await page.keyboard.press('Tab');
    assert.equal(await locator.inputValue(),String(value));
  }
  async function choose(locator,value) {
    const index=await locator.evaluate((el,v)=>[...el.options].findIndex(o=>o.value===v),value);
    assert.ok(index>=0);
    await tap(locator);
    await page.keyboard.press('Home');
    for(let i=0;i<index;i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await locator.inputValue(),value);
  }
  return {tap,reach,set,choose,drag};
}
module.exports={inputs};
