import {deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {makeRasterAsset,assetPackHash,type GameAssetPack} from '../server/agent/game-assets';
import {runtimeBundle} from '../server/sandbox/bundle-v2.cjs';
import {hash,type GeneratedGame} from '../server/agent/generated';

// Exact-color, hand-authored raster fixture. No image provider or generated code is executed.
function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind:string,bytes:Buffer){const label=Buffer.from(kind),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([label,bytes])));return Buffer.concat([length,label,bytes,crc]);}
export function twoColorPNG(width=2,height=1){
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,0,255,255]))),chunk('IEND',Buffer.alloc(0))]);
}
export function animatedPNG(){const png=twoColorPNG(),animation=Buffer.alloc(8);animation.writeUInt32BE(1);return Buffer.concat([png.subarray(0,33),chunk('acTL',animation),png.subarray(33)]);}
export function undecodableWebP(){const bytes=Buffer.alloc(30);bytes.write('RIFF',0,'ascii');bytes.writeUInt32LE(22,4);bytes.write('WEBPVP8 ',8,'ascii');bytes.writeUInt32LE(10,16);bytes.set([0x9d,1,0x2a],23);bytes.writeUInt16LE(2,26);bytes.writeUInt16LE(1,28);return bytes;}
export function pixelPack():GameAssetPack{return {version:'game-assets-v1',style:'pixel',assets:[makeRasterAsset({id:'twoColors',role:'actor',mime:'image/png',bytes:twoColorPNG(),sampling:'pixelated',provenance:{kind:'approved-library',sourceId:'authored-two-colors-v1'}})]};}
export function workshopPack():GameAssetPack{return {version:'game-assets-v1',style:'illustrated',assets:[
 makeRasterAsset({id:'workshop',role:'background',mime:'image/webp',bytes:readFileSync(new URL('../public/gem-factory-workshop.webp',import.meta.url)),provenance:{kind:'approved-library',sourceId:'gem-factory-workshop-v1'}}),
 makeRasterAsset({id:'helper',role:'actor',mime:'image/webp',bytes:readFileSync(new URL('../public/gem-factory-helper.webp',import.meta.url)),provenance:{kind:'approved-library',sourceId:'gem-factory-helper-v1'}})
]};}
export const pixelGame=():GeneratedGame=>({kind:'generated-module-v2',title:'Pixel art fixture',instructions:'Move the two-color tile with the arrow keys.',controls:['left','right'],assets:pixelPack(),source:`export function createGame(api){return {init:()=>({x:180}),step(s,input){if(input.pressed.includes('right'))s.x=Math.min(550,s.x+3);if(input.pressed.includes('left'))s.x=Math.max(100,s.x-3);return s;},draw(s){return [{type:'rect',x:0,y:0,width:720,height:400,color:'#ffffff'},{type:'image',key:'tile',assetId:'twoColors',x:s.x,y:180,width:128,height:64}];},outcome:()=>({status:'playing',score:0})};}`});
export const illustratedGame=():GeneratedGame=>({kind:'generated-module-v2',title:'Illustrated art fixture',instructions:'Move your helper through the workshop.',controls:['left','right'],assets:workshopPack(),source:`export function createGame(api){return {init:()=>({x:150}),step(s,input){if(input.pressed.includes('right'))s.x=Math.min(620,s.x+3);if(input.pressed.includes('left'))s.x=Math.max(90,s.x-3);return s;},draw(s){return [{type:'image',key:'room',assetId:'workshop',x:360,y:200,width:720,height:480},{type:'image',key:'helper',assetId:'helper',x:s.x,y:280,width:100,height:104},{type:'text',text:'A world that moves with you',x:190,y:40,size:22,color:'#244d57'}];},outcome:()=>({status:'playing',score:0})};}`});
export function compileArtFixture(game:GeneratedGame):GeneratedGame{
 const code=transformSync(game.source,{loader:'ts',format:'iife',globalName:'GameModule'}).code,runtime=runtimeBundle();
 return {...game,compiled:{code,sourceHash:hash(game.source),codeHash:hash(code),runtimeVersion:runtime.version,runtimeHash:runtime.hash,assetsHash:assetPackHash(game.assets),tests:{desktop:true,mobile:true,replay:true,isolation:true,input:true,resources:true,pause:true}}};
}
