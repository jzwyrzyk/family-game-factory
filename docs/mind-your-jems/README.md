# Mind Your Jems! — run, collect, hold and bank

Mind Your Jems is a prebuilt, local arcade game. Its **Saved** score and bucket progress belong to the current mining session. They do not add to **My rewards**, represent learning progress, influence a background build, or alter the child's saved game.

**Current change:** the owner's November 22, 2026 (America/New_York) request restores the intended movement, risk, banking and level progression while preserving the illustrated scene. The [gameplay and navigation decision](../decisions/2026-11-22-mining-gameplay-and-navigation.md) records the order: overhaul the game first, then unify navigation and library organization. Phase 1 retains the existing build-wait launch wrapper. A reusable scene mount prepares the subsequent native-host integration; its existence does not mean that the library and navigation changes are delivered.

## The playable contract

The child runs left and right across the giant's head to collect sporadically appearing jems. When a shake approaches, the child chooses between reaching safety with the bag or holding on and spilling it. Filling the bucket completes a level.

| Action or event | Required consequence |
| --- | --- |
| Run into a jem | Collect it into the bag. Clicking a distant crystal cannot collect it. Ordinary crystals are worth 1; golden and sunset crystals are worth 3. |
| Reach the bucket | Deposit automatically. The bag empties, **Saved** increases, and the current bucket fills. There is no remote Bank button. |
| Notice the warning | A visible countdown and the giant's expression precede the shake. Sound is optional; the warning remains clear without it. |
| Hold while exposed | The miner clings and stops moving. The shake spills the bag; holding protects the miner, not the carried jems. Hold must remain pressed throughout exposure to the shake. |
| Reach the platform | The platform protects both the miner and any carried jems. The bucket sits farther onto that platform. The connecting bridge remains exposed. |
| Shake without holding | The miner visibly falls, loses the unbanked bag, and reaches an explicit **Try again** state. Previously saved jems and the current bucket's progress survive. |
| Any shake | Active crystals on the head fall away. The next calm period spawns new opportunities. |
| Fill the bucket | Show **Bucket full!** and wait for **Next level**. Later levels change the actual bucket target and hazard timing. |

The bag holds eight. A three-jem crystal that cannot fit remains on the head rather than being partly discarded. The accounting invariant is `mined = banked + loose + lost`. Depositing beyond a level's target retains the entire deposit in the session's **Saved** score. The next level starts a new empty bucket; it does not remove that saved score.

Retry begins safely at the bucket on the same level. It does not reset saved bucket progress, spend anything, grant a reward, or start another game build. Leaving the mining session resets its score; this implementation adds no persistence or economy.

### Initial tuning

These numbers are implementation tuning, not proof of fun or a fixed owner-specified difficulty schedule.

| Parameter | Initial behavior |
| --- | --- |
| First bucket goal | 12 jems; later goals increase by 4, capped at 60 |
| Bag capacity | 8 |
| Movement | 22 world units per second; the head spans 80 world units |
| First-level calm interval | Seeded variation between 10 and 14 seconds |
| Warning | 3 seconds at level 1, decreasing gradually to a 2-second minimum |
| Shake | 1.5 seconds |
| Fall | 850 ms, followed by explicit Retry |
| Spawns | Variable positions and intervals, with reachable initial crystals and a bounded number of active crystals |

The world uses positions from 0 to 100. Crystals appear at 5–76 on the head; the head ends at 80, safety starts at 88, and automatic banking starts at 94. The player starts at 96. Difficulty leaves movement speed unchanged, bounds the calm interval and warning, and increases the bucket objective. Real child play is needed to calibrate whether these choices produce the intended enjoyable challenge.

## Controls, pause and lifecycle

- **Keyboard:** Left/Right arrows or A/D move; held Space clings. Enter can hold the action of a focused movement control, and releasing it or moving focus clears that action.
- **Touch or pointer:** large Left, Right and Hold on controls support sustained presses and simultaneous input. Pointer release, cancellation and lost capture release the corresponding action.
- **Pause and Help:** freeze gameplay clocks, including warning, shaking, movement and spawns. They clear held inputs and stop optional sound. Help makes the stage inert. Resuming an exposed warning or shake adds a 900 ms preparation grace while preserving the remaining simulation timer; it does not reroll the hazard or erase cargo.
- **Small screens:** Help keeps its return action visible while its instructions scroll. Covered scene and toolbar controls are inert. Narrow phones keep readable action labels and target sizes; short landscape puts the level, bucket and actions in a compact footer, with instructions in Help and live status announcements retained.
- **Backgrounding:** a hidden tab or lost window focus pauses the game. Returning does not silently restart play. Explicit resume returns keyboard focus to the game.
- **Loss and win:** the result becomes visible before its Retry or Next level button receives focus. Neither screen advances on its own.
- **Disposal:** cancel the animation loop, release input state, stop audio, disconnect resize observation and remove event listeners. A profile change or close cannot leave an old loop or ready callback controlling another session.

The pure engine advances in bounded slices. A delayed call advances at most 100 ms, so a suspended tab cannot jump through an entire warning into an immediate loss. Normal pausing is the controller's responsibility; the time cap is additional protection.

## Visual contract and provenance

[The approved storyboard](reference-storyboard.png) remains the production art reference. Preserve its dimensional cartoon treatment: a cheerful miner, an expressive lavender rock giant, sculpted pink and mint hair, glossy colored crystals, a purple-and-gold minecart on a grassy ledge, and a lush floating-island world. Palette and subject matching alone do not satisfy this contract. The gameplay overhaul reuses these assets.

The UI uses the existing `public/jems-logo.svg` without alteration. Scores, instructions, build status and controls remain semantic HTML. The rounded display font is locally served Fredoka with its SIL Open Font License; there is no runtime font or art CDN.

Production artwork lives in `public/art/mind-your-jems/`. [Scene provenance](../../public/art/mind-your-jems/scene-art.md) and [miner/props provenance](../../public/art/mind-your-jems/miner-props-art.md) retain generation references, prompts, atlas coordinates and export details. Optimized WebP layers preserve alpha. Source PNG masters used for original verification are not duplicated in the runtime payload.

### Composition and animation acceptance

- The visible running path follows the illustrated head and bridge into the bucket platform. Foot contacts, crystal positions and pickup distance must agree with the visible scene.
- The renderer interpolates measured contact points on the common rock silhouette. Holding anchors the existing raised gloves to that surface; the platform's grass edge matches the rules' safe boundary. Viewport fitting reserves the miner, countdown and the giant's mouth, with only lower chin cropping on constrained screens. Portrait worlds share their available vertical space instead of leaving all surplus sky above the head. These geometry choices still require screenshot and motion review.
- The miner has visible running/collection, holding, falling and celebration states. The head must visibly shake during an unheld fall as well as a successful hold. Placement, facing and animation transforms remain separate.
- The face retains idle, warning, happy and recovery expressions. Deposits add to the cart's visible pile and animate a transfer from the bag.
- Desktop, tablet portrait/landscape and short/narrow phone layouts retain the giant, miner, reachable bucket and readable controls. Reflow the composition rather than shrinking all content into a single landscape image.
- Text must not obscure the miner, active crystals or the giant's eyes. Longer instructions belong in Help. Readable child labels and targets follow [Child interface: clear at six](../brand/CHILD_INTERFACE.md).
- All interactive actions, including Help, Pause, Retry, Next level, Back and the ready handoff, need visible focus and reachable targets. Crystals and the bucket are game objects, not remote action buttons.
- Reduced motion suppresses decorative shaking, continuous bobbing and flying particles while retaining the essential player-controlled movement, states and consequences. Optional local sound starts muted and requires an explicit action.

## Phase 1 Studio integration

The existing wait-time wrapper remains temporarily so the game overhaul can be checked before changing entry and exit routes.

- Launch remains available after Studio acknowledges a durable queued/building/testing job, from the active build banner or background-build shelf. Typing an idea alone does not launch it.
- `mountMindYourJems` owns the reusable local scene/controller; the compatibility `createMindYourJems` wrapper owns the current dialog and close behavior. Both use the same pure rules. The ordinary library does not gain a mining tile in phase 1.
- Studio continues to own job polling, retries, cancellation, profile ownership and the authoritative ready-experiment check. Status labels describe observed phases without invented completion percentages or times.
- Learning guards still apply. Entry stops speech and pauses the prior game through Studio's existing saved-scene mechanism.
- Confirmed readiness offers **Play my game** without interrupting the mining turn. Explicit activation opens the chosen project and revalidates its ready candidate, avoiding an intermediate load of the old preview.
- A failed or cancelled build retains a route back to that project's Studio composer while local mining may continue. A reconnecting build does not restart generation or erase the mining score.
- Closing restores the previous page scroll state. An old dialog close event must not erase an immediately reopened session.

Phase 2 is the accepted follow-on: make mining discoverable with the ordinary ready-to-play games, use the same native play shell and exit behavior for normal and wait-time entry, and reconcile obsolete default-game organization. That follow-on must preserve authored games, saved revisions, host learning and explicit ready handoff. Phase 1 does not claim to have removed the older cat game or completed the navigation work.

No new storage keys, analytics, third-party SDK, AI request or child-data collection is introduced by the gameplay overhaul. Artwork ships locally.

## Verification and evidence limits

```sh
npm ci
npx playwright install chromium
npm run build
node --import tsx --test tests/mind-your-jems.test.ts
npm run test:unit
node tests/mind-your-jems-browser.cjs
MYJ_VISUAL_COMPARE=1 MYJ_CAPTURE_VIDEO=1 node tests/mind-your-jems-browser.cjs
```

At the phase 1 implementation checkpoint, the 14 focused rule tests passed locally. That checkpoint does not establish a full application build, revised browser acceptance, hosted CI, deployment, physical-device reliability or child enjoyment. Current exact validation and source status belong in [Delivery state](../../DELIVERY-STATE.md).

The revised browser acceptance must exercise real controls against the bundled controller and approved artwork. Fixture backend statuses and a generated-preview fixture establish integration behavior, not paid AI generation. Required evidence includes contact-only pickup, sustained movement and Hold, partial/full bag handling, safe banking, complete warnings, held spill, unheld fall, Hold release during shaking, explicit Retry, bucket completion and Next level.

Lifecycle evidence must cover simultaneous touch, key release after focus changes, late-warning/shake pause and resume, help, hidden tabs, art failure/retry, resize/orientation, close/reopen, build reconnection/failure/cancellation, owner changes and stale-ready suppression. Inspect focus, composed text contrast, control reachability, scene contacts and continued play when a build-ready or recovery message is visible. Browser viewports are not physical-device tests.

### Historical visual evidence

The original illustrated click-to-mine implementation retains art provenance and earlier layout, wait-build, recovery and profile fixtures. Its ten main browser configurations, three supplementary fixtures and idle/warning/ready baselines describe that earlier implementation. Those earlier checks and pictures do not validate the new movement game.

The earlier click-to-mine baselines remain in Git history. The current `tests/visual/mind-your-jems/` set contains explicitly reviewed movement-game captures; `review.json` records their exact source, artifact and image hashes. Before accepting any replacement baselines:

1. Inspect actual browser captures beside the storyboard for proportions, material, lighting, scene contacts, composition, legibility and branding.
2. Inspect desktop, tablet and phone layouts, including narrow portrait and short landscape.
3. Review running, collection, banking, warning, holding, shaking, falling, retry, level completion and build-ready states. Review a normal-motion clip as well as reduced-motion stills.
4. Correct the implementation before accepting its screenshots.
5. Only then run `MYJ_UPDATE_BASELINES=1 node tests/mind-your-jems-browser.cjs` locally and retain the reviewed baselines with the source. When the local environment cannot launch Chromium, an explicit local import of the reviewed hosted-browser captures is permitted: verify the artifact checksum, exact source/build identity, all 13 functional configurations, all nine expected state/device files and the normal-motion evidence. Any functional failure blocks import; retain intentional old-baseline mismatches as failed historical evidence. Record the workflow, artifact, manifest and per-image hashes, review scope and local limitation in `review.json`. Import the exact PNG bytes without editing them. CI must not silently regenerate or approve baselines, and comparison tolerances remain unchanged.

The dedicated **Mind Your Jems art and gameplay review** workflow remains the separate visual/gameplay gate. Functional tests, visual comparisons and observed child play answer different questions; none substitutes for the others.

## Recovery and release boundaries

[The recovery checkpoint](RECOVERY-CHECKPOINT.md) preserves how the earlier illustrated rebuild was recovered from local work while its remote PR still held an SVG implementation. It is historical evidence, not the current gameplay specification. A live PR head and its scoped results establish what reached GitHub.

The gameplay overhaul is a source change. Passing local checks or updating artwork baselines does not merge or deploy it. Production release follows the existing repository process; the ordered navigation work and actual child playtesting retain their own acceptance requirements.
