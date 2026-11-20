# First creation, small hints, and a useful return

**Decision:** [First-creation journey](../decisions/2026-11-19-first-creation-journey.md), accepted for development on November 19, 2026 (America/New_York). This contract describes source behavior and acceptance requirements. [Delivery state](../../DELIVERY-STATE.md) records publication, verification, merge and deployment separately.

## Experience

The initial invitation is to make something of the child's own. The intended creative cycle is **imagine → try → change → choose → return**. Finishing a welcome screen or dismissing a hint does not establish that this cycle was completed, and it earns no reward or learning credit.

An eligible first visit presents a simple welcome with **Make my first game** as the main action and a quieter **Explore first** route. Both use existing destinations. The regular navigation and library become available through either choice; the existing primary destinations are retained, with My Pals added by the companion extension. Existing meaningful creation, per-player preferences, and intentional direct entrances are respected. Legacy routes retain their existing behavior.

Saved scenes and private drawings also identify a returning creator. Studio reads the existing drawing library for the active owner without creating a game, scene, reward or guidance preference. It caches only that owner's presence result and refreshes it after art changes. A pending, timed-out or unreadable art store keeps the ordinary home available; a late result cannot replace a different page or an action the child is already using. That deferral lasts through passive refreshes on the same home visit; an explicit return Home can use the cached eligibility. A fresh sibling's eligibility is checked independently.

The ordinary library's first-phone-viewport playable-choice requirement applies after **Explore first**, rather than requiring the whole library alongside the introductory invitation. Parent/profile controls remain available. The introduction is optional; it does not require avatar selection, an assessment, a completed build, or a compulsory tutorial before play.

| Moment | Guidance and action | Ownership boundary |
| --- | --- | --- |
| First idea | One short prompt near the composer; Send and Build retain their separate actions. | Opening the composer and saving an idea do not queue a build. |
| Actual acknowledged build | Offer existing ready-made play or the build-wait arcade; show grounded status. | A pending request is distinct from an accepted job. No fictitious progress or ETA. |
| Ready result | A direct explicit action opens the saved ready result, including the first result with no existing main game. | Background completion never starts play, changes the chosen version, or seizes focus. |
| First play and change | Small optional tips point to existing play, ideas and change controls. | A hint does not select an experiment or invent an outcome. |
| Trying a version | Explain that the child chooses whether to make it the main game. | Existing preview readiness, base-version checks and explicit Keep still apply. |
| Done for now | Save the pending work through the existing navigation lifecycle, then return home. | A failed write leaves the draft visible and blocks a false saved/finished message. |
| Return | Show an appropriate existing creation and a clear continuation action. | Resolve the recommendation again on activation under the current owner. |

## Small, optional guidance

[The guide card](../../src/studio/guide-card.ts) is an inline, nonmodal explanation with a title, a short description, **Got it**, and optionally an existing next action. It does not cover the game or require completion. Passive rendering never pulls focus from elsewhere; replacing an already focused card preserves focus on the corresponding Action or Dismiss control. Explicit dismissal may return focus to a useful visible control. A failed preference write keeps the card available and reports the error.

New-idea guidance follows the composer so Send and Build remain the primary task; on phones, the introductory hero retains its art and headline in a compact row. In playable views, guidance follows the game stage. Existing build progress and ready actions remain available above it. Practice choices appear before the shelf's optional guide.

**Use my picture** is a visible action inside the new-idea composer. The same control belongs in the game toolbar for an existing playable game; hiding that toolbar for a new idea must not hide the artwork entrance. It opens the existing Art Studio through the same draft-save and learning guards. The saved idea is retained, and selecting this route alone neither attaches private pixels to a model prompt nor submits a generation request. Art and scene tools initialize independently of the online builder configuration.

The bounded tip IDs are `idea`, `waiting`, `ready`, `play`, `improve`, `keep`, `saved`, `scenes`, `practice`, and `progress`. **Journey help** explains the overall sequence and lets a player show tips again. Resetting tips does not reset their creations, rewards, learning, or remembered welcome choice.

Journey help also points to the existing scene-video route: **Create & code → More scene tools → Save a video**. This makes recording discoverable without adding a new recording capability or implying that every generated game has an editable scene equivalent.

Creation Studio uses the same pattern. The permanent source label says a linked scene's changes stay in that scene; **Back to my game** retains its existing meaning. Adding private art keeps that return action alongside the exact-art-version label and **Art Studio** action. Optional scene guidance never implies arbitrary game-to-block conversion. Practice guidance explains watching, trying and checking without supplying a solution or marking an assessment hint as used. After a successful check, the existing authored extension appears beside **Make it my own**. Unresolved scene recovery takes priority over optional tips.

Rewards uses a compact explanation of lifetime gems, the maker journey and My Powers. Dismissing it cannot grant gems, advance a rank, or create a learning observation.

## Return priority

[The deterministic recommendation](../../src/studio/guidance.ts) reads the existing notebook and gives priority to a saved ready result, then an active build, then a recent unfinished experiment, recoverable failed build, or authored idea. It falls back to an existing playable project or the last new-idea workspace. An unrelated ready-made game cannot bury an unfinished creative intention merely by being played later.

Archived, dismissed-resume, and other-player sessions are excluded. A ready job without its matching saved result is not a playable recommendation. Already viewed or kept results must not reappear as a newly ready game. The recommendation has no model call, separate achievement store, or automatic Build/Keep action.

## Persistence and integration

The existing version-1 Studio notebook has an optional bounded `guidance` map keyed by owner. Each entry contains `welcomeDismissed` and a unique list of supported `dismissedTips`. Old notebooks remain valid. The same notebook export, restore, family backup and adult-profile namespace carry these presentation preferences; no new storage authority is introduced.

Preference writes re-read the notebook and respect the existing source-writer guard. They do not update a project's activity time, append design observations, or produce reward facts. Interface callbacks retain owner/view checks so a stale control cannot act for a different player. Required learning and scene-recovery guards remain authoritative.

The implementation reuses the current build shelf, polling, wait arcade, scene adapters, draft saving and revision history. It does not add arbitrary code round trips, cloud synchronization, new learning scores, public sharing, or a new generation route.

The [Art Studio](../drawings/ART_STUDIO.md) is now inherited from merged [PR23](https://github.com/jzwyrzyk/family-game-factory/pull/23). Its My Games, idea-workspace, Create & code and saved-collection entrances remain subdestinations within the existing shell; the companion extension adds My Pals without promoting Art Studio to a separate primary route. The first-creation integration retains its explicit art choices, profile-owned originals, pinned uses and scene recovery while adding optional guidance. A direct `?art=1` entrance still opens the requested tool. Earlier first-creation captures and checks predate this merge; [delivery state](../../DELIVERY-STATE.md) records acceptance of the combined source separately. PR68 integrates the separate Gem Pal runtime with this journey; final character artwork and its form/version bindings remain a separate workstream.

## Verification

[Model and preference tests](../../tests/studio-guidance.test.ts) cover backward compatibility, owner isolation, malformed preferences, failed writes, reward independence and recommendation ordering. [First-creation browser journeys](../../tests/first-creation-journey.cjs) exercise the visible introduction, optional hints, return behavior, ready-result handoff and existing learning/save guards. Existing homepage, build-continuity, Creation, Rewards and navigation suites remain relevant.

The browser journey also holds a real older art-database connection open to check bounded startup, ordinary-home fallback, late completion, retained focus and unchanged notebook state. The [Art Studio journey](../../tests/art-studio-browser.cjs) checks art-only Home and reload behavior plus a fresh sibling; the [private-art scene journey](../../tests/creation-private-art-browser.cjs) checks both source actions, the exact game return and preservation of the original saved game.

[Selected visual captures](previews/README.md) record the welcome, first phone composer and Journey help, with their fixture and source-build context.

Record the tested source and actual results in delivery evidence. Browser fixtures and responsive screenshots do not establish real-provider operation, physical-device reliability, child comprehension, enjoyment, or learning gains.
