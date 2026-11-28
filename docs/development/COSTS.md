# Incremental nonproduction costs

**Planning model, November 23, 2026 (America/New_York).** These figures are estimates, not observed bills, a provider quote or approval to spend. They cover the proposed separate nonproduction project. Existing production charges remain separate. Recalculate from the selected regional SKUs and the actual provider/worker design before activation.

**Superseding live DEV / integrated TEST proposal:** the [November 28 coordinated approval package](../operations/RELEASE-EXECUTION-2026-11-28.md#completed-planning-cost-model) includes the owner's $40 DEV / $60 TEST infrastructure planning ceilings, existing static charges, complete resource-class pricing, finite AI allowances and minimum administrator actions. This older static-only scenario remains historical planning evidence, not a complete live-stack quote.

## Assumptions

Each static frontend uses request-based Cloud Run billing, 1 vCPU, 512 MiB, zero minimum instances and one maximum instance. Multiple idle previews do not each incur a permanently running VM. The workload estimate uses **aggregate billable instance-hours**, not browser-open hours. Image/artwork retention is bounded; the prior PR106 build measured about 234 MB of artwork, so retaining every build indefinitely would dominate this small application's storage.

Reference rates before shared free allowances, discounts, tax and networking:

- Cloud Run CPU: `$0.000024` per vCPU-second; memory: `$0.0000025` per GiB-second; requests: `$0.40` per million. At this instance size, one billable hour is approximately `$0.0909`.
- Artifact Registry storage: approximately `$0.10` per GiB-month. Container layer sharing can lower stored bytes; cleanup removes obsolete tags/manifests only after their retention window.
- Standard GitHub-hosted execution for this public repository: `$0` under the public-repository policy. Private-worker minutes, larger runners and storage overage are separate. A standard private Linux two-core reference is `$0.006` per minute after the applicable allowance.
- Basic IAP has no separate service charge. Direct Cloud Run IAP avoids adding a load balancer. Google billing budgets notify; they do not enforce a hard cap.

Sources: [Cloud Run pricing](https://cloud.google.com/run/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [IAP](https://cloud.google.com/iap/pricing), [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage), [runner rates](https://docs.github.com/en/billing/reference/actions-runner-pricing). These rates are a planning basis and must be rechecked for the actual billing account and region.

## Monthly scenarios

| Component | Minimal activity | Normal activity | Five simultaneous streams | Ten simultaneous streams |
| --- | ---: | ---: | ---: | ---: |
| Aggregate Cloud Run billable hours | 10 | 50 | 150 | 300 |
| Cloud Run compute estimate | $0.91 | $4.55 | $13.64 | $27.27 |
| Retained registry storage assumption | 5 GiB | 10 GiB | 25 GiB | 50 GiB |
| Registry storage estimate | $0.50 | $1.00 | $2.50 | $5.00 |
| Public standard Actions execution | $0 | $0 | $0 | $0 |
| Indicative static-site infrastructure + registry envelope, allowing modest requests/network/logging | **$2–5** | **$6–15** | **$18–35** | **$35–65** |
| Ordinary fixture inference | $0 | $0 | $0 | $0 |
| Live inference while disabled | $0 | $0 | $0 | $0 |

The envelope is the sum of the compute/storage estimates and a planning allowance for small ancillary usage; it is not a guaranteed upper bound. Preview count alone does not determine spend. Build frequency, active requests, asset downloads, test duration, image retention and actual paid jobs matter more. Data transfer, large log volumes or unexpectedly busy services can exceed these assumptions.

GitHub artifact retention also needs a separate storage review against the owner's plan. The proposed large frontend archives have short retention. The table's registry storage is not a claim that GitHub artifacts, Firestore, GCS objects or private-worker disks are included for free.

## Complete TEST and private execution

The static-site estimate is **not a complete priced live-AI TEST stack**. TEST will add isolated gateway/preview/coach usage, Firestore operations/storage, GCS artifact storage/operations and private sandbox worker execution. Their Cloud Run billable hours can be added to the same formula; actual database operations and artifact egress need measured scenarios.

If the retained PR106 worker design uses dedicated NAT/IP resources, those may have standing charges even when no preview receives traffic. Do not silently install them under a scale-to-zero claim. Select the smallest working private-worker network design, price its actual NAT/IP/VM/disk usage, and include it in the reviewed setup before enabling real-provider acceptance. Sources: [Cloud NAT](https://cloud.google.com/nat/pricing), [Compute Engine](https://cloud.google.com/compute/all-pricing), [Firestore](https://cloud.google.com/firestore/pricing), [Cloud Storage](https://cloud.google.com/storage/pricing).

For private GitHub-hosted work, an illustrative 60 / 300 / 900 / 1,800 billable minutes would be `$0.36 / $1.80 / $5.40 / $10.80` at the reference two-core rate, before plan allowances. A self-hosted GCP worker instead incurs its VM/network/storage charges; do not count the same execution twice or assume it receives GitHub-hosted free compute.

## Real-provider allowance

No model or paid request is enabled by these estimates. Record provider, model, input/output/image/audio pricing, maximum calls, maximum tokens, concurrency, approval expiry and an aggregate server-enforced admission allowance before activation. Generation, review, repair, coach and speech can make different calls and need separate maximum-cost assumptions. Do not reuse a production budget or refill an admission ledger by resetting fixtures.

The monthly arithmetic is:

`text inference = input tokens ÷ 1,000,000 × input rate + output tokens ÷ 1,000,000 × output rate`

For a transparent sensitivity example only, assume one test job uses 25,000 total input and 5,000 total output tokens across all calls, priced at an **illustrative** `$2/$10` per million input/output tokens. That is `$0.10` per job; 5 / 20 / 50 / 100 jobs would cost `$0.50 / $2 / $5 / $10`. These are invented arithmetic inputs, not the price of an approved Jems model, a complete generation estimate or a spending commitment. Real game generation with review/repair, premium models, images or speech may cost substantially more. Replace the inputs with the approved configuration before setting an allowance.

A practical first activation can approve a small finite trial allowance after the actual provider configuration is available. PR106's former $5 aggregate admission proposal is reusable design evidence, not an approval carried into this new project. Fixture-only previews remain useful while live-provider configuration is unresolved.

## Cost controls and measurement

Enforce preview count, maximum instances, TTL, bounded artifact retention and scheduled reconciliation. Keep AI off by default and ordinary CI deterministic. Record run duration, preview age, retained bytes and provider admission/settlement totals without storing private prompts. Review actual usage after the first accepted two-preview/TEST trial and revise the four scenarios. Budget alarms, kill switches and cleanup failures must be visible in the owner directory; none replaces transactional paid admission or a verified cleanup receipt.
