import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ASSET_LIMITS,validateAssetPack,assetPackHash,inspectRaster,makeRasterAsset} from '../server/agent/game-assets';
import {validateGenerated,validateCompiled,hash} from '../server/agent/generated';
import {copyCommands} from '../server/sandbox/frame-v2';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {renderGeneratedV2} from '../server/sandbox/preview-v2.cjs';
import {twoColorPNG,animatedPNG,pixelPack,workshopPack,pixelGame,compileArtFixture} from './generated-art-fixtures';

const pack=pixelPack(),png=twoColorPNG(),asset=pack.assets[0];
assert.deepEqual(inspectRaster(png,'image/png'),{width:2,height:1,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')});
assert.deepEqual(validateAssetPack(pack),pack);assert.equal(validateAssetPack(workshopPack()).assets.length,2);
assert.deepEqual(validateAssetPack({version:'game-assets-v1',style:'flat-2d',assets:[]}),{version:'game-assets-v1',style:'flat-2d',assets:[]});
assert.equal(assetPackHash(undefined),undefined);assert.equal(assetPackHash(pack),assetPackHash(JSON.parse(JSON.stringify(pack))));
for(const changed of [
 {...pack,style:'flat-2d'},
 {...pack,assets:[{...asset,sampling:'smooth'}]},
 {...pack,assets:[{...asset,role:'object'}]},
 {...pack,assets:[{...asset,provenance:{kind:'generated',sourceId:'other-v1'}}]}
])assert.notEqual(assetPackHash(changed as any),assetPackHash(pack),'manifest identity includes style, role, sampling and provenance');
for(const changed of [
 {...asset,sha256:'0'.repeat(64)}, {...asset,width:3}, {...asset,mime:'image/svg+xml'},
 {...asset,data:'data:image/png;base64,'+asset.data}, {...asset,data:asset.data+'\n'},
 {...asset,id:'https://unapproved.invalid/asset'}, {...asset,url:'https://unapproved.invalid'},
 {...asset,provenance:{kind:'child-upload',sourceId:'not-enabled'}},
 {...asset,provenance:{kind:'generated',sourceId:'https://unapproved.invalid'}}
])assert.throws(()=>validateAssetPack({...pack,assets:[changed]}),/ASSET/);
assert.throws(()=>validateAssetPack({...pack,assets:[asset,asset]}),/ASSET_MANIFEST/);
assert.throws(()=>validateAssetPack({...pack,assets:Array(9).fill(asset)}),/ASSET_MANIFEST/);
assert.throws(()=>inspectRaster(Buffer.alloc(ASSET_LIMITS.bytes+1),'image/png'),/ASSET_BYTES_LIMIT/);
assert.throws(()=>inspectRaster(Buffer.concat([png,Buffer.from('trailing')]),'image/png'),/ASSET_FORMAT/);
assert.throws(()=>inspectRaster(animatedPNG(),'image/png'),/ANIMATED_ASSET/);
assert.throws(()=>inspectRaster(twoColorPNG(ASSET_LIMITS.dimension+1),'image/png'),/ASSET_DIMENSIONS/);
const corrupt=Buffer.from(png);corrupt.fill(0,41,corrupt.length-12);assert.throws(()=>inspectRaster(corrupt,'image/png'),/ASSET_PNG_INTEGRITY/);
assert.throws(()=>inspectRaster(twoColorPNG(3),'image/png'),/ASSET_PNG_INTEGRITY/,'complete pixel stream must match declared dimensions');
const webp=readFileSync(new URL('../public/gem-factory-helper.webp',import.meta.url));
assert.equal(inspectRaster(webp,'image/webp').width,400);assert.throws(()=>inspectRaster(webp,'image/png'),/ASSET_FORMAT/);
assert.throws(()=>inspectRaster(Buffer.concat([webp,Buffer.from('x')]),'image/webp'),/ASSET_FORMAT/);
const tooManyPixels=makeRasterAsset({id:'one',mime:'image/webp',role:'background',bytes:readFileSync(new URL('../public/gem-factory-workshop.webp',import.meta.url)),provenance:{kind:'approved-library',sourceId:'fixture'}});
assert.throws(()=>validateAssetPack({...pack,assets:Array.from({length:6},(_,i)=>({...tooManyPixels,id:'large'+i}))}),/ASSET_PACK_LIMIT/);
const image={type:'image',key:'tile',assetId:'twoColors',x:50,y:50,width:32,height:32};
assert.equal(copyCommands([image],new Set(['twoColors']))[0].assetId,'twoColors');
assert.throws(()=>copyCommands([image]),/IMAGE_NOT_APPROVED/,'allowlist is per call, never global mutable state');
assert.throws(()=>copyCommands([{...image,assetId:'other'}],new Set(['twoColors'])),/IMAGE_NOT_APPROVED/);
assert.throws(()=>copyCommands([{...image,src:'data:image/png;base64,x'}],new Set(['twoColors'])),/DISPLAY_FIELD/);
assert.throws(()=>copyCommands(Array(81).fill(image),new Set(['twoColors'])),/DRAW_WORK_LIMIT/);
const game=pixelGame(),compiled=compileArtFixture(game);
assert.equal(validateGenerated(game).assets?.style,'pixel');assert.equal(validateCompiled(game,compiled).compiled?.assetsHash,assetPackHash(pack));
assert.throws(()=>validateGenerated({...game,kind:'generated-module-v1'}),/ASSETS_REQUIRE_V2/);
assert.throws(()=>validateGenerated({...game,source:'x'.repeat(30001)}),/GENERATED_ARTIFACT/);
assert.throws(()=>validateCompiled(game,{...compiled,compiled:{...compiled.compiled!,assetsHash:undefined}}),/ASSET_ATTESTATION/);
assert.throws(()=>validateCompiled(game,{...compiled,assets:{...pack,style:'flat-2d'}}),/ASSET_ATTESTATION/);
assert.throws(()=>renderGeneratedV2({...compiled,assets:{...pack,style:'flat-2d'}},'art-fixture','art-channel'),/ASSET_ATTESTATION/);
const preview=renderGeneratedV2(compiled,'art-fixture','art-channel');assert.match(preview.csp,/img-src data:/);assert.match(preview.csp,/connect-src 'none'/);assert.doesNotMatch(preview.csp,/https:|unsafe-eval/);
const old=runtimeBundle('quality-runtime-v2.0.3'),oldGame={...compiled,assets:undefined,compiled:{...compiled.compiled!,assetsHash:undefined,runtimeVersion:old.version,runtimeHash:old.hash}};
assert.match(renderGeneratedV2(oldGame,'old-art-fixture','old-art-channel').csp,/img-src 'none'/);
assert.throws(()=>renderGeneratedV2({...compiled,compiled:{...compiled.compiled!,runtimeVersion:old.version,runtimeHash:old.hash}},'old-art-fixture','old-art-channel'),/ASSET_RUNTIME_UNSUPPORTED/);
const current=runtimeBundle(),manifest=JSON.parse(readFileSync(new URL('../server/sandbox/trusted/'+current.version+'/manifest.json',import.meta.url),'utf8'));
assert.equal(current.assets,true);for(const [file,digest]of Object.entries(manifest.sourceHashes))assert.equal(hash(readFileSync(new URL('../'+file,import.meta.url),'utf8')),digest,'new archive matches reviewed source: '+file);
console.log('PASS generated art: PNG/WebP validation, fixed limits, provenance/style identity, source cap, exact asset binding, per-game allowlists, old-runtime preservation and archived source hashes.');
