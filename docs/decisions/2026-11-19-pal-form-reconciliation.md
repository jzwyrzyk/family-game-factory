# Gem Pal character and form reconciliation

**Status:** Accepted for the specific form selections below; unresolved references and unapproved candidates remain explicit.
**Recorded:** November 19, 2026 (America/New_York).
**Decision source/date:** The owner's later November 19 artwork review selected the newly shown U Pleeko, V Talli and X Whorl mature forms, preferred Chimi and Navi from the parallel companion artwork conversation, and requested one consistent character reference across revisions. This record paraphrases that direction without publishing a private conversation.

## Context

The earlier [base-adoption decision](2026-11-19-pal-base-design-adoption.md) approved S–X and paused growth. The owner subsequently resumed growth review using substantial anatomy, gem-function and character-purpose changes. Multiple conversations then produced competing versions. A newer image or a completed generation is not automatically the selected version.

The roster has **22 selected entries and 23 individual character profiles**: F remains the Navi/Mote partnership, with individual profiles F1 Navi and F2 Mote. C Tollo and J Pock remain set aside. Review letters and editable names are not persistent application identities.

## Decision

- Keep the newly reviewed mature forms of **U Pleeko, V Talli and X Whorl** from this workstream as the selected growth references. Preserve their exact bytes, source-image provenance and hashes.
- Use the preferred **T Chimi and F1 Navi from the other artwork conversation**. The selected directions are Chimi with corrected short attached arms and paired sound chambers, and Navi as a floating violet-crystal caster. If the exact latest image bytes are not accessible, record the selection and an unresolved image reference; do not substitute an earlier or locally generated variant.
- Keep **S Poff and W Zippa** as review candidates unless a separate explicit selection is recovered. The owner did not select those new growth studies in this follow-up.
- Preserve each approved base separately from its grown form. Store current and superseded artwork references per character and per form in the [character reference index](../pals/art/character-references.json). Keep candidate status, selection status and exact-reference resolution distinct.
- Replace the blanket current growth pause with per-form status. The old pause remains in the earlier decision as history. These selections do not grant blanket approval to all mature-form candidates.

## Follow-up: two growth stages, total

The owner's subsequent November 19 decision settles **two visual stages only** for this release: **Stage 1 Base** (the approved original) and **Stage 2 Grown** (the individually selected mature form). The artwork index maps `forms.base` and `forms.mature` to those design stages. Do not generate a Bright/intermediate body, add a third illustrated step, or infer approval for unresolved mature portraits. Any future extra form will require a new design decision.

This original artwork decision did **not** set a numerical adventure threshold. Subsequently [PR68](https://github.com/jzwyrzyk/family-game-factory/pull/68) merged a tested two-form runtime using the explicit compatibility threshold of five adventures, without deleting adventure totals, receipts or Pal ownership. The preferred Chimi and Navi references remain selected, but their exact images remain unresolved in this imported index.

## Consequences and limits

The [artwork entry point](../pals/art/README.md) is the review and handoff source for current character choices. The base manifest preserves the original base specifications; the character reference index tracks the later form decisions. Stable source references and content hashes protect against accidental substitution during future edits.

The selected images are concept portraits with presentation backgrounds and labels. They are not isolated production sprites, expression sheets, animation rigs or verified game assets. Growth capabilities describe fictional design intent, not implemented simulation or measured physical performance.

The merged companion implementation uses persistent identities and exactly two runtime forms, **Base** and **Grown**, while retaining temporary gem portraits. This selection supplies no runtime ID or completed art binding. Existing collections, saved scenes and backups must be preserved when form-specific art is later integrated. Missing selected Grown artwork remains unresolved and must never be replaced by a guessed version.

## Evidence and related documents

- [Current selected and unresolved character references](../pals/art/character-references.json).
- [Approved bases, selected growth portraits and application handoff](../pals/art/README.md).
- [Original base-design specifications and board provenance](../pals/art/approved-base-designs.json).
- [Companion implementation PR68](https://github.com/jzwyrzyk/family-game-factory/pull/68).
- [Delivery state](../../DELIVERY-STATE.md) for separate merge, deployment and acceptance evidence.

This art decision alone never established companion functionality. PR68 later merged the runtime separately; this reference tranche does not establish deployment or in-game visual acceptance.
