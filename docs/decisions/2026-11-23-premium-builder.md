# Adult Private stage policies for generated games

**Status** — Accepted for implementation on November 23, 2026. The owner authorized a draft PR and reserved deployment and paid activation for a separate post-cutover decision.

## Context

The child chooses the game. The conversation coach helps the child develop the idea, and Build asks Jems to implement it. The owner wants generated games to approach the polish of Gem Factory, Mind Your Jems and Bubble Gum Builders while preserving each creator's chosen mechanics and visual treatment. The existing builder already separates generation, isolated execution and review, but each paid text stage shares one model configuration and output ceiling.

## Decision

Use the existing private builder and durable job coordinator. For the Adult Private premium policy, every new code-generation and code-repair request must use `gpt-6.2-astra` at high reasoning effort. Configure planning and review independently, initially with `gpt-6.2-sol` at high effort. Keep the approved conversation coach separate. Preserve deterministic local edits.

Reject a premium job or leave it recoverable when the specified model, privacy approval, runtime or allowance is unavailable. The owner ruled out automatic substitution by complexity, price or age, and excluded higher reasoning tiers for this pilot. Reusing a single shared model would prevent independent review and planning configuration. A second generation service would duplicate identity, settlement and publication authority.

## Consequences

More reasoning, a longer interactive trace or a repair can increase time and cost. Admission reserves the full bounded path and settlement records the evidence available. Sandbox and review failures protect the last kept game. Benchmarks will measure quality gains and cost per accepted game before an audience decision. Review the limits or capture method when ordinary play repeatedly misses a requested payoff, when evaluated false passes or rejections are frequent, or when measured usage exceeds the approved envelope. A change to the coding model requires a separate owner decision.

See the [pilot contract and rollout](../game-intelligence/PREMIUM-BUILDER.md), [execution boundaries](0004-separated-private-execution.md) and [style-diverse quality standard](0006-style-diverse-playable-quality.md).
