# jems delight layer — current contract and historical rollout

## Current authority

The original PR33 joy-layer palette and system-font-only setup are superseded by PR34 and the owner-approved [library v1.2](LIBRARY_V1_2.md). Current identity colors are Ink #0B1E3B, Jem Blue #2E6BFF, Spark Purple #8B5CF6, Build Mint #22D3A6, Idea Gold #FFC24D, Play Coral #FF5E7A, Cloud #FFF7EE and Soft Lilac #E6D8FF. Use the exact ray-free identity revision and local licensed Nunito/Inter fonts.

The existing verified-event controller remains the host. PR57 adds the [cosmetic making journey](GEM_PROGRESS.md) and short, nonblocking earned popups. V1.2 makes the chosen Spark/Nova original outfit the primary rank thumbnail in those popups and Journey; no framed medal replaces the character. Engine, learning, ownership, adult/guardian authorization and explicit Keep behavior remain intact. The historical deliverables and checks below retain their original scope; they are not new exact-head acceptance results.

**Later shared rewards:** [ADR0010](../decisions/0010-lifetime-gems-and-shared-rewards.md) adds a separate lifetime engagement-gem ledger and its [Rewards UI](../rewards/README.md). The historical Delight events below remain presentation events and cannot mint gem receipts. The new completion reward accepts supported work without changing the earlier evidence labels or maker-rank criteria.

## Original PR33 deliverables · historical scope
- Local, reusable maker-workbench and four original world-scene SVGs, with existing quality-rendered Gum and Rally thumbnails preserved.
- World-specific *accent* identities for six favorite game cards; headline readability, small meaningful category chips, focus-visible states and reduced-motion-friendly hover affordances.
- Richer Studio welcome and new-idea empty state; saved work and versions use truthful state labels, not invented rewards.
- Math uses a blue/mint framing accent, English purple/coral; questions, math physics, answer decisions and parent reports remain unmodified.
- Delight controller lives in src/brand/delight.ts + delight.css; installed once by src/main.ts, without an independent reward store, network requests, automatic sound, data mining or focus manipulation. Current PR57 earned popups use this same host.

## What qualifies for a celebration
| Kind | Trigger | Guard |
|---|---|---|
| First idea | First actual child message persisted to a newly created game notebook | Never on just opening Create or typing a draft |
| Playable preview | Trusted non-mock backend confirms a new ready revision | No queued, failed, incomplete, or mock builds; never claim published |
| Kept version | Local or remote version successfully made main | Confirmation, project and learning gates remain unchanged |
| Copied game | Separate private project and learning settings are saved | No upload, sharing or public achievement |
| Practice | First, then every fifth session independent completed Math/English question | Per profile + subject; no skipped/shown/helped completion or failed save; does not imply mastery |

## Motion and design constraints
- At most one transient, non-modal burst at a time, under three seconds; no repetitive click rewards or endless confetti.
- Motion respects prefers-reduced-motion and never enters live game media or reading passages. The only continuous motion is very slow small ambient sparks/workbench and is disabled under reduced motion.
- No touch blockers, autoplay audio, camera/speech activation, forced changes, focus theft or new child-data fields.
- No artificial streaks, coins, grading, educational proficiency claims or invented tested/available content. The four cosmetic making levels are the specifically documented PR57 extension, derived from saved evidence under `GEM_PROGRESS.md`.
- On mobile the single clear Create entry and playable favorites remain first-screen priorities; wordmark and parent controls are unobstructed.

## Existing code and browser acceptance entry points
- npm run build, complete browser/creative/learning workflows and existing deployment contract tests pass on the exact PR head.
- node tests/jems-delight-browser.cjs verifies the six worlds, local art, first saved idea, no repeated message rewards, selectable English when enabled, and reduced motion.
- tests/homepage-entry.cjs and tests/language-integration.ts keep mandatory grade 1–4 Math/English settings and parent-controlled Both switching intact, with separate histories and active-question guard.
- tests/brand-review-pages.cjs produces 38 real desktop/mobile screenshots (17 existing journeys plus creator empty state and first verified idea celebration). Visually review screenshots for color, contrast, clipping, empty/failure states and parent calmness.

## Public production gate (separate from a code merge)
A merge to main is not a public service release. GitHub Pages deployment is intentionally manual. Child-facing public distribution still requires an explicit owner decision on privacy, age/parental-consent processes, safe content, data retention, security, incident response, accessibility and any paid AI/cloud exposure. This work does not enable a model provider, public community features, direct messaging or publication. Keep private child names, learning reports, or voice data out of public artifacts/issues.

## Fonts and logo
The wordmark remains the supplied SVG, with the approved narrow ray removal and retained single sparkle. Library v1.2 bundles licensed Nunito and Inter locally under `public/fonts/jems/`, with OFL notices and system fallbacks. This does not establish a proprietary “Jems Round” font or replace the outlined logo with live text.
