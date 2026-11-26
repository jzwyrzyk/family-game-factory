# Exact-manifest production release

This procedure takes over after the integrated TEST fixture and separately funded provider acceptance finish. The operational candidate creates no grant or release intent. It requires owner acceptance of the production package in addition to product acceptance and TEST spending authorization.

## Trust and read access

Use the existing protected main controls, publisher, release federation, Pages and diagnostic broker. Restrict the GitHub environments `jems-production-evidence`, `jems-production-approval`, `jems-image-publication`, `jems-cloud-run-production` and `github-pages` to the protected main branch. Configure Joseph (GitHub user ID 356692244) as a required reviewer of `jems-production-approval`. Restrict private-worker reference reads to the production and dedicated TEST private repositories. Supply the read-only private-repository Contents/metadata credential as the **environment** secret `JEMS_WORKER_REFS_READ_TOKEN` in the four verification environments (evidence, publisher, release, Pages). Keep credentials out of repository-wide variables, receipts, reports and inputs. The approval job receives no permissions or secrets. Deploying the evidence code and configuring these settings require administrator review.

The mirror needs read-only Cloud Build build/trigger and registry metadata in `jems-jzw-nonprod/us-east5`, plus repository-scoped image reads from `jems-test-services` for the existing production publisher. Review those exact cross-project reads separately. Its existing production write target is `jems-release-images`. Keep runtime, publisher, reader, TEST worker and production worker identities distinct. The gate checks the signed public GHCR digest and the exact protected worker main and lightweight tag in each private repository. Keep existing tag protection against moves/deletion and original rollback tags. A production worker identity change requires its separate coordinated maintenance approval, tag, effective WIF/readback and recovery drill.

## Prepare and approve

1. From a clean checkout of reviewed protected main set `SOURCE` to the exact tested source, `PREVIOUS` to the last independently verified Pages marker, and `REPO=jzwyrzyk/family-game-factory`. Capture readable, versioned recovery assets with the current private backup procedure. Record the private snapshot inventory and reader-compatibility receipt SHA-256, three observed baseline revisions/images/configuration fingerprints, previous worker tag/image and Pages archive. Verify old readers against copies of current storage, retained artifacts and revisions. Protect financial ledgers and in-flight generation. Keep private snapshot contents and raw prompts off GitHub.
2. Prepare both Pages archives on protected main. Each run reads the current household/public-delivery policy, selects the exact ancestor, builds, runs all eight regression shards and records the archive ID and digest. Compare the recovery site to the retained, known-good served inventory before approving. A newly rebuilt prior commit requires byte/provenance review. An expired archive requires fresh review. The household site and IAP family frontend have separately sealed distribution identities.

```bash
for SITE in "$PREVIOUS" "$SOURCE"; do
  gh workflow run pages.yml -R "$REPO" --ref main -f delivery=prepare -f source_sha="$SITE" \
    -f gateway_origin=https://factory-gateway-ola734esta-ul.a.run.app \
    -f preview_origin=https://factory-preview-ola734esta-ul.a.run.app
done
gh run download "$PAGES_RUN" -R "$REPO" -n "pages-preparation-$PAGES_RUN" -D "$PRIVATE/candidate-pages"
gh run download "$PREVIOUS_RUN" -R "$REPO" -n "pages-preparation-$PREVIOUS_RUN" -D "$PRIVATE/recovery-pages"
```

3. Assemble the sanitized package using the release v1 identity from TEST. The supplied `identity-and-recovery.json` has `manifest` (the exact identity used by both accepted TEST runs), `productionConfiguration` (the three production configuration hashes keyed by role), `runs` (integer frontend, uat, live run IDs), `expiresAt` (UTC time within 14 days), `supplyChain` (testWorkerRepositoryId, exact sandboxSignerSha, testBuild and testTrigger UUIDs) and `recovery`. Its recovery fields are `services`, `worker`, `pages`, `snapshotSha256`, `readerCompatibilitySha256`. Each service has `revision`, `image`, `configuration` and `compatibilitySha256` for its exact compatibility file. The assembler derives full Arcade evidence, fetches actual receipt bytes and validates the proposed record. Supply the original prepared recovery Pages receipt verbatim. Keep only immutable IDs and hashes in the reviewed commit.

```bash
python3 scripts/environments/prepare_production.py \
  --identity-and-recovery "$PRIVATE/identity-and-recovery.json" \
  --pages-receipt "$PRIVATE/candidate-pages/receipt.json" --out ops/release-candidate.json
```

4. Submit that exact package through protected source review. Once merged, dispatch the read-only review and compare the shown **package** SHA-256 to the locally computed result. Review the eight job results, full Arcade receipt, TEST recovery/actual play, funded ledger, production tuple and recovery assets. Reviewers enter the exact comment `approve-production PACKAGE_SHA256` in the protected GitHub environment decision. Triggering the run or supplying a login does not confer approval.

```bash
gh workflow run jems-cloud-run-release.yml -R "$REPO" --ref main -f release_review=candidate
gh run view "$REVIEW_RUN" -R "$REPO"
jq -n --argjson id "$REVIEW_RUN" --arg hash "$PACKAGE_SHA256" \
  '{runId:$id,packageSha256:$hash}' > ops/release-approval.json
```

Pass the pointer through protected source review. A newer review request invalidates the former grant. Approval expires at the earlier applicable evidence or package cutoff. First-attempt successful protected runs are required. Keep the accepted source within the seven-day Arcade receipt window, or requalify the exact source and reseal its changed evidence. Any package change needs a fresh review. The repository must retain its required checks throughout.

## Mirror, transition and publish

5. After separate approval for production registry writes, dispatch the existing signed publisher. It verifies the package and independently reads the exact original TEST Cloud Build, its trigger and all three registry images. It copies each OCI manifest digest intact, checks the raw destination manifest and attests the three original digest subjects on protected main. A partial copy produces no complete receipt or authorized transition. It can be retried with the same package and immutable content.

```bash
gh workflow run jems-service-images.yml -R "$REPO" --ref main -f mirror_release=true
gh run view "$MIRROR_RUN" -R "$REPO" --json headSha,databaseId \
  --jq '{runId:.databaseId,signerSha:.headSha}' > ops/release-mirror.json
```

6. Submit the mirror pointer and **one** reviewed original `ops/release.json` intent at a time. The original per-service `ops/compatibility.json` must match the bytes sealed for that service and reference a successful source-bound full validation. Start with Coach, then Preview, then Gateway. A service already at the same approved immutable image and verified configuration keeps its baseline revision. For each changed service use `stage` (zero traffic), `canary` (5%) and `promote` (100%). Keep the established gateway acceptance tag removal check. The controller checks upstream traffic, source, artifact, credentials, etag, scoped compatibility and post-transition readback. Each protected intent change triggers its own run. Inspect actual state after any incomplete operation.

7. Leave main at the successful canary commit while gathering settled candidate-revision-specific broker evidence. Supply an interval starting after the canary completed and ending at least 15 minutes before observation, up to one hour long. At least one successful 2xx request and zero 5xx are required. Collect meaningful authorized functional evidence for the relevant route. An empty interval, missing broker coverage, a previous revision or an unhealthy report blocks progression. Include the receipt pointer with the subsequent reviewed promotion intent.

```bash
gh workflow run jems-production-diagnostics.yml -R "$REPO" --ref main \
  -f service="$SERVICE" -f revision="$CANDIDATE_REVISION" -f start_utc="$START" -f end_utc="$END"
jq -n --argjson c "$CANARY_RUN" --argjson d "$DIAGNOSTICS_RUN" --arg sha "$CANARY_COMMIT" \
  '{canaryRunId:$c,diagnosticsRunId:$d,canaryCommit:$sha}' > ops/release-canary.json
```

8. After all three approved images are serving at 100%, leave the last verified intent in place. Take a fresh observation and publish only the exact previously prepared archive. Use the observation within 15 minutes. A newer Cloud Run operation, changed protected main or public-delivery policy requires a fresh observation or reviewed candidate. Pages checks approval again after its environment gate, reuses the reviewed tar and confirms the served public marker after deployment.

```bash
gh workflow run jems-cloud-run-release.yml -R "$REPO" --ref main -f observe=true
gh workflow run pages.yml -R "$REPO" --ref main -f delivery=publish \
  -f source_sha="$SOURCE" -f observation_run="$OBSERVE_RUN" \
  -f gateway_origin=https://factory-gateway-ola734esta-ul.a.run.app \
  -f preview_origin=https://factory-preview-ola734esta-ul.a.run.app
```

## Stop and recover

A failed step stops subsequent promotion. If Pages readback fails, check the actual deployment and origin marker before retrying. Leave private generation admissions and spending closed during recovery, preserve snapshots, ledger and in-flight records. Verify that the previously qualified reader still supports current records. If compatibility is uncertain, stop at the existing traffic allocation for an owner recovery decision. A traffic operation does not restore stored data or rotate a worker.

For a confirmed compatible recovery, use the sealed per-service `rollback` intent in reverse order (Gateway, Preview, Coach) with the existing verified baseline and exact original configuration. Services still at baseline require no change. Take the fresh three-service observer receipt after the last rollback. Restore the sealed retained Pages archive by dispatching the same Pages command with `delivery=rollback` and `source_sha="$PREVIOUS"`. Verify the origin and check application read/replay against retained data. If the forward grant has expired or been superseded, dispatch `release_review=recovery`, review the recovery tuple, enter `approve-recovery PACKAGE_SHA256` and submit the new pointer. This grant permits only matching recovery for one hour after the review completes. Traffic rollback is independent of the failed candidate's CI and worker availability. Use existing private backup and worker recovery authorities for any separately approved data or identity restoration.

The offline suite exercises local metadata, synthetic ZIP archives and the existing Cloud Run state machine. Actual protected reviewer history, Google/IAP credentials, Cloud Build attestation, OCI copying/signing, funded generation, broker completeness, canary requests, production data compatibility and public publication require separate live receipts. [Production operations](PRODUCTION_ACTIVATION.md) · [Environment architecture](../development/DEV-TEST-PROD.md)
