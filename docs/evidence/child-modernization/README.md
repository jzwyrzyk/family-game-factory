# Child experience modernization — candidate acceptance

This implements the owner's November 25, 2026 comprehensive assignment against protected main `af11650ea35a29bb0ef9f6b0aa6edd7d8ee84a9e`. It is a candidate for visual/interactive acceptance, not a release. The [decision](../../decisions/2026-11-25-child-experience-modernization.md) and canonical feature documents own the behavioral contract.

## Requirement traceability

| Workstream | Implemented behavior | Verification / review entrance |
| --- | --- | --- |
| A — My Games | Preserved illustrated hero with Invent a game; three equal destinations; one existing contextual continuation; four curated games; retained dragon/buckets and owned games in My jems; saved ideas/version library | `test:child-modernization`, `homepage-entry`, `retained-games-browser`, `test:studio-notifications`; review Home, populated/empty scenarios |
| B — Navigation | My Games / Create / Menu / profile; grouped canonical destinations; legacy route controls retained but hidden; existing focus, learning and owner guards | `test:navigation-shell`, `navigation-continuity`, `test:child-modernization`; review menu |
| C — My Journey | Existing selected maker/rank hero; actual gems and Pal state; shared Pals, gems/achievements, powers sections; four ranks behind disclosure; contextual practice | `test:gem-progress`, `test:gem-journey`, `test:rewards`, `test:pals`, their browser suites; review journey/pals/rewards/powers |
| D — Conversation / Build | Build outside form, empty-composer completion from saved intent, unsent correction processed once through coach, updated recap and another explicit Build | `test:guided-creation`, `guided-request-drafts`, first-creation/recovery/continuity tests; review create/coach-confirm/build states |
| E — Creative Studio | Art-inspired landing; Make/Rebuild/experiment; saved scenes; optional owner-scoped real movement intro; preserved editor/interpreter/checking/Keep | `test:creation`, `test:creation-browser`, `test:problem-solving`, browser practice and modernization tests; review coding/introduction/worlds/editor/challenge/reasoning |
| F — My Art | Original composition/art and storage retained; readable labels; contextual game/scene/world-choice return | `test:art-browser`, private-art preservation tests, modernization return check; review art/draw |
| G — Readability | Shared cards, 18px labels, larger task text, distinct Build, focus/reduced-motion and responsive reflow | Four-size screenshots; contrast checks for Build and intro/disclosure; existing editor/learning checks. These checks do not establish every possible dialog state |
| H — Integrity | No new economy, assessment model, paid operation, project store or public artwork. Introduction writes only an existing notebook guidance preference | Owner isolation, rewards/Pal/storage/parent/learning suites; source diff |
| I — Review | Actual app bundled offline, updated inventory and scenarios; exact candidate SHA and complete four-viewport screenshot upload | `review:build`, `review:coverage`, `review:test`, standalone workflow |
| J — Delivery | Doctrine, architecture, decision, feature contracts, documentation registry and this acceptance record | `docs:check`, PR evidence and delivery ledger |

## Navigation map

My Games → Invent a game; My Journey; My Art; Creative Studio; one contextual Continue; four curated games; My jems and Saved ideas & versions.

Menu → Make (Invent a game / Creative Studio / My Art); Your world (My Journey / Notifications); authorized Learning mode; Grown-ups; Help.

My Journey → overview / My Pals / Gems & achievements / My Powers. My Powers retains Math/English and links to rebuild/experiment practice. Creative Studio → optional first visit → Make a scene / Rebuild a scene / Try an experiment → saved scenes. All routes use existing guarded host callbacks.

## Visual evidence and iteration

Before screenshots were captured from the actual baseline's offline bundle. After screenshots come from the updated production bundle and source-matched offline review. The comparison images below are reduced display copies, not replacement UI assets. Complete screenshots for all four viewports are in the standalone workflow's evidence artifact under `child-modernization/` (desktop 1440×1000, landscape 1180×820, portrait 820×1180, phone 390×844). The route list includes all four Journey sections, intro, landing, worlds, editor, rebuild, experiment, Art/draw and menu.

The visual iterations corrected Home ordering, undersized Journey gem controls, inherited pale rank/intro text, disabled Build opacity, cramped Creative Studio icons and remaining Art helper text. Reviewed views retain the original approved illustration files. Automated viewport and touch emulation is not device or child usability acceptance.

## Conversation evidence

The production-browser fixtures send several child turns, confirm an empty composer, then submit the saved concept. The correction fixture types a new thought after readiness, clicks Build twice rapidly, verifies exactly one saved child correction and no job, waits for the updated assessment, and requires another explicit Build. Its resulting job contains the prior action/world/consequences plus the changed mood/mechanic. Existing accepted/unknown submission tests reload and reconcile without a second POST; sibling changes preserve the originating notebook. Fixtures use no real model or paid generation.

## Integration, compatibility and remaining acceptance

No dependency on concurrent PR #186 is introduced. That family-beta/storage candidate overlaps the shared Studio host, notebook and some tests; whichever PR integrates second must reconcile against current main and rerun the affected journeys. It is excluded from this review artifact. Already merged early-grade gates, premium limits, responsive editor and standalone review remain preserved.

The only new durable value is `studio-intro` in existing owner-scoped guidance preferences. Old strict readers do not recognize this tip; rollback must retain the compatible reader rather than restore an older binary against the new notebook. No migration or deletion runs in this change.

No private DEV environment is provisioned by this assignment; repository environment configuration remains disabled. The offline candidate supplies immediate owner review, but is not a deployed DEV/TEST receipt. Live coach/generator, physical iPad/phone/Edge/audio, and owner visual/interactive acceptance remain separate. No merge, production deployment, traffic cutover, family-beta activation or paid call is performed. The PR and CI receipts record final test disposition and exact artifact identity.

## CI reconciliation

The first candidate standalone run [45677701949](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45677701949) passed stock Chromium file navigation and complete screenshot capture on `d1b68df43efe60a9190a3c150914d259bc8bacb8`. The first Arcade preparation run failed its hard-coded command count because the additional modernization test expanded creative coverage from 63 to 64 commands; the count was corrected with all original commands and failure checks retained. The early-preview test initially used the former direct world entrance and was updated to explicitly skip the optional introduction and choose Make a scene. These earlier runs do not validate subsequent refinements; final receipts belong to the PR head. No CI selection or security gate was narrowed.
