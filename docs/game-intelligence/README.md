# Jems Game Intelligence Engine — Design Standard v1

**Status: merge-candidate research implementation; not a production activation or universal game-quality certification.** Established 2026-11-18 after the Bubble Gum Builders, Robot Route Lab and Junkyard Rally design review. The original v1 advisory preflight has expanded within PR #43 into source-backed intent, gameplay-form advice, authored working-game contracts, optional independent sandbox/browser probes and a bounded repair/retest path. No fixture-based evidence proves that arbitrary AI-generated games work or that children enjoy them. See [current objective status and proof boundaries](objective-roadmap.md) and [merge handoff](merge-handoff.md).

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
- **Independent gameplay axes.** Rendering is 2D/3D; interaction is tap/drag/grid/steer/etc.; simulation is scripted/kinematic/rigid-body; style is illustration/animation; play mode is goal-based/open-ended. None of these choices can be inferred from another.
- **Physics only for physical causality.** Use the bounded physics engine when weight, real contact, balance, joint strain, inertia, suspension, momentum or gravity materially changes gameplay. A rocket launch, moving robot, bouncing animation, growth and explosion into stars can be rule-driven 2D.
- **The memorable moment is a requirement.** Assembly without the launch, collection without growth, or puzzle without a visible result is not fidelity to the idea.
- **Know the product's actual capabilities.** The currently generated runtime is 2D. Do not call an isometric image a genuine 3D simulation. An essential 3-axis requirement is a product capability gap, not permission to quietly change the child's request.
- **Joy and educational benefit are empirical claims.** No simulated player, code test, replay count, session length, or LLM opinion independently proves child enjoyment or improved learning.
- **Protect the existing experience.** Do not increase waiting or insert questions just to satisfy an internal rubric. The existing adaptive math/language host, safe preview, ownership, session, budget, P0 security and privacy boundaries remain mandatory.
- **No changes to production without independent gates.** Research fixtures are not evidence of live provider behavior or real children.

## Pre-build game-form decision

**Step 1 — Understand the actual play.** Extract player action, desired state change, immediate feedback, objective or free-play affordance, and explicitly requested payoff. Record each item with a quote or a traceable source span. Do not invent an ending.

**Step 2 — Choose interaction.** Prefer simple tappable actions, direct manipulation, visible drag/drop targets, a grid of commands, or steering when those align with the core loop. Validate device target sizes, affordances, readability and interruptions before aesthetics.

**Step 3 — Choose presentation.** The baseline is 2D canvas. It may show side-view scenery, top-down worlds, faux depth or cutscene animation. A request for true 3D navigation or camera depth cannot be approved as fulfilled by the current runtime.

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

These are **design standards**, not evidence that the current production builds already meet them. Bubble Gum Builders' default is being addressed by separate PR #40; old versions must be preserved.

## Evidence gate architecture

| Gate | Responsible question | Proof type | Current disposition |
| --- | --- | --- | --- |
| G0: Existing security and authorization | May Jems build or preview safely at all? | Owner policy, isolation, cost, learning enforcement | Existing mandatory controls |
| G1: Contract capture | What exact experience did the child ask for? | Verbatim-source design brief, explicit essential moments | Source-grounded heuristic implemented; semantic accuracy unverified |
| G2: Form selection | Is the gameplay architecture appropriate? | Independent dimensions, physics necessity, rationale, alternatives | Advisory integrated in private generation source; no production worker repin |
| G3: Technical gate | Does the output compile, play, pause/replay, meet constraints? | Sandbox attestation, browser tests, trusted host | Existing infrastructure |
| G4: Independent behavioral playtest | Do actions and payoffs actually happen in play? | Isolated GUI tests, screenshots, event/state traces | Authored positive/negative browser fixtures and optional internal-only plans; arbitrary games unverified |
| G5: Human child UX and engagement | Is the game understandable and satisfying? | Observed play + direct child feedback, parental consent | Future research |
| G6: Approved version | Is it okay to keep or publish this version? | Child Keep choice, existing parent/production policy | Existing release process |

The first research slice added only G2 advice and an offline evidence ledger. The current PR adds source-grounded contracts, authored independent browser checks, and the existing coordinator's bounded repair/retest extension for explicitly vetted plans. This does **not** automatically certify arbitrary games, judge enjoyment, or replace the established authorization, sandbox, learning and trusted-device gates.

## Quality dimensions — separate, never a fake composite score

- Idea fidelity: the actual essential mechanics, story and payoff occur.
- Gameplay-form fit: controls, 2D/3D presentation, physics choice, complexity.
- Controls and discoverability: child can find and operate the intended action.
- Visual and audio presentation: readable worlds, playful color, expressive motion, restrained sound, accessible controls and reward signals.
- Challenge and agency: challenge suits the game mode; child can influence, recover, experiment and choose without a forced false win.
- Playability and recovery: can progress or explore, return, retry, recover.
- Feedback and payoff: responsive cause/effect and requested memorable moments.
- Child-appropriate accessibility: reading, touch/keyboard, reduced motion, comprehension.
- Learning boundary: host-owned math/English, pauses, progress integrity.
- Isolation and performance: sandbox checks, responsiveness and device budgets.

Each axis requires a declared observation: pass, fail, or not tested, with its method and reason. **All axes passed by automation still results in "await child playtest", never "fun approved".** A failing or missing axis cannot be silently hidden in an average.

## Current technical integration

- The original child idea is still provided unaltered to the existing authenticated generation request.
- The private generation preflight sends source-backed **advisory** 2D/3D, interaction and physics recommendations plus unresolved workability criteria in the existing model call; it makes **zero additional paid calls**. Its new implementation is not active in the pinned production worker until separately reviewed.
- For rule-driven ideas, the private agent is not saturated with physics-body and joint API details; it gets concise rule-driven instructions instead. For explicit physics or revision of an existing physical game, it still receives the complete bounded physics interface.
- The provider output JSON schema, compiled artifact format, canvas runtime and its immutable version, isolation, required learning host, owner budget and revision mechanics remain unchanged.
- The code neither inspects existing curated game packages nor changes how they run. Do not merge this PR to "fix" today's Bubble Gum game; follow PR #40's real UX acceptance.
- A classifier based on specific words is NOT sufficiently general. It can under-detect implied physics, over-detect stylistic 3D, or misclassify an unfamiliar game. It is only a hypothesis generator; tests document known examples and counterexamples.

## Six-stage development path

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
