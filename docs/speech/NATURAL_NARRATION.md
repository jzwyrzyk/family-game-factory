# Natural narration: implementation and activation handoff

## Current scope

This is a default-off implementation candidate. No API, IAM grant, live flag, provider call, paid account setting or deployment was changed. The child-interface repairs also work with an eligible local device voice. Source readiness and synthetic MP3 tests do not establish actual sound, latency, provider access or mobile playback.

The natural candidate is `en-US-Chirp3-HD-Aoede`, a documented female English voice. Configuration permits only this voice, `en-US-Chirp3-HD-Leda`, or `en-US-Chirp3-HD-Sulafat`. Audition the actual candidate for a warm, clear, caring young adult delivery. A provider's female label does not certify perceived age or emotion. Preserve the original pitch; no cartoon-like pitch shifting is added. The UI describes the reading as a Jems/AI voice rather than a live human.

## Data and authorization

1. An explicit speaker tap calls the existing family-authenticated gateway's `GET /v1/coach/narration/status`. It contains no reading text and does not synthesize audio.
2. Only an available response for the unchanged profile/session allows `POST /v1/coach/narration` with one fresh request ID and the selected plain text. There is no automatic POST replay. Long content above 2,000 characters or 4,000 UTF-8 bytes stays on the device voice, complete rather than truncated.
3. The gateway checks the trusted device, session, separate narration permission, applicable parent/adult boundary and shared monthly allowance. It atomically reserves the configured upper-bound character cost. Microphone and conversation grants do not independently authorize narration.
4. The gateway obtains an audience-bound identity token for the existing private coach. The private executor verifies its exact caller and its own independent narration settings. Only it can call the pinned Google TTS endpoint using its Google service identity. No new API key is used.
5. Both hops return bounded MP3 bytes with `Cache-Control: no-store`. The browser creates a transient object URL and revokes it after completion/cancellation. Navigation or profile changes prevent stale playback. No input text or output audio is persisted in narration receipts.

The scope is narration of text already shown by the trusted UI. There is no microphone, speech recognition, conversation Send, game Build, generated-code narration permission, hidden autoplay or content analytics.

## Settings to review before a later rollout

The gateway and private coach require the same reviewed configuration. All booleans default to false; price/budget/project values default empty/zero.

| Setting | Meaning |
| --- | --- |
| `FACTORY_NARRATION_APPROVED` | Explicitly enables this separate capability after review |
| `FACTORY_NARRATION_PRIVACY_APPROVED` | Review of text-to-speech processing and transient transport |
| `FACTORY_NARRATION_PROVIDER_VERIFIED` | Actual API access and permitted provider use verified |
| `FACTORY_NARRATION_PARENT_CONSENT_APPROVED` | Child-mode enrollment/consent procedure approved; adult pilot instead requires its existing verified adult flags |
| `FACTORY_NARRATION_PROJECT` | Reviewed Google billing/quota project |
| `FACTORY_NARRATION_VOICE` | One of the three exact female Chirp 3 HD identifiers above |
| `FACTORY_NARRATION_PRICE_PER_MILLION_CHARS` | Current reviewed upper-bound price, in microUSD per million characters; no silent hardcoded market price |
| `FACTORY_NARRATION_MAX_MICRO_USD` | Must cover 2,000 characters at that configured price, at most 100,000 microUSD per read |
| `FACTORY_NARRATION_PRICES_REVIEWED` | ISO date within the preceding 31 days |

Child mode additionally requires the existing verified parent conversation/text-processing privacy scope **and** a separate unexpired `narration:true` family consent receipt. The owner consent utility accepts `--allow-narration` alongside its existing external-verification requirements. That utility replaces the full family scope set: include only the other already authorized scopes that should remain granted. Merely setting a browser profile label or a global flag does not supply consent. Revocation during synthesis prevents late delivery while settling possible provider cost conservatively.

The current adult-only pilot remains adult-only. An actual current adult grant is required, even if the normal child UI can see the speaker button. Device narration can remain available when remote narration is denied.

## Accounting and recovery

One family may have one narration request in flight, with at most 12 admissions per minute and a bounded receipt history. A request reserves `ceil(text.length × configured microUSD per million characters / 1,000,000)`. UTF-16 length conservatively counts at least as many characters as Unicode code points. The entire reservation is settled on success or an uncertain provider outcome; this is a conservative internal allowance deduction, not an invoice measurement.

A 20-second provider deadline is shorter than a fixed 60-second receipt lease. A later availability/admission/erasure operation reconciles expired leases once without another synthesis. Reservation identity prevents late completions from charging a replaced or settled receipt. Same-family duplicate IDs fail rather than replay. Completed receipts are retained for at most the bounded history window and parent receipt erasure includes narration; aggregate spend remains. No content cache is introduced.

## Later release sequence

Reconcile overlapping chat-diagnostic and audit changes, then verify the exact combined source. Deploy compatible gateway/private service code with narration disabled; confirm ordinary chat, dictation and local learning remain operational. Separately review the Text-to-Speech API and least-privilege private-service IAM access, current prices and intended family/adult scope. Only after that review, enable the specific narration settings and perform one explicit approved adult reading, recording actual latency and listening feedback. The source change alone does not authorize those cloud mutations or paid requests.

Test physical iPhone/iPad Safari and Android Chrome with sound enabled, a long reply, Stop, replacement reading, profile switching, network loss, denied autoplay and navigation. A device may require a second **Play reading** gesture after download; it must reuse the current audio without another paid request. Keep text and the ordinary device-voice path usable. Browser fullscreen and natural audio acceptance are separate checks.

Rollback the capability by disabling narration approval in both services. Existing ordinary speech/learning does not depend on natural narration. Preserve saved profiles and receipts; reconcile any outstanding leases before erasing completed metadata. Do not replace newer serving revisions with a historical deployment script.

## Evidence and references

`tests/natural-narration.test.ts` and `tests/natural-narration-http.test.ts` use synthetic text/audio and mocked provider transport to exercise default-deny settings, independent consent, trusted identity, origin/CSRF, spend, duplicates, cancellation, expiry, erasure, bounded responses and private-only provider requests. The shared narrator tests cover actual media-start evidence and transient audio lifecycle. These are engineering tests, not a voice audition or production receipt.

Provider sources: [Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd), [supported voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types), [synthesis API](https://docs.cloud.google.com/text-to-speech/docs/create-audio), [data logging](https://docs.cloud.google.com/text-to-speech/docs/data-logging). Review the provider's current permissions and commercial terms during activation; public documentation does not establish account-specific approval.

## Reliability integration

Narration joins the same post-validation private provider-slot admission as coach text and dictation. Unread or malformed narration bodies hold no slot and cannot decrement a slot held by another request. A completed or expired narration receipt releases its carried reservation even after the allowance month changes; uncertain usage remains charged to the original month in a content-free audit record and does not consume the new month’s used allowance. Receipt state and accounting commit together exactly once. These protections do not enable natural narration or prove provider billing.
