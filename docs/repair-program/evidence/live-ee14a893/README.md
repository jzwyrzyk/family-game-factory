# Approved PRs 9 and 10: actual Pages verification

Published commit: `ee14a89311cb31353bbeb1481ddcba073c8ea00c`.
[Pages run 43677986300](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43677986300): build, npm test and deployment succeeded. Owner explicitly approved both PRs and deployment. PRs 11–13 are not included.

Target: https://jzwyrzyk.github.io/family-game-factory/ . `build-info.json` returned the expected SHA and `dirty:false`. All 31 files in Pages artifact 14146759595 were fetched from the public site and matched SHA-256 byte-for-byte; see asset-proof.json. This includes HTML, CSS, JavaScript, service worker, manifest and all 23 original PNGs.

`tests/restored-games.cjs`, `tests/learning-repair.cjs` and `tests/offline-shell.cjs` were replayed against that public URL using temporary copies with URL substitutions and screenshot filename prefixes. Chromium used the existing workspace inspection proxy's public-key pin for trust; production TLS settings were unchanged. The retained logs contain the actual successful results. No production account, existing child profile or stored user data was modified: test browser contexts were fresh.

Gameplay: idle Dragon defeat and player-reflection win; Splash locked choice, optional Down randomizer, seven levels and food particles; construction assembly, gum budget, win and reload; parent fact targeting, hints, both math consequence modes and backup; cached original artwork and native gameplay after browser network disconnection. These are behavioral Playwright checks, not just page launch checks. Images include in-play and terminal states.

Desktop 1280×900 and mobile 390×844 are Chromium viewport emulation, not physical Android Chrome or iOS Safari evidence. Actual-device audio, gestures and installation remain unverified. Screenshots were inspected for original artwork, styling and touch controls. The construction artwork/progression follow-up in PR 11 is deliberately absent from this deployed build.

Previous reviewed and live-verified rollback: `3e9825263da36bcb8fd24bd7def522c3ba1acd5d` (PR 8). A rollback must use a reviewed main change and the existing Pages workflow; preserve profile/revision data and export recovery.
