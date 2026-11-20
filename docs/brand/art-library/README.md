# Jems art library 1.2

This is the application import of the owner-approved November 19, 2026 visual library. The complete source PNGs, catalog and 39-page handbook remain in that library; they are not duplicated into the application repository.

## Approved presentation

The primary achievement thumbnail is the **chosen human maker at the exact earned rank, holding its matching gem**. Reuse the existing Spark and Nova atlases. A small gemstone can support progress, but does not replace the maker. The rejected framed medals, ornamental garlands and replacement pointed Master gem are excluded from the active asset set.

Gem companion is the separate nonhuman helper. Its five inherited `character_spark_*` filenames do not refer to the human maker Spark. Factory illustrations and the existing human characters retain their approved appearance.

## Application URLs

URLs below are relative to the application base. Resolve them with the existing asset helper or `new URL(path, document.baseURI)` so a deployment under `/arcade/` remains valid.

| Role | URL or family |
| --- | --- |
| Creation/workshop hero | `jems-art/hero_workshop.webp` |
| Empty first-idea state | `jems-art/spot_first_idea.webp` |
| Thoughtful helper | `jems-art/character_spark_think.webp` |
| Other Gem companion poses | `jems-art/character_spark_wave.webp`, `character_spark_celebrate.webp`, `character_spark_recover.webp`, `character_spark_rest.webp` in the same directory |
| Other supporting states | `jems-art/spot_safe_storage.webp`, `spot_reconnect.webp`, `spot_work_in_progress.webp` in the same directory |
| Editorial maker scene | `jems-art/makers_together.webp` |
| Optional collectible shapes | `jems-art/gem_blue.webp`, `gem_mint.webp`, `gem_gold.webp`, `gem_coral.webp` in the same directory |
| Additional cover art | `jems-art/hero_mind_your_jems.webp`, `jems-art/hero_gembots.webp` |
| Human maker at ranks 1–4 | Existing `jems-journey/characters-spark.webp` or `characters-nova.webp` |
| Secondary gem progress | Existing `jems-journey/gems.webp` |
| Journey scenery | Existing `jems-journey/background.webp` |
| Functional icons | `jems-art/icons/<name>.svg` |
| Icon sprite | `jems-art/icons/jems-icons.svg#jems-<name>` |

The three covers are reusable artwork, not evidence that Mind Your Jems, Gem Factory or GemBots gameplay is installed. Do not relabel an unrelated existing game to use one of these covers.

The native Journey atlas geometry stays unchanged: four 543 × 724 frames, left to right, at a 0.75 aspect ratio. Ranks are Gem Maker, Gem Cutter, Gem Polisher and Gem Master. Both characters use the same rank. Use `background-size: 400% 100%` and horizontal positions 0%, 33.333%, 66.667%, 100%, or the existing `setJourneySprite` helper. [Native frame provenance](journey-source-provenance.json) and [the public-asset manifest](assets.json) preserve the exact mappings and source hashes.

## Identity and primitives

Nine identity SVGs and four patterns are copied byte for byte from the approved library to their existing `public/` URLs. Eight identity variants contain the authorized removal of the three short rays above the gem. The separate four-point wordmark sparkle remains. Compact mark viewBoxes recenter the remaining gem; no remaining path, wordmark, wrench or color was changed. The retained repository SVG is an interpreted trace, not a claim of a certified original master.

[The exact revision record](identity/revision-manifest.json) includes the removed XML and byte offsets. The verifier reconstructs each historical source file and compares its hash to [the original source provenance](identity/provenance.json). Those historical records are not current PR/deployment status.

All 32 functional SVG icons and their sprite retain exact approved bytes. [tokens.json](tokens.json) and [component-contracts.json](component-contracts.json) are the approved reusable primitives. These documents describe design contracts; they are not a claim that every catalog demonstration is wired to application behavior.

## Fonts

The exact approved WOFF packages and their SIL Open Font License notices are served locally. There is no font CDN or runtime font request to an external host.

| Family | URL | Verified variable axes |
| --- | --- | --- |
| Nunito | `fonts/jems/Nunito-Variable.woff` | Weight 200–1000 |
| Inter | `fonts/jems/Inter-Variable.woff` | Weight 100–900; optical size 14–32 |

Use Nunito for display text and Inter for readable interface text. Keep the outlined logo wordmark as its supplied vector. The WOFF files total 585,040 bytes. [Font provenance](font-provenance.json) records the pinned Google Fonts sources, packaging and license hashes. The notices are alongside the public fonts; [license notes](licenses/README.md) distinguish those licenses from project artwork.

## Export and integrity

The 17 new illustration files use lossless WebP with original dimensions and alpha. Export settings are Pillow WebP `lossless=True, quality=100, method=6, exact=True`; the manifest pins the encoder versions. Every output was decoded and compared against every RGBA byte of its approved PNG. No resize, crop, recoloring, new art generation or visual retouching was performed for these exports.

The 13 native Journey PNG exports already have exact source WebP atlases in this repository, so no duplicate standalone images are shipped. Existing atlas bytes are checked against the approved library. Source/derivative file hashes, RGBA hashes, dimensions, source PNG byte counts and exported byte counts are in [assets.json](assets.json). [Generation provenance](generation-provenance.json) retains the approved image histories; it does not generate artwork at runtime.

Run the read-only integrity check from the repository root:

```sh
node scripts/verify-brand-assets.mjs
```

It checks deployed file hashes and dimensions, exact identity lineage, the banned ray signature, unchanged Journey frames and rank mappings, sprite coverage, font packages and license presence. It also rejects an unregistered illustration or retired reward in the active art directory. Source PNGs are outside this repository; their recorded export comparison is protected by the approved derivative byte hashes.

Keep unused editorial artwork, collectible shapes and future covers out of eager first-visit loading. All five companion poses now have real application states; the active set and icon sprite belong to the core offline shell. Their availability in the asset registry does not require preloading every illustration. Runtime and offline caching policy belongs to the application integration.
