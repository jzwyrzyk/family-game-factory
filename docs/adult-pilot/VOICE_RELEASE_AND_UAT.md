# Jems temporary adult development profile — AI on the current site

**Code integration; deployment and paid-provider acceptance are separate.** This feature uses the existing Jems frontend, gateway, preview service and private AI execution. It does not need another website or an adult-only frontend hostname.

**Scope update, November 20, 2026 (America/New_York):** the separate [DEV workbench](../development/DEV-WORKBENCH.md) now has source support for verified adults exercising both this normal Adult profile and synthetic child-style product paths. Its additional IAP/project/test-grant requirements are described below. They do not change the existing-site production defaults or establish a live DEV deployment.

## The profile switch is the activation

1. On the current Jems site, open **Menu → Grown-ups → Private parent session**. The same entry appears in Parent Settings. It remains visible before character selection and when the workshop is disconnected or private testing is disabled. The optional **Adult (development)** profile choice is still shown only when server status enables it.
2. When locked, enter the existing parent passphrase as part of that switch. The server checks the trusted device and its operator-issued adult permit.
3. A successful switch opens the adult workspace and enables the configured AI conversation, generated-game and private speech capabilities immediately. There is no second activation button. Missing providers or exhausted allowance still produce an honest unavailable state.
4. Switch to a child profile or lock the adult profile to remove this tab's adult access immediately and request server revocation. The session also ends after an absolute maximum of 60 minutes; ordinary trusted-device renewal does not extend it. Returning to adult mode requires a new passphrase unlock.

The access dialog distinguishes missing workshop configuration, browser disconnection, disabled testing, missing/expired device approval, a failed access check and readiness to unlock. After unlock, conversation, game building and private dictation report their own current availability. Rechecking access is read-only; opening the entry cannot enable providers or grant a permit. **Open connection settings** uses the existing guarded parent/settings route and retains a failed-to-save draft.

The adult local profile, notebook and game workspace persist in their own device-bound namespace. Child drafts/history are not copied into the adult AI context. Switching profiles clears the current conversation, microphone capture and outstanding UI callbacks before the other workspace opens. The session proof exists only in memory, so a reload or new tab starts locked. Local profile labels and preferences never grant server access.

This is a temporary development feature. Its feature flag and separate module allow it to be disabled and later removed while preserving the normal profile selector and guardian-consent flow.

## Configuration on the existing services

| Setting | Meaning |
| --- | --- |
| `FACTORY_ADULT_PILOT_MODE=true` | Select the temporary adult-only policy for remote AI admission; default is false. |
| `FACTORY_ADULT_PILOT_OWNER_APPROVED=true` | Owner has approved named adult testing, permitted adult test content and spending. |
| `FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED=true` | The authenticated profile switch and child/adult isolation have been reviewed for this deployment. |

Apply the adult settings to the existing keyless gateway and dedicated private coach runtime. `FACTORY_ADULT_PILOT_PRIVATE_HOST_VERIFIED` is obsolete and does not grant access. The current public GitHub Pages origin is supported, with the normal exact-Origin, credentialed CORS and CSRF checks. Every privileged API request independently proves adult authorization; the profile-access flag is a deployment review record, not a user credential.

Remote AI is adult-only while this mode is enabled. Child profiles keep their local experience and do not inherit paid privileges from a trusted family device or an adult session in another tab. Turning adult mode off returns the backend to the existing guardian-consent policy; it does not approve any child service.

## Enrollment and session contract

The trusted owner first enrolls the device through the existing family-device setup, independently reviews the named adult tester, then runs:

```sh
npm run setup:adult-pilot -- --confirm-adult-owner-review
```

For the exact `FACTORY_ADULT_PILOT_DEVICE_ID`, unlock Parent Controls and inspect the authenticated `GET /v1/devices` response: use the server `id` on the entry marked `current: true` for this device. Approved private datastore tooling is another source. Device names are display labels; do not guess an ID from a name or a local profile.

The command reads `FACTORY_PRIVATE_CONFIG`, `FACTORY_ADULT_PILOT_DEVICE_ID` and `FACTORY_ADULT_PILOT_OWNER_RECEIPT` from the secured operator environment. Optional `FACTORY_ADULT_PILOT_DAYS` defaults to 7 and permits 1–14 days. Both adult-permit setup and guardian verification reuse the configured workspace and optional `artifactBucket`, so existing externally stored game artifacts remain readable during their transactions. The server stores the SHA-256 digest of the external audit reference, family/device binding and expiry. Keep identity documents, passphrases, credentials and raw receipts out of GitHub.

An operator permit makes the device eligible for the adult profile. The passphrase switch creates a separate server-recorded privilege session with a maximum lifetime of 60 minutes, bounded by the current permit/device authorization. API verification requires both the HttpOnly `factory_adult` cookie and a separate `X-Factory-Adult-Session` proof held only in that tab's memory. A child tab sharing the cookie jar has no matching proof. Neither item works without the matching trusted family session and live grant.

The API exposes:

- `GET /v1/sessions/status` for pilot availability and authenticated session state.
- `POST /v1/sessions/adult/unlock` with `parentPassphrase` for the profile switch; existing passphrase throttling applies.
- `POST /v1/sessions/adult/lock` to revoke the privilege session and clear its cookie.

Device revocation, permit expiry/revocation/replacement, session expiry and a confirmed server lock invalidate further paid requests. Family-session refresh never recreates adult privilege. Admission, cached responses, provider completion and asynchronous worker dispatch/claim/report use the live authorization policy. An external call already underway may incur usage; server revocation prevents its result from admitting further work or becoming a newly published game. If the connection is lost during a profile switch, the tab still discards its proof and stops sending adult requests, but the server grant may remain until its absolute expiry. An already-running job remains isolated to the adult workspace.

To revoke the device's adult eligibility from the trusted owner machine, use the same private configuration and device ID:

```sh
npm run setup:adult-pilot -- --revoke
```

## Provider, budget and backend requirements

Conversation still requires `FACTORY_COACH_APPROVED`, `FACTORY_COACH_PRIVACY_APPROVED`, `FACTORY_COACH_SAFEGUARDS_APPROVED`, `FACTORY_COACH_PRIVATE_EXECUTION_APPROVED`, an approved model/snapshot, current reviewed token prices, per-family allowance and the dedicated `FACTORY_COACH_PRIVATE_OPENAI_API_KEY` in the IAM-protected private service. Browser and gateway remain keyless. Adult mode does not assert that provider Zero Data Retention is approved; normal child mode retains its separate verified-ZDR requirement.

Remote Google speech still requires `FACTORY_COACH_AUDIO_APPROVED`, `FACTORY_COACH_AUDIO_PRIVACY_APPROVED`, `FACTORY_COACH_AUDIO_PROVIDER_VERIFIED`, approved project/region, restricted Speech IAM, reviewed data-logging configuration and prices, and browser microphone permission. Adult authority is the permit plus recent session; it is not a fabricated value for `FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED`. Recording starts only on request. **Finish → editable transcript → Send** remains the flow.

Game generation retains private worker source/image pins, WIF identities, gVisor isolation, replay/idempotency controls, approvals and spend reservation. Jobs retain their adult authorization binding so later dispatch and completion cannot borrow an unrelated session. Adult-generated games are separated from child access, including reads and previews. Model, speech and infrastructure spending are reviewed separately.

## The separate DEV workbench

DEV is one shared nonproduction stack with its own GCP project, Firestore workspace, artifact bucket, service identities, secrets, private coach and independently versioned private worker. Explicit `FACTORY_ENVIRONMENT=development` and complete validated `devAccess` must agree; production project identifiers and mixed/incomplete configuration fail closed. Cloud Run checks its actual project metadata before cloud state access. Use the [DEV runbook](../development/DEV-WORKBENCH.md), rather than the existing production bootstrap, for this environment.

The DEV app and browser gateway independently validate Google's signed IAP JWT: exact issuer, ES256 Google keys, exact app-service audience, bounded validity and an operator-confirmed adult allowlist of matching subject/email pairs. IAP authentication does not itself verify age. Browser API calls use the app's same-origin proxy; the gateway's direct origin is reserved as the exact machine callback audience. Preview has its own exact IAP audience and still requires the signed artifact ticket and applicable adult audience. Private coach requests use the separate DEV gateway service account and exact coach audience; browser identity headers are not a substitute.

Selecting **Adult (development)** still requires the ordinary trusted-device permit, passphrase unlock, HttpOnly adult cookie, tab-memory proof and unexpired server session described above. IAP does not create that permit or session. The synthetic child-style profile uses a different server-only test grant, issued only to the configured synthetic family on a live trusted device within verified adult IAP access. That grant binds the adult identity hash, device and policy for at most one hour. It is checked at paid admission, asynchronous execution and completion; a replacement grant cannot revive old pending work or a cached reply from an expired grant. Partial or mixed adult/test authorization is rejected.

This synthetic policy allows an adult to exercise generation, conversation and dictation through the child-style UI. Do not enter real child records or copy production data. It creates no guardian consent, child coach consent, adult-profile permit or ZDR approval, and does not establish readiness to process children's data. Normal provider/privacy/safeguarding approvals and dedicated credentials remain required. Actual Adult-profile work retains its existing audience separation.

All DEV AI capabilities share a durable maximum-cost admission counter. The manifest example sets **5,000,000 micro-USD ($5 total)**, alongside the existing family allowance and per-request caps. Only one paid generation/coach/speech request is active at once. The counter consumes the admitted maximum even on failure, cancellation or uncertain provider response; month changes and renewed grants do not refill it. Crashed/running reservations require explicit reconciliation, with no automatic paid-POST replay. Infrastructure costs are outside this model/speech admission bound.

The implementation has local identity, authorization, budget and routing fixtures; no live project, IAP, paid provider, independent worker or device acceptance is claimed. Native-origin embedded preview access must be tested in the actual authorized adult's browser. Opening the preview host for login is a setup aid, not support for blocked third-party cookies, Safari or incognito. The runbook keeps those live checks separate from source tests and from the existing-site acceptance list below.

## Acceptance on the existing site

1. Run build, unit/security and relevant browser suites at the exact PR commit. Verify child local journeys and parent consent still work.
2. Prove the deployed profile switch: valid unlock enables AI; wrong passphrase, forged profile/proof, missing permit, child tab, device mismatch, expiry, lock and revoked permit do not. Exercise family-session renewal and another tab while adult mode is active.
3. Verify adult work starts separately from child drafts/history. Switch profiles during recording, coaching, generation and preview; late results must not enter the next profile.
4. Use compatible gateway/preview/private-coach images, exact private worker source SHA and pinned gVisor image, correct IAM identity/audience and private backend routing. Retain tested rollback images/configuration.
5. Test real Chrome/Android and Safari/iPadOS microphones: grant/deny, offline/unsupported fallback, short speech, repeated recording, app switch, explicit Send and expiry/revocation during a request.
6. With the approved allowance, run one bounded synthetic provider smoke followed by adult-created content. Complete conversation → build → sandbox test/repair → Play → Keep → reload. Record opaque request IDs and usage totals without transcripts or credentials.

CI demonstrates source behavior with fixtures; it does not establish a deployed provider connection or real-device microphone reliability. The existing site still includes children's experiences. The development profile authorizes named adult development requests and does not confer guardian verification, child provider approval or legal certification.

## Disable and remove

Disable `FACTORY_ADULT_PILOT_MODE` on the gateway and private runtime. Refresh the site, confirm the gated Adult profile choice disappears, the permanent Private parent session entry explains that testing is disabled, and new adult unlocks/paid calls are denied, then stop outstanding adult development jobs. Do not change child approval flags during this rollback. After development ends, remove the dedicated adult profile/session module and permit-specific branches while retaining ordinary profiles, parent consent and trusted-device security tests. Local adult development records should be removed according to the chosen test-data retention policy.
