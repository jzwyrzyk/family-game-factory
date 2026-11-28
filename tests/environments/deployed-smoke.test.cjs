const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { configuration, identity, requestAllowed, anonymousDenied, closeJourneyContext, INCOMPLETE } = require('./deployed-smoke.cjs');
const SOURCE = 'a'.repeat(40);
const env = overrides => ({ JEMS_UAT_BASE_URL: 'https://jems-dev.example.test/',
  JEMS_UAT_ALLOWED_ORIGIN: 'https://jems-dev.example.test', JEMS_UAT_SOURCE_SHA: SOURCE, ...overrides });
const manifest = overrides => Buffer.from(JSON.stringify({ version: 1, environment: 'dev', sourceSha: SOURCE,
  frontendSha256: 'b'.repeat(64), prNumber: 123, backendPolicy: 'disconnected', ...overrides }));

test('production and unapproved origins are refused before network access', () => {
  for (const host of ['jzwyrzyk.github.io', 'factory-gateway-ola734esta-ul.a.run.app', 'prod.example.test']) {
    assert.throws(() => configuration(env({ JEMS_UAT_BASE_URL: `https://${host}/`, JEMS_UAT_ALLOWED_ORIGIN: `https://${host}` })));
  }
  assert.throws(() => configuration(env({ JEMS_UAT_ALLOWED_ORIGIN: 'https://other.example.test' })));
  assert.throws(() => configuration(env({ JEMS_UAT_BASE_URL: 'http://jems-dev.example.test/' })));
});

test('local checking requires an explicit flag and refuses cloud tokens', () => {
  const local = env({ JEMS_UAT_BASE_URL: 'http://127.0.0.1:8080/' });
  assert.throws(() => configuration(local));
  assert.equal(configuration({ ...local, JEMS_UAT_ALLOW_LOCALHOST: 'true' }).local, true);
  assert.throws(() => configuration({ ...local, JEMS_UAT_ALLOW_LOCALHOST: 'true', JEMS_UAT_IAP_TOKEN: 'a'.repeat(40) }));
});

test('redirect destinations and mutations cannot receive browser authentication', () => {
  const config = configuration(env());
  assert.equal(requestAllowed('https://jems-dev.example.test/asset.js', 'GET', config), true);
  assert.equal(requestAllowed('https://evil.example.test/asset.js', 'GET', config), false);
  assert.equal(requestAllowed('https://jems-dev.example.test:444/asset.js', 'GET', config), false);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(requestAllowed(config.base.href, method, config), false);
});

test('release identity rejects stale source, production, changed manifest and connected backends', () => {
  const config = configuration(env());
  assert.equal(identity(manifest(), config).value.prNumber, 123);
  for (const change of [{ sourceSha: 'c'.repeat(40) }, { environment: 'prod' }, { frontendSha256: 'latest' },
    { prNumber: null }, { backendPolicy: 'live' }]) assert.throws(() => identity(manifest(change), config));
  assert.throws(() => identity(manifest(), { ...config, expectedDigest: '0'.repeat(64) }));
  assert.equal(identity(manifest(), { ...config, expectedDigest: createHash('sha256').update(manifest()).digest('hex') }).value.sourceSha, SOURCE);
  assert.equal(identity(manifest({ environment: 'test', prNumber: null }), config).value.environment, 'test');
});

test('smoke does not claim full provider, device or learning acceptance', () => {
  assert(INCOMPLETE.some(value => value.includes('real AI')));
  assert(INCOMPLETE.some(value => value.includes('remote persistence')));
  assert(INCOMPLETE.some(value => value.includes('owner visual')));
});

test('ordinary redirects do not prove a private authentication boundary', () => {
  const response = (status, location) => ({ status, headers: new Headers(location ? { location } : {}) });
  assert(anonymousDenied(response(401)));
  assert(anonymousDenied(response(302, 'https://accounts.google.com/o/oauth2/auth')));
  assert.equal(anonymousDenied(response(200)), false);
  assert.equal(anonymousDenied(response(301, 'https://jems-dev.example.test/')), false);
  assert.equal(anonymousDenied(response(302, 'https://evil.example.test/login')), false);
});

test('teardown keeps the browser offline and waits for active authenticated routes before closing', async () => {
  const calls = [];
  const pending = Promise.withResolvers();
  const draining = Promise.withResolvers();
  const closing = closeJourneyContext({
    async setOffline(value) { assert.equal(value, true); calls.push('offline'); },
    async unrouteAll({ behavior }) {
      assert.equal(behavior, 'wait');
      calls.push('draining');
      draining.resolve();
      await pending.promise;
    },
    async close() { calls.push('closed'); },
  });
  await draining.promise;
  assert.deepEqual(calls, ['offline', 'draining']);
  pending.resolve();
  await closing;
  assert.deepEqual(calls, ['offline', 'draining', 'closed']);
});

test('teardown propagates drain failures and closes the context', async () => {
  let closed = false;
  await assert.rejects(closeJourneyContext({
    async setOffline() {},
    async unrouteAll() { throw Error('fixture drain failure'); },
    async close() { closed = true; },
  }), /fixture drain failure/);
  assert.equal(closed, true);
});
