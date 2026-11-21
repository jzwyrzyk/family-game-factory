# Versioned Gem Pal expressions and a bounded motion pilot

**Status:** Accepted for implementation.
**Recorded:** November 20, 2026 (America/New_York).
**Decision source:** The owner's explicit request to integrate the completed original-roster artwork, form/expression resolution and a small motion pilot after approving the core artwork. This records that implementation direction; it does not create new artwork-approval dates or claim deployment.

## Context

The [current selected-art index](../pals/art/character-references.json) now resolves all 23 original profiles: 46 neutral masters and 138 approved expressions in package 2.9. Each profile has Base and Grown with Neutral, Celebrate, Thinking and Encouraging retry. Earlier imported unresolved statuses are retained as history. Brio's separately approved neutrals and six in-review expressions remain outside this completed core set.

The existing collection and saved scenes have independent identities and earning rules. [ADR0013](0013-two-form-pals-and-current-main.md) preserves `glim`, `kip`, `riff`, stable `pal-*` scene assets and the five-adventure Base-to-Grown transition. Artwork resemblance cannot establish an identity migration. The approved PNG set is also large enough that preloading every expression would be wasteful.

## Decision

1. **Bind the exact approved core set through a versioned manifest.** Use the existing 23 character keys, nullable species IDs, `base`/`mature` form keys and four explicit state keys. Keep source PNG and exported-image hashes, dimensions and decoded-pixel evidence. A new selected image or expanded roster needs an explicit asset-version change.
2. **Export lossless WebP and load on selection.** Preserve complete native RGBA pixels, dimensions, alpha and approved backgrounds. The current 184 WebPs use 207,077,748 image bytes compared with 312,373,555 PNG bytes, a 33.7083% reduction before manifest overhead. Open the expression explorer intentionally and decode only selected pictures. The offline shell precaches the small plain-path manifest and caches allowed images only after use; it never installs the complete portrait set.
3. **Keep fallback within the selected character and form.** Missing supported expressions or failed expression loads can use only that form's neutral. Invalid identities/versions fail closed; a failed neutral shows an unavailable state and explicit retry.
4. **Keep reactions transient and host-scoped.** Use cancellation and latest-request epochs for owner, form, selection, visibility and disposal changes. Explicit controls select presentation states. Saved-success and growth triggers are bounded trusted-host contracts, not permission to award progress or infer a child's emotional state.
5. **Begin motion with a finite Wink Base opacity pilot.** Fade between unchanged approved illustrations for 180 ms, with immediate reduced-motion cancellation and direct-swap fallback. This introduces no new artwork, articulated rig, facial deformation or looping animation.
6. **Expose a read-only expression playground without assigning collection identities.** The implemented My Pals entry is the collapsed **Try Pal expressions** section, with 23 character choices, Base/Grown and four states. Preview selections do not equip, collect, unlock, earn, save a scene or invoke a provider.

The detailed API, lifecycle, integrity, source limitations and validation contracts are in [Approved Gem Pal expressions](../pals/EXPRESSIONS.md).

## Consequences and limits

The selected pixels remain inspectable and versioned while the browser loads only what a view needs. The full set still contains about 207 MB of encoded images, so lazy image loading remains a requirement; lossless conversion does not make mass preloading appropriate. Previously cached images can be reused offline, while an unseen image may remain unavailable. Asset-version validation stays inside the manifest so the loader can use the offline shell's exact allowlisted URL.

No existing collection ID or saved scene is silently reassigned. The independent full-roster gallery can reuse the exact-character expression panel, but this decision does not claim that gallery has been integrated. Saved-success and growth are supported controller trigger names and fixture contracts; automatic dispatch from earned companion events is not connected by the current playground.

Navi Base R2 and its faceless floating focus gem remain authoritative. Mote Base's 125×145 neutral-source limitation remains visible without reopening its settled approvals. Brio is excluded until its separate expression scope is complete and versioned. Opaque scenes, alpha cutouts and independently composed frames retain their approved treatment; wider motion, alignment and rig production require their own evidence.

This increment changes no collection entitlement, reward or growth threshold, activity receipt, profile/backup policy, learning evidence, provider authorization or saved-scene format. The component's owner scope is supplied by the trusted host. It does not gain authority over those systems.

## Implementation and acceptance evidence

The source provides the [validated resolver](../../src/pals/artwork.ts), [lazy manifest loader](../../src/pals/approved-artwork.ts), [transient controller](../../src/pals/expressions.ts), [portrait view and motion pilot](../../src/pals/artwork-view.ts), [explicit panel](../../src/pals/expression-panel.ts), and [My Pals explorer](../../src/pals/expression-explorer.ts), mounted from [the existing page](../../src/pals/ui.ts).

The frozen [manifest](../../public/jems-pals/manifest.json) has asset version `core-2026-11-20` and SHA-256 `4135c90c543b134395af1b9bba24b98722057d24ee64ba3435025482125a44ca`. The [exporter](../../scripts/export-pal-assets.py), [asset verifier](../../scripts/verify-pal-assets.mjs), [asset contracts](../../scripts/tests/verify-pal-assets.test.mjs), [controller tests](../../tests/pals-expressions.test.ts), [component browser fixture](../../tests/pals-expressions-browser.cjs) and [offline-shell tests](../../tests/offline-shell.cjs) keep export, cache and presentation evidence separately testable.

Passing a component fixture is not proof of live earning, full application acceptance, physical-device behavior, a character rig, merge or deployment. [Delivery state](../../DELIVERY-STATE.md) owns the actual source/environment observations and remaining release work. No additional concept-art approval gate is introduced for the exact already-approved core assets.
