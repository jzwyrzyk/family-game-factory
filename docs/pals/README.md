# My Pals: companions for learning and creation

**Scope:** the companion foundation in this checkout. This document describes source behavior, integration contracts and acceptance requirements. It does not establish a merge, deployment, observed child engagement or educational benefit; dated evidence belongs in [delivery state](../../DELIVERY-STATE.md).

The owner requested the complementary companion system, then authorized implementation with funny encouragement, a useful collection, visible progress and easy use in children's games. The owner also asked for a practical balance between engagement and the heavy subscription/addiction patterns of comparable products. Character artwork remains a separate development conversation. [ADR0012](../decisions/0012-pals-from-earned-activity.md) records this scope alongside the existing [shared Rewards contract](../rewards/README.md).

## Launch collection and eligibility

The first collection contains three equal-capability companions. Their names, IDs, personalities, thresholds and temporary art mappings are defined in [catalog.ts](../../src/pals/catalog.ts).

| Pal | Personality and family | Collection rule | Creative asset ID | Current portrait |
| --- | --- | --- | --- | --- |
| **Glim** | Curious Explorer; experiments, discoveries and imaginary maps | A free first-Pal choice, or available at **50 lifetime gems** after choosing Kip | `pal-glim` | Existing approved `gem_blue.webp` |
| **Kip** | Enthusiastic Maker; testing, building and useful wobbles | A free first-Pal choice, or available at **50 lifetime gems** after choosing Glim | `pal-kip` | Existing approved `gem_mint.webp` |
| **Riff** | Playful Story companion; expressive jokes and unexpected plot twists | Available at **150 lifetime gems**, after a starter is chosen | `pal-riff` | Existing approved `gem_coral.webp` |

The child explicitly chooses Glim or Kip as their starter. That choice creates ownership and makes the Pal active. Reaching another Pal's threshold makes it available; **Welcome** adds it to the collection, and **Take along** separately changes the active Pal. Welcoming a Pal does not silently replace the current companion. Each profile has one starter choice and one active Pal at a time.

These are lifetime earning thresholds, not prices. **No gems are spent.** Collecting, equipping, playing with or creating with a Pal leaves the shared gem total unchanged. Previously earned gems can qualify the other companions when the child first chooses a starter. Thresholds are initial product settings, not research-calibrated claims about motivation or learning.

Ownership and availability are persisted. Ordinary breaks, changing the active Pal and deleting individual source details do not remove earned companions. Explicit profile/family erasure or replacement with an earlier backup can remove history within that operation's scope.

## What children can do

| Surface | Actual interaction and value |
| --- | --- |
| **My Pals** | Choose a starter, inspect the three-Pal library, see owned/available/locked states, view growth and remaining progress, welcome an eligible Pal, choose who comes along, or create a scene. |
| **Pal detail playground** | Tap an owned portrait for a short finite visual reaction and a scripted funny line. Taps are play, with no gems or growth awarded. |
| **Home entry** | Open the collection or start creating with the active owned Pal. The entry follows the existing playable game shelf and creation entrance. |
| **Studio cameo** | A small trusted-host companion beside the game surface, with collection access and the host's existing Help action. It is not injected into a game's iframe and does not change the game's score, physics or difficulty. |
| **Learning hint entrance** | When a visible supported Math/Language hint control is available, **Ask [Pal] for a hint** invokes that same host control. Existing hint depth, assistance evidence and answer handling remain authoritative. |
| **Create & code** | Start an editable Pal playground or add an owned Pal to an existing free scene, with real tap-response behavior and editable blocks. |

The [page and components](../../src/pals/ui.ts) are presentation only. The [host installer](../../src/pals/host.ts) coordinates navigation, learning visibility, parent settings and compact notices. Neither component rendering nor an animation callback can collect a Pal, award gems or create an adventure.

### Creating something with a Pal

**Make something with this Pal** opens a new 800×450 meadow scene in the existing Creation Studio. It contains the chosen Pal, a start greeting, and an editable **When tapped** script: jump for 600 ms, dance for 800 ms, and say a short joke for 1,800 ms. The child can immediately press **Play**, tap the character repeatedly, and see those actions execute. The tap script is selected in the editor so its first changes are easy to find. The three companions have the same available mechanics; their initial speech differs.

In a free scene, **Add your Pal** inserts the active owned Pal with its tap script. **Choose another** opens the owned-Pal picker. The ordinary character picker also offers currently owned Pals. Each insertion gives the actor and script independent IDs; repeated uses of the same portrait do not share runtime state. Existing actors, programs, variables, exact source-game references and private-art image/rig/hash bindings survive the addition. The normal scene capacity and execution limits still apply. See [creation.ts](../../src/pals/creation.ts), the [creation UI](../../src/creation/ui.ts), and the [Creation Studio contract](../creation-studio/README.md).

Starting a Pal scene preserves pending work before navigation. Adding a Pal saves a recoverable draft; neither action automatically chooses **Keep**. An unresolved recovery draft still requires the child's existing Resume/Use saved version decision. Passive Pal refreshes preserve an active actor/art choice and its focus; owner changes and activation-time checks still enforce the current collection. No provider call, build request, automatic Play or automatic challenge submission is involved. Supplied playground blocks retain `starter` provenance and do not establish unaided coding mastery.

Rebuild practice scenes omit the Pal tools and Pal asset choices; the mutation handler also rejects insertion into a challenge. After a successful check, the existing **Make it my own** action creates a free copy where Pals can join. No Pal is added to a challenge target or copied solution.

This implementation makes Pals usable in actual local playable scenes. It does not insert a controllable companion into every native or generated game's mechanics, rewrite arbitrary generated JavaScript, or promise a bidirectional game-to-block conversion. The host cameo and the editable scene are separate integrations with different capabilities.

### Creative assets do not confer ownership

The three portrait assets are in the trusted scene allowlist. A valid imported scene or generated companion manifest may therefore contain `pal-glim`, `pal-kip` or `pal-riff` and remain playable. **Importing a scene, copying a project, receiving a creative backup or seeing a portrait does not add that Pal to the collection.** Creative files contain actor references and programs, not the companion inventory or a lifetime gem balance. The special creation entrances check current-profile ownership independently.

The separate validated Pal backup is the format for restoring collection ownership. A scene-only backup and a full family backup are not interchangeable authorities. Generated games receive no companion collection, reward ledger or award capability through this feature.

## Growth: shared activity, individual adventures

[model.ts](../../src/pals/model.ts) projects committed activity receipts into each Pal's own adventure count. A Pal grows through activities that occurred while it was active, not through time spent, taps, a companion's appearance or the number of windows opened.

| Committed shared reward activity | Pal growth |
| --- | --- |
| `math.completed`, `language.completed`, `language.explored` | Each group of **5 saved activities assigned to that Pal** adds **1 adventure**. Math and Language can be mixed within the group. |
| `scene.challenge` | **1 adventure** for the one-time rewarded challenge identity. Copies, rechecks and later versions do not create another receipt. |
| `game.developed` | **1 adventure** for the one-time rewarded canonical project identity. The shared developed-game eligibility and explicit Keep requirements still apply. |
| Maker-level rewards, practice-count bonus receipts or gem-milestone displays | May contribute to the existing lifetime gem total under Rewards policy, but add **no separate Pal adventure**. |
| Tapping a Pal, selecting it, opening a page, starting a playground or adding a scene actor | **No adventure** and **no new gems**. |

Using a hint or successfully correcting an answer does not reduce an eligible activity's growth contribution. Saved open writing counts as exploration; it is not a correctness or writing-quality judgment. The original learning evidence remains separate from this engagement count. A qualifying activity still has to be saved and accepted by its source under the [Rewards schedule](../rewards/README.md#initial-award-schedule).

| Total adventures assigned to this Pal | Stage |
| ---: | --- |
| **0–4** | **Base** (`base`) |
| **5 or more** | **Grown** (`mature`) |

There are exactly two forms and one transition. These forms do not grant stronger game abilities, better hints, higher scores, learning privileges or a different creator rank. All owned Pals remain usable in scenes. Grown keeps showing the cumulative adventure total without another threshold or third-form promise.

[ADR0013](../decisions/0013-two-form-pals-and-current-main.md) deliberately retains the existing first growth threshold at five adventures so an older Bright or Radiant history is not demoted. This is implementation compatibility policy, not a numerical choice inferred from artwork approval. Existing ownership, receipts, selections, learning remainders and backup schema are unchanged: the saved workspace never contained a stage number. Startup/restore derives the current form quietly; 14→15 does not create another growth celebration. A new 4→5 transition can celebrate once.

The catalog records explicit `base`/`mature` form slots and preview readiness. Species, character and selected-art bindings remain null until the separate artwork mapping is established. Current gem-token portraits do not represent approved Base/Grown creature art. Existing `pal-glim`, `pal-kip` and `pal-riff` scene references stay stable; future selected art needs explicit form/version bindings and cannot silently replace a saved scene’s chosen image.

### Assignment and replay rules

The shared receipt ID is assigned once. Reopening, retrying synchronization or re-equipping a Pal cannot replay the same work. The store retains ordered active-Pal selection boundaries; a delayed receipt follows the Pal active at its recorded occurrence time, even if another Pal is now active.

Learning remainders remain with their own Pal. For example, four saved learning activities with Glim and four with Kip give each Pal four toward its own next adventure. Returning to Glim and completing one more gives Glim an adventure; Kip's progress stays at four. Switching does not move partial groups or duplicate completed groups.

Before the first starter selection, existing receipts are recorded with no Pal assignment. This includes unusually future-dated receipts already present in the ledger, so choosing a starter does not turn old work into new growth. New receipts whose occurrence precedes the first selection also have no Pal assignment. Earlier gems can unlock collection eligibility, while earlier work does not retrospectively grow a newly chosen companion.

## Engagement and encouragement

The engagement loop is explicit: choose a companion, use it in an activity or creation, see saved progress, and work toward a known next stage or companion. The library shows the complete launch collection and deterministic requirements. There are no randomized draws, expiring collections, streak resets, hunger/neglect meters, trading, subscriptions, paid speedups or gem purchases in this feature.

Funny lines are bounded, deterministic scripts in the catalog, grouped for welcome, practice, making, coding, growth, play, rest and retry. They describe the Pal's imaginary tools, maps, dances and stories. They do not infer the child's emotions or claim that the Pal suffers when the child leaves. No model call is needed for a reaction. The presence of a line category is not a promise that every category has an automatic trigger.

The host can add a small Pal response to the existing reward celebration so one saved action does not produce competing cards. Ordinary encouragement is throttled to at most one presentation per 25 seconds; a newly available Pal or growth transition may receive a separate notable response. When no reward card is present, only a notable transition creates a short Pal toast. Notices wait while a host learning activity is open, do not take focus, use polite announcements, and have no automatic audio. Backgrounding the page or changing profiles clears pending transient presentation.

**Show my Pal beside games** and **Funny encouragement** are saved per-profile options, also exposed in Parent Controls. Hiding the cameo or quieting encouragement does not stop growth, erase the collection or remove My Pals access. Deliberately tapping the Pal in its own detail playground remains a play action. The collection uses keyboard-operable controls, labeled progress, visible focus and reduced-motion styling; actual-device and child-use evidence remain separate acceptance work.

## Authority, persistence and recovery

The [coordinator](../../src/pals/service.ts) reads a validated export of the one shared rewards ledger. It derives the lifetime total from that ledger and takes only supported activity receipt identities, kinds and timestamps. Maker receipts are excluded from the adventure input. Pal code does not independently inspect answers, infer a reward from a UI event, accept game-supplied amounts, or maintain a competing gem balance.

The reward source remains responsible for eligibility and durable completion. Its source/outbox write, ledger projection and acknowledgement retain the existing idempotent recovery contract. Pals then make a separate idempotent projection from already committed receipts. An interruption between those commits can delay visible companion progress; it cannot justify inventing an award or treating all stores as one transaction.

The [store](../../src/pals/store.ts) uses IndexedDB database `family-game-factory-pals-v1`, object store `workspaces`, with schemas `jems.pals.workspace.v1` and `jems.pals.backup.v1`. Each write performs the read, mutation, validation and replacement in one native read/write transaction. Profiles retain ownership, availability, active selection history, receipt assignments and display preferences. They do not store learning answers, private conversation text, inferred emotions or a new proficiency score.

Family and adult workspaces use the existing captured namespace convention; an adult namespace rejects other owners. The coordinator captures owner, namespace and epoch before asynchronous work. Profile changes invalidate stale presentation and later steps rather than displaying the previous child's collection. Companion mutations use the shared source-writing guard; an already open learning activity also blocks choosing, collecting, equipping and preference changes until the host activity is resolved.

The current capacity bounds are **80 profiles**, **25,000 assigned receipt identities per profile**, **25,000 selection boundaries per profile**, and **16 million characters** per validated workspace. Capacity, quota, unsupported-schema and read failures are visible errors. They do not silently replace saved data with an empty collection. The UI reports an unavailable balance as loading/error rather than a believable zero. Opening or retrying existing committed progress does not replay its earned celebrations.

Collection data is local to this browser origin and device. Native transactions and source guards protect the supported application flow; they do not make browser data tamper-proof, server-authoritative or cloud-synchronized.

### Backup and deletion boundaries

`PalsStore.export()` produces a namespace-bound collection backup. Restore requires an explicit replacement mode, a valid supported schema and the owners allowed by the surrounding family backup. It preserves the selected snapshot's ownership, assignment history, growth and preferences without issuing reward receipts. Collection merge is not implemented. Restoring an earlier snapshot may intentionally restore earlier companion history.

The [family backup/reset flow](../../src/rewards/backup.ts) includes `factoryPals` and coordinates Pal replacement with the existing reward and source stores. It drains the companion queue, rechecks the captured player/namespace, then freezes source/reward writes. Its journal saves the current source bytes (including problem-solving records and notebook guidance) and both reward/Pal database snapshots before replacement. A failed replacement rolls these stores back; startup recovers an interrupted journal before allowing new writes. Native Pal transactions do not make the whole family replacement one database transaction. A historical journal restores only the source keys it captured, so an older four-source journal does not overwrite uncaptured problem-solving data. An old rewards-only journal leaves Pals untouched, while an explicitly selected legacy family backup without `factoryPals` restores an empty collection. Both `factoryPalsRecovery` and `factoryProblemSolvingRecoveryRaw` exports are recovery material, not complete import backups. Private drawing originals and art revisions remain in the separate [art backup](../drawings/ART_STUDIO.md); progress backup does not start including those bytes. Raw recovery exports are not a user creative-import or ownership-grant API.

An unsupported or damaged collection remains available through the recovery export path rather than being silently reset. A valid explicitly selected replacement can recover it. Removing one owner removes that owner's Pals, selection history, assignments and settings while preserving the other profiles. Full family reset and adult-workspace deletion must retain their existing separate scopes. Clearing a conversation or deleting an individual creative artifact is not a collection reset.

## Source and integration map

| Module | Responsibility |
| --- | --- |
| [catalog.ts](../../src/pals/catalog.ts) | Stable identities, temporary approved art mappings, deterministic thresholds and scripted personality lines |
| [model.ts](../../src/pals/model.ts) | Schema validation, once-only receipt assignments, adventure counts, stages and view projection |
| [store.ts](../../src/pals/store.ts) | Transactional local persistence, collection/equip/preferences, namespace enforcement, backup and recovery |
| [service.ts](../../src/pals/service.ts) | Shared-reward bridge, source-writing guard, current-profile queue, stale-work protection and maintenance |
| [ui.ts](../../src/pals/ui.ts) / [pals.css](../../src/pals/pals.css) | Collection page, progress, local tap toy, home widget, cameo and accessible presentation |
| [host.ts](../../src/pals/host.ts) | Application navigation, existing hint/help delegation, parent options and coordinated notices |
| [creation.ts](../../src/pals/creation.ts) | Validated playable starter and additive scene insertion using the existing engine |

`installCreationStudio` accepts optional `ownedPals(): readonly string[]`, `activePal(): string | null`, and `openPals(): void` host hooks. Its returned `openWithPal(id): boolean` preserves current work and creates the selected owned-Pal scene synchronously; `refreshPals()` refreshes the owned choices without altering the current program. These hooks contain host-owned selection data and are not a generated-game inventory interface.

## Verification and remaining work

The focused source checks are:

```sh
npm run test:pals
npm run test:pals-browser
```

[Core tests](../../tests/pals.test.ts) exercise starter/threshold rules, grouped learning growth, growth stages, delayed assignments, re-equipping, per-Pal remainders, duplicates, failed writes, concurrent transactions, owner/adult isolation, quiet preferences, backups, corruption and profile erasure. [Creation tests](../../tests/pals-creation.test.ts) run actual jump/dance/speech behavior, repeated taps, independent actor identities, source preservation, stage/capacity bounds, explicit Keep, draft recovery and imported-scene attribution. Existing engine, challenge and source-storage regressions continue to apply.

The [component browser checks](../../tests/pals-ui-browser.cjs) use explicit synthetic views to inspect responsive layout, approved local art paths, keyboard/focus behavior, quiet/reduced-motion states, errors and stale profile callbacks. They do not establish that a live source action earned the shown collection. Built-application integration evidence must additionally cover the real Rewards-to-Pals flow, source writing guard, profile changes, collection persistence, hint delegation, Pal scenes, and family backup/reset. Record exact completed checks and candidate identities in delivery evidence.

[Receipt-bridge tests](../../tests/pals-service.test.ts) use validated shared-ledger exports to check eligible activity mapping, bonuses without extra adventures, foreign/corrupt data, historical baselines and delayed attribution. [Backup fault tests](../../tests/pals-backup.test.ts) inject database and source-storage failures to verify full rollback, legacy/reset behavior, crash recovery, unsupported recovery namespaces and preservation of damaged originals. These test local contracts, not actual-device reliability or engagement outcomes.

The separate artwork workstream holds the selected character library. Its exact runtime identity/form bindings, production portraits/rigs, richer animation and companion behavior inside arbitrary generated-game mechanics remain separate integration work; this runtime preparation does not reopen settled art choices or claim all assets are ready. New art should preserve the existing IDs and source ownership rules. New earning policies, paid features, trading, cross-device synchronization or a generated-game companion API require an explicit new contract; none is implied by the catalog or the provisional artwork.
