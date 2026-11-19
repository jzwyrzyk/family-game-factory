# Parent reporting grounded in observable work

**Status:** Accepted; implementation merged in [PR65](https://github.com/jzwyrzyk/family-game-factory/pull/65) as `864bee8f9427bce4a8dc0e7df5495e576fd3bcdc` on November 19, 2026. [Delivery state](../../DELIVERY-STATE.md#pr65-parent-reporting--merged) records source integration separately from deployment.
**Recorded:** November 19, 2026 (America/New_York).
**Decision source:** The owner's November 19 request to research and benchmark clear parent reporting, including IXL, then develop the holistic parent area for progress, opportunities and improvement. This continues the accepted Math, Language Arts and Creation Studio evidence boundaries.

## Context

The existing parent page mixes settings, separate subject reports, creation observations and device management. Parents need a coherent view of what happened, what a result means, and a useful next step. Activity volume and percentages from unlike tasks can otherwise look like a validated learning score. IXL's practice index, its separate diagnostics, school standards and Jems observations measure different things.

## Decision

Build one parent area with Overview, Skills & progress, Evidence journal, School connections, and Settings. Preserve the current learning engines as the evidence owners. Use deterministic reporting over their records, with subject, profile, task, time, assistance and revision provenance. Do not introduce a second learner database or model-generated competence judgments.

Keep Math, Language Arts, Computational Thinking and Problem Solving separate. Keep missing evidence neutral. Distinguish first responses, corrections, help, answer reveals, unfinished activities, unscored writing, specific scene outcomes and qualifying later checks. Date filters describe retained dated records; existing skill states summarize all recorded practice under existing engine rules. Repeated checks of the same scene/version/goal remain inspectable without inflating summary counts.

Show topic/framework connections and a plain-language comparison with familiar products. A curriculum tag is a task reference, not verified curriculum coverage, a grade-equivalent result or a conversion to IXL/standardized scores. Version computational-thinking references explicitly. Claims about applying a rule in another scenario require a reviewed task relationship and qualifying evidence; ordinary scene success does not create that claim.

Keep recommendations tied to observed work or an existing review due date. A parent can inspect the examples and choose a learning focus or a short conversation. Print/download a bounded local summary only on the parent's explicit action. Existing settings, family backups and guardian/device controls remain reachable.

## Consequences and limits

The interface is useful with current local records and is honest when a domain has not been observed. The concurrent problem-solving feature is connected through an optional read-only capability; a missing capability is shown as unavailable in this build. This feature does not create secure guardian authentication, cross-device history, automatic email reports, standardized assessments, normative ranks, or a causal learning-gain claim. It does not change rewards, learning selection, provider activation or deployment permissions.

## References

- [Parent reporting contract](../parent-progress/README.md)
- [Primary-source research and benchmark](../parent-progress/RESEARCH.md)
- [Product doctrine](../../PRODUCT-DOCTRINE.md)
- [Current architecture](../../ARCHITECTURE-CURRENT.md)
- [Delivery evidence](../../DELIVERY-STATE.md)
