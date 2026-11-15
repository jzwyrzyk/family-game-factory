# Unattended Codex, Actions and supported fallback

Verified from official sources on 2026-11-15; no credential was inspected or used for a real model request.

1. [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) documents `codex exec` and CI use.
2. [Codex authentication](https://developers.openai.com/codex/auth) recommends API-key authentication for programmatic CI/CD; API pricing is separate from ChatGPT included credits. Enterprise Codex access tokens for trusted automation are conditional on workspace/admin grants. We cannot query this user's ChatGPT workspace entitlement from the repository connector.
3. [openai/codex-action action.yml](https://github.com/openai/codex-action/blob/13e9c17417b29e9a276f73ec6ed7fb574137d3c3/action.yml) was retrieved and reviewed. That version describes “Run codex exec”, `openai-api-key`, prompt-file/output schema, model, permission profile and protected safety strategies. It does **not** establish this account's subscription entitlement or expose an approved unattended subscription credential here. Never automate a browser session or reuse the ChatGPT GitHub connector as an API.
4. [Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) supports strict JSON schema in `text.format` with explicit `max_output_tokens` and refusal/incomplete handling.
5. Official model pages retrieved for [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) provide supported Responses endpoints and token prices. Model availability/terms must still be verified in the owner's funded API project.

Decision: prioritize the gateway/Actions architecture. Because no current-account unattended Codex credential/entitlement is verified, implement the supported metered OpenAI Responses coding adapter in the Actions generation job. Do not claim that the local/mock tests are real inference. Subscription activation remains blocked. Switching to Codex Exec later requires separately reviewed credentials, executable sandbox policy and cost controls; the official Action's existence is not approval to expose its process to a public website.

No live-agent smoke is run without the owner completing provider, identity, budget, worker and destination setup. `store:false` requests no Responses application storage, but is **not** a claim of zero provider retention; review current API data/abuse-monitoring policies and child-data consent before sending real prompts.
