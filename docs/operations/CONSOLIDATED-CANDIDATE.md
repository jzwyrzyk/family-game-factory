# Consolidated candidate for owner review

**Current execution route (November 28):** [Coordinated release package](RELEASE-EXECUTION-2026-11-28.md) supersedes the Cloud Shell transport below. Static DEV/TEST is operational and must be preserved. The commands below describe the original operator's state and approval semantics; they are not current owner instructions. GitHub transport and persistent adult DEV integration remain explicit release blockers until implemented and qualified. No infrastructure or paid activation is authorized here.

The operational successor preserves the application named below. Its protected DEV qualification, named TEST Firestore and four services, private worker execution, and authenticated promotion have dedicated procedures. The earlier activation assessment on this page describes the original owner-review source. [DEV policy](../development/REVIEWED-DEV-SOURCE.md) · [Isolated TEST activation](INTEGRATED_TEST_STACK.md) · [Production promotion](EXACT-MANIFEST-RELEASE.md)


The existing [draft #223](https://github.com/jzwyrzyk/family-game-factory/pull/223) carries the proposed application. The release manifest accompanying its standalone HTML binds the final commit, Git tree, review-file digest and qualification results. A reviewed source, a hosted build, an accepted TEST deployment and a household rollout each have separate receipts.

| Selected input | Commit | Disposition |
| --- | --- | --- |
| Protected main, including modernization and #219 | 652bf9e312fc0776e37b7ef7893835e0fd8136d4 | Engineering base |
| Learning #218 | 7d5979378a050ee3d80519c82929e69dbc58be7e | Present through #223 |
| Creative #220 | 7d204a9b25866bbf3a3a66ccda82f91f0eaaa5d0 | Present through #223 |
| Independently qualified rehearsal #223 | 563de940eacd3f3573bf93236ab5eebd4608043a | Starting point |
| Design #221 | 143b630fba502dc802e0a344708664a16ef24120 | Canonical components, six collection routes and review gallery |
| Directory #191 | 840295e78c232a9ccf19dfae65a5a4e5c9b02f71 | Preserve household website on refresh |
| Operations #222 | a76c2324a5aa35eb9eee6601c2ac128c8808711b | Guarded recovery and diagnostic preparation |

Earlier #192–217 dispositions remain available at the [fidelity register](https://github.com/jzwyrzyk/family-game-factory/blob/2f0a1427a2d183524507b3c81258fe4137c9c3a9/FIDELITY-REGISTER.csv) and [per-PR disposition](https://github.com/jzwyrzyk/family-game-factory/blob/2f0a1427a2d183524507b3c81258fe4137c9c3a9/PR-DISPOSITION.md). #207 and #209 are superseded aggregations. #202, #206 and #212 have scoped local qualification. The 48 shipped world assets and the eight missing raw masters retain their respective dispositions.

The shared header, cards, secondary navigation and collection layout serve Journey, Pals, Rewards, My Powers, My Creations and Notifications. The Learning workspace owns both subjects’ composed surfaces, score, assistance and return. My Art and Creative Studio own their canvases, versions, original artwork and saved movement. The gallery, learning samples and creative journeys coexist in the same review file. See [remaining specialist migrations](../design-system/INVENTORY.md) and [owner journeys](../creative-universe/REHEARSAL.md).

## Operations in release order

1. Restore administrator authentication on the original Cloud Shell. Check the active account and ADC separately. Use a fresh private temporary directory for the launcher. The operator preserves its own state directory. Run the following planning commands there.

   ```bash
   gcloud auth list --filter=status:ACTIVE --format='value(account)'
   # If needed, select/sign in as the authorized administrator.
   gcloud auth login
   gcloud auth application-default login
   gcloud auth application-default print-access-token >/dev/null
   umask 077
   export JEMS_OPERATIONS_RECEIPT_DIR="$HOME/work/jems-operations-recovery"
   recovery_dir=$(mktemp -d)
   cd "$recovery_dir"
   curl -fsSLo nonproduction-recovery.sh https://raw.githubusercontent.com/jzwyrzyk/family-game-factory/a76c2324a5aa35eb9eee6601c2ac128c8808711b/scripts/ops/handoffs/nonproduction-recovery.sh
   echo '4ac3c5ca3375c9208a17da86c5637f35e2b1f63dd1633ec195c0ac72cea1a68b  nonproduction-recovery.sh' | sha256sum -c - &&
     bash nonproduction-recovery.sh --plan --state-dir "$HOME/work/jems-nonprod-state"
   ```

2. Review the operator's private receipt. Expected plan is two creations and 25 no-ops, or an exactly reconciled no-op import if inventory proves a prior creation. Any update, destruction, replacement or drift stops the operator. Only after separate approval of the returned hash, supply those two emitted values below. Preserve the original and all successor files on Cloud Shell. Success requires 27 managed instances, disabled federation and zero change on readback.

   ```bash
   bash nonproduction-recovery.sh --apply-receipt "$REVIEWED_RECEIPT" --approve-plan-sha256 "$APPROVED_HASH"
   ```

3. Qualify the existing broker independently. Use the exact principal/resource/permission matrix and dated interval from the [effective IAM procedure](PRODUCTION_DIAGNOSTICS_SETUP.md#5-verify-before-recording-acceptance). Preserve a private receipt of each effective result, coverage of all sources and the broker revision. The previous response was COVERAGE_UNVERIFIED. Once its workflow correction is authorized on protected main, use the [guarded exact-attempt dispatch and retrieval](PERMANENT_CLOUD_SETUP.md). A successful invocation alone cannot establish zero matching requests.
4. Use the recovered successor configuration for a **separate** Terraform plan with enable_federation=true and cleanup held in dry-run. Review the pool/provider disabled-flag changes, exact immutable repository and owner IDs, exact protected workflow and environment subjects. Save and approve that plan separately. Record the configuration identifiers from the actual successor workspace. Complete any required direct-IAP OAuth setup, then qualify signed identity, denies and exact per-service grants. Set the two runtime accounts, deployer, UAT identity, provider, registry, OAuth audience, approved owner and directory issue through the existing reviewed environment config. First activation uses two previews, TTL 72 hours and scale 0–1. [Permanent setup](PERMANENT_CLOUD_SETUP.md)
5. After explicit infrastructure authorization the main-only controller reconciles eligible successful preview bundles and required checks. Verify anonymous/other-user denial, owner/UAT access, exact served source, per-PR origin and permanent TEST identity. Check actual desktop, phone and tablet sign-in. Reconcile the directory and confirm the household link, TEST source and DEV expiry. [Environment contract](../development/DEV-TEST-PROD.md)
6. Integrated TEST needs its own exact-origin gateway, untrusted preview origin, coach, Firestore, artifact store, private worker identity/network, synthetic reset preserving the spending ledger, and isolated allowances. The current static controller provisions websites. The existing family controller verifies or stages immutable images on **existing** services. It does not bootstrap these dependencies. Use its [descriptor and protected staging contract](../../infra/nonproduction/family-beta/README.md). Qualify real save, restore, privacy, callback and paid admission independently. Historic #106 and the private DEV export provide reference implementations with separate trust boundaries.
7. Seal the tested site bundle, backend image digests, worker execution identity, signed sandbox digest, environment config and acceptance receipts together before production approval. Preserve the existing release-intent, canary and rollback controls. Stage compatible readers before writers. Rehearse backup and restore into a fresh isolated origin with all owners and original artwork, verify retained revision IDs/digests and play old games. Preserve pre-migration snapshots. Roll back to compatible readers or restore a matching snapshot with owner approval. Never downgrade newer records through incompatible writers. [Storage rollout](../storage/ROLLOUT.md) · [Creative compatibility](../creative-universe/CONSOLIDATION.md)

## Generation and spending

Frozen application bc602f1ede502f398308ad56f973c4bf7997ff08, sandbox publisher #169 and private worker #22 retain their original evidence. Production worker main and execution tag select dddf53dbc76796be19782c1bb5bbb99b86e99909. Separate candidate overlays select the consolidated SHA and require new artifact receipts. Keep hosted private artwork delivery off.

For the isolated Adult Private trial, verify project-specific model access, approved handling/retention, authenticated profile and an expiring spending authorization. Published Standard short-context prices checked November 26 were $8 input/$40 output per million tokens for gpt-6.2-astra and $2/$10 for gpt-6.2-sol. Construction and repair select Astra High. Validate stage limits against actual usage and reserve worst-case generation, review and repair against the cumulative $5 lineage ceiling before requests. Keep images off. Use synthetic input, exercise real gameplay on both device layouts, preserve the measured receipts and independent review, explicitly Keep, reload and revise/fork. Verify charged and outstanding reservations across revision, failure and retry. A new revision cannot reset the allowance. Stop on ambiguous billing or an unverified artifact. [Provider pricing](https://developers.openai.com/api/docs/pricing) · [Stage and rollback contract](../game-intelligence/PREMIUM-BUILDER.md)

The $15 monthly cloud budget alerts on project spend. The existing static estimate is about $1.41/month at minimal activity and $5.55 at normal activity before applicable allowances and ancillary charges. Price TEST worker compute, network, storage, private Actions and inference separately before enabling them. Sparse broker use was estimated at $1–5/month. [Cost assumptions](../development/COSTS.md)
