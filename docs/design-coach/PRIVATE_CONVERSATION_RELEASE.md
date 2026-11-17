# Private conversational coach — release design, owner decisions and acceptance

**Status: engineering draft. Real AI, real child-data processing, remote voice, paid inference, infrastructure changes and public release are NOT authorized by merging this PR.**

This plan is paired with [P0 #28](https://github.com/jzwyrzyk/family-game-factory/issues/28). It replaces the former design of storing the model API key in the public gateway. It does not relocate the generation key, relax worker isolation, or silently enable a product feature.

## Child-led experience, not auto-optimization

The child plays a game, taps **Talk** or **Speak**, and says an idea or question. The coach follows the child's idea across turns using bounded previous context. It can laugh about a fictional spaghetti-sneezing dragon, answer a question, ask one helpful question, or say nothing that demands another response. It does **not** automatically start a generation job, decide the best game, bypass Math/Language Arts, promote a version, or pressure the child to stay in a conversation.

Only the child clicking **Try a change** (or deliberately accepting a first-game plan) requests a game build. The existing versioning system keeps the current working game while alternatives build and test. A child can play Factory Favorites or return to the main game during any ongoing work. Questions, hypotheses, observations and test notes remain optional.

**Conversation quality is measured by child ownership, relevance and clarity — not number of turns, session time or increased engagement.** Adult playtest facilitators must be able to stop a session without penalty.

## Architecture

```text
Child Studio (local text history; tap-to-talk; local TTS if available)
     |
     | HTTPS + verified parent/family session cookie + Origin/CSRF
     v
Existing authenticated Cloud Run gateway
     | validates context, family role, owner approval, ZDR gate
     | reserves family spending, rate-limits, hash-only idempotency
     | requests short-lived Google IAM identity for exact private audience
     v
Independent IAM-restricted private coach service (NO public invoker)
     | verifies gateway service-account ID token + correct audience
     | treats all conversation as untrusted data, validates strict schema
     | input safety -> structured child-led response -> output safety
     | calls approved OpenAI on Google Cloud via its OWN Google IAM identity
     v
Private-preview Google Cloud Responses API (stateless, store:false)
     |
     v
Validated reply -> gateway -> Studio text & optional *local* TTS
```

The browser, gateway, GitHub Actions generation workflow, preview origin and untrusted code sandbox never receive a model API key. The existing `factory-generation` environment key is untouched. The private coach does not have generation or publishing permissions. The gateway can only call a pinned private `.run.app` origin, never a child-supplied URL. The private service has only the minimum allowed Model Garden and private speech permissions, not access to the generation worker's secrets/storage.

**Provider viability warning:** OpenAI on Google Cloud is **private preview** at this time, and the published preview form describes internal/testing uses, not unrestricted public production. Product launch requires written commercial/technical approval and an explicit production-capable service agreement. If unavailable, return to architecture review; do not secretly migrate the generation key into Cloud Run.

## Required gates (all default off)

| Decision | Source / evidence | Fail-closed behavior |
|---|---|---|
| Is there a real permitted guardian, with verified permission per child/family? | Adult identity, parental consent record, withdrawal path | No AI, no remote audio |
| Can this *specific* model/platform legally process under-13 personal data with applicable ZDR? | Executed ZDR/project approval & contract, including private preview and safety subprocessors | No AI |
| Is OpenAI on Google Cloud production/private pilot access approved? | Google/OpenAI offer, model enablement, pricing, Vertex API access | No model request |
| Are safety filters and emergency escalation reviewed for ages 6–10? | Human review, diverse adversarial scenarios, incident owner | No AI |
| Are exact IAM principals and origins verified? | Cloud Run private invoker & gateway service account, no public access | Deny network requests |
| Is parental approval of remote audio distinct and recorded? | Adult controls and clear pre-recording notice | Local mic only |
| Is private speech transcription provider approved with default audio logging OFF? | Google Cloud STT project metadata, retention, cost, data policy, opt-in audit | No remote audio |
| Are model and speech spending capped by family, request and monthly budget? | Ledger receipts and explicit allowance | Hard cutoff |
| Does the latest PR CI pass and do real devices work? | Exact SHA, Playwright tests, iOS/Android Safari/Chrome, real network timing | No release |
| Does a child/family deletion request actually purge all local, backups and server data? | Tested deletion/retention workflow, backup policy | No public launch |

`FACTORY_COACH_APPROVED`, `FACTORY_COACH_PRIVACY_APPROVED`,
`FACTORY_COACH_SAFEGUARDS_APPROVED`, `FACTORY_COACH_ZDR_CONFIRMED`,
`FACTORY_COACH_FAMILY_CONSENT_CONFIRMED` and
`FACTORY_COACH_PRIVATE_BROKER_APPROVED` are *technical attestations* and do not, by themselves, prove parent consent or a legal ZDR agreement.
The application must ultimately enforce a verified **per-family** authorization record, not only global environment flags. Until that exists, the only eligible release is a documented adult-supervised owner-only pilot using synthetic/non-personal test prompts.

## Privacy and retention

- **Audio:** Tap-to-talk only, no passive listening. Local Web Speech accepts only verified `processLocally`. Platform keyboard dictation has its own OS policies and is **not guaranteed private**. A separately approved private STT fallback is a separate explicit child/adult choice, never an automatic switch to cloud; audio is processed transiently, size- and time-limited, and never attached to a game, saved in localStorage, used to train models, or sent with game-building requests.
- **Conversation:** Text history and current child intent live in the existing per-device per-player Studio notebook. Under-13 personal data cannot be sent to a model before ZDR is confirmed. `store:false` alone does not turn on ZDR. Child data must never appear in routine server/CI logs or analytics.
- **Gateway receipts:** Keep only request IDs, content hashes, family/subject identity, reservation/usage, status and timing; no raw child messages, audio or model replies. Prune receipts; scope retrieval to the family. Audit contains no free-form child text.
- **Local erase:** The explicit *Clear this conversation* control deletes this project's messages and unsent chat text only. It **does not** delete design-plan decisions, game versions, learning evidence, previously exported backups or other copies. Privacy notices must say so. Full deletion requires separate parent-scoped erase and backup/remote erasure implementation and verification.
- **Consent withdrawal:** Must revoke future model/audio processing immediately and invalidate session tokens and any outstanding requests; document retention of already exported backups and immutable audit identifiers.

## Voice coverage is a release blocker, not a cosmetic feature

As of the November 2026 browser compatibility evidence, local `SpeechRecognition.processLocally` has limited support, especially on mobile Safari and Chrome for Android. A microphone drawn on-screen is NOT evidence voice works. The next reviewed alternative is a Google IAM-backed private STT service with synchronous in-memory audio and no logging opt-in, but this needs parent permission, privacy procurement and cost caps before being connected. A tested on-device WASM STT model could be another path if size, latency and battery tests are acceptable.

For every actual tablet, measure first permission, start, stop, no-speech, unclear speech, interrupter/timeout, background-tab, network failure, correction, transcript quality (including children's speech), read-aloud availability and return to the game. Keep text visible; never force read-aloud.

**No retention or procurement claim is made about a provider simply because its docs offer a no-logging mode**: verify our specific project, region, service and contract before enabling any minor data.

## Conversation performance and quality acceptance

The existing 20 synthetic coaching scenarios plus a new multi-turn dataset must cover child-led jokes, new mechanics, explicit ask for ideas, repeated “I don't know,” winning but bored, bug vs design weakness, refusal of compulsory lessons, sensitive information, sibling isolation, pressure to stay, a long parallel game build, voice transcription mistakes and a child canceling mid-reply.

Minimum automated checks: no suggestion can execute a game; no speech can build; no model response can edit the working revision; unsupported browser stays local; status check precedes any text POST; network/timeouts do not erase drafts or mislead about real AI; cross-profile conversation cannot leak; parent settings cannot be changed by a child; all model schemas and evidence IDs validated.

Sample performance **targets for owner review (not demonstrated facts)**: model non-streamed median turn under 4 s, P95 under 10 s, cancellation feedback under 0.5 s; private STT turn-to-text median under 3 s once recording ends. Measure on realistic home Wi-Fi and mobile hardware. If exceeded, prefer nonblocking play and intelligible state over fake “instant” replies. Never silently fail over to a weaker/remote speech provider.

Human child pilots: supervised, opt-in, minimum exposure, multiple age/reading levels, no identifying data in research summaries. Score relevance, child's ownership, comprehension, interruptibility, error recovery, harm and actual desire to continue playing; do not claim math/literacy improvement or therapeutic benefit from synthetic benchmarks.

## Deployment and rollback checklist (separate authorization only)

1. Freeze reviewed public SHA, private coach code SHA, model/version, IAM policy, exact private domain, costs, consent/ZDR evidence and privacy owner.
2. Provision a **new dedicated** private Cloud Run service with ingress restriction/no public invoker; confirm identity validation, least-privilege Vertex access, no model key, sanitized logs and no retained request bodies. Owner must authorize all cloud and IAM changes.
3. Run fixed *synthetic* prompts through the real provider with an explicit bounded pilot allowance and separately approved billing. Verify idempotency, zero storage as contracted, moderation, latency, token spend and cancellation. A GET model entitlement probe alone is insufficient.
4. Confirm consent and parent controls, full deletion/backup rules, speech provider no logging opt-in, and real device acceptance **before using any child's voice or personal history**.
5. Enable only the owner-approved family with a reversible kill switch and monthly hard cap. Publish a new frontend separately via the manual Pages workflow. Merge is not deployment.
6. If latency, harm, moderation, data processing or cost gates fail: switch model/remote speech flags OFF; native games, required Math/Language Arts and saved versions must continue. Revoke private service invoker separately if needed. Document incident and record evidence without saving child content.

## Official references

- OpenAI under-18 / under-13 API requirements: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- OpenAI on Google Cloud private preview & capabilities: https://developers.openai.com/api/docs/guides/google-cloud
- OpenAI data / ZDR limitations: https://developers.openai.com/api/docs/guides/your-data
- OpenAI Google Cloud limited preview request: https://openai.com/form/openai-on-google-cloud/
- Google Cloud Speech-to-Text v2 synchronous REST: https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v2/projects.locations.recognizers/recognize
- Google Cloud Speech-to-Text data usage: https://docs.cloud.google.com/speech-to-text/docs/v1/data-usage-faq
- MDN browser speech support: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- MDN on-device quality options: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static
