# Draw a path

A child can open a picture or saved cutout in Creative Studio, select that actor, and choose **Draw a path**. Trace on the pad, tap destinations, or use the four direction buttons. The picture follows the end of the path on the pad. Undo step removes the most recent point. Give the path a name and choose its speed, then add it to the actor’s selected script. Play runs the sequence, including existing actions before it. With a private-art actor selected in reduced-motion mode, the first-steps play bar also exposes Step for deliberate 100 ms advances. The composer has no automatic playback.

## Persistence and reuse

The composer writes a named Repeat group containing at most 24 relative Move blocks. The scene’s fixed-clock interpreter executes position changes. Each segment has a saved duration in milliseconds. The actor’s image or rig ID and SHA-256 remain pinned. Its original and cutout pixels never enter the path data. Keep, draft recovery, undo, portable scene export and profile switching use the existing scene and artwork authorities.

Keep the scene to make its named paths available under **Paths from my kept scenes**. The picker reads the selected player’s explicitly kept revision. A path copied into another actor receives new block IDs and its own copy of the moves and timing. Later edits or removal of the source scene cannot change that copy. Only named child-authored groups made entirely of relative moves on a private-art actor are eligible. A group edited to depend on other scene objects, events or absolute positions stays in its source program.

The stage clamps playback to its own boundaries. The composer edits whole-actor translation. Independent joint animation and wheel physics continue to use the Drawing Lab’s rig contracts. Local samples do not attest hosted, real-device or family acceptance.

## Acceptance

- [Path and storage tests](../../tests/creation-motion-path.test.ts) cover deterministic timing, copied IDs, exact Keep selection, profile authorization, group eligibility and private manifest rejection.
- [Browser journey](../../tests/creation-motion-browser.cjs) exercises a synthetic transparent picture, path editing, reduced-motion stepping, ordinary playback, pixel-reference pinning, cross-scene reuse and undo. It writes screenshots to `test-results/creation-motion` by default.

The local production build at `fe015626a235e9f53928458f866eb7da6ecd1eae` passed the 90 Creative Studio unit checks and the focused mouse and keyboard journey. The screenshots show a synthetic transparent moon rock on a [desktop path pad](../creative-universe/evidence/motion/draw-a-path.png), the [390 px path pad](../creative-universe/evidence/motion/draw-a-path-phone.png) and the [completed scene](../creative-universe/evidence/motion/path-playback.png). The phone screenshot uses Chromium viewport emulation.

The first regression sweep found a smaller stage on the 768 × 1024 bundled starter when the reduced-motion shortcut appeared for every actor. Source `73779309bfa22cc45e65ecda9968e81e12a77643` confines the shortcut to private-art selections. The portrait learner journey and focused motion journey passed on that production build. All three motion screenshots matched the original evidence byte for byte.
