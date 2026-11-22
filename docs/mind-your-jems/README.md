# Mind Your Jems! — run, collect, hold and bank

Mind Your Jems is a prebuilt, local arcade game. Its **Saved** score and bucket progress belong to the current mining session. They do not add to **My rewards**, represent learning progress, influence a background build, or alter the child's saved game.

**Current source:** the owner's November 22, 2026 (America/New_York) request restores the intended movement, risk, banking and level progression while preserving the illustrated scene. The [ordered gameplay decision](../decisions/2026-11-22-mining-gameplay-and-navigation.md) records the sequence: overhaul the game first, then unify navigation and library organization. The follow-on [navigation contract](../decisions/2026-11-22-mining-game-navigation.md) now connects that same scene to the ordinary native player and catalogue. Combined source, hosted checks, visual acceptance and deployment remain separate states recorded in [Delivery state](../../DELIVERY-STATE.md).

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

Retry begins safely at the bucket on the same level. It does not reset saved bucket progress, spend anything, grant a reward, or start another game build. Leaving the mining session resets its score; the game adds no mining-score persistence or economy. Its ordinary native project/session uses the existing workspace and notebook records.

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
- **Pause and Help:** freeze gameplay clocks, including warning, shaking, movement and spawns. They clear held inputs and stop optional sound. Help makes the stage and underlying mining toolbar inert. Its directions scroll within the panel while **Let’s play** stays in a fixed visible footer. Resuming an exposed warning or shake adds a 900 ms preparation grace while preserving the remaining simulation timer; it does not reroll the hazard or erase cargo.
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
- The renderer interpolates measured contact points on the common rock silhouette. Holding anchors the existing raised gloves to that surface; the platform's grass edge matches the rules' safe boundary. Viewport fitting reserves the miner and the giant's mouth, with only lower chin cropping on constrained screens. Tall portrait composition centers the connected world within its available space while leaving clearance for the countdown. These geometry choices still require screenshot and motion review.
- The miner has visible running/collection, holding, falling and celebration states. The head must visibly shake during an unheld fall as well as a successful hold. Placement, facing and animation transforms remain separate.
- The face retains idle, warning, happy and recovery expressions. Deposits add to the cart's visible pile and animate a transfer from the bag.
- Desktop, tablet portrait/landscape and short/narrow phone layouts retain the giant, miner, reachable bucket and readable controls. Constrained grid columns prevent the mine from widening past its player. At 360 px or narrower, action labels remain 18 px and touch targets retain their size while decorative action icons are omitted. Short landscape keeps level, bucket goal and actions in one compact footer row; full directions remain in Help and live status stays available to assistive technology. The safety label sits beside the cart in that layout. Reflow the composition rather than shrinking all content into a single landscape image.
- Text must not obscure the miner, active crystals or the giant's eyes. Longer instructions belong in Help. Readable child labels and targets follow [Child interface: clear at six](../brand/CHILD_INTERFACE.md).
- All interactive actions, including Help, Pause, Retry, Next level, Back and the ready handoff, need visible focus and reachable targets. Crystals and the bucket are game objects, not remote action buttons.
- Reduced motion suppresses decorative shaking, continuous bobbing and flying particles while retaining the essential player-controlled movement, states and consequences. Optional local sound starts muted and requires an explicit action.

## Shared native player and Studio integration

Mind Your Jems is the `mining` native game. The Ready to Play group places it beside Gem Factory, followed by Bubble Gum Builders and Junkyard Rally. Dragon Island Rescue and Splash or Pass appear under Original jems. Moon and Robot leave the default shelf while their saved runtime IDs, settings and child-authored work remain reachable. Drafts and conversations count as work even before an experiment exists.

- `mountMindYourJems` owns the reusable scene and controller; `NativeMining` connects it to the ordinary lifecycle. The compatibility `createMindYourJems` wrapper remains in source but Studio does not use it for either catalogue or build-wait entry.
- The [shared player](../homepage/PLAY_VIEW.md) owns My Games, fullscreen, Change, Help, More and profile access. There is no second mining dialog or unique close control. Its scene toolbar retains sound, pause and in-game directions without another layout header.
- Entry focuses the actual stage. Embedded movement keys are accepted only from the game's stage or movement controls, with text fields and other buttons excluded. Moving focus or tapping into shared tools pauses the hazard and clears held input. Closing More leaves the visible **Keep playing** action in control of resume.
- The native lifecycle retains the existing timed learning checkpoint, game inertness, pause/resume and guarded exits. Local bucket completion uses the mine's own Next level action and emits only a mechanic signal; it cannot manufacture a host round result, lifetime reward or learning evidence.
- An acknowledged queued/building/testing job can offer explicit **Play while I wait**. This opens the same mining game through standard native starter creation/reuse; it never submits another generated job or changes the originating project's revision. Typing an idea alone does not launch mining.
- Studio continues to own job polling, retries, cancellation, profile ownership and ready-experiment checks. The original project is first in **More → My builds & tests** during waiting. Status labels describe observed phases without invented progress or time estimates.
- Confirmed readiness adds **ready** to More. The child explicitly opens **Play my game** or **Try ready test**; background completion never takes focus or changes the miner's state. The action re-reads the original project and opens only the chosen ready revision, avoiding an intermediate load of its old preview.
- A failed or cancelled original build keeps a route back to its saved composer while mining can continue. Reconnecting never restarts generation or erases the mine's score.
- Common Help/Change follows the existing action-game pause-preview flow. Explicit return starts a new mining run and retains the original build's priority. Leaving to My Games, another project or another profile clears the transient binding, disposes the game and restores the prior page scroll state; it does not cancel the build.

The isolated phase 1 PR retained the old build-wait wrapper so gameplay could be reviewed first. Its historical scope and failed observations remain in Delivery state; they are not acceptance of the combined native journey. This follow-on adds no storage key, analytics, third-party SDK, automatic AI request or child-data collection. Artwork ships locally. The navigation contract records compatible gateway/worker requirements for later AI-built mining edits and the no-data-loss frontend rollback boundary.

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

### Reviewed visual evidence

The original illustrated click-to-mine implementation retains art provenance and earlier layout, wait-build, recovery and profile fixtures. Its ten main browser configurations, three supplementary fixtures and idle/warning/ready baselines describe that earlier implementation. Those earlier checks and pictures do not validate the new movement game.

The current nine files in `tests/visual/mind-your-jems/` are the manually reviewed native-player captures from PR129 head `e314bab19607fffabe09a3815d0bc92c83bf78ed`. Their [review receipt](../../tests/visual/mind-your-jems/review.json) identifies the exact hosted build, run, artifact archive, manifest and individual image hashes, plus the reviewed normal-motion clip. The source run completed all 13 functional configurations and failed only its nine comparisons with the superseded click-to-mine pictures. Importing the reviewed captures does not change that historical result or establish a passing comparison for the final candidate.

Before accepting replacement baselines:

1. Inspect actual browser captures beside the storyboard for proportions, material, lighting, scene contacts, composition, legibility and branding.
2. Inspect desktop, tablet and phone layouts, including narrow portrait and short landscape.
3. Review running, collection, banking, warning, holding, shaking, falling, retry, level completion and build-ready states. Review a normal-motion clip as well as reduced-motion stills.
4. Correct the implementation before accepting its screenshots.
5. Only after that review, explicitly accept the complete nine-image set locally. The usual path is `MYJ_UPDATE_BASELINES=1 node tests/mind-your-jems-browser.cjs`. If local Chromium cannot launch, an explicit local import of verified hosted captures is permitted: verify the source head and clean build, run and artifact identity, archive and manifest checksums, all nine image dimensions and checksums, and the complete functional result; record the still and normal-motion review in `review.json`. A run whose only failures are the known superseded-baseline comparisons can supply candidates, but any functional failure blocks acceptance. Preserve its original manifest and failed conclusion. CI must not regenerate or approve baselines, and the comparison tolerance remains 20 channel levels with a maximum changed ratio of 0.008.

6. Run the existing hosted comparison against the accepted images on the final candidate. Baseline import, a passing functional journey and a passing visual comparison are separate observations.

The dedicated **Mind Your Jems art and gameplay review** workflow remains the separate visual/gameplay gate. Functional tests, visual comparisons and observed child play answer different questions; none substitutes for the others.

## Recovery and release boundaries

[The recovery checkpoint](RECOVERY-CHECKPOINT.md) preserves how the earlier illustrated rebuild was recovered from local work while its remote PR still held an SVG implementation. It is historical evidence, not the current gameplay specification. A live PR head and its scoped results establish what reached GitHub.

The gameplay overhaul is a source change. Passing local checks or updating artwork baselines does not merge or deploy it. Production release follows the existing repository process; the ordered navigation work and actual child playtesting retain their own acceptance requirements.
