# Jems parent privacy and temporary adult development profile

Private beta processing also requires the current family capability, platform spending policy and independently reviewed provider evidence for that scope. The gateway computes those permissions on every workspace read. See the [tenancy contract](../family-beta/ARCHITECTURE.md).

This change adds a temporary authenticated adult development profile to the existing Jems website alongside ordinary child profiles. Once deployed and configured, switching to Adult (development) activates approved AI tools after the existing passphrase unlock. It needs neither another site nor a separate activation button. See [the adult release guide](../adult-pilot/VOICE_RELEASE_AND_UAT.md) for the session contract and deployment steps.

## Parent choices in Grown-ups

The Connected family workshop uses trusted-device enrollment, the parent passphrase and a short parent-management unlock. Only that unlocked parent session can access `/v1/devices/privacy` and `/v1/devices/privacy/revoke`. Adult developer authorization and verified guardian consent are separate records; neither creates the other.

The parent independently chooses generated games, conversational coaching and remote Google Cloud speech. The notice distinguishes provider Zero Data Retention from Jems' saved games, learning data, local notebook, server records and backups. Acknowledging the notice and affirming guardianship creates a **pending** choice.

Each choice records the exact notice, family, trusted device, guardian session subject, boolean scopes, request time, maximum 90-day expiry and UUID. Changing scopes immediately revokes older permission. Withdrawal revokes the family's records and removes active coach/audio consent. Same-family access, exact Origin/CSRF, signed parent cookie, live-device checks and strict input schemas protect the routes.

## Completing external verification

After independently completing the required guardian check for that exact choice, the trusted operator runs:

```sh
npm run setup:parent-privacy-verify -- --confirm-external-verification
```

Provide `FACTORY_PRIVATE_CONFIG`, `FACTORY_PARENT_CHOICE_ID` and `FACTORY_EXTERNAL_GUARDIAN_RECEIPT` through the secured operator environment. The parent-only pending status includes the exact choice UUID to use for `FACTORY_PARENT_CHOICE_ID`; this reference is not a receipt or credential. Both this verifier and adult-permit setup reuse the existing configured workspace and optional `artifactBucket`, including its externalized game artifacts. The command stores only the SHA-256 digest of the external reference and activates the chosen scopes. It does not independently validate real guardianship.

The verifier refuses an old notice, expired/revoked/replaced choice, reused receipt, inactive device, malformed scopes or incomplete prior verification. Runtime checks require complete evidence and sensible request/verification/expiry order. A restored timestamp without its receipt cannot authorize paid processing or display verified status. A fresh current-notice choice is needed when earlier evidence is unusable.

The production child gateway requires this current choice alongside provider, privacy, safeguards, price and budget approvals. It checks generation before paid submission and through worker completion; conversation/speech require their respective scopes before and after provider work. Fixtures explicitly omitting `requireVerifiedParentPrivacy` do not describe production child policy.

## Adult development on the same frontend

The rollout requires `FACTORY_ADULT_PILOT_MODE`, `FACTORY_ADULT_PILOT_OWNER_APPROVED` and `FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED`. The existing public frontend origin is supported. A private frontend hostname is no longer required; model credentials and execution remain in the dedicated private backend.

An operator permit makes a known adult's enrolled device eligible. The profile switch creates a separate, revocable session lasting at most 60 minutes. API requests need its HttpOnly cookie, tab-specific in-memory proof, matching trusted device and current permit. Local names, another tab's cookie or silent family-session renewal do not create adult authority. Switching to a child clears adult access and UI context. Reload/new tab starts locked. Adult local notebooks/games remain in a separate device-bound workspace and do not adopt child conversations or drafts.

Adult mode restricts remote AI to that authorization while child profiles retain local behavior. It does not set child consent or provider ZDR flags to true. Model, speech, budget, worker isolation and private routing approvals still apply. Disabling the temporary mode restores the child consent policy with its existing fail-closed approvals.

## Evidence outside this source change

Before processing child data, complete the operator's actual notice/contact information, direct parent delivery, appropriate external verification process, data/provider inventory, access/erasure and backup policy, withdrawal handling and applicable provider approvals. This form is not a legal certification. Provider ZDR is independently verified; a request option such as `store:false` does not establish approval.

Before an adult production test, deploy compatible source/image pins and approved model/speech configuration, verify authenticated profile switching and cross-profile isolation on the existing site, complete a bounded provider smoke and test microphones on real Android/iOS devices. Merge and fixture CI do not perform these steps.

Reference material for operator review: [FTC 16 CFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312), [OpenAI Under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance), [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data), [Google Cloud Speech-to-Text data logging](https://cloud.google.com/speech-to-text/docs/data-logging).

In beta, replacing or withdrawing a choice stops active generation and settles its reservation. An exact approved family case lets the guardian download server records. A separately authorized executor removes the family's workspace and artifacts after case verification. See the [data flows and evidence checklist](../family-beta/PRIVACY.md).
