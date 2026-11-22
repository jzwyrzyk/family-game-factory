# Notifications and the Home continuation card

The [November 22 decision](../decisions/2026-11-22-unified-game-notifications.md) replaces the dark build shelf with one white Home card and an owner-scoped Notifications page. It extends the existing [homepage](README.md), [play view](PLAY_VIEW.md) and [child continuity](../child-continuity/README.md) contracts.

## What a child sees

- Home offers one useful next step. Ready results come first, then connection checks, failed builds, active work, unfinished tests/ideas and recent play. Dismissed notification versions do not reappear through the recent-play fallback.
- **Notifications** is linked from the same card, main **Menu**, and the game's **More** menu. Menu and entries carry the same numeric badge. Zero is hidden. Accessible labels include new and in-progress counts without exposing child text in a global announcement.
- The page has a visible **My Games** exit, a focused heading on entry, readable white cards, 48px actions and speaker controls. It lists every current item, rather than the former four-row cap. A sibling's projects never appear.
- An unseen ready result, failed build or uncertain request adds one alert. Repeated polling, queued/building/testing transitions and ordinary draft saves do not create new unread alerts or reorder same-priority rows. Work can remain pending after its alert has been read.
- Opening Notifications marks the currently unread items as seen. It keeps unresolved work visible. Dismissing a Home reminder neither deletes the project nor cancels a build; a new result/job/state can surface a new reminder.
- A ready action opens its exact saved result. Failed/uncertain actions open the saved composer and existing recovery choices. Active builds retain explicit **Play while I wait** and **Stop build**. These are choices, not automatic side effects of reading the page.

Background completion changes the card/badges without reopening a handoff, navigating, choosing a favorite, stealing typing focus or interrupting learning. The existing current-project ready button remains in More so its asynchronous preview request can leave the current game playable until an accepted response; a newer edit still wins over a late response. Navigating to the separate Notifications page follows the existing disposal contract. Returning to an action game may begin a new round; no universal frame checkpoint is added.

## Source and data ownership

[`notifications.ts`](../../src/studio/notifications.ts) is a pure projection of saved Studio sessions plus observed uncertain/sending context. It emits one current item per owned, non-archived project and ignores empty starter visits/ordinary play. A saved ready result takes precedence over stale connection observations. Selected or previously kept results cannot resurrect as new ready alerts.

[`notifications-view.ts`](../../src/studio/notifications-view.ts) renders the page, card and badges without storage or network authority. Unchanged projections retain DOM, keyboard focus and in-progress read-aloud, including gesture-required **Play reading**. Genuine state changes replace stale readers. [`ui.ts`](../../src/studio/ui.ts) re-resolves owner, session and token before any action, then uses the existing save, learning, preview, cancellation and project-opening handlers. Profile changes dispose readers and clear prior-child DOM.

The optional notebook root `notifications[owner].acknowledgements` holds at most 80 `{sessionId, token, dismissed}` records per owner, with one latest token per project. Tokens are inert presentation fingerprints, not credentials. They omit project text, URLs, polling timestamps and build phases. Metadata writes reread the latest notebook, honor the existing writer/backup guard and do not alter project `updated`, authored text, rewards, job recovery or evidence. Failed writes preserve the original bytes. Family backup validates owner membership and restores metadata through the existing transaction.

A saved pending experiment without a job ID remains uncertain after reload. In the older schema used by this branch, a new lost initial acknowledgement alongside an older known job lacks a durable new request identity; in-memory uncertainty cannot prove recovery after reload. Opening Notifications never invents acceptance or automatically replays that request. Preserve the later Conversation Coach's durable identity/recovery work during integration.

Earlier strict notebook readers reject the optional metadata once written; older game readers reject `mining`. Keep compatible readers in a forward repair or separately tested no-loss rollback. Do not delete child records to make an old bundle load. New readers accept old notebooks without adding preferences merely by reading them.

## Verification

Run `npm run build`, then `npm run test:studio-notifications`. Pure tests cover ownership, one-row projection, every state, stable order/tokens, seen/dismissed behavior, stale identities, absence of side effects, save failure and backup. The production-dist browser fixture checks desktop and 320px Home/page/menu/play entry, the absence of the blue shelf, more than four projects, same-owner actions, saved conversation readers, natural/device playback cancellation, failed-save navigation, background completion, reload and sibling isolation. Transport and narration are explicit fixtures; there is no paid call or live voice audition.

The existing child journey, build continuity, private speech, saved-game compatibility, navigation and fitted-game suites remain required. Actual hosted captures must be inspected for layout and hierarchy, in addition to numeric geometry/contrast assertions. Current exact-source results are recorded in [PR125](https://github.com/jzwyrzyk/family-game-factory/pull/125).
