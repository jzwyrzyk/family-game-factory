/** Aggregate-only PostHog report definitions. No user records or credentials live here. */
export const MANAGED_TAG = 'jems-analytics-pilot-v1';
export const ENVIRONMENTS = ['development', 'staging', 'test', 'production'];
export const AUDIENCES = ['adult', 'child'];
export const EVENTS = [
  'jems_journey_started', 'jems_creation_submitted', 'jems_creation_completed',
  'jems_creation_failed', 'jems_game_play_started', 'jems_art_saved',
  'jems_asset_added_to_game', 'jems_game_revision_played',
];

export function selection(options = {}) {
  const environment = options.environment ?? 'staging';
  const audience = options.audience ?? 'adult';
  if (!ENVIRONMENTS.includes(environment) || !AUDIENCES.includes(audience)) {
    throw new Error('Select a supported environment and audience.');
  }
  return { environment, audience };
}

function base({ environment, audience }) {
  // Values interpolated here come only from the enums above. All identifiers are
  // relay-produced HMAC values; none are selected by a report's final projection.
  return `scoped AS (
  SELECT event, distinct_id, toUnixTimestamp(timestamp) AS at,
    coalesce(toString(properties.creation_id), '') AS creation_id,
    coalesce(toString(properties.job_id), '') AS job_id,
    coalesce(toString(properties.game_id), '') AS game_id,
    coalesce(toString(properties.revision_id), '') AS revision_id,
    coalesce(toString(properties.asset_id), '') AS asset_id,
    coalesce(toString(properties.creation_mode), '') AS creation_mode,
    coalesce(toString(properties.build_adapter), '') AS build_adapter,
    coalesce(toString(properties.release), '') AS release,
    coalesce(toString(properties.source), '') AS source,
    coalesce(toString(properties.failure_category), '') AS failure_category
  FROM events
  WHERE event IN (${EVENTS.map(name => `'${name}'`).join(', ')})
    AND toString(properties.schema_version) = '1'
    AND properties.environment = '${environment}'
    AND properties.audience = '${audience}'
    AND timestamp >= now() - INTERVAL 30 DAY
    AND timestamp <= now()
)`;
}

function jobEvidence(scope) { return `jobs AS (
  SELECT distinct_id, creation_id, job_id,
    min(CASE WHEN event = 'jems_creation_submitted' AND source = 'server' THEN at ELSE NULL END) AS submitted_at,
    min(CASE WHEN event = 'jems_creation_completed' AND source = 'server' THEN at ELSE NULL END) AS completed_at,
    min(CASE WHEN event = 'jems_creation_failed' AND source = 'server' THEN at ELSE NULL END) AS failed_at,
    argMin(CASE WHEN event = 'jems_creation_completed' AND game_id != '' THEN game_id ELSE NULL END, at) AS game_id,
    argMin(CASE WHEN event = 'jems_creation_completed' AND revision_id != '' THEN revision_id ELSE NULL END, at) AS revision_id,
    argMin(CASE WHEN event = 'jems_creation_submitted' THEN release ELSE NULL END, at) AS release
  FROM scoped
  WHERE creation_id != '' AND job_id != ''
    AND source = 'server'
    AND event IN ('jems_creation_submitted', 'jems_creation_completed', 'jems_creation_failed')
    AND build_adapter IN (${(scope.environment === 'test'
      ? ['mock', 'metered-api', 'codex-subscription', 'local-rule']
      : ['metered-api', 'codex-subscription', 'local-rule']).map(value => `'${value}'`).join(', ')})
  GROUP BY distinct_id, creation_id, job_id
),
job_plays AS (
  SELECT j.distinct_id, j.creation_id, j.job_id, j.submitted_at, j.completed_at, j.failed_at, j.release,
    min(CASE WHEN p.at >= j.completed_at THEN p.at ELSE NULL END) AS played_at
  FROM jobs j
  LEFT JOIN scoped p ON p.distinct_id = j.distinct_id
    AND p.creation_id = j.creation_id AND p.job_id = j.job_id
    AND p.game_id = j.game_id AND p.revision_id = j.revision_id
    AND p.event = 'jems_game_play_started' AND p.source = 'client'
  GROUP BY j.distinct_id, j.creation_id, j.job_id, j.submitted_at, j.completed_at, j.failed_at, j.release
)`; }

function firstCreationQuery(scope) {
  return `WITH ${base(scope)},
${jobEvidence(scope)},
journeys AS (
  SELECT distinct_id, creation_id, min(at) AS started_at, argMin(release, at) AS release
  FROM scoped
  WHERE event = 'jems_journey_started' AND source = 'client' AND creation_id != ''
    AND creation_mode = 'generated'
    ${scope.environment === 'test' ? '' : `AND (distinct_id, creation_id) NOT IN (
      SELECT distinct_id, creation_id FROM scoped
      WHERE event = 'jems_creation_submitted' AND source = 'server' AND build_adapter = 'mock'
    )`}
  GROUP BY distinct_id, creation_id
),
ordered_journeys AS (
  SELECT *, row_number() OVER (PARTITION BY distinct_id ORDER BY started_at, creation_id) AS journey_order
  FROM journeys
),
per_journey AS (
  SELECT j.distinct_id, j.creation_id, j.release,
    max(CASE WHEN a.submitted_at >= j.started_at AND a.submitted_at <= j.started_at + 86400 THEN 1 ELSE 0 END) AS submitted,
    max(CASE WHEN a.submitted_at >= j.started_at AND a.completed_at >= a.submitted_at
      AND a.completed_at <= j.started_at + 86400 THEN 1 ELSE 0 END) AS completed,
    max(CASE WHEN a.submitted_at >= j.started_at AND a.completed_at >= a.submitted_at
      AND a.played_at >= a.completed_at AND a.played_at <= j.started_at + 86400 THEN 1 ELSE 0 END) AS played
  FROM ordered_journeys j
  LEFT JOIN job_plays a ON a.distinct_id = j.distinct_id AND a.creation_id = j.creation_id
  WHERE j.journey_order = 1 AND j.started_at <= toUnixTimestamp(now()) - 86400
  GROUP BY j.distinct_id, j.creation_id, j.release
)
SELECT release, count() AS mature_first_journeys,
  sum(submitted) AS submitted_within_24h, sum(completed) AS server_ready_within_24h,
  sum(played) AS same_result_played_within_24h,
  sum(completed - played) AS ready_without_recorded_play_24h,
  round(100.0 * sum(played) / nullIf(count(), 0), 1) AS journey_to_play_percent
FROM per_journey
GROUP BY release
ORDER BY release`;
}

function outcomesQuery(scope) {
  return `WITH ${base(scope)},
${jobEvidence(scope)}
SELECT release, count() AS submitted_attempts_with_24h_followup,
  sum(CASE WHEN completed_at >= submitted_at AND completed_at <= submitted_at + 86400 THEN 1 ELSE 0 END) AS server_ready_24h,
  sum(CASE WHEN failed_at >= submitted_at AND failed_at <= submitted_at + 86400 THEN 1 ELSE 0 END) AS server_failed_24h,
  sum(CASE WHEN (completed_at IS NULL OR completed_at < submitted_at OR completed_at > submitted_at + 86400)
    AND (failed_at IS NULL OR failed_at < submitted_at OR failed_at > submitted_at + 86400) THEN 1 ELSE 0 END) AS no_recorded_terminal_24h,
  sum(CASE WHEN completed_at IS NOT NULL AND failed_at IS NOT NULL THEN 1 ELSE 0 END) AS conflicting_terminal_records
FROM job_plays
WHERE submitted_at IS NOT NULL AND submitted_at <= toUnixTimestamp(now()) - 86400
GROUP BY release
ORDER BY release`;
}

function timingQuery(scope) {
  return `WITH ${base(scope)},
${jobEvidence(scope)}
SELECT release, count() AS completed_attempts,
  round(quantile(0.5)(completed_at - submitted_at), 1) AS median_seconds_to_ready,
  round(quantile(0.95)(completed_at - submitted_at), 1) AS p95_seconds_to_ready,
  sum(CASE WHEN played_at >= completed_at AND played_at <= submitted_at + 86400 THEN 1 ELSE 0 END) AS played_attempts,
  round(quantile(0.5)(CASE WHEN played_at >= completed_at AND played_at <= submitted_at + 86400
    THEN played_at - submitted_at ELSE NULL END), 1) AS median_seconds_to_first_play
FROM job_plays
WHERE submitted_at IS NOT NULL AND submitted_at <= toUnixTimestamp(now()) - 86400
  AND completed_at >= submitted_at AND completed_at <= submitted_at + 86400
GROUP BY release
ORDER BY release`;
}

function artQuery(scope) {
  return `WITH ${base(scope)},
saves AS (
  SELECT distinct_id, asset_id, min(at) AS saved_at, argMin(release, at) AS release
  FROM scoped
  WHERE event = 'jems_art_saved' AND source = 'client' AND asset_id != ''
  GROUP BY distinct_id, asset_id
),
asset_games AS (
  SELECT s.distinct_id, s.asset_id, s.saved_at, s.release, u.game_id, u.revision_id,
    min(CASE WHEN u.at >= s.saved_at AND u.at <= s.saved_at + 604800 THEN u.at ELSE NULL END) AS added_at
  FROM saves s
  LEFT JOIN scoped u ON u.distinct_id = s.distinct_id AND u.asset_id = s.asset_id
    AND u.event = 'jems_asset_added_to_game' AND u.source = 'client' AND u.game_id != ''
  WHERE s.saved_at <= toUnixTimestamp(now()) - 604800
  GROUP BY s.distinct_id, s.asset_id, s.saved_at, s.release, u.game_id, u.revision_id
),
asset_game_plays AS (
  SELECT a.distinct_id, a.asset_id, a.saved_at, a.release, a.game_id, a.revision_id, a.added_at,
    min(CASE WHEN p.at >= a.added_at AND p.at <= a.saved_at + 604800 THEN p.at ELSE NULL END) AS played_at
  FROM asset_games a
  LEFT JOIN scoped p ON p.distinct_id = a.distinct_id AND p.game_id = a.game_id
    AND p.revision_id = a.revision_id AND a.revision_id != ''
    AND p.event IN ('jems_game_play_started', 'jems_game_revision_played') AND p.source = 'client'
  GROUP BY a.distinct_id, a.asset_id, a.saved_at, a.release, a.game_id, a.revision_id, a.added_at
),
per_asset AS (
  SELECT distinct_id, asset_id, release,
    count(DISTINCT CASE WHEN added_at IS NOT NULL THEN game_id ELSE NULL END) AS games_used,
    count(DISTINCT CASE WHEN added_at IS NOT NULL AND played_at IS NOT NULL THEN game_id ELSE NULL END) AS games_played
  FROM asset_game_plays
  GROUP BY distinct_id, asset_id, release
)
SELECT release, count() AS saved_assets_with_7d_followup,
  sum(CASE WHEN games_used >= 1 THEN 1 ELSE 0 END) AS used_in_a_game_7d,
  sum(CASE WHEN games_played >= 1 THEN 1 ELSE 0 END) AS used_and_game_played_7d,
  sum(CASE WHEN games_used >= 2 THEN 1 ELSE 0 END) AS reused_in_different_game_7d,
  sum(CASE WHEN games_played >= 2 THEN 1 ELSE 0 END) AS different_games_played_7d,
  round(100.0 * sum(CASE WHEN games_used >= 2 THEN 1 ELSE 0 END) / nullIf(count(), 0), 1) AS reuse_percent
FROM per_asset
GROUP BY release
ORDER BY release`;
}

function qualityQuery(scope) {
  return `WITH ${base(scope)}
SELECT event, source, release, count() AS captured_events,
  max(at) AS latest_event_unix_seconds,
  sum(CASE
    WHEN event = 'jems_journey_started' AND creation_id = '' THEN 1
    WHEN event IN ('jems_creation_submitted', 'jems_creation_completed', 'jems_creation_failed')
      AND (source != 'server' OR creation_id = '' OR job_id = '') THEN 1
    WHEN event = 'jems_creation_completed' AND (game_id = '' OR revision_id = '') THEN 1
    WHEN event = 'jems_art_saved' AND asset_id = '' THEN 1
    WHEN event = 'jems_asset_added_to_game' AND (asset_id = '' OR game_id = '' OR revision_id = '') THEN 1
    WHEN event IN ('jems_game_play_started', 'jems_game_revision_played') AND (game_id = '' OR revision_id = '') THEN 1
    ELSE 0 END) AS incomplete_or_untrusted_correlations
FROM scoped
GROUP BY event, source, release
ORDER BY event, source, release`;
}

export function buildDashboard(options = {}) {
  const scope = selection(options);
  const key = `${MANAGED_TAG}:${scope.environment}:${scope.audience}`;
  const reports = [
    ['first-creation', 'First captured generated creation to play · 24h',
      'First captured generated journey per profile in the rolling 30-day window, with a full 24-hour follow-up. Joins the same creation, accepted job and completed game/revision; retries may finish that creation. Mock jobs are included only for the test environment. This is not a lifetime first-use or learning metric.', firstCreationQuery],
    ['generation-outcomes', 'Generation attempts · 24h outcomes',
      'Server-acknowledged jobs with a full 24-hour follow-up, grouped by the earliest captured release for that job. Missing terminal telemetry remains unknown; it is not a proven generation failure. Both terminal types are surfaced as a data-quality conflict.', outcomesQuery],
    ['time-to-play', 'Time to ready and first play',
      'Median/p95 seconds from accepted submission to server-ready, among completed attempts with 24-hour follow-up. First-play timing includes only confirmed client starts of that same completed job. Counts are shown alongside timing; missing plays are excluded from play latency.', timingQuery],
    ['art-reuse', 'Saved art to played games · mature 7d cohort',
      'Original art assets first captured as saved in the rolling 30-day window, with a full 7-day follow-up. Subsequent play requires the same profile and exact game/revision as the recorded art binding. This is an observed lower bound. Different-game reuse counts bindings to two stable games; two revisions of one game do not qualify.', artQuery],
    ['capture-quality', 'Capture coverage and correlation quality',
      'Event totals and latest captured time by event/source/release. Counts are not proof of complete delivery. No rows means no matching captured data, not zero users. Opaque identities never appear in report results.', qualityQuery],
  ];
  return {
    version: 1,
    selection: scope,
    dashboard: {
      name: `Jems pilot · ${scope.environment} · ${scope.audience}`,
      description: 'Jems product-usage pilot. Rolling 30-day reports; first-creation and attempt cohorts require 24h follow-up, art cohorts require 7d. Captured/consented population only. Data coverage, observation, usability and learning efficacy remain separate. Managed definitions: scripts/analytics/dashboard.mjs.',
      tags: [MANAGED_TAG, key],
    },
    insights: reports.map(([id, name, description, query], order) => ({
      key: `${key}:${id}`, name: `Jems ${scope.environment}/${scope.audience} · ${name}`, description, order,
      tags: [MANAGED_TAG, `${key}:${id}`],
      // The API's implicit 100-row limit could hide release groups. Keep a
      // bounded, explicit allowance for this aggregate pilot dashboard.
      query: { kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: `${query(scope)}\nLIMIT 10000` } },
    })),
  };
}
