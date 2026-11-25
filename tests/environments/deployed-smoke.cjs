/** Deployed, disconnected frontend smoke. Never a complete TEST/live-provider approval. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { exploreWelcome, navigate } = require('../studio-entry.cjs');

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PRODUCTION_HOSTS = new Set([
  'jzwyrzyk.github.io',
  'factory-gateway-ola734esta-ul.a.run.app',
  'factory-preview-ola734esta-ul.a.run.app',
  'factory-coach-private-ola734esta-ul.a.run.app',
]);
const DEVICES = [
  { name: 'desktop', viewport: { width: 1400, height: 960 }, hasTouch: false },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true },
];
const INCOMPLETE = [
  'complete game mechanics and cross-feature regressions',
  'real AI conversation, generation, modification and spending controls',
  'private backend identities, profile isolation and remote persistence',
  'artwork upload, recovery, backup/restore and nonproduction reset',
  'complete Math, Language, coding, rewards and adult workspace acceptance',
  'actual-device microphone, audio and fullscreen behavior',
  'owner visual review, play quality, child enjoyment and learning effectiveness',
];

function configuration(env = process.env) {
  let base;
  try { base = new URL(env.JEMS_UAT_BASE_URL); } catch { throw Error('UAT_BASE_URL_REQUIRED'); }
  assert(!base.username && !base.password && !base.search && !base.hash, 'UAT_BASE_URL_INVALID');
  assert(!PRODUCTION_HOSTS.has(base.hostname) && !/(^|[.-])(prod|production)([.-]|$)/i.test(base.hostname), 'UAT_PRODUCTION_ORIGIN_FORBIDDEN');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if (local) {
    assert.equal(env.JEMS_UAT_ALLOW_LOCALHOST, 'true', 'UAT_LOCALHOST_REQUIRES_EXPLICIT_FLAG');
    assert(['http:', 'https:'].includes(base.protocol), 'UAT_BASE_URL_INVALID');
    assert(!env.JEMS_UAT_IAP_TOKEN, 'UAT_LOCALHOST_TOKEN_FORBIDDEN');
  } else {
    assert.equal(base.protocol, 'https:', 'UAT_HTTPS_REQUIRED');
    assert.equal(env.JEMS_UAT_ALLOWED_ORIGIN, base.origin, 'UAT_EXACT_ALLOWED_ORIGIN_REQUIRED');
  }
  assert(SHA.test(env.JEMS_UAT_SOURCE_SHA || ''), 'UAT_SOURCE_SHA_REQUIRED');
  assert(!env.JEMS_UAT_MANIFEST_SHA256 || DIGEST.test(env.JEMS_UAT_MANIFEST_SHA256), 'UAT_MANIFEST_SHA256_INVALID');
  assert(!env.JEMS_UAT_IAP_TOKEN || /^[A-Za-z0-9_.-]{20,8192}$/.test(env.JEMS_UAT_IAP_TOKEN), 'UAT_TOKEN_INVALID');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return { base, local, source: env.JEMS_UAT_SOURCE_SHA, expectedDigest: env.JEMS_UAT_MANIFEST_SHA256 || null,
    token: env.JEMS_UAT_IAP_TOKEN || null, output: env.JEMS_UAT_OUTPUT || 'test-results/environments',
    chromiumPath: env.CHROMIUM_PATH || undefined };
}

function identity(bytes, config) {
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (config.expectedDigest) assert.equal(digest, config.expectedDigest, 'UAT_MANIFEST_DIGEST_MISMATCH');
  let value;
  try { value = JSON.parse(bytes); } catch { throw Error('UAT_MANIFEST_INVALID'); }
  assert.equal(value.version, 1, 'UAT_MANIFEST_VERSION_INVALID');
  assert(['dev', 'test'].includes(value.environment), 'UAT_NONPRODUCTION_IDENTITY_REQUIRED');
  assert.equal(value.sourceSha, config.source, 'UAT_SOURCE_MISMATCH');
  assert(DIGEST.test(value.frontendSha256 || ''), 'UAT_FRONTEND_DIGEST_REQUIRED');
  assert(value.environment === 'test' ? value.prNumber === null : Number.isSafeInteger(value.prNumber) && value.prNumber > 0,
    'UAT_PR_IDENTITY_INVALID');
  assert.equal(value.backendPolicy, 'disconnected', 'UAT_DISCONNECTED_POLICY_REQUIRED');
  return { value, digest };
}

function requestAllowed(url, method, config) {
  const target = new URL(url);
  return target.origin === config.base.origin && ['GET', 'HEAD'].includes(method);
}

function anonymousDenied(response) {
  if ([401, 403].includes(response.status)) return true;
  if (![302, 303, 307].includes(response.status)) return false;
  try {
    const location = new URL(response.headers.get('location'));
    return location.protocol === 'https:' && location.hostname === 'accounts.google.com';
  } catch { return false; }
}

async function get(config, relative, optional = false) {
  const target = new URL(relative, config.base);
  assert.equal(target.origin, config.base.origin, 'UAT_CROSS_ORIGIN_METADATA_FORBIDDEN');
  const response = await fetch(target, {
    redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { 'Cache-Control': 'no-cache', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
  });
  if (optional && response.status === 404) return null;
  assert.equal(response.status, 200, 'UAT_METADATA_UNAVAILABLE');
  const limit = relative === 'jems-environment.json' ? 4 * 1024 * 1024 : 65536;
  const length = response.headers.get('content-length');
  assert(length === null || (/^\d+$/.test(length) && Number(length) <= limit), 'UAT_METADATA_OVERSIZED');
  assert(response.body, 'UAT_METADATA_EMPTY');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= limit, 'UAT_METADATA_OVERSIZED');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function verifyDeployment(config) {
  const manifest = identity(await get(config, 'jems-environment.json'), config);
  const factory = JSON.parse(await get(config, 'factory-config.json'));
  assert.equal(factory.version, 1, 'UAT_FACTORY_CONFIG_VERSION_INVALID');
  assert.equal(factory.mode, 'unavailable', 'UAT_DISCONNECTED_FACTORY_CONFIG_REQUIRED');
  assert.deepEqual(Object.keys(factory).sort(), ['mode', 'version'], 'UAT_REMOTE_CONFIG_FORBIDDEN');
  const infoBytes = await get(config, 'build-info.json', true);
  if (infoBytes) {
    const info = JSON.parse(infoBytes);
    assert.equal(info.sha, config.source, 'UAT_BUILD_SOURCE_MISMATCH');
    assert.equal(info.dirty, false, 'UAT_DIRTY_BUILD_FORBIDDEN');
  }
  return manifest;
}

async function geometry(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'UAT_HORIZONTAL_OVERFLOW');
}

async function journey(browser, config, device) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.hasTouch });
  // Playwright 1.56's serviceWorkers:'block' init script reads this getter
  // without a guard and throws in the app's sandboxed iframe. Deny registration
  // before page code runs while preserving the opaque-frame security boundary.
  await context.addInitScript(() => {
    let container;
    try { container = navigator.serviceWorker; } catch { return; }
    if (!container) return;
    Object.defineProperty(Object.getPrototypeOf(container), 'register', {
      configurable: false, writable: false,
      value: async () => { throw new DOMException('Offline registration is outside the frontend smoke lane.', 'NotAllowedError'); },
    });
  });
  const result = { device: device.name, viewport: device.viewport, status: 'running', checks: [],
    blockedRequests: 0, failedResponses: 0, runtimeErrors: 0, screenshots: [] };
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', () => { result.runtimeErrors++; });
  page.on('response', response => { if (response.status() >= 400) result.failedResponses++; });
  page.on('dialog', dialog => void dialog.dismiss());
  await context.routeWebSocket('**/*', socket => { result.blockedRequests++; socket.close(); });
  // A route header can otherwise propagate to redirects. fetch(maxRedirects:0)
  // terminates the authenticated request before a redirect is reconsidered here.
  await context.route('**/*', async route => {
    const request = route.request();
    if (!requestAllowed(request.url(), request.method(), config)) {
      result.blockedRequests++;
      return route.abort('blockedbyclient');
    }
    if (!config.token) return route.continue();
    const headers = { ...request.headers(), Authorization: `Bearer ${config.token}` };
    delete headers.authorization;
    const response = await route.fetch({ headers, maxRedirects: 0, timeout: 20000 });
    return route.fulfill({ response });
  });
  const capture = async name => {
    const filename = `${device.name}-${name}.png`;
    await page.screenshot({ path: path.join(config.output, filename), fullPage: true });
    result.screenshots.push(filename);
  };
  try {
    await page.goto(config.base.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.FG?.studio && window.FG?.runtime);
    await page.locator('#studioWelcome').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-welcome-character]').count(), 2);
    result.checks.push('fresh synthetic context and first-visit character selection');
    await exploreWelcome(page);
    await geometry(page);
    await capture('home');
    assert.deepEqual(await page.locator('#studioStarters [data-starter]').evaluateAll(nodes => nodes.map(node => node.dataset.starter)),
      ['factory', 'mining', 'gum', 'hill']);
    result.checks.push('homepage and current Ready to Play catalogue');

    await page.locator('#studioNavMenu').click();
    await page.locator('#studioMenuDialog').waitFor({ state: 'visible' });
    const bounds = await page.locator('#studioMenuDialog').boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= device.viewport.width + 1 &&
      bounds.y + bounds.height <= device.viewport.height + 1, 'UAT_MENU_OUTSIDE_VIEWPORT');
    await capture('menu');
    await page.keyboard.press('Escape');
    await page.locator('#studioMenuDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'studioNavMenu');
    await page.locator('#studioNavMenu').click();
    await page.locator('#studioMenuClose').click();
    await page.locator('#studioMenuDialog').waitFor({ state: 'hidden' });
    result.checks.push('menu opens, fits viewport, closes by Escape and explicit button, restores focus');

    for (const [control, target] of [
      ['studioNavNotifications', '#studioNotifications'], ['studioNavJourney', '#page-jems-journey'],
      ['studioNavRewards', '#page-jems-rewards'], ['studioNavPals', '#page-jems-pals'],
      ['studioNavScenes', '#page-creation'], ['studioMenuArt', '#page-art-studio'],
      ['studioNavProblemSolving', '#page-problem-solving'], ['studioMenuParent', '#page-parent'],
    ]) {
      await navigate(page, control);
      await page.locator(target).waitFor({ state: 'visible' });
      await page.locator('#studioMenuDialog').waitFor({ state: 'hidden' });
      await geometry(page);
      result.checks.push(`visible navigation: ${control}`);
    }
    await navigate(page, 'studioNavHome');
    await page.locator('#studioSavedIdeas').click();
    await page.locator('#page-creations').waitFor({ state: 'visible' });
    await geometry(page);
    result.checks.push('My Creations renders');
    await page.locator('#studioCollectionBack').click();
    await page.locator('#page-studio-library').waitFor({ state: 'visible' });

    await page.locator('[data-starter="factory"]').click();
    await page.waitForFunction(() => window.FG.runtime.snapshot()?.config.orderSize === 2);
    const initial = await page.evaluate(() => {
      const state = FG.runtime.snapshot().state;
      return { nextGem: state.nextGem, next: state.pattern.next, mistakes: state.sortingMistakes };
    });
    const action = initial.nextGem === initial.next ? 'route-return' : 'route-order';
    const button = page.locator(`.gem-factory .gf-sort-basket[data-action="${action}"]`);
    if (device.hasTouch) await button.tap(); else await button.click();
    await page.waitForFunction(before => {
      const state = FG.runtime.snapshot().state;
      return !state.sortingBusy && state.sortingMistakes === before + 1;
    }, initial.mistakes);
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.nextGem), initial.nextGem);
    await geometry(page);
    await capture('game-recovery');
    await navigate(page, 'studioNavHome');
    await page.locator('#page-studio-library').waitFor({ state: 'visible' });
    result.checks.push('native Factory accepts mouse/touch input, shows wrong-sort consequence, retains candidate and exits');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.FG?.studio);
    await page.locator('#page-studio-library').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#studioWelcome').isVisible(), false);
    result.checks.push('synthetic local character preference survives one reload');
    assert.equal(result.runtimeErrors, 0, 'UAT_RUNTIME_ERRORS');
    assert.equal(result.failedResponses, 0, 'UAT_FAILED_RESOURCE_RESPONSES');
    assert.equal(result.blockedRequests, 0, 'UAT_UNEXPECTED_NETWORK_REQUESTS');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    // Do not publish arbitrary page text, token-bearing URLs or response bodies.
    result.failure = { type: error.name === 'TimeoutError' ? 'timeout' : 'assertion-or-browser-error',
      afterCheck: result.checks.at(-1) || 'initial navigation' };
    await capture('failure').catch(() => {});
  } finally {
    await context.close();
  }
  return result;
}

async function main() {
  const config = configuration();
  fs.mkdirSync(config.output, { recursive: true });
  const report = { version: 1, lane: 'deployed-disconnected-frontend-smoke', sourceSha: config.source,
    startedAt: new Date().toISOString(), status: 'running', completeUatPassed: false,
    providerMode: 'disconnected-no-provider-calls', remoteDataMutated: false,
    localData: 'fresh disposable synthetic browser contexts only',
    serviceWorkers: 'registration disabled before page scripts; offline-cache acceptance is separate',
    privateAccess: config.local ? 'local-only-not-proven' : 'not-proven',
    acceptanceRemaining: INCOMPLETE, devices: [] };
  let browser;
  try {
    const before = await verifyDeployment(config);
    report.environment = before.value.environment;
    report.manifestSha256 = before.digest;
    report.frontendSha256 = before.value.frontendSha256;
    report.expectedManifestPinned = Boolean(config.expectedDigest);
    if (!config.local && config.token) {
      const response = await fetch(new URL('jems-environment.json', config.base),
        { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      assert(anonymousDenied(response), 'UAT_UNAUTHENTICATED_ACCESS_NOT_DENIED');
      report.privateAccess = 'authenticated-read-succeeded-and-anonymous-read-denied';
    }
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, executablePath: config.chromiumPath, args: ['--no-sandbox'] });
    for (const device of DEVICES) report.devices.push(await journey(browser, config, device));
    const after = await verifyDeployment(config);
    assert.equal(after.digest, before.digest, 'UAT_DEPLOYMENT_CHANGED_DURING_RUN');
    report.identityStable = true;
    report.status = report.devices.every(result => result.status === 'passed') ? 'passed' : 'failed';
  } catch {
    report.status = 'failed';
    report.failure = 'identity-authentication-network-or-browser-precondition-failed';
  } finally {
    if (browser) await browser.close();
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(config.output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ status: report.status, lane: report.lane, completeUatPassed: false,
    report: path.join(config.output, 'report.json') }));
  if (report.status !== 'passed') process.exitCode = 1;
}

module.exports = { configuration, identity, requestAllowed, anonymousDenied, INCOMPLETE };
if (require.main === module) main().catch(() => { console.error('UAT_CONFIGURATION_FAILED'); process.exitCode = 1; });
