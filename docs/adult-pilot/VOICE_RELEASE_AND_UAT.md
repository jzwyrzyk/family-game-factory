# Jems adult-only private pilot — protected generation, coach and remote voice

**Release status: proposed code; no cloud/provider access, ZDR approval or production activation is established by this file.**

## Why a separate pilot path exists

The product is designed for children. OpenAI's under-18 guidance and FTC COPPA rules still apply if it processes children's data. For genuinely adult-generated test data, under-13 verifiable parental consent is not required. Do **not** mark `FACTORY_COACH_ZDR_VERIFIED=true` or `FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED=true` without evidence.

This implementation adds a separately named **ADULT private pilot** policy. It is not active by default. It requires (a) a private, adult-only hosted app origin, not the existing public GitHub Pages children's site, (b) explicit operator/provider/privacy acceptance, (c) a currently authorized trusted device with an owner-stored, short-lived adult tester receipt, and (d) existing account, spend, dedicated Cloud Run IAM, origin, CSRF and sandbox security.

## Explicit adult audience controls

Environment switches on the **existing keyless gateway and separately approved dedicated private coach service**:
- `FACTORY_ADULT_PILOT_MODE=true` (default false)
- `FACTORY_ADULT_PILOT_OWNER_APPROVED=true` after owner accepts adult-only scope and permitted test data
- `FACTORY_ADULT_PILOT_PRIVATE_HOST_VERIFIED=true` **only after** a separately reviewed private host/access-control configuration is proven

The gateway rejects pilot mode if those approvals are incomplete or `appOrigin` is a `github.io` URL. These operator flags are an auditable assertion of restricted hosting, not a replacement for inspecting the actual identity-aware proxy or Cloud Run access restrictions. A public Pages link is not private merely because a server flag says it is.

A trusted owner machine enrolls one explicit adult device via `npm run setup:adult-pilot -- --confirm-adult-owner-review`, reading `FACTORY_ADULT_PILOT_DEVICE_ID`, `FACTORY_ADULT_PILOT_OWNER_RECEIPT` and `FACTORY_PRIVATE_CONFIG` from secured operator context; optional `FACTORY_ADULT_PILOT_DAYS=7` (1–14 days). The device must already have been enrolled through the existing trusted family-device mechanism; the operator manually verifies that the named tester is an adult. The adult-permit record stores only family/device ID, expiry and SHA-256 of the external audit reference, **not a reusable token or an identity document**.

To revoke: `FACTORY_ADULT_PILOT_DEVICE_ID=... npm run setup:adult-pilot -- --revoke` on the trusted owner machine. Device revocation is also effective. A different device, a legacy signed session without trusted device, an expired permit or a child-family parent role cannot reach the adult pilot. Same-session checks re-run **before** paid model/STT admission and **after** the provider returns; previously cached replies cannot bypass revocation. Private worker claim, dispatch and ready/report checks reject jobs whose recorded adult device is no longer authorized.

## Provider and privacy gates that still apply to ADULT data

For model-backed conversation, retain `FACTORY_COACH_APPROVED`, `FACTORY_COACH_PRIVACY_APPROVED`, `FACTORY_COACH_SAFEGUARDS_APPROVED`, `FACTORY_COACH_PRIVATE_EXECUTION_APPROVED`, exact model/snapshot, reviewed token prices and per-family spend caps, and a separate new scoped `FACTORY_COACH_PRIVATE_OPENAI_API_KEY` only in the IAM-protected service. Adult mode does **not** assert OpenAI ZDR, so false `FACTORY_COACH_ZDR_VERIFIED` is acceptable solely in the adult-isolated mode; normal child mode still requires true verified ZDR.

For remote Google STT, also retain `FACTORY_COACH_AUDIO_APPROVED`, `FACTORY_COACH_AUDIO_PRIVACY_APPROVED`, `FACTORY_COACH_AUDIO_PROVIDER_VERIFIED`, approved project/region, `roles/speech.client` restricted to the coach service account, disabled data logging opt-in, reviewed prices/limits and parent/local microphone browser permissions. In adult pilot mode `FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED` is not the adult authorization mechanism; the owner adult device permit is. No recording begins automatically, each short audio clip fills an editable draft, and a separate Send action triggers conversation.

The unrelated **AI generation worker** retains its existing private tag, approval, cost, WIF/gVisor isolation, replay, idempotency and trusted-device controls. When adult pilot mode is enabled in the gateway, remote job admission and worker dispatch/claim/report require a matching authorized adult device. Jobs created before the adult pilot gate cannot silently continue under its new rules.

## What must be proven before calling this production

1. Actual restricted hosting: private same-site app origin behind verified adult-only access control; never use public `jzwyrzyk.github.io` as an adult-private origin.
2. The owner has reviewed OpenAI API data controls for ADULT content and current Speech-to-Text V2 region, terms, data logging, IAM and rates. Do not conflate this with pending ZDR for children.
3. A named adult's already-enrolled trusted device is bound to a short-lived operator receipt; rejected/revoked/expired/fake devices tested with real signed sessions, not only fake role claims.
4. Compatible existing gateway, preview and private coach images: no secret in app/gateway/runner; identity token audience checked; Cloud Run private route verified; stable rollback.
5. Approved private worker exact full source SHA, pinned OCI gVisor image and no-egress test; no manual dev branch or mutable-main worker checkout.
6. Real adult Chrome/Android and Safari/iPadOS testing: short speech (Finish → editable transcript → explicit Send), denied microphone/offline/unsupported browser, typed fallback, no auto-build, repeated conversations, app switch, revocation during request, math/language interruptions, one complete game build → real sandbox test → repair → Play → Keep → reload. Log only opaque IDs and timings; no transcripts.
7. One bounded synthetic paid-provider smoke followed by adult-generated test content, with explicit owner authorization and hard budget cap. Record model vs speech spend separately.

### Known limitations

- This PR cannot deploy GCP resources or verify the owner’s live project from GitHub alone.
- An operator-controlled "adult" record is an owner permission, not legal age verification; the hosting boundary must be independently tested.
- Existing Jems public/local game content remains child-directed; this PR is **not** a legal exemption for making a public child-directed app available to children.
- `store:false` for OpenAI requests does not establish that ZDR has been granted.
- The standalone parent-consent work is in PR #52 for eventual child release; this adult-only track must not be merged over or weaken that contract.
- Final code merge is not a live cutover or proof of actual model/STT reliability.
