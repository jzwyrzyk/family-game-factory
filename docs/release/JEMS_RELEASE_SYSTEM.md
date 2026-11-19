# Jems controlled release — operator runbook

## Product promise

When the owner says "Ship Jems to production", completion should mean exact code,
reviewed cloud service images, a verified live website, approved inference availability
and production acceptance—not merely a merged pull request. Any failed or unapproved
gate must be reported as blocked, with no invented success or silent spending.

**This PR delivers Stage 1: a real read-only release plan and a separately
authorized Pages-only deployment/verification workflow.** The Cloud Run image update
and first paid-AI activation lanes are intentionally NOT live.

## Current architecture

- App: jzwyrzyk/family-game-factory, GitHub Actions, static GitHub Pages.
- Existing services: factory-gateway and factory-preview on Cloud Run, with
  Firestore family workspace, private worker trust and approved immutable images.
- Game generation: private worker with budget reservation and separate approval.
- Conversational coach: proposed dedicated keyless private Cloud Run bridge in #36.
- Existing manual Pages deployment: .github/workflows/pages.yml.
- Existing service build tool: scripts/deployment/build.py, source-SHA pinned.
- **Do not use scripts/deployment/deploy.py for routine releases**: it is an
  inactive bootstrap tool that resets activation settings.

## What is built in this PR

### Offline plan (default)

The new **Jems controlled release** GitHub Actions workflow creates a read-only
plan on main pushes, with no production mutation. It verifies the exact main SHA
and lists blockers and current capability. A JSON evidence artifact is retained.

### Real Pages-only release (explicit)

Before the first release, the owner must pin the two **existing, reviewed**
public HTTPS service origins in GitHub repository Actions variables:
JEMS_GATEWAY_ORIGIN and JEMS_PREVIEW_ORIGIN. Release callers cannot override
these destinations with arbitrary workflow inputs.

After the PR is merged, go to GitHub > Actions > Jems controlled release >
Run workflow. Select the main branch and operation **pages**, and supply the exact
40-character main commit SHA. No cloud credentials or URLs need to be pasted
into each subsequent release request.

The workflow will:
1. Refuse stale or unreviewed commit SHA and incomplete/malformed origins.
2. Run npm test, Playwright and visual evidence at that exact source commit.
3. Probe the existing gateway and preview /health endpoints without paid calls.
4. Publish the matching site through the github-pages environment.
5. Embed a public jems-release.json marker with the exact source SHA.
6. Fetch the published release marker and factory-config.json and verify both
   match the approved SHA and exact service origins; recheck both health endpoints.
7. Open the actual deployed website in fresh desktop/mobile Chromium contexts:
   require Jems Studio startup, six favorites, approved logo/assets and one
   working LOCAL Moon favorite. Fail on JS exceptions, missing site assets, or
   any attempt to send a paid job/coach POST. Capture screenshots and machine-
   readable smoke evidence; no parent credentials or child data are required.
8. Store evidence. Report PAGES_AND_PUBLIC_HEALTH_VERIFIED only when all pass.

This **does not** deploy backend images or prove paid provider inference works.
The legacy manual pages.yml stays available as an emergency **publication
fallback**, but it builds the current main source and therefore is NOT a
version rollback. A proper code rollback requires a reviewed revert to a
known-good main state, rerunning validation, and republishing—or a separately
implemented immutable prior-artifact restore. Record the previous reviewed
release SHA and its known-good service origins before publishing. Both Pages
deployment paths share a concurrency group; avoid intentionally launching
competing releases.

### Optional Pages auto-release on each merge

After a first real Pages-only release and device test, the owner may set these
GitHub repository **Actions variables**:
- JEMS_GATEWAY_ORIGIN: reviewed current HTTPS gateway URL, without path
- JEMS_PREVIEW_ORIGIN: reviewed separate HTTPS preview URL
- JEMS_AUTODEPLOY_PAGES: literal true (only after explicit owner opt-in)

With that opt-in, ONLY commits containing presentation-only changes
(reviewed static images/brand CSS, HTML, manifest or documentation) can
publish automatically. The controller fails closed when a change includes
server endpoints, Studio/build JavaScript, dependencies, release workflow,
learning logic or other application code. These require a coordinated
backend/frontend release under Stage 2.

Until the opt-in, main pushes generate plans only. Configure github-pages
environment reviewers if another approval step is desired. Automatic Pages
does not authorize automatic paid inference or cloud admin privileges.

## Stage 2 — full backend deployment (next integration PR)

Before enabling a full-release lane, the owner must approve one dedicated,
least-privilege Google Workload Identity Federation release provider and service
account, bound to this repo's protected main release workflow. NEVER broaden the
private-generation worker's WIF or expose provider API keys in Actions.

Required release transaction:
1. Lock the release; verify full main commit, CI, child/privacy approvals and budget.
2. Capture current serving Cloud Run revisions, traffic, immutable image digests,
   the reviewed secret-version metadata and prior Pages release for rollback.
3. Use the existing Cloud Build script to build gateway and preview from the exact
   source SHA, verify immutable Artifact Registry digests, not mutable image tags.
4. Update the **existing preview first**, then **existing gateway** with image-only
   compatible updates. Preserve service identities, runtime keys, private worker
   pins, family Firestore data, environment variables, signing keys and secrets.
5. Verify health, game isolation, parent sessions and the resulting new revisions.
6. Deploy matching Pages artifact and check its exact marker, config and URLs.
7. Roll back saved serving revisions and site artifact if new deployment fails,
   without overwriting family data.

No script in this PR performs those cloud mutations. The release identity,
current region, networking and costs must be verified before adding the job.

## Stage 3 — paid AI acceptance, not merely deployment

A normal release should retain previously approved paid-model configuration;
it must not silently enable, reset or change billing/permission switches.
For first activation or changes to provider, model, child data, spending,
secret versions or trust, obtain a separate explicit owner approval.

Activation prerequisites:
- Private-generation worker and separately planned coach inference service
  have verified runtime identities and secure network routing.
- Under-13/privacy/retention/guardian controls and relevant approvals are
  documented for the exact provider and endpoints.
- Dedicated credentials are mounted only in approved secret stores/runtime,
  never in frontend code or GitHub Actions logs.
- Small capped family allowance and emergency stop are verified.
- One authorized REAL paid synthetic build confirms provider reply, ledger
  receipt, sandboxed playable outcome, retries and no duplicate charge.
- Separate real Android Chrome and iOS Safari parent enrollment, renewal,
  revocation, saved progress and Math/English UAT are completed.

The current github.io and run.app sites are cross-site. Before promising silent
authentication across real browsers, verify Safari or use an approved first-party
site/proxy with a tested origin-scoped local-save export/import and rollback.

## What you will need to do once

1. Review/merge this release-foundation PR and choose reviewed gateway/preview URLs.
2. Run a controlled Pages-only release in GitHub Actions, validate the site and
   actual family devices; then optionally enable Pages auto-release.
3. Review GCP region, existing Cloud Run revisions, identity, secrets, network,
   spending caps and privacy approval. Separately provision tightly scoped cloud
   release authorization before the backend lane is implemented.
4. Authorize the first paid AI smoke only after the required child-data and
   provider safeguards are verified.

The current connected GitHub operations can edit and merge code but do not expose
a GitHub workflow dispatch or Google Cloud administration action. Initially use
the GitHub Actions Run workflow control or the explicit opt-in auto-release;
no credentials need to be pasted into ChatGPT.

## Release evidence truth table

| State | Verified | Not implied |
|---|---|---|
| CODE_MERGED | Commit in main | Deployment |
| READ_ONLY_PLAN | Source reviewed; blockers recorded | Any mutation |
| PAGES_AND_PUBLIC_HEALTH_VERIFIED | Exact static site and public health | Live paid AI, authenticated game play |
| BACKEND_AND_PAGES_VERIFIED | Future immutable Cloud Run and Pages check | Paid provider response |
| PAID_AI_VERIFIED | Future real receipt and playable paid build | Family UAT |
| FAMILY_UAT_ACCEPTED | Real child/parent device tests | Public rollout/legal approval |

Never report the next state based only on a successful earlier stage.
