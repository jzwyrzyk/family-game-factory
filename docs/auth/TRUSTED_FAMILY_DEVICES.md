# jems trusted family devices — P0 session continuity

**Status: draft.** No cloud deployment, payment activation, IAM change or domain switch has been made. This change is for the existing private family workshop, not public-child consent or proof of live AI generation.

## Behavior

- A grown-up connects each browser once using an owner-issued, 10-minute, single-use invitation and a family parent passphrase (12–128 characters). The first device sets the passphrase; future devices require it plus another new invitation.
- Access sessions are valid for 24 hours. A separate Secure, HttpOnly trusted-device cookie renews them automatically while the device remains trusted. Renewal rotates the credential, tolerating a 15-second overlap for parallel tabs. Neither credential nor the passphrase enters localStorage, source code or logs.
- Device trust expires at the earliest of 90 days since last renewal or an absolute 365 days from enrollment. Browser data clearance, deliberate revocation, long inactivity or expiry requires a fresh parent enrollment. Routine weekly use never does.
- Each protected API request checks the device record. Parent revocation stops even an otherwise unexpired access session immediately.
- Parent device management requires a separate 15-minute parent session authorized by the family passphrase. After five failures, management locks for 15 minutes. Parent Controls can list/revoke trusted devices, issue short-lived invitations to connect additional tablets without returning to Cloud Shell, and disconnect the current device **only after the parent's passphrase unlock**.
- Only salted scrypt passphrase hashes and SHA-256 device secret hashes, device names and bounded timestamps persist inside the existing family Firestore workspace. Existing game, learning, saved-version and ledger data are unchanged.

## Gateway API

POST /v1/sessions/enroll — consume a single-use invitation and create a trusted device.
POST /v1/sessions/renew — rotate device credential and issue 24-hour signed access.
GET /v1/sessions/status — verify actual access, not merely public gateway URLs.
POST /v1/devices/unlock — unlock parent device management with passphrase and lockout.
POST /v1/devices/invite — unlocked parent issues a one-use invitation for another device (up to three active invitations).
GET /v1/devices — parent-only inventory.
POST /v1/devices/revoke — parent-only revocation.
POST /v1/devices/disconnect — revoke the currently authenticated device.

Legacy POST /v1/sessions remains available for original seven-day invitations, but **trusted-device invitations are purpose-bound and explicitly rejected by that route**. Existing seven-day sessions still expire, and must be migrated by one explicit new-device enrollment. Version 1 private Firestore documents remain compatible because all new device fields are optional. Existing signing keys must be preserved across Cloud Run revisions.

Browser clients attempt silent renewal only on an HTTP **401 for safe GET**, or during a separate authentication preflight before an intended POST. The preflight must receive HTTP 200 (or successfully renew a 401); missing status endpoints, redirects, 403 and 5xx fail closed. Build and coach reservations recheck trusted-device revocation inside the atomic allowance transaction. They never automatically replay a paid build POST, including after ambiguous connection errors. HTTP 403 is treated as a permission/origin error, not renewable login. Local games, drafts and learning data remain intact during outages.

## Account-owner operations

Run only on an authorized owner machine with existing ADC and FACTORY_PRIVATE_CONFIG pointing to the owner's private config. Never log the invitation in public CI, share it in chat, or use Cloud Run as an admin terminal.

- npm run setup:device — issue a single new 10-minute invite without altering model allowance.
- npm run setup:device -- --revoke=EXACT_DEVICE_UUID — emergency revocation from a separate trusted owner machine.
- npm run setup:device -- --reset-parent-and-revoke-devices --confirm — explicit destructive parent recovery: revoke all devices and remove only the parent verifier before issuing a new invite. Does not reset games, learning, jobs, approval, credits, signing keys or external resources.

Do not use npm run setup:owner solely to obtain an invitation: that older utility also sets family allowance.

## Important browser-domain limitation

The current GitHub Pages app is on jzwyrzyk.github.io; its Cloud Run gateway uses a different run.app site. These are cross-site origins. Secure Partitioned cookies provide useful Chromium behavior but **do not guarantee Safari or stricter-browser authentication**. This PR does not disable browser privacy protections, put durable tokens into JavaScript storage or claim production Safari support.

Before broad release:
1. Choose and configure an approved first-party jems domain, serving the app and gateway on the same site, or implement a reviewed same-origin API proxy. Keep untrusted game previews on an independent origin.
2. Verify explicit CORS origin allowlisting, cookie scope, CSRF boundaries, security headers and session renewal on that domain, without wildcard origins.
3. Back up and safely migrate existing progress. LocalStorage is origin-scoped: games and Math/English history do not move automatically from github.io to a new host. Use the existing export/import and test migration before flipping public links.
4. Run real Android Chrome and iOS Safari renewal/revocation tests, including controlled-time expiry and browser restarts.
5. Complete independent guardian identity/consent, child privacy, provider data and operational risk approval. A parent passphrase alone is **not** proof of verified legal adult identity or COPPA consent.

No DNS, TLS, proxy or GCP resource was changed by this PR.

## Release sequence — not yet authorized

1. Exact-head CI green: app/typecheck, new session security suite, Studio/coach/browser, child, Math and English checks.
2. Record current factory-gateway and factory-preview revisions/image digests, signing secrets, appOrigin, family/workspace, worker pins and active approval switches. Do not reset any.
3. Deploy the reviewed gateway image to the existing service first; validate new API endpoints with existing origin and family data. Old seven-day sessions must remain functional.
4. Owner issues a new invitation, enrolls a test device, verifies restart and renewal, revokes it, and confirms an existing signed session is denied.
5. Publish the compatible frontend via manual Pages release with **both existing gateway_origin and preview_origin populated**, avoiding another accidental disconnected deployment.
6. Validate one authorized real game-build request after separate provider/child approval, including no duplicate charge or lost work. Preserve rollback revisions and prior Pages run.

Keep this PR draft until these gates and device/browser tests are complete.
