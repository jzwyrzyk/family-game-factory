import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPalArtworkResolver, PAL_ARTWORK_ASSET_VERSION, PAL_ARTWORK_FORMS, PAL_ARTWORK_EXPRESSIONS,
  type PalArtworkAsset, type PalArtworkExpression, type PalArtworkForm, type PalArtworkResolver, type PalArtworkResolution } from '../src/pals/artwork';
import { createPalExpressionController, type PalExpressionClock, type PalExpressionState } from '../src/pals/expressions';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const keys = ['fixture-selected/A', 'fixture-selected/B'];
function fixtureAsset(slug: string, form: PalArtworkForm, expression: PalArtworkExpression): PalArtworkAsset {
  const sourceSHA256 = digest(`${slug}/${form}/${expression}`);
  const stateName = expression === 'encouraging_retry' ? 'encouraging-retry' : expression;
  return { form, expression, url: `jems-pals/${slug}/${form}/${stateName}-${sourceSHA256.slice(0, 12)}.webp`,
    sourceSHA256, exportedSHA256: digest(`export/${sourceSHA256}`), width: form === 'base' ? 640 : 1200,
    height: 800, alpha: true, decodedPixelParity: true, decodedRGBA8SHA256: digest(`rgba/${sourceSHA256}`), sourceBytes: 2000, exportedBytes: 1000 };
}
function fixture() {
  return { schemaVersion: 1, assetVersion: PAL_ARTWORK_ASSET_VERSION,
    scope: { id: 'test-approved', characterCount: 2, assetCount: 16 },
    characters: keys.map((characterKey, index) => {
      const slug = `fixture-${index ? 'b' : 'a'}`;
      const forms = Object.fromEntries(PAL_ARTWORK_FORMS.map(form => {
        const expressions = Object.fromEntries(PAL_ARTWORK_EXPRESSIONS.map(expression => [expression, fixtureAsset(slug, form, expression)])) as Record<PalArtworkExpression, PalArtworkAsset>;
        return [form, { neutralFallback: expressions.neutral.url, neutralSourceSHA256: expressions.neutral.sourceSHA256, expressions }];
      })) as Record<PalArtworkForm, { neutralFallback: string; neutralSourceSHA256: string; expressions: Partial<Record<PalArtworkExpression, PalArtworkAsset>> }>;
      return { characterKey, speciesId: null, slug, name: `Fixture ${index + 1}`, forms };
    }) };
}
const resolver = () => createPalArtworkResolver(fixture())!;
const context = (form: PalArtworkForm = 'base', characterKey = keys[0], scope = 'family/player1') => ({ scope, characterKey, form });
const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
class Clock implements PalExpressionClock {
  now = 0; nextId = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  setTimeout(callback: () => void, delayMs: number) { const id = ++this.nextId; this.tasks.set(id, { at: this.now + delayMs, callback }); return id; }
  clearTimeout(handle: unknown) { this.tasks.delete(handle as number); }
  async advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const next = [...this.tasks.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].callback(); await flush();
    }
    this.now = target; await flush();
  }
}
function harness(selected: PalArtworkResolver = resolver(), loadTimeoutMs = 1000) {
  const clock = new Clock(), states: PalExpressionState[] = [];
  const loads: { asset: PalArtworkAsset; signal: AbortSignal; resolve: () => void; reject: (reason?: unknown) => void }[] = [];
  const controller = createPalExpressionController({ resolver: selected, clock, loadTimeoutMs,
    onChange: state => states.push(state), load: (asset, signal) => new Promise<void>((resolve, reject) => loads.push({ asset, signal, resolve, reject })) });
  return { controller, clock, states, loads };
}

test('artwork resolves exact character, form and state without a legacy identity mapping', () => {
  const r = resolver();
  for (const characterKey of keys) for (const form of PAL_ARTWORK_FORMS) for (const expression of PAL_ARTWORK_EXPRESSIONS) {
    const result = r.resolve({ characterKey, form, expression })!;
    assert.equal(result.characterKey, characterKey); assert.equal(result.form, form); assert.equal(result.expression, expression);
    assert.equal(result.asset.form, form); assert.equal(result.asset.expression, expression); assert.equal(result.fallbackReason, null);
  }
  for (const characterKey of ['glim', 'kip', 'riff', 'brio', 'Fixture 1', 'fixture-a', keys[0].toLowerCase(), 'unknown']) {
    assert.equal(r.resolve({ characterKey, form: 'base', expression: 'neutral' }), null);
  }
  assert.equal(r.resolve({ characterKey: keys[0], form: 'growth' as PalArtworkForm, expression: 'neutral' }), null);
  assert.equal(r.resolve({ characterKey: keys[0], form: 'base', expression: 'happy' as PalArtworkExpression }), null);
});

test('a missing approved state falls back only to that character and form neutral', () => {
  const raw = fixture(); delete raw.characters[0].forms.mature.expressions.thinking; raw.scope.assetCount--;
  const r = createPalArtworkResolver(raw)!;
  const result = r.resolve({ characterKey: keys[0], form: 'mature', expression: 'thinking' })!;
  assert.equal(result.expression, 'neutral'); assert.equal(result.requestedExpression, 'thinking');
  assert.equal(result.fallbackReason, 'expression-unavailable'); assert.equal(result.form, 'mature');
  assert.equal(result.asset.sourceSHA256, raw.characters[0].forms.mature.neutralSourceSHA256);
  assert.notEqual(result.asset.sourceSHA256, raw.characters[0].forms.base.neutralSourceSHA256);
});

test('wrong versions, ambiguous identities, swapped state URLs and cross-form references fail closed', () => {
  const cases: [string, (raw: ReturnType<typeof fixture>) => void][] = [
    ['version', raw => { raw.assetVersion = 'unreviewed'; }],
    ['duplicate identity', raw => { raw.characters[1].characterKey = raw.characters[0].characterKey; }],
    ['duplicate slug', raw => { raw.characters[1].slug = raw.characters[0].slug; }],
    ['cross form', raw => { raw.characters[0].forms.base.expressions.thinking = raw.characters[0].forms.mature.expressions.thinking; }],
    ['swapped URL declaration', raw => { const a = raw.characters[0].forms.base.expressions.thinking!; (a as { url: string }).url = a.url.replace('/thinking-', '/celebrate-'); }],
    ['remote URL', raw => { (raw.characters[0].forms.base.expressions.neutral! as { url: string }).url = 'https://example.com/neutral.webp'; }],
    ['wrong neutral fallback', raw => { raw.characters[0].forms.base.neutralFallback = raw.characters[1].forms.base.neutralFallback; }],
    ['wrong neutral hash', raw => { raw.characters[0].forms.base.neutralSourceSHA256 = '0'.repeat(64); }],
    ['missing neutral', raw => { delete raw.characters[0].forms.base.expressions.neutral; raw.scope.assetCount--; }],
    ['false count', raw => { raw.scope.assetCount++; }],
  ];
  for (const [name, change] of cases) { const raw = fixture(); change(raw); assert.equal(createPalArtworkResolver(raw), null, name); }
  const raw = fixture(), r = createPalArtworkResolver(raw)!;
  raw.characters[0].forms.base.expressions.neutral = fixtureAsset('fixture-b', 'base', 'neutral');
  assert.equal(r.resolve({ characterKey: keys[0], form: 'base', expression: 'neutral' })!.slug, 'fixture-a');
  assert.ok(Object.isFrozen(r.manifest.characters[0].forms.base.expressions.neutral));
});

test('the shipped manifest exposes exactly 184 approved assets through the same typed resolver', () => {
  const raw = JSON.parse(readFileSync(new URL('../public/jems-pals/manifest.json', import.meta.url), 'utf8'));
  const r = createPalArtworkResolver(raw);
  assert.ok(r, 'exporter output must satisfy the runtime resolver contract');
  assert.equal(r.manifest.characters.length, 23); assert.equal(r.manifest.scope.assetCount, 184);
  const urls = new Set<string>();
  for (const character of r.manifest.characters) for (const form of PAL_ARTWORK_FORMS) for (const expression of PAL_ARTWORK_EXPRESSIONS) {
    const selected: PalArtworkResolution = r.resolve({ characterKey: character.characterKey, form, expression })!;
    assert.equal(selected.fallbackReason, null); assert.equal(selected.expression, expression);
    assert.equal(selected.asset.form, form); urls.add(selected.asset.url);
  }
  assert.equal(urls.size, 184); assert.ok(r.manifest.characters.every(character => character.slug !== 'brio'));
  assert.equal(r.resolve({ characterKey: 'glim', form: 'base', expression: 'celebrate' }), null);
});

test('latest character/form request wins before or after delayed image decoding', async () => {
  const h = harness();
  const old = h.controller.setContext(context('base'));
  assert.equal(h.controller.state.status, 'loading'); assert.equal(h.controller.state.artwork, null);
  const current = h.controller.setContext(context('mature', keys[1]));
  assert.ok(h.loads[0].signal.aborted); h.loads[0].resolve(); await flush();
  assert.equal(h.controller.state.status, 'loading'); assert.equal(h.controller.state.artwork, null);
  h.loads[1].resolve(); assert.equal(await old, false); assert.equal(await current, true);
  assert.equal(h.controller.state.artwork!.characterKey, keys[1]); assert.equal(h.controller.state.artwork!.form, 'mature');
  const thinking = h.controller.preview('thinking'), celebrate = h.controller.preview('celebrate');
  h.loads[3].resolve(); assert.equal(await celebrate, true); h.loads[2].resolve(); assert.equal(await thinking, false);
  assert.equal(h.controller.state.artwork!.expression, 'celebrate');
  h.controller.dispose();
});

test('a failed expression loads its exact own-form neutral and preserves the requested state', async () => {
  const h = harness(); const initial = h.controller.setContext(context('mature')); h.loads[0].resolve(); await initial;
  const requested = h.controller.preview('thinking'); h.loads[1].reject(Error('decode failed')); await flush();
  assert.equal(h.loads[2].asset.form, 'mature'); assert.equal(h.loads[2].asset.expression, 'neutral');
  assert.equal(h.loads[2].asset.sourceSHA256, h.loads[0].asset.sourceSHA256);
  h.loads[2].resolve(); assert.equal(await requested, true);
  assert.equal(h.controller.state.requestedExpression, 'thinking'); assert.equal(h.controller.state.artwork!.expression, 'neutral');
  assert.equal(h.controller.state.artwork!.fallbackReason, 'image-load-failed'); assert.equal(h.controller.state.failure, 'load-failed');
  h.controller.dispose();
});

test('switching context cancels an in-flight neutral fallback without leaking its frame', async () => {
  const h = harness(); const initial = h.controller.setContext(context()); h.loads[0].resolve(); await initial;
  const failed = h.controller.preview('celebrate'); h.loads[1].reject(); await flush();
  const switched = h.controller.setContext(context('base', keys[1], 'family/player2'));
  assert.ok(h.loads[2].signal.aborted); h.loads[2].resolve(); await flush();
  assert.equal(h.controller.state.artwork, null);
  h.loads[3].resolve(); assert.equal(await switched, true); assert.equal(await failed, false);
  assert.equal(h.controller.state.artwork!.characterKey, keys[1]); assert.equal(h.controller.state.context!.scope, 'family/player2');
  h.controller.dispose();
});

test('hung loads have bounded cancellation and do not substitute a foreign asset', async () => {
  const h = harness(resolver(), 100); const initial = h.controller.setContext(context()); h.loads[0].resolve(); await initial;
  const requested = h.controller.preview('celebrate'); await h.clock.advance(100);
  assert.ok(h.loads[1].signal.aborted); assert.equal(h.loads[2].asset.expression, 'neutral');
  await h.clock.advance(100); assert.equal(await requested, false);
  assert.ok(h.loads[2].signal.aborted); assert.equal(h.controller.state.status, 'unavailable');
  assert.equal(h.controller.state.failure, 'load-timeout'); assert.equal(h.controller.state.artwork, null);
  const events = h.states.length; h.loads[1].resolve(); h.loads[2].resolve(); await flush(); assert.equal(h.states.length, events);
  assert.equal(h.clock.tasks.size, 0);
  // An explicit reset retries the same context; a passive update does not replay it.
  assert.equal(await h.controller.setContext(context()), false); assert.equal(h.loads.length, 3);
  const retry = h.controller.reset(); h.loads[3].resolve(); assert.equal(await retry, true);
  h.controller.dispose();
});

test('reaction expiry starts after decode; reduced motion changes presentation only', async () => {
  const h = harness(); const initial = h.controller.setContext(context()); h.loads[0].resolve(); await initial;
  const reacted = h.controller.react('saved-success', 250); await h.clock.advance(200);
  assert.equal(h.controller.state.status, 'loading'); h.loads[1].resolve(); await reacted;
  h.controller.setReducedMotion(true);
  assert.equal(h.controller.state.artwork!.expression, 'celebrate'); assert.equal(h.controller.state.reaction, 'saved-success');
  await h.clock.advance(249); assert.equal(h.controller.state.status, 'ready');
  await h.clock.advance(1); assert.equal(h.loads[2].asset.expression, 'neutral'); h.loads[2].resolve(); await flush();
  assert.equal(h.controller.state.artwork!.expression, 'neutral'); assert.equal(h.controller.state.reaction, null);
  assert.equal(h.controller.state.reducedMotion, true);
  h.controller.dispose();
});

test('manual selection cancels earlier expiry and does not react to an unknown trigger', async () => {
  const h = harness(); const initial = h.controller.setContext(context()); h.loads[0].resolve(); await initial;
  const reacted = h.controller.react('explicit-retry', 500); h.loads[1].resolve(); await reacted;
  await h.clock.advance(200); const preview = h.controller.preview('thinking'); h.loads[2].resolve(); await preview;
  await h.clock.advance(10_000); assert.equal(h.loads.length, 3); assert.equal(h.controller.state.artwork!.expression, 'thinking');
  assert.equal(await h.controller.react('child-is-sad' as never), false); assert.equal(h.loads.length, 3);
  assert.equal(h.controller.state.artwork!.expression, 'thinking'); h.controller.dispose();
});

test('hide, reset and dispose cancel pending work and never replay a hidden reaction', async () => {
  const h = harness(); const pending = h.controller.setContext(context());
  await h.controller.setVisible(false); assert.ok(h.loads[0].signal.aborted); assert.equal(h.controller.state.artwork, null);
  const hiddenEvents = h.states.length; h.loads[0].resolve(); await pending; assert.equal(h.states.length, hiddenEvents);
  assert.equal(await h.controller.react('explicit-celebrate'), false);
  const show = h.controller.setVisible(true); assert.equal(h.loads[1].asset.expression, 'neutral'); h.loads[1].resolve(); await show;
  const thinking = h.controller.preview('thinking'), reset = h.controller.reset();
  assert.ok(h.loads[2].signal.aborted); h.loads[2].resolve(); h.loads[3].resolve(); await thinking; await reset;
  const last = h.controller.preview('encouraging_retry'); h.controller.dispose();
  const disposedEvents = h.states.length; assert.ok(h.loads[4].signal.aborted); h.loads[4].reject(); await last;
  await h.clock.advance(30_000); await h.controller.setContext(context()); await h.controller.preview('celebrate');
  await h.controller.setVisible(true); await h.controller.reset(); h.controller.setReducedMotion(true);
  assert.equal(h.states.length, disposedEvents); assert.equal(h.clock.tasks.size, 0); assert.equal(h.controller.state.artwork, null);
});
