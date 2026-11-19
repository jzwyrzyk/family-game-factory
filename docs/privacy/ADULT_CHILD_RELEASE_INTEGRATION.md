# Jems adult-only pilot and future guardian consent — merged-code integration review

**Not deployed.** This combined candidate resolves PR #52 (future child parental privacy) and PR #53 (adult-only private testing). Neither parent nor adult external approvals are conferred by a commit, checkbox or review test. Child-specific OpenAI ZDR remains subject to provider approval when applicable.

## Two deliberately separate production audiences

| Audience | Prerequisite for paid model and speech | API settings |
| --- | --- | --- |
| Adult-only, genuinely private pilot | Exact already trusted device, operator-issued short adult permit, private adult access hostname independently inspected, reviewed model/STT data policies, provider and spending approvals | `FACTORY_ADULT_PILOT_MODE=true`, owner and private-host verified flags; `requireVerifiedParentPrivacy=false` ONLY inside this scoped adult gateway; Jems never claims ZDR is approved |
| Child / family eventually | Independently verified guardian receipt, versioned in-app generation/coach/STT permission scopes, applicable OpenAI ZDR, Google Cloud/privacy/safety/provider approvals | `FACTORY_ADULT_PILOT_MODE=false`, `requireVerifiedParentPrivacy=true`; all child ZDR/consent switches remain fail-closed |

The gateway programmatically sets the two modes as **mutually exclusive**. A public GitHub Pages `*.github.io` app origin is explicitly refused when adult-only mode is requested. This is an additional safeguard, **not** evidence that another host is actually private.

## Scope enforcement

- Production gateway remote game generation checks exact audience/permission at readiness and atomic paid submission; it also checks queued/in-flight work at Actions dispatch, generate/test claims, completion report and local ready promotion. A revoked permit cannot silently publish a newly created game.
- Production coach and Google STT gateway paths check the selected audience/permission atomically at admission, before sending to a provider, and again when returning a model reply/transcript. Old cached responses do not override revocation. The private dedicated runtime still requires independent IAM service identity, model/Google-STT authorization, pricing and spend caps.
- Parent choices are **PENDING** on form submission, not verified. A trusted operator records an externally verified guardian receipt for the exact choice and device; the resulting hashed receipt and consent scopes are then enforceable. Revocation/expiry invalidate any active access.
- Adult pilot authorizations are separately operator issued and device-bound (max 14 days), do not reuse the child-consent record and do not create false `FACTORY_COACH_ZDR_VERIFIED` data. Device revocation and budget cutoff remain independent.
- The product is not “zero retention”: save data, learning records, Firestore and backups remain within Jems' own separately disclosed retention/deletion responsibilities.

## Evidence required before merging this combined release candidate

1. Exact-head TypeScript, unit, trusted-device/guard tests, private-coach image, Studio, language/learning, gameplay, creative and independent browser/repair checks all green after integration. Disposition any dependency advisories and unresolved safety review.
2. Test both audiences and transitions: adult tests cannot sneak through the child path, child records cannot authorize adult model/STT, mode flags fail closed, an unauthenticated or revoked device never incurs a new paid request.
3. Maintain existing source SHA/image digest, IAM/WIF and private worker invariants. This integration PR **does not** alter the private worker's protected main pin or cloud activation.
4. Independent security review of the new parent-consent flow's exact notice and actual VPC provider, data map/retention/deletion, COPPA applicability, and exact OpenAI ZDR approval before child data use.
5. For adult real-data pilot: private adult-only app/host access, approved model and Google STT data processing, trusted device ID and owner permit, global safe model moderation/budget approvals, no child testers or prompts, production gVisor image, backend and rollback, real Android and Safari device acceptance, funded synthetic smoke.

### Release acceptance state

This is **source engineering, not production activation**. Our connected GitHub tooling cannot certify a Google Cloud private host, deploy Cloud Run, grant IAM, approve provider ZDR, review legal notices, or run a physical iOS/Android speech microphone test. Do not publish the public child-directed site as an adult private pilot or turn model flags on to make tests green.

Related PRs: [#52 guardian permissions](https://github.com/jzwyrzyk/family-game-factory/pull/52), [#53 adult pilot](https://github.com/jzwyrzyk/family-game-factory/pull/53), [private worker #13](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/13), [release issue #46](https://github.com/jzwyrzyk/family-game-factory/issues/46).
