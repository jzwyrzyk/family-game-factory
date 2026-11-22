# Mind Your Jems! — shared native play

Mind Your Jems is a prebuilt local game available from Ready to Play and, after an acknowledged build, through Play while I wait. Both modern entries use the same native runtime and fitted player. The November 22 navigation consolidation preserves the original tap/crystal/bank/grab rules described here; PR128's later movement/contact/level gameplay is separate. Its **This round** score and stars belong to the current mini-game session, separate from the lifetime gems shown in **My rewards**. They do not represent learning progress, influence build progress, or change the child's saved game.

## Visual contract

[The approved storyboard](reference-storyboard.png) is the production reference. The shipped game must preserve the reference's dimensional cartoon treatment: a cheerful miner, an expressive lavender rock giant, sculpted pink and mint hair, glossy colored crystals, a purple-and-gold minecart on a grassy ledge, and a lush floating-island world. Palette and subject matching alone do not satisfy this contract.

The live UI uses the existing `public/jems-logo.svg` without alteration. Dynamic scores, instructions, build status and controls remain semantic HTML. The game's rounded display font is locally served Fredoka; its SIL Open Font License ships alongside it. No runtime font or art CDN is used.

Production assets live in `public/art/mind-your-jems/`. They are reusable illustrated layers, not a flattened game mockup. `scene-art.md` and `miner-props-art.md` record generation references, prompts, atlas coordinates and export details. The game uses the optimized WebP assets and preserves their alpha. Source PNG masters were used for verification and are not duplicated in the runtime payload.

### Composition and behavior requirements

- The miner, crystals and ladder move with the rock through a shared scene transform. Placement transforms are separate from local animation transforms.
- Mining selects a strike pose; grabbing selects a holding pose; an unheld shake produces a harmless slip; banking and confirmed readiness select a celebration pose.
- The face has distinct idle, warning, happy and recovery expressions.
- The cart starts empty. Deposits add a visible gem pile and animate the transfer from the bag.
- Desktop and landscape tablet have a wide composition. Portrait tablet and phone have their own framing, larger relative character and crystal sizes, and compact controls. Short phone landscape caps the head by the available height and puts the ready action in the header; a failed/cancelled build explanation sits beside the scene. Small-phone ready and terminal-build prompts use footer space to keep the eyes, crystals and cart clear. A single shrinking landscape image does not meet acceptance.
- Text must not cover the miner, active crystals or the rock's eyes. Instructions belong in a dedicated help surface, which pauses the hazard while open.
- Native crystal and action controls must remain keyboard operable, visible and reachable, with at least 44-by-44 CSS-pixel targets, including Help, Done, Retry, Back and the ready action. Keep deliberate visible focus treatment.
- Reduced-motion mode uses pose and expression changes without continuous movement or flying particles. Optional local sounds are muted by default and start only after a user action.

## Child experience

1. **Mine:** tap a crystal or activate it with the keyboard. Most are worth 1 Jem; golden and sunset crystals are worth 3. The bag holds 8.
2. **Bank:** tap the cart or **Bank my Jems**. Deposits add to **This round** and remain safe through every shake during that round. Actual deposits advance the next 25-Jem round star.
3. **Notice:** after 11–18 seconds, the mountain has a big idea. A 3.6-second warning gives time to bank and grab.
4. **Grab:** visibly hold the hair to avoid a funny slide. All unbanked Jems still fly away in the shake; banking is the only way to preserve them.
5. **Continue:** shaking lasts 1.25 seconds, followed by a fresh mining period. There is no death, payment or recovery purchase.
6. **Return:** verified build readiness updates the shared More cue and Notifications. The child explicitly opens the originating project's result. Readiness never interrupts a turn or opens a preview automatically.

Closing resets this mini-game's scores; reopening starts a fresh round. The Help panel explicitly explains that these Jems and stars are round scores and do not add to My rewards. This wording clarifies the existing session boundary without adding rewards, persistence, conversion or a new economy.

Help and a hidden browser tab cancel an approaching hazard without silently losing carried Jems. Returning gives a fresh warning interval. A profile change closes the arcade. Timers and optional sound are cleaned up on close, and an old native close event cannot erase an immediately reopened session.

## Studio integration

- The direct catalogue tile opens ordinary native play. The separate Play while I wait action appears after a durable queued/building/testing job is acknowledged; it remembers the originating saved project separately. Typing an idea alone never claims a build was accepted.
- The active build banner, focused handoff and Notifications may offer the same native game. There is no duplicate modern modal. The legacy dialog wrapper remains compatible.
- Learning activity guards still apply. Launch stops speech and pauses the previous game using Studio's existing saved-scene mechanism.
- Studio owns job polling, retry, cancellation and the authoritative `readyExperiment` check. Labels show observed phases, including interrupted connections; no invented percentages or completion times.
- The ready handoff opens the chosen project without first loading its older working preview, then revalidates and opens the ready candidate once.
- Build failure or cancellation is shown with a route back to the affected project's Studio idea composer, including when the arcade was opened from My Games; optional mining may continue. The composer remains visible on phones even when a first build has no playable game yet.
- A native `mining` project uses the existing local game/notebook stores. Round scores remain transient and do not grant lifetime gems. Compatible strict readers are required for the new game ID; no analytics, third-party SDK, AI request or child-data collection is introduced. Artwork is built ahead of time and ships locally.

The native player's short-landscape feedback occupies clear lower-left scene space. Portrait decoration stays away from active crystals, and enabled Bank/Grab plus native tool/help labels must meet 4.5:1 measured contrast at their actual surfaces, including hover brightness. These layout refinements do not alter the legacy dialog or artwork/rules. They follow observed first-head capture failures and require fresh native reference review.

The [consolidation decision](../decisions/2026-11-22-unified-game-notifications.md) and [Notifications contract](../homepage/NOTIFICATIONS.md) describe modern navigation, source boundaries and rollout. Prior modal captures below remain historical. Native-host screenshots use a separately reviewed reference directory with the existing comparison tolerances; the old modal references are retained.

## Verification commands

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:unit
node tests/mind-your-jems-browser.cjs
MYJ_VISUAL_COMPARE=1 MYJ_CAPTURE_VIDEO=1 node tests/mind-your-jems-browser.cjs
```

The browser suite uses the real bundled Studio, real game code and illustrated assets, with deterministic mocked backend statuses and an interactive preview fixture. It does not claim real paid AI generation or physical-device testing.

The main journey runs ten browser configurations: desktop, portrait and landscape tablet, portrait phone and small phone, phone landscapes at 844×390 and 667×375, normal-motion desktop and phone, and the existing-remote-game handoff. These are browser viewports and input configurations, not ten physical devices. It exercises native pointer/touch and keyboard input, bag capacity, bank safety, held/unheld shakes, milestones, help and visibility pause, Escape and immediate reopen, confirmed ready gating, and the chosen preview handoff. Scene geometry, every visible native button's target size and input reachability are checked at runtime.

Three supplementary recovery/profile fixtures cover failed art loading and a decoded Retry, a poll interruption followed by reconnection to the same job, failed and cancelled builds with continued mining and a route back, and profile switching with score reset and stale-ready suppression. Continued-ready and terminal-build checks mine again before testing the enabled cart, so an initially disabled cart cannot hide an obstructing prompt. The cancelled phone case also rotates from 667×375 to 360×640 and verifies reachable controls and preserved scores. The suite checks help pauses hazards and makes the stage inert, and closing restores the prior page scroll style. Expected transport failures are recorded separately from unexpected browser errors.

## Art acceptance and visual regression

A functional pass alone is insufficient. Before accepting initial art or changing a baseline:

1. Inspect actual browser captures beside the storyboard for character proportions, material and lighting, scene contacts, composition, legibility and correct branding.
2. Inspect portrait and landscape layouts, including title/character clearance and crystal target placement.
3. Review idle, mining, banking, warning, holding, shaking, milestone and ready states. Review a normal-motion browser clip as well as reduced-motion stills.
4. Fix the implementation before accepting its screenshots.
5. Only then run `MYJ_UPDATE_BASELINES=1 node tests/mind-your-jems-browser.cjs` locally. Commit the reviewed baselines with the source change. CI may compare them but may not silently regenerate them.

`tests/visual/mind-your-jems/` holds the reviewed idle/warning/ready baselines for desktop, portrait tablet and phone. The comparison uses a consistent Playwright Chromium version, local fonts, deterministic state, fixed viewports and a documented small rasterization tolerance. The remaining state captures and a normal-motion recording are also required evidence.

The dedicated **Mind Your Jems art and gameplay review** workflow runs this game's actual journey, compares the reviewed views, and fails missing evidence. It supplements the site's existing page review, whose other routes do not open this optional arcade. Art-quality approval and image regression serve different purposes: the initial browser result must satisfy the visual contract before a baseline can protect it.

## Recovery checkpoints

The illustrated rebuild was recovered from local work after the remote PR remained on its original SVG implementation. [The recovery checkpoint](RECOVERY-CHECKPOINT.md) records the bounded batches and remaining work. The live PR head, rather than an earlier local success report, establishes what has actually reached GitHub.

## Release boundary

This is a feature PR. Passing tests and updating the artwork do not merge or deploy it. Production release follows the existing repository release process.

### Short-phone ready feedback

On 360×640 portrait and shallow landscape phones, short-lived ready-state banking notices use the existing footer hints rather than obscuring the rock's eyes and crystals. Play and scores remain visible, and ready handoff remains explicit. The browser suite asserts footer feedback and illustrated-scene clearance.
