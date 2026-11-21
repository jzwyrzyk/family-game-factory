# PR108 production handoff

## Verified disposition

PR108 merged on November 21, 2026 at **2:07:42 a.m. America/New_York** as `c43a18148421ea22edfba5f7e891530678ad4f4f`. Its full tree `9f83b51542d5b2656b52f3fd1051bd1869980315` matches the reviewed head and CI merge-test tree. All eight PR workflows and 15 jobs passed, including [archive-built service images](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44877661042) and [complete Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44877661108).

The corrected release requires **private coach + gateway + web**. Preserve the current generation worker/source/execution tag, sandbox image and unchanged preview service. No new full VM/gVisor smoke is needed solely for this change. Normal service and website acceptance still applies. The original failed packaging runs are retained in [delivery state](../../DELIVERY-STATE.md).

The public release marker was rechecked after merge and still identifies `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`. The owner subsequently ran the preparation below in the existing signed-in Cloud Shell and returned successful image-publication receipts. No production service deployment or activation change is established by those receipts. The available executor has no authenticated Cloud Run write identity. The owner has already authorized merge and production when ready.

## Prepared image receipts — November 21, 2026

The owner returned both verified publisher results for source `c43a18148421ea22edfba5f7e891530678ad4f4f`, with publication archive SHA-256 `acbd7e3a0d2bdb2e901505bf6bb611faadb6d05ef6ffca23778c7fb356577b09`:

| Artifact | Cloud Build | Immutable image in `us-east5-docker.pkg.dev/family-game-factory-jzw/factory-services/` |
| --- | --- | --- |
| Gateway | `12576b78-92ba-4e53-8ede-e33a6f2b7246` | `gateway@sha256:4148837305a722895e0ee59f56e2337c0db845542f96d4f36aa6cd2b496bf521` |
| Preview artifact only | same service build | `preview@sha256:7eba4061b9e26ab2456677ce83ab136952c9f7cc7669a561667c61e1e711db77` |
| Private coach | `8cf9e78c-b328-41b3-911e-1b34b0b9a995` | `coach@sha256:52e0bd8c0565e3ccf85ce6e111909d2cdc9446bfce159b7d62c92db1c24a8f54` |

The preparation directory is `/home/jzwyrzyk/jems-pr108-prep.HMJpZFj8`. Preserve its receipts and recover these exact build IDs if needed; do not submit the builds again. Both publishers returned `deployed: false`. The coach publisher's `modelEnabled: false` describes its lack of an activation action; it is not an observation that the already-serving coach was disabled.

The accompanying metadata receipt identifies gateway `factory-gateway-workerpin-dddf53db-mwq1mbz7-e99f` at 100% traffic with old image digest `2d877b6fe6fe35da9ac297f5b18de7d3045a7b9168477d92c61a45fb1cc19c54`. Its revision-spec-without-image fingerprint is `21b1b2fdda8991701ae16c3b547a20d1d5fa2b094316951d712a309073b14e24`. Private coach `factory-coach-private-00002-48r` serves 100% with old image digest `99fe827da073d131470dcbe2a9c5c272fb0873289dc17531353f6a24314de278` and fingerprint `9a27254597c5c8680fd8e66645c1961a3ae1d76f67baf252aac3e975bd032cad`. The newer, non-serving `factory-coach-private-00003-dqb` has the same old image but a different fingerprint, `92599824dcd56a27feaf01ebe3854e849248709d5eafe5acaea8791abc766361`. Use the serving coach's configuration as the update baseline; do not inherit the staged revision. These are owner-provided metadata receipts, not independent live reads by this executor, and the fingerprints exclude annotations and secret contents.

## Prepare the release in Cloud Shell

This block downloads the exact merged source directly from GitHub, reads a sanitized current serving/staged baseline, and uses the existing reviewed publishers to build verified image artifacts. A missing, ambiguous or unhealthy serving baseline stops before billable builds. It makes no Cloud Run, IAM, secret, traffic, provider-flag or worker-pin changes. The ordinary service publisher creates a preview artifact alongside gateway; this does not require deploying it.

It does not read secret payloads or print environment values. The revision-spec hash deliberately excludes the image and is only a comparison aid; it does not prove equality of annotations, service configuration or secret contents. The service baseline, service image receipt and coach image receipt can be returned for the next step.

```bash
(
set -euo pipefail
umask 077
SOURCE_SHA='c43a18148421ea22edfba5f7e891530678ad4f4f'
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Set the exact reviewed merged source SHA.'; exit 1; }
JEMS_PREP_DIR="$(mktemp -d "$HOME/jems-pr108-prep.XXXXXXXX")"
git clone --quiet --filter=blob:none --no-checkout --single-branch --branch main \
  https://github.com/jzwyrzyk/family-game-factory.git "$JEMS_PREP_DIR"
cd "$JEMS_PREP_DIR"
git sparse-checkout init --cone
git sparse-checkout set scripts/deployment server src/runtime src/studio src/creation
git merge-base --is-ancestor "$SOURCE_SHA" origin/main
git checkout --quiet --detach "$SOURCE_SHA"
test "$(git rev-parse HEAD)" = "$SOURCE_SHA"
printf 'Preparation directory: %s\nReviewed source: %s\n' "$JEMS_PREP_DIR" "$SOURCE_SHA"

python3 - <<'PY' | tee service-baseline.json
import copy, hashlib, json, subprocess
project, region = 'family-game-factory-jzw', 'us-east5'
def read(kind, name):
    result = subprocess.run(['gcloud','run',kind,'describe',name,'--project',project,
                             '--region',region,'--quiet','--format=json'],
                            capture_output=True, text=True, timeout=45)
    if result.returncode: raise SystemExit('METADATA_READ_FAILED: '+name+'; no build started.')
    try: data = json.loads(result.stdout)
    except ValueError: raise SystemExit('INVALID_METADATA: '+name)
    if data.get('metadata',{}).get('name') != name: raise SystemExit('RESOURCE_IDENTITY_MISMATCH')
    return data
report = []
for service in ('factory-gateway','factory-coach-private'):
    current = read('services',service)
    status = current.get('status',{})
    serving = [{'revision':t.get('revisionName'),'percent':t.get('percent',0)}
               for t in status.get('traffic',[]) if (t.get('percent') or 0)>0]
    latest = status.get('latestCreatedRevisionName')
    names = {latest,status.get('latestReadyRevisionName'),*(t['revision'] for t in serving)}
    if None in names or len(serving)!=1 or serving[0]['percent']!=100:
        raise SystemExit('UNRESOLVED_SERVICE_BASELINE: '+service+'; no build started.')
    rows = []
    for name in sorted(names):
        if not name.startswith(service+'-'): raise SystemExit('REVISION_IDENTITY_MISMATCH')
        revision = read('revisions',name)
        spec = copy.deepcopy(revision.get('spec',{}))
        images = [container.pop('image',None) for container in spec.get('containers',[])]
        digest = hashlib.sha256(json.dumps(spec,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        rows.append({'revision':name,'declaredImages':images,
                     'resolvedImage':revision.get('status',{}).get('imageDigest'),
                     'ready':any(c.get('type')=='Ready' and c.get('status')=='True' for c in revision.get('status',{}).get('conditions',[])),
                     'revisionSpecWithoutImageSha256':digest})
    if not all(next(row['ready'] for row in rows if row['revision']==t['revision']) for t in serving):
        raise SystemExit('SERVING_REVISION_NOT_READY: '+service+'; no build started.')
    report.append({'service':service,'serving':serving,'latestCreated':latest,
                   'latestReady':status.get('latestReadyRevisionName'),'revisions':rows})
print(json.dumps({'project':project,'region':region,'services':report,
                  'secretPayloadsRead':False,'deployed':False},indent=2))
PY

python3 scripts/deployment/build.py --region us-east5 --reviewed-source-sha "$SOURCE_SHA" --execute | tee service-images.json
python3 scripts/deployment/build_coach.py --region us-east5 --reviewed-source-sha "$SOURCE_SHA" --execute | tee coach-image.json
printf 'Preparation complete. No service was deployed. Receipts: %s\n' "$JEMS_PREP_DIR"
)
```

Keep the preparation directory and printed Cloud Build IDs. If polling disconnects, recover the existing build with the matching publisher's `--build-id` option and the same source SHA/region. Do not resubmit the whole block blindly.

## Stage the prepared images

The scoped [PR108 staging helper](../../scripts/deployment/pr108_stage.py) accepts only the source, image digests and serving baselines recorded above. Obtain it from the exact reviewed handoff commit; it is release tooling, not a new application/image source. From its downloaded location, run:

```bash
python3 pr108_stage.py \
  --state-dir "$HOME/jems-pr108-prep.HMJpZFj8/pr108-stage-private" \
  --execute
```

It prepares both service baselines before the first write, reconstructs each template from the actual serving revision, preserves service policies and numeric active secret references, and pins existing traffic to the original named revisions. It stages `factory-coach-private-pr108-c43a18148421` and `factory-gateway-pr108-c43a18148421`, each at zero traffic. It changes no IAM binding, secret payload/version, activation setting, worker pin or preview service. Recovery metadata stays in a private local directory; return only the printed summary receipts.

Each write follows API-side dry-run validation and a fresh service/revision/IAM read, then carries the original service `resourceVersion`. A concurrent change stops the operation. Verification checks candidate image/configuration, service policy/IAM and both desired and observed traffic. A lost write response cannot trigger an automatic retry. Re-run the same helper **without `--execute`** to inspect/recover by reads. Do not delete the private journal or create a new state directory to bypass an uncertain result.

Local verification passed all **96 deployment tests**, including 17 focused staging cases: serving-versus-staged selection, numeric secret pins, service/route/configuration drift, API normalization, original conditional version, altered recovery journal rejection and lost-response recovery without replay. An independent code review covered the staging-only boundary. No staging operation has yet been observed in production. Cloud Run's [replaceService contract](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.services/replaceService) supplies dry-run validation and optimistic concurrency; its [metadata contract](https://docs.cloud.google.com/run/docs/reference/rest/v1/ObjectMeta) requires retaining arbitrary configuration annotations.

## Cutover after verified staging

1. Require both `STAGED_READY_VERIFIED` receipts with the original revisions still serving 100%. Retain the private recovery journal. Do not reuse the inactive provisioning helpers or promote the unrelated speech revision.
2. Promote the compatible private coach first, then gateway, through a separately reviewed conditional traffic update that preserves the saved configuration and prior recovery targets. Staged readiness/configuration checks precede promotion; normal authenticated traffic uses the canonical services after promotion. Keep the existing private-service audience and gateway caller identity.
3. Check the old-client-compatible route, then one bounded authenticated synthetic new-creation request through both layers before Pages. The older website does not send `creation.version: 1` by itself; health/status or an ordinary old-client turn cannot prove that opt-in contract. Use the already-authorized adult session and normal admission path, preserve its current budget, and do not mint substitute credentials or call the private model directly. Publish the exact merged web SHA through the existing manual Pages workflow and its full eight-shard regression gate. Verify the live release marker and service origins.
4. Verify the actual conversation → sufficient understanding → explicit Build → wait/play → Keep/reload journey through the authorized account. Keep paid capabilities within their current approved audience.

A pre-PR108 frontend cannot read newly saved `design.creationReview`. Do not roll Pages back to that reader or erase notebooks. A frontend fallback must retain compatible notebook reading. If the backends need rollback while the current website remains, ideas that still need a readiness assessment remain blocked; existing saved play and work retain their recovery paths. An already-valid saved assessment is separate from a new coach request. Any later frontend replacement still needs its own storage-compatibility check.
