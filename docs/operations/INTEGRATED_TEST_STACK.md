# Isolated TEST operator

Use the original recovery operator and Cloud Shell state for the partially applied nonproduction controller. Its corrective plan creates the GitHub provider and budget, retains 25 instances and has no replacements. Check the effective IAM and diagnostic broker receipts, then authorize the existing controller's federation separately. Keep its state, saved plans, approvals, backup files and original markers in place. [Original recovery](NONPRODUCTION_RECOVERY.md)

The integrated TEST stack runs in the same nonproduction project and has its own Terraform root, private state directory, named Firestore database, bucket, Artifact Registry, service accounts, private worker network, worker repository and spending ledger. DEV preview hosting continues to use the existing environment controller. Source preparation leaves all production and nonproduction flags off.

## Establish the private inputs

Use the administrator's authenticated Cloud Shell and the exact reviewed source in a clean checkout. The following variables identify the source, the state directory and files kept outside both repositories. Retain this directory in the persistent private Cloud Shell home with a secure independent backup. Use Terraform 1.13.5 and the checked-in provider lock. Use ADC for the same administrator and approved quota project. A successful account listing alone does not verify ADC.

```bash
umask 077
export PROJECT=jems-jzw-nonprod REGION=us-east5
export SOURCE="$(git rev-parse HEAD)"
test "$SOURCE" = "${APPROVED_OPERATIONAL_SHA:?supply the reviewed full source}"
private_inputs="$HOME/jems-integrated-test-inputs"
test_state="$HOME/jems-integrated-test-state"
mkdir -p -m 700 "$private_inputs"
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth application-default print-access-token >/dev/null
tf_test=(python3 scripts/ops/integrated_test_stack.py --source "$SOURCE" --state-dir "$test_state")
"${tf_test[@]}" initialize
read -rs -p 'Reviewed TEST IAP client secret: ' TF_VAR_iap_oauth_secret && echo
export TF_VAR_iap_oauth_secret
```

Before enabling the foundation, obtain the separate private TEST repository ID, owner ID, exact protected main/tag, restricted GitHub runner group, TEST App installation, and the signed sandbox digest and source. Verify the package and signer using the worker handoff. The GitHub App for the TEST worker needs the TEST repository only. Retain the production worker pin and credentials. Prepare a delegated TEST DNS zone in the project, its approved management/household user lists, and an OAuth client usable by the programmatic IAP caller. Use exact TEST principals. Owner review of these prerequisites authorizes each actual addition separately.

Write the private TF variable file with the real nonproduction project number, edge and worker attributes from the module's variables. Start with stage `foundation`, `enable_worker_federation=false`, `release=null` and `funded_trial=null`. The provider test inputs are synthetic examples. The OAuth secret enters the write-only provider field through the environment. Read-back and operator receipts stay in Cloud Shell.

```bash
stage_plan() {
  "${tf_test[@]}" plan --variables "$1" "${@:2}" | tee "$private_inputs/latest-plan.json"
}
approved_apply() {
  local receipt="$private_inputs/latest-plan.json"
  local approval
  read -r -p 'Approved SHA-256 from the reviewed receipt: ' approval
  "${tf_test[@]}" apply --attempt "$(jq -er .attempt "$receipt")" --approve-sha256 "$approval" |
    tee "$private_inputs/last-applied.json"
}
stage_plan "$private_inputs/foundation.tfvars.json"
# Inspect all addresses, actions, output and IAM details in .privatePlan, then obtain this plan's approval.
approved_apply
outputs="$(jq -er .outputs "$private_inputs/last-applied.json")"
```

The operator locks the new directory, archives exact Git module bytes and Terraform lock file, binds the reviewed binary, private inputs, ephemeral secret, state and application history, and requires a clean post-apply plan. An unresolved start marker stops future plans and applies. For an interrupted operation, inspect the retained before and successor states, cloud inventory, exact original plan and provider audit records locally. Preserve backups. The `record-reconciliation --attempt ID --private-inventory FILE` command accepts a private record containing the original approval, actual state hash, sorted verified resource addresses, an empty unresolved list, and explicit administrator verification. Replan and obtain a new approval. Never delete a marker or replay a stale binary.

## Build and mount the three image roles

Use a reviewed Cloud Build v2 regional connection linked to the canonical public repository. Inspect its remote, application installation and read access. Keep the connected repository and builder in jems-jzw-nonprod/us-east5. The builder requires its isolated Artifact Registry writer and log writer. The Cloud Build service agent handles the repository connection. Verify actual effective rights, including access to the selected connection and current default-pool quota, before ordering a build. Granting new rights or linking a repository requires administrator approval.

```bash
node scripts/beta/test-service-images.mjs render "$SOURCE" "${CONNECTED_REPOSITORY:?full reviewed regional resource}" > "$private_inputs/trigger.json"
# After approval to create this manual-only trigger:
gcloud builds triggers create manual --project="$PROJECT" --region="$REGION" --trigger-config="$private_inputs/trigger.json" --format=json > "$private_inputs/created-trigger.json"
trigger_id="$(jq -er .id "$private_inputs/created-trigger.json")"
# After build and image-publication authorization:
gcloud builds triggers run "$trigger_id" --project="$PROJECT" --region="$REGION" --sha="$SOURCE" --format=json > "$private_inputs/trigger-request.json"
# Read the unique pending build ID, verify trigger, source, steps and budget; then approve in Cloud Build.
gcloud builds list --project="$PROJECT" --region="$REGION" --filter="buildTriggerId=$trigger_id"
gcloud builds approve "${BUILD_ID:?verified single pending build}" --project="$PROJECT" --region="$REGION"
node scripts/beta/test-service-images.mjs verify "$SOURCE" "$trigger_id" "$BUILD_ID" > "$private_inputs/service-images.json"
```

The build packages the family gateway, untrusted preview and Coach from the same resolved commit. Cloud Build must produce VERIFIED attestations. The verifier checks the linked repository, resolved revision, approved trigger, executed steps, builder identity, all three results and registry digest readback. If trigger submission returns an uncertain response, look up the existing trigger/build before retrying. The protected family release record binds the build and trigger IDs.

Prepare one private `identity.json` containing the TEST GitHub App and installation IDs, RSA key, IAP management/household/reset subjects, operator contact, management passphrase and numeric `fixtureExpiresAt` (Unix ms). Keys are `githubAppId`, `githubInstallationId`, `githubPrivateKey`, `managementSubject`, `householdSubject`, `resetSubject`, `operatorContact`, `managementPassphrase`, and `fixtureExpiresAt`. Use mode 0600. The reset subject is the dedicated synthetic UAT caller. Run initialization once. Back up and reuse its signing material across subsequent config versions.

```bash
node --import tsx scripts/beta/prepare-test-settings.mjs initialize-new-secrets "$private_inputs/identity.json" "$private_inputs/seeds.json"
node --import tsx scripts/beta/prepare-test-settings.mjs "$SOURCE" "$outputs" "$private_inputs/seeds.json" "$private_inputs/fixture-config-v1"
# After approval to install these exact private versions:
for role in gateway household preview; do
  gcloud secrets versions add "jems-test-${role}-settings" --project="$PROJECT" --data-file="$private_inputs/fixture-config-v1/$role.json" --format='value(name)' > "$private_inputs/$role-version"
done
```

Capture the numeric secret versions and all three exact image digests in `release` in a copy of the foundation inputs, advance to `services`, plan and approve. Only then advance to `edge` and explicitly approve the HTTPS routing resources. Verify exact hosts, wildcard DNS authorization, certificate status, default-domain denial, no CDN caching, separate IAP assertion audiences, secret mounts and serving digests. Verify the management, household, family and preview boundaries through actual requests. Wait for real DNS/TLS readiness; a successful Terraform apply does not establish it.

Before enabling TEST worker federation, verify its real protected branch/tag, repository ID, runner group access, signer policy, no-identity VM, bounded TTL and stop/cleanup controls. Review and apply the exact `edge` plan with `enable_worker_federation=true`. Set the TEST release metadata in the existing protected environment, using `family_descriptor` and the single verified build ID and trigger ID for each service build reference. Verify the existing environment controller in read-only mode first.

## Enroll synthetic TEST identities and qualify the release

Use the existing mapping and private enrollment controllers to bind the dedicated synthetic household and establish a TEST parent and synthetic profiles. Preserve each consent and ledger decision. Use TEST-private contacts and the IAP-protected family administrator. When the controller assigns a fresh synthetic family ID, replace the initial unbound UUID in the private seed's `gateway.beta.testReset.familyId`, render a new directory, install the new numeric version, and plan the change. Never substitute a real family. The two human/automation subject types, tenant scope, same-origin enrolled-device storage and recovery-point identity are checked independently. Keep encrypted synthetic credentials in the TEST GitHub environment.

Run `prepare-uat`, `uat` and the separately authorized `live-uat` through the existing protected environment controller. Retain the observed source, serving config, successful jobs, signed worker/sandbox proof, TEST evidence and unexpired archives. The funded household requires the bound `household.testTrial`, current verified `premiumApproval`, policy fingerprint and unexpired, specifically authorized $5 ceiling. Add the matching numeric Coach secret version and the typed, expiring `funded_trial` tuple in a separately approved plan. No secret value enters a plan. Ensure the Cloud Run funded configuration actually serves before collecting the paid receipt. [Protected workflow and evidence](../development/DEV-TEST-PROD.md)

Stop new dispatches and reservations on any ambiguous paid outcome. Reconcile provider receipts, pending jobs and reservations before attempting a new request or restoring data. Use the existing family/platform pause, private worker stop and exact Cloud Run recovery controls. For funded closure, prepare the private inactive household config using the same signing keys, retain the old numeric version as recovery, unset `funded_trial`, and use `stage_plan FILE --close-funded-trial`. Only its two temporary, expiring TEST IAM memberships can be removed by this mode. Traffic, data or bucket deletion, state removal and generalized destroy operations require their own plan. The operator rejects destructive replacements. Check the exact approved zero-traffic/previous-revision readback and preserve PITR, object generations, reservations and money ledgers. [Storage and recovery](../../infra/nonproduction/family-beta/README.md)
