# Jems MVP — push-to-talk, editable transcription, and turn-based AI chat
**Decision: 2026-11-18. Source state:** the implementation from [PR #36](https://github.com/jzwyrzyk/family-game-factory/pull/36) is merged and included in the #43 application baseline. This remains a design and acceptance contract, not deployment or provider evidence. Consult [Delivery state](../../DELIVERY-STATE.md) for current authorized pilot scope and observed operational status.

## Product decision and exclusions

- Child may type OR tap **Speak**, talk once, and tap **Finish speaking** (or pause until recognition ends).
- Speech becomes an **editable text draft** in the existing Studio composer. It **never auto-sends**, auto-builds, queues a job, or promotes a game. The child can correct, add to, delete, or abandon it.
- Only the explicit **Send to jems** action submits the reviewed text to one ordinary, turn-based, contextual AI conversation. A separate **Build/Try a change** action initiates generation or local edits.
- The AI can reply with text; **Hear reply** is an optional, explicitly requested, local voice output when available. No required spoken reply.
- No continuous listening, background microphone, streaming conversation, open-mic turn-taking, interruption/barge-in or automatic microphone restart. The app must not imply ChatGPT-style real-time audio.
- Preserve child ownership, conversation context per player/project, safety, limits, design notes, learning checkpoints, versions, and truthful local fallback. The product is *asynchronous conversational AI with push-to-talk input*.

## What is implemented now vs. missing

- Merged #27/#35 provide Studio conversation, play/build separation, bounded context, local reflection fallback and a privacy-first on-device SpeechRecognition adapter.
- Merged #36 stages recognized speech into the text composer and requires explicit Send. A second tap finishes transcription; Cancel/navigation/profile changes abort without sending. Hear reply stays opt-in.
- The model-backed **text** coach from #36 uses a dedicated private Cloud Run service, authenticated gateway, family ledger and separate scoped OpenAI key *only when all required approvals are verified*. It is implemented with default-denied activation gates; a green build is not a live conversation and does not identify current live configuration.
- The existing browser-only on-device `SpeechRecognition.processLocally` requirement is **not dependable across iOS Safari and Android Chrome tablets**. Merged #36 includes a **parent-gated MediaRecorder-to-Google-Speech-V2 fallback**, authenticated upload, private IAM hop, edited transcript, receipt-only accounting and CI fixtures. Its merge evidence does not establish real-tablet or production acceptance; newer observations belong in [Delivery state](../../DELIVERY-STATE.md).
- The relevant speech-only design from draft #31 has been selectively ported into #36 without importing its alternative model-provider architecture. #31 remains unmerged until a follow-up reconciliation confirms no needed safeguards are missing.

## Transcription architecture (merged implementation; real-device/production proof separate)

1. User presses Speak. Check parent-controlled speech permissions and feature availability before requesting microphone access.
2. Prefer verified local recognition only when **actually supported** and sufficiently reliable. No silent switch to potentially remote browser speech recognition.
3. On iOS/Android where reliable local recognition is unavailable, offer an explicitly parent-approved, private short-recording transcription path; otherwise show an actionable option to use device keyboard dictation or type. Do not pretend transcription is available when blocked.
4. For the private option, use the existing family-authenticated gateway and a narrowly permissioned server-to-server speech boundary. Negotiate supported recording MIME/codec on the device; support and validate actual iOS Safari and Android Chrome outputs rather than assuming WebM. Enforce short duration, size limits, TLS, session/CSRF/origin, child/profile binding, separate recording consent, rate/concurrency and spend caps, no public URLs, no raw-audio logs, short-lived memory-only processing, verified vendor handling/retention, and cancellation/erasure rules.
5. Transcription returns **text only**, never instructions, model replies or game code. Validate length/content, show the editable text, and let the child decide whether to Send. Keep recorded audio out of local game files, transcripts and backups.
6. Failure must be recoverable: permission denied, unsupported API, absent language pack, mic busy, empty/uncertain transcription, offline/network loss, provider failure, timeout or interrupted device => no sent message, no lost prior draft, clear Retry/keyboard/type fallback.
7. Cancel or player/project switch must invalidate late asynchronous transcription and stop active capture. A response must not appear in another child's draft. Guard Math/English checkpoints.
8. Test responsiveness and cost with real devices before choosing the remote vendor/route. No broad public-child data processing until separate required child privacy/consent approvals.

**Reliability definition:** for supported, enrolled devices with permission and available service, the user can reliably Speak -> review transcript -> Send. No service can guarantee microphone access when permission is denied, there is no network, or the device is unsupported; every such case must fail transparently with a working typed path.

## Mandatory acceptance — one coherent journey

- Typed message -> model reply -> contextual typed follow-up; unsolicited build count = zero.
- Supported microphone -> spoken idea -> editable draft -> manual corrections -> Send -> model reply; **zero model calls and zero builds before Send**.
- A second microphone tap **finishes** and returns available words; navigation or explicit Cancel **aborts** and never sends.
- First-transcript accuracy is tested with representative child voices; retry/edit are available rather than silently accepting wrong words.
- Real iPadOS Safari and Android Chrome (plus Chrome/Edge desktop) tested for recognition, codec, permissions, recording stop, screen rotation, battery/restarts, interrupted capture, network loss, and keyboard fallback.
- Audio and final transcript do not cross player/project switches, parent revoke, logout or learning overlay.
- Hear reply works only by explicit click and shows text even when audio output is unavailable.
- Security: wrong origin, forged/expired session, missing speech consent, over-budget, oversized audio, malicious content, cancelled upload and stale response must fail closed without leaking content or charging an unapproved request.
- End-to-end private paid synthetic text smoke; supervised real-child pilot only after verified model/provider privacy approvals and authorization. Report p50/p95 round-trip text, STT latency, transcription failure rate and costs. Mock-only CI is not production acceptance.

## Source integration and operational release

The source merge order was **#42 → #36 → #43**. These changes are now integrated on the reviewed application baseline. The earlier proposed #42 → #43 → #36 ordering is superseded; do not reopen completed merges or describe O8/O9 operational work as completed by merging source.

1. Reconcile later changes against current main, preserving #42 trusted-device/paid-admission checks, #36's single private coach architecture and #43's generation/repair integration. Run the affected integrated checks on the proposed release source.
2. Account for any remaining #29 safeguards and selectively ported #31 speech components before the applicable release. Retire or supersede competing work only after required behavior and evidence have been mapped; do not merge a second model service.
3. Use [Delivery state](../../DELIVERY-STATE.md) for the current authorized audience and release scope. Inspect existing gateway/private service identities, images, networking, flags and provider permissions before changing them. Record scoped evidence rather than inferring it from a merged PR or environment flag.
4. Deploy compatible backend changes before the frontend. Independently test real app/API cookies, renewal/revocation, microphone codecs, learning interruptions and version recovery. Preserve device-local progress across any origin change; maintain an inspected rollback target.
5. Run the authorized adult/operator synthetic smoke and real-device acceptance for the release being made. Child-enabled use additionally requires the applicable verified child-data permissions, provider safeguards, retention/deletion and supervised pilot acceptance described in [the speech release contract](PRIVATE_SPEECH_RELEASE.md).
6. Track private-worker repinning/image acceptance separately from voice rollout. A frontend or coach deployment does not update generated-game execution. Record each component's deployed identity, actual enabled capabilities and observed journey results in the delivery ledger.

**Merge is not deployment; deploy is not acceptance.** Every final declaration must identify the merged SHA, deployed frontend/gateway/preview/worker/coach revisions, exact approved configuration, and verified real-device evidence.
