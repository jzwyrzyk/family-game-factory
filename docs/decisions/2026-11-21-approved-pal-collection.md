# Approved Gem Pals in the earned collection

**Status:** Accepted for implementation.
**Recorded:** November 21, 2026 (America/New_York).
**Decision source:** The owner confirmed the live starter cards still showed temporary gems, approved replacing them with the developed characters throughout selection, collection, growth and creation, and authorized deployment after verification.

## Context

The original collection shipped with Glim/Kip/Riff token portraits. The original-23 artwork package supplied 184 approved images and a separate expression preview, but no creature-to-collection binding. A passing test still required the temporary images. The requested experience requires the approved characters to be actual selectable, earned and reusable Pals.

## Decision

Use the 23 fully approved original character profiles and Brio's two approved neutral forms as the 24-Pal collection. Preserve exact artwork and names from the canonical character-reference index. Brio's six in-review expressions remain excluded; a requested expression falls back to his same-form neutral.

Keep two simple starter choices: **Luma** and **Nook**. Preserve saved inventory compatibility through the explicit aliases `glim` → Luma, `kip` → Nook and `riff` → Wink. Existing IDs, receipts, selection windows, timestamps, preferences and owned progress remain intact. The aliases are implementation assignments for this integration, not a claim that the prior artwork review assigned the temporary names.

The first starter is free. The other starter remains eligible at 50 lifetime gems; Wink retains the third slot at 150. The remaining original profiles follow their approved manifest order at 200, 250, …, 1,150 lifetime gems, and Brio at 1,200. This is an explicit initial collection schedule, not a price, ability measure or research-calibrated engagement claim. No gems are spent; a newly eligible Pal is welcomed explicitly and equipping remains a separate choice. All companions have equal creative capabilities.

One collection artwork lookup supplies the real character/form to cards, detail, home entry, game cameo, notices and new scenes. Base → Grown remains one transition at five adventures. The image changes to the exact approved Grown form. Reopening and restoring do not replay growth. Expression play changes temporary presentation only.

The main page leads with the starter choice and the approved roster. Optional expression controls belong to the selected owned Pal and its earned form. Remove the independent roster/form preview from the main selection flow. Keep child-facing text brief, readable and paired with obvious actions.

New Creation Studio actors use `pal-{slug}-{form}-{assetVersion}` references. Inserting or starting a playground captures the currently earned form. A later companion growth does not rewrite a previously saved actor. Preserve the original `pal-glim`, `pal-kip` and `pal-riff` token assets for legacy scenes; the ordinary picker does not offer those tokens as new Pals. Scene imports never grant inventory ownership.

The compact generated artwork lookup derives from the existing approved manifest and canonical index; it is not a second approval registry. CI verifies generated data and all 24 application mappings. Brio's selected PNGs are copied byte-for-byte into a separate public path, leaving the original-23/184-image expression manifest unchanged. Images load only when needed and are cached on demand. A missing picture must remain an honest unavailable state or same-character/same-form neutral fallback.

## Compatibility and release

This is a frontend behavior change with no new service route, credential, AI scope or spending permission. Gateway/preview packaging includes the new pure catalog dependencies because the trusted scene validator shares the asset catalog. The frontend continues using the existing reviewed production origins.

Older collections and backups remain valid without a destructive migration. An older application build cannot recognize a newly earned roster ID or new scene asset; a rollback must preserve stored bytes and use a compatible forward repair rather than erase data. A clean legacy-only profile still has its original IDs.

Verify fresh-profile selection, reload/profile isolation, earning and one-time growth, scene use/Keep/reopen, legacy scenes and backups, keyboard/mobile layout, missing-image recovery and offline previously viewed artwork. Source checks, fixture/browser evidence, hosted CI, merge, deployment and live acceptance are separate claims recorded in [delivery state](../../DELIVERY-STATE.md).

## References

- [Pal contract](../pals/README.md)
- [Exact character reference index](../pals/art/character-references.json)
- [Catalog](../../src/pals/catalog.ts)
- [Generator and consistency check](../../scripts/generate-pal-catalog.mjs)
- [Two-form compatibility decision](0013-two-form-pals-and-current-main.md)
- [Original expression-runtime scope](2026-11-20-pal-expression-runtime.md)
