#!/usr/bin/env bash
# Inspect a previously saved recovery plan. Emit field names and action counts only.
set -euo pipefail
[[ $# -eq 1 && "$1" =~ ^[0-9a-f]{32}$ ]] || { echo JOURNAL_ID_REQUIRED; exit 2; }
journal="$HOME/work/jems-operations-recovery/operation-$1.jsonl"
root="$HOME/work/jems-nonprod-state/partial-recovery"
jq -es 'length==2 and .[0].event=="STARTED" and .[0].lane=="nonprod-recover" and .[0].modes==["--plan"] and .[1].event=="FINISHED" and .[1].exit_code!=0' "$journal" >/dev/null
start=$(jq -rs 'first.time_utc' "$journal")
end=$(jq -rs 'last.time_utc' "$journal")
matches=$(find "$root" -mindepth 2 -maxdepth 2 -type f -path '*/attempt-*/remaining.tfplan' -newermt "$start" ! -newermt "$end")
[[ -n "$matches" && "$matches" != *$'\n'* ]] || { echo NO_UNIQUE_SAVED_PLAN_FOR_JOURNAL; exit 2; }
plan="$matches"
source_sha=$(jq -rs 'first.source_sha' "$journal")
plan_sha=$(sha256sum "$plan" | cut -d' ' -f1)
CHECKPOINT_DISABLE=1 terraform -chdir="$(dirname "$plan")" show -json "$plan" |
  jq -ec --arg source "$source_sha" --arg sha "$plan_sha" '
    def category($b;$a):
      if ($a|type) != ($b|type) then (($b|type)+"-to-"+($a|type))
      elif ($b|type)=="array" and ($b|sort)==($a|sort) then "order-only"
      else "changed" end;
    def fields:
      (.before // {}) as $b | (.after // {}) as $a |
      [((($b|keys)+($a|keys))|unique)[] as $k |
       select(($b|has($k)) != ($a|has($k)) or $b[$k] != $a[$k]) |
       {field:$k, difference:category($b[$k];$a[$k])}];
    [.resource_changes[] | select(.mode=="managed")] as $p |
    {source:$source,plan_sha256:$sha,
     drift:[.resource_drift[] as $d |
       {address:$d.address,refresh:$d.change.actions,fields:($d.change|fields),
        planned:([$p[]|select(.address==$d.address)|.change.actions][0])}],
     planned_counts:($p|group_by(.change.actions)|map({actions:.[0].change.actions,count:length})),
     planned_changes:[$p[]|select(.change.actions!=["no-op"])|{address,actions:.change.actions}]}'
