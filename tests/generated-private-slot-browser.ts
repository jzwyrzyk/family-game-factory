import {strict as assert} from 'node:assert';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import {chromium} from 'playwright';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {illustratedGame, compileArtFixture} from './generated-art-fixtures';
import {copyCommands} from '../server/sandbox/frame-v2';
import type * as SlotTools from '../tools/qualification/private-art-slot';

declare global {interface Window {SlotTools: typeof SlotTools}}

async function main() {
  const game = compileArtFixture(illustratedGame());
  const artifact = renderGeneratedV2(game,'slot-fixture','slot-channel',{auditTicks:600});
  const script = buildSync({entryPoints:['tools/qualification/private-art-slot.ts'],bundle:true,write:false,globalName:'SlotTools',format:'iife'}).outputFiles[0].text;
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.route('http://localhost/qualification',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="host" width="720" height="400"></canvas><iframe sandbox="allow-scripts" title="Generated fixture"></iframe>'}));
    // tsx preserves function names when serializing the fixture callback for Playwright.
    await page.addInitScript('globalThis.__name = value => value;');
    await page.goto('http://localhost/qualification');
    let requests = 0; page.on('request',()=>requests++);
    await page.addScriptTag({content:script});
    await page.locator('iframe').evaluate((frame,html)=>{(frame as HTMLIFrameElement).srcdoc=html;},artifact.html);
    const frame = page.frameLocator('iframe');
    await frame.locator('#game[data-assets-ready="true"]').waitFor();
    await frame.locator('#start').click();
    await frame.locator('#game[data-snapshot]').waitFor();
    const imageCommand = async () => copyCommands(JSON.parse(await frame.locator('#game').getAttribute('data-snapshot') || '[]'),new Set(['workshop','helper'])).find(command=>command.assetId==='helper')!;
    const initial = await imageCommand();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.up('ArrowRight');
    const next = await imageCommand();
    assert.ok(next.x > initial.x+5);
    const received = await page.evaluate(async ({cmd,artifactHash,background}) => {
      const png = document.createElement('canvas'); png.width=96; png.height=64;
      const pen=png.getContext('2d')!;
      pen.fillStyle='#35af72';pen.strokeStyle='#28383b';pen.lineWidth=3;pen.lineJoin='round';
      pen.beginPath();pen.moveTo(3,53);pen.lineTo(11,40);pen.lineTo(17,29);pen.lineTo(31,16);pen.lineTo(42,17);
      pen.lineTo(52,9);pen.lineTo(69,18);pen.lineTo(78,33);pen.lineTo(91,48);pen.lineTo(88,57);
      pen.lineTo(67,54);pen.lineTo(50,59);pen.lineTo(24,55);pen.closePath();pen.fill();pen.stroke();
      pen.fillStyle='#28383b';pen.beginPath();pen.arc(32,31,2,0,Math.PI*2);pen.arc(65,31,2,0,Math.PI*2);pen.fill();
      pen.beginPath();pen.moveTo(40,39);pen.quadraticCurveTo(46,46,54,39);pen.stroke();
      const bytes=await (await new Promise<Blob>(resolve=>png.toBlob(blob=>resolve(blob!),'image/png'))).arrayBuffer();
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      const session={family:'test-family',owner:'test-maker',artifactHash,gameRevision:'local-v2-fixture',artAllowed:true};
      let mounted: typeof session | null=session;
      const current=()=>mounted;
      const selected={owner:session.owner,family:session.family,revision:'synthetic-v1',sha256,bytes};
      const slot={id:'helper',artifactHash,gameRevision:session.gameRevision};
      const pin={slotId:slot.id,revision:selected.revision,sha256};
      const {qualifyPrivateSprite}=window.SlotTools;
      const rejects=async(fn:()=>Promise<unknown>|unknown)=>{try{await fn();return false;}catch{return true;}};
      const denials=await Promise.all([
        rejects(()=>qualifyPrivateSprite(current,slot,pin,{...selected,owner:'different-maker'})),
        rejects(()=>qualifyPrivateSprite(current,slot,pin,{...selected,family:'other-family'})),
        rejects(()=>qualifyPrivateSprite(current,{...slot,gameRevision:'old-version'},pin,selected)),
        rejects(()=>qualifyPrivateSprite(current,{...slot,artifactHash:'3'.repeat(64)},pin,selected)),
        rejects(()=>qualifyPrivateSprite(current,slot,pin,{...selected,revision:'newer-same-pixels'})),
        rejects(()=>qualifyPrivateSprite(current,slot,{...pin,slotId:'differentSlot'},selected)),
        rejects(()=>qualifyPrivateSprite(current,slot,{...pin,sha256:'0'.repeat(64)},{...selected,sha256:'0'.repeat(64)})),
        rejects(()=>qualifyPrivateSprite(()=>({...session,artAllowed:false}),slot,pin,selected))
      ]);
      const context=document.querySelector<HTMLCanvasElement>('#host')!.getContext('2d')!;
      const grant=await qualifyPrivateSprite(current,slot,pin,selected);
      type Image=Parameters<typeof grant.paint>[1];
      const signal=cmd as Image;
      const unknown=grant.paint(context,{...signal,assetId:'not-reviewed'});
      const painted=grant.paint(context,signal);
      const pixel=(x:number,y:number)=>Array.from(context.getImageData(x,y,1,1).data);
      const center=pixel(signal.x,signal.y),outside=pixel(signal.x,signal.y-49);
      // The approved workshop uses the same placement as this fixture's frame.
      // Composite behind the isolated private sprite only after checking transparency.
      const scene = new Image();scene.src='data:'+background.mime+';base64,'+background.data;await scene.decode();
      context.globalCompositeOperation='destination-over';context.drawImage(scene,0,-40,720,480);
      mounted=null;
      denials.push(await rejects(()=>grant.paint(context,signal)));
      mounted=session;
      denials.push(await rejects(()=>grant.paint(context,signal)));
      grant.close();
      return {unknown,painted,center,outside,denials,base64:png.toDataURL().split(',')[1]};
    },{cmd:next,artifactHash:artifact.sha256,background:game.assets!.assets.find(asset=>asset.id==='workshop')!});
    assert.deepEqual(received.center,[53,175,114,255]);
    assert.deepEqual(received.outside,[0,0,0,0],'wide sprite retains transparent margins in a tall slot');
    assert.ok(received.painted && !received.unknown && received.denials.every(Boolean));
    assert.ok(!artifact.html.includes(received.base64));
    assert.ok(!artifact.html.includes('test-maker'));
    assert.equal(requests,0);
    if(process.env.ART_EVIDENCE_DIR){
      mkdirSync(process.env.ART_EVIDENCE_DIR,{recursive:true});
      await page.locator('#host').screenshot({path:join(process.env.ART_EVIDENCE_DIR,'generated-slot-compositor.png')});
    }
    console.log('PASS offline v2 sprite slot: real sandbox input moved the image command; exact scoped pixels, aspect ratio, wrong-scope denial and terminal revocation verified. No network requests.');
  } finally {await browser.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
