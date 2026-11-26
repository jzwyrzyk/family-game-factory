// Run after npm run build. Every picture is a synthetic fixture made in a fresh browser profile.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { start } = require('../tests/browser-server.cjs');
const { exploreWelcome, openProfiles, navigate } = require('../tests/studio-entry.cjs');

const output = path.resolve(process.env.UNIVERSE_EVIDENCE || 'test-results/connected-universe');
const checks = [];
const screenshots = [];

async function capture(locator, filename) {
  await locator.screenshot({ path: path.join(output, filename), animations: 'disabled' });
  screenshots.push(filename);
}

async function ready(page) {
  await page.waitForFunction(() => window.FG?.artStudio && window.FG?.creation);
}

async function savedDrawings(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('family-private-drawings-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise((resolve, reject) => {
        const request = db.transaction('drawings').objectStore('drawings').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const owned = rows.filter(row => row.owner === FG.store.current().id);
      return Promise.all(owned.map(async row => {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', row.bytes));
        const hash = Array.from(digest, x => x.toString(16).padStart(2, '0')).join('');
        return { id: row.id, name: row.name, parent: row.sourceId, declared: row.sha256, hash };
      }));
    } finally {
      db.close();
    }
  });
}

async function crayonStroke(page, points) {
  const box = await page.locator('.drawing-paint [data-paper]').boundingBox();
  for (const [index, [x, y]] of points.entries()) {
    await page.mouse.move(box.x + x * box.width, box.y + y * box.height);
    if (index === 0) await page.mouse.down();
  }
  await page.mouse.up();
}

async function makeRock(page) {
  const editor = page.locator('dialog.drawing-paint');
  await page.locator('#artDrawButton').click();
  await openDetails(editor, '[data-options]');
  await editor.locator('[data-background]').selectOption('clear');
  await openDetails(editor, '[data-more-tools]');
  await editor.getByRole('button', { name: 'Sunshine' }).click();
  await editor.locator('[data-brush-width]').press('End');
  // A continuous zigzag fills the body with the same crayon a child uses.
  const rows = [[.33,.37,.54],[.36,.34,.57],[.39,.31,.60],[.42,.29,.63],
    [.45,.27,.64],[.48,.26,.68],[.51,.25,.70],[.54,.24,.72],
    [.57,.23,.74],[.60,.23,.75],[.63,.22,.76],[.66,.22,.77],[.69,.25,.73],[.71,.33,.67]];
  const zigzag = rows.flatMap(([y,left,right], i) => i % 2 ? [[right,y],[left,y]] : [[left,y],[right,y]]);
  await crayonStroke(page, zigzag);
  await editor.locator('[data-brush-width]').press('Home');
  for (let i = 0; i < 5; i++) await editor.locator('[data-brush-width]').press('ArrowRight');
  await editor.getByRole('button', { name: 'Teal' }).click();
  await crayonStroke(page, [[.2,.67],[.25,.45],[.36,.32],[.48,.29],[.58,.31],[.65,.42],[.73,.49],[.79,.64],[.76,.71],[.64,.74],[.51,.73],[.39,.76],[.25,.73],[.2,.67]]);
  await crayonStroke(page, [[.25,.45],[.34,.48],[.38,.41],[.45,.43]]);
  await editor.getByRole('button', { name: 'Charcoal' }).click();
  await crayonStroke(page, [[.39,.52],[.395,.55]]);
  await crayonStroke(page, [[.60,.50],[.604,.53]]);
  await crayonStroke(page, [[.45,.58],[.47,.61],[.52,.62],[.55,.59]]);
  await editor.getByRole('button', { name: 'Berry' }).click();
  await crayonStroke(page, [[.33,.59],[.37,.59]]);
  await crayonStroke(page, [[.62,.57],[.66,.57]]);
  await editor.locator('[data-title]').fill('Pebble');
  await capture(editor, 'a-draw-pebble.png');
  await editor.locator('[data-save]').click();
  await editor.waitFor({ state: 'detached' });
  const [original] = await savedDrawings(page);
  assert.equal(original.name, 'Pebble');
  assert.equal(original.declared, original.hash);
  await page.getByRole('button', {name:'Keep drawing',exact:true}).click();
  await editor.getByRole('button', { name: 'Sunshine' }).click();
  await crayonStroke(page, [[.57,.37],[.61,.40],[.57,.44],[.53,.40],[.57,.37]]);
  await editor.locator('[data-title]').fill('Pebble with a gem');
  await editor.locator('[data-save]').click();
  await editor.waitFor({ state: 'detached' });
  const versions = await savedDrawings(page);
  assert.deepEqual(versions.find(x => x.id === original.id), original);
  const gem = versions.find(x => x.parent === original.id);
  assert.ok(gem, 'continued drawing retains its original parent');
  assert.notEqual(gem.hash, original.hash);
  assert.equal(gem.declared, gem.hash);
  await page.getByLabel('What is it? (optional)', { exact: true }).fill('Moon rock');
  await page.getByLabel('Artwork collection', { exact: true }).selectOption('prop');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('artStatus').textContent === 'Artwork details saved.');
  await page.locator('#artSearch').fill('Moon rock');
  await page.waitForFunction(id => {
    const cards = document.querySelectorAll('.art-card');
    return cards.length === 2 && Array.from(cards).some(card => card.dataset.artId === id);
  }, gem.id);
  await page.locator('.art-card').filter({ hasText: 'Pebble with a gem' }).click();
  await capture(page.locator('#artDetails'), 'd-asset-details.png');
  checks.push('Saved a crayon drawing, reopened its editable source, added a gem and found the revision by its semantic name. Original bytes retained their calculated SHA-256.');
  return { original, gem };
}

// These small transparent PNGs intentionally use distinct outlines and off-center markings.
// Each is generated locally as a fixture so its uploaded bytes can be checked independently.
const shapes = {
  dragon: ['#a0ce83', 'M25 94 L56 68 L70 46 L100 54 L91 32 L115 41 L115 18 L136 39 L157 43 L173 63 L153 80 L129 77 L125 101 L143 110 L126 116 L107 102 L85 98 L68 117 L49 117 L57 97 Z', 'M67 70 L36 26 L65 38 L78 26 L90 62 Z'],
  car: ['#f4b879', 'M16 76 L35 69 L60 41 L109 37 L137 61 L166 69 L176 88 L167 99 L22 103 Z', 'M68 49 L99 45 L119 64 L54 65 Z M43 99 A12 12 0 1 0 67 99 A12 12 0 1 0 43 99 M132 97 A12 12 0 1 0 156 97 A12 12 0 1 0 132 97'],
  rocket: ['#f5bac6', 'M75 92 Q62 46 107 13 Q128 58 107 94 L117 117 L96 106 L71 118 Z', 'M86 80 L78 105 L67 114 L73 88 Z M98 94 L90 121 L83 103 Z M91 52 A8 8 0 1 0 107 52 A8 8 0 1 0 91 52'],
  robot: ['#79bcc4', 'M64 28 L132 28 L137 65 L119 70 L124 98 L139 111 L117 114 L102 98 L83 98 L76 116 L54 115 L64 96 L69 69 L57 62 Z', 'M93 28 L92 14 M69 72 L47 63 L42 79 M119 72 L147 66 L151 51 M75 43 L84 43 L84 51 L75 51 Z M109 43 L118 43 L118 51 L109 51 Z'],
  butterfly: ['#d3a0df', 'M97 66 C55 9 8 8 29 58 Q37 77 70 82 C31 82 34 122 65 115 Q84 107 95 87 Q110 120 140 111 Q165 98 133 82 C167 72 186 23 158 24 Q126 28 97 66 Z', 'M87 43 L95 58 L98 91 L104 56 L113 41 M53 40 Q75 48 79 62 M142 38 Q125 45 119 64'],
  imaginary: ['#d0c277', 'M42 62 L58 39 L56 16 L75 32 L94 25 L115 40 L137 15 L134 52 Q164 75 151 96 L135 104 L136 119 L119 112 L111 98 L81 102 L70 118 L55 115 L61 99 L41 89 Z', 'M42 75 L21 70 L14 54 L24 51 L27 60 L46 64 M82 82 Q99 90 105 77']
};
async function uploadSubject(page, name) {
  const image = await page.evaluate(([color, outline, details]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.strokeStyle = '#36344d'; ctx.lineWidth = 4;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const body = new Path2D(outline);
    ctx.fill(body); ctx.stroke(body); ctx.stroke(new Path2D(details));
    ctx.fillStyle = '#dd507f';
    ctx.beginPath(); ctx.arc(90, 61, 3, 0, Math.PI * 2); ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  }, shapes[name]);
  const bytes = Buffer.from(image, 'base64'), title = 'Test ' + name;
  await page.setInputFiles('#artUpload', { name: title + '.png', mimeType: 'image/png', buffer: bytes });
  await page.waitForFunction(title => document.getElementById('artDetailTitle')?.textContent === title, title);
  await page.waitForFunction(() => document.getElementById('artStatus')?.textContent.includes('picture is saved'));
  const saved = (await savedDrawings(page)).find(x => x.name === title);
  assert.equal(saved.hash, createHash('sha256').update(bytes).digest('hex'));
  return saved;
}

async function uploadPaperHills(page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffdfb0'; ctx.fillRect(0, 0, 640, 360);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 5;
    const shape = (outline, color, ink) => {
      const path = new Path2D(outline);
      ctx.fillStyle = color; ctx.strokeStyle = ink;
      ctx.fill(path); ctx.stroke(path);
    };
    ctx.fillStyle = '#ffae56'; ctx.beginPath(); ctx.arc(507, 90, 40, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fbd08b'; ctx.stroke();
    shape('M-8 227 L65 179 L119 151 L163 117 L210 150 L257 135 L330 185 L401 159 L461 111 L519 127 L571 165 L652 182 L652 363 L-8 363 Z', '#b4a1bd', '#807595');
    shape('M-8 223 Q42 193 99 210 T204 198 Q246 182 300 212 T420 208 Q517 170 578 190 L650 212 L650 360 L-8 360 Z', '#9dc6aa', '#6b9c89');
    shape('M-8 293 Q75 260 152 280 Q241 308 313 276 Q417 240 491 270 Q557 286 650 243 L650 363 L-8 363 Z', '#87b298', '#588d77');
    shape('M210 360 Q316 316 321 294 Q332 275 387 262 Q326 287 354 303 Q362 327 302 360 Z', '#f3ce98', '#d7ad80');
    return canvas.toDataURL().split(',')[1];
  });
  await page.setInputFiles('#artUpload', { name:'Paper hills.png', mimeType:'image/png', buffer:Buffer.from(png, 'base64') });
  await page.waitForFunction(() => document.getElementById('artDetailTitle')?.textContent === 'Paper hills');
}

async function animate(page, subject, movement) {
  await page.locator('#artAnimatePath').click();
  const dialog = page.locator('#artAnimationPath');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: movement, exact: true }).click();
  const sprite = dialog.locator('.art-motion-sprite');
  const pose = await sprite.evaluate(el => el.style.cssText);
  await page.waitForFunction(pose => document.querySelector('.art-motion-sprite')?.style.cssText !== pose, pose);
  await dialog.locator('[data-pause]').click();
  assert.equal(await dialog.locator('[data-pause]').textContent(), 'Resume');
  const paused = await sprite.evaluate(el => el.style.cssText);
  const frozen = await sprite.evaluate(el => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(el.style.cssText)))));
  assert.equal(frozen, paused);
  // Compare the exact decoded source at preview resolution against the actual rendered sprite.
  const fidelity = await sprite.evaluate(async (el, id) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('family-private-drawings-v1');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    try {
      const record = await new Promise((resolve, reject) => {
        const req = db.transaction('drawings').objectStore('drawings').get(id);
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      const bitmap = await createImageBitmap(new Blob([record.bytes], {type: record.mime}));
      try {
        const reference = document.createElement('canvas');
        reference.width = el.width; reference.height = el.height;
        reference.getContext('2d').drawImage(bitmap, 0, 0, el.width, el.height);
        return reference.toDataURL() === el.toDataURL();
      } finally { bitmap.close(); }
    } finally { db.close(); }
  }, subject.id);
  assert.equal(fidelity, true, 'original preview matches every decoded pixel');
  if (movement !== 'Spin' || subject.name !== 'Pebble with a gem') {
    await capture(dialog.locator('[data-stage]'), 'c-' + movement.toLowerCase() + '-preview.png');
  }
  await dialog.locator('[data-pause]').click();
  await page.waitForFunction(pose => document.querySelector('.art-motion-sprite')?.style.cssText !== pose, paused);
  const priorVersion = await page.locator('#artVersion').inputValue();
  await dialog.getByRole('button', { name: 'Save animation', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction(prior => {const selected = document.querySelector('#artVersion')?.value; return selected && selected !== prior;}, priorVersion);
  const rig = await page.locator('#artVersion').inputValue();
  const source = (await savedDrawings(page)).find(row => row.id === subject.id);
  assert.deepEqual(source, subject, 'animating preserves original bytes and parent');
  return rig;
}

async function sceneFromSelectedArt(page, rig) {
  await page.locator('#artVersion').selectOption(rig);
  await page.locator('#artUseScene').click();
  await page.locator('#creationWorkspace').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#creationActors canvas'));
  const scene = await page.evaluate(() => FG.creation.scene());
  assert.equal(scene.provenance.sourceRevisionId, rig);
  assert.ok(scene.actors[0].assetId.startsWith('art:rig:' + rig + ':'));
  return scene;
}

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
}

async function decorateWorld(page) {
  await openDetails(page, '#creationSceneOptions');
  await page.locator('#creationBackground').selectOption('world-moon-v1');
  await page.getByText('Decorate the world', { exact: true }).click();
  await page.locator('#creationSceneryType').selectOption('world-prop-rocket-v1');
  await page.locator('#creationAddScenery').click();
  await page.waitForFunction(() => FG.creation.scene().world?.scenery?.some(x => x.assetId === 'world-prop-rocket-v1'));
  await capture(page.locator('#creationStagePane .creation-stage-card'), 'b-moon-stage.png');
  await page.locator('#creationWorldFromArt').click();
  const picker = page.locator('#creationWorldDialog');
  await picker.getByRole('searchbox',{name:'Find my art'}).fill('Paper hills');
  await picker.locator('[data-world-art^="art:image:"]').filter({ hasText: 'Paper hills' }).click();
  await picker.waitFor({ state: 'hidden' });
  await page.locator('#creationWorldFraming').selectOption('fit');
  await page.waitForFunction(() => FG.creation.scene().world?.assetId?.startsWith('art:image:'));
  const custom = await page.evaluate(() => FG.creation.scene().world);
  await page.locator('#creationKeep').click();
  await capture(page.locator('#creationStagePane .creation-stage-card'), 'f-private-backdrop.png');
  checks.push('Changed illustrated world, added a rocket and used an exact private image as a fitted backdrop. Actor and decoration are independently represented.');
  return custom;
}

async function replaceWithArt(page, rock) {
  await openDetails(page, '#creationSceneOptions');
  const before = await page.evaluate(() => FG.creation.scene());
  await page.locator('#creationReplaceActorArt').click();
  const picker = page.locator('#creationVersionPicker');
  await picker.getByRole('combobox',{name:'Pictures to show'}).selectOption('recent');
  await picker.getByRole('searchbox',{name:'Find my art'}).fill('Moon rock');
  await picker.getByRole('combobox',{name:'Art collection'}).selectOption('prop');
  const pin = 'art:image:' + rock.id + ':' + rock.hash;
  const choice = picker.locator('[data-private-art="' + pin + '"]');
  await choice.waitFor();
  await capture(picker, 'd-picker.png');
  await choice.click();
  await picker.waitFor({ state: 'hidden' });
  const after = await page.evaluate(() => FG.creation.scene());
  assert.deepEqual(after.programs, before.programs);
  assert.deepEqual(after.actors.map(({ assetId, ...rest }) => rest), before.actors.map(({ assetId, ...rest }) => rest));
  assert.equal(after.actors[0].assetId, pin);
  await page.locator('#creationKeep').click();
  await page.locator('#creationRun').click();
  await page.waitForFunction(pin => {
    const frame = FG.creation.snapshot();
    return frame.timeMs > 100 && frame.actors[0].assetId === pin;
  }, pin);
  await page.locator('#creationPause').click();
  await capture(page.locator('#creationStagePane .creation-stage-card'), 'e-host-actor.png');
  await page.locator('#creationReset').click();
  checks.push('Replaced a scene actor with the searched revision. Actor identity, position and existing programs survived Keep.');
}

async function reuseWorld(page, title, keptWorld) {
  await page.locator('#creationBack').click();
  await page.locator('#creationFreeMode').click();
  await page.locator('[data-creation-starter="robot"]').click();
  const recipient = await page.evaluate(() => FG.creation.scene());
  await openDetails(page, '#creationSceneOptions');
  await openDetails(page, '#creationUseSavedWorld');
  await page.locator('#creationKeptWorlds').getByRole('button', {name:title, exact:true}).click();
  await page.waitForFunction(id => FG.creation.scene().world?.assetId === id, keptWorld.assetId);
  const scene = await page.evaluate(() => FG.creation.scene());
  assert.deepEqual(scene.actors, recipient.actors);
  assert.deepEqual(scene.programs, recipient.programs);
  assert.equal(scene.world.scenery[0].assetId, keptWorld.scenery[0].assetId);
  await page.locator('#creationKeep').click();
  checks.push('Copied the kept custom world into a second scene while keeping its own actors and their programs.');
}

async function inspectScene(page, expected) {
  await page.locator('#creationMore').locator(':scope > summary').click();
  const event = page.waitForEvent('download');
  await page.locator('#creationDownload').click();
  const artifact = await event;
  const bundle = JSON.parse(await fs.readFile(await artifact.path(), 'utf8'));
  assert.deepEqual(bundle.scene.world, expected.world);
  assert.equal(bundle.scene.actors[0].assetId, expected.pin);
  assert.equal(bundle.art.drawings.find(x => x.id === expected.gem.id)?.sha256, expected.gem.hash);
  assert.ok(bundle.art.rigs.some(x => x.id === expected.rig));
  await page.locator('#creationMore > summary').click();
  checks.push('Portable scene export contains the selected picture, movement revision and world references.');
}

async function isolation(page) {
  await page.locator('#creationHome').click();
  await openProfiles(page);
  await page.locator('#profile-choices .profile-choice').nth(1).click();
  await page.waitForFunction(() => FG.store.current().id === 'player2');
  await exploreWelcome(page);
  await page.locator('#studioArt').click();
  await page.locator('#artEmpty').waitFor({ state: 'visible' });
  assert.deepEqual(await savedDrawings(page), []);
  checks.push('Second profile has an empty art shelf after all seven subjects and the scene were saved by the first profile.');
}

async function journey(page, base) {
  await page.goto(base + '?art=1');
  await ready(page);
  const { original, gem } = await makeRock(page);
  const rockRig = await animate(page, gem, 'Bounce');
  const originalScene = await sceneFromSelectedArt(page, rockRig);
  await page.locator('#creationKeep').click();
  await page.locator('#creationHome').click();
  await exploreWelcome(page);
  await page.locator('#studioArt').click();

  for (const [subject, move] of [['dragon','Float'],['car','Right'],['rocket','Jump'],['robot','Dance'],['butterfly','Spin'],['imaginary','Shake']]) {
    const saved = await uploadSubject(page, subject);
    await animate(page, saved, move);
    checks.push(subject + ': uploaded transparent bytes, observed changing preview frames for ' + move + ', saved the movement and rechecked byte fidelity.');
  }
  await uploadPaperHills(page);
  await page.locator('#artSearch').fill('Moon rock');
  await page.locator('.art-card').filter({ hasText: 'Pebble with a gem' }).click();
  const revisedRig = await animate(page, gem, 'Spin');
  assert.notEqual(revisedRig, rockRig);
  await page.locator('#artHome').click();
  await navigate(page, '#studioNavScenes');
  if (await page.locator('#creationIntroduction').isVisible()) await page.locator('#creationIntroSkip').click();
  await page.locator('#creationFreeMode').click();
  await page.locator('#creationSaved .creation-saved-card').filter({hasText: originalScene.title}).click();
  assert.equal(await page.evaluate(() => FG.creation.scene().actors[0].assetId), originalScene.actors[0].assetId);
  checks.push('Saved scene reopened with its first movement pin after a second version was created.');

  // The existing creation-private-art fixture uses a just-completed synthetic practice
  // window so recordings exercise playback without an unrelated random checkpoint.
  await page.evaluate(() => {
    FG.store.changeProfile({rate: 1});
    FG.store.current().mathWindow = [Date.now()];
    FG.store.save();
  });
  const before = await page.evaluate(() => FG.creation.snapshot().actors[0]);
  await page.locator('#creationRun').click();
  await page.waitForFunction(before => {
    const actor = FG.creation.snapshot()?.actors[0];
    return actor && (actor.y !== before.y || actor.jumpOffset !== before.jumpOffset);
  }, before);
  await page.locator('#creationPause').click();
  const paused = await page.evaluate(() => FG.creation.snapshot());
  await capture(page.locator('#creationCanvas'), 'c-motion-frame-paused.png');
  await page.locator('#creationReset').click();
  await capture(page.locator('#creationCanvas'), 'c-motion-frame-rest.png');
  assert.notEqual(paused.timeMs, 0);
  await page.evaluate(() => {
    const stream = document.getElementById('creationCanvas').captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks = [];
    window.universeRecording = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onerror = reject;
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      };
    });
    window.stopUniverseRecording = () => recorder.stop();
    recorder.start();
  });
  await page.locator('#creationRun').click();
  await page.waitForFunction(() => FG.creation.snapshot()?.status === 'completed');
  await page.evaluate(() => window.stopUniverseRecording());
  const video = Buffer.from(await page.evaluate(() => window.universeRecording), 'base64');
  assert.ok(video.length > 2000);
  await fs.writeFile(path.join(output, 'c-pebble-scene.webm'), video);
  await page.locator('#creationReset').click();
  const custom = await decorateWorld(page);
  await inspectScene(page, { world: custom, pin: originalScene.actors[0].assetId, gem, rig: rockRig });
  await replaceWithArt(page, gem);
  await reuseWorld(page, originalScene.title, custom);
  assert.deepEqual((await savedDrawings(page)).find(x => x.id === original.id), original);
  await isolation(page);
}

async function touchJourney(browser, base, label, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const requests = [], errors = [];
  const origin = new URL(base).origin;
  await localOnly(context, origin, requests);
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(base + '?art=1');
    await ready(page);
    const source = await uploadSubject(page, 'imaginary');
    await page.locator('#artAnimatePath').scrollIntoViewIfNeeded();
    await page.locator('#artAnimatePath').tap();
    const editor = page.locator('#artAnimationPath');
    const move = editor.locator('[data-move="path"]');
    await move.tap();
    await editor.getByText('Choose spots with buttons').tap();
    const spot = name => editor.getByRole('button', { name, exact: true }).tap();
    await spot('Top left');
    assert.equal(await editor.locator('[data-save]').isDisabled(), true);
    await spot('Middle');
    await spot('Bottom right');
    await editor.locator('[data-undo]').tap();
    await spot('Top right');
    await editor.locator('[data-pace]').selectOption('2400');
    await editor.locator('[data-play]').tap();
    await editor.locator('[data-pause]').tap();
    assert.equal(await editor.locator('[data-pause]').textContent(), 'Resume');
    const pauseBox = await editor.locator('[data-pause]').boundingBox();
    assert.ok(pauseBox.height >= 44);
    assert.ok(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await editor.locator('header').scrollIntoViewIfNeeded();
    await capture(page, 'c-path-' + label + '.png');
    await editor.locator('[data-save]').tap();
    await editor.waitFor({ state: 'detached' });
    await page.waitForFunction(() => Boolean(document.getElementById('artVersion')?.value));
    const kept = await page.locator('#artVersion').inputValue();
    await page.locator('#artAnimatePath').tap();
    await editor.locator('[data-move="spin"]').tap();
    await editor.locator('[data-close]').tap();
    await editor.waitFor({ state: 'detached' });
    await page.reload();
    await ready(page);
    await page.locator('.art-card').filter({ hasText: source.name }).tap();
    assert.equal(await page.locator('#artVersion').inputValue(), kept);
    await page.locator('#artAnimatePath').tap();
    assert.equal(await editor.locator('[data-move="path"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await editor.locator('[data-pace]').inputValue(), '2400');
    assert.deepEqual(await savedDrawings(page), [source]);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    checks.push(label + ' ' + viewport.width + '×' + viewport.height + ': tapped a path, corrected one spot, paused, kept, canceled another move and reopened the exact saved path after reload.');
  } catch (error) {
    const [page] = context.pages();
    if (page) {
      console.error(label, await page.locator('#artStatus').textContent(), errors);
      await page.screenshot({path: path.resolve('test-results/connected-universe-' + label + '-failure.png')}).catch(() => {});
    }
    throw error;
  } finally { await context.close(); }
}

async function localOnly(context, origin, unexpected) {
  await context.route('**/*', route => {
    const request = route.request(), uri = new URL(request.url());
    if (uri.protocol === 'blob:' || uri.protocol === 'data:') return route.continue();
    if (uri.origin !== origin || request.method() !== 'GET') {
      unexpected.push(request.method() + ' ' + uri.origin + uri.pathname);
      return route.abort();
    }
    if (uri.pathname.endsWith('/factory-config.json')) return route.fulfill({ json: { version: 1, mode: 'unavailable' } });
    return route.continue();
  });
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = start(process.env.UNIVERSE_BUILD || 'dist');
  if (!server.listening) await once(server, 'listening');
  let browser;
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/arcade/';
    const origin = new URL(base).origin;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const unexpected = [], errors = [];
    await localOnly(context, origin, unexpected);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => void dialog.accept());
    try {
      await journey(page, base);
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      await touchJourney(browser, base, 'phone', { width: 390, height: 844 });
      await touchJourney(browser, base, 'tablet', { width: 820, height: 1180 });
      const frontend = {};
      const bundleRoot = path.join(process.env.UNIVERSE_BUILD || 'dist', 'assets');
      for (const name of await fs.readdir(bundleRoot)) {
        if (/^index-.+\.(js|css)$/.test(name)) {
          const bytes = await fs.readFile(path.join(bundleRoot, name));
          frontend[name] = createHash('sha256').update(bytes).digest('hex');
        }
      }
      assert.ok(Object.keys(frontend).length >= 2, 'record the exercised frontend bundle identity');
      const evidence = {
        browser: await browser.version(), frontend, desktop: page.viewportSize(),
        touchViewports: ['390x844', '820x1180'], externalRequests: unexpected, pageErrors: errors,
        checks, screenshots, recordings: ['c-pebble-scene.webm']
      };
      await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
      console.log(JSON.stringify(evidence, null, 2));
    } catch (error) {
      await page.screenshot({ path: path.resolve('test-results/connected-universe-failure.png') }).catch(() => {});
      console.error({ stage: checks.at(-1), pageErrors: errors, requests: unexpected, title: await page.title() });
      throw error;
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
