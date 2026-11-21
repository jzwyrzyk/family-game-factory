# 0013 — Two Pal forms with earned-progress compatibility

**Status:** Accepted two-form scope; five-adventure transition is the explicit implementation compatibility policy for this preparation.
**Recorded:** November 20, 2026 (UTC), during preparation of PR81 and PR68 for merge.
**Decision source:** The owner's [two-form handoff on PR68](https://github.com/jzwyrzyk/family-game-factory/pull/68#issuecomment-7024887001) requires Base and Grown only and explicitly leaves the numeric threshold to implementation reconciliation. The owner subsequently requested completion of PR81 and PR68 and preparation for merge. This record does not attribute the numeric choice to artwork approval.

## Context

The original [Pal decision](0012-pals-from-earned-activity.md) used three derived stages at 0, 5 and 15 adventures. The accepted [Gem Pal Studio method](2026-11-19-gem-pal-studio.md) has exactly two forms, with `base` and `mature` as established artwork keys and **Grown** as the display name for `mature`.

The Pal workspace stores ownership, activity assignments, selection history and preferences. It does not store a stage number. The branch also predates merged problem-solving evidence, navigation continuity and Art Studio. Replacing these newer features with the older branch would lose supported behavior and recovery guarantees.

## Decision

1. Derive **Base** for 0–4 adventures and **Grown** from 5 onward. Five preserves the existing first earned transition: old Bright and Radiant histories both remain grown. Using 15 as the sole threshold would demote an already grown 5–14-adventure history, so it is not used for this compatibility update. There is no third form or second growth event at 15.
2. Keep activity receipts, cumulative adventures, learning remainders, owned IDs, equipment history and backup schemas intact. Do not persist a migrated derived stage. A new 4→5 transition can celebrate once; an existing grown history, refresh, restore or 14→15 transition cannot manufacture another growth event or reward.
3. Retain `glim`, `kip` and `riff`, the existing free starter and 50/150 lifetime-gem collection rules, and nonspendable gems. Numerical thresholds remain engagement policy, not a measure of learning or a proven optimal setting.
4. Keep the existing provisional token scene assets `pal-glim`, `pal-kip` and `pal-riff` stable. An unassigned species/character mapping remains unresolved; do not guess which approved character becomes a runtime Pal. Future selected Base/Grown artwork needs explicit form/version bindings and acceptance without silently changing artwork in an existing saved scene.
5. Reconcile the runtime with current main and PR81's first-creation integration, preserving optional guidance, exact private-art and game references, explicit Keep, required-learning guards and profile/adult ownership. The prepared merge order is PR81 followed by PR68; repository integration and production release remain separate observations.
6. Extend the current family progress backup coordinator with the Pal snapshot while retaining problem-solving data and notebook guidance. Recover only sources captured in a historical journal. Reject raw recovery exports as ordinary complete backups. Private drawing bytes retain their separate art-backup boundary.

## Consequences and limits

The two-form model needs no saved-data reset or database version change. Progress beyond five adventures remains visible without promising another transformation. Existing source activity and reward eligibility remain authoritative.

The runtime can be reviewed independently of the unfinished character/animation library. Token scenes demonstrate actual editable behavior, while final character art, form-specific rigs, physical-device use and child comprehension need their own evidence. This preparation adds no provider activation, new paid capability, cloud synchronization or generated-game inventory authority.

Revisit the threshold only through an explicit policy change with saved-progress compatibility and observed comprehension/voluntary use. Revisit asset mappings when exact approved character/form assets and their intended runtime identities are established.

## Evidence and related documents

- [Pal contracts and compatibility](../pals/README.md), [Gem Pal Studio](../pals/STUDIO.md) and [growth guide](../pals/GROWTH_GUIDE.md).
- [Shared rewards and backup recovery](../rewards/README.md), [Creation Studio](../creation-studio/README.md), [Art Studio](../drawings/ART_STUDIO.md), and [first-creation journey](../child-journey/FIRST-CREATION.md).
- [Delivery state](../../DELIVERY-STATE.md) records actual checks and source identities separately from this policy.

## November 20, 2026 — expression animation test observation

The approved **Wink Base** expression pilot is a 180 ms artwork-to-artwork opacity transition. Its reduced-motion requirement remains cancellation on the browser's reported preference change, not permanent disabling of the portrait or a longer animation. The browser's `matchMedia` notification is asynchronous after the test harness changes media emulation; [PR #92](https://github.com/jzwyrzyk/family-game-factory/pull/92) repairs only the timing of the integration test by waiting for controller notification and then checking for zero active animations. The Pal collection, Base/Grown forms, visual assets and user-visible behavior are unchanged.

## Subsequent character integration

The [November 21 approved-collection decision](2026-11-21-approved-pal-collection.md) fills the originally empty artwork bindings and expands the collection. It preserves this decision's five-adventure transition, saved receipts, legacy token scene references and two-form policy.
