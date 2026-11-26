import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkReviewedPng} from '../src/family-beta/reviewed-png';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
function check(bytes: Buffer) { checkReviewedPng(Uint8Array.from(bytes).buffer); }

test('family review accepts a raster-only file without changing its exact bytes', () => {
  const before = Buffer.from(png);
  check(png);
  assert.deepEqual(png,before);
});
test('embedded file details, trailing data, and incomplete chunks cannot pass review', () => {
  const metadata = Buffer.alloc(18);
  metadata.writeUInt32BE(6,0);
  metadata.write('tEXt',4);
  metadata.write('author',8);
  for (const bad of [Buffer.concat([png.subarray(0,33),metadata,png.subarray(33)]),Buffer.concat([png,Buffer.from('extra')]),png.subarray(0,40)]) {
    assert.throws(() => check(bad));
  }
});
