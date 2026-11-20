# Jems PostHog pilot dashboard

The pilot answers three product questions: can a captured creation journey reach a playable result, where do generation attempts stop, and does saved original art get used again in another game? These are product-usage observations. They do not establish learning, child benefit, retention across all families, or complete delivery of analytics.

**Current evidence:** the definitions and bootstrap are implemented and tested against synthetic fixtures and a simulated management API. No live PostHog project, real event stream, live HogQL execution, or rendered dashboard has been verified by these tests. The bootstrap is offline unless an operator supplies credentials and explicitly passes `--apply`.

## Reports and decisions

The dashboard contains five aggregate tables. Each one selects one environment and one audience, schema version 1, and a fixed rolling 30-day capture window. The default is `staging` / `adult`.

| Report | Denominator and evidence | Useful decision |
| --- | --- | --- |
| First captured generated creation to play | The earliest captured generated journey per pseudonymous profile within the window, with a full 24 hours since the journey began. Submission and completion belong to the same creation; play must match that completed job, game, and revision. | Compare journey-to-submission, server-ready, and confirmed-play counts. A large ready-without-play count warrants inspection of the result handoff. |
| Generation attempts | Server-acknowledged attempts with a full 24 hours of follow-up. Shows ready, failed, missing terminal, and conflicting terminal records separately. | Distinguish a captured failed build from a build whose outcome was not captured. Resolve conflicting terminal records before trusting those outcomes. |
| Time to ready and first play | Completed attempts with 24-hour follow-up; submission-to-ready median and p95. First-play median includes only those completed attempts with a matching confirmed play within 24 hours of submission. Counts accompany timings. | Find whether generation latency or the handoff to play needs attention. Read play timing alongside the number that actually reached play. |
| Saved art to played games | Original assets first captured as saved during the window, with a full seven days of follow-up. Counts at least one game binding, at least one exact bound revision played, bindings to two different games, and exact bound revisions played in two different games. | Check whether saved art enters games and whether a second game uses it. Separate saved reuse from observed play. |
| Capture coverage and correlation quality | Event counts, latest event time, and missing/untrusted correlation counts by event, source, and release. | Check whether the other tables have usable evidence. This is an ingestion-side signal, not a delivery-success denominator. |

The fixed time window is written into the SQL. These queries intentionally do not use PostHog's `{filters}` placeholder: changing a dashboard date filter must not silently shorten the follow-up period or mix audiences. Generate the intended environment/audience dashboard explicitly. Reports group by the configured release at journey start, accepted submission, or first captured save; capture quality groups each event by its own release.

Each query explicitly allows up to 10,000 aggregate rows, avoiding the query API's implicit 100-row limit. The bootstrap stops if the preflight reports more rows. If a project outgrows this bound or query execution limits, revise the report window/grouping before relying on the dashboard.

### Creation and attempt identity

A pseudonymous profile is one local owner on one verified trusted device, scoped to its family and audience. Identical default profile IDs on different devices remain distinct; these reports do not deduplicate people across devices. A later Adult grant on the same device retains identity but requires a fresh session choice.

The report uses `distinct_id` plus `creation_id` to follow one profile's generated creation. A creation can have several accepted attempts. A failed attempt followed by a successful retry can complete that same creation; it still appears as two attempts in the generation report.

An accepted attempt is identified by `job_id`. Only server-sourced `jems_creation_submitted`, `jems_creation_completed`, and `jems_creation_failed` establish its outcomes. A browser claim of completion is rejected as evidence. A play belongs to that result only when the owner, creation, job, stable `game_id`, and `revision_id` all match and the play occurs after server completion. Playing another creation or a different revision cannot close this funnel.

The first-creation report selects `creation_mode = generated`. Art, scene, and native editor starts are separate product activity. Outside the explicit `test` environment, mock attempts are excluded, and a journey with a captured mock submission is excluded from the first-creation denominator. Supported non-mock adapters are `metered-api`, `codex-subscription`, and `local-rule`.

"First" means **first captured qualifying journey within the reporting window**, not the profile's first-ever creation or first product visit. Historical activity is not backfilled. A profile that already used Jems can enter this cohort when its first qualifying captured journey appears in the window.

The 24-hour completion/play interval starts at journey start for the creation funnel, and at accepted submission for the attempt and timing reports. An outcome after that interval does not convert the earlier cohort. A recent journey or job with less than 24 hours of follow-up is not yet in the denominator.

### Original art, game identity, and seven-day reuse

`asset_id` refers to the original drawing/source asset, including when a derivative is used. Duplicate save events and derivative saves with that same identity do not add denominator assets. The seven-day interval starts at the original asset's earliest captured save in the rolling window. It ends exactly seven days later, and assets are eligible only after that full interval has elapsed.

`game_id` is the stable project identity. Two revisions of one game do not count as two games. The `reused_in_different_game_7d` column means the original asset had captured bindings to at least two different stable games during the seven-day interval. It does not require either game to have been played.

For a played count, the report joins the original asset's binding to a later play by the same owner of the **exact same game and revision**. A play of a later revision cannot prove that the art was retained after editing. Missing revision identity therefore prevents play credit, even if the stable game matches. Rebinding the same art to another revision and then playing that revision can provide new evidence, while the distinct-game count stays one.

These played counts are an observed lower bound: the pilot may miss a valid play, an art binding, or retained art in a later revision. A binding plus matching play means the recorded revision was launched; it does not prove that an asset was seen, understood, or used in learning. The report never multiplies launch events by the number of assets in a game.

Binding coverage is intentionally narrow: scene editing emits a binding for an explicit art addition committed to that revision, and native art creation/copy emits its recorded binding. The pilot does not emit another binding for every later revision that happens to retain unchanged art. Playing such a later revision does not receive art-play credit without an exact captured binding.

### Read the limits with the numbers

- A blank table means no matching captured, mature cohort. It does not mean zero users or zero saved art. During the first day or week of collection, mature cohorts may be empty while capture quality already has events.
- `no_recorded_terminal_24h` is unknown outcome evidence. It can reflect a long-running attempt, missing telemetry, a disabled relay, revoked or expired permission, or an interrupted session. It is not automatically a failed generation.
- A generation job that fails before the gateway accepts it has no accepted-attempt denominator entry. The journey can still show no captured submission.
- Missing client telemetry can undercount starts, bindings, or plays. The relay is deliberately bounded, consent-scoped, and able to drop events, including when the shared workspace needs capacity for core state; PostHog cannot count events it never receives.
- Generated play coverage also depends on the runtime's validated start signal. Existing saved runtime archives remain immutable and may not emit that signal. A ready result with no captured play is therefore not proof of abandonment, particularly for historical/baseline revisions.
- Capture quality reports missing IDs or untrusted server-event sources. It is not a substitute for the gateway's operational logs, nor proof that every event was delivered exactly once.
- Releases are descriptive groups, not randomized comparisons. In-flight activity may cross a release boundary; the cohort keeps its starting/submission/save release. Counts and sample size matter before interpreting percentages or p95.
- The report covers captured, permissioned profiles in the selected audience/environment. It cannot estimate the behavior of people who did not participate.

## Offline review

Run from the repository root using Node's built-in APIs. No SDK or extra package is required:

```sh
node scripts/analytics/bootstrap.mjs --dry-run
node scripts/analytics/bootstrap.mjs --dry-run --environment test --audience adult
```

The JSON output contains the selected scope, managed names/tags, and the complete query payload for all five reports. It contains no credentials or event records. Running without arguments also performs this offline dry-run.

Allowed environments are `development`, `staging`, `test`, and `production`. Allowed audiences are `adult` and `child`. Each combination has its own dashboard and insight names/tags; an adult test run cannot update a child production dashboard through selection alone.

## Management credentials and explicit apply

An operator needs the intended PostHog Cloud project ID and a personal API key limited to that project, with `query:read`, `dashboard:write`, and `insight:write`. The write scopes include the corresponding read permission. Set these environment variables through the operator's secret-management mechanism:

| Variable | Meaning |
| --- | --- |
| `JEMS_POSTHOG_API_HOST` | Exactly `https://us.posthog.com` or `https://eu.posthog.com`, matching the project region. |
| `JEMS_POSTHOG_PROJECT_ID` | The numeric ID of the intended project. |
| `JEMS_POSTHOG_PERSONAL_API_KEY` | The scoped management key. Do not put it in source, a query, a screenshot, or a command argument. |

Then run the reviewed selection explicitly:

```sh
node scripts/analytics/bootstrap.mjs --apply --environment staging --audience adult
```

The management API host is distinct from the relay's capture origin (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). The management key is also distinct from `FACTORY_POSTHOG_PROJECT_TOKEN`. None of these `JEMS_POSTHOG_*` variables enables Jems capture. Capture configuration, application permission choices, audience checks, and deployment remain separate prerequisites.

The bootstrap performs these steps:

1. Validate the selected scope and exact cloud origin, then list bounded project dashboard/insight metadata. Insight membership metadata is explicitly requested.
2. Resolve only resources with both the general `jems-analytics-pilot-v1` tag and their exact scope/report marker. Duplicate markers, an unowned matching name, a publicly shared target dashboard, or missing insight membership metadata stop the run before definitions change.
3. Execute each report's aggregate `HogQLQuery` using the official query API with synchronous `refresh: blocking`. Every query must return a completed result before the first dashboard definition is written. Query rows remain in memory and are never printed or saved.
4. Create or patch the single selected dashboard and its five insights. Existing extra tags and insight dashboard memberships are preserved. Managed names, descriptions, report queries, and order are restored to the checked-in definitions.
5. Print only the dashboard URL and creation/update counts. Error output omits response bodies, keys, and event data.

The script does not call the capture API, enable session replay or autocapture, change project settings, send invitations, publish a shared dashboard, create a scheduled query/export, or delete any resource. Reapplying updates the same tagged definitions; it does not create another set. Concurrent apply runs are unsupported: use one operator/run at a time.

A failed write can leave a partial setup. A timed-out create may have succeeded remotely, so there is no automatic POST retry. Inspect the project, then rerun explicitly: the next run resolves resources by their managed tags and creates only the missing ones. If duplicate tags already exist, resolve that ambiguity before rerunning. Removing a managed tag or renaming resources outside this process may require manual reconciliation.

Dashboard definitions are private by default under PostHog's ordinary project permissions. This script refuses a publicly shared target but does not audit every pre-existing project member or the sharing state of other dashboards to which someone manually attached a managed insight. Review project access through the normal operational process.

## Validation and activation evidence

```sh
node --test scripts/analytics/bootstrap.test.mjs
```

The test suite uses Node and Python 3's standard-library SQLite; Python is a test-only dependency. It exercises actual checked-in SQL against synthetic relational fixtures after adapting PostHog property access, interval syntax, and aggregate syntax. It checks retries and unrelated creations, exact job/game/revision matching, original assets and duplicate saves, cross-owner and wrong-revision plays, seven-day maturity, different-game reuse, audience/environment isolation, and schema-version isolation.

The simulated API tests cover offline default behavior, query validation before writes, separate scope dashboards, preservation of extra tags/memberships, duplicate markers, missing metadata, recovery after an ambiguous create, bounded-origin pagination, and withholding secrets/response content. An event-list test checks the report allowlist against the application contract.

These tests establish local behavior and query intent. SQLite fixtures do not validate PostHog's live HogQL parser, approximate quantile behavior, cloud query execution limits, or table rendering. The `--apply` preflight resolves the dialect/execution check before writing definitions. After a first connected setup, verify an authorized synthetic end-to-end flow in the `test` environment and inspect the resulting five tables before interpreting a pilot cohort. Record that live evidence separately; a successful local test is not that evidence.

## Official PostHog references

API payloads and query structure were checked against these official references on 2026-11-20:

- [Dashboards API](https://posthog.com/docs/api/dashboards): project dashboard list/create/patch endpoints and name, description, and tag fields.
- [Insights API](https://posthog.com/docs/api/insights): query/name/description/order/tag payloads, dashboard memberships, and `include_dashboards` list option.
- [Query API](https://posthog.com/docs/api/queries): project query endpoint, `HogQLQuery`, synchronous execution, and result shape.
- [API scopes](https://posthog.com/docs/api/scopes) and [API overview](https://posthog.com/docs/api/): scoped authentication and regional management/capture hosts.
- [SQL expressions](https://posthog.com/docs/sql/expressions), [supported aggregations](https://posthog.com/docs/sql/aggregations), and [SQL editor](https://posthog.com/docs/data-warehouse/sql): custom properties, aggregation and join semantics, and the explicit `{filters}` placeholder for dashboard filters.
- [PostHog query runner source](https://github.com/PostHog/posthog/blob/master/posthog/hogql_queries/query_runner.py): `DataTableNode` wrapping a `HogQLQuery` source, as used by the saved insights.

Source definitions: [dashboard.mjs](../../scripts/analytics/dashboard.mjs), [bootstrap.mjs](../../scripts/analytics/bootstrap.mjs), and [capture event contract](../../src/analytics/contract.ts).
