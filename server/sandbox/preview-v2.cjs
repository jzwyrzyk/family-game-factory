const {createHash}=require('node:crypto');
const {runtimeBundle}=require('./bundle-v2.cjs');
const {validateAssetPack,assetPackHash}=require('../agent/game-assets.cjs');
const {captureHorizon}=require('../quality/game-quality-evidence.cjs');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function prepareGeneratedV2(game,artifactId,channel,options={}){
 if(!game.compiled||!/^[\w-]{1,100}$/.test(artifactId)||!/^[\w-]{8,100}$/.test(channel))throw Error('INVALID_GENERATED_PREVIEW');
 const trusted=runtimeBundle(game.compiled.runtimeVersion);if(game.compiled.runtimeVersion!==trusted.version||game.compiled.runtimeHash!==trusted.hash)throw Error('TRUSTED_RUNTIME_MISMATCH');
 const pack=game.assets===undefined?undefined:validateAssetPack(game.assets);
 if(game.compiled.assetsHash!==assetPackHash(pack))throw Error('ASSET_ATTESTATION_REQUIRED');
 if(pack&&!trusted.assets)throw Error('ASSET_RUNTIME_UNSUPPORTED');
 const assets=pack?.assets||[],assetIds=assets.map(asset=>asset.id);
 // Sibling closures prevent generated code from naming the trusted engine or its mutable world.
 // The seeded RNG makes replay and independent input-effect probes reproducible.
 const worker=`"use strict";(function(){"use strict";${trusted.worker}\nreturn FactoryRuntime.run;})()(function(api){"use strict";${game.compiled.code}\nreturn GameModule.createGame(api);}${trusted.assets?','+JSON.stringify(assetIds):''});`;
 const auditTicks=options.auditTicks;if(auditTicks!==undefined&&(!Number.isInteger(auditTicks)||auditTicks<1||auditTicks>captureHorizon(game)))throw Error('AUDIT_TICK_LIMIT');
 const config={worker,artifactId,channel,controls:game.controls,auditTicks,...(trusted.assets?{assets:assets.map(({id,mime,data,width,height,sampling})=>({id,mime,data,width,height,sampling}))}:{})};
 return {client:trusted.client,config};
}
function renderClientDocument(game,script,hasImages){
 const digest=createHash('sha256').update(script).digest('base64');const csp=`default-src 'none'; script-src 'sha256-${digest}'; worker-src blob:; connect-src 'none'; style-src 'unsafe-inline'; img-src ${hasImages?'data:':"'none'"}; media-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors *`;
 const labels={left:'◀ Left',right:'Right ▶',up:'▲ Up',down:'▼ Down',action:'Action ✦'};const controls=game.controls.map(k=>`<button data-control="${k}">${labels[k]}</button>`).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp.replace('; frame-ancestors *','')}"><title>${escape(game.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f3e9;color:#203c43;font:16px system-ui;text-align:center}main{max-width:960px;margin:auto;padding:12px}h1{font-size:26px;margin:8px}p{margin:8px}canvas{display:block;width:100%;aspect-ratio:720/400;background:#eaf5ef;border-radius:20px;border:2px solid #bad4cb;touch-action:none}button{font:600 16px system-ui;min-height:48px;min-width:48px;border:0;border-radius:14px;background:#e3ede6;color:#203c43;padding:10px 16px}button:focus-visible,canvas:focus-visible{outline:3px solid #e79b35;outline-offset:2px}#start{background:#f3b644}#controls,.toolbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:10px 0}#controls button{background:#204b52;color:white;min-width:70px}#status{min-height:24px}#score{font-size:14px;color:#50696b}.sound button{font-size:13px;background:transparent;min-height:40px}@media(max-width:450px){main{padding:6px}h1{font-size:21px}.toolbar{gap:5px}.toolbar button{padding:10px}#controls button{flex:1;min-width:54px}}</style><main><h1>${escape(game.title)}</h1><p>${escape(game.instructions)}</p><p id="status" role="status" data-state="idle">Ready when you are.</p><canvas id="game" width="720" height="400" tabindex="0" aria-label="Game play area"></canvas><p id="score">Score: 0</p><div id="controls">${controls}</div><div class="toolbar"><button id="start">Play!</button><button id="replay">Play again</button><button id="pause" disabled>Pause</button></div><div class="toolbar sound"><button id="music" aria-pressed="false">Music: off</button><button id="effects" aria-pressed="true">Sounds: on</button></div></main><script>${script}</script></html>`;
 return {html,csp,sha256:createHash('sha256').update(html).digest('hex')};
}
function renderGeneratedV2(game,artifactId,channel,options={}){
 const {client,config}=prepareGeneratedV2(game,artifactId,channel,options);
 const script=client+'\nFactoryClient.startClient('+JSON.stringify(config).replace(/</g,'\\u003c')+');';
 return renderClientDocument(game,script,!!config.assets?.length);
}
module.exports={renderGeneratedV2,prepareGeneratedV2,renderClientDocument};
