/* Production-only child-facing browser smoke: no authenticated requests or paid AI.
 * Executed AFTER a Pages-only deployment, against the real published public URL.
 * Must never be used as evidence of provider activation or child UAT.
 */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function siteUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || !url.pathname.endsWith('/') ||
      url.hostname === 'localhost' || url.hostname.startsWith('127.')) {
    throw Error('Expected a canonical deployed HTTPS Pages site base URL');
  }
  return url.href;
}

async function main() {
  if (process.argv.length !== 3) throw Error('Usage: node tests/release-live-browser.cjs HTTPS_SITE_BASE/');
  const site = siteUrl(process.argv[2]);
  const output = 'release-evidence';
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const evidence = {version:1,siteBase:site,kind:'public-browser-smoke',
    tested:[], paidRequestsStarted:0, realProviderInferenceTested:false,
    parentDeviceUAT:false, releaseSuccess:false};
  try {
    for (const [device,viewport] of [
      ['desktop',{width:1280,height:900}],
      ['mobile',{width:390,height:844}],
    ]) {
      const context = await browser.newContext({
        viewport, hasTouch:device==='mobile', reducedMotion:'reduce'
      });
      const page = await context.newPage();
      const pageErrors=[], failedAssets=[], forbiddenRequests=[];
      page.setDefaultTimeout(16000);
      page.on('pageerror',error=>pageErrors.push(error.message));
      page.on('response',response=>{
        const request = response.request();
        const url = new URL(response.url());
        // A deployed site with a missing same-origin script/style/image is not healthy.
        if (url.origin === new URL(site).origin && response.status() >= 400 &&
            ['script','stylesheet','image','font','document'].includes(request.resourceType())) {
          failedAssets.push({status:response.status(),path:url.pathname,kind:request.resourceType()});
        }
      });
      // Fail closed if a future Studio change accidentally tries paid work
      // during an unauthenticated, read-only production smoke.
      await page.route('**/*',route=>{
        const request = route.request(),url=new URL(request.url());
        if (request.method()==='POST' && /^\/v1\/(?:jobs|coach)(?:\/|$)/.test(url.pathname)) {
          forbiddenRequests.push(url.pathname);
          return route.abort();
        }
        return route.continue();
      });
      try {
        const response = await page.goto(site,{waitUntil:'domcontentloaded',timeout:25000});
        assert.equal(response?.status(),200,'production root must load successfully');
        await page.waitForFunction(()=>Boolean(window.FG?.studio && window.FG?.learning),null,{timeout:20000});
        assert.equal(await page.locator('#page-studio-library').isVisible(),true,
          'the published homepage must render Jems Studio');
        assert.equal(await page.locator('#studioStarters [data-starter]').count(),6,
          'all six Factory Favorites must be present');
        assert.equal((await page.locator('#studioStarterTitle').textContent()).trim(),
          'Ready to Play jems');
        assert.equal((await page.locator('#studioLibraryTitle').textContent()).replace(/\s+/g,' ').trim(),
          'What jems will you make today?');
        assert.equal(await page.locator('img.jems-brand-logo').evaluate(node=>node.complete&&node.naturalWidth>0),
          true,'approved Jems logo must load');
        // Exercise a local native favorite, without submitting a build/coach POST.
        await page.locator('[data-starter="moon"]').click();
        await page.locator('.favorite-moon .favorite-canvas').waitFor({state:'visible'});
        assert.equal(await page.locator('#page-studio').isVisible(),true);
        await page.screenshot({path:path.join(output,'live-'+device+'.png'),fullPage:true});
        assert.deepEqual(forbiddenRequests,[],'the production smoke must not start paid operations');
        assert.deepEqual(failedAssets,[],'production site has missing public assets');
        assert.deepEqual(pageErrors,[],'published Jems runtime threw an uncaught error');
        evidence.tested.push({device,homepage:true,sixFavorites:true,logo:true,localGame:true,
          uncaughtPageErrors:0,failedPublicAssets:0});
      } finally {
        await context.close();
      }
    }
    evidence.releaseSuccess=true;
    fs.writeFileSync(path.join(output,'live-browser-smoke.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log('PASS deployed Jems desktop/mobile homepage, six favorites, brand assets and local Moon game; no paid AI calls');
  } finally {
    await browser.close();
  }
}
main().catch(error=>{
  // URLs may be private setup context; avoid printing browser trace or secrets.
  console.error('BLOCKED: production Jems browser smoke failed:',error instanceof Error?error.message:'unknown error');
  process.exitCode=1;
});
