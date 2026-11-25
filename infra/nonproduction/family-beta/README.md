# Authenticated DEV and TEST service definitions

The build file packages the real private application and the keyless gateway. The separate preview uses the existing preview Dockerfile. Neither recipe publishes an image. The existing environment controller owns deployment identity, exact-source check resolution, TEST acceptance and the owner release record.

A release engineer supplies a private JSON descriptor to `node scripts/beta/prepare-hosting.mjs descriptor.json empty-directory`. It emits three Cloud Run service manifests and a Compute URL map. This command has no cloud client. DEV and TEST each need their own dedicated nonproduction data and credentials. Service names and runtime principals must be distinct. Each approved Secret Manager version is numeric. Set the beta configuration and the household configuration on their respective service only. Projected GitHub App keys can reuse the existing private configuration loader. Never put a signing key, passphrase or provider credential in the descriptor.

```json
{
  "environment":"dev","project":"example-jems-dev","projectNumber":"123456789","region":"us-east5",
  "hub":"workshop.dev.example","preview":"games.dev.example","household":"owner.dev.example",
  "gatewayImage":"us-east5-docker.pkg.dev/example-jems-dev/registry/gateway@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "previewImage":"us-east5-docker.pkg.dev/example-jems-dev/registry/preview@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "services":{
    "gateway":{"name":"jems-dev-gateway","identity":"gw-runtime@example-jems-dev.iam.gserviceaccount.com","secret":"dev-gateway-settings","version":"1"},
    "preview":{"name":"jems-dev-preview","identity":"preview-runtime@example-jems-dev.iam.gserviceaccount.com","secret":"dev-preview-settings","version":"1"},
    "household":{"name":"jems-dev-household","identity":"owner-runtime@example-jems-dev.iam.gserviceaccount.com","secret":"dev-owner-settings","version":"1"}
  },
  "backends":{"deny":"dev-deny","gateway":"dev-hub","management":"dev-operator-iap","preview":"dev-preview","household":"dev-household-iap","machine":"dev-machine"}
}
```

The default backend must deny all unknown hosts. Management and the entire household frontend require IAP on separately identified backends. Set the signed audience to the corresponding backend ID and pin the intended Google subject. Use an independent household subject as applicable. The two household machine paths continue to verify their own OIDC tokens. Disable Cloud CDN for every private path, direct run.app URLs, origin rewrites and any alternate backend that can serve the application. The wildcard certificate covers one family-host label under the hub. The preview has a separate hostname and a separate read-only runtime principal. Keep Secret Manager and object permissions scoped to the runtime operation. The erasure processor uses a fourth identity outside the three web services.

The sample intentionally uses synthetic names and digest values. The owner activation checklist covers load balancer, identity, private bucket, signing materials, effective configuration, exact image read-back and route acceptance. [Activation checklist](../../../docs/family-beta/ACTIVATION.md)

For the opt-in protected household, the preview configuration can include a householdViewer containing exactly workspace, familyId, appOrigin and a distinct household previewKey. Verify the original household workspace and private object permissions before adding that entry. The beta gateway key cannot authorize a household preview. With the entry absent the viewer refuses household requests.
