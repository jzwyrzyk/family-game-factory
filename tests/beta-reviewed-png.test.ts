import assert from 'node:assert/strict';
import {test} from 'node:test';
import {crc32, deflateSync} from 'node:zlib';
import {checkReviewedPng} from '../src/family-beta/reviewed-png';

function chunk(kind:string, bytes:Buffer):Buffer {
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length);
  result.write(kind, 4, 'ascii');
  bytes.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
  return result;
}
function picture(scanlines:Buffer, type=6, extras:Buffer[]=[], interlaced=false):Buffer {
  const header = Buffer.from([0,0,0,2, 0,0,0,1, 8,type,0,0,Number(interlaced)]);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),...extras,
    chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}
const pixels = Buffer.from([0,25,80,91,255,10,30,49,160]);
const png = picture(pixels);
const check = (bytes:Buffer) => checkReviewedPng(Uint8Array.from(bytes).buffer);

test('family review accepts exact truecolor and indexed raster originals', async () => {
  const indexed = picture(Buffer.from([0,0,1]),3,[chunk('PLTE',Buffer.from([12,34,56,65,43,21])),chunk('tRNS',Buffer.from([255,64]))]);
  const interlaced = picture(Buffer.from([0,...pixels.subarray(1,5),0,...pixels.subarray(5)]),6,[],true);
  for (const valid of [png,indexed,interlaced]) {
    const before = Buffer.from(valid);
    await check(valid);
    assert.deepEqual(valid,before);
  }
});
test('embedded file details, trailing bytes and incomplete chunks cannot pass review', async () => {
  for (const bad of [picture(pixels,6,[chunk('tEXt',Buffer.from('Comment\0fixture'))]), Buffer.concat([png,Buffer.from('extra')]),png.subarray(0,40)]) {
    await assert.rejects(() => check(bad));
  }
});
test('the color model and exact scanline count govern admitted image data', async () => {
  const short = picture(pixels.subarray(0,-1));
  const oversized = picture(Buffer.concat([pixels,Buffer.from([0])]));
  const wrongPalette = picture(pixels,6,[chunk('PLTE',Buffer.from([1,2,3]))]);
  for (const bad of [short,oversized,wrongPalette]) await assert.rejects(() => check(bad));
});
