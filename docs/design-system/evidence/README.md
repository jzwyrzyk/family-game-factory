# Foundation increment: source-bound evidence

This evidence qualifies the first independently reviewable increment in [PR #221](https://github.com/jzwyrzyk/family-game-factory/pull/221), not completion of the comprehensive design-system assignment.

## Exact sources and review download

- Before: protected main `bc602f1ede502f398308ad56f973c4bf7997ff08` (merged #188/#190).
- After / production and gallery source: `bdaf7170492593aa5c94c2699e5817483c25b04e`.
- [Interactive standalone HTML download](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45759863217/artifacts/15089306609). Extract and open `jems-ui-review.html`, then choose **Design system** under Page or journey state. Artifact identity: SHA-256 `265092858a34bedea9454d800984430a40ea1cd2826d08389eb3fdac8fea6b16`; retention expires December 10, 2026. Download availability is separate from passing hosted tests.
- [Exact-source hosted standalone workflow](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45759863217). Hosted checks and independent review were still in progress when this receipt was written. Consult the run and PR for the current outcome.

The later documentation/evidence commit does not change the application or review source. The artifact deliberately labels its represented full SHA; it is not relabelled as another commit.

## Actual product comparisons

`tests/child-modernization.cjs` captured 15 real states at each of desktop 1440×1000, landscape 1180×820, portrait 820×1180 and phone 390×844. Both before and after runs passed route, saving/reopen, preserved notebook, explicit Build, original Art, menu, profile isolation, overflow and no-unexpected-POST assertions.

**55 of 60 complete screenshots are byte-decoded pixel-identical.** The [comparison inventory](visual-comparison.json) records image dimensions and differences. Four Powers captures choose different synthetic Math questions and render different authored models/line lengths; direct inspection confirmed unchanged outer header, navigation and cards. One Home capture differs in its animated artwork area (0.0739% of pixels above an 8-channel-value threshold). Those five are not claimed to be pixel matches. No universal pixel-equivalence or device-acceptance claim follows from this sample.

| Surface | Before | After |
| --- | --- | --- |
| Home desktop | [Before](before-desktop-home.png) | [After](after-desktop-home.png) |
| Home phone | [Before](before-phone-home.png) | [After](after-phone-home.png) |
| Journey desktop | [Before](before-desktop-journey.png) | [After](after-desktop-journey.png) |
| Journey phone | [Before](before-phone-journey.png) | [After](after-phone-journey.png) |

## Local functional and accessibility results

| Check | Result and scope |
| --- | --- |
| Production TypeScript and Vite build | Passed on after-source. Existing bundle-size notice remains. No new runtime dependencies. |
| Design source contracts and their negative cases | Passed: 19 shared/gallery source files, 118 token names, six collection consumers; 4 tests. This is scoped enforcement, not a universal CSS/duplicate parser. |
| Navigation shell | Desktop/tablet/390px/320px, keyboard drawer, menu return, preserved draft and failed-save recovery passed. |
| Pals component suite | All 8 groups passed: approved roster/form sources, load/decode retirement, focus, callbacks, profile isolation, failure recovery, 320px/390px and zoom. Original source artwork and transparency algorithms were not changed. |
| Rewards UI | Layout, earning routes, base-path art, keyboard actions, owner-safe loading, reduced motion and nonblocking celebration passed. |
| Notifications | Desktop and small-phone lists, badges, recovery, failed-save guard, stale cancel, foreign-workshop denial, audio and ready-Play continuity passed. |
| Standalone application | All 16 real page containers, four viewport sizes, simulated build/play/learning, real coding/scene engine, local synthetic PNG retention, simulated guardian invitation and every embedded image decoder passed. No overflow, runtime error or external HTTP request. |
| Shared gallery | Four sizes, composed text contrast, 48px primary / 44px secondary targets, real keyboard traversal, modal focus containment/return and last-action hit testing passed. |
| Propagation demonstration | Changed one heading token in memory and verified actual Journey, Pals, Gems, Powers, My Creations and Notifications headers changed together, all using the collection template. |
| Documentation | Registered references and scoped review records passed with no errors/reminders. |

All browser evidence above uses synthetic/local data. Managed standalone testing uses the explicitly labelled in-memory loopback transport; actual file opening belongs to the hosted workflow. Audio quality, observed children, physical devices, hosted private DEV/TEST and owner acceptance remain open. Browser tests of domain guards are not a new comprehensive security audit; authentication, storage, providers, sandbox and reward/assessment authority are unchanged.

## Integrated rehearsal

Local-only rehearsal branch `rehearsal/jems-design-system` combines:

1. #219 `d8c8cd31309f98ce0bec39331d2fed93a5f2b231`.
2. #218 `22e8424ceb1146670aa3b5913aa1f98169a5a4f6`.
3. #220 `48e9ae9d0f1b2b5d5224ed95fb7bd3bb695b960b`.
4. Presentation implementation through `6ccc64c` (later `bdaf717` changes gallery tests/presentation and documentation only).

Result: commit `37edc9f58e2a12f96e35d455be8803fd02b6b5dd`, tree `c33f55969d018e6196b4036910da25ac26825874`. This is **not** the PR source, a protected-main merge or a release candidate. The worktree remains available locally for the integration owner.

Conflicts were reconciled by retaining Learning's modal and tap-focus protection, Creative's layered-world dialog and gesture/cleanup behavior, both review entry points, the expanded viewport list and Phase 2 source labels. Combined npm test leaves preserve original baseline invocations and run added files separately; no original test was removed or replayed to conceal a failure. Documentation reconciliation in this rehearsal is provisional and needs the integration owner's review.

Passed locally: combined production build; all 122 Phase 2 CI contracts; 34 Math workspace cases; 14 English cases; Creation learning interruption/return at 844×390 and 1024×768; illustrated-world browser journeys at 1440×960, 820×1180 and 390×844. This is targeted compatibility evidence, not full combined release qualification, original-art security acceptance or owner sign-off. Integration findings were sent to #218/#219/#220.

## Efficiency and remaining work

The live collection specimen uses the production template and cards with no page-specific stylesheet. Six existing pages receive header changes through one implementation. Five foundation blocks are consolidated and 216 exact existing color declarations use semantic roles. New focused checks reuse the existing standalone workflow instead of creating another full capture pipeline. No developer-hours or hosted CI speedup was measured.

Only the collection archetype is extracted. The other seven archetypes, broader inputs/feedback/specialist-control consolidation, full existing-page migration, feature-owner acceptance, independent review, hosted exact-source checks and applicable owner/device/DEV/TEST gates remain open. No feature PR was merged, no production deployment occurred, and frozen release pins remain unchanged.
