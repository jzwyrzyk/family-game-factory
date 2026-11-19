# 0009 — Apply the approved brand library with original maker rank portraits

**Status:** Accepted owner-directed visual scope; application integration and deployment are separate.
**Numbering:** Recovered as local ADR0007; renumbered to 0009 to preserve merged Creation Studio ADR0007 and cosmetic making-journey ADR0008.
**Recorded:** November 19, 2026.
**Decision source:** The owner's brand-library review and explicit approval of v1.2 in the development conversation, followed by the request to prepare PR57 for merge. The original conversation is not a public issue; this records its scope without inventing a public approval artifact. [The library contract](../brand/LIBRARY_V1_2.md) is the implementation reference.

## Context

The owner endorsed the factory artwork and thumbnails and asked for a coherent art and interface library throughout Jems. The owner directed removal of the specific three-short-ray ornament from the logo, retention of its existing wordmark sparkle, and alignment of the Gem companion with the logo. The later framed medal experiments were rejected because they did not have the soft character quality of the approved children holding gems. The accepted v1.2 direction uses the original maker outfit portraits as rank thumbnails everywhere.

## Decision

- Adopt the supplied current SVGs at existing identity URLs. Preserve wordmark, wrench, facets, tagline, colors and the single four-point wordmark sparkle. Retain the precise removal of the three short rays; never regenerate or typeset the logo inside an illustration.
- Keep the five logo-aligned Gem companion poses as the shell's separate helper family. Preserve the endorsed factory scene artwork and existing gameplay/thumbnail behavior.
- Use the chosen Spark/Nova native atlas frame for each rank across Journey, cards and earned popups. Preserve faces, outfits, held gems and original glints. Master keeps the original rainbow star. No framed metal medal, shield, ribbon, wing-like garland or generated replacement Master diamond is active rank art.
- Reuse the four native gem frames only as tiny secondary progress indicators. The choice of art never creates progress. [ADR0008](0008-cosmetic-making-journey.md) and its evidence contract retain the current three-project Master policy and all saved-evidence requirements.
- Apply local licensed Nunito/Inter fonts, canonical colors and shared interface states with live DOM text and controls. Keep reading, learning and parent/privacy surfaces quiet, and preserve accessibility and reduced motion.
- Preserve the same-site adult development and guardian-consent boundaries from merged [ADR0005](0005-temporary-adult-profile.md). This art integration does not authorize new provider processing, change learning assessment, or merge independent game/research work.

## Consequences and limits

One selected-maker/level mapping prevents Journey, chooser, rank cards and earned popups from showing inconsistent characters or outfits. Native source atlases remain the human-art authority; source hashes and derivative records make artwork changes reviewable. Library approval supersedes the earlier rejected ornaments and medal treatments without reopening unchanged approved elements.

The original SVG implementation was reconstructed/traced from raster artwork. The controlled edit and owner acceptance do not recertify its provenance as an original vector master. The library's review boards are art compositions, not application screenshots or evidence that every consuming surface has passed. Exact-head application rendering and existing behavior tests are still required.

The approval concerns the visual library and its integration. It does not change earning semantics, add a reward economy, turn factory cover illustrations into playable games, deploy the site or establish provider/device/child acceptance. Reconsider the presentation when the owner or observed usability supports a further change, and record that change explicitly rather than silently replacing source art.

## Related references

- [Brand library v1.2](../brand/LIBRARY_V1_2.md), [brand standards](../brand/README.md) and [asset integration map](../brand/art-library/README.md).
- [Making-journey evidence and UI contract](../brand/GEM_PROGRESS.md) and [native artwork provenance](../brand/achievement-art/README.md).
- [Product doctrine](../../PRODUCT-DOCTRINE.md), [current architecture](../../ARCHITECTURE-CURRENT.md) and [delivery evidence](../../DELIVERY-STATE.md).
