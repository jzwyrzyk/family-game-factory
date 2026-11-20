# Jems Game Intelligence Engine — Design Standard v1

**Analytics runtime extension:** new v2 output now selects immutable `quality-runtime-v2.1.1` (`7f0de54d4c30aa6e026f9bcc29bffd0e911069b70c8b73686a9ecf23ffd58a5c`). It adds a trusted actual-start signal after a validated running frame; presentation commands and learning protocol 1 remain compatible. The v2.1.0 references below describe the retained presentation contract and archive. All previous archives remain unchanged. New-build attestation requires coordinated gateway/preview/private-worker/sandbox rollout; saved old revisions do not gain telemetry. See the [pilot/runtime boundary](../analytics/README.md).

**Source state:** [PR #43](https://github.com/jzwyrzyk/family-game-factory/pull/43) merged as [`493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`](https://github.com/jzwyrzyk/family-game-factory/commit/493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7). This document preserves the 2026-11-18 design standard and research rationale, including the original development path below. References to "this PR" describe that work, not a still-open merge candidate. See [Delivery state](../../DELIVERY-STATE.md) for current release evidence; merging is not production activation or universal game-quality certification.

The original v1 advisory preflight expanded within PR #43 into source-backed intent, gameplay-form advice, authored working-game contracts, optional independent sandbox/browser probes and a bounded repair/retest path. No fixture-based evidence proves that arbitrary AI-generated games work or that children enjoy them. See [current objective status and proof boundaries](objective-roadmap.md) and [merge handoff](merge-handoff.md).

**Current draft extension:** [presentation and playable quality](PRESENTATION-QUALITY.md) adds a bound style-aware production plan, optional explicitly approved raster art, actual desktop/tablet capture and mandatory separate review to the real generated-game route. Visual, intent, gameplay and input each need supported passes; a compile or animation response alone cannot make a new real game Ready. This supports pixel, flat 2D, illustrated, dimensional and realistic appearances without requiring Gem Factory's look or loop. [ADR0006](../decisions/0006-style-diverse-playable-quality.md) records the owner direction. Provider activation, human calibration, a held-out multi-style evaluation and child enjoyment remain unverified by this implementation.

## Problem statement

A game may compile, respond to touch and pass browser tests but fail the child's real idea. Using rigid-body physics to stick bubble-gum stickers on a rocket is complexity without value. A robot path puzzle needs a grid and clear steps, not 3D physics. A hill-driving game may genuinely need suspension, mass and grip. **Jems must be an effective game designer, not a demonstration of whichever engine is available.**

Four independent questions must be answered:
1. **Idea fidelity:** Can the child play the exact essential action, witness its result and reach the imagined payoff?
2. **Game-design fit:** Is the chosen core loop, interaction, presentation, simulation and complexity appropriate?
3. **Technical playability:** Are controls, progression, recoverability, learning host, privacy and execution safe?
4. **Observed child experience:** Is it understandable, enjoyable and worth returning to? This requires actual observation and feedback.

Passing #3 does not establish #1, #2 or #4.

## Rules that must survive every future revision

- **Child authorship wins.** Retain the original request, intended mechanics and characters; preserve previous playable versions. Never silently optimize their creative choices away. The child elects Keep/Use this test, never the model.
- **The least complicated solution that works.** Start from requested verbs and consequences, not the subject of the game. Being able to model something physically does not mean that modeling it physically helps.
- **Independent gameplay axes.** Rendering is 2D/3D; interaction is tap/drag/grid/steer/etc.; simulation is scripted/kinematic/rigid-body; presentation may be pixel, flat 2D, illustrated, dimensional or realistic; play mode is goal-based/open-ended. None of these choices can be inferred from another. Equal craft does not require one appearance or feature count.
- **Physics only for physical causality.** Use the bounded physics engine when weight, real contact, balance, joint strain, inertia, suspension, momentum or gravity materially changes gameplay. A rocket launch, moving robot, bouncing animation, growth and explosion into stars can be rule-driven 2D.
- **The memorable moment is a requirement.** Assembly without the launch, collection without growth, or puzzle without a visible result is not fidelity to the idea.
- **Know the product's actual capabilities.** The currently generated runtime is 2D. Do not call an isometric image a genuine 3D simulation. An essential 3-axis requirement is a product capability gap, not permission to quietly change the child's request.
- **Joy and educational benefit are empirical claims.** No simulated player, code test, replay count, session length, or LLM opinion independently proves child enjoyment or improved learning.
- **Protect the existing experience.** Do not increase waiting or insert questions just to satisfy an internal rubric. The existing adaptive math/language host, safe preview, ownership, session, budget, P0 security and privacy boundaries remain mandatory.
- **No changes to production without independent gates.** Research fixtures are not evidence of live provider behavior or real children.

## Pre-build game-form decision

**Step 1 — Understand the actual play.** Extract player action, desired state change, immediate feedback, objective or free-play affordance, and explicitly requested payoff. Record each item with a quote or a traceable source span. Do not invent an ending.

**Step 2 — Choose interaction.** Prefer simple tappable actions, direct manipulation, visible drag/drop targets, a grid of commands, or steering when those align with the core loop. Design device target sizes, affordances, readability and interruptions together with the visual composition; decorative finish cannot compensate for unusable controls.

**Step 3 — Choose presentation.** The baseline is 2D canvas. It may show side-view scenery, top-down worlds, faux depth or cutscene animation in the child's requested style. Preserve saved artwork on unrelated rule edits. A realistic appearance does not require true 3D; a request for true 3D navigation or camera depth cannot be approved as fulfilled by the current runtime.

**Step 4 — Choose the simulation.** Default to state machines and animation. Choose real physics only when replacing it with rule-based interaction would invalidate a required cause/effect. If a child explicitly asks for physics, that requirement takes precedence over convenience. An underdetermined request remains uncertain.

**Step 5 — Test the complexity tradeoff.** Why is physics better than direct interaction here? What concrete outcome changes because of it? How much implementation and runtime complexity does it impose? Can a child understand or feel the benefit? The design must answer these questions without asking the child to choose an engine.

**Step 6 — Design first-play and reward.** The first action is clear and responsive. After it, something meaningful visibly changes; the desired payoff is animated or otherwise unmistakable. A failure yields understandable, recoverable feedback. Open-ended construction does not need a fake "you win" state.

**Step 7 — Integrate learning without breaking flow.** Keep parent-controlled grade and adaptive content separate from game difficulty and controls. Pause/resume and subject practice remain in the trusted host. Test whether checkpoint frequency and return behavior interrupt play excessively; never disable learning to improve an engagement metric.

## Specific expected Jems choices

| Concept | Child-facing loop | Rendering | Simulation | Bad choice to prevent |
| --- | --- | --- | --- | --- |
| Bubble Gum Builders default | Drag stickers or pieces into targets, press Make it GO, watch a rocket/submarine/robot launch | Bright illustrated 2D | Rule-driven | Full rigid-body editor for a sticker toy; no launch payoff |
| Robot Route Lab | Give steps or commands, robot moves through a puzzle and reacts | 2D grid | Discrete movement rules | Assuming a robot requires 3D or physics |
| Junkyard Rally | Drive over hills; tuning wheel/spring/mass/grip visibly changes ride | 2D side-view | 2D rigid-body | Fake spring physics that ignores a mechanical change |
| Moon Donut Dash | Collect donuts, grow, unlock explicitly requested transformation | 2D arcade | Rules + expressive animation | Repetitive item collection without growth/payoff |
| Dragon Island Rescue | Move, evade/reflect, see attacks and consequences | 2D action | Input and combat rules; physics only if specifically needed | Animations obscure cause/effect |
| Splash or Pass | Make a choice, reveal clearly, recover or advance | 2D selection | State machine | Simulation hides the simple decision |
| Wobbly stack / catapult | Balance or launch; weight, force and contacts determine motion | 2D side view | 2D rigid-body | Scripted "physics" that does not react to player changes |
| True 3D free-flight game | Navigate in three axes and use perspective | Requires real 3D (not currently supported) | Depends on request | Presenting 2D as if it fulfills genuine depth |

These are **design standards**, not evidence that the current production builds already meet them. The new Bubble Gum Builders sticker default was merged separately in [PR #40](https://github.com/jzwyrzyk/family-game-factory/pull/40); old saved versions remain distinct. Current deployment evidence belongs in [Delivery state](../../DELIVERY-STATE.md).

## Evidence gate architecture

| Gate | Responsible question | Proof type | Current disposition |
| --- | --- | --- | --- |
| G0: Existing security and authorization | May Jems build or preview safely at all? | Owner policy, isolation, cost, learning enforcement | Existing mandatory controls |
| G1: Contract capture | What exact experience did the child ask for? | Verbatim-source design brief, explicit essential moments | Source-grounded heuristic implemented; semantic accuracy unverified |
| G2: Form and production planning | Is the gameplay architecture and presentation appropriate? | Independent dimensions, physics necessity, bound action/payoff/variation and style proposal | Original advisory preflight plus current structured production plan; the proposal is not proof of fulfillment |
| G3: Technical gate | Does the output compile, play, pause/replay, meet constraints? | Sandbox attestation, browser tests, trusted host | Existing infrastructure |
| G4a: Captured presentation/playable review | Do observed play and appearance fulfill the request? | Actual desktop/tablet images, ordinary-input receipts, four separate cited judgments | Required in current source for new real games and v2 revisions; model accuracy, held-out yield and deployment remain separately unverified |
| G4b: Independent authored behavioral playtest | Do specifically tested actions and payoffs happen? | Isolated GUI tests and independently authored event/state expectations | Optional internal-only plans and positive/negative browser fixtures; suggestion-based capture does not replace this oracle |
| G5: Human child UX and engagement | Is the game understandable and satisfying? | Observed play + direct child feedback, parental consent | Future research |
| G6: Approved version | Is it okay to keep or publish this version? | Child Keep choice, existing parent/production policy | Existing release process |

The first research slice added only G2 advice and an offline evidence ledger. Merged PR43 added source-grounded contracts, authored independent browser checks and the existing coordinator's bounded repair/retest extension for explicitly vetted plans. The current presentation-quality draft adds G4a to that same route and retains G4b as an independent, more specific claim. It does **not** automatically certify arbitrary games, judge enjoyment, or replace the established authorization, sandbox, learning and trusted-device gates. Existing saved v1 compatibility remains separate from current new-game requirements.

## Quality dimensions — separate, never a fake composite score

- Idea fidelity: the actual essential mechanics, story and payoff occur.
- Gameplay-form fit: controls, 2D/3D presentation, physics choice, complexity.
- Controls and discoverability: child can find and operate the intended action.
- Visual and audio presentation: coherent craft in the requested style, readable worlds, expressive motion, restrained sound, accessible controls and reward signals. The current image-based reviewer does not certify audio quality.
- Challenge and agency: challenge suits the game mode; child can influence, recover, experiment and choose without a forced false win.
- Playability and recovery: can progress or explore, return, retry, recover.
- Feedback and payoff: responsive cause/effect and requested memorable moments.
- Child-appropriate accessibility: reading, touch/keyboard, reduced motion, comprehension.
- Learning boundary: host-owned math/English, pauses, progress integrity.
- Isolation and performance: sandbox checks, responsiveness and device budgets.

Each axis requires a declared observation: pass, fail, or not tested, with its method and reason. **All axes passed by automation still results in "await child playtest", never "fun approved".** A failing or missing axis cannot be silently hidden in an average.

## Current technical integration

- The original child idea is still provided unaltered to the existing authenticated generation request.
- The original private form preflight remains source-backed **advice** on 2D/3D, interaction, physics and unresolved requirements; computing that brief itself adds no model call. The current production path separately adds paid structured planning and captured-evidence review under the existing approved model and job allowance. Novel image production requires a separate explicit allowance.
- For rule-driven ideas, the private agent is not saturated with physics-body and joint API details; it gets concise rule-driven instructions instead. For explicit physics or revision of an existing physical game, it still receives the complete bounded physics interface.
- New source output supplies a bounded ordinary-input playthrough. The server binds production plans and approved asset packs; the new `quality-runtime-v2.1.0` supports trusted raster rendering and retains earlier saved runtime archives. Code generation cannot fabricate capture evidence or its own acceptance attestation.
- The existing service/coordinator now requires technical capture and a separate review before Ready for real new games and v2 revisions. All four axes must pass with bound evidence. Repairs use bounded trusted findings and preserve successful art/mechanics within the existing attempt and spending limits. The original independent authored intent checks remain enforced when present.
- Generated-game quality is distinct from fixes to native curated games. Gem Factory's own physics/gameplay evidence does not establish general generation quality. The learning host, authorization, private execution, immutable revisions and explicit Keep remain mandatory.
- A classifier based on specific words is NOT sufficiently general. It can under-detect implied physics, over-detect stylistic 3D, or misclassify an unfamiliar game. It is only a hypothesis generator; tests document known examples and counterexamples.

The [presentation contract](PRESENTATION-QUALITY.md) owns exact schemas, budgets, device/capture limits, compatibility and private evidence-retention caveats. A compatible worker source/image/review stage and explicit provider approvals are release integration requirements; this source description does not inventory live settings. Human-approved reference sets and held-out requests across all five styles have not yet calibrated the reviewer or proved consistent delivery.

## Original six-stage research path

This retains the PR43 research sequence, not a claim that all stages are complete. The current production/capture/review work is described above; its fixture coverage does not complete human calibration or limited-deployment acceptance.

**R1 — Initial gameplay-form foundation in this PR.** Advisory recommendation, generator prompt de-biasing, automated regressions, neutral rubric, no production activation. Evaluate against baseline generation with the same ideas, model, budgets, settings and device cases.

**R2 — Intent compiler.** Derive a small source-traceable experience contract (roles, verbs, mechanics, state transition, goal/free-play, payoff, prohibitions). Use bounded model reasoning after explicit provider/budget approval, distinguish child quotes from model proposals, and retain corrections. Do not profile the child's personality or emotions.

**R3 — Real gameplay judge.** Test compiled games through the independent private test environment, not the code-generation agent. Use a fixed reference rubric and visible screenshots/traces. Start with authored scripted probes for sticker, grid, arcade, racing and physical toy genres; explore GUI agents only if grounded results justify them.

**R4 — Objective repair.** Separate bugs (unreachable target, invisible feedback, missing requested growth, broken physics, nonfunctional touch) from taste-based proposals. Repair only defects within the fixed intent contract; preserve source, re-run all security and learning gates, never silently promote or overwrite a child's preferred revision.

**R5 — Human calibration.** Conduct parent-consented child observation and compare blinded design reviews, objective rubric flags and voluntary child feedback. Infer no fun or educational benefit from completion and session duration alone. Evaluate math/language friction separately from gameplay fidelity.

**R6 — Limited deployment.** Only after measurable benefit and acceptable latency/cost, gate private preview behind existing owner approval and spend limits. Report false positives and false negatives, never hide failures; staged rollback remains mandatory. Public release is a separate decision.

## Literature guiding, not guaranteeing, this effort

- [GameFlow, Sweetser & Wyeth (2005)](https://doi.org/10.1145/1077246.1077253): useful goals, feedback, control, challenge and play criteria, not an objective enjoyment oracle.
- [Software architecture for game mechanics (2021)](https://www.sciencedirect.com/science/article/pii/S1875952121000185): separate presentation and interaction concerns from game-specific simulation.
- [Nielsen Norman Group, Designing for Kids](https://www.nngroup.com/articles/kids-cognition/): young users benefit from self-evident controls and less cognitive load.
- [PCG Benchmark (2025)](https://arxiv.org/abs/2503.21474): quality, controllability and diversity are distinct evaluation dimensions.
- [A2Z GameSpec-Bench (2026)](https://arxiv.org/abs/2609.39564): source-traceable dependency-aware specification and real game testing.
- [GUI Agents for Continual Game Generation (2026)](https://aclanthology.org/2026.findings-emnlp.1100/): promising independent GUI playtesting, not demonstrated automatic prediction of young children's enjoyment.
- [Live Game Design (2025)](https://vrozen.github.io/assets/papers/FDG2025_LiveGameDesign_preprint.pdf): prior research into rapid 2D prototyping and playtesting with children.

See [research-protocol.md](research-protocol.md) for the experiment and holdout, and [cross-vertical-standard.md](cross-vertical-standard.md) for systematic checks across creation, drawing, remix, coaching, math/English, visual design, family reporting and ownership. No study here establishes an off-the-shelf general fun model.
