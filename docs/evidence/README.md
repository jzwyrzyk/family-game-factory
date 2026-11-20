# Synthetic validation evidence

## November 20, 2026 — adult AI continuity regression boundaries

[Issue #93](https://github.com/jzwyrzyk/family-game-factory/issues/93) follows a real operator complaint that each Jems update appeared to require reactivating AI. The new `scripts/deployment/test_continuity.py` exercises strict current-state classification, fail-closed policy/worker/WIF drift, secret-version inspection and sanitized read-only commands. The deployment tests additionally ensure an already-existing inactive or active Jems Cloud Run release is never silently republished with `FACTORY_ACTIONS_APPROVED=false` by the first-time bootstrap. These are deterministic **offline fixtures**; they do not prove model entitlement, production gVisor cleanup, a durable adult permit or actual in-place cloud upgrade. See [continuity contract](../assignment-006/RELEASE-CONTINUITY.md).

## Current Art Studio review

The refreshed drawing PR has its own [source-scoped evidence](../drawings/EVIDENCE.md), [feature contract](../drawings/ART_STUDIO.md) and production-browser captures. Those tests cover reusable private art, movement versions, native game/scene integration and recovery. The older Live Remix results below retain their original scope and counts.

## Earlier Live Remix evidence

Screenshots are captured by `tests/live-remix.cjs` using default pseudonymous profiles and synthetic “Donut Splash” game names. They contain no real child identities or uploaded artwork.

- [Desktop Live Remix](live-remix-desktop.png), Chromium, 1280×900 viewport
- [Mobile Live Remix](live-remix-mobile.png), Chromium touch context, 375×812 viewport
- [Desktop mocked builder](builder-desktop.png) and [mobile mocked builder](builder-mobile.png)
- [Mobile isolated star-catching preview](builder-preview-mobile.png)

## Local validation

Baseline: original v0.3 browser journeys passed before extraction on charter commit `518a68b`.

After implementation, `npm ci` and `npm test` pass:

```text
TypeScript strict check: passed
Vite production build: passed (relative assets served under /arcade/)
Unit and backend-contract tests: 19 passed, 0 failed
PASS: creation, remix, all games, math, parents, persistence, profiles, failed saves, mobile
PASS desktop: five real mutations, outcomes/coach, compare, undo/DAG, fork/reload, profile/math isolation, rejected edits, quota safety
PASS mobile: five real mutations, outcomes/coach, compare, undo/DAG, fork/reload, profile/math isolation, rejected edits, quota safety
PASS builder desktop: real mocked novel mechanic, browser-gated artifact, sandbox isolation, failure preservation, retry, keep/undo, cancellation, reload and authorization
PASS builder mobile: real mocked novel mechanic, browser-gated artifact, sandbox isolation, failure preservation, retry, keep/undo, cancellation, reload and authorization
SKIP real-agent smoke: no verified, funded production integration. No credentials read and no external agent request made.
```

The browser tests also verify combined parent JSON export/restore, old progress-only backup compatibility, v1 remix migration, and real builder/dragon parameter effects. They use actual controls and completed bucket rounds, not injected outcome callbacks. Unit tests separately use a fake plugin only to exercise lifecycle behavior (duplicate completion and disposal).

CI reproduces the same commands on Node 22 / Ubuntu 24.04 and uploads `test-results/` as `browser-evidence`. This evidence is for the implemented local configuration system. It does not claim arbitrary AI generation, production cloud security, full original-game fidelity, physical mobile-device/Safari validation or deployment.

The mocked builder tests also exercise compare and save-as-new, then verify private family authorization and scan the production JavaScript assets for server secrets and mock-agent implementation. The mock is explicitly labeled in the parent UI, including when reopening saved versions.

CI diagnosis: the runner had unpinned Chromium 157 installed at the system path, while Playwright 1.56.1 downloaded Chromium 141. The mocked browser gate timed out on that system engine. CI now explicitly uses Playwright’s pinned engine; a complete local Node 22 + Chromium 141 run passed without changing assertions.

## November 20, 2026 — Pal reduced-motion notification test gate

After merging Gem Pal expression assets and the learning-surface fixes, the exact-main Arcade `creative` job reproduced an intermittent assertion in `tests/pals-expressions-browser.cjs`: Playwright changed `prefers-reduced-motion` but the test checked Web Animations **before** Chromium's asynchronous `matchMedia` change event had reached the Pal controller. The production portrait already listens for that event and cancels its transition.

[PR #92](https://github.com/jzwyrzyk/family-game-factory/pull/92) now waits up to three seconds for the controller's observed reduced-motion state and its completed visual reset before asserting zero remaining animations. This retains the behavioral assertion and changes no game, artwork, stylesheet, approval or runtime animation policy. Source-only tests, even when green, do not validate physical-device motion or authorize deployment.
