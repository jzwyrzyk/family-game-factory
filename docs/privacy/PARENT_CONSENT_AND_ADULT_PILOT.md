# Jems parent privacy and adult-only release — implementation handoff

**Status: engineering draft; no legal certification, external guardian verification, provider ZDR, cloud activation or school authorization established by this change.**

## Parent experience: what is implemented

The Grown-ups → Connected family workshop area uses the existing trusted-device enrollment, parent passphrase and short-lived parent unlock. Only that unlocked parent session can access `/v1/devices/privacy` and `/v1/devices/privacy/revoke`; it is not exposed through the child design/chat composer.

The notice clearly distinguishes OpenAI's separately-approved **Zero Data Retention at the provider** from Jems' own saved game, learning, local notebook, Firestore receipt and backup records. The parent opts into three separate scopes: generated games, conversational coaching, and remote Google Cloud speech. Two affirmative checks record review of the notice and claim of parent/guardian status; neither is **verifiable parental consent by itself**.

The POST creates an immutable server-side pending record with exact notice version, family, trusted device, requested scopes, time, expiry (90 days maximum), and UUID. No raw ID/payment/guardian information is stored. A changed choice immediately revokes the family's previous model/audio consent rather than preserving an older, broader grant. Withdrawal sets revocation and removes active coach/audio consent; provider availability must be rechecked for each request. Same-family access, Origin/CSRF, signed parent cookie, device revocation and input schemas are enforced.

After independently verifying the parent through a legally sufficient process, a trusted operator can use `npm run setup:parent-privacy-verify -- --confirm-external-verification` with private `FACTORY_PRIVATE_CONFIG`, `FACTORY_PARENT_CHOICE_ID` and `FACTORY_EXTERNAL_GUARDIAN_RECEIPT` set in a secure terminal. This marks that **specific pending choice** verified and adds the existing family coach consent scope, with a hash of the off-platform reference. It cannot create approval without a pending parent selection or an active trusted device. It does not and cannot validate real guardianship on its own.

## What does not yet count as legally compliant child launch

The in-app notice is an **engineering draft**, not a finalized operator legal notice. Before any child-directed public rollout, a qualified privacy review must supply the operator's actual contact details and effective-date notice, precise data and provider categories, direct-to-parent delivery, supported VPC method, limits on necessary data, third-party disclosures, parent access/erasure process, account-deletion/backup schedule, incident handling and records of consent withdrawal.

Critical remaining engineering: `verifiedParentScope(...,'generation')` exists but must be adopted and tested at **every** authenticated paid generation admission/worker boundary before any child processing. This PR only wires the already-established coach/audio family consent as an output after operator verification; it does not automatically activate either provider. The legacy operator consent route must be retired or brought under this stricter notice-verification contract before public child activation. Do not use an adult-only pilot to silently bypass these child launch conditions.

OpenAI under-18 API guidance requires appropriate safeguarding and ZDR before processing under-13 personal data; `store:false` alone is not approved ZDR. The actual OpenAI API organization and every applicable project/endpoint, and Google STT data logging/data processing terms, need independent operator verification. Avoid telling parents “we store no data.”

## Adult-only private pilot: separate approval path

An adult-only pilot may use genuinely adult test prompts and recording data without under-13 parental VPC; however, **it needs a real private adult access boundary**. A public child-directed GitHub Pages origin is not made adult-only by a checkbox or a claim in the release notes.

Recommended staging: authenticated owner-only domain or identity-aware ingress restricted to known adults, explicit adult tester enrollment, separate adult-scoped provider approval/budget, versioned audit/retention notice and verified no child profiles/content or public access. Do not set `FACTORY_COACH_ZDR_VERIFIED=true` without actual ZDR approval. Adult-pilot code must have a distinct audience policy and cannot reuse the child consent flag as evidence; keep the child coach and remote speech off until that boundary is implemented and tested.

Safe first testing path: local/on-device speech (if supported) and browser keyboard dictation, synthetic coach tests and adult-only API model samples after normal provider authorization. Remote Google STT requires separate provider/data-processing permissions even for adults.

## Operator release evidence

1. Review this PR and exact-head CI, privacy Http/negative cases and parent UI browser behavior.
2. Record the parent notice/legal reviewer and externally verified VPC provider or process (no secrets in GitHub).
3. Preserve Firestore family/device/history state through compatible deploy; run invalid/expired/mismatched-parent tests on staging.
4. Record real model ZDR status (if available) separately; never derive it from parental permission.
5. Pilot adult isolation first on a private domain with authenticated access; update production generator/preview/coach only after appropriate image, private worker and provider gates.
6. For future children, require independent privacy/security review, school agreement if applicable, full deletion policy and supervised real-device acceptance.

**External references:** [FTC 16 CFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312), [OpenAI Under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance), [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data), [Google Cloud Speech-to-Text data logging](https://cloud.google.com/speech-to-text/docs/data-logging).
