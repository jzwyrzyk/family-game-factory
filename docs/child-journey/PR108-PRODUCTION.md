# PR108 production handoff

## Verified disposition

PR108 merged on November 21, 2026 at **2:07:42 a.m. America/New_York** as `c43a18148421ea22edfba5f7e891530678ad4f4f`. Its full tree `9f83b51542d5b2656b52f3fd1051bd1869980315` matches the reviewed head and CI merge-test tree. All eight PR workflows and 15 jobs passed, including [archive-built service images](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44877661042) and [complete Arcade journeys](https://github.com/jzwyrzyk/family-game-factory/actions/runs/44877661108).

The corrected release requires **private coach + gateway + web**. Preserve the current generation worker/source/execution tag, sandbox image and unchanged preview service. No new full VM/gVisor smoke is needed solely for this change. Normal service and website acceptance still applies. The original failed packaging runs are retained in [delivery state](../../DELIVERY-STATE.md).

The public release marker was rechecked after merge and still identifies `b472c224f7e8ef8ab0986ce6f755728d7cc63d46`. This task has performed no production deployment or activation change. The available executor has no authenticated Cloud Run write identity; use the existing signed-in Cloud Shell. The owner has already authorized merge and production when ready.

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

## Cutover after the receipts

1. Reconcile the actual serving revisions and any different staged coach configuration. Stage the reviewed private-coach and gateway images with the serving configuration preserved: identities, environment, numeric secret mounts, allowances, permits, origins and worker pins. Do not reuse the inactive provisioning helpers or promote an unrelated staged speech revision.
2. Check readiness and old-client compatibility, then a bounded authenticated synthetic new-creation request through both layers. Health/status alone does not exercise `creation.version: 1`, model response quality or current turn-budget admission. Preserve existing budgets rather than raising them automatically.
3. Promote compatible backends before the new website, using the saved previous traffic targets for backend recovery. Publish the exact merged web SHA through the existing manual Pages workflow and its full eight-shard regression gate. Verify the live release marker and service origins.
4. Verify the actual conversation → sufficient understanding → explicit Build → wait/play → Keep/reload journey through the authorized account. Keep paid capabilities within their current approved audience.

A pre-PR108 frontend cannot read newly saved `design.creationReview`. Do not roll Pages back to that reader or erase notebooks. A frontend fallback must retain compatible notebook reading. If the backends need rollback while the current website remains, ideas that still need a readiness assessment remain blocked; existing saved play and work retain their recovery paths. An already-valid saved assessment is separate from a new coach request. Any later frontend replacement still needs its own storage-compatibility check.
