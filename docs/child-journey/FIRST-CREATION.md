# First creation, small hints, and a useful return

**Decisions:** [First-creation journey](../decisions/2026-11-19-first-creation-journey.md), accepted November 19; [character-first navigation](../decisions/2026-11-20-character-first-navigation.md), accepted November 20; and [guided conversation and Build handoff](../decisions/2026-11-20-guided-chat-creation.md), requested November 20 and clarified November 21, 2026 (America/New_York). The owner rejected provisional suggested-answer buttons and delegation: the conversation coach must guide the child to their own answers, and a new game requires enough coherent child-provided detail. This contract describes the corrected requirements; [delivery state](../../DELIVERY-STATE.md) separates source verification, publication, merge and deployment.

## Experience

The initial invitation is to make something of the child's own. The intended creative cycle is **imagine → try → change → choose → return**. Finishing a welcome screen or dismissing a hint does not establish that this cycle was completed, and it earns no reward or learning credit.

An eligible first visit presents **Choose your character**, with large cards for the approved human makers **Spark** and **Nova**, followed by one **Let’s create** action. Continue is enabled only after a choice is durably saved for the current player. Choosing a character does not create a project, build, dismiss the welcome or grant progress. Continue opens the existing idea composer; a failed choice or continuation save reports a retryable error. There is no Explore-first or jump-into-a-game invitation. Existing meaningful creation, per-player welcome preferences, and intentional direct entrances are respected. Legacy routes retain their existing behavior.

Saved scenes and private drawings also identify a returning creator. Studio reads the existing drawing library for the active owner without creating a game, scene, reward or guidance preference. It caches only that owner's presence result and refreshes it after art changes. A pending, timed-out or unreadable art store keeps the ordinary home available; a late result cannot replace a different page or an action the child is already using. That deferral lasts through passive refreshes on the same home visit; an explicit return Home can use the cached eligibility. A fresh sibling's eligibility is checked independently.

The ordinary library’s first-phone-viewport playable-choice requirement applies when the library is opened, rather than requiring the whole library alongside character selection. Parent/profile controls remain available; **Menu → Grown-ups → Private parent session** is present from the first screen. After selecting a character, an explicit logo/Home action may open the library without making an empty project. The normal first continuation is creation. Returning creators and direct tool entrances are not forced through a new tutorial. No assessment or completed build is required.

The ordinary shell exposes **My Games**, **Create** and **Menu**. Secondary creation, learning, progress, Pals, parent and help destinations retain their existing handlers inside the menu. Character changes in My journey propagate to all host human-maker imagery for that owner. Neutral gems stand in before selection; unrelated Gem Pal and game artwork is not changed.

| Moment | Guidance and action | Ownership boundary |
| --- | --- | --- |
| First idea | A conversation coach, one input and useful action buttons. A relevant open question helps the child develop their own idea; extra tools are expandable. | No supplied-answer chips or delegation shortcut. Opening the composer, conversing and saving ideas do not queue a build. |
| Idea not ready | Continue the actual conversation about the next material uncertainty. | A partial brief, model proposal or legacy plan flag cannot authorize creation. Do not manufacture readiness or a build from missing child input. |
| Ready idea and explicit Build | Open a focused handoff immediately when submission begins and show truthful sending. | Current evidence of coherent child intent and the child's explicit Build are both required. A tap is not evidence of backend acceptance. |
| Actual acknowledged build | Update the handoff and offer **Play while I wait** or **Stay here**; retain existing ready-made play and the build-wait arcade. | The child chooses whether to play. No fictitious progress or ETA, and no automatic retry after an unknown outcome. |
| Ready result | A direct explicit action opens the saved ready result, including the first result with no existing main game. | Background completion never starts play, changes the chosen version, or seizes focus. |
| First play and change | Small optional tips point to existing play, ideas and change controls. | A hint does not select an experiment or invent an outcome. |
| Trying a version | Explain that the child chooses whether to make it the main game. | Existing preview readiness, base-version checks and explicit Keep still apply. |
| Done for now | Save the pending work through the existing navigation lifecycle, then return home. | A failed write leaves the draft visible and blocks a false saved/finished message. |
| Return | Show an appropriate existing creation and a clear continuation action. | Resolve the recommendation again on activation under the current owner. |

## Guided creation in the conversation

The ordinary new-game view contains the conversation coach, the composer and action buttons. The coach follows the child's topic and existing answers, responds naturally, and asks at most one useful open question when more understanding is needed. Questions may explore what the player does, what follows from that action, the desired experience, or a particular rule the idea depends on; their order and necessity come from this conversation. Do not substitute a fixed questionnaire. The child supplies their answer by typing or reviewed dictation.

There are no suggested-answer chips, menus of supplied feelings or styles, **You choose**, or **Choose the rest** controls in first creation. A request for help receives scaffolding, explanation or clearly attributed inspiration that helps the child form their own intention. It does not let the helper fill the game plan and call it the child's design. No-loss, no-score and open-ended play remain valid; do not impose conventional scoring or difficulty rules on an idea that does not need them.

Before a first build, the coach must have enough coherent child-provided detail to make a reasonable game. Its current readiness assessment is grounded in exact child evidence about action, visible consequence or purpose, intended experience and world or theme, with no unresolved material gap or contradiction. The host checks the evidence and context binding; a missing, stale or unsupported verdict keeps creation blocked. Readiness is not an eight-field completion score, a turn count, a word count or a keyword threshold. A complete idea may need little further discussion, while a vague one may need more.

The detailed plan, experiment settings and extra support remain behind an optional disclosure. They do not open automatically and cannot approve creation independently of the conversation. Helper-authored fields, old delegation flags, `approvedPlan`, an optional plan button or a proposed experiment cannot bypass the new-game readiness gate. Revised or unsent material intent must be understood before submission. A concise conversational confirmation can precede the explicit Build once the idea is ready; reaching readiness never builds, consumes generation allowance or selects a main version by itself.

The builder receives the coherent original idea, current child decisions, later authored game statements and required internal context. A sent correction can revise an earlier choice without being treated as the answer to an unrelated question. A late reply must not overwrite a newer saved edit. Keep the request separate from the child's display text and editable draft, and clear only the text consumed by that submission. Do not insert a compiled plan, internal labels, raw job output or a repeated progress transcript into the conversation. Preserve recoverable request/version data and notebook compatibility. A limited local helper must identify itself honestly and cannot supply a contextual readiness verdict on behalf of a connected coach.

## Build handoff and recovery

The handoff belongs to a readiness-authorized explicit Build that actually begins submission. An incomplete idea remains with the conversation coach instead of entering a fake build state. Once submitted, initial focus and a short announcement make the result of the tap clear on a phone or keyboard. The dialog may update while open; closing it ends that modal interaction for the request. It is not a second job store and has no independent authority to submit, retry, keep a result or award progress.

| Observed state | Child-facing behavior | Recovery and focus rule |
| --- | --- | --- |
| Request being submitted | Acknowledge the action immediately with a short sending state. | Do not say the game is building yet or allow duplicate submission. |
| Accepted queued/building/testing job | Show short grounded progress and the optional play invitation. | **Stay here** dismisses the handoff; **Play while I wait** deliberately opens the existing wait activity. |
| Rejected or unavailable request | Explain that building did not start or finish, with the appropriate next action. | Preserve the idea, current game and visible unsaved work. |
| Connection status unknown | Say the connection was interrupted and the build may still be working. | An acknowledged job can resume polling; a lost acknowledgement may leave no pollable job ID. Preserve the existing request identity and never replay the paid POST automatically. |
| Saved ready result | Offer an explicit action to try the result, including a first game without a main version. | Update an already open handoff; never reopen it or seize focus during another activity. |
| Cancelled or failed job | Show concise recovery while preserving the last working version. | Closing presentation does not cancel a job; cancellation retains its existing explicit authority. |

Required learning, unsaved-work and recovery guards retain priority. Changing profile, leaving the project or opening a different route invalidates the handoff's callbacks. A late completion cannot show one child's request to another. Reload resumes the existing saved-job/return path rather than replaying the original Build popup or submission.

## Small, optional guidance

[The guide card](../../src/studio/guide-card.ts) is an inline, nonmodal explanation with a title, a short description, **Got it**, and optionally an existing next action. It does not cover the game or require completion. Passive rendering never pulls focus from elsewhere; replacing an already focused card preserves focus on the corresponding Action or Dismiss control. Explicit dismissal may return focus to a useful visible control. A failed preference write keeps the card available and reports the error.

For a new idea, the conversation itself supplies the primary guidance; do not surround the current question with a second introduction, redundant tip card or always-open controls. Optional help remains available through its disclosure and Journey help. In playable views, guidance follows the game stage. Existing build progress and ready actions remain available after the focused handoff is dismissed. Practice choices appear before the shelf's optional guide.

**Use my picture** remains available under **More choices** in the new-idea workspace, following the owner's minimalist-creation refinement. The same control remains in the game toolbar for an existing playable game; hiding that toolbar for a new idea must not remove the artwork entrance. It opens the existing Art Studio through the same draft-save and learning guards. The saved idea is retained, and selecting this route alone neither attaches private pixels to a model prompt nor submits a generation request. Art and scene tools initialize independently of the online builder configuration. This supersedes the former always-visible composer placement without changing the art capability or privacy boundary.

The bounded tip IDs are `idea`, `waiting`, `ready`, `play`, `improve`, `keep`, `saved`, `scenes`, `practice`, and `progress`. **Menu → Help → Journey help** explains character choice, idea, explicit Build, play while waiting, revision and Keep, and lets a player show tips again. Resetting tips does not reset their creations, rewards, learning, or remembered welcome choice.

Journey help also points to the existing scene-video route: **Create & code → More scene tools → Save a video**. This makes recording discoverable without adding a new recording capability or implying that every generated game has an editable scene equivalent.

Creation Studio uses the same pattern. The permanent source label says a linked scene's changes stay in that scene; **Back to my game** retains its existing meaning. Adding private art keeps that return action alongside the exact-art-version label and **Art Studio** action. Optional scene guidance never implies arbitrary game-to-block conversion. Practice guidance explains watching, trying and checking without supplying a solution or marking an assessment hint as used. After a successful check, the existing authored extension appears beside **Make it my own**. Unresolved scene recovery takes priority over optional tips.

Rewards uses a compact explanation of lifetime gems, the maker journey and My Powers. Dismissing it cannot grant gems, advance a rank, or create a learning observation.

## Return priority

[The deterministic recommendation](../../src/studio/guidance.ts) reads the existing notebook and gives priority to a saved ready result, then an active build, then a recent unfinished experiment, recoverable failed build, or authored idea. It falls back to an existing playable project or the last new-idea workspace. An unrelated ready-made game cannot bury an unfinished creative intention merely by being played later.

Archived, dismissed-resume, and other-player sessions are excluded. A ready job without its matching saved result is not a playable recommendation. Already viewed or kept results must not reappear as a newly ready game. The recommendation has no model call, separate achievement store, or automatic Build/Keep action.

## Persistence and integration

The existing version-1 Studio notebook has an optional bounded `guidance` map keyed by owner. Each entry contains `welcomeDismissed` and a unique list of supported `dismissedTips`. Old notebooks remain valid. The same notebook export, restore, family backup and adult-profile namespace carry these presentation preferences; no new storage authority is introduced.

Preference writes re-read the notebook and respect the existing source-writer guard. They do not update a project's activity time, append design observations, or produce reward facts. Interface callbacks retain owner/view checks so a stale control cannot act for a different player. Required learning and scene-recovery guards remain authoritative.

The implementation reuses the current conversation endpoint, build shelf, polling, wait arcade, scene adapters, draft saving and revision history. Contextual readiness extends the coach response and saves a review bound to current authored context; it is distinct from older plan approval. The gateway validator, private coach and web app require coordinated rollout, with compatible backend revisions verified before the new web app. An old gateway or private executor rejects the new creation context; an older response without readiness fails closed for a new game. Existing acknowledged jobs and saved games retain recovery and play in the updated app. This change adds no extra automatic inference call, provider switch, arbitrary code round trip, cloud synchronization, learning score, public sharing or generation route.

The updated reader accepts older notebooks, but the pre-change reader rejects the new saved readiness field. A frontend rollback must retain a compatible reader or use a separately tested no-loss migration; never erase a notebook to make a previous bundle open. [Architecture](../../ARCHITECTURE-CURRENT.md#conversation-led-creation-readiness-and-build-handoff) records the service packaging, protocol and unchanged-worker boundaries. Passing a local browser fixture is not a production rollout receipt.

The [Art Studio](../drawings/ART_STUDIO.md) is now inherited from merged [PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23). Its My Games, idea-workspace, Create & code and saved-collection entrances remain subdestinations within the existing shell; the companion extension adds My Pals without promoting Art Studio to a separate primary route. The first-creation integration retains its explicit art choices, profile-owned originals, pinned uses and scene recovery while adding optional guidance. A direct `?art=1` entrance still opens the requested tool. Earlier first-creation captures and checks predate this merge; [delivery state](../../DELIVERY-STATE.md) records acceptance of the combined source separately. PR68 integrates the separate Gem Pal runtime with this journey; final character artwork and its form/version bindings remain a separate workstream.

## Verification

[Model and preference tests](../../tests/studio-guidance.test.ts) cover backward compatibility, owner isolation, malformed preferences, failed writes, reward independence and recommendation ordering. [First-creation browser journeys](../../tests/first-creation-journey.cjs) exercise the visible introduction, optional hints, return behavior, ready-result handoff and existing learning/save guards. Existing homepage, build-continuity, Creation, Rewards and navigation suites remain relevant.

The browser journey also holds a real older art-database connection open to check bounded startup, ordinary-home fallback, late completion, retained focus and unchanged notebook state. The [Art Studio journey](../../tests/art-studio-browser.cjs) checks art-only Home and reload behavior plus a fresh sibling; the [private-art scene journey](../../tests/creation-private-art-browser.cjs) checks both source actions, the exact game return and preservation of the original saved game.

[Selected visual captures](previews/README.md) record the welcome, first phone composer and Journey help, with their fixture and source-build context.

Corrected-conversation acceptance checks contextual follow-ups, reuse of the child's own answers, free text and reviewed dictation, no suggested-answer chips or delegation escape, and current evidence-backed readiness. Test all first-build entrances against absent/stale readiness and legacy helper/delegated/approved-plan shortcuts. Check corrections, rejected turns, exact child provenance, unsent drafts, owner changes and reloads, then compare the visible transcript with the actual coherent build request.

After readiness and explicit Build, retain pending/accepted/unknown-state checks, dismissal before background completion, stale callbacks, failed saves, advanced/art entrances and an explicit first-ready play action. Inspect the narrow-screen composer and handoff, keyboard focus and reduced motion. Captures and tests from the provisional chip/delegation implementation do not establish acceptance of this corrected experience.

Record the tested source and actual results in delivery evidence. Browser fixtures and responsive screenshots do not establish real-provider operation, physical-device reliability, child comprehension, enjoyment, or learning gains.
