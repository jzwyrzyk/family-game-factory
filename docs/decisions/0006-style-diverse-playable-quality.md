# 0006 — Require playable quality without a single house game style

**Status:** Accepted
**Recorded:** November 19, 2026 (UTC)
**Decision source:** The owner's current implementation request following the [Gem Factory draft, PR58](https://github.com/jzwyrzyk/family-game-factory/pull/58): carry its improved visual craft into the pipeline, support a spectrum from digital 2D through richer and realistic treatments, avoid making all games look alike, and improve the game's physics/gameplay. Child-supplied art-library work was explicitly deferred. The conversation authorizes implementation and a draft PR, not release activation.

## Context

The earlier pipeline could compile and exercise a generated game without establishing that the visible result had deliberate art direction, the requested payoff or meaningful variation. A closed sprite catalogue also constrained the appearance a generator could produce. Improving a single native reference game did not automatically improve production generation.

The owner's quality target is broader than a particular illustrated aesthetic. Pixel art, clean flat geometry, illustration, dimensional art and realistic treatment can each be complete and expressive. A universal Gem Factory palette or collection template would lose the child's intent. Attractive artwork alone would still leave the problem of inert scenes and shallow controls.

## Decision

1. Add a source-bound production plan to the existing private generation route. Preserve the full child request, essential player action/payoff, appropriate variation or expression, explicit style and verified base. Presentation, interaction, simulation and play mode remain independent.
2. Support validated, immutable raster asset packs alongside code-native artwork. Generate new assets only with separate explicit image approval and available budget. Reuse approved artwork through unrelated rules/mechanics changes. Uploading and interpreting children's own art remains a later integration.
3. Require real current generated candidates to pass technical gates, actual desktop/tablet capture and a separate structured review before Ready. Judge visual craft, intent, gameplay and input independently, with capture citations. A failed or unobserved required axis cannot be averaged into a pass.
4. Keep review in the private credentialed hosted boundary and generated-code execution in the keyless isolated test boundary. Review does not run generated source. Hashes bind source, runtime, assets, capture evidence and compact review metadata.
5. Use the existing bounded repair loop and trusted diagnostic codes. Preserve the child's kept game, host-owned learning, authorization, spending and explicit Keep. Existing saved v1 games retain their compatibility path; new real output cannot select v1 to evade current quality requirements.

The [detailed contract](../game-intelligence/PRESENTATION-QUALITY.md) records exact schemas, limits, stage behavior and current evidence boundaries. This acceptance floor does not require complex gameplay for every request, a win state for an open-ended toy, or generated imagery for every style.

## Consequences and limits

Planning and review add paid calls, latency and the possibility of rejecting a usable game because the short capture did not observe an essential behavior. Novel artwork adds a separate approved cost. Admission must leave capacity for source generation and required review before buying images; uncertain paid requests must not be silently replayed. Actual cost/latency distributions remain to be measured.

The generator's bounded input suggestions help the sandbox explore a game, but are not an independent proof of its requested payoff. Existing independently authored intent probes remain separate. The model reviewer is a fallible judgment over bounded evidence, not a child, a complete gameplay test or an enjoyment oracle. Human reference calibration, held-out evaluation across all five styles, actual-device observations and consented child playtesting remain necessary for stronger claims.

The owner explicitly rejected uniform-looking output and accepted child-art integration as later work. This decision does not invent a requirement to use AI image generation, real physics or true 3D in every game. Realistic appearance remains distinct from true three-axis navigation, which the current generated runtime does not implement.

The private workflow needs a compatible review stage, source pin and isolated image/runtime before release. Completing a job removes raw evidence from live state, but the private content-addressed store has no implemented garbage-collection/delete API. Retention/deletion verification remains operational work. Accepted here describes the product and architecture choice; deployment, provider activation and broad quality calibration are separate facts.

Revisit the capture/review design when held-out results show systematic missed payoffs, style bias, unacceptable false approvals/rejections, excessive latency or cost. Expand supported art and game forms with verified contracts; do not weaken the standard by relabeling missing evidence as success.

## Evidence and related documents

- [Product doctrine](../../PRODUCT-DOCTRINE.md), especially playable intent, independent game-form axes and truthful evidence.
- [ADR0002](0002-intent-faithful-game-forms.md) and [ADR0004](0004-separated-private-execution.md), retained foundations for form selection and trust boundaries.
- [Presentation and playable quality](../game-intelligence/PRESENTATION-QUALITY.md), executable source links and acceptance limits.
- [Current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery state](../../DELIVERY-STATE.md), source boundaries versus release evidence.
- [Game Intelligence research protocol](../game-intelligence/research-protocol.md), future controlled comparison and human evidence.
