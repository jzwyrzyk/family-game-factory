# Approved Jems brand library v1.2

**Status:** Owner-approved visual direction, being integrated with PR57 on current main, preserving its Creation Studio, quality and adult/guardian contracts. Approval of the artwork is distinct from application validation and deployment. [ADR0009](../decisions/0009-approved-brand-library-v1-2.md) records the decision; [delivery state](../../DELIVERY-STATE.md) records the candidate and its evidence.

## One identity and one rank-art mapping

Use the supplied current SVG identity, the logo-aligned **Gem companion**, the endorsed factory artwork and the original **Spark/Nova** makers. The Gem companion is the faceted helper; Spark and Nova are the two human maker choices. The legacy `character_spark_*` helper filenames do not rename the human Spark.

The primary rank thumbnail is the selected maker in the exact original outfit for that level, holding its original gem. Journey, progress cards and earned popups resolve the same maker/level pair. When no choice is saved, both choices receive equal treatment; a rendered default must not silently persist a preference. An explicit future-stage preview may change the pictured outfit but keeps the actual earned level visible. The chooser follows that explicit preview while saving only the cosmetic maker choice.

| Rank | Original held prop | Primary artwork |
| --- | --- | --- |
| Gem Maker | Blue rough gem | Spark or Nova, frame 1 |
| Gem Cutter | Violet cut gem | Same chosen maker, frame 2 |
| Gem Polisher | Cyan prism | Same chosen maker, frame 3 |
| Gem Master | Original rainbow star | Same chosen maker, frame 4 |

For a project-stage popup, show the current overall earned outfit even if its message names a lower project stage. A new cut project does not change a Gem Master portrait back to Gem Cutter.

Preserve the entire face, held gem, tools, outfit and shoes. Do not stretch the 543 × 724 frames into squares, regenerate faces, recolor props or add medal/shield surrounds. The four framed medals and generated pointed Master gem from the earlier library experiment are retired. The original ribboned medal and wing-like garland also remain retired. Standalone native gems are secondary tiny progress indicators, never substitutes for the primary rank portrait.

## Runtime and provenance map

| Family | Runtime source | Contract |
| --- | --- | --- |
| Identity | Existing `public/jems-logo.svg`, mark, wordmark, mono/reversed, app-icon and compatibility URLs | Exact approved SVG bytes and revision lineage; only the owner-authorized three-short-ray removal changes the original integration baseline |
| Gem companion | `public/jems-art/character_spark_{wave,think,celebrate,recover,rest}.webp` | One logo-aligned helper family; quiet contextual support, not an earned-rank substitute |
| Factory artwork | `public/jems-art/hero_workshop.webp`, `hero_mind_your_jems.webp`, `hero_gembots.webp` | Preserve the endorsed art. Workshop is supporting shell art; a cover alone does not create a playable starter game |
| State illustrations and decorative gems | Registered files in `public/jems-art/` | Place only in the corresponding real state; keep text and actions in the DOM |
| Human makers | Existing `public/jems-journey/characters-spark.webp` and `characters-nova.webp` | Eight original frames, unchanged native atlas bytes; four stages per maker |
| Secondary stage gems and Journey scene | Existing `public/jems-journey/gems.webp` and `background.webp` | Four original gem frames and the retained background; no new fourth project-evidence state |
| Functional icons | `public/jems-art/icons/` and `jems-icons.svg` | Functional UI symbols remain distinct from illustrated artwork; accessible names live on controls |
| Local fonts | `public/fonts/jems/Nunito-Variable.woff` and `Inter-Variable.woff` | Nunito headings; Inter interface/body text; retain both OFL notices and fallback stacks |
| Shared styling | `src/brand/art-library.css`, existing `jems.css`, Journey/Delight styles | Shared semantic surfaces, radii, target sizes, font roles and quiet artwork states; preserve existing controls and behavior |

The [asset integration map](art-library/README.md) and [registry](art-library/assets.json) record actual paths, source/derivative hashes and geometry. The adjacent identity, Journey-source, font and token records preserve lineage. The app reuses the native Journey atlases rather than shipping duplicate PNG crops. Asset counts in the review library therefore do not equal runtime file counts.

The logo's lowercase wordmark, angled white wrench, facets, tagline and single four-point wordmark sparkle remain intact. The removed motif is the specific cluster of three short rays above the gem. Authentic maker-prop glints and the Master star remain allowed. Earlier source-guide images are historical evidence, not authority to restore the removed rays. Controlled revision and owner acceptance do not retroactively certify that the traced SVG was an original vector master.

## Interface styles and states

The identity palette remains Ink `#0B1E3B`, Jem Blue `#2E6BFF`, Spark Purple `#8B5CF6`, Build Mint `#22D3A6`, Idea Gold `#FFC24D`, Play Coral `#FF5E7A`, Cloud `#FFF7EE` and Soft Lilac `#E6D8FF`. Small white action text uses the darker semantic blue `#195FD0` or purple `#7136C9` where applicable. Color is never the only signal of selection, error or earned state.

Use generous white/Cloud space, softly rounded controls and consistent readable type. Main touch actions target 48px and secondary controls 44px as library design targets; verify actual rendered controls and spacing. Native keyboard, focus, disabled/busy/error behavior and visible labels remain part of the existing application. Keep Math, Language Arts, privacy and grown-up surfaces calm. The shared shell does not impose one art style on generated games.

Render state art from real application state: thinking for actual work, recovery for an error or reconnection path, and celebration only after the existing verified transition. Do not invent progress percentages, safe-save promises, unavailable services or successful builds. Companion images must not hide text, capture focus or cover gameplay. Reduced motion keeps the useful still and status text. No automatic audio or new sound preference is introduced by adding artwork.

## Behavior and integration boundaries

The [making-journey contract](GEM_PROGRESS.md) remains authoritative for evidence. Individual projects stay rough → cut → polished. Gem Master remains the existing three-distinct-polished-project implementation policy. This presentation change adds no award ledger, storage migration, gender field, points, streaks, currency or educational proficiency claim.

Preserve explicit Send, Build and Keep; save failures and recovery; owner/profile isolation; the merged adult profile and guardian-consent gates; existing games, learning state and versions. The three factory scene files do not merge PR56, create Gem Factory/GemBots gameplay or authorize other feature branches. Browser assets use the application base URL, including `/arcade/`; no CDN, font tracker or runtime image-generation request is required.

## Offline asset delivery

`tools/offline-build.ts` retains the strict same-origin build-manifest allowlist and excludes runtime factory configuration and private API paths. The core five artwork files, local fonts and native Journey assets are available through the core offline shell; optional covers, extra poses and icons are fetched and cached on first use. Do not eagerly add every optional illustration to installation downloads. `tests/offline-shell.cjs` verifies core availability, that unused GemBots art is not prefetched, and that an explicit asset fetch becomes available offline. These are cache-boundary checks, not evidence that a remote provider works offline.

## Acceptance for the integration candidate

Review the actual application after the production build, with the current approved library as the visual reference. Check the exact logo and retained sparkle; the active think/celebrate/recover companion poses in their real states, with wave/rest retained as optional library assets; selected maker/level consistency across Journey, chooser, cards and popup; portrait crops; local font fallback; and absence of retired medals or generated Master diamonds. Reuse the existing evidence, Journey, Delight, homepage and regression suites for the affected paths.

Verify desktop/tablet/mobile layouts, 320px reflow, 200% zoom, keyboard/dialog focus, reduced motion, truthful earned-versus-preview state, failed maker saves, profile switching and `/arcade/` asset loading. Keep historical screenshots and their original scope; new exact-head captures establish the new candidate's result. [The documentation maintenance process](../context/MAINTENANCE.md) requires per-area review after source settles, not a blanket fingerprint refresh. Deployment, provider activation and real-device/child acceptance remain separate evidence in delivery state.
