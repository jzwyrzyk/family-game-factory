#!/usr/bin/env bash
# Inspect a previously saved recovery plan. Emit field names and action counts only.
set -euo pipefail
phase=planning
if [[ ${1:-} == --post-apply ]]; then phase=post-apply; shift; fi
[[ $# -eq 1 && "$1" =~ ^[0-9a-f]{32}$ ]] || { echo JOURNAL_ID_REQUIRED; exit 2; }
journal="$HOME/work/jems-operations-recovery/operation-$1.jsonl"
root="$HOME/work/jems-nonprod-state/partial-recovery"
jq -es 'length==2 and .[0].event=="STARTED" and .[0].lane=="nonprod-recover" and .[1].event=="FINISHED" and .[1].exit_code!=0' "$journal" >/dev/null
start=$(jq -rs 'first.time_utc' "$journal")
end=$(jq -rs 'last.time_utc' "$journal")
source_sha=$(jq -rs 'first.source_sha' "$journal")
if [[ $phase == post-apply ]]; then
  approval=$(jq -ers 'first.approve_plan_sha256 | select(test("^[0-9a-f]{64}$"))' "$journal")
  folder=$(jq -er --arg approval "$approval" --arg source "$source_sha"  \
    'select(.approval==$approval and .source==$source) | .successor' "$root/apply-started")
  [[ $(dirname -- "$folder") == "$root" && $(basename -- "$folder") =~ ^attempt-[0-9a-f]{32}$ && ! -L "$folder" ]] || exit 2
  jq -e --arg approval "$approval" '.approval==$approval' "$folder/apply-started" >/dev/null
  expected="$folder/post-apply.tfplan"
  matches=$(find "$folder" -maxdepth 1 -type f -name post-apply.tfplan -newermt "$start" ! -newermt "$end")
  [[ $matches == "$expected" ]] || { echo NO_SAVED_POST_APPLY_PLAN_FOR_JOURNAL; exit 2; }
else
  jq -es '.[0].modes==["--plan"]' "$journal" >/dev/null
  matches=$(find "$root" -mindepth 2 -maxdepth 2 -type f -path '*/attempt-*/remaining.tfplan' -newermt "$start" ! -newermt "$end")
  [[ -n "$matches" && "$matches" != *$'\n'* ]] || { echo NO_UNIQUE_SAVED_PLAN_FOR_JOURNAL; exit 2; }
fi
plan="$matches"
plan_sha=$(sha256sum "$plan" | cut -d' ' -f1)
CHECKPOINT_DISABLE=1 terraform -chdir="$(dirname "$plan")" show -json "$plan" |
  jq -ec --arg phase "$phase" --arg source "$source_sha" --arg sha "$plan_sha" '
    def category($b;$a):
      if $b==null and $a=={} then "null-to-empty-object"
      elif $b==null and $a==[] then "null-to-empty-array"
      elif ($a|type) != ($b|type) then (($b|type)+"-to-"+($a|type))
      elif ($b|type)=="array" and ($b|sort)==($a|sort) then "order-only"
      else "changed" end;
    def evidence($key;$b;$a):
      if (["calendar_period","credit_types_treatment","spend_basis"] | index($key)) != null
         and all($b,$a; .==null or .=="MONTH" or .=="YEAR" or .=="QUARTER" or .=="INCLUDE_ALL_CREDITS"
                    or .=="EXCLUDE_ALL_CREDITS" or .=="CURRENT_SPEND" or .=="FORECASTED_SPEND")
      then {before:$b,after:$a} else {} end;
    def block_fields($b;$a):
      if ($b|type)=="array" and ($a|type)=="array" and ($b|length)==1 and ($a|length)==1
         and ($b[0]|type)=="object" and ($a[0]|type)=="object" then
        [((($b[0]|keys)+($a[0]|keys))|unique)[] as $k |
         select($b[0][$k]!=$a[0][$k] or ($b[0]|has($k))!=($a[0]|has($k))) |
         ({field:$k,difference:category($b[0][$k];$a[0][$k])} + evidence($k;$b[0][$k];$a[0][$k]))]
      else [] end;
    def fields:
      (.before // {}) as $b | (.after // {}) as $a |
      [((($b|keys)+($a|keys))|unique)[] as $k |
       select(($b|has($k)) != ($a|has($k)) or $b[$k] != $a[$k]) |
       {field:$k, difference:category($b[$k];$a[$k]),nested:block_fields($b[$k];$a[$k])}];
    [.resource_changes[] | select(.mode=="managed")] as $p |
    {phase:$phase,source:$source,plan_sha256:$sha,
     complete:.complete,errored:.errored,deferred_count:(.deferred_changes|length),
     checks:[.checks[]?|{status}],data_changes:[.resource_changes[]|select(.mode=="data" and .change.actions!=["no-op"])|{address,actions:.change.actions}],
     output_changes:[(.output_changes // {} | to_entries[])|select(.value.actions!=["no-op"])|{output:.key,actions:.value.actions}],
     drift:[.resource_drift[]? as $d |
       {address:$d.address,refresh:$d.change.actions,fields:($d.change|fields),
        planned:([$p[]|select(.address==$d.address)|.change.actions][0])}],
     planned_counts:($p|group_by(.change.actions)|map({actions:.[0].change.actions,count:length})),
     planned_changes:[$p[]|select(.change.actions!=["no-op"])|{address,actions:.change.actions,fields:(.change|fields)}]}'
