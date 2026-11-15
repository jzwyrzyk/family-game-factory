# Approved PRs 11–13: production evidence

Published commit: `b69dc71f041c6849527fa0521cf9dbb1b1d7889b`.
[Pages run 43680104340](https://github.com/jzwyrzyk/family-game-factory/actions/runs/43680104340) passed the production build, 41 unit tests, complete browser suite and deployment. The owner explicitly approved these three PRs and Pages deployment. Main matches the tested integration tree. No backend service was deployed.

Target: https://jzwyrzyk.github.io/family-game-factory/ . The public build marker reports the exact SHA and `dirty:false`. All 31 published files match Pages artifact 14147857995 byte-for-byte, including HTML, CSS, JavaScript, service worker, manifest and all 23 original PNGs. `factory-config.json` remains `{"version":1,"mode":"unavailable"}`. See asset-proof.json.

Live Playwright verification used copies of the committed restored-games, construction-touch, private-drawings, learning-repair and offline-shell tests, changing the base URL and screenshot names and asserting the exact public build SHA before gameplay. Chromium used this workspace's inspection proxy public-key pin; production TLS was unchanged. These checks used fresh synthetic browser profiles and generated sample images, not existing children's data.

- Three original games: idle Dragon defeat, player-reflection win, endless Splash levels, locked selection, optional randomizer, food particles, construction assembly/win/reload. Desktop and mobile logs are recorded separately from the CI suite.
- Construction: Chromium touch-event drag/rotate, keyboard assembly, gum undo/refund, actual rocket → submarine → robot progression.
- Private drawings, desktop and mobile: upload, original-preserving cutout, visible build decoration, scoped reload/profile switch, export/delete, invalid bytes rejection; no network uploads.
- Shared learning: exact fact target, hints, both consequence modes, independent/assisted evidence and backup/reload.
- Offline: original artwork and native gameplay with the browser network disconnected; private paths excluded.
- Upgrade: a persistent test browser was prepared on `ee14a893` before publication. After publication, the actual Update arcade button activated the new service worker. The test verified the new SHA, exact preservation of the synthetic saved profile and removal of the obsolete cache.

Screenshots were inspected for styling, original artwork, touch controls, pictured construction goals and preserved drawing appearance. Mobile evidence is 390×844 Chromium viewport emulation, not a physical Android or iOS test. No real-model generation, authenticated cloud synchronization or full gVisor browser-runner success is claimed.

Prior reviewed, deployed and live-verified rollback: `ee14a89311cb31353bbeb1481ddcba073c8ea00c`. Use a reviewed main change and existing Pages gates for rollback; preserve browser data.
