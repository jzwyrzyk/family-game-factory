# Issue #28 — child voice, device compatibility and offline speech

> **MVP scope update (2026-11-18):** Jems is **not** pursuing continuous or real-time live voice. The accepted design is tap Speak -> transcribe -> **editable draft** -> deliberate **Send to jems** -> normal text AI reply. No automatic Send, automatic Build or automatic spoken answer. A second tap finishes transcription; navigation/profile change aborts. The [push-to-talk MVP acceptance contract](PUSH_TO_TALK_MVP.md) takes precedence over earlier research prioritization below. Reliable iPad/Android in-app Speak requires a separately consented private STT fallback if local browser recognition is unavailable; keyboard dictation/type remains the transparent fallback until that route is approved and tested.

**Status:** research and validation specification; no new microphone service or
audio transfer is activated by this file.

## Current implementation and limitation

`src/studio/voice.ts` deliberately requires browser speech recognition to
prove `processLocally=true` and an available on-device language pack. The
app must never quietly flip to `processLocally=false`, because browsers may
otherwise send audio to a vendor-controlled server. The microphone only opens
after a direct child action; stopping, changing game/profile, losing focus and
required learning checkpoints preserve the existing cancellation rules.

**This cannot currently be treated as universally available on children's
devices.** MDN documents `SpeechRecognition` as having limited availability.
Current compatibility information indicates `processLocally` support is
available in some desktop Chromium browsers, but **not** broadly in Safari
on iOS or Chrome for Android. The user must not be shown an inactive Speak
button that pretends to be capturing or transcribing.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- https://caniuse.com/mdn-api_speechrecognition_processlocally

## Candidate paths and their trade-offs

### A — Private, fully local browser transcription (optional future optimization)

Evaluate a small downloadable English speech-to-text model executing in
browser-controlled WebAssembly or WebGPU. Do **not** select an unverified
model/package or copy a third-party model with unknown licensing.
The child would grant microphone access only on tap; transcription happens
in-memory, raw audio is never sent to the application backend, and the
resulting *text* follows the same bounded conversation path already tested.

Required measurements on actual target devices: package/download bytes,
cold-start time, memory peak, battery usage, dictation WER, p50/p95
transcription-to-screen latency, offline behavior, low-storage behavior,
content-safety and parent disclosure. A substantial first-load delay or
out-of-memory crash is a blocker, not an invitation to hide a remote fallback.

### B — OS keyboard dictation (current fallback)

Works only insofar as the device keyboard offers dictation. jems cannot
guarantee that the operating system performs dictation locally and therefore
must label it as a device-controlled option, never claim it meets the app's
on-device audio privacy guarantee.

### C — Explicitly approved private speech service (MVP target for unsupported mobile browsers; not active)

Requires an independent parent consent/privacy review because children's
voice data may be personal information. If considered, verify encrypted
transport, age-appropriate consent, the vendor's retention/ZDR and logging
policies, moderation, short TTL, cost, audio deletion and audit scope.
Do not add MediaRecorder or send raw audio to the AI generation endpoint as
a shortcut. This is a distinct system from text-only LLM inference.

## Functional acceptance matrix (all unchecked until actual device evidence)

| Device | Browser | On-device SpeechRecognition | Offline model candidate | Permission-denied | Interrupted session | Long conversation |
| --- | --- | --- | --- | --- | --- | --- |
| iPad | Safari | Verify on device | Benchmark | Test | Test | Test |
| iPhone | Safari | Verify on device | Benchmark | Test | Test | Test |
| Android tablet | Chrome | Verify on device | Benchmark | Test | Test | Test |
| Windows PC | Chrome/Edge | Verify on device | Benchmark | Test | Test | Test |

Test short child speech ("make a dragon sneeze spaghetti") and context
follow-up ("only when I jump") with **transcribed text in an editable composer, no model calls before Send**, text replies always visible and optional local Hear reply. A child can tap Stop without uploading audio or triggering
a game build. A later transcript never crosses a profile switch. An active
Math or English question remains authoritative. Missing packs, unsupported
APIs, denied permission, empty speech and network-offline mode all fail
closed with understandable and actionable child copy.

## Release gate

No generalized "voice works for all children" claim until both target
mobile platforms are verified. If A is too heavy or incompatible and C
has not been separately authorized, continue with typing and transparently
described keyboard dictation rather than silent cloud STT.
