# Production runner startup timeout repair

## Observed runtime and infrastructure failures

The runner permission correction is active: the owner read serving gateway `factory-gateway-workerpin-ca298998-mwq0ps0k-3f57`, config version `8`, and worker pin `ca2989988fd1cd66d9a858cbf167dd4a995640fc`. Run [44875153976](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44875153976) completed generation and runner preparation, including all seven host-readiness checks. Its technical test reported a rejection and the gateway started automatic repair. The owner's job-state read identified the last stored repair as `runtime-failed` / `GAME_RUNTIME_FAILED` from attempt zero; it did not expose the raw sandbox error.

Repair attempt one, [44875447537](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44875447537), generated an updated candidate. Its first `gcloud compute ssh` host-readiness probe timed out after 40 seconds. The uncaught `subprocess.TimeoutExpired` aborted the retry loop, so the updated candidate was never tested. Both runs completed cleanup with instances, disks and runner registrations verified absent.

## Reviewed and merged correction

[Private PR18](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/18) adds bounded retry of only the startup probe's timeout exception. It retains the 40-attempt cap, caps the complete readiness phase at six minutes using a monotonic clock, caps each probe at 40 seconds and each delay at eight seconds or the remaining budget, and emits a fixed timeout code without exposing the command or captured output. The strict readiness PASS, VM/network verification, JIT ordering and isolation requirements are unchanged. A late PASS is rejected. This bounds the startup phase without extending the gateway's existing 15-minute worker lease.

The correction merged as `dddf53dbc76796be19782c1bb5bbb99b86e99909`, reviewed tree `649b0418884b7236e82a92fdae91ea426867b7e8`. All 175 offline tests passed, including five new startup tests. Both hosted checks passed in [44876365243](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44876365243). No public application source, sandbox image, workflow permission or cleanup behavior changed.

## Production pin switch

The current `rotate_private_worker_pin.mjs` takes `--private-sha dddf53dbc76796be19782c1bb5bbb99b86e99909 --apply`, alongside the unchanged `repair_github_installation.mjs`. The owner receipt below establishes production adoption; the subsequent real game remains unaccepted.

The helper verifies the exact reviewed private tree, main, immutable execution tag, approved variable, installed runner permissions, sandbox image and WIF restrictions. It resolves the actual 100% serving gateway revision and its mounted numeric config version. Only `workerApprovedSha` may change from the current approved pin; the existing App installation, active adult settings, session keys, data, prices and limits remain intact. It verifies the candidate through its own temporary tag before changing production traffic, and preserves every existing WIF condition clause except the exact private SHA.

Thirteen independent mocked scenarios cover successful switching, plan mode, missing grants and identity drift, zero-traffic Retired revisions, ambiguous trust writes, health failures, concurrency, strict stage reuse and safe verification of an already completed release. An already-target invocation makes no writes and reports `ROTATION_STATUS=ALREADY_APPLIED`; it does not claim a historical configuration comparison it did not perform. Incomplete trust changes require resolution before a new build. Old main is never force-restored.

## Owner-observed production adoption

The owner supplied `ROTATION_STATUS=SUCCESS`, with serving revision **`factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f`**, private configuration version **`9`**, and worker SHA **`dddf53dbc76796be19782c1bb5bbb99b86e99909`**. The receipt verified private main/tag/variable/WIF agreement, candidate health through a zero-traffic tag, canonical gateway health with adult execution ready, and removal of the helper's temporary tag.

The full private-config comparison changed only `workerApprovedSha` from the previously observed config `8` / private `ca2989988fd1cd66d9a858cbf167dd4a995640fc`. Gateway App installation `182382304`, session keys, prices, limits, adult restrictions, public application source and sandbox image were preserved. The prior revision `factory-gateway-workerpin-ca298998-mwq0ps0k-3f57` and config `8` remain recorded previous runtime identities; restoring traffic alone cannot establish a coherent worker-trust rollback after main has advanced.

Fresh run [44877085541](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44877085541) at the new private SHA completed generation, preparation and technical-test Actions steps. The owner's later state read identified its candidate rejection as `input-unresponsive` / `INPUT_RESPONSE_FAILED` from attempt zero. Review was skipped; cleanup verified instances, disks and runner registrations absent at `2026-11-21T06:51:02Z`. The successful Actions test step reported a rejected candidate; it did not establish a passing game.

Automatic repair [44877386919](https://github.com/family-game-factory-lab/family-game-factory-worker/actions/runs/44877386919) passed generation and all seven preparation readiness checks, then its test job failed within approximately 0.6 seconds of worker CLI startup at `2026-11-21T06:53:29Z`, with a generic worker-stage failure. Review was skipped. Cleanup verified instances, disks and runner registrations absent by `2026-11-21T06:54:41Z`.

The owner's sanitized state read then confirmed job `1aa04c5b-8095-4c34-97a0-9b5cc14fe21d` was `failed` with **`ADULT_PILOT_ACCESS_REQUIRED`**, at attempt `1`, run `44877386919`, and execution stage still `generate`. The same read verified config `9`, private `dddf53db…`, required quality policy, an absent candidate, and no test/review reports. The original job no longer met the live adult-authorization checks before a successful test-stage claim. This receipt does not distinguish grant expiry, revocation, replacement, or a device/permit change. It also does not show whether the generated repair would have corrected the first candidate's input response.

The interface's `RETRY_LIMIT` came from the separate user retry guard. No automatic attempt two was observed. The earlier game's stored `runtime-failed` / `GAME_RUNTIME_FAILED` rejection does not diagnose this new job. See [delivery state](../../DELIVERY-STATE.md) for the operational checkpoint; no completed quality review or playable-game acceptance is claimed.

## Diagnostic clarification and next acceptance

`inspect_build_status.mjs` prints bounded status fields from the live configuration and durable job state. Its first version compared `qualityRequired` to boolean true, but the source stores the policy string `game-quality-v1`. The boolean display is corrected; the earlier false value is not evidence that production quality policy was disabled. This is a diagnostic-output correction, with no gateway behavior change.

The failed Actions run cannot be rerun under the existing first-attempt-only identity policy. Use the existing profile/unlock flow to establish a fresh adult session, then start an authorized new build with the retained idea. A fresh unlock cannot revive the failed job's original grant; do not reset job, session or ledger state to force progress. Observe successful testing, required quality review, play, edit, Keep and reload. The earlier game's runtime rejection, repaired startup timeout, latest candidate input-response rejection and subsequent adult-authorization interruption remain separate findings. Child paid AI remains disabled, and issue #93 stays open until actual acceptance is observed.
