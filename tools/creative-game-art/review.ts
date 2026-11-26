import {buildSync} from 'esbuild';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compileArtFixture, illustratedGame} from '../../tests/generated-art-fixtures';
import {prepareReviewCapsule} from './capsule';

export function reviewFixture() {
  const fixture = illustratedGame();
  fixture.title = 'A rock in the workshop';
  fixture.instructions = 'Use the arrows to move the rock you picked.';
  fixture.source = fixture.source.replace(",{type:'text',text:'A world that moves with you',x:190,y:40,size:22,color:'#244d57'}", '');
  return prepareReviewCapsule(compileArtFixture(fixture), {assetId: 'helper', width: 100, height: 104});
}

export function buildReviewPage() {
  const capsule = reviewFixture();
  const entry = buildSync({entryPoints: ['tools/creative-game-art/review-page.ts'], bundle: true, platform: 'browser', define: {'import.meta.env.MODE': JSON.stringify('offline-review')},
    write: false, format: 'iife', globalName: 'CreativeReview'}).outputFiles[0].text;
  const script = entry + '\nCreativeReview.startReview(' + JSON.stringify(capsule).replace(/</g, '\\u003c') + ').catch(error=>document.querySelector("#message").textContent=error.message);';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; frame-src about:; form-action 'none'; base-uri 'none'">
<title>Jems local artwork review</title>
<style>*{box-sizing:border-box}body{max-width:900px;margin:10px auto;padding:12px;color:#302642;background:#faf7ee;font:18px system-ui}h1{font-size:24px}button{min-height:44px;padding:8px 14px;font:inherit}iframe{display:block;border:0;width:100%;height:800px}</style>
<h1>Local artwork review</h1><p>Synthetic drawing and game fixture.</p>
<button id="try" disabled>Try the rock</button> <button id="close" disabled>Close playtest</button><div id="message" role="status"></div><div id="preview"></div>
<script>${script.replace(/<\/script/gi, '<\\/script')}</script></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Choose a path for the offline review HTML.');
  writeFileSync(process.argv[2], buildReviewPage(), {flag: 'wx'});
}
