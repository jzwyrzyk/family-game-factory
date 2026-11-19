# Production achievement artwork

This unchanged native atlas set implements the approved bright-white dashboard direction in PR #57 and remains the human-art authority for [library v1.2](../LIBRARY_V1_2.md). The current primary rank thumbnail is the chosen maker in its original level outfit, holding the original gem; Journey, cards and earned popups share that mapping. The two characters have equal visual treatment and the same four costume/gem stages. Spark and Nova are cosmetic choices; the product does not label or store gender.

## Asset contract

| File in `public/jems-journey/` | Dimensions | Framing |
| --- | --- | --- |
| `characters-spark.webp` | 2172 × 724 | Four equal 543 × 724 transparent frames |
| `characters-nova.webp` | 2172 × 724 | Four equal 543 × 724 transparent frames |
| `gems.webp` | 2172 × 724 | Four equal 543 × 724 transparent frames |
| `background.webp` | 1774 × 887 | Opaque illustrated workshop world |

Frames run left to right: Gem Maker, Gem Cutter, Gem Polisher, Gem Master. Use a **0.75 frame aspect ratio** with `background-size: 400% 100%`; positions are 0%, 33.333%, 66.667%, and 100%. Keep the character's entire face, held gem and shoes inside its frame. Do not stretch frames into squares.

The world is optional decoration; all labels, level state, controls and keyboard behavior are real DOM elements. Local image assets resolve relative to the application base URL and are included in the existing offline build. No external art host or runtime image generation is involved.

The four `gems.webp` frames are secondary tiny progress indicators. The Master star remains the original fourth frame; no generated pointed diamond or framed metal medal is used. The five separate logo-aligned Gem companion poses are supporting shell art, not replacements for Spark/Nova rank portraits.

## Original generation and refinement

Artwork was generated with the built-in OpenAI image-generation tool, using the supplied **Jems: Create Your Adventure Dashboard.png** as the visual reference. The generated atlases were refined for consistent character identity, clean transparent silhouettes, four distinct costumes and unmarked clothing. Jems' existing brand assets were not redrawn or replaced.

The complete prompts are retained in [prompts.json](prompts.json). The PNG outputs were converted to WebP at quality 93, retaining their dimensions and alpha channels. No pixel painting, synthetic replacement characters or CSS gem stand-ins are used in the finished achievement UI.

The source sheets and the background share soft light, warm expressive faces, purple/mint maker clothing, gold tool accents and translucent gem facets. The Master frame adds a capelet and star-cut gem while preserving the same character.

## Review

Use `npm run test:gem-journey` after a production build. It produces actual browser screenshots under `test-results/`, using clearly isolated test evidence to preview earned states and real save/keep actions to exercise the live achievement popup. Selected review screenshots are included alongside this document; the evidence rules live in [GEM_PROGRESS.md](../GEM_PROGRESS.md).

The linked captures below are historical PR57 application evidence from before the v1.2 rank-thumbnail refinement. They must not be presented as fresh screenshots of the new integration candidate. New exact-head acceptance belongs in delivery state and its scoped test artifacts.

Historical captures: [desktop journey](previews/journey-desktop.png), [character picker](previews/character-picker.png), [Gem Master](previews/gem-master.png), [mobile journey](previews/journey-mobile.png), and [achievement popup](previews/achievement-popup.png). These are local browser/synthetic-profile evidence, not observed child or physical-device acceptance. [ADR 0008](../../decisions/0008-cosmetic-making-journey.md) records the design choice; [delivery state](../../../DELIVERY-STATE.md) records integration and release status.
