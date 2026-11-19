# 0012 — Collectible Pals from shared earned activity

**Status:** Accepted for development; initial collection and growth thresholds are implementation policy.
**Recorded:** November 19, 2026 (UTC).
**Decision source:** The owner's companion-specific follow-up requested the system complementary to shared gems, reserved final artistic development for another conversation, then explicitly authorized implementation. The follow-up emphasized useful companions in children's own games, funny encouragement and a measured balance between engagement and the heavy addictive/subscription patterns of comparable products. This record paraphrases that private direction; implementation and release evidence belong in [delivery state](../../DELIVERY-STATE.md).

## Context

[ADR0010](0010-lifetime-gems-and-shared-rewards.md) established nonspendable lifetime engagement gems and durable receipts from trusted saved activities. It intentionally left companions outside that revision. The owner has now authorized that complementary system. The existing [Creation Studio](../creation-studio/README.md) already supports editable, bounded local scenes with real tap, jump, dance and speech behavior, so a companion can be immediately useful without changing arbitrary generated game code or inventing a second runtime.

An additional collection should not become a second currency ledger or a competing measure of learning. It also needs a clear distinction between a reusable creative asset, a saved collection entitlement and the current active companion. Receiving a scene containing a Pal's portrait cannot be treated as proof that the profile earned that Pal.

## Decision

1. Launch **Glim**, **Kip** and **Riff** with distinct scripted personalities and equal mechanical capabilities. The child chooses Glim or Kip free; the other starter becomes available at **50 lifetime gems**, and Riff at **150**. Welcoming an available Pal is explicit and spends no gems. Equipping is a separate action.
2. Give each Pal its own activity history. Each **five** committed Math/Language completion or saved-exploration receipts assigned to that Pal make one adventure; each newly rewarded scene challenge or qualifying developed game makes one. Growth is **New at 0**, **Bright at 5** and **Radiant at 15 adventures**. These are engagement thresholds, not learning assessments, power levels or maker ranks.
3. Derive eligibility and growth from the existing validated shared reward ledger. Preserve source-authoritative learning and making requirements, including equal activity credit when eligible work uses help. Assign each receipt once using the Pal active at the activity's occurrence. Baseline pre-starter receipts without growth; preserve each Pal's partial learning group through later selection changes.
4. Make owned Pals useful in the existing local editor: one action opens a playable starter, and free scenes can add an owned Pal with editable tap behavior. Preserve source references, drafts and explicit Keep. Do not insert into practice targets or imply arbitrary game-code conversion. An imported creative asset does not grant ownership, growth or gems.
5. Add a collection page, progress, a trusted-host cameo, optional scripted encouragement and delegation to existing learning hints. Keep those controls outside generated-game authority. Use deterministic visible goals and saved progress without daily decay, randomized acquisition, neglect pressure, subscriptions or paid speedups in this scope.
6. Persist collection ownership, selections, assignments and preferences separately in transactional, owner-scoped IndexedDB. Coordinate source-writing guards, profile changes and explicit family backup/reset. Preserve damaged originals and visible recovery errors. This remains local device data, not a server-authoritative or synchronized account system.
7. Use the existing approved blue, mint and coral gem portraits as clearly provisional tokens. Preserve stable asset IDs so the separate artistic-development pass can replace mappings without changing earned identity or saved scenes. Final creature designs and evolved portraits are not delivered by this decision.

## Consequences and limits

Companions provide an earned collection goal and an immediately editable play object while keeping gem totals, creator ranks and learning evidence distinct. The deterministic thresholds can be explained without a store or random draw. Keeping the runtime and block language shared gives children the same actions in practice and their own Pal scenes.

The cost is another local persistence domain and projection boundary. Rewards and Pals commit separately; recovery must be idempotent, and family maintenance must coordinate them without claiming one transaction covers every browser store. Delayed receipts require retained selection windows. Capacity limits fail visibly rather than pruning identities that could replay growth.

The owner explicitly deferred final art and asked to avoid the most aggressive engagement/subscription patterns; these are scope choices, not results of a comparative product trial. The implementation does not establish that children find the companions funny, that the thresholds are optimal, or that the feature improves learning. Revisit those settings with observed comprehension, voluntary creative use, enjoyment and stopping behavior. Any spending, paid collection, trading, cloud-sync or generated-game inventory API requires a new explicit contract.

## Evidence and related documents

- [Pal feature contract, workflows, thresholds and recovery](../pals/README.md).
- [Shared Rewards contract](../rewards/README.md) and [maker-rank contract](../brand/GEM_PROGRESS.md).
- [Catalog](../../src/pals/catalog.ts), [projection model](../../src/pals/model.ts), [store](../../src/pals/store.ts), [shared-ledger coordinator](../../src/pals/service.ts), and [host presentation](../../src/pals/host.ts).
- [Playable scene adapter](../../src/pals/creation.ts) and [Creation Studio contract](../creation-studio/README.md).
- [Core tests](../../tests/pals.test.ts), [scene behavior tests](../../tests/pals-creation.test.ts), and [component browser checks](../../tests/pals-ui-browser.cjs). Their exact run results and limitations belong in [delivery state](../../DELIVERY-STATE.md).
