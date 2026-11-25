# Pre-K and kindergarten verification

Use Node 22, the repository lockfile and its Chromium installation. Run `npm ci`, `npx playwright install chromium`, then `npm run test:early-preview`. An installed system Chromium can be selected with `CHROMIUM_PATH`. The command builds a separate synthetic distribution under `test-results/early-build`. The hosted job uses a read-only repository token and uploads the viewport PNGs. Ordinary builds use their own offline manifest and cache.

## Scope

| Surface | Observable evidence |
| --- | --- |
| Parent level selector | Six explicit persisted grades, a denied parent request, a delayed save across a profile switch, and an unchanged sibling |
| Play and learning | Tap before instruction delivery, declared adult reading, host scoring, disabled game input and an actual resumed game action |
| Native game matrix | Gem Factory, Mind Your Jems (Gem Mining), Dragon Island Rescue, Splash or Pass, Junkyard Rally, Moon Donut Dash, Robot Route Lab and both the current Bubble Gum Builders assembly workshop and its retained construction game |
| Isolated game | Reviewed star-catching fixture, opaque sandbox, host-owned learning, acknowledged round completion and replay |
| Creation Studio | Add a direction command, inspect the saved project, predict its first movement and check a working program |
| AI creation | Illustrated handoff, local scene creation and restricted creation mutations on the early profile |
| Device speech | A simulated local voice completes and replays the instruction. The decoding stimulus remains silent. A separate no-voice journey requires declared grown-up reading before scoring |
| Viewports | 768 × 1024, 1024 × 768, 1366 × 768, 390 × 844 and 844 × 390 CSS pixels |

Splash or Pass reaches a natural round-end checkpoint. The other native matrix cases send the existing checkpoint event after entering play or performing a game action. The legacy regression suites also exercise elapsed-play and round-end triggers. Generated game checks use a local reviewed fixture. The gateway responses, speech lifecycle and learner profiles are synthetic. No person supplied a voice recording. The device matrix establishes browser rendering and pointer behavior. Educational efficacy, physical-device ergonomics and acoustic quality require their own evidence.

## Captured journeys

| Screenshot | Viewport |
| --- | --- |
| [Pre-K mathematics](tablet-portrait-math.png) | Tablet portrait |
| [Kindergarten literacy](tablet-landscape-language.png) | Tablet landscape |
| [Graphical commands in a scene](desktop-coding.png) | Desktop |
| [Grown-up creation handoff](phone-handoff.png) | Narrow phone |
| [Coding workspace](short-landscape-coding.png) | Short landscape |
| [Game before the checkpoint](game-before.png) and [game after the answer](game-after.png) | Tablet portrait |

## Release conditions

1. The layout repair #175 has merged at 912fd31. Obtain product-owner review and required branch checks for #176, #177, #178, #179 and #183 in order. Recheck the diff and regression evidence on each new base.
2. Review the local illustrated assets and the early curriculum with the product owner and a qualified early-learning reviewer. Confirm the spoken directions, listening items and independent reading evidence on target device voices.
3. Reconcile the separate beta audit #180 and rehearsal #181, then integrate the family beta #170–174 entitlement shell and verified family learner identity. Keep parent-guided paid creation disabled until a server-bound child workflow enforces consent, provider approval and budgets. Preserve the independent Adult Private budget and data boundary.
4. Use authorized adults and synthetic profiles on representative physical hardware in approved DEV/TEST. Real child participation and production release require separate permission and release evidence.

The unchanged study and release requirements also apply to visual assessments, privacy retention, profile migration and recovery. No release authorization is implied by this branch.
