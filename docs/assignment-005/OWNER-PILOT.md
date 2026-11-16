# Assignment 005: owner-only real-AI pilot handoff

Companion reviews: [application PR #22](https://github.com/jzwyrzyk/family-game-factory/pull/22) and [private worker PR #11](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/11). Both remain draft. Nothing here authorizes a merge, publication, cloud operation, credential/permission change, deployment, or paid request.

## Release identity and what is implemented

Approved baselines: public `325696e90940e6586b6e15d3c2c24bbb00676a1e`, private `3630a5d99e80efa090ca5c7f2b68ea81f355d0a8`. Integrated executable public source **S = `31f8c463f95260a2b5c64f442a53adfe603a2228`**. The private workflow/readiness/owner-smoke pins all select S. Public follow-up commits containing documentation do not change executable source. P below means the final separately reviewed/merged private main SHA, not a PR head. I means the published immutable sandbox OCI digest, not a local Docker image ID.

The existing v2 generation instructions/schema, Planck physics, parts, joints, movement, collisions, camera and approved art/audio are retained. The worker, preview service and browser all use the same immutable `quality-runtime-v2.0.3` package, hash `247eb42dc3fe9330f904edfc7071a91df562c8b8ad07ffd73db25a0bfc6e7d1d`. Archived v2.0.0–v2.0.2 and v1 rendering remain available for saved games. The frontend's learning-protocol handshake prevents silently using an incompatible math-free preview.

New corrections:

- Package `src/studio/design.ts` in the gateway and its reviewed build context; the merged coach imports it at startup.
- Give only trusted-runtime **directories** `0755` traversal in the sandbox image. Runtime files remain `0644`, and execution remains non-root. Actual local v2 testing caught the previous EACCES failure.
- Include sandbox preflight failure in the existing failure/automatic-repair report. Authenticated, family-authorized browser job polling also advances dispatch recovery and lease expiry after an infrastructure failure. Existing bounded repair, ledger reservations, cancellation and stale-callback controls remain.
- Preserve the existing family/workspace, signing keys, App installation, private-worker pins, storage bucket and scheduler configuration during inactive redeployment. No resets/migrations of children's data are introduced.
- Build the sandbox from committed S only; publication is a separate explicit switch. The existing manual Pages release accepts only public gateway/preview HTTPS origins. Neither operation embeds secrets in the site.
- The free provider entitlement probe runs only in `factory-generation` through the existing allowlisted workflow. It issues GET model metadata; it cannot start generation, infrastructure or paid acceptance. Owner invitation/allowance setup now needs persistence access, not an unrelated App PEM/model key.

The owner experience uses the existing Studio route `?studio=1`: original text ideas, physical v2 games, required grades 1–4 math, experiments, revisions, Compare, Keep, Undo, Fork, save and reopen. Local Socratic/design coaching remains available. The optional **model-backed conversational coach stays disabled** in this pilot: its existing implementation uses a gateway-side model key, contrary to this assignment's generation-environment-only boundary. No model key belongs in Cloud Run, the browser, preview, image, or test runner. A mocked adapter is never a live-AI acceptance result.

## Executed evidence and remaining uncertainty

The accepted GCP infrastructure run [43906247329](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/43906247329) is confirmed successful by GitHub job/step metadata, including no-egress, hostile-code and gameplay/browser steps. It used older public `dcb887e6a51ba000fda1ccc42b9d198f8b9895f9`. Owner-reported smoke/reset/cleanup success is preserved; this session did not provision or re-inventory GCP.

Local updated checks: 147 public unit/contract tests and 14 deployment tests passed; 139 private security tests passed. The v2 physics/audio/desktop/mobile/containment browser suite passed after fixing its focus test to actually move focus out of an off-screen iframe. No pause, isolation or gameplay assertion was removed. An earlier full local run stopped at that assertion; final CI results are recorded in both PRs, not inferred from the partial run.

Gateway, preview and sandbox images were built locally from committed sources using temporary build-only proxy-CA secrets; the tracked Dockerfiles and TLS validation were retained. Gateway module startup/import succeeded without credentials. New v2 sandbox gameplay results and exact image IDs are recorded in PR evidence after verification. These managed-machine tests use a different Docker/gVisor host from GCP and do not replace exact production-digest acceptance.

**Not yet verified:** GHCR anonymous availability of I, the organization's model entitlement/funding, a paid structured-output request, actual current Cloud Run/config/Firestore/App/WIF metadata, production rollout or live automatic repair. This environment has no configured GCP identity/gcloud or generation key. No secret values were fetched. Use existing owner access to inspect metadata; do not recreate resources or repeat completed App/IAM setup without finding an actual missing requirement.

## Model and bounded pilot budget

Use the existing OpenAI Responses transport. Suggested snapshot: `gpt-5.4-mini-2026-03-17`, reasoning `low`. Official [model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini), reviewed November 16, 2026, lists Responses and structured outputs, standard input **$0.75/M**, output **$4.50/M**. No caching discount is assumed. GET model authorization does not prove structured generation or account funding; the first separately authorized paid pilot request proves those.

Suggested inactive private settings, for owner review:

```json
{"active":false,"maxJobMicroUsd":300000,"approval":{"enabled":false,"approvalId":"owner-pilot-005","model":"gpt-5.4-mini-2026-03-17","reasoningEffort":"low","inputUsdPerMillion":0.75,"outputUsdPerMillion":4.5,"maxInputTokens":64000,"maxOutputTokens":8000,"priceReviewedOn":"2026-11-16"}}
```

Merge these settings into the existing private configuration; **never replace the complete config with this fragment**. The larger conservative input bound permits repair/revision of a 30 KB module plus instructions. Each maximum-size request is bounded by $0.084; three attempts fit a $0.30 reservation. Set an initial **$5 model allowance = 5,000,000 micro-USD**. Reservations, usage settlement, unknown-failure charging and two repairs remain enforced. The limit excludes GCP, GitHub Actions and registry costs. Existing monthly allowance renewal and 31-day price review remain deliberate pilot limits; generation stops when they expire. No unattended unlimited-spend promise is made.

## Minimum owner sequence (only after the corresponding authorization)

Use the existing project `family-game-factory-jzw`, services `factory-gateway` / `factory-preview`, existing region, org group 3, App installations and runner checksum. Save current Cloud Run revision names/image digests and private secret version numbers before changing anything. Read-only service listing discovers the existing region/URLs:

```sh
gcloud run services list --project family-game-factory-jzw
gh variable list --repo family-game-factory-lab/family-game-factory-worker
```

Do not paste private config, tokens, keys, invitations or signed preview URLs into public logs/chat. All commands below are instructions, not operations performed by this task.

1. **Review both drafts and authorize merges.** Keep S as the explicit worker source, select final private P, and verify `main`, a new protected `factory-execution-P` tag and `FACTORY_PRIVATE_WORKER_SHA` match. Never move old tags. Before autonomous production, the existing WIF provider's workflow-SHA condition must also match P. No runner-group redesign is required.

2. **Authorize image publication.** From the reviewed public checkout, with existing authorized GHCR Docker access:

```sh
S=31f8c463f95260a2b5c64f442a53adfe603a2228
python3 scripts/deployment/build.py --sandbox --execute --reviewed-source-sha "$S" --publish
```

Omit `--publish` for local build only; omit `--execute` for offline plan. The script prints `ghcr.io/jzwyrzyk/family-game-factory-sandbox@sha256:...` after push/verification. Record it as I. Confirm this package is anonymously pullable; only adjust visibility if needed and separately authorized. The credential-free VM cannot use a private registry login. Nothing is pushed by PR CI.

3. **Authorize one exact-image GCP acceptance.** Configure the existing private `FACTORY_SANDBOX_IMAGE=I`, keep paid approval false, use the existing one-shot smoke authorization and reviewed runner version/checksum. Run from the private checkout at P:

```sh
bash scripts/runner/owner_smoke.sh --approved-private-sha "$P" \
  --restricted-runner-group-id 3 --runner-version 2.338.2 \
  --runner-sha256 "$EXISTING_REVIEWED_RUNNER_TARBALL_SHA256" \
  --production-image "$I" --execute --authorize-billing --trust-reviewed
```

Require complete workflow/gate success and verified VM/disk/runner absence plus smoke reset. Keep the run URL, S, P and exact I. This run now includes v1 and v2 physical construction/suspension fixtures and hostile tests. A source-built pass or a local image ID is insufficient.

4. **Read-only provider entitlement preflight**, while paid approval is still false, using the existing generation-environment key only:

```sh
gh workflow run factory-private.yml --repo family-game-factory-lab/family-game-factory-worker \
  --ref main -f operation=provider-preflight -f job_id=pilot-preflight -f attempt=0 \
  -f model=gpt-5.4-mini-2026-03-17
```

If that environment secret is missing, the owner must separately authorize supplying it there; never put it in another environment to make a check pass. No model request was sent in this development session.

5. **Authorize the compatible inactive rollout.** Build/publish the existing two service images with `python3 scripts/deployment/build.py --region "$REGION" --execute` from S (this legacy services command publishes, unlike sandbox local-build mode). Use their returned immutable image digests. Prepare an inactive private config via `private_worker_config.py` with P and the reviewed budget fragment above, preserving the existing org App installation and all signing/data identity fields. Its `approvedSha=dcb887...` is the retained original public-worker provenance; actual private execution is bound by `workerApprovedSha=P` and the private workflow's source S. Do not blindly rewrite that legacy field.

Update the **existing preview first**, then the existing gateway, using their immutable images. Preserve their current identities, mounts, URL, storage, limits, IAM and prior revisions. Prefer `gcloud run services update ... --image ...` over re-running old bootstrap/IAM setup. If config changes are needed, add a reviewed version of the existing config secret, preserve key mounts, and select that version explicitly. Keep `FACTORY_ACTIONS_APPROVED=false`. Verify both health endpoints and saved v1/v2 preview access. The model key is not part of either service config.

For the authorized config/deploy step, the following uses existing resources only. Set `SECURE` to an owner-private directory, `CURRENT_GATEWAY_CONFIG_VERSION` to the currently mounted numeric version, and use the region/images saved above. `NEW_CONFIG_VERSION` contains only returned version metadata. Inspect the current org App installation once and preserve the already-correct installation ID; fix it only if the existing private config is demonstrably still personal-account scoped.

```sh
umask 077
mkdir -p "$SECURE"
gcloud secrets versions access "$CURRENT_GATEWAY_CONFIG_VERSION" \
  --secret=factory-gateway-private-config --project family-game-factory-jzw > "$SECURE/current.json"
python3 scripts/deployment/private_worker_config.py --input "$SECURE/current.json" \
  --output "$SECURE/inactive.json" --reviewed-private-sha "$P"
python3 - "$SECURE/inactive.json" <<'PY'
import json,sys
p=sys.argv[1]
c=json.load(open(p));c['maxJobMicroUsd']=300000
c['approval'].update(enabled=False,approvalId='owner-pilot-005',model='gpt-5.4-mini-2026-03-17',
 reasoningEffort='low',inputUsdPerMillion=.75,outputUsdPerMillion=4.5,
 maxInputTokens=64000,maxOutputTokens=8000,priceReviewedOn='2026-11-16')
with open(p,'w') as f:json.dump(c,f,indent=2)
PY
NEW_CONFIG_VERSION="$(gcloud secrets versions add factory-gateway-private-config \
  --data-file="$SECURE/inactive.json" --project family-game-factory-jzw --format='value(name)')"
gcloud run services update factory-preview --project family-game-factory-jzw \
  --region "$REGION" --image "$PREVIEW_IMAGE"
gcloud run services update factory-gateway --project family-game-factory-jzw \
  --region "$REGION" --image "$GATEWAY_IMAGE" \
  --update-secrets "/var/run/factory-config/config.json=factory-gateway-private-config:${NEW_CONFIG_VERSION##*/}" \
  --update-env-vars FACTORY_ACTIONS_APPROVED=false
```

Do not run the config block with an expired price-review date. Check the current official model rate before changing that date; do not refresh it automatically to bypass the spending gate.

Publish the matching frontend only after backend verification, with the existing manual Pages workflow:

```sh
gh workflow run pages.yml --repo jzwyrzyk/family-game-factory --ref main \
  -f gateway_origin="$EXISTING_GATEWAY_ORIGIN" -f preview_origin="$EXISTING_PREVIEW_ORIGIN"
```

The public config contains just these origins. Roll out frontend and preview as one compatible release; use Studio at the existing site URL plus `?studio=1`. Save browser progress/export before accepting a reviewed service-worker update; no storage keys are renamed or cleared.

6. **Authorize the $5 owner pilot activation.** Prepare a private config copy with `active:true` and `approval.enabled:true` using the same verified model/rates/P; keep all credentials and identities unchanged. Publish/select its reviewed secret version. Supply the private workflow and existing gateway runtime's separate `FACTORY_ACTIONS_APPROVED=true` switches only at this final authorized stage. Set the family allowance and issue the one-use owner invitation on a trusted existing ADC owner machine:

```sh
FACTORY_PRIVATE_CONFIG=/secure/existing-reviewed-pilot-config.json npm run setup:owner -- 5000000
```

This tool now needs only persistence access and the private family/workspace config; it does not read App PEM/model credentials or run a model. Enter the invitation in Grown-ups connection once. Only that private family can submit/retrieve jobs. Static arcade assets remain public; no general-public AI access is enabled. No GitHub/Cloud Shell action belongs between game creations.

For that separately approved activation, make the active private copy without printing its contents, publish/select its version as above, then enable the two existing switches:

```sh
python3 - "$SECURE/inactive.json" "$SECURE/active.json" <<'PY'
import json,os,sys
c=json.load(open(sys.argv[1]));c['active']=True;c['approval']['enabled']=True
with os.fdopen(os.open(sys.argv[2],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump(c,f,indent=2)
PY
ACTIVE_VERSION="$(gcloud secrets versions add factory-gateway-private-config \
  --data-file="$SECURE/active.json" --project family-game-factory-jzw --format='value(name)')"
gcloud run services update factory-gateway --project family-game-factory-jzw --region "$REGION" \
  --update-secrets "/var/run/factory-config/config.json=factory-gateway-private-config:${ACTIVE_VERSION##*/}" \
  --update-env-vars FACTORY_ACTIONS_APPROVED=true
gh variable set FACTORY_ACTIONS_APPROVED --body true --repo family-game-factory-lab/family-game-factory-worker
FACTORY_PRIVATE_CONFIG="$SECURE/active.json" npm run setup:owner -- 5000000
```

These are activation instructions only. All approval switches remained untouched/false during development. Keep `FACTORY_COACH_APPROVED` disabled; this sequence does not configure a gateway model key.

## First genuine owner acceptance and measurements

Open Studio, connect once, then say **“Make a game where a cat eats donuts on the moon.”** Require a real paid job/usage receipt, generated v2 source, sandbox testing and a playable result. Inspect whether movement, gravity, donut pickup, goal and controls match the request rather than accepting an attractive animated scene. Use game Help for controls. If it fails, verify automatic repair (at most two) or a truthful terminal error and retained prior game.

Make three successive experiments: lower gravity and bigger jumps; add moving donuts and a gentle setback; change the goal or invent a new action. Play each, Compare, Keep, Undo, Fork, save with a name and reopen after reload. Keep a construction concept too: **“Build a moon delivery cart from junk parts, with springy wheels and a fan. Let me test and improve it.”** Verify actual contacts/joints/forces and meaningful held/touch input.

Keep play active through a math checkpoint (the default safe checkpoint is around 90 active seconds), try a wrong answer and hint, then solve/continue; confirm paused simulation, cleared held input and preserved grade/profile evidence. Ask the local design coach what to try, make an independent prediction and compare outcomes. It should prompt discovery, not automatically solve the construction task. Validate saved experiments and math state after reload and a browser restart. Start with a browser supporting the existing partitioned session-cookie flow; validate the owner's actual browser before promising cross-browser access.

For each job record wall-clock submit→ready time, opaque job/Actions run IDs, attempts and `usageUnits / 1,000,000` from the private ledger, actual play match, revisions/reload results and cleanup status. Reconcile infrastructure cost from actual VM/disk lifetimes and the owner's billing rates; model allowance is not a VM-cost cap. Do not invent these measurements from synthetic tests. Test cancellation and a deliberate invalid-build/repair case within the same approved allowance.

## Known limits and rollback

Highest impact: exact new-image cloud acceptance, real provider entitlement/paid output, hosted WIF/App callbacks and owner-browser session must still pass. The source and tests are prepared, not an activated/live-AI claim. Infrastructure bootstrap can add minutes per attempt; real timing and failure rate must be measured. Art is bounded catalogue/primitives, no external assets/imports/DOM, no arbitrary drawing-to-rig conversion or guaranteed prompt fidelity. The workspace is a bounded Firestore proof-of-concept; keep progress exports and watch capacity. Budget/price expiry needs periodic owner renewal. Optional model-backed conversational coaching is not activated; the implemented local Socratic workflow is retained.

Fast stop: set private `FACTORY_ACTIONS_APPROVED=false` and the existing gateway runtime switch false; disable the family's paid allowance if necessary. Cancel active jobs through the app and allow existing hosted cleanup to finish. Already-running requests may consume their reservation; verify resource absence before declaring spend stopped. Keep generation key removal/revocation as an owner emergency action only if warranted. These switches do not delete games, learning history, revisions, buckets, services or secrets.

For a bad rollout, route traffic back to the **saved prior gateway/preview revision names** with `gcloud run services update-traffic SERVICE --region "$REGION" --to-revisions=PRIOR_REVISION=100`; restore the matching prior Pages commit through its reviewed manual release. Leave new generation disabled. Retain prior config secret versions and immutable runtime archives; never restore Firestore by overwriting current family state just to roll back code.
