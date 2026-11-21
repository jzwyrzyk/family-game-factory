# Working on jems

This is the entry point for people and coding assistants working in this repository. The product is **jems**; the repository retains the Family Game Factory name.

## Start with the right context

At the start of a new task, after a handoff, or after losing conversation context:

1. Read [PRODUCT-DOCTRINE.md](PRODUCT-DOCTRINE.md) for intent and non-negotiables, [ARCHITECTURE-CURRENT.md](ARCHITECTURE-CURRENT.md) for implemented boundaries, and [DELIVERY-STATE.md](DELIVERY-STATE.md) for dated evidence and active work.
2. Use [docs/README.md](docs/README.md) to read the feature contracts and [decision records](docs/decisions/README.md) relevant to this task. Read the actual code and tests before changing behavior. Do not load every historical assignment as current instructions.
3. Verify the current branch, working tree, base/main SHA, related open PRs and dependencies. Work from an isolated branch; preserve concurrent work. For a continued task, inspect what changed since the last verified SHA instead of restarting the entire audit.
4. Establish the requested outcome, applicable invariants, integration points and acceptance evidence. A user-approved plan or release scope is not evidence that its implementation or deployment succeeded.

For child-facing copy, layout, learning cards or spoken output, read [Child interface: clear at six](docs/brand/CHILD_INTERFACE.md). Keep fewer words, readable type, actual-surface contrast and friendly explicit narration; inspect composed mobile help/error states.

For Gem Pal concepts, Base/Grown forms, expressions, art quality, or continuity, start with [Gem Pal Studio](docs/pals/STUDIO.md) and the [repository skill](skills/gem-pal-studio/SKILL.md). Resolve the current character-reference index and exact selected form before image work; do not infer art approval or runtime integration from the method.

For a substantive project answer, consult the applicable references before reasoning from memory. For a development task, apply the same references to implementation, validation and handoff. If repository or live-service access is unavailable, identify the missing evidence and qualify only the affected claims.

## Authority and conflicting evidence

- Current explicit user instructions and existing session authorization determine task scope. Do not invent another approval step for work already authorized. A historical document's old instruction to keep a former PR in draft does not override a later explicit approval.
- Product doctrine and accepted decisions describe intended behavior. Executable source describes implemented behavior. Delivery evidence describes a particular build, environment and observation time. None substitutes for the others.
- A conflict is a documentation or implementation issue to reconcile, not permission to quietly redefine the intent. Record material changes to accepted intent in a decision record with the supporting request/issue/PR.
- Existing assignment reports, test artifacts and release handoffs are historical evidence. Preserve their original scope; link a superseding source instead of rewriting history.
- Do not describe a draft as merged, a merge as deployed, deployment as paid activation, or fixture CI as live-provider/device/child acceptance. Unknown is a valid state. Verify volatile state again before release claims.

## Direct operations within the approved task

For diagnostics, merges or releases, use the authenticated execution tools already available before asking the owner to relay terminal commands. Follow [Direct diagnostic access](docs/operations/ASSISTANT_ACCESS.md) for connection setup and limits. Within the owner's authorized scope, investigate routine failures, prepare permitted fixes and verify the outcome. For a larger in-scope change, give a brief heads-up and continue; do not turn each command into a new approval request. Engage the owner for initial authentication or an actual decision about expanded authority/trust, spending, destructive production data, sensitive-data exposure or product direction. Bring a diagnosis and recommended action when escalating. A configured/merged script is not evidence of a working cloud connection.

## Invariants to preserve

The [doctrine](PRODUCT-DOCTRINE.md) and feature contracts provide the detail. In particular:

- The child owns the idea, experiments and explicit **Keep** decision. Coaching, local editing, generation and public publishing are distinct actions. Unsupported changes stay honest and recoverable.
- Preserve existing games, child-authored drawings, profile boundaries, immutable revisions, undo/fork history, runtime compatibility and parent backups. An older feature branch must not overwrite newer behavior when integrated.
- Keep game difficulty separate from host-owned Math/Language learning. Observed counts, assisted evidence, independent evidence and educational efficacy are different claims.
- Keep browser/gateway/preview free of model secrets. The private generation worker and separately approved private coach have different credential boundaries. Preserve trusted-device checks, transactional spending admission and no automatic replay of uncertain paid POSTs.
- Prefer the simplest game form that preserves the requested actions and consequences. Passing compilation or rendering a themed scene does not establish playable intent fidelity.
- Preserve approved jems assets and touch/mouse/keyboard usability. Real device, visual, gameplay and learning evidence have separate limits.

## Make the change and its references agree

1. Read the affected source, feature contract and relevant decisions; identify overlap with other PRs before editing shared files.
2. Implement the requested change and meaningful validation. Use the relevant existing suites in `package.json`; broaden validation only for a concrete integration risk or required gate.
3. Update the appropriate canonical/feature documents in the same PR. Record why an important choice was made, which alternatives were actually considered, and what would cause reconsideration. Do not invent a decision history.
4. Run `npm run docs:check`. For each affected area, inspect its actual diff, correct the documents or record a specific no-impact rationale with `npm run docs:review -- <area> --outcome updated|unchanged --reason "..."`. Run the check again. Never refresh review records merely to turn a check green.
5. Complete the [PR template](.github/PULL_REQUEST_TEMPLATE.md), including integration, evidence, documentation and remaining release implications. Use exact source SHAs and scoped evidence; keep secrets, private transcripts and child data out of this public repository.

After merge, deployment, activation, rollback or observed acceptance, refresh the affected entries in [DELIVERY-STATE.md](DELIVERY-STATE.md) through the [maintenance process](docs/context/MAINTENANCE.md). Record failures and unknowns as well as successes. Do not silently expand a future research PR into the current release.

## What these instructions can and cannot do

Repository-aware assistants can load this file as their entry point. Ordinary chats do not necessarily read GitHub automatically. [ChatGPT Project instructions](docs/context/CHATGPT-PROJECT-INSTRUCTIONS.md) provide the matching retrieval rule. The checks establish reference coverage and recorded review, not automatic semantic correctness or production readiness.
