# Local preview foundation evidence

Observed November 23, 2026, 10:44 p.m. America/New_York (`2026-11-24T03:44Z`).

The [machine receipt](report.json) records **local disconnected browser validation**,
not a hosted or IAP-authenticated preview. A clean application build of main
`28fe3311036f8ef9f3bfc623c522432499c08113` was packaged by the new trusted wrapper.
The displayed PR106 number is a synthetic packaging input; it does not mean
PR106's source was built or deployed. No paid provider or production service was called.

Desktop (1400×960), tablet (820×1180) and phone (390×844) each passed 14 checks,
with zero runtime errors, failed resources or prohibited requests. Checks cover
navigation, menu dismissal, one real playable Factory interaction/recovery,
normal game exit and one synthetic local preference surviving reload.

The first run exposed the environment badge covering the game exit. The wrapper
now reserves a game row for its identity notice. The rerun used ordinary clicks;
no forced click or reduced assertion hid the obstruction. All nine retained PNGs
were captured from disposable synthetic contexts. [Phone game recovery](phone-game-recovery.png)
and [desktop home](desktop-home.png) show the corrected wrapper in context.

The report leaves `completeUatPassed:false`, `privateAccess:local-only-not-proven`
and the full backend/provider/device/owner acceptance gaps explicit. The local
run verified a stable manifest before/after; expected remote manifest pinning is
separately exercised by negative contracts and wired into the trusted workflow.
These captures are simulated viewports, not physical phone/tablet acceptance.

The current foundation also passed 96 Python environment tests, six JavaScript
browser guard tests, 191 existing production operations tests, actionlint, and
the unchanged regression partition check (40 commands, 26 suites, eight shards).
Terraform 1.9.8 provider validation passed with locked Google/Google Beta 7.46.2;
no authenticated plan or apply ran. The actual fixed Docker image built and its
server imported as a non-root user with networking disabled. These checks do
not establish live federation, deployment, IAP, full TEST or production promotion.

## Nonproduction site activation after #230

The protected controller selected the static TEST bundle for main `653a7e56ae05e443af419465be82a13325d9ff9f`, authenticated from GitHub, and reached service inspection. The image, source label, runtime identity, scaling and IAP flag passed. Environment comparison stopped with `RUNTIME_ENVIRONMENT_DRIFT` before the final IAM and browser checks. The run did not capture the live environment entries. [Deployment job](https://github.com/jzwyrzyk/family-game-factory/actions/runs/46104696982/job/140854951803)

Cloud Run v1 defaults an omitted literal environment value to the empty string. TEST sets an empty `JEMS_PR_NUMBER`. The readback accepts a name-only entry for that exact variable on TEST. DEV still requires its numeric PR, and both lanes require the complete expected set of literal entries. The fixture checks omitted values, nulls, other names, nonempty values and secret references. Service-level access and a real browser request still require live evidence. [Cloud Run EnvVar](https://cloud.google.com/run/docs/reference/rest/v1/Container#EnvVar)

The #232 correction passed on protected main `3c064838c8db1c73bb149d506ce9ba76faab22f4`. The controller verified the TEST service, exact image and service-level policies and published revision `jems-test-00002-l27` in the environment directory. Both browser attempts stopped when Playwright closed a context with an authenticated request still in flight. The artifacts contained screenshots but no final report. [Deployment and browser attempts](https://github.com/jzwyrzyk/family-game-factory/actions/runs/46107091422)

The browser verifier now takes the context offline, waits for active route handlers, then closes it. A local Chromium rehearsal held a synthetic authenticated request open during teardown, checked that a second request could not reach the server, and allowed the first handler to finish. The existing TEST build planner requalifies the exact protected source when the deployed browser verifier changes. A completed hosted report is still required for browser acceptance.

The #233 protected run verified the private TEST service and IAP policy at revision `jems-test-00003-frb`. Its receipt was written before retention tagging failed. GitHub skipped browser verification. Cloud SDK 594.0.0's Docker tag shortcut deletes an existing tag before recreating it. The repository writer has tag create, list and update permissions. The controller correction uses package tag updates in place, retains the last published digest for rollback, and reads both pointers back before publishing the directory entry. [Protected run](https://github.com/jzwyrzyk/family-game-factory/actions/runs/46109947905)
