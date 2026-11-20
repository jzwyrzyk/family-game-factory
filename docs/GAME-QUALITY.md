# Game Quality v1: the implementation standard

**Analytics runtime extension:** new v2 output now selects immutable `quality-runtime-v2.1.1` (`7f0de54d4c30aa6e026f9bcc29bffd0e911069b70c8b73686a9ecf23ffd58a5c`). It adds a trusted actual-start signal after a validated running frame; presentation commands and learning protocol 1 remain compatible. The v2.1.0 references below describe the retained presentation contract and archive. All previous archives remain unchanged. New-build attestation requires coordinated gateway/preview/private-worker/sandbox rollout; saved old revisions do not gain telemetry. See the [pilot/runtime boundary](analytics/README.md).

> **Scope: physical-v1 and generated-runtime quality contract.** [PR40](https://github.com/jzwyrzyk/family-game-factory/pull/40) made the sticker workshop the default for newly created Bubble Gum games. Saved physical-v1 and older engines remain supported. The physical implementation/evidence below is retained for that scope; it is not a claim that legacy physics issues are fixed or that this is the new-game default. See [product doctrine](../PRODUCT-DOCTRINE.md) and [delivery state](../DELIVERY-STATE.md).

The current draft also implements the [presentation and playable quality contract](game-intelligence/PRESENTATION-QUALITY.md): style-diverse planning and assets, actual desktop/tablet capture, and mandatory separate review for new real generated games and v2 revisions. The physical reference below is one game family, not a required appearance or simulation for every game. [ADR0006](decisions/0006-style-diverse-playable-quality.md) records that choice. Source implementation is not a live-provider or release-activation claim.

## Product commitment

The [validation review](game-quality/VALIDATION.md) records source pins, browser evidence, screenshots, measurements, and the remaining release gates for this implementation.

The game must be worth playing before a learning prompt appears. For the physical family, the reference is the feel of a small hill-driving game: understandable controls, weight, momentum, suspension, readable consequences, fast recovery, and a reason to try a slightly different idea. Other game forms need the actions and consequences appropriate to their own requests. Enjoyment is a product outcome to observe with children; passing an automated test does not establish it.

This branch owns the physical play, graphics, sound, input, and runtime. The separate learning branches own adaptive mathematics and design coaching. This branch exposes local checkpoint/mechanic/pause events and preserves their existing data and outcome interfaces. A child can test a machine, watch it fail, restore its intact blueprint, and change it without a mandatory question after every experiment.

The creative loop is **play → describe a change → playable experiment → compare → explicitly Keep, or save as a different game**. Ordinary local changes do not require a parent, a GitHub issue, or a paid model request. Supported local phrases are deliberately bounded and honest about that scope. A novel request can enter the existing generated-code pipeline when that separately approved service is enabled. We do not claim that the local phrase interpreter is general natural-language generation.

## What is implemented

| Area | Concrete implementation |
| --- | --- |
| Bubble Gum Builders | Ten recognizable household/toy parts; mass, collision, gravity, rotated thrust, lift, off-centre torque, gum stress and breaking; finite gum; three physical missions and free play. |
| Construction editor | Drag and tap placement, keyboard selection/movement/rotation, gum preview and attachment, detach/remove/undo, per-mission saves, intact blueprint restoration, immediate replay. |
| Junkyard Rally | A chassis, two wheel bodies, actual wheel suspension and motor joints, friction, brake, three terrain tracks, camera following, local best distance, cosmetic colours, tuning through saved remix versions. |
| Timing | Shared 60 Hz simulation clock, display interpolation, bounded catch-up, cleared inputs on blur/visibility/pause, listener and sound disposal. Current restored Dragon movement now uses the same clock. |
| Presentation | Trusted local vector toy artwork, material cues, layered scenery, visible springs/gum, bounded impact particles, original procedural music and effects with separate mute controls. |
| Continuity | Old gum versions retain their engine; new physical states live inside the existing project state records. Remix, fork and reload copy the intact saved build, not the transient wreck. Saving captures its owning profile. |
| Generated runtime v2 | Trusted bounded physics, parts/sprites, transforms, camera, touch pointer/drag, sound and fixed stepping, separate from the model's source allowance. v1 remains supported. |
| Current generated presentation | Versioned PNG/WebP asset packs, style-aware plan/art/code production and actual capture/review in the existing pipeline. Deliberate pixel and flat artwork are valid finished styles; generated imagery is optional. This extends the runtime without making all games use the physical catalogue or Gem Factory appearance. |
| Future drawings | Versioned component/rig definitions and validation for shapes, pivots, attachment sites and physical/decorative parent relationships. No drawing segmentation or inference is implemented here. |

### Physical goals

Construction success is evaluated from world events, not a checklist of expected part names. Delivery checks whether the passenger enters the landing area. Loft checks whether it passes through the elevated goal. Bridge checks whether the passenger remains above the gap for the required duration. The authored starting machines are solvable examples, and tests include a different valid chassis. Free play has no compulsory win or time limit.

These are approachable first challenges, not a finished content catalogue. Their first purpose is to establish the causal vocabulary: weight changes lift; rotating a fan changes direction; moving mass creates torque; overloaded joints break; a wheel rotates independently. The physical constants are authored for readable toy behaviour rather than real-world engineering accuracy.

Junkyard Rally introduces throttle and brake before more demanding terrain. Configuration changes affect motor torque, spring frequency, wheel radius, chassis mass, and friction. They do not merely change labels. Best distance belongs to the local version/profile; there is no network leaderboard or monetization loop.

## Runtime architecture

`src/quality/physics.ts` owns Planck worlds. `parts.ts` owns the declarative catalogue. `blueprint.ts` owns validation and pure editing operations. Games consume snapshots and events; drawing code does not decide physical outcomes. Every simulation instance owns its bodies and joints and starts from a copied blueprint.

Coordinates in the native physical games are metres, positive x to the right, positive y down, with radians increasing clockwise on canvas. Rendering chooses its own pixels-per-metre scale. Physics advances at 1/60 second. The display interpolates from previous to current transforms; display refresh does not multiply speed. A long stall is capped rather than producing a burst of hundreds of catch-up updates. Focus loss clears controls and resets the clock accumulator.

The initial implementation pins Planck 1.4.2, including the isolated sandbox package. This release fits the existing Node 22 CI environment. Choosing it reflects the need for wheel joints, contacts, constraints and a small JavaScript deployment. This branch does not assert a measured speed ranking against Rapier, Matter, Phaser or Godot.

The physical arcade is client-side and needs no inference during play. Vector art and procedural audio avoid sprite downloads, audio licensing dependencies and per-play server work. The game clock exposes frame intervals and dropped time for diagnostics; these are not a measurement of CPU execution time or input-to-photon latency. The separate benchmark reports simulation CPU time and explicitly identifies its host environment.

### Bounded work

The construction blueprint limits are 32 parts and 48 joints. The generated v2 facade has its own explicit body, joint, command, effect and per-tick operation limits. Effects are capped; sound uses bounded voices; rendered scale is capped on high-density displays. These limits are starting engineering budgets. An older phone can still need reduced effects or a lower rendering rate; fixed physics rules should be preserved when presentation quality is reduced.

The native clock paints the paused state once and then stops requesting animation frames. Resize, construction edits, paint choices and scene changes explicitly request a fresh frame without advancing physics. Those requests coalesce; removing only one of several pause reasons does not resume simulation. The clock tests verify stopped scheduling and safe resumption, rather than inferring battery savings from a desktop benchmark.

The generated v2 facade exposes validated functions and copied values. It does not expose Planck objects, DOM elements, credentials, storage handles or network capabilities. Its worker seals ambient browser interfaces and hardens the language intrinsics used by the engine; generated source also passes structural and scoped-global checks. Draw output is copied into bounded primitive records before it crosses to the renderer. Generated execution stays in a worker within the existing sandboxed preview.

These capability, rendering and audio budgets do **not** impose a hard JavaScript heap limit on an individual game in the child's browser. Generated code can still allocate ordinary data or perform expensive computation. A watchdog terminates an unresponsive worker, but allocation pressure can occur before a timeout. The isolated production test container has separate CPU, RAM, process and wall-time limits. Production acceptance still requires that gVisor gate against the exact reviewed package; ordinary browser fixtures establish their tested functionality and containment cases, and do not establish container isolation or universal safety for every program.

## Saves and versions

New gum configs have `qualityVersion: 1`. A stored gum config without that field resolves to `qualityVersion: 0`, retaining its prior original or legacy rules. Compatibility fields are hidden from the child-facing controls: only mechanics used by the selected engine are displayed.

Physical editor saves use `quality-construction-v1`; rides use `quality-hill-v1`. They are nested under `constructionStates[stateKey].qualityConstruction`. Existing legacy state fields remain intact. This also lets Studio's whole-record state copy preserve the new physical state. A run snapshot is never written over the construction blueprint.

When Studio pauses a native game for designing, it copies one painted frame before the existing game teardown. The still image is bounded to 960 × 600 pixels and stays only in memory. The simulation and sound stop; returning to play follows Studio's existing saved-construction/restart behavior. Navigation, profile/project changes and remounting clear the image. A missing frame gets a named placeholder, so closing the versions panel never leaves an unexplained blank stage.

Unknown schemas and invalid geometry produce a recovery notice and retain the saved payload until the user explicitly starts a new example/build. Failed storage writes preserve the previous source and report the failure. When making a version, the build copy is saved before advancing the revision. A failed later workspace write can leave an unused copied slot, but cannot replace the old build or advance its durable head.

Generated v1 artifacts stay on their original contract. Generated v2 artifacts additionally bind their exact trusted runtime version and digest, separately from their generated source and compiled-code digests. Checked-in immutable worker/client archives include the engine, bootstrap, hardening, frame copier, artwork and audio host. The preview loads the artifact's recorded version; new attestations require the current approved version. Runtime releases append an archive and retain earlier approved registry entries. Unsupported or tampered bindings fail closed with “Private preview unavailable.” See the [archive maintenance contract](../server/sandbox/trusted/README.md).

The retained presentation archive is `quality-runtime-v2.1.0`. Its approved image commands reference IDs in a server-attached asset pack; the renderer decodes the bytes before Play. Asset hashes and exact plan/playthrough preservation join the source/runtime bindings. Existing saved v1 and earlier v2 artifacts remain readable on their recorded contracts. Opening an old accepted game does not retrospectively require the new review. New real candidates and v2 revisions must pass it; new v1 generation cannot be used to evade the policy.

## Drawing decomposition: the future seam

The future drawing branch should produce a **reviewable rig**, not a single texture pasted onto a physics box. For a car, likely components are chassis/cab, front wheel, rear wheel, and decorative detail. Each physical component needs a local pivot, a simplified collider, a bounded mass/material profile, and named attachments. Wheel bindings can then connect to an authored suspension model.

`PartDefinition` carries schema version, ID, sprite ID, dimensions, mass, material, friction, restitution, box/circle/convex collider, pivot, and named attachments. `DrawingRig` carries bounded component IDs, parent IDs, local offsets/angles, physical/decorative flags, and fixed/axle/suspension/gum bindings. Validators reject invalid shapes, duplicate IDs, missing anchors, and cyclic parents. Asset identifiers are data; executable source or arbitrary URLs are not allowed.

The importer still needs image segmentation, confidence and ambiguity handling, private asset registration, a child-friendly component review/correction UI, registration into the runtime catalogue, and tests for poor/ambiguous drawings. Those are intentionally separate work. The current validator does not itself make a drawing playable, and the current native workshop instantiates the reviewed built-in catalogue. Keeping this boundary explicit prevents drawing recognition from becoming a prerequisite for a playable first release.

## Acceptance and evidence

The following are separate claims and need separate evidence:

| Question | Evidence |
| --- | --- |
| Are outcomes physical and repeatable? | Unit tests of gravity/mass/thrust, off-centre torque, joint stress, alternative valid designs, real goal reachability, identical seeded trajectories under different render schedules. |
| Does the editor preserve a child's work? | Browser tests of drag/tap/keyboard edits, cancellation, exact undo, restored blueprints, per-mission reload, quota failures and unsupported-save preservation. |
| Does a car change when tuned? | Headless driving/braking/reversal tests, finite-state checks at every exposed tuning corner and on every track, plus browser remix/fork tests. |
| Does input survive device realities? | Desktop/touch journeys, release/cancel/blur tests, no hidden-time catch-up, pause/retry and teardown checks. |
| Does the generated runtime meet its tested contract? | Hand-authored v2 fixtures, source restrictions, capability/frame bounds, input-dependent scene changes, replay/pause, ambient-global and prototype-mutation probes, no-egress/parent-isolation checks, and attestation tampering tests. Browser CI and the separately provisioned gVisor gate supply different evidence. |
| Does a current generated candidate meet presentation/playable criteria? | Actual desktop and touch-tablet images plus ordinary-input receipts, separate visual/intent/gameplay/input judgments with cited captures, and bound acceptance/repair in the real route. These model judgments still need human calibration and held-out style evaluation. |
| Is it cheap enough? | Reproducible simulation benchmark, compressed bundle size, resource bounds and browser diagnostics. Older-device thermal/GPU checks remain a real-device gate. |
| Is it fun for children? | Observed play with the intended ages and devices, a child explaining a causal change, choosing to retry without prompting, and being able to stop or switch games. Automated tests cannot establish this. |

Run `npm test` for the full existing suite plus quality journeys. `npm run benchmark:quality` writes reproducible machine-readable timing evidence. `npm run test:sandbox` remains the separately provisioned isolated-container gate. A normal CI success must not be described as a successful live paid generation or an isolated gVisor run.

The generated v2 technical smoke compares an idle scene with ordinary control/touch exploration for up to 120 fixed ticks. It rejects a scene whose non-text drawing commands do not respond, and it accepts valid continuing play, wins or losses. This checks observed visual response; it does not prove that every input changes the physics, that every possible objective is reachable, or that a child will enjoy the game. The authored buggy fixture separately checks known reachable win and loss states; the workshop fixture checks physical dragging and indefinite play. V1 retains its existing short-win gate for compatibility.

That short smoke is no longer the complete acceptance route for new real generated games. The additional capture runs normal-motion desktop and emulated touch tablet (600-pixel viewport) for up to 600 fixed ticks per device, with at least 60 ticks for an early terminal result. It captures the actual game UI and controls, plus ordinary-action receipts and independent pause/replay checks. A separate hosted reviewer must pass visual craft, original intent/payoff, meaningful gameplay and accessible input; missing evidence stays unverified. No axis is averaged away, and an attractive static scene is insufficient. The [presentation contract](game-intelligence/PRESENTATION-QUALITY.md) records exact bounds and honest limits: suggested exploration is not an independent oracle, screenshots do not cover every mechanic, and model acceptance does not certify fun.

### Review before calling this production-ready

1. Inspect desktop and touch screenshots and play the games with real inputs.
2. Run the complete suite and review new and historical-version coverage.
3. Run the approved isolated image/gate against the exact runtime version before accepting live v2 generated games.
4. Try the actual target devices, including a lower-end device and a background/resume cycle; check frame stability, heat, sound and touch comfort.
5. Observe children building, changing and retrying. Tune first-minute comprehensibility and challenge from observed behaviour.

The [device and play review guide](game-quality/PLAY_REVIEW.md) gives a local-device setup, concrete tasks and neutral observation prompts for the last two checks. It contains no completed observations and adds no telemetry or child-facing review controls.

The original physical-v1 feature branch incorporated main at `ca73ceba4ae2c79f9f669c3fcbaa66922230d601`, which already contained Studio and design-coach changes, and added their physical-game compatibility. That is historical integration evidence. Current source/runtime changes do not themselves activate paid generation, dispatch the private runner or publish the live arcade. The private workflow pins an audited public commit and needs a separately reviewed pin/image and compatible review-stage integration before it can execute the new path. Actual current release evidence belongs in [delivery state](../DELIVERY-STATE.md).
