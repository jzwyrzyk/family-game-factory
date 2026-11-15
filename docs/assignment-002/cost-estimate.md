# POC cost estimate and spending controls

Estimate date: 2026-11-15. Nothing was purchased, deployed or charged by this implementation. USD estimates exclude tax, regional uplift and owner-specific contracts; verify the actual console/rates before activation.

## Model costs

Official [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) rates retrieved: $0.75 / million input tokens and $4.50 / million output tokens. [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) showed $2.50 / million input and $15 / million output. These are examples, not a model entitlement claim. Cached-token discounts are not assumed. Reasoning/output tokens count against the output cap.

| Scenario | GPT-5.4 mini | GPT-5.4 |
| --- | ---: | ---: |
| One attempt: 2,000 input + 1,000 output | $0.006 | $0.020 |
| Initial generation + one equal-size repair | $0.012 | $0.040 |
| Three worst-case attempts: 24,000 input + 4,000 output each | $0.108 | $0.360 |
| 100 typical jobs, averaging two attempts | $1.20 | $4.00 |

A suggested **owner-reviewed** mini configuration is a $0.12 job reservation (120,000 micro-USD), 24,000 maximum input tokens, 4,000 output tokens per request, at most three attempts, and a $5 monthly model allowance (5,000,000 micro-USD). No default enables these payments. Higher-price models require a re-estimated job reservation; preflight refuses a call whose worst-case token cost exceeds the remaining reservation. UTF-8 bytes plus protocol overhead conservatively bound input tokens before a call. Successful usage settles using provider-reported token counts. Unknown usage/failure/cancellation conservatively consumes the reservation, rather than risking an overspend.

Model ledger units for real jobs are **micro-USD** (1,000,000 = $1). Rates need a fresh owner review within 31 days. The budget covers model tokens only, not GCP/GitHub/runner costs.

## Infrastructure and Actions

The low-volume POC is two request-billed Cloud Run services (gateway and preview), Firestore, a one-minute authenticated scheduler, private secrets, a GitHub App and an isolated runner. No always-on gateway loop/minimum-instance requirement is imposed. Callbacks dispatch repairs immediately; the scheduler provides durable retry/expiry when a callback/dispatch fails.

- **Cloud Run/Firestore/Secret Manager/Scheduler:** plan approximately **$0–10/month** for a small family POC at 100 builds/month, depending on region, free-tier eligibility, prompt/source sizes and polling. This is a planning range, not a quote or cap. The current bounded workspace implementation reads multiple Firestore chunks during polling; a 10-minute build polled four times/second can produce tens of thousands of document reads. Scale down polling or index jobs separately before increasing usage.
- **Isolated runner:** prefer an existing dedicated ephemeral runner. If a new GCP VM is needed, budget approximately **$25–100/month if kept on continuously**, or much less for a few hours of controlled on-demand use, plus storage. VM type, runtime availability and actual idle policy dominate the range. At least 20 GiB disk with an overlay-capable container driver is required for the full browser image/tests; this task's 8 GiB/VFS environment was insufficient for the browser container copies.
- **GitHub Actions:** standard hosted runner execution for a public repository may qualify for free usage under GitHub's current plan; confirm the owner's limits and any paid runner choices. The test runner is deliberately dedicated/self-hosted and its compute is not magically free. There can be three separate generation/test workflow runs per build.
- **Private artifacts:** currently bounded Firestore source/compiled data; no public Actions artifacts. Add private Cloud Storage only when the owner authorizes a larger artifact implementation. No hidden image/audio/model tools are called.

Reference pricing pages to verify during setup: [Cloud Run](https://cloud.google.com/run/pricing), [Firestore](https://cloud.google.com/firestore/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [Cloud Scheduler](https://cloud.google.com/scheduler/pricing), [Compute Engine](https://cloud.google.com/compute/all-pricing), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Hard controls and limits

Default paid execution is off. A parent/owner sets the allowance through the private setup CLI, not the child UI. Enqueue reserves the full job amount transactionally, and per-family admission is limited to ten jobs/minute. Repairs are capped at two. Output size/tokens, job lease, provider abort, worker wall time, CPU, RAM, PIDs, filesystem and network are bounded. A reviewed-tag/SHA mismatch or missing credentials/runtime blocks work.

Cloud billing alerts are **not hard caps**. Apply owner-approved GCP maximum instances, quotas, scheduler policy, runner lifecycle and independent billing alerts/kill switches. Low token allowance cannot prevent infrastructure charges from traffic or an always-on VM. Disable `active`, revoke the Actions App/secret, and stop the runner/scheduler to halt new spend; account for already-running requests before declaring a full stop.
