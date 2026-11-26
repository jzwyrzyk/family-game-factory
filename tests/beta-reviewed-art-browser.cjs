// Only synthetic pixels and a local, digest-only review fixture.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {build} = require('esbuild');
const {chromium} = require('playwright');

(async () => {
  const module = await build({
    stdin: {contents: "import './src/family-beta/artwork'; export {drawings} from './src/assets/private-drawings';", resolveDir: process.cwd()},
    define: {'import.meta.env.MODE': '"test"'}, bundle: true, write: false, format: 'iife', globalName: 'reviewedArt',
  });
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
  try {
    const page = await browser.newPage();
    const origin = 'https://synthetic.test';
    let approved = '', changeOwner = false, reviewCount = 0;
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, origin);
      if (url.pathname === '/') {
        await route.fulfill({contentType:'text/html', body:'<input id="reviewedArtPassphrase"><input type="file" id="betaReviewedArt"><p id="familyExitStatus"></p><script>let owner="player1"; window.FG={store:{current:()=>({id:owner})}};</script>'});
      } else if (url.pathname === '/v1/devices/unlock') {
        await route.fulfill({status:200});
      } else {
        assert.equal(url.pathname, '/entry/review-art');
        const payload = request.postDataJSON();
        assert.deepEqual(Object.keys(payload), ['digest']);
        reviewCount++;
        if (changeOwner) await page.evaluate(() => { owner = 'player2'; });
        await route.fulfill({status: payload.digest === approved ? 200 : 403});
      }
    });
    await page.goto(origin);
    await page.addScriptTag({content:module.outputFiles[0].text});
    const bytes = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const context = canvas.getContext('2d');
      context.fillStyle = '#582d78'; context.fillRect(8,9,32,18);
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }));
    const file = page.locator('#betaReviewedArt');
    const choose = buffer => file.setInputFiles({name:'private-filename.png',mimeType:'image/png',buffer});
    const rows = profile => page.evaluate(async profile =>
      (await reviewedArt.drawings(profile)).map(item => ({name:item.name,hash:item.sha256,bytes:Array.from(new Uint8Array(item.bytes))})),profile);
    await choose(bytes);
    await page.getByText('Unlock Grown-ups and confirm', {exact:false}).waitFor();
    assert.equal((await rows('player1')).length,0);
    approved = createHash('sha256').update(bytes).digest('hex');
    await choose(bytes);
    await page.getByText('Your reviewed drawing is ready.').waitFor();
    assert.deepEqual(await rows('player1'), [{name:'Reviewed workshop artwork',hash:approved,bytes:[...bytes]}]);
    await choose(Buffer.concat([bytes,Buffer.from('trailing file details')]));
    await page.getByText('Choose a reviewed PNG without extra file data.').waitFor();
    assert.equal(reviewCount,2);
    changeOwner = true;
    await choose(bytes);
    await page.waitForFunction(() => owner === 'player2' && document.querySelector('#betaReviewedArt').value === '');
    assert.deepEqual(await rows('player2'),[]);
    assert.equal((await rows('player1')).length,1);
    console.log('Reviewed family import passed exact bytes, digest-only review, metadata rejection and concurrent profile change.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
