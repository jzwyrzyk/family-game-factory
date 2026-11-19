# O1 — Child Intent Contract: Design, Proof and Limitations

**Scope:** This is the source-traceable O1 research foundation only. No new game features, model calls, persistent data collection, physics/3D routing, production activation or user interface.

## Question answered

How can Jems retain what a child requested as an exact, reviewable contract without inventing new gameplay requirements?

The implementation provides a **strict contract and a conservative local proposal**, not universal natural-language understanding or permission to change a game.

## The contract

Implemented in server/quality/child-intent.ts, with version label jems-child-intent-v1.

- Original source: EXACT unmodified child message, SHA-256 integrity hash and UTF-16 character offsets into the original text. No source normalization, no fabricated paraphrases.
- Revision provenance: optional project and base revision IDs. These are references, never authentication or permission to edit somebody's game.
- Proposed facts: entity-mention, player-action, observable-effect, payoff, goal, negative-constraint, presentation-request, play-mode or unclassified. Each has a verified exact quote and an annotation of rule-proposal or reviewer-proposal.
- Proposed relationships: sequence or causal-claim, referencing existing fact IDs and an exact quoted connective. Drafting currently infers only explicit "then" sequences. Other causal claims require a reviewed proposal.
- Uncertainty codes: missing stated player action or goal/payoff, unparsed fragments, contrast needing review, imprecise referents, drawings that might be decorative or interactive, unclear scope of existing-game edits, and possible 3D meaning.
- Status is ALWAYS proposed-not-child-confirmed. Neither source matching nor a reviewer-proposal label certifies the child approved a proposed interpretation.

An entity-mention is **only a mention**. A request saying "no robots" may contain an anchored mention of robots, but that is not permission to add a robot.

The original source is stored in the contract even when a phrase is unclassified. Overflow refuses the draft; no child text is silently discarded.

### APIs and safety

- draftChildIntentContract(raw, context?): returns locally proposed facts, known relationships and unresolved uncertainties. Does not call a model.
- validateChildIntentContract(contract): strict version/field/bounds/offset/hash/quote/reference validation. Defensive copy; no silent approval.
- exactIntentSpan(raw, phrase, occurrence?): locates exact quote. If the phrase is repeated, an occurrence index is mandatory.

Limits: 4,000 UTF-16 source units, 32 fact records, 24 relationships and 12 uncertainties. Invalid hash, forged source spans, mid-emoji offsets, unknown fields, duplicate IDs, unresolved relationship IDs, malformed revision identifiers and forged approval states fail closed.

The code is server-side research code, not a new browser integration or public telemetry surface. Child raw messages, hashes and proposal artifacts must not appear in public GitHub/runner logs.

## Representative O1 evidence

| Input | O1 behavior |
| --- | --- |
| Put socks together with bubble gum, then blast off | The attachment action and blast-off payoff are separate exact source spans; literal "then" is a source-backed sequence |
| A cat eats donuts and grows bigger and explodes into stars | Eating, growth and star explosion receive separate proposed fact tags; no added win condition |
| A robot follows a grid route | Records the child's robot/route language, but does not call it 3D or a physics simulation |
| Drive a car over hills with working suspension | Records the physical-sounding request, but leaves the engine choice for O2 |
| Draw a cat with wheels | Flags uncertain decorative versus mechanically functional wheels |
| No robots, without music | Exclusion is quoted as a constraint, not converted into a required character or soundtrack |
| No physics, but realistic gravity | Preserves both sides and marks contrast for interpretation, not automatic engine selection |
| Make it better, based on an existing revision | Preserves base-revision reference and flags missing specific editing instructions |
| Genuine 3D wording | Keeps the original wording and flags depth interpretation for later; no fake 2D fulfillment |
| A game about a cat | The absence of an action or outcome is recorded; no invented gameplay loop |

Synthetic tests also challenge Unicode offsets, repeated source quotes, source tampering, unknown schema properties, invalid project references, fake confirmed status, defensive copies and bounded rejection.

## What this DOES NOT prove

Exact source evidence prevents fabricated quotes, but cannot prove that an assigned meaning is semantically correct. The bounded deterministic proposal may misunderstand unusual verbs, arbitrary names, pronouns, emotional intent, accents, malformed speech transcription, artistic requests or long complex narratives. It cannot guarantee exhaustive extraction or interpret the entire spectrum of child-created game ideas.

These limitations are explicit. Future O2 will determine minimal gameplay mechanics; O3 plans gameplay flow; O4 integrates the contract with the existing trusted generation worker; O5 independently plays the finished game. No other objective is authorized by O1's existence alone.

## Exit criteria

O1 is COMPLETE only when the exact head passes TypeScript build, mandatory unit/contract tests, and existing integration jobs; the targeted O1 source/negative/ambiguous/revision tests pass; and this boundary is documented. Until then, O1 remains IN PROGRESS.
