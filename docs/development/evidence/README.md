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

The current foundation also passed 91 Python environment tests, six JavaScript
browser guard tests, 191 existing production operations tests, actionlint, and
the unchanged regression partition check (40 commands, 26 suites, eight shards).
Terraform 1.9.8 provider validation passed with locked Google/Google Beta 7.46.2;
no authenticated plan or apply ran. The actual fixed Docker image built and its
server imported as a non-root user with networking disabled. These checks do
not establish live federation, deployment, IAP, full TEST or production promotion.
