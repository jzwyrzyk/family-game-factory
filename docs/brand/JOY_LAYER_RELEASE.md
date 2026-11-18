# jems joyful brand pass — engineering and launch review

## Purpose
The approved gem-with-white-wrench identity stays authoritative: Ink #0B1D4D, Gem Blue #2D7BFF, Spark Purple #8A4DFF, Build Mint #34D7B3, Idea Gold #FFC828, Play Coral #FF6B7A, Cloud #FFF7EE and Soft Lilac #E6D8FF. This pass adds expressiveness without changing engine, learner data or parent control rules.

## Deliverables
- Local, reusable maker-workbench and four original world-scene SVGs, with existing quality-rendered Gum and Rally thumbnails preserved.
- World-specific *accent* identities for six favorite game cards; headline readability, small meaningful category chips, focus-visible states and reduced-motion-friendly hover affordances.
- Richer Studio welcome and new-idea empty state; saved work and versions use truthful state labels, not invented rewards.
- Math uses a blue/mint framing accent, English purple/coral; questions, math physics, answer decisions and parent reports remain unmodified.
- Delight controller lives in src/brand/delight.ts + delight.css; installed once by src/main.ts, with no storage, networks, sounds, popups, data mining or focus manipulation.

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
- No artificial streaks, coins, level claims, grading or claims that jems tested/builds unavailable content.
- On mobile the single clear Create entry and playable favorites remain first-screen priorities; wordmark and parent controls are unobstructed.

## Code and browser acceptance
- npm run build, complete browser/creative/learning workflows and existing deployment contract tests pass on the exact PR head.
- node tests/jems-delight-browser.cjs verifies the six worlds, local art, first saved idea, no repeated message rewards, selectable English when enabled, and reduced motion.
- tests/homepage-entry.cjs and tests/language-integration.ts keep mandatory grade 1–4 Math/English settings and parent-controlled Both switching intact, with separate histories and active-question guard.
- tests/brand-review-pages.cjs produces 38 real desktop/mobile screenshots (17 existing journeys plus creator empty state and first verified idea celebration). Visually review screenshots for color, contrast, clipping, empty/failure states and parent calmness.

## Public production gate (separate from a code merge)
A merge to main is not a public service release. GitHub Pages deployment is intentionally manual. Child-facing public distribution still requires an explicit owner decision on privacy, age/parental-consent processes, safe content, data retention, security, incident response, accessibility and any paid AI/cloud exposure. This work does not enable a model provider, public community features, direct messaging or publication. Keep private child names, learning reports, or voice data out of public artifacts/issues.

## Fonts and logo
The wordmark is a stable outlined SVG matching the approved reference. A licensed distributable Jems Round font has not been supplied, so the interface keeps the existing legible rounded system fallback. No font files are bundled or exported.
