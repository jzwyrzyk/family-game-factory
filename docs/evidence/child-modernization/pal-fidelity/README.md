# Pal transparency and Journey card correction

Owner feedback: physical Android review of PR188's standalone HTML showed a
rectangular background in My Journey → My Pals → Choose your free Pal, and an
oversized card. Baseline: `40063a13352b90344318a61e4fe86d74e4020433`.

## Cause and correction

Both production-bundle and offline renders reproduce the defect. The selected
Luma Base asset was correct (`neutral-93fde3101e62.webp`); its original paper is
intentional in the approved master. DOM portraits bypassed the existing
scene-only alpha preparation. Offline resizing/embedding preserved that paper;
it did not introduce it. The new shared `src/pals/presentation-image.ts` reuses
the conservative border-connected mask and exact-file interior seeds. Portraits
apply that alpha only after decode, scenes use the same prepared canvas, and
unavailable preparation uses existing error/retry paths. No blend mode, matching
background, cropping, source-file rewrite or new character variant is used.

The column Journey card inherited `flex: 1 1 240px` from a horizontal widget.
Resetting that basis, margin and grid alignment reduces the 390px phone starter
card from 274px to 126px while retaining 18px copy, a 48px minimum target, the
complete illustration and the approved Journey hierarchy.

## Surface audit

| Surface | Shared renderer / preserved contract |
| --- | --- |
| Journey, free starter, equipped widget | `createPalPortrait`; exact selected/placeholder identity, content-sized card |
| Starter selection, owned/available/locked collection, Base/Grown detail | `createPalPortrait`; approval, eligibility, growth and cached portrait lifecycle unchanged |
| Neutral/Celebrate/Thinking/Retry expressions | Both collection portraits and `createPalArtworkView`; same-form neutral fallback and cancellation unchanged |
| Gameplay companions, reward messages, early-learning handoff | Existing `createPalPortrait` callers; learning pause, narration and reward authority unchanged |
| Creative Studio character/actor choices | `createPalPortrait` for approved Pal assets; private artwork and non-Pal choices retain their own paths |
| Scene playback and export | Same alpha implementation via compatibility exports; existing active-scene cache, readiness, aspect and saved IDs |
| Loading, empty, error, stale owner/form | Raw image stays hidden until prepared; failed preparation cannot expose paper or a previous identity; explicit retry retained |

## Verification

`test:pals-fidelity` checks all 186 approved runtime variants (184 original states
plus two Brio neutrals), exact character/form/expression paths, alpha pixels and
actual rendered corners on navy/green backgrounds. Intentional feet, ground and
props may reach lower edges; they are preserved. Mask unit tests protect enclosed
white details, RGB, partial alpha, exact-file holes and bounded preparation.
Four-size application and offline captures cover no-Pal and equipped profiles.
The existing Pal/reward/creation suites retain ownership, eligibility, growth,
expressions, rewards, save/Keep and scene integration assertions.

Final pass/failure disposition and source-bound artifact links are recorded in
PR188 after hosted verification. Before/after screenshots and the variant audit
sheets accompany this record. Corrected physical Android/other-device acceptance
and owner approval remain pending. No merge, deployment, paid generation or
collection-data migration is part of this correction.
