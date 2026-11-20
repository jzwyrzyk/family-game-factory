# Gem Pal Studio

**Start here for Gem Pal creation, growth, revisions, expressions, and artwork review.** This is the repository's reusable design method. It preserves the project's creative decisions and checks recurring failures before presenting art. It does not train a model, guarantee first-pass acceptance, or establish runtime readiness.

## Guide map

| Reference | Use it for |
| --- | --- |
| [Design doctrine](DESIGN_DOCTRINE.md) | Inspiration, original species, purposeful gems, anatomy, personality, and Base forms |
| [Growth guide](GROWTH_GUIDE.md) | Two total forms, meaningful structural development, and the growth contract |
| [Quality gates](QUALITY_GATES.md) | Anatomy, crystals, continuity, readability, composition, and character reactions |
| [Continuity and feedback](CONTINUITY.md) | Exact references, revisions, approvals, superseded art, and learning from corrections |
| [Prompt recipes](PROMPT_RECIPES.md) | Operation-specific image briefs and targeted repairs |
| [Empty character-record template](templates/character-record.template.json) | Starting a missing record while preserving the established index schema |
| [Repository skill](../../skills/gem-pal-studio/SKILL.md) | A short assistant workflow that retrieves these canonical guides |

## Resolve the current character record

Use one existing character-reference index. Its established repository path is `docs/pals/art/character-references.json`; this guide does not create a competing `CHARACTER_REGISTRY.json` or copy a stale roster into the method.

As of November 20, 2026, the first selected-art reference tranche is represented at [the canonical index](art/character-references.json) and [visual entry point](art/README.md). It retains owner-selected Base and Grown references with in-review expression states explicitly distinguished. Missing Chimi/Navi exact sources and other forms remain unresolved; the dated imported records are not a claim that all 24 profiles are production-ready.

For each task:

1. Read the current main index when it exists. Otherwise inspect the latest artwork PR and its reference index; record the exact source SHA used.
2. Reconcile newer explicit owner selections or rejections against that record. Do not repeat an old unresolved status as a current fact without checking. A request to create replacement growth art authorizes a new review candidate; it does not approve that candidate in advance.
3. Resolve species/character key, board-scoped alias, form, selected asset, and revision. Inspect exact pixels before a faithful image edit. A title, description, or latest file is not an approved master.
4. Preserve the selected direction when its asset is unavailable. Record the gap and complete useful work on resolved targets. Do not silently substitute superseded art or ask the owner to reapprove a settled choice.

The existing index uses `forms.base` for Base and `forms.mature` for the display name **Grown**. Keep those keys and existing status meanings. Names and board letters can change; established identities and historical references persist.

## Run the operation

| Operation | Required preparation and check |
| --- | --- |
| Create | Choose a useful inspiration principle, compare nearby roster species, connect body/gems/purpose/personality, and define family anchors. |
| Grow | Inspect the approved Base, write the growth contract, and compare separate Base/Grown assets at equal displayed height. |
| Edit | Specify the exact selected form, requested delta, anchors to preserve, and affected downstream work. |
| Express | Use that form's own master; preserve anatomy, lens/face construction, gem topology, and materials while changing expression. |
| Review | Inspect actual artwork and apply Pass / Revise / Reject / Not verified with observable reasons. An internal Pass is not owner approval. |
| Reconcile or hand off | Bind decisions to exact assets, preserve superseded history, and keep art, expression, rig, integration, and in-game acceptance separate. |

Produce one character instance per individual profile asset. A review layout can place the separate Base and Grown assets beside each other. Preserve deliberate fantasy such as Navi's floating gem without accepting accidental detachment elsewhere.

Use small batches and reject weak briefs before rendering. Default exploration limits of twelve briefs and six rendered candidates are editorial working limits; honor a different requested scope or checkpoint plan. Do not generate a mass catalog just because the process can scale.

## Design and implementation are separate

The current art policy has **two total forms: Base → Grown, one transition**. The four-level Spark/Nova maker journey is a separate system. The artwork policy does not determine unlock prices, adventure thresholds, receipt rules, or saved-data migrations.

The companion runtime [PR68](https://github.com/jzwyrzyk/family-game-factory/pull/68) has merged with Base and Grown only under [ADR0013](../decisions/0013-two-form-pals-and-current-main.md), retaining the first transition at five adventures. This does not approve or bind the creature artwork to temporary `glim`/`kip`/`riff` collection IDs. Inspect [delivery state](../../DELIVERY-STATE.md) for the exact source and acceptance status.

## Keep this method current

Capture feedback with its target, scope, observable failure, corrective delta, selected asset, and downstream impact. Update the applicable guide and established character record in the same scoped PR. Keep local defects local; promote only useful general checks. The [maintenance process](../context/MAINTENANCE.md) and `pal-design` documentation review area cover this method, its thin repository skill, and the established `docs/pals/art/character-references.json` path when that index lands. The future route does not import the draft artwork.

Repository-aware assistants reach this through [AGENTS.md](../../AGENTS.md). The [ChatGPT Project retrieval rule](../context/CHATGPT-PROJECT-INSTRUCTIONS.md) provides the matching instruction for ordinary chats; a repository file does not change Project settings or force automatic retrieval. A personal ChatGPT skill should retrieve this canonical guide or clearly identify itself as a dated distribution.

Measure first-review acceptance, revision rounds, repeated defects, reference mistakes, and internal rework only when actual outcomes exist. Separate creative changes of direction from avoidable execution errors. A prompt recipe can be repeated; exact image regeneration and a fixed quality yield are not assured.
