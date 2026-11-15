# Assignment 002 evidence and gaps

## Executed here

- Existing Factory 2.0 baseline passed before changes.
- Strict TypeScript build and 30 unit/contract tests cover real provider request serialization, strict JSON/source validation, measured pricing, preflight spend cutoff, refusal/disabled approval, repair feedback, source-bound compiled hashes, opaque Actions dispatch, reviewed-tag/SHA drift, signed OIDC issuer/audience/repository/environment/ref/rerun policies, durable stage/run binding, automatic repair, callback replay/staleness, one-use partitioned session and queue expiry.
- Desktop and mobile mocked end-to-end tests exercise the original website → authenticated gateway → mocked Actions dispatch → real Responses adapter code with **fixture HTTP responses** → TypeScript compile/browser test/automatic repair → private source-worker preview → playable input-driven win → five playable requests including a distinct mechanic → keep/undo/fork → reload acknowledged pending job → cancel → reopen saved game. No live inference or actual GitHub worker run is implied.
- Hand-authored fixtures: Moon Hopper (keyboard/touch hopping) and Rainbow Trail (painting with taps). The first deliberately invalid source fails compilation and is repaired. Fixture gate refuses all sources outside the audited hash allowlist. It is under `server/testing` and is excluded from production images; production has no such fallback.
- Browser attack probes verify an infinite module stops without freezing the parent UI; blocked network and DOM access stop safely; no external request is observed and parent DOM access is denied. These test the dedicated-worker/CSP/iframe boundary, not cloud IAM or every browser exploit.
- A real tiny gVisor container ran with `--network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges --memory=64m --pids-limit=16 --user=1000:1000`; `uname -r` returned gVisor `4.4.0`. Image: BusyBox 1.37.0, repository digest `sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec`.
- The full browser worker image built successfully after CA trust and non-root file permission fixes. However, **full browser-container execution is blocked locally** by Docker's VFS copies on the 8 GiB filesystem (`ENOSPC`, while creating the init/rootfs copy). The OCI command/resource policy is tested, but the full gVisor browser smoke is **not claimed passed**. It must pass on the approved ≥20 GiB runner before enabling paid generation. No fallback weakens isolation.

Screenshots captured by the mocked E2E test are `assignment-002-desktop.png` and `assignment-002-mobile.png` in this directory and CI's `browser-evidence` artifact. They show synthetic fixture games only.

## Not executed/activated

No real OpenAI call (no approved key/model budget supplied), no unattended subscription Codex call (entitlement unverified), no real GitHub workflow dispatch (worker workflow must be reviewed/merged and App/runner configured), no Cloud Run/Firestore/Secret Manager/Scheduler deployment or live cloud IAM test. Firestore uses its real SDK transaction adapter but cloud/emulator credentials are not configured in this environment. No source/credential is sent to an unverified endpoint.

No paid service was deployed and no PR was auto-merged. All original playable game, math, profile and local progress keys remain intact. Source-only generated games support bounded canvas commands, built-in controls and emoji/geometry, not arbitrary DOM/HTML, external assets, package installs, drawing upload or universal game genres. Full original-game fidelity and later public-release pipelines remain outside this assignment.

Validation commands: `npm test` (build, typecheck, 30 unit tests, existing regressions, mocked source-generation E2E and worker security probes); `npm run test:sandbox` is conditional on an approved image/runtime and its full-browser result is blocked as stated above. Real-agent smoke remains explicitly skipped under the user instruction to leave paid execution disabled.

Final local validation: `CHROMIUM_PATH=<Playwright 1.56.1 Chromium 141 headless-shell> npm test` exited 0 on 2026-11-15. All 30 unit tests and all five browser suites passed; the live-agent status check explicitly skipped paid execution. The screenshots above were refreshed by this run.
