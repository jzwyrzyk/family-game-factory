# Cloud Shell storage review

Use this review before retiring local release workspaces. The owner observed a full persistent home filesystem while preparing the private-coach diagnostic rollout. Folder sizes identify where space went; they do not establish that source, private records or shared Git objects can be discarded.

The [inventory helper](../../scripts/deployment/inspect_jems_storage.py) collects read-only evidence. It has no cleanup, deployment or network operation. Its only intended filesystem write is a private report in a new temporary output directory. Download and run the separately supplied immutable source and SHA-256; the helper needs Python 3 and Git, without Node, npm or a new cloud login.

## Inventory scope and privacy

The scan covers every accessible entry under the owner's home directory, including hidden entries, plus owner-controlled `jems*` and `factory*` entries directly under `/tmp`. It records apparent and allocated sizes, hardlink-aware totals, directory groups, Git repositories and recovery records. Directory symlinks and different mounted filesystems are not traversed; inaccessible, disappearing or excluded entries are reported. This is a changing filesystem snapshot, not an atomic backup.

Authentication, configuration and personal-history directories are sized but treated as opaque. Internal names and contents from these directories are not exported. Sensitive filenames are redacted. Ordinary file bodies are not copied into the report. Git may read repository metadata and tracked content for its local status checks; hooks, filesystem monitors and external filters must not execute. Repositories with configured filters retain an explicit unknown status and are kept. System/global Git configuration and attributes are excluded, so custom global ignore rules are not honored. No Git fetch, index refresh, repair, prune or garbage collection is part of the audit.

Recognized `release.json` files receive a bounded metadata read. Only allowlisted source hashes and build/stage/promotion/rollback phases are included. Service templates, configuration values, secrets, headers and request bodies remain private. Unknown or unreadable journals remain protected.

Process observations use the owner's process metadata and correlate working directories, open files and relevant path arguments with reviewed workspace locations. Raw command lines and environments are not exported. The report also accounts for observed open-but-deleted regular files. Restricted `/proc` access and process races are explicit limitations; absence of an observed reference is not proof that a folder is inactive.

## Run and return the report

The owner handoff downloads one immutable helper to a newly created private directory under `/tmp`, checks its SHA-256, and runs:

```bash
python3 "$JEMS_STORAGE_AUDIT_DIR/inspect_jems_storage.py" \
  --output-dir "$JEMS_STORAGE_AUDIT_DIR"
```

The terminal report is bounded and includes truncation counts. The fuller sanitized metadata report stays in that private temporary directory. Return the terminal block for assessment; if a relevant section is truncated, inspect the retained report's indicated section before deciding what to remove. Do not paste raw release journals or credential files.

The helper only observes a running rollout. Leave its files and locks in place while that rollout is unresolved. Its source download and temporary report consume a small amount of temporary space, not another repository checkout in the full home directory.

## Interpret the decisions

| Decision | Meaning and required next step |
| --- | --- |
| `KEEP` | Active use, current coach recovery, private data, a recovery record, or unique/unreadable work requires retention. Inspect the stated reasons before considering any later retirement. |
| `REGENERABLE_CANDIDATE_REVIEW` | Recognized installed dependencies, download cache or build/test output may be replaceable. Confirm its actual contents, tracked-file status, active use and required recovery role before cleanup. This is not deletion approval. |
| `CHECKOUT_REVIEW` | Review the repository's source publication, local changes, ignored files, stashes, reflogs and shared Git dependencies. A clean status or familiar commit does not settle those questions. |
| `UNKNOWN_KEEP` | Evidence is incomplete or the data's purpose has not been established. Preserve it until the missing evidence is resolved. |

Directory levels overlap. Do not sum parent and child rows, or assume a hardlinked file's apparent size equals reclaimable space. The filesystem observations distinguish space available to this user from reserved or otherwise unavailable free blocks. An entry's allocated size and its deletion recommendation are separate findings.

Git remote-tracking references are local cached evidence. The helper does not verify publication with GitHub. Confirm relevant commit identities against the actual remote before retiring source. Unborn repositories, changes, untracked files, ignored unique records, stashes and unresolved local history need preservation. Shared common directories, linked worktrees and object alternates require a dependency review across all affected checkouts.

## Current recovery records to retain

Keep the entire unresolved coach release at `~/jems-releases/coach-diagnostics-b4734b1323de87dfee96bb91769cbab3cff432e6/`. The earlier observation of an absent journal predates the resumed helper and cannot be reused as a current absence claim. Its persistent `bootstrap.lock`, `state/release.lock` and `state/release.json`, if present, remain in place. Replacing a lock pathname can undermine serialization even when the file is empty.

Keep the current `/tmp/jems-coach-lowspace-*`, `/tmp/jems-coach-recovery.*` and `/tmp/jems-chat-rollout.*` resources while the rollout is unresolved. The low-space helper can reuse Node from the prior `jems-chat-rollout.qfgeyx` setup, outside its main temporary workspace.

The historical PR115 release also retains its private state and rollback provenance. Its application checkout is a Git worktree whose original tool checkout supplies shared metadata and objects; a separate recovery tool preserves the original journal identity. Assess these as a dependency graph. The existing [narrow low-space cleanup](COACH_DIAGNOSTIC_ROLLOUT.md#cloud-shell-disk-recovery) can remove verified ignored PR115 application dependencies without requiring their reinstallation for rollback. That does not justify deleting the whole PR115 release.

The measured `jems-access-review.*`, `jems-gateway-repair-tool-*` and `jems-service-release-*` folders are candidates for detailed retirement review. Their names and sizes alone establish neither inactivity nor reproducibility. Preserve authentication, personal history, unknown files, original source, unique local work and recovery state until the inventory supports a specific disposition.

## Evidence and remaining work

Sixteen focused offline checks passed, covering size/coverage accounting, opaque-data redaction, unchanged source and Git index metadata, symlink/mount boundaries, real linked/shared/dirty/stashed repositories, journal allowlisting, active references beyond the display limit, inherited Git overrides, external-filter suppression and explicit output truncation. Run them with `python3 -B scripts/deployment/check_jems_storage_audit.py`. The filter check first confirms that ordinary Git would execute its fixture helper; the inventory must leave the execution marker absent.

These checks establish the helper's behavior within their tested cases. They do not establish the contents of the owner's Cloud Shell. The owner's returned report is required for exact folder-by-folder recommendations and a reclaimable-space estimate. Any scan error, unreadable metadata, unresolved Git dependency or relevant truncated section must be resolved before declaring the affected item disposable.

The owner subsequently supplied `COACH_DIAGNOSTICS_SERVING` for revision `factory-coach-private-chatdiag-b4734b1323de-a14b8b`, with the gateway unchanged. Its receipt still reports `conversationVerified:false` and `providerCall:false`; preserve recovery resources while conversation diagnosis continues. Follow the [diagnostic rollout contract](COACH_DIAGNOSTIC_ROLLOUT.md) and [delivery ledger](../../DELIVERY-STATE.md) for the source, build, image and acceptance observations.
