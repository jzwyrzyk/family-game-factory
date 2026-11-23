# Retained games in My Creations

**Status:** accepted owner direction, November 23, 2026; source implementation and production acceptance are separate. The owner requested the four Ready to Play games remain and the existing Splash or Pass/Buckets and Dragon games appear under My Creations during the authorized cutover.

## Decision

Keep Home's `factory`, `mining`, `gum` and `hill` cards unchanged. Move the existing `dragon` and `buckets` cards from Original jems into **My Creations → Play your games**. Label the Home entrance **My Creations** and describe the page as **Your games, ideas and drawings**. This supersedes the card placement in the [November 22 catalogue decision](2026-11-22-unified-game-notifications.md).

Reuse the existing play actions and individually selectable saved remixes. Preserve every variant's owner, game/project identity, current and kept revision, configuration, source revision ancestry and required art. Opening the collection must not seed replacement projects, filter variants or rewrite storage. Explicit Play retains the existing play-only reuse and transactional creation rules. Restore the shared native host after Studio unmount so a later saved-variant Live Remix → Play route remains visible.

## Cutover-specific retention exception

For this owner's November 23 production cutover only, the required retained set is the four Ready to Play games, the two designated My Creations games and all their required definitions/revisions/configuration/art dependencies, plus profiles, working Adult authentication, production configuration, private worker, approvals and spending boundaries. The owner permits discarding other history, drafts, rewards, obsolete creations and Adult workspace progress, so a full backup is not a blocker for this cutover. This is not general permission to discard user work, does not require deletion, and does not permit indiscriminate storage clearing. This UI change performs no cleanup, migration, authentication or IAM mutation. Any later cleanup must remain within that specific retained-data boundary.

## Evidence and release boundary

The [homepage contract](../homepage/README.md) and [retained-games test](../../tests/retained-games-browser.cjs) require desktop/phone fresh and saved cases, exact versions and owners, older-engine variants, reload without duplicate projects, native canvas/assets and no POSTs. Synthetic records do not establish the owner's actual retained-data acceptance.

IAM setup remains on frozen source `31ec7c82d017cb34591ae779344d47d879d9100c`. This UI branch follows that setup receipt; its later merged source becomes the publication source S only after fresh exact-source gates. Image provenance, release intent and Pages must select that same S. No cleanup, deployment or live acceptance is established by this decision. Reconsider the placement if the owner changes the requested catalogue; changed storage or retention behavior requires its own explicit review.
