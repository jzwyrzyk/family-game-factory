# Private artwork in 2D games

## A saved game's editable companion

In a game with an editable companion, open **Animate & code**. Choose its character, then **Choose art for** that character. On a compact screen, open **Characters & tools** first. The picker shows the current player's artwork and saved designs. Cancelling preserves the current version. The chosen original, derivative or cutout supplies the appearance to the trusted Creative Studio renderer. The actor ID, movement, touches, other blocks and game provenance retain their saved values. A prepared movement design in this appearance slot uses its selected pose. The companion's blocks continue to control motion. Undo, Keep, reload and scene history use the ordinary scene workspace. The original executable game remains available from **Back to my game**.

Fresh generated companions can select the versioned Jems forest, workshop, cloud and moon settings. Earlier scene backgrounds still resolve by their saved IDs. The generated companion must pass the existing bundled-catalogue manifest validator before import. The host uses the current profile at selection, resolution and mutation and verifies the exact image/rig hash through the private-art adapter. Neither the child’s selection nor their edited companion goes back to the generator. A game with no companion continues to offer a separate scene starter.

All new generated modules use the bounded 2D canvas. The preflight flags true 3D movement, meshes, models and engines as unsupported for these games. A flat drawing of a model remains valid. Lighting, shadows, isometric illustration and parallax work in 2D. Existing v1 and saved v2 games retain their runtime/version handling. The standard and premium generation instructions reserve original private artwork for the trusted host and prohibit invented or redrawn substitutes.

## Offline qualification of an executable game

The standalone loopback review exercises one exact generated-module-v2-format game through the archived worker. It uses the checked-in, hand-authored illustrated-game fixture, synthetic drawing and approved workshop. A fresh selection stores its exact hash in an ordinary owner-scoped Creation revision. An explicit new selection creates a revision. Reopening the review loads the saved pin. The review uses an isolated synthetic owner on its own loopback origin and reads no family records.

| Component | Qualified scope |
| --- | --- |
| Game | Source SHA-256 `07913b47e7291c6f6dcc42dcf196ab33becf8c1cdeeb6f71dc841466819b8c80`. The offline server refuses other source digests. |
| Simulation | Pinned worker `quality-runtime-v2.1.0`, package SHA-256 `6a214bbed95e8ec138f78bad2f86a26dee9fc271587a223c97b738b36c289fc0`, inside an opaque sandbox frame. |
| Delivery | The frame gets one message port. Host-to-frame messages are limited to left and right input. The relay accepts only the fixture's helper slot and forwards one bounded integer x-coordinate from its validated draw output. |
| Composition | The host draws the selected private representation at the slot position and preserves its aspect ratio. The fixed layer behind it is Gem Factory artwork SHA-256 `b6e81f59ab4d1e05475b85817264645ecda30ed105eb7934fcc69b956f065afe`. The frame and game receive no private IDs, pixels, names, URLs or owner tokens. |
| Failure and lifetime | A source mismatch stops loading before the frame opens. Invalid or missing replies, hash failures and timeouts clear the stage and stop play. Closing the parent releases the frame and port. |

Run the following commands from the application repository. The manual review starts on 127.0.0.1 port 4199. The automated check uses an ephemeral loopback port. A supported Playwright Chromium install or the repository's `CHROMIUM_PATH` override is required. The companion test uses the ordinary built application in `dist`.

```sh
node --import tsx tools/creative-game-review/serve.ts
npm run build
npm run test:generated-art
```

The ordinary application and shipping preview have no entry point to this fixture. The review server accepts local GETs for a fixed set of fixture files. Its geometry, scenery, reviewed slot and synthetic owner are deliberately fixed. Browser assertions cover actual motion and its rendered pixels, bounded messages, reopening the same pin, loss of exact source bytes, phone layout and host-only composition. The app companion fixture separately exercises cancellation, Undo, source ownership, Keep, movement, retained versions and reload. [Desktop review](desktop.png) · [Phone review](phone.png) · [Companion stage](companion.png)

## Proposed scope for a broader host renderer

A release reviewer would bind each supported slot to the signed game artifact revision, its approved worker/runtime digest, the public slot name, and its permitted transforms, layer and display bounds. The private host would record the owner's exact selected asset revision and content hash under that binding. The public slot would carry no identity or mechanics. The generated game would retain ownership of ordinary movement, collisions and scoring under the game contract. An explicit child selection would create a new host revision. Existing saved revisions would continue resolving their original pins, including archived art.

At play time the parent would verify the active family, profile, consent and game revision before resolving the local sprite. A dedicated, short-lived channel would carry bounded public game input and display transforms only. Profile changes, scene changes, pause/exit, consent withdrawal, hash mismatches and expiry would invalidate the channel and decoded canvases. A missing pin would offer restoration through My Art. Export, backup and import would use the same private-art reference validation, quota and lineage rules as scenes. Server-side asset URLs and general library enumeration have no role in this design. The prototype qualifies one slot and one motion axis only.

## Qualification before broader delivery

The app does not provide a general generated-game private asset service. Fitting a second game requires its own reviewed game revision, slot definitions, layer ordering, camera behavior, controls, and exact renderer contract. General release requires independent privacy and security review of tenant isolation, source/version binding, channel lifetime, frame limits, recovery, consent, replay and exclusion of private composited captures from provider requests, diagnostics and external reporting. Hosted DEV and TEST, interaction on physical devices and release approval remain outstanding. The synthetic review creates no learning, reward or Pal progression evidence and performs no paid operations.
