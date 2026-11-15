# Assignment 004 — public gateway to private worker bridge

Status: **inactive pull request; no deployed Cloud Run, Firestore, original games, child UI, existing worker tag or credentials modified.**

## Design

The public Family Game Factory remains the user-facing Vite/PWA game app. Signed session authentication, child intent capture, immutable revisions, existing Firestore workspace, budget ledger, compare/undo/fork, private preview and automatic repair continue unchanged.

Dispatch moves to `jzwyrzyk/family-game-factory-worker`, repository ID **1458899834**. The original public code provenance remains `jzwyrzyk/family-game-factory` ID **1458033181** and approved SHA **dcb887e6a51ba000fda1ccc42b9d198f8b9895f9**. The new private execution code has its own reviewed merge commit SHA `P` and an immutable lightweight tag `factory-execution-P`. These two SHA values must **not** be conflated.

Updated gateway fields (optional only while inactive):
```json
{
  "repository": "jzwyrzyk/family-game-factory",
  "repositoryId": "1458033181",
  "workflow": "factory-agent.yml",
  "approvedSha": "dcb887e6a51ba000fda1ccc42b9d198f8b9895f9",
  "workerRepository": "jzwyrzyk/family-game-factory-worker",
  "workerRepositoryId": "1458899834",
  "workerWorkflow": "factory-private.yml",
  "workerApprovedSha": "REPLACE_WITH_REVIEWED_PRIVATE_MERGE_SHA"
}
```

No real secret or other private config field should appear in a commit. The existing `githubInstallationId` may need updating if the GitHub App private-repo installation differs. The GitHub App must have Actions write and Contents read scoped to the **private repository ID**, while the gateway must NOT gain repository runner administration privileges.

`GitHubDispatcher` first confirms the approved private tag points at the exact owner-pinned SHA. It then dispatches a workflow with **only an opaque job ID and bounded attempt index**; no child's text, game source, model key or preview credential is sent as workflow input. Each signed private stage claim/report is verified against issuer, gateway audience, repository name **and ID**, immutable private SHA/tag, private workflow path, environment, event and run attempt. Existing coordinator validates stage/run ID, job attempt, bounded usage, artifact hashes and replay/conflict. The private generation job does not execute model output; the test job receives no model key and executes untrusted game code only inside networkless gVisor Docker. Stage separation preserves existing source/revision and Firestore behavior.

New production activation is refused if private worker configuration is missing. With `active:false`, existing deployed inactive configurations remain compatible. Public `factory-agent.yml` jobs are explicitly disabled in reviewed main. **Owner must also ensure the legacy public workflow cannot be dispatched from the older public approved tag** by keeping the public approval variable false and disabling legacy workflow in GitHub Actions settings before any new activation.

## Offline owner steps, then separately approved deployment

1. Review both draft PRs. Merge only manually after security review. Record final private approved SHA `P`; owner creates/protects a lightweight tag `factory-execution-P` in the **private** repo.
2. The private repo Actions workflow must exist on its default branch. Configure restricted `factory-generation` and `factory-sandbox` environments, no per-game approval reviewers, private worker vars and App installation as described in the private PR's `docs/assignment-004/OWNER.md`.
3. On a trusted owner machine use the EXISTING private gateway JSON file, not a repository file:

```bash
python3 scripts/deployment/private_worker_config.py \
  --input /secure/existing-gateway-config.json \
  --output /secure/inactive-private-worker-config.json \
  --reviewed-private-sha P
```

The output is a separate owner-readable 0600 file, intentionally keeps `active:false` and `approval.enabled:false`, retains all family identifiers, signing keys, credentials, endpoints, existing Firestore workspace and original approved worker SHA. It does **not** update Secret Manager or Cloud Run.
4. After a separate GCP deployment authorization, owner builds/pins an updated **gateway-only** OCI image and creates a new version of the existing private gateway config secret. Redeploys existing `factory-gateway` in **us-east5** retaining service name, origin, service account, Firestore workspace/project, HTTP auth, mounted PEM, scaling limits, active=false and approved image digest. Leave existing preview Cloud Run service, its origin, signing key and Firestore untouched. Do not use older deployment scripts that would regenerate JSON and drop the new fields.
5. Run the private repository's **unpaid** JIT runner smoke. Only when all security controls have passed and paid usage is independently authorized could the owner later activate the private `FACTORY_ACTIONS_APPROVED` variable and gateway paid approvals. These changes are explicitly **not part of Assignment 004's PRs**.

## Acceptance and evidence

- `tests/private-worker-bridge.test.ts` added to `tests/unit.ts`: checks private dispatch destination and opaque inputs, tag drift rejection, legitimate synthetic signed OIDC for both stages, and rejection of incorrect repository/name ID, public repo, wrong SHA/ref/workflow, PR event, rerun and environment.
- Existing `tests/assignment-002.test.ts` covers claim/report stage binding, replay/recovery, ledgers, tagged Actions dispatch (legacy mode), and gVisor argument policies. Existing `npm test` covers old game/revision/browser regressions.
- Private `factory-smoke.yml` includes full `npm run test:sandbox` (previously blocked in 8 GiB environment), `npm test`, browser fixtures, infinite-loop/forbidden network tests, no-egress TCP probe, image digest printout and environment/gVisor checks.
- **All new tests are authored, not executed on owner infrastructure.** No claim of signed *live* gateway callback, cloud permissions, runner registration, GCP deployment or actual gVisor/browser test success until owner produces CI logs. No GCP, GitHub variable, GitHub App installation or secret was mutated.
- Rollback to the prior inactive gateway image and mounted Secret Manager version; no Firestore migration, data clearing, origin change or child UI modifications.

### Stop criteria

Do not enable paid generation if a private repo contributor can schedule arbitrary self-hosted jobs, if runner registration is not one-use/isolated, if tag/workflow can be moved, if OIDC identity is not verified, if cloud metadata credentials exist on the runner, if gVisor full smoke is missing, if source assets could exfiltrate secrets, or if VM cleanup/disk inventory fails.
