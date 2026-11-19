# Lifetime gems and shared rewards

**Scope:** first implementation on `feature/jems-rewards-v1`, prepared directly against main `c6576c16e005ae58ce8c706801414be4d864242e` after PR57's approved-brand merge. Artwork and the maker journey inherit from main. Rewards is a separate feature; this contract describes its implementation and acceptance requirements. [Delivery state](../../DELIVERY-STATE.md) records exact source pins, validation, publication, merge and deployment separately.

The owner requested shared gem increments for completed learning activities, developed games and meaningful milestones, with a cohesive rewards page, progress, popups and the approved web branding. [ADR0010](../decisions/0010-lifetime-gems-and-shared-rewards.md) records this decision. The subsequently approved [Jem Pals](../pals/README.md) feature is a separate consumer of this ledger; companion artwork remains its own review.

## Two truthful kinds of progress

**Lifetime gems** are a cumulative engagement total. They cannot be spent, exchanged or redeemed in this revision. Completed work can add gems and advance visible gem milestones. There is no extra XP level or competing numerical rank.

**Making rank** remains **Gem Maker → Gem Cutter → Gem Polisher → Gem Master**, derived from the child's retained making evidence under the [existing contract](../brand/GEM_PROGRESS.md). The Rewards page shows that rank alongside the gem total; a larger gem total cannot buy a maker rank. Deleting required making evidence can lower the current rank while previously granted engagement gems remain. Explicit family/profile reset and backup replacement have their own deletion semantics below.

Neither quantity measures intelligence, proficiency, attention, reasoning quality or educational improvement. Math, Language Arts and scene checks retain their existing evidence and assistance fields. The reward ledger stores short action identities and amounts, not answers, private conversation text or model assessments.

## Initial award schedule

These are version-1 product choices, not research-calibrated learning thresholds. The immutable policy and validation are in [model.ts](../../src/rewards/model.ts).

| Saved action | Gems | Eligibility and repeat policy |
| --- | ---: | --- |
| Completed Math activity | 2 | The trusted host recorded a completed activity with a correct response; once per activity identity. Corrected or hint-supported completion earns the same amount. |
| Completed Language Arts activity | 2 | A completed closed-answer activity with a correct response; once per activity identity. Assistance does not reduce the reward. |
| Saved open writing exploration | 2 | Nonempty writing saved as the engine's unscored `explored` outcome; once per activity identity. This is not a writing-quality or correctness judgment. |
| Completed scene challenge | 8 | A durably recorded passing behavior check; once per owner and challenge ID across scene copies, rechecks and later revisions. Hint-supported completion is eligible. |
| Developed game | 25 | A confirmed Keep of a real verified remote test, or a local test whose saved configuration changes the current working game. Once per canonical project identity; copying or repeated Keep cannot multiply the grant. |
| First newly saved Gem Maker transition | 5 | Once per owner and maker level. |
| First newly saved Gem Cutter transition | 10 | Once per owner and maker level. |
| First newly saved Gem Polisher transition | 20 | Once per owner and maker level. |
| First newly saved Gem Master transition | 40 | Once per owner and maker level. |

An initial real remote build can qualify as a developed game without claiming improvement over a nonexistent base. For a local Keep, the host compares the saved configuration with the current working version being replaced, after the existing confirmation when a test began from an older base. The existing polished maker rank still requires its own authored idea, real test, reflection and matching original nonnull-base Keep evidence. Studio's canonical `rewardProjectId` survives copies and local/remote transitions; the development grant is not issued merely because a new session or version ID exists.

Opening a game, typing an unsaved draft, choosing an avatar, chatting, viewing a preview, pressing an arbitrary button, running a failed/queued/mock build, showing an answer, leaving an activity unanswered, or submitting only incorrect responses grants no gems. A subsequent successful correction can qualify. No amount depends on response speed, avoiding hints, spending money or a generated game's score.

### Practice-count bonuses

The total number of rewarded Math and Language activities earns the following additional grants. Saved open writing counts as a language activity; scene challenges and maker bonuses do not inflate this count.

| Total practice activities | Bonus gems |
| ---: | ---: |
| 10 | 10 |
| 25 | 15 |
| 50 | 20 |
| 100 | 25 |
| Each further 100: 200, 300, and so on | 25 |

Each threshold has one stable receipt. There is no daily streak or expiry. The next target remains available after a break.

### Gem milestones

Lifetime totals recognize **50, 150, 300, 600 and 1,000 gems**, then each additional **500**. These are progress markers; crossing one does not add another currency award or maker rank. The separate Pals policy reads the lifetime total to offer deterministic collectible unlocks without spending gems. The progress indicator measures the interval from the last reached milestone to the next, with explicit totals and remaining progress.

## Durable evidence and idempotent projection

1. A trusted source action stages a minimal `RewardFact` in that source's optional `rewardOutbox`.
2. The source persists the completed activity and its outbox in the same write. A failed source save cannot grant gems.
3. The rewards coordinator projects pending facts into [RewardsStore](../../src/rewards/store.ts). One IndexedDB read/write transaction adds all new receipts and any newly earned practice-count bonuses.
4. The source acknowledges only facts whose ledger transaction succeeded. An acknowledgement failure leaves pending facts available to retry; retry does not award them again.
5. The UI displays the committed total and a compact nonblocking celebration for newly granted work. Loading, importing or retrying previously granted facts does not replay a reward.

The semantic activity key is **kind + source ID**, scoped to an owner and a captured browser workspace namespace. Maker keys are normalized to the level; practice bonus keys use the threshold. Keys deliberately exclude timestamps, UI sessions, policy versions and amounts. The receipt records its policy version and fixed amount so a later schedule cannot silently reprice old work. A future rule change needs a new supported policy and explicit migration policy, while retaining those stable identities.

The source adapters, not model output or game-supplied messages, decide eligibility. Generated games cannot choose reward amounts. A celebration event is presentation, not proof of a saved action or authority to grant gems.

There is **no automatic historical backfill**. Existing learning history, older notebook ranks and imported game records are not scanned to invent reward receipts. New saved upward rank transitions can earn the relevant one-time bonus; the earlier rank display is preserved independently. Already saved pending facts are recovery work and may be projected after reload. The ledger retains receipts after source attempt lists roll over, so the engines' 120-attempt windows cannot erase lifetime gems or allow those same IDs to be rewarded again.

## Local persistence, concurrent tabs and recovery

The IndexedDB database is `family-game-factory-rewards-v1`, with a `workspaces` object store. A transaction updates one complete captured namespace. Family records use the ordinary key; an adult workspace uses `adultStorageKey(REWARDS_DB_NAME)`. Each namespace contains owner-separated ledgers, and an adult namespace rejects another owner. Async completion retains the original namespace/owner even if the displayed profile changes; a stale result must not paint another child's balance or popup.

The existing source stores remain synchronous localStorage documents. An origin-wide exclusive Web Lock, `jems-source-writer-v1`, allows one source-writing tab. Another tab pauses with **One Jems tab at a time** and an explicit retry action. A browser that cannot provide the required safe write mechanism does not silently fall back to concurrent writes. This protects the source-plus-outbox write, while native IndexedDB transactions independently protect ledger projection. It does not make local data cheat-proof or server-authoritative.

All of these records remain device- and origin-specific. There is no cloud synchronization, cross-device balance, backend reward service or new model call. A copied backup transfers the selected local history through the explicit import flow.

Malformed or unsupported reward history remains intact; it is not converted to a believable zero balance. JSON-compatible damaged data can be exported for recovery. If an unusual corrupted value cannot be preserved losslessly in JSON, replacement/export stops before changing it rather than silently discarding part of the original. Quota/read errors remain visible and retryable. Pending source receipts are retained until successful acknowledgement or an explicit deletion that removes their scope. Capacity limits fail visibly rather than pruning award identities and risking duplicate grants: 1,024 pending facts per source outbox, 25,000 receipts per owner, 80 owner ledgers per namespace and a 16-million-character validated workspace bound.

## Backup, restore and deletion

Family backup includes the scoped reward snapshot and pending source outboxes. Import validates the reward schema, policy amounts, unique IDs, earned milestone prerequisites, namespace and allowed owners before replacement. The core store supports explicit replacement or idempotent merge. The existing family restore flow chooses replacement of the selected backup; this can intentionally restore an earlier total. Imports do not replay earned celebrations.

A merge unions semantic identities and can add a newly qualified aggregate practice bonus once. Replacement can recover a corrupt local ledger using a valid explicitly selected backup. A ledger transaction is atomic; replacing the entire family also crosses the existing source stores. [The backup coordinator](../../src/rewards/backup.ts) pauses source writes and projection, validates the whole replacement, then saves a durable rollback journal before changing any source. The journal preserves the exact four original source strings (family state, factory workspace, Studio notebook and Creation workspace) plus the raw family reward snapshot. If the safety copy cannot fit or preserve the original losslessly, nothing is replaced.

The localStorage journal key is `family-game-factory-reward-backup-journal-v1`. Its `pending` phase means a failed or interrupted restore/reset must restore the protected originals; `committed` means every replacement write succeeded; `rolled-back` means recovery restored the originals. An unfinished operation keeps source writes and projection paused. Startup acquires the writer lock and resolves the journal **before** installing reward projection or allowing source writes. A recovered partial restore reloads the document so previously loaded in-memory stores cannot overwrite recovered data. The next document clears a completed marker. A damaged journal blocks startup for recovery rather than guessing at the correct family state. These coordinated writes and rollback do not constitute one database transaction across every browser store.

Clearing a conversation, archiving a project or removing learning detail does not subtract already committed lifetime grants. The current maker rank continues to follow retained evidence. Notebook pending receipts survive clear-chat; deleting an owner's final Creation project removes that owner's still-unprojected scene facts. The ledger has a scoped owner-removal primitive; any complete profile-erasure flow must also remove that owner's pending source facts. Coordinated family reset clears the family ledger and all four family source domains without changing adult workspaces. Missing domains in a legacy family backup restore empty, including an empty reward ledger when no reward snapshot is present. This prevents leftover source facts from minting credit after replacement. Damaged exported recovery data is not a valid replacement snapshot.

## Interface and artwork

[Rewards UI](../../src/rewards/ui.ts) and [styles](../../src/rewards/rewards.css) use the approved Jems identity, existing gem artwork and selected maker thumbnails. The page presents the lifetime total, next milestone, how to earn, recent committed grants and the existing maker rank. The compact entry/widget leads back to that shared page. Collection ownership belongs to My Pals, with its own validated store. Pals can add a brief response to the existing saved-reward toast so one action does not require competing popups.

Family backup includes the optional `factoryPals` snapshot under the same source/reward recovery journal. The host drains both coordinators before replacement; rollback restores sources, gems and collection together. Pals use explicit backup replacement, never merge divergent equipment timelines. A legacy backup without Pals restores an empty collection, and damaged `factoryPalsRecovery` exports remain recovery material, not importable reward or ownership evidence.

Celebrations preserve focus and input, use a polite status announcement, have no automatic sound, and respect reduced motion. Page loading and storage failure have explicit states; a pending query never displays another owner's last total. Existing learning guards and scene/game cleanup remain authoritative when navigating to Rewards.

## Verification and evidence limits

Run the focused suites after the production build:

```sh
npm run test:rewards
npm run test:rewards-browser
```

- [Core tests](../../tests/rewards.test.ts) cover policy amounts, stable identities, failed-write recovery, atomic-port concurrency, namespaces, milestones, corruption, imports, reset and retained lifetime receipts.
- [Integration tests](../../tests/rewards-integration.test.ts) exercise actual Math/Language engines, StudioNotebook and CreationStore through saved outboxes and ledger projection. They preserve assisted versus independent learning evidence.
- [Backup tests](../../tests/rewards-backup.test.ts) cover whole-family preflight, journal failures, interruption recovery, exact rollback, legacy replacement and namespace boundaries.
- [Component browser checks](../../tests/rewards-ui-browser.cjs) cover responsive layout, local/base-path artwork, keyboard actions, owner-safe states, reduced motion and nonblocking popups. Their illustrated data is a fixture.
- [Application browser checks](../../tests/rewards-browser.cjs) cover real source actions, persisted rewards, navigation, recovery, profiles and the source-writing guard in the built application. Exact completed checks belong in delivery evidence, not in this normative list.

The existing Arcade workflow registers these gates and preserves screenshot artifacts. Passing source/fixture/browser checks does not establish actual-device reliability, child engagement, educational efficacy or live-provider behavior. No production activation is implied by this contract.

The [review captures](previews/README.md) preserve the synthetic-profile [desktop page](previews/rewards-desktop.png), [mobile page](previews/rewards-mobile.png) and [learning reward popup](previews/learning-reward.png) from the built application. Their source and evidence limits remain separate from release or actual-child acceptance.
