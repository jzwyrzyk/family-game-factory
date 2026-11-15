# Coding-agent authentication and cost research

Reviewed 2026-11-15. No credentials were inspected, no model call was made, and no paid job was run.

Official documentation retrieved for this assignment:

- [Non-interactive mode](https://developers.openai.com/codex/noninteractive): `codex exec` supports scripts/CI and reuses saved CLI authentication. The automation guidance recommends the Codex GitHub Action for Actions, and restricting credential exposure when repository-controlled scripts run.
- [Authentication](https://developers.openai.com/codex/auth): API-key authentication uses standard API pricing rather than included ChatGPT plan credits. The page explicitly recommends API-key authentication for programmatic CLI workflows such as CI/CD and says not to expose Codex execution in untrusted/public environments. It also documents **Enterprise** Codex access tokens for trusted automation, conditional on workspace permissions/admin grants.
- [Pricing and entitlements](https://developers.openai.com/codex/pricing): CLI/SDK/non-interactive access and trusted automation entitlements depend on plan/workspace; usage limits and credit charges apply. Exact rates and entitlements can change; this repository has no approved model/worker allowance or verified enterprise automation credential.

These sources establish that unattended tooling exists; they do **not** establish that this account's ChatGPT subscription, installed GitHub connector, or a public Pages site may call it as a free general API. We have not verified an eligible enterprise workspace, an authorized unattended token, workload identity, a funded API project, isolated agent runner, or acceptable per-job/monthly cost here.

Decision: `codex-subscription` and `metered-api` adapters are explicitly **unavailable**. There is no shell invocation, browser credential, GitHub PAT, automated Codex-tab interaction or success-shaped production mock. `local-rule` is implemented in the browser; the `MockAgent` exists only under `server/testing` for CI, where the UI visibly says “Test builder (mock)”.

Before activating a real adapter, the owner must verify current authorization/entitlements and billing, approve hard application budgets, provide server-only credentials through managed identity/Secret Manager, and supply a worker with enforced egress/resource limits. Implement and test the actual provider adapter and a real-agent smoke test against that configured worker. A subscription adapter must not be enabled merely because a user has Plus/Pro or installed the connector.
