# Production HTTP request evidence

November 26 continuation: [consolidated Cloud Shell setup and verified blockers](PERMANENT_CLOUD_SETUP.md), [autonomous triage and 401 investigation](AUTONOMOUS_TRIAGE.md). Earlier receipts below retain their original scope.

Use this reader to answer which Cloud Run revision handled an HTTP request and what status it returned. Read the observation interval alongside the canary or promotion receipt. This repository is public. Only the six approved request fields and bounded operational metadata belong in its reports. The summary remains visible for the workflow run's retention period, which can exceed the artifact's seven days.

## Inventory at the November 24 review

| Path | What the evidence establishes |
| --- | --- |
| Managed Codex metadata diagnostics | PR100 supplied the Cloud Run service/revision reader. Its proposed account is `jems-codex-diagnostics`, pool/provider `jems-codex-diagnostics/codex-environment`. The current task's managed self-check found no attached identity. [Assistant access](ASSISTANT_ACCESS.md) |
| Managed error counts | The Phase 2 source from PR107, integrated by PR126, specifies the `jems-cloud-run-errors` sink, seven-day regional `jems-diagnostics` bucket, `cloud-run-errors` view and a view-scoped reader. Its ERROR threshold and restricted `httpRequest` preclude successful request evidence. Effective installation of this optional logging path is unverified. [Phase 2](PHASE_2.md) |
| Production release and observation | Publisher `jems-image-publisher` and controller `jems-cloud-run-release` have separate trust pools with `github-main` providers. Historical setup receipts record their initial inactive preparation and later activation. PR151's protected-main observer successfully read service/revision metadata with the controller. [Production activation](PRODUCTION_ACTIVATION.md) · [Observation](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45316092264) |
| Repository protection | GitHub reported main protected at `28fe3311036f8ef9f3bfc623c522432499c08113`. The active ruleset required six GitHub Actions checks and had no bypass actors at review. [Main ruleset](https://github.com/jzwyrzyk/family-game-factory/rules/27785865) |
| New request reader | Proposed keyless GitHub caller, dedicated federation, private broker and a custom view over retained platform request entries. Production setup, effective IAM, source coverage and a successful live diagnostic run await separate evidence. [Browser setup](PRODUCTION_DIAGNOSTICS_SETUP.md) |

## Dispatch a query

After merge and approved account setup, open **Actions → Jems production request diagnostics → Run workflow** on protected **main**. Select one of `factory-gateway`, `factory-preview` or `factory-coach-private`. The revision selector accepts a service-matched controller revision (`-r-` and 20 lowercase hex digits), a native Cloud Run revision (five digits and a three-character suffix), or an exact historical name listed in the schema. Clear the field for a service-wide report, including any other real revision names returned by Google. Invalid input is omitted from published output. Supply inclusive start and exclusive end in UTC whole seconds. One run covers up to one hour. Use only service/revision names and times in the dispatch form.

For the November 23 local-time Gateway canary, the prepared inputs are:

| Input | Value |
| --- | --- |
| Service | `factory-gateway` |
| Revision | `factory-gateway-r-eaf5effa06d031818f52` |
| Start inclusive | `2026-11-24T02:19:00Z` |
| End exclusive, chosen one-hour interval | `2026-11-24T03:19:00Z` |

The canary transition occurred at `02:19:11.8337405Z`, shortly after the requested start. Match timestamps to the applicable allocation period. From the JSON, select `requests` where `method == "POST" and route == "/v1/coach"`. Include each UTC timestamp, route and exact HTTP status. Separately select **all** rows where `500 <= status <= 599`, including `[other]`. To examine baseline or service-wide errors, dispatch another explicitly scoped run over the same interval and retain its distinct run ID. For later promotion comparisons, use the exact revision and the actual recorded UTC transition time. The report's workflow source SHA identifies the diagnostic code. The release record identifies the application source and deployed image. [Canary release](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45311336437) · [Promotion under review](https://github.com/jzwyrzyk/family-game-factory/pull/152)

The application handles Gateway Coach turns at `POST /v1/coach` and private completions at `POST /v1/private-coach/complete`. A 2xx on one of those method/path pairs is HTTP evidence on the recorded service and revision. A successful status GET, readiness condition or allocation change does not establish a completed turn. User-visible reply quality and actual delivery need their own acceptance evidence. Keep the investigation passive. [Gateway handler](../../server/coach/http.ts) · [Private handler](../../server/coach/private-executor.ts)

Hourly execution is off by default. An approved schedule queries the preceding settled UTC hour for Gateway across revisions, with a minimum 15-minute ingestion buffer. It can certify only intervals within the broker's dated coverage review. For later intervals the broker can still publish individually observed rows with `INCOMPLETE` and unknown totals. A refreshed coverage review is required to certify the full interval. Follow the cost and coverage procedure before enabling recurrence. [Schedule and setup](PRODUCTION_DIAGNOSTICS_SETUP.md)

## Read the report

Each executed query writes a GitHub step summary and a single artifact member named `report.json`. The report contains the exact scope, attempt time, workflow provenance, coverage, completeness flags, sanitized rows and grouped counts. The schema rejects additional output properties. UTC timestamps retain source precision. Unrecognized paths map to the fixed label `[other]`. Recognized static paths use their canonical names. Dynamic preview URLs use only the literal template `/preview/{id}`. Query strings, fragments, hosts, dynamic IDs and raw exceptions have no report fields. [Version 1 JSON Schema](../../ops/request-evidence.schema.json)

| Classification | Meaning |
| --- | --- |
| `COMPLETE` | The reader validated the closed scope, coverage and selected view, exhausted pagination and produced bounded rows. Counts refer to matching, retained Cloud Run platform log entries as of the observation. A complete empty result means no matching entries were found. Traffic health remains unknown. |
| `INCOMPLETE` | A limit, timeout, ingestion delay, malformed record or invalid response prevented reliable counts. Counts are null. For `COVERAGE_UNVERIFIED` only, a fully paginated read can include individual observed rows. These establish a lower bound on matching activity. An empty array gives no conclusion about requests or errors. Other incomplete reads withhold all rows. |
| `UNAVAILABLE` | Authentication, effective read access, broker/source availability, or a valid coverage review was missing. Counts are null. |
| `NOT_CHECKED` | A query did not begin or a scope was rejected. A skipped/cancelled job or a missing/expired artifact also supplies no verified counts. |

Review `counts.total`, the separate `http_2xx`, `http_4xx`, `http_5xx`, Coach-specific counts and `by_route_and_status`. A zero 5xx count is meaningful only with the scope, total and status of the query. Incomplete or inaccessible evidence is never an error-free interval. The deduplication identity stays inside Google Cloud. Two rows with identical published metadata can represent two distinct entries. Use the published counts without deduplicating by timestamp or display columns.

A complete query exhausts the visible source within a reviewed coverage window. Logging can still deliver late or omit requests upstream. The broker verifies the runtime account, named view/filter/version and the effective scoped read on each complete query. The separate operator receipt establishes coverage and the effective IAM boundary for a finite period. Retention loss, discrepancies with independent request counts or an unverified historical routing policy invalidate the corresponding conclusion. A new view can expose data already retained in its bucket. A newly installed sink cannot backfill dropped or expired entries.

## Retrieve evidence with the installed GitHub connection

1. In the GitHub connector use `github_fetch` on `https://api.github.com/repos/jzwyrzyk/family-game-factory/actions/runs?branch=main&status=completed&per_page=50&page=1`. Page backward as necessary. Select the newest completed attempt of `.github/workflows/jems-production-diagnostics.yml` on this repository's main with event `workflow_dispatch` or `schedule`. Inspect failures as well as successes. Check for a newer running attempt before describing freshness. A disabled schedule can create a run whose only job is skipped. Identify the most recent executed diagnostic, and state any newer failed, cancelled or skipped attempt.
2. Use `github_fetch_workflow_run_jobs` and `github_fetch_workflow_job_steps` to confirm the evidence job actually ran, its conclusion and source. Their step metadata does not include the Markdown step summary. The owner can open the run in GitHub Actions to read it.
3. Use `github_fetch_workflow_run_artifacts` with that run ID and the exact name `jems-request-evidence-<run_id>-<run_attempt>`. Require a single unexpired match from the right run. Use `github_download_workflow_artifact` on its numeric artifact ID. Check the ZIP bytes against GitHub's SHA-256 digest. Read only the single regular file `report.json` from the archive, validate the schema and compare the JSON run ID, attempt, SHA, service, revision and UTC bounds to the requested investigation. A PR fixture has a different workflow and artifact name and supplies synthetic evidence only.
4. To claim complete interval totals, require successful job and run conclusions, `query_status == "COMPLETE"`, the expected completeness flags, and agreement between counts and rows. Report the run URL, attempt, observation timestamp, queried interval and presence or absence of actual request rows. A failed latest query may have an artifact explaining the failure. Under `INCOMPLETE/COVERAGE_UNVERIFIED`, report observed positive examples with their scope and timestamps and describe totals as unknown. If no usable artifact exists, report that gap and timestamp any older result explicitly.

This connection successfully enumerated main runs, retrieved job/step metadata, listed artifacts, downloaded an existing CI ZIP and verified its digest for artifact `14881976971` in run `45308110473`. It also retrieved and validated the new end-to-end fixture from [PR153’s operations run](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45320017788), artifact `14885859247`. The installed connector exposes no dispatch tool. Use manual GitHub Actions dispatch or the separately approved schedule. Retrieval of an actual production request-evidence report remains a separate live milestone. [Verified retrieval run](https://github.com/jzwyrzyk/family-game-factory/actions/runs/45308110473)
