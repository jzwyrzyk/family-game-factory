# November 23, 2026 — stronger model target for private game construction

**Status:** Accepted owner direction for a future implementation; not a deployed or activated model choice.
**Recorded:** November 23, 2026 (America/New_York).
**Decision source:** The owner's November 23 Jems game-generation comparison and follow-up in the project conversation: the current built games felt materially weaker than games developed with ChatGPT Pro; the owner then explicitly selected **“Astra High”** as the **desired model for game construction** and requested a Codex implementation PR to be applied later. That conversation is not a public GitHub source. The quality difference and its cause were the owner's observations, not a controlled model benchmark.

## Context

Current private game production plans, codes and repairs through [OpenAIResponsesAgent](../../server/agent/openai.ts) using the approved Responses model and reasoning setting. The reviewed current source allows `reasoningEffort: 'low' | 'medium'`; it does not expose a `high` option in this approval type. The [private worker main workflow](https://github.com/family-game-factory-lab/family-game-factory-worker/blob/dddf53dbc76796be19782c1bb5bbb99b86e99909/.github/workflows/factory-private.yml) checks out public source `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`, not the current public main. That repository pin is not the effective live Actions variable or deployed gateway state.

A perceived gap between hand-built high-effort games and private generated games could arise from model capability, reasoning effort, instructions, runtime limitations, art approval, repair loops, input quality or several causes together. Neither UI model branding nor a successful CI run establishes a supported private Responses API model ID, cost, quality or provider entitlement.

## Decision

- **Target:** use the owner's “Astra High” quality/capability target for game **construction** in the existing authorized adult-private workflow. The implementation must resolve that product-facing label to a real, supported provider model ID and reasoning controls before any rollout; do not assume that the ChatGPT label is an API identifier or that `high` can be passed through today's validator.
- **Scope:** plan, source generation and repair for adult-private game building, through the existing coordinator and quality gates. Whether the independent captured-play reviewer should use the same or a distinct supported model is an implementation/approval question, not an implicit expansion of this choice. Child coaching, speech, image generation, child paid access and unrelated features are not changed by this decision.
- **Release boundary:** preserve the present model approval, current pricing review, per-job/token/timeout limits, adult authorization, consent, source/worker/image pins, isolation and trusted Keep. Any new model entitlement, actual rate, reasoning controls, provider permissions and spending envelope require verification and separately reviewed compatible implementation/release evidence. A documentation or Codex PR cannot activate paid work by itself.
- **Quality assessment:** compare the candidate and current production generator on the same owner-approved child ideas and forms with a documented prompt, runtime, assets, budget, capture and review procedure. Evaluate idea fidelity, interactive consequences, visual craft, repair yield, latency and actual usage separately, with real-provider acceptance only when approved. Do not claim observed child enjoyment, learning or model superiority from code-only tests.

## Consequences and limits

The target may increase model cost, latency, and token needs; actual rates, context limits, entitlement, supported high-effort parameter and readiness are **unknown until checked with the provider and the configured private environment**. The existing bounded source/runtime and authored acceptance requirements remain in force; greater reasoning effort cannot by itself supply missing runtime capabilities or validate enjoyment.

The intended implementation is deferred to a separate, reviewed Codex PR; no runtime, private workflow, cloud configuration or provider allowance changes in this documentation correction. The owner's model selection is the new decision. This record does not supersede the [playable-quality standard](0006-style-diverse-playable-quality.md) or [separated execution](0004-separated-private-execution.md).

## Evidence and related documents

- [Current executable Responses agent and approval checks](../../server/agent/openai.ts) — current source capabilities, not current live model selection.
- [Private worker pinned workflow](https://github.com/family-game-factory-lab/family-game-factory-worker/blob/dddf53dbc76796be19782c1bb5bbb99b86e99909/.github/workflows/factory-private.yml) — repository checkout pin only; effective variables and released revisions must be observed independently.
- [Presentation and playable-quality contract](../game-intelligence/PRESENTATION-QUALITY.md) — plan, art, code, separate review and repair acceptance.
- [Current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery evidence](../../DELIVERY-STATE.md) — source-to-production boundaries and dated operational limits.

## November 24 implementation status (not a new decision)

[Draft PR139 at e262e032](https://github.com/jzwyrzyk/family-game-factory/pull/139) implements a proposed default-off Adult Private premium policy, separate planning/construction/review/repair approvals, policy/worker pinning and bounded reservation. The PR's stage labels and configured model strings are not evidence of provider availability, entitlements or owner approval of additional spend or separate stage choices. Main and the private worker checkout pin remain unchanged for model selection. See current delivery state; do not treat the implementation proposal as a superseding accepted decision.
