# Design baseline and migration inventory

Observed November 25, 2026 (America/New_York). Full source refs and the 192–220 dependency inventory are in [source-baselines.json](source-baselines.json). Protected main: `bc602f1ede502f398308ad56f973c4bf7997ff08`. #188 and #190 are merged. Their explicit owner-directed identity, secondary headers, Journey cards and Pal corrections are the baseline. A merged implementation is not evidence of owner/device acceptance of every rendered state.

Selected Learning: #218 `22e8424ceb1146670aa3b5913aa1f98169a5a4f6`, incorporates #192–195/#203. Selected Creative: #220, initially `e61faded4b15ed9b6cc1eac9a40fd8e8b5bc677f`, advanced during work to `48e9ae9d0f1b2b5d5224ed95fb7bd3bb695b960b`. Phase 2: #219 `d8c8cd31309f98ce0bec39331d2fed93a5f2b231`. All three remain open at the latest recorded API observation; Learning/Creative are drafts with incomplete acceptance. Creative #196–217 include competing alternatives, not independent pieces to combine indiscriminately.

Coordination was posted to [#218](https://github.com/jzwyrzyk/family-game-factory/pull/218#issuecomment-7182979697), [#220](https://github.com/jzwyrzyk/family-game-factory/pull/220#issuecomment-7182980699), and [#219](https://github.com/jzwyrzyk/family-game-factory/pull/219#issuecomment-7182981509). Shared presentation is owned by this branch; feature/domain changes remain with the integration workstreams. Proposed route: authorized #219, then qualified #218, qualified #220, then dependent design-system migration. This is a coordination proposal, not confirmation from another agent or authorization to merge their PRs. Safe foundations are separately reviewable on main. Reverify exact refs before every integration.

## Surface ownership and migration

| Actual surface / states | Archetype and canonical reference | This increment / remaining migration |
| --- | --- | --- |
| Home `studio-library`: empty/populated/continuation | Illustrated destination; #188, Art Studio quality reference | Extracted production destination cards and host-art path resolution. Hero, collections and shell remain feature-owned. |
| My Journey `jems-journey`: starter/equipped/ranks | Collection/progress; #190 Choose your Pal header | Shared collection template, dashboard cards and contextual navigation. Existing progress authority retained. |
| My Pals `jems-pals`: loading/choose/owned/grown/error | Collection plus focused first choice; #190 | Shared header/template and native action construction. Existing masked portraits/eligibility stay authoritative. Dedicated initial selection remains intact. |
| Gems `jems-rewards`: totals/earned/locked/recovery | Collection/progress; #190 | Shared template/actions/cards; rewards and persistence unchanged. |
| Powers `lab`: progress/practice/Math/English | Collection plus learning; #190 and integrated #218 | Shared outer template/navigation/practice destination cards. Integrated learning remains a dependent checkpoint. |
| My Creations `creations`: empty/saved/versioned | Collection/progress; #190 | Shared collection template. Saved-game/version controls remain feature-owned. |
| Notifications `studioNotifications`: empty/pending/ready/error | Collection/progress; #190 | Shared template/action construction. Owner-aware notebook projection, retry/stop and recovery remain feature-owned. |
| My Art `art-studio`: collection/import/drawing/edit/reuse | Illustrated destination + creative workspace; #188 and #220 | Exact semantic color substitutions. Drawing workspace layout, asset cards and original-revision adapter await #220 acceptance. |
| Creative Studio `creation`: introduction/Make/Rebuild/code/play/Keep | Destination + creative workspace; #188, first-learner contract and #220 | Exact semantic color substitutions. Layered world composition and canvas templates await integrated feature qualification. |
| Creation conversation `studio`: draft/sending/ready/building/error | Guided conversation; saved-concept Build #188 | Exact semantic color substitutions. Single input, explicit Send/Build and saved concept remain untouched; template extraction pending. |
| Learning overlays and return to paused activity | Learning; #218 integrated shell is canonical candidate | Reviewed source and rendered evidence; not reconstructed from old main. The combined candidate integrates the qualified light workspace. Assessment, grade ceiling and hints remain feature authority. |
| `game` and Studio native/generated game host | Gameplay host; current pause/fullscreen/learning contracts | Shared global tokens only. Game-world visuals are intentional exceptions; host extraction pending. |
| Parent `parent`, privacy/settings/evidence/profile management | Grown-up shell; existing dashboard | Shared action construction and exact color substitutions. Adult density, access/consent and report components stay intact; template extraction pending. |
| Welcome, character/Pal choice, learning setup | Focused onboarding; #188/#190 | Retained dedicated journey. Do not replace with a collection page. Shared entry template pending. |
| Legacy `home`, `factory`, `builder` | Retained compatibility destinations | Inventory/review only; do not remove until consumers and saved/runtime obligations are proven absent. |
| `problem-solving` and intermediate help/feedback | Learning/practice with existing evidence rules | Inventory/review only. Domain-specific interaction remains feature-owned. |

The existing [review manifest](../../tools/ui-review/coverage.json) enumerates all 16 discovered containers and intermediate states. It remains executable coverage, with the shared gallery added as a review state. Browser fixtures cover representative combinations, not every possible cross-product.

## Decisions, duplicates and intentional exceptions

Accepted identity: Nunito/Inter, navy headings, purple actions, soft surfaces, supplied art, exact child artwork, transparent approved Pal presentation and the owner-directed header pattern. Implemented but not universally owner-reviewed: the selected Learning/Creative candidates and this refactor/gallery. Competing Creative branches remain separate; historical alternative headers, CSS palette blocks and retired Pal authoring paths must not become new standards.

Removed duplication: three initial foundation blocks plus two later brand blocks now share one source; 216 existing exact color declarations use semantic roles; header and dashboard implementations/styles have one canonical owner with compatibility reexports; destination markup/styles moved out of Studio; six collection consumers share a layout; four feature button factories delegate to the shared native action; the existing menu focus loop has one implementation. No original asset or historical saved-game reader was removed.

Intentional specialized implementations: Pal masks and form fallback, selected-maker atlases, earning/loading/recovery controllers, game worlds, child drawing canvases, grade-specific interaction and adult information density. Remaining local colors/layouts are migration debt, not approved permanent exceptions. No unreviewed palette or art is promoted to approved status.

## Qualification checkpoints

1. Independently reviewable foundations: source contracts, typecheck, production build, four-viewport real product regression, shared gallery and actual-consumer propagation; exact-source standalone review.
2. Rehearse against the selected #219/#218/#220 heads in an isolated branch. Record textual conflicts and qualification limits. Never resolve competing domain formats merely for a clean merge.
3. After upstream acceptance, extract the remaining seven archetypes and their actual consumers; consolidate specialist controls without moving their authority. Extend focused coverage only for meaningful risks.
4. Independent review, required hosted checks, owner visual acceptance and applicable device/DEV/TEST gates precede a protected-main merge. Production, paid services, infrastructure and frozen release pins are outside this assignment.

The product still has substantial feature-owned layouts. This first increment does not satisfy the complete assignment definition of done.

The consolidated draft incorporates the six collection consumers at the exact #218 and #220 heads. Drawing, layered worlds, learning, conversation, gameplay, adult reporting and onboarding retain their specialist layouts. Further template extraction remains deferred.
