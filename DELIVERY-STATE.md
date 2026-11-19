# jems delivery state

**Last source/status observation:** November 18, 2026, 11:17 p.m. America/New_York (`2026-11-19T04:17:31Z`). This is a dated evidence ledger, not a live dashboard. Refresh the affected entries before relying on them for a release or a current-status answer. See the [maintenance rules](docs/context/MAINTENANCE.md).

## Current intent and evidence boundary

The current owner-directed release focus is a **private adult-only voice pilot**, with the approved **Speak → transcribe → editable draft → explicit Send → reply** flow and a separate Build action. Future features may be developed and reviewed without automatically entering that release. Parent consent collection/storage work is being developed for eventual child use; adult testing is not evidence that child permission or provider privacy requirements have been fulfilled. This scope records the owner's November 18 direction; it does not revoke existing authorized work or require repeated approval of the same action.

The evidence collected for this documentation change is GitHub source, PR metadata and workflow history. No live Cloud Run inventory, provider configuration, paid request or actual-device session was inspected. Accordingly, live activation and end-to-end acceptance remain **unverified here**, rather than asserted enabled or disabled. The approved code path and the current production path can differ.

## Release layers

| Layer | Observed evidence | What the evidence establishes / does not establish |
| --- | --- | --- |
| Public application source | `main` at [`493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`](https://github.com/jzwyrzyk/family-game-factory/commit/493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7) | Includes merged trusted devices, private coach/speech and Game Intelligence. A source baseline, not a production release identifier for every service. |
| Latest successful Pages workflow observed | [Run 44221693458](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44221693458), source `a8f6011226a396f3c060ba2fcaf697c1314b98f0`, started November 17 at 9:13 p.m. America/New_York (`2026-11-18T02:13:49Z`) | Successful workflow deployment evidence for the PR35-era frontend. The workflow history was checked; live browser/API behavior was not re-tested. Later main merges are not proved published by this run. |
| Private worker source | `main` at [`21203a6dcedc19fb18e23795cd9377b20f5f81e3`](https://github.com/family-game-factory-lab/family-game-factory-worker/commit/21203a6dcedc19fb18e23795cd9377b20f5f81e3) | The private workflow repository has its own release lifecycle. It is not advanced by a public application merge. |
| Public source selected by worker main | [`factory-private.yml`](https://github.com/family-game-factory-lab/family-game-factory-worker/blob/21203a6dcedc19fb18e23795cd9377b20f5f81e3/.github/workflows/factory-private.yml) selects `3b5e0a9d8ec48d3a8d27f0be914269ff95cddc75` | Verified configuration in source. Does not prove the workflow/tag selected by a live gateway, nor live generation on that source. |
| Proposed worker integration | [Worker PR13](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/13), open draft; observed head `617e83ad95a51b48aec39154575c534e07e418d9` | Proposes app `493eb9ce`. A proposal and its offline/image evidence are not proof of deployment, activation or real generation. |
| Gateway, preview, private coach and sandbox image | [Architecture and release identities](ARCHITECTURE-CURRENT.md), [private coach runbook](docs/issue-28/CLOUD_RUN_OWNER_PLAN.md), [speech runbook](docs/issue-28/PRIVATE_SPEECH_RELEASE.md) | Source/runbooks exist. Exact currently deployed revisions, image digests, routing, flags and live budgets were not inventoried in this audit. |
| Provider activation and actual-device acceptance | No new live evidence collected in this audit | Verify the scoped adult pilot, provider paths, enrollment/renewal, revoked-device denial, voice fallback, paid duplicate protection and rollback on the actual deployed release. Do not borrow a fixture result for these claims. |

The implementation's defaults and gates can be inspected in source. They are not an inventory of live settings. Keep independently versioned frontend, gateway, preview, coach, worker tag/source and sandbox image evidence together when completing a release.

## Key integrated changes

| Capability | Integration evidence | Remaining evidence boundary |
| --- | --- | --- |
| Trusted browser enrollment, renewal and revocation | [PR42](https://github.com/jzwyrzyk/family-game-factory/pull/42) merged; `5aa4dc68783219e773dc6489c71f548ad4855076` | Real app/API origin and device behavior still require deployment-specific verification. |
| Dedicated private coach and explicit speech composer | [PR36](https://github.com/jzwyrzyk/family-game-factory/pull/36) merged; `a00ecb5d2be16dc07dde082e4bc1852e44330e50` | Merge does not establish service creation, live speech/model availability or consent for a different audience. |
| Game Intelligence contracts, independent authored probes and bounded repair | [PR43](https://github.com/jzwyrzyk/family-game-factory/pull/43) merged; `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7` | [Merge handoff](docs/game-intelligence/merge-handoff.md) identifies unproven arbitrary-idea, live-model, latency/cost and device outcomes. Worker integration is separate. |
| Studio favorites, adaptive learning, approved brand and sticker-first Bubble Gum | Current source; [PR25](https://github.com/jzwyrzyk/family-game-factory/pull/25), [PR34](https://github.com/jzwyrzyk/family-game-factory/pull/34), [PR37](https://github.com/jzwyrzyk/family-game-factory/pull/37), [PR40](https://github.com/jzwyrzyk/family-game-factory/pull/40) | Source features and prior scoped test reports do not prove the latest frontend is live, child enjoyment, learning efficacy or repaired legacy-physics issues. |

## Active work and future work

This is an index of observed open work, not an automatic merge or shipping queue. Recheck each PR's head, base, state and overlap before resuming it. The mutable GitHub item owns its detailed implementation status.

| Work | Observed state / relation to release |
| --- | --- |
| [PR55 consent + adult-pilot integration](https://github.com/jzwyrzyk/family-game-factory/pull/55) | Draft integration work; overlaps [PR52 parent privacy](https://github.com/jzwyrzyk/family-game-factory/pull/52) and [PR53 adult pilot](https://github.com/jzwyrzyk/family-game-factory/pull/53), also drafts. Reconcile their final changes instead of merging duplicate implementations blindly. |
| [PR45 release automation](https://github.com/jzwyrzyk/family-game-factory/pull/45) / [Issue46 next stage](https://github.com/jzwyrzyk/family-game-factory/issues/46) | Draft Pages release foundation; broader cloud/activation/acceptance work tracked separately. This documentation workflow is not deployment automation. |
| [Issue38 reconnect](https://github.com/jzwyrzyk/family-game-factory/issues/38), [Issue41 legacy physics](https://github.com/jzwyrzyk/family-game-factory/issues/41), [Issue47 tablet and school-computer reliability](https://github.com/jzwyrzyk/family-game-factory/issues/47) | Open reliability work; device and live behavior require their own evidence. Source fixes alone do not close an observed production issue. |
| [PR48 archetype foundation](https://github.com/jzwyrzyk/family-game-factory/pull/48) / [Issue49 composition and variety](https://github.com/jzwyrzyk/family-game-factory/issues/49) | Open PR48, not a draft at observation. Research/foundation work and a separate playable-composition/anti-repetition goal; neither label implies production activation or unrestricted coverage. |
| [PR50 fast-edit intelligence](https://github.com/jzwyrzyk/family-game-factory/pull/50) / [Issue51 Studio integration](https://github.com/jzwyrzyk/family-game-factory/issues/51) | Draft; PR50 is stacked on PR48's branch, not main. Timing/coverage goals are targets until measured. |
| [PR54 learning evidence](https://github.com/jzwyrzyk/family-game-factory/pull/54) | Draft research on independent assessment and scoring. Do not report new proficiency or learning-gain claims from current gameplay counts. |
| [PR56 Mind Your Jems](https://github.com/jzwyrzyk/family-game-factory/pull/56), [PR57 Gem Studio](https://github.com/jzwyrzyk/family-game-factory/pull/57) | Open game/visual work; PR56 is non-draft and PR57 draft at observation. Visual parity, interaction and integration acceptance remain scoped to their evidence. |
| [PR23 drawing engine](https://github.com/jzwyrzyk/family-game-factory/pull/23) | Open draft, outside the immediate voice release focus. Preserve drawings/provenance while evaluating later integration. |
| [PR29 safety policy](https://github.com/jzwyrzyk/family-game-factory/pull/29), [PR31 alternate conversation stack](https://github.com/jzwyrzyk/family-game-factory/pull/31) | Open drafts with overlap/supersession concerns. PR36 incorporated selected speech work; it did not approve merging an alternate provider architecture wholesale. |

## How to record the next state

For each changed claim, record **what**, **which repository/commit/image/service**, **environment and audience**, **observation time**, **source link**, **observed result**, and **remaining uncertainty**. For a deployment include the prior working revision/rollback reference. For a test include whether it used fixtures, synthetic real-provider inputs, actual devices, or observed people. Keep private operational/consent evidence in its approved private location and link a safe reference; never copy secrets or child content here.

Use separate terms: **planned**, **implemented on a branch**, **merged**, **deployed to a named environment**, **activated for a named scope**, and **verified for a named criterion**. A green check is evidence only for the check it ran. See [PR template](.github/PULL_REQUEST_TEMPLATE.md) and [maintenance](docs/context/MAINTENANCE.md).
