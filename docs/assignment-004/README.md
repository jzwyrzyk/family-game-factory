# Assignment 004 — owner-controlled isolated runner

Status: **PR only; no VM, runner, billed service, credentials, paid generation or workflow run created by this assignment.** Never set `FACTORY_ACTIONS_APPROVED=true` here.

## Frozen trust anchors
- Repository: `jzwyrzyk/family-game-factory` (public); worker commit `dcb887e6a51ba000fda1ccc42b9d198f8b9895f9`.
- Approved worker tag: `factory-worker-dcb887e6a51ba000fda1ccc42b9d198f8b9895f9` (do not recreate, move or overwrite).
- Existing project `family-game-factory-jzw`, region `us-east5`, existing Cloud Run gateway and preview: **do not change**.
- `FACTORY_ACTIONS_APPROVED` must remain false. `FACTORY_RUNNER_SMOKE_APPROVED` is a separate, owner-only testing switch, initially unset.

## Important security limitation (blocking production registration)

**This is a public repository owned by a personal account. A plain repository self-hosted runner label is not a security boundary.** Any workflow that gains execution privileges on the repository could target `[self-hosted, factory-isolated]` and gain host/Docker access. A gVisor container cannot protect a compromised runner host. A runner created before proving workflow restrictions is unsafe.

Consequently this PR **does not automatically register a GitHub runner**. Before registration the owner/security reviewer must confirm every available workflow and branch protection, determine whether the account/organization supports a runner group **restricted to the exact approved workflow**, and prove that untrusted PR/fork/branch workflows cannot schedule the runner. If not possible for this public personal repository, use a separately controlled **private worker repository / organization** with restricted runner-group workflow access, and a reviewed dispatch bridge. Do not bypass the isolation gate with the `--runner-isolation-reviewed` argument; that flag records the result of a *real* external review.

The existing `factory-agent.yml` has a reviewed-tag + approval gate but its `test` job's runner label alone does **not** make the runner safe against other workflows. Also audit repository-wide secrets, OIDC grants, token scopes, and Actions configuration. Disable actions on forks from targeting self-hosted runners; trust no PR code, including `pull_request_target` checkout.

## Plan without spend

From an owner-controlled machine with Python 3:

```sh
python3 scripts/runner/runnerctl.py plan
python3 -m py_compile scripts/runner/runnerctl.py
```

The JSON plan names only a **new** `factory-004-ephemeral` instance in `us-east5-a`, `e2-standard-4` Spot with a 40 GB `pd-balanced` boot disk (at least 20 GiB *free* Docker storage is verified at bootstrap), no external IP, no attached service account or OAuth scopes, max runtime 90 minutes and automatic deletion on termination. It does not provision a new VPC, NAT, firewall, registry, Cloud Run service, model key, or secret. Private subnet egress for apt/GitHub and owner IAP access must already be available/approved. VM startup scripts are retrieved via GCE metadata; **do not put tokens in startup metadata**.

## Explicitly authorized lifecycle (owner executes later)

1. Review current GCP pricing, available CPU quota, image, bootstrap dependencies and trust-boundary report. Verify cost alerts/quotas (alerts are not hard caps), VM creation permissions, network egress, IAP/firewall, and that **only** the dedicated runner can access its host Docker socket.
2. Verify worker tag target equals the approved SHA and protect the tag. Review all repository workflows and secure runner isolation independently. Do not enable paid generation.
3. **Only after explicit billing authorization**, run:

```sh
python3 scripts/runner/runnerctl.py provision --authorize-billing --trusted-workflows-reviewed --runner-isolation-reviewed
```

4. Read startup logs without exposing secrets. Bootstrap installs Docker + gVisor via official signed apt repository, checks `runsc`, `overlay2`, >=20 GiB available Docker storage and absent cloud service account. Fail closed if any condition fails. Review gVisor binary/package version for production pinning. No GitHub registration happens in this phase.
5. Only if verified runner group restrictions are available, have the owner issue a **one-use JIT runner config** using GitHub's `POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig` with `Administration:write`, `factory-isolated` label, and a group restricted to reviewed factory workflows. Transfer the JIT config through a secure owner-to-VM channel, **not through image layers, GCE metadata, logs, workflow inputs or repository files**. Download a checksum-verified pinned GitHub Actions runner binary on the VM, configure it with `--jitconfig` and start one job. Register it as ephemeral; destroy the instance immediately after its first job. The JIT config is a credential and must be deleted securely after use. This secure registration/transport is **not automated in this PR**.
6. Following review/merge, an owner can enable **only** repository variable `FACTORY_RUNNER_SMOKE_APPROVED=true` and manually dispatch `factory-runner-smoke.yml` from the *reviewed main branch*. It checks out the **frozen approved worker tag**, verifies the full SHA, builds the sandbox image and runs `npm run test:sandbox` + normal browser regressions. Never use the paid-generation approval variable for this.
7. Confirm logs: both fixture games compile and win on desktop/mobile; replay and parent iframe isolation pass; infinite loop and network API attacks fail; no sandbox egress; runsc/readonly/network-none policy applies. Verify the workflow has no secret exports, no provider call and no public source artifacts. Inspect job exit status; record artifact image SHA, runner version and disk space manually.
8. Always remove instance and check for stray disks, images and runner registrations:

```sh
python3 scripts/runner/runnerctl.py teardown --delete-confirm factory-004-ephemeral
```

The script's 90-minute VM runtime limit is **not** a guarantee of zero leaked cloud charges. Spot termination may interrupt tests. The repo owner must verify final cloud inventory.

## Evidence, explicitly separated

**Previously verified (Assignment 002):** mocked desktop/mobile game fixtures, hostile browser probes, tiny gVisor runtime, Docker arguments. See `docs/assignment-002/evidence.md`.

**Not verified in Assignment 004:** a real >=20 GiB runner, its gVisor full browser-container image, hostile rejection inside that exact runner, GitHub JIT/restricted runner group, real Actions workflow, GCP billing changes, live egress/metadata isolation. All require approved owner execution and recorded test logs. No evidence is invented.

## Planning costs (not a quote)

Official Google Spot pricing lists `e2-standard-4` near **$0.080424/hour** in us-east5. A 90-minute ceiling implies roughly **$0.121 for CPU/RAM** before attached disk, network, image storage, tax or minimum billing rules. A 40-GB balanced persistent disk has additional prorated cost; check current `us-east5` price and whether it persists after termination. At 10 runs of 30 minutes each, Spot compute is approximately **$0.40**, plus disks/network. Spot is interruptible; retry costs may increase. Cloud Run existing request-billed charges and GitHub plan charges are separate; model spend remains **$0** while inactive. **No complete dollar hard cap is guaranteed** by the 90-minute timeout or budget alerts.

Sources: https://gvisor.dev/docs/user_guide/install/ ; https://docs.github.com/en/rest/actions/self-hosted-runners ; https://cloud.google.com/spot-vms/pricing .

## Acceptance blockers before paid use
- [ ] Owner-reviewed runner workflow isolation mechanism, or a separate private worker repository
- [ ] Secure JIT registration, pinned binary and cleanup automation completed
- [ ] Existing trusted worker tag verified and protected
- [ ] Real sandbox image digest recorded, >=20 GiB free and overlay2 verified
- [ ] Full fixture/browser/hostile/no-egress tests actually passed on isolated gVisor runner
- [ ] Cloud metadata and credential isolation proven
- [ ] Runner/VM destruction and absence of stray billable resources verified
- [ ] Owner authorizes any future paid model rollout separately
