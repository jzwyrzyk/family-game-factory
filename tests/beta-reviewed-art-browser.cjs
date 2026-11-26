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
    let approved = '', changeOwner = false, swapDuringUnlock = false, reviewCount = 0, unlockCount = 0;
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, origin);
      if (url.pathname === '/') {
        await route.fulfill({contentType:'text/html', body:'<input type="checkbox" id="prepareReviewedArt"><input id="reviewedArtPassphrase"><input type="file" id="betaReviewedArt"><p id="familyExitStatus"></p><script>let owner="player1"; window.FG={store:{current:()=>({id:owner})}};</script>'});
      } else if (url.pathname === '/v1/devices/unlock') {
        unlockCount++;
        if (swapDuringUnlock) await page.evaluate(()=>{
          owner='player2';window.dispatchEvent(new Event('factory-profile'));
          owner='player1';window.dispatchEvent(new Event('factory-profile'));
        });
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
    await page.getByText('Ask the operator to review and approve', {exact:false}).waitFor();
    assert.equal((await rows('player1')).length,0);
    approved = createHash('sha256').update(bytes).digest('hex');
    await choose(bytes);
    await page.getByText('Your reviewed drawing is ready.').waitFor();
    assert.deepEqual(await rows('player1'), [{name:'Reviewed workshop artwork',hash:approved,bytes:[...bytes]}]);
    await choose(Buffer.concat([bytes,Buffer.from('trailing file details')]));
    await page.getByText('Ask a grown-up for a reviewed PNG saved without extra file information.').waitFor();
    assert.equal(reviewCount,2);
    // Use a previously unapproved byte identity for the copy. Its transparent
    // canvas pixels and the compressed stream remain unchanged after stripping.
    const chunk = (kind, payload) => {
      const result = Buffer.alloc(12 + payload.length);
      result.writeUInt32BE(payload.length);
      result.write(kind,4); payload.copy(result,8);
      result.writeUInt32BE(require('node:zlib').crc32(result.subarray(4,-4)),result.length-4);
      return result;
    };
    const end = bytes.length - 12;
    const cleanCopy = Buffer.concat([bytes.subarray(0,end),chunk('IDAT',Buffer.alloc(0)),bytes.subarray(end)]);
    const index = cleanCopy.indexOf('IDAT') - 4;
    const suggested = Buffer.concat([cleanCopy.subarray(0,index),chunk('PLTE',Buffer.from([24,112,243])),cleanCopy.subarray(index)]);
    approved = createHash('sha256').update(suggested).digest('hex');
    await choose(suggested);
    const link = page.getByRole('link',{name:'Download image-only PNG for separate review'});
    await link.waitFor();
    const prepared = await link.evaluate(async el => [...new Uint8Array(await (await fetch(el.href)).arrayBuffer())]);
    assert.deepEqual(prepared,[...cleanCopy]);
    assert.equal(reviewCount,2);
    assert.equal((await rows('player1')).length,1);
    await choose(Buffer.from(prepared));
    await page.getByText('Ask the operator to review and approve', {exact:false}).waitFor();
    assert.equal((await rows('player1')).length,1);
    approved = createHash('sha256').update(cleanCopy).digest('hex');
    await choose(cleanCopy);
    await page.getByText('Your reviewed drawing is ready.').waitFor();
    assert.ok((await rows('player1')).some(draw => draw.hash === approved && Buffer.from(draw.bytes).equals(cleanCopy)));
    assert.equal(unlockCount,4,'metadata and unused palettes stop locally before guardian unlock');
    const counts={unlock:unlockCount,review:reviewCount};
    await page.evaluate(()=>{
      const read=File.prototype.arrayBuffer;
      window.readResumed=false;
      File.prototype.arrayBuffer=async function(){
        File.prototype.arrayBuffer=read;
        owner='player2';window.dispatchEvent(new Event('factory-profile'));
        owner='player1';window.dispatchEvent(new Event('factory-profile'));
        const result=await read.call(this);window.readResumed=true;return result;
      };
    });
    await choose(bytes);
    await page.waitForFunction(()=>window.readResumed);
    swapDuringUnlock=true;
    await choose(bytes);
    await page.waitForFunction(()=>document.getElementById('betaReviewedArt').disabled===false);
    swapDuringUnlock=false;
    assert.equal(unlockCount,counts.unlock+1,'the invalidated file read cannot unlock');
    assert.equal(reviewCount,counts.review,'a changed-then-restored profile invalidates both pending selections');
    assert.equal((await rows('player1')).length,2);
    let preparationInput=bytes;
    for (let pass=0; pass<2; pass++) {
      approved=createHash('sha256').update(preparationInput).digest('hex');
      await page.locator('#prepareReviewedArt').check();
      await choose(preparationInput);
      const link=page.getByRole('link',{name:'Download prepared PNG'});
      await link.waitFor();
      const output=Buffer.from(await link.evaluate(async a=>Array.from(new Uint8Array(await (await fetch(a.href)).arrayBuffer()))));
      assert.notEqual(createHash('sha256').update(output).digest('hex'),approved);
      const imageData=buffer=>{
        const parts=[];
        for(let at=8;at<buffer.length;){
          const length=buffer.readUInt32BE(at);
          if(buffer.toString('ascii',at+4,at+8)==='IDAT')parts.push(buffer.subarray(at+8,at+8+length));
          at+=length+12;
        }
        return require('node:zlib').inflateSync(Buffer.concat(parts));
      };
      assert.deepEqual(imageData(output),imageData(bytes));
      assert.equal((await rows('player1')).length,2);
      await choose(output);
      await page.getByText('Ask the operator to review and approve', {exact:false}).waitFor();
      assert.equal((await rows('player1')).length,2);
      preparationInput=output;
    }
    changeOwner = true;
    await choose(bytes);
    await page.waitForFunction(() => owner === 'player2' && document.querySelector('#betaReviewedArt').value === '');
    assert.deepEqual(await rows('player2'),[]);
    assert.equal((await rows('player1')).length,2);
    console.log('Reviewed family import passed exact bytes, digest-only review, metadata rejection and concurrent profile change.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
