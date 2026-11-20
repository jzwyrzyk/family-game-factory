# Preserve Adult Jems AI across ordinary releases

**Decision:** [P0 #93](https://github.com/jzwyrzyk/family-game-factory/issues/93). The owner wants the authenticated, private **Adult (development)** account to retain working AI generation after routine Jems site changes. This is an operational continuity contract, **not** automatic approval of provider spending, child AI use, or an extension of adult sessions.

## Independent states

1. **Frontend release:** [manual Pages workflow](../../.github/workflows/pages.yml) builds a reviewed source SHA and updates only the static website. It preserves the configured gateway and preview origins. A frontend-only deploy must never run Cloud Run deployment, repin private workers, change IAM/WIF, adjust budget or turn AI off.
2. **Adult service availability:** The gateway's private configuration `active` and `approval.enabled`, its runtime `FACTORY_ACTIONS_APPROVED`, the protected worker repository's same approval variable, compatible worker/source/image pins, and the separated private coach environment represent independent evidence. Once owner-approved and live-tested, ordinary frontend deployments leave all these unchanged. A **deliberate emergency stop** may still disable them.
3. **Private adult sign-in:** A trusted device, operator-issued permit, passphrase-backed adult login and in-memory per-tab proof remain required. A normal 60-minute session expiry or 7-day (maximum 14-day) operator permit renewal must never demand changing service activation flags. Do not extend session lifetime merely to mask a backend outage.
4. **Worker release rotation:** Only a change to the executable worker or its pinned runtime requires a new reviewed private `P`, immutable `factory-execution-P` tag, exact `FACTORY_PRIVATE_WORKER_SHA=P` variable, WIF restriction matching `P`, and independently accepted immutable sandbox OCI image `D`. Keep the old image/configuration/revision as a tested rollback. Never broaden WIF restrictions to avoid rotating a SHA.

## Current defensive change

The historical `scripts/deployment/deploy.py` always constructs **inactive** gateway configuration and sets `FACTORY_ACTIONS_APPROVED=false`. It is suitable only for first-time, isolated bootstrap. **It now fails before any write** if either Jems service or any private Jems config secret already exists—even if currently inactive. In particular, **never run it to update an activated environment**. Image publication via `scripts/deployment/build.py` separately does not deploy or alter approvals.

An existing production gateway/preview image change must use a separately reviewed, in-place, rollback-capable procedure that preserves current service identity, exact mounted secret versions, environment, origins, family/workspace, signing keys, budgets, permits, private worker pin and traffic until new revisions pass acceptance. Do not create a substitute helper that forcefully resets AI to false. An inactive bootstrap cannot be repurposed as an updater.

The existing Pages workflow makes no Cloud Run/IAM/Secret Manager writes. CI tests now guard the bootstrap boundary. The read-only `scripts/deployment/continuity.py` compares the **current** service readiness and 100% traffic, adult flags, private main/tag/variable, the independent worker approval switch, and live WIF condition—not a volatile immediate before/after WIF snapshot. It prints only sanitized statuses, never credentials or private config contents.

**Historical revisions are not a health failure:** Cloud Run can include older revisions in `status.traffic` with missing/null/zero percentages even though the latest ready revision receives 100%. The audit now ignores only those non-serving entries, retaining strict rejection of a second positive split, a non-ready serving revision, missing readiness or incomplete effective 100% traffic. This correction follows a real sanitized owner inventory on November 20. It changes no service, WIF, session or provider setting.

## Active secret mount versus old configuration volumes

The gateway may retain multiple `factory-gateway-private-config` volumes from prior `--update-secrets` operations. **Only the volume named in the gateway container's `volumeMounts` at `/var/run/factory-config` is active**; unmounted historical volumes are not the live configuration. The read-only `continuity.py` now resolves the mounted volume by exact name and path, rejects ambiguous or unpinned versions, and never substitutes the first secret volume in a list. A later config pin update must apply the same rule and preserve the old mounted version and prior serving revision for rollback.

**Observed November 20, 2026:** the operator's sanitized gateway report showed historical volume `factory-gateway-private-config-ped-cut` with version `2` (unmounted), and mounted volume `factory-gateway-private-config-mis-yek` with version `3` at `/var/run/factory-config`. The only serving revision remained `factory-gateway-00008-tbk` at 100%. No inference about the contents of mounted version 3, its worker pin, or paid activation is justified by the mount metadata alone. Read version 3 separately and print only sanitized fields before any secret-version change. Do not recreate version 2 or overwrite a newer accepted secret.

## Operator read-only verification

From a trusted Cloud Shell with the existing `gcloud` and `gh` authentication, after reviewing the script in the exact merged checkout:

```sh
python3 scripts/deployment/continuity.py \
  --private-worker-sha 21c1b0ee593a9472395ff8a34ef830050d7e5068 \
  --expect-generation inactive
```

When the owner has **separately completed production image/gVisor and adult provider acceptance** and explicitly activated the paid adult environment, run:

```sh
python3 scripts/deployment/continuity.py \
  --private-worker-sha 21c1b0ee593a9472395ff8a34ef830050d7e5068 \
  --expect-generation active \
  --inspect-private-config
```

The second form reads the exact numeric version of the currently mounted gateway private configuration **only in memory**, reports boolean/identity matching without logging its contents, and refuses to claim an active provider based on flags alone. If the mounted version cannot be verified, it fails closed instead of guessing. Avoid pasting private configuration, access tokens, model credentials or adult passphrases into issues or chat.

**Scope:** Read-only automation verifies configuration state, not real model entitlement, pending jobs, replay controls, child access or the successful Build → gVisor test → hosted quality review → Play → Keep → Reload lifecycle. It does **not** activate AI, update WIF, create tags, publish Pages, update Cloud Run or rotate credentials. A green offline contract does not constitute production acceptance.

## Release acceptance for issue #93

- A normal branding/UI Pages release does not alter paid service switches, private keys, worker/source pin, current configuration versions, or active adult authorization.
- Child profiles cannot borrow the private adult session or submit paid work.
- Reauthentication reopens the already-approved tools without a cloud reactivation step.
- A worker change is allowed only through a separate safe pin/OCI rotation and cleanup proof, with rollback retained.
- A bounded real owner Build → Test/Review → Play → Keep → Reload passes after initial activation and after a subsequent ordinary frontend-only release.

The code-level bootstrap guard and read-only audit address part of this contract. **Keep #93 open until real active-state continuity and one controlled live release are verified.** See [adult pilot operations](../adult-pilot/VOICE_RELEASE_AND_UAT.md) and [private worker handoff](https://github.com/family-game-factory-lab/family-game-factory-worker/blob/main/docs/releases/game-quality-review.md).
