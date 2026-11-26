import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Page} from 'playwright';
import {rgbaPng} from '../server/agent/sprite-sheet';
import {crc32} from '../server/agent/game-assets.cjs';
import {parent} from './beta-fixture';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export async function reviewedArtworkBrowser(page: Page, approve: (digest: string) => Promise<unknown>) {
  const image = rgbaPng(2, 1, Buffer.from([25, 57, 163, 255, 0, 0, 0, 0]));
  const text = Buffer.from('Comment\0synthetic pre-admission metadata');
  const chunk = Buffer.alloc(text.length + 12);
  chunk.writeUInt32BE(text.length); chunk.write('tEXt', 4); text.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk, 4, chunk.length - 4), chunk.length - 4);
  const withMetadata = Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);

  async function select(buffer: Buffer) {
    await page.locator('#reviewedArtPassphrase').fill(parent);
    await page.locator('#betaReviewedArt').setInputFiles({name:'source.png',mimeType:'image/png',buffer});
  }
  const requests: unknown[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/entry/review-art') requests.push(request.postDataJSON());
  });
  const reviewed = image;
  await select(withMetadata);
  await page.getByText('Ask a grown-up for a reviewed PNG without embedded file details.').waitFor();
  assert.deepEqual(requests, []);
  await select(reviewed);
  await page.getByText('Ask the operator to review and approve this exact PNG for your family.').waitFor();
  assert.equal(await page.getByRole('link', {name:'Download prepared PNG'}).count(), 0);

  await approve(digest(reviewed));
  await select(reviewed);
  const link = page.getByRole('link', {name:'Download prepared PNG'});
  await link.waitFor();
  await page.locator('.family-session-controls').screenshot({path:'test-results/family-beta/'+page.context().browser()!.browserType().name()+'-prepared-artwork.png'});
  const downloaded = page.waitForEvent('download');
  await link.click();
  const clean = await readFile((await (await downloaded).path())!);
  assert.equal(clean.includes(text), false);
  assert.notEqual(digest(clean), digest(reviewed));

  await select(clean);
  await page.getByText('Ask the operator to review and approve this exact PNG for your family.').waitFor();
  await approve(digest(clean));

  // A profile-change cycle during guardian unlock invalidates the captured operation,
  // even when the original explorer is selected again before the response returns.
  let release!: () => void, intercepted!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { intercepted = resolve; });
  await page.route('**/v1/devices/unlock', async route => { intercepted(); await paused; await route.continue(); }, { times: 1 });
  const unlocked = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/devices/unlock');
  try {
    await select(clean);
    await waiting;
    await page.evaluate(() => {
      const store = (window as any).FG.store;
      if (!store.choose(store.current().id)) throw Error('The fixture could not change the active explorer.');
    });
  } finally { release(); }
  await unlocked;

  await select(clean);
  await page.getByText('Your reviewed drawing is ready.').waitFor();
  const rows = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const read = indexedDB.open('family-private-drawings-v1');
      read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
    });
    try {
      const drawings = await new Promise<{owner:string;sha256:string;bytes:ArrayBuffer}[]>((resolve, reject) => {
        const request = db.transaction('drawings').objectStore('drawings').getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return drawings.map(row => ({owned: row.owner === (window as any).FG.store.current().id, hash: row.sha256, bytes: Array.from(new Uint8Array(row.bytes))}));
    } finally { db.close(); }
  });
  assert.deepEqual(rows, [{owned: true, hash: digest(clean), bytes: [...clean]}]);
  assert.deepEqual(requests, [reviewed, reviewed, clean, clean].map(buffer => ({digest: digest(buffer)})));
  console.log('Reviewed artwork retained exact admitted bytes, excluded source metadata and cancelled the interrupted profile selection.');
}
