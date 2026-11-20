# Optional Jems product analytics pilot

**Accepted scope:** November 19, 2026 (America/New_York). The owner approved proceeding with the PostHog pilot for first creation and original-art reuse. [The decision](../decisions/2026-11-19-optional-product-analytics.md) records that scope. Implementation and tests do not establish a live PostHog connection, deployment, current guardian permission, or observed child outcomes. See [delivery state](../../DELIVERY-STATE.md).

The pilot asks whether a captured generated creation reaches a real play start, where accepted builds stop, and whether an original drawing enters another saved game within seven days. [Dashboard definitions and setup](dashboard.md) give the exact denominators and interpretation limits. Product usage is separate from the local learning evidence, making ranks and rewards; it never awards credit or changes the child's experience.

Coverage is the primary Studio journey, Art Studio and Create & code. The retained legacy arcade builder has the shared configuration/permission UI but no creation/play hooks in this pilot. Its uninstrumented activity is not a dropout cohort.

## Permission and data boundary

Collection is disabled unless both the public browser switch and the gateway configuration are enabled. There is no PostHog browser SDK, autocapture, pageview tracking, session replay, analytics cookie, persistent browser analytics queue, offline retry or automatic historical backfill. Existing AI, generation and speech choices do not authorize product analytics.

The **Grown-ups → Settings → Help improve Jems** panel presents a separate choice. A family request requires parent-management unlock, acknowledgment and a guardian assertion, then remains pending until the operator records independently verified guardian evidence for this exact analytics notice and choice. The family permission expires no later than 90 days after the request and stops if its verifying device is revoked or expires. The server still checks the requesting device on every observation. Browser acknowledgment alone cannot enable child reporting.

An authenticated Adult development profile can opt in for its **current grant only**. Switching away, locking, expiry or a new unlock ends that choice. A later adult session needs another explicit analytics choice, even on the same device/profile. Adult identity and child profiles have separate namespaces and dashboards.

The browser sends only allowlisted actions and opaque local references to the existing authenticated gateway. The gateway verifies current permission and replaces every exported profile, creation, game, revision, job, asset and event identifier with a purpose-scoped HMAC. The profile pseudonym includes the verified device ID as well as family, audience and local owner ID, so default names such as `player1` on two devices cannot be conflated. These are profiles on trusted devices, not people linked across devices. Child profile identity remains an assertion of the local workspace, not verification of a person's age or identity.

PostHog receives no names, nicknames, game titles, prompts, chat, answers, images, audio, drawing hashes, private URLs, browser IP, browser user agent or referrer. The server relay sets `$process_person_profile=false`, `$geoip_disable=true` and `$ip=null`; it forwards no request cookies or headers. HMAC references remain pseudonymous usage data, not a claim of anonymity. The PostHog region, account access, retention and deletion process require configuration in the selected project before collection begins.

## Event contract

The strict shared schema is [contract.ts](../../src/analytics/contract.ts). Version 1 has eight event names; browser attempts to send server-only outcomes or extra/free-text fields are rejected.

| Event | Authority and boundary |
| --- | --- |
| `jems_journey_started` | Client: a new Studio idea is durably created. Local scene/native art entries use their own creation mode; only generated starts enter the generated funnel. Reopening existing work is excluded. |
| `jems_creation_submitted` | Server: a new accepted job is bound to the supplied current choice and local creation. No acceptance means no submission event. |
| `jems_creation_completed` | Server: the bound job reaches Ready with its retained authorized revision. This is technical completion, separate from actual play or quality judged by a person. |
| `jems_creation_failed` | Server: a bound job fails or is cancelled. Exports one fixed category, never raw error text. |
| `jems_game_play_started` | Client: one actual launch per mounted game. Generated playback waits for the trusted renderer's validated running frame, native Rally waits for Drive after artwork/host gates, and scenes wait for successful engine start. |
| `jems_art_saved` | Client: a new original drawing commits to IndexedDB. Derivative saves, restore and import do not produce another origin event. |
| `jems_asset_added_to_game` | Client: an explicit original/derivative use commits to a saved native game or scene revision. An intentional copy creates another stable game identity; unsaved drafts and supplementary index repair do not qualify. |
| `jems_game_revision_played` | Client: a qualifying revised result is launched, using the actual candidate/saved revision identity. It is an observation, not evidence of improved quality or learning. |

Client fields are schema version, event name, event UUID, choice UUID, owner and creation references, and optional game/revision/job/asset references, bounded creation mode and surface. The current choice is pinned to each observation and build context. The gateway adds server time, environment, release SHA, audience, source, and—where authoritative—build adapter, bounded duration or failure category. The browser cannot set timestamps, duration, failure details, release, audience or server source.

`creation_id` follows one Studio notebook through attempts. `job_id` identifies an accepted attempt. Generated play is accepted only against an authorized retained job and the exact bound creation, game and revision. `game_id` is a stable project, not a revision. Art uses its oldest validated original identity through immutable derivative links; corrupt/missing/foreign lineage suppresses the optional observation. No picture bytes or hashes are exported.

An art-play report requires the exact game and revision that received the binding. Later revisions retaining the artwork are a known undercount unless an explicit binding was captured for that revision. Imports, restores, crashes, historical work and lost telemetry are not reconstructed.

## Play signal and runtime compatibility

Readiness only means that a preview can offer Start. It does not complete the play funnel. The trusted preview adds `play-started` to the existing protocol 1 after validated initialization/running output. The host checks iframe source, channel, artifact, owner, protocol, round and learning state. Analytics callback failure cannot affect the host or game.

New v2 builds use immutable **`quality-runtime-v2.1.1`**, SHA-256 `7f0de54d4c30aa6e026f9bcc29bffd0e911069b70c8b73686a9ecf23ffd58a5c`. Previous archives remain unchanged and playable. Saved v2.1.0 output does not gain a retroactive start signal; absent play evidence on an old runtime is not abandonment. The trusted v1 and declarative renderers also emit after actual initialization.

The new default is an integration dependency: the gateway, preview service, private worker and sandbox must agree on the reviewed archive when accepting new v2 builds. A mixed old worker/new gateway can reject the runtime attestation. Follow the existing reviewed-source/image/worker release process; this analytics change does not authorize or perform a deployment or repin.

## Delivery, limits and stopping

The browser uses direct credentialed requests to the same gateway, with a 1.5-second timeout, no auth renewal and no retry. It holds at most 20 observations until a microtask flush. Profile changes clear the queue and cancel pending requests; failed withdrawal pauses the current tab through automatic status refresh until an explicit choice action resumes it.

The gateway's existing durable repository holds a bounded outbox. At the existing Firestore workspace size limit, it discards only pending analytics, job bindings and duplicate receipts before serializing the already encoded state again. Saved games, core state and consent choices are preserved; the core callback and artifact uploads are not repeated. Core plus consent records still obey the existing workspace capacity limit. Server outcome observations are enqueued in the transaction that observes the terminal transition; a separate sender performs the network call. Each outgoing event has a deterministic scoped UUID for deduplication. A failed network call may be retried from this outbox without replaying a build, model call or child action.

The analytics collector and authenticated scheduler await one bounded drain before ending their response, so request-billed hosting can complete it. Core game responses do not wait for PostHog; their post-response drain is opportunistic. Without later collector/scheduler activity, pending data can expire. A scheduler failure cannot authorize replay of a paid action.

| Bound | Current value |
| --- | --- |
| Client batch | 20 events; excess dropped |
| Gateway outbox | 256 events; 30-minute age limit |
| Accepted-job correlation | 512 bindings; at most 8 days, shortened by consent/grant validity |
| Duplicate receipts | 2,048 records; 24-hour age limit |
| Device admission | 120 enqueued events per minute |
| Export | Up to 20 events per drain; 1.5-second network deadline |
| Consent history | At most 300 requests in the private workspace; no automatic archival |

Expiry cleanup is opportunistic on later activity, not a guaranteed wall-clock deletion service. Events are rechecked against their original current choice and active device/grant immediately before export. Withdrawal or replacement removes pending observations and job bindings. It cannot retract a network request already sent or delete history already held by PostHog.

For a deletion request, stop the applicable reporting scope first, identify the scoped exported profile(s) in the operator's private environment, apply the selected project's supported data-deletion process and verify completion. Never copy raw identities or HMAC secrets into this public repository. No downstream erasure tool or confirmed retention policy is claimed by this PR. Do not enable collection until the operator can fulfill that process.

Reporting is best effort: bounded queues, workspace capacity pressure, timeouts, privacy changes, outages and immutable older runtimes can lose evidence. The collector’s `accepted` count describes observations admitted before capacity handling, not guaranteed retention or PostHog receipt. Capture-quality counts describe received data, not a complete delivery denominator. “No recorded terminal” and “no captured play” remain unknown where evidence is missing.

## Configuration and launch sequence

1. Review the merged Art Studio dependency, this branch and its passing checks. First validate with synthetic adult activity in a staging PostHog project. Connect the PostHog app to the intended project for subsequent analysis; installing an app does not install event capture into Jems.
2. Set the gateway variables below through private operational configuration. The management key for dashboard setup is separate and must never be installed in the browser or gateway. No credential belongs in a public config, repository file, command argument or screenshot.
3. Use the existing coordinated service/worker release process for v2.1.1. Build the browser with `FACTORY_PUBLIC_ANALYTICS_ENABLED=true` only when the intended gateway is configured. The manual Pages workflow exposes this as a false-by-default input. Its public JSON contains a boolean feature switch and existing service URLs only.
4. Complete a fresh Adult session opt-in. Verify one synthetic creation through accepted submission, server terminal, explicit Start and first running frame; verify a new original drawing used in two different saved games. Verify withdrawal prevents further export. Inspect the received allowlist and region before relying on counts.
5. Run the [dashboard bootstrap](dashboard.md) offline, then apply it to the explicitly selected project. Apply preflights all live HogQL queries before definition writes. Mature 24-hour and seven-day reports can be empty initially; use the coverage report to verify ingestion.
6. Child collection additionally requires the separate family choice, independent guardian verification for this notice, and the selected project's access/retention/deletion arrangements. None is inferred from an adult pilot or another AI permission.

| Gateway variable | Required when enabled |
| --- | --- |
| `FACTORY_ANALYTICS_ENABLED` | Exactly `true`; otherwise entirely disabled |
| `FACTORY_POSTHOG_CAPTURE_ORIGIN` | Exactly `https://us.i.posthog.com` or `https://eu.i.posthog.com` |
| `FACTORY_POSTHOG_PROJECT_TOKEN` | The intended project's capture token; server only |
| `FACTORY_ANALYTICS_HMAC_KEY` | Separate high-entropy secret, at least 32 characters; rotation changes correlation identities |
| `FACTORY_ANALYTICS_ENVIRONMENT` | `development`, `test`, `staging` or `production` |
| `FACTORY_ANALYTICS_RELEASE` | Exact 40-character lowercase reviewed source SHA |

Incomplete/invalid analytics configuration fails closed without preventing the game gateway from starting. The baseline `scripts/deployment/deploy.py` deliberately resets runtime environment and permissions; it does not activate analytics or provision these additional secrets. A live configuration must be handled in the existing owner deployment environment and its preserved release record. Do not weaken that script's exact environment or IAM checks to carry a setting silently across redeployment.

After independent family verification, the operator can record the exact current choice with `npm run setup:analytics-verify -- --confirm-external-verification`. It reads `FACTORY_PRIVATE_CONFIG`, `FACTORY_ANALYTICS_CHOICE_ID` and `FACTORY_ANALYTICS_GUARDIAN_RECEIPT` privately from the environment, stores a receipt hash, refuses Cloud Run/GitHub Actions execution, and does not activate any service.

To stop new collection, turn the gateway switch off and remove the public switch in the next browser release; scope-specific withdrawal remains available before stopping the gateway. Preserve consent/incident evidence privately and complete any required downstream deletion separately. Re-enabling never turns an old adult session into a fresh grant or backfills browser history.

## API and verification entry points

The [OpenAPI contract](../../server/openapi.json) describes analytics status, events, the adult choice and authenticated parent choice/revocation. `/v1/jobs` accepts an optional `analytics` context outside the core build request; invalid/unavailable telemetry is ignored without changing admission or idempotency. Existing unknown core fields still fail validation.

- `npm run test:analytics`: client permission/failure isolation, server trust/correlation/outbox and Firestore capacity contracts, and synthetic dashboard/API tests.
- `npm run test:analytics-browser`: actual IndexedDB/scene actions, production permission UI, trusted preview starts and native Studio launch/copy checks.
- `npm run test:deployment`: offline source/archive and existing deployment contracts; no cloud mutations.
- Existing adult, parent, art, generated-runtime and learning suites cover the shared boundaries. Test fixtures and emulated viewports do not establish live-provider, physical-device or child acceptance.

The dashboard guide links current official PostHog documentation used for capture, query and management payloads. No PostHog dependency is added to the application package.
