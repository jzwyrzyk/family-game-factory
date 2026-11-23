# One game journey and one place for pending work

**Placement follow-up:** The [November 23 retained-games decision](2026-11-23-retained-games-in-my-creations.md) supersedes only this record's two Original cards on Home: those existing cards move to My Creations. The original decision and evidence below remain historical; game IDs, saved variants and the four Ready to Play games are retained.

**Decision:** owner request, November 22, 2026 (America/New_York). Implement in the existing [PR125](https://github.com/jzwyrzyk/family-game-factory/pull/125), following the shell/chat repairs and Conversation Coach rollout. This is source preparation, not merge, deployment or paid narration authorization.

## Why

The owner supplied a Home capture with duplicate failed projects in a dark **My builds & tests** bar above the white continuation card. They asked to remove that bar, use the one lower card for important results and unfinished experiences, and make a Notifications page discoverable from the card and menu with an alert count. They also asked to reconcile the unified-game-experience PR into this same review and retain the agreed release sequence.

## Accepted behavior

Home has at most one white continuation/review card. A ready result takes priority, followed by uncertain or failed builds, active work, unfinished tests and ideas, then ordinary recent play. Notifications contains all current owned pending/review items, one per project. The card, main Menu and game More link to that page. Badges count unseen ready, failed and uncertain transitions; draft saves and ordinary polling do not make repeated alerts. Opening the page acknowledges its current unread items without completing or deleting the work. Dismissing the Home reminder hides only that version of the suggestion; a new job/result can surface again.

Every action rechecks the active owner, saved project and current notification identity. Required learning and failed saves retain their existing navigation guards. Reading, navigation, acknowledgement and dismissal cannot Build, retry, Keep or silently select a candidate. A background result updates the card and badges without taking focus or opening a game. Current-project **Try your ready test** remains available in More, including its existing protection against late preview responses replacing newer typing. Notifications is an ordinary guarded page departure; it does not promise universal mid-round restoration after leaving a game.

The same speaker control reads each notification and saved helper reply. Starting private dictation cancels every reader both before microphone permission and immediately before recording, after checking that the original owner/scope is still current. Reading cannot restart while either local or private dictation is active. A stale permission result cannot cancel a new profile's narration.

The actual motion review also found a global maker-reward toast covering Mining’s Bank label. Fitted play therefore uses the existing conversation rule for cosmetic celebrations: earned totals and receipts remain durable, while prior and delayed popups are suppressed during the game. My rewards still shows those grants; they do not replay on exit. Keeping the shared controls readable takes priority over a temporary cosmetic overlay on a game whose free space varies by screen and runtime.

## Unified navigation boundary

The comparison source is PR129 head `d7ba7a828278a90f324bc12e1ba2592265f48095`, stacked on PR125 head `1340d041145ffba4322ccb8262188b7cf2c7b6c4`. That PR also contains the Mining gameplay work from PR128. This consolidation adopts the catalogue and shared-player navigation intent, with a standalone **Mind Your Jems!** tile and the same native host for **Play while I wait**. It refactors the existing PR125 tap/crystal/bank/grab game into a reusable mount. It does not adopt the later movement/contact/level rewrite, one-Jem crystals or ten-pocket economy from PR128, or its gameplay art/baselines.

Ready to Play contains Gem Factory, Mind Your Jems!, Bubble Gum Builders and Junkyard Rally. Dragon Island Rescue and Splash or Pass remain under Original jems. Moon and Robot are removed from the default catalogue; their readers, runtime implementations, authored saved work and tests remain supported. The original requested build remains a separate saved project from a Mining round.

## Persistence and integration

Notification content is derived from the existing notebook, not a second feed or job store. Only bounded, owner-scoped acknowledgement/dismissal tokens are added as optional notebook metadata; these writes do not update a project's recency, draft, evidence, selected test, rewards or job identity. Existing backup/restore includes the metadata and retains its exact-byte rollback behavior. See [the feature contract](../homepage/NOTIFICATIONS.md).

Compatibility is directional: earlier strict readers reject the new `mining` game ID and, after acknowledgement, the optional `notifications` notebook field. Releases and rollback must retain compatible readers in every consumer, including services that validate stored work. No lossy field stripping or data deletion is an acceptable rollback. Preserve the upstream shell/storage-removal changes and Conversation Coach's expanded-history, pending-submission, owner/version and stale-response guards when reconciling this PR after those changes; do not replace their Studio or notebook files wholesale.

The order is shell/chat fixes and storage removal; Conversation Coach; this consolidated UI/navigation/Notifications PR; then the Factory, Mining and Bubble Gum gameplay overhauls. PR129 and PR130 carry later gameplay dependencies, so absorbing navigation here does not authorize merging or deleting those branches. PostHog, access-policy changes, provider activation and infrastructure changes remain outside this batch.

## Evidence

Build/typecheck and pure/model tests are separate from browser acceptance. The current executor rejects Chromium's socket before page load. New production-dist Notifications, existing continuity/voice tests, the eight-runtime viewport matrix and the actual Mining host run in hosted CI. Review the resulting desktop/phone/landscape captures before claiming visual acceptance. Keep the legacy Mining baselines unchanged and establish separately reviewed native-host references at the existing pixel tolerances. Exact-head results belong in PR125 and delivery state; historical PR125 or PR129 passes do not establish this changed source.
