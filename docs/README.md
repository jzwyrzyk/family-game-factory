# jems documentation map

Start with the canonical references below. Feature documents remain the detailed contracts; this index keeps them discoverable without copying all of their content into an engineering handbook.

## Canonical references

| Reference | Question it answers | Update when |
| --- | --- | --- |
| [Agent entry point](../AGENTS.md) | What should an assistant read and preserve before answering or developing? | Working method or context-loading rules change |
| [Product doctrine](../PRODUCT-DOCTRINE.md) | Why are we building jems, and what must remain true? | An accepted product principle or tradeoff changes |
| [Current architecture](../ARCHITECTURE-CURRENT.md) | What is implemented, where does it live, and how do boundaries interact? | Components, APIs, storage, trust or version contracts change |
| [Delivery state](../DELIVERY-STATE.md) | What is merged, deployed, activated, verified, or still unknown? | PR disposition, release intent, deployment or acceptance evidence changes |
| [Decision records](decisions/README.md) | Why did we choose this approach? | A consequential choice is accepted, replaced or reversed |
| [Maintenance process](context/MAINTENANCE.md) | Who updates the references, and what catches drift? | Checks, review routing or upkeep changes |

## Choose the task-specific references

| Task | Intent and detailed contracts | Implementation/evidence entry points |
| --- | --- | --- |
| Child creation, conversation and experiments | [Design-coach gold standard](design-coach/GOLD_STANDARD.md), [child journey](child-journey/README.md), [creation release gate](jems-creation/RELEASE_GATE.md) | `src/studio/`, `src/factory/`, [child acceptance](child-journey/acceptance.md) |
| Editable scenes, visual actions, and computational practice | [Creation Studio contract](creation-studio/README.md), [accepted continuous-creation decision](decisions/0007-creation-and-rebuild-practice.md) | `src/creation/`, `tests/creation-*`, `server/agent/creation-schema.ts`; source adapters, behavioral checks and specific formative history |
| Homepage, favorites and return-to-work continuity | [Homepage](homepage/README.md), [child continuity](child-continuity/README.md) | `src/studio/`, `src/games/`, `tests/homepage-entry.cjs`, `tests/build-continuity.cjs` |
| Native gameplay, physical simulation and saved engines | [Game quality](GAME-QUALITY.md), [runtime compatibility](game-quality/STUDIO_COMPATIBILITY.md), [play review](game-quality/PLAY_REVIEW.md) | `src/games/`, `src/quality/`, `src/runtime/`; new Bubble Gum defaults differ from the historical physical-v1 report |
| Generated-game quality, intent and repair | [Game Intelligence](game-intelligence/README.md), [presentation quality](game-intelligence/PRESENTATION-QUALITY.md), [cross-vertical standard](game-intelligence/cross-vertical-standard.md), [merge handoff](game-intelligence/merge-handoff.md) | `server/quality/`, `server/actions/`, `server/sandbox/`; distinct visual styles, captured play, separate review and bounded repair |
| Math | [Math overview](adaptive-math/README.md), [curriculum](adaptive-math/curriculum.md), [integration](adaptive-math/integration.md), [acceptance](adaptive-math/acceptance.md) | `src/learning/`, host integration and learning tests |
| Language Arts | [Language overview](adaptive-language/README.md), [curriculum](adaptive-language/curriculum.md), [integration](adaptive-language/integration.md), [acceptance](adaptive-language/acceptance.md) | `src/language/`, language integration tests |
| Brand and visual experience | [Brand rules](brand/README.md), [joy-layer release contract](brand/JOY_LAYER_RELEASE.md) | `src/brand/`, `public/jems-*`, browser screenshots; use the supplied approved mark |
| Authentication, reconnect, parent/device operations | [Trusted family devices](auth/TRUSTED_FAMILY_DEVICES.md) | `server/trusted-devices.ts`, `server/sessions.ts`, gateway and paid-admission handlers |
| Temporary adult profile and guardian privacy | [Accepted one-site development decision](decisions/0005-temporary-adult-profile.md), [adult release and removal](adult-pilot/VOICE_RELEASE_AND_UAT.md), [parent privacy](privacy/PARENT_CONSENT_AND_ADULT_PILOT.md), [integration review](privacy/ADULT_CHILD_RELEASE_INTEGRATION.md) | `src/adult-pilot/`, `server/adult-pilot.ts`, `server/privacy/`, `src/builder/privacy.ts`, `tests/adult-*`, `tests/parent-privacy*`; accepted scope and branch implementation are separate from deployment |
| Private coach and speech | [Tap-to-dictate contract](issue-28/PUSH_TO_TALK_MVP.md), [private-service plan](issue-28/CLOUD_RUN_OWNER_PLAN.md), [speech release](issue-28/PRIVATE_SPEECH_RELEASE.md), [security/release](issue-28/SECURE_INFERENCE_AND_RELEASE.md) | `server/coach/`, `src/studio/`, dedicated coach image and deployment scripts |
| Generation, isolation and release | [Current architecture](../ARCHITECTURE-CURRENT.md), [private worker bridge](assignment-004/private-worker-bridge.md), [service images](assignment-006/SERVICE-IMAGES.md), [delivery state](../DELIVERY-STATE.md) | `server/pipeline/`, `server/actions/`, `server/sandbox/`, `scripts/deployment/`, private worker repository |

## Document classes and evidence

**Normative contracts** describe intended behavior and acceptance requirements. They do not prove deployment or that every requirement has passed. **Current architecture** describes source at its recorded baseline. **Delivery state** records changing external facts with links, SHAs, environment and observation time. **Research** describes hypotheses, experiments and unresolved decisions; being written or merged does not validate an outcome. **Historical reports** remain evidence for their exact original scope.

The [original charter](factory-v2-implementation-charter.md), [Assignment 001 traceability](requirements-traceability.md), [early gap analysis](gap-analysis.md), [Assignment 002](assignment-002/README.md), [owner pilot handoff](assignment-005/OWNER-PILOT.md) and [repair completion report](repair-program/COMPLETION.md) are valuable history. Their old branch statuses, pins and "current live" statements must not be used as today's inventory. Use [delivery state](../DELIVERY-STATE.md) and verify its observation date.

Prefer a link to the detailed contract over a copied version. Add new feature families to this index and to the [review registry](context/registry.json). Keep ephemeral execution logs in scoped evidence directories; preserve decisions and outcomes instead of dumping entire chats into the repository.


Illustrated maker progress: [Gem progress evidence contract](brand/GEM_PROGRESS.md), [art provenance](brand/achievement-art/README.md), and [ADR0008](decisions/0008-cosmetic-making-journey.md).
