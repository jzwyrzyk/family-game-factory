# Assignment 003 evidence

Implementation validation uses local fixtures. No GCP API/resource validation, image push, Cloud Run deployment, IAM mutation, Secret Manager value access, workflow dispatch, model request or activation was performed.

- Existing remote approved worker tag was read with `git ls-remote` and points exactly to `dcb887e6a51ba000fda1ccc42b9d198f8b9895f9`.
- GitHub repository variable read failed: `403 Resource not accessible by integration`. No variable write was attempted. Owner verification of `FACTORY_ACTIONS_APPROVED=false` remains necessary.
- `deploy.py plan --region europe-west1` performs no subprocess/network operations and prints an inactive plan.
- Python fixture tests exercise the complete bootstrap/config/IAM/deploy/health sequence, repeat deployment without implicit signing-key rotation, image/secret drift rejection, foreign-secret/preview-write rejection, URL validation, and the explicit execution boundary. They use fake gcloud responses and mocked HTTP health; these are not real cloud IAM evidence.
- Node tests generate a temporary test-only RSA key to verify split PEM loading and inline compatibility, reject ambiguous/missing key sources, and exercise live local HTTP preview readiness/failure/wrong-host/capability handling. Test keys never leave their temporary directory, which is deleted.
- Strict sandbox-verification tests reject missing/partial/SKIP output and failed subprocesses. The actual full gVisor browser smoke remains unrun here and is required before activation.
- Production typecheck/build and the complete `npm test` regression suite passed locally (exit 0). After the final bootstrap/config and read-only Firestore checks were added, the final unit run passed **45 tests**, the targeted HTTP/config run passed all three HTTP/config tests, and deployment fixtures passed **eight tests**. Retained outputs: [full regression](full-regression.txt), [final units](unit-tests.txt), [deployment fixtures](deployment-tests.txt). Existing game/browser/security coverage is retained; no prototype-mechanic baseline is weakened.

The full regression command explicitly skips the unconfigured real-agent smoke. That skip does not dispute existing API credit and is not activation evidence. Mobile browser tests are Chromium viewport emulation, not physical Android/iOS testing.
