# Jems MVP — push-to-talk, editable transcription, and turn-based AI chat
**Decision: 2026-11-18. Status: design and implementation acceptance contract; not a deployment or provider approval.**

## Product decision and exclusions

- Child may type OR tap **Speak**, talk once, and tap **Finish speaking** (or pause until recognition ends).
- Speech becomes an **editable text draft** in the existing Studio composer. It **never auto-sends**, auto-builds, queues a job, or promotes a game. The child can correct, add to, delete, or abandon it.
- Only the explicit **Send to jems** action submits the reviewed text to one ordinary, turn-based, contextual AI conversation. A separate **Build/Try a change** action initiates generation or local edits.
- The AI can reply with text; **Hear reply** is an optional, explicitly requested, local voice output when available. No required spoken reply.
- No continuous listening, background microphone, streaming conversation, open-mic turn-taking, interruption/barge-in or automatic microphone restart. The app must not imply ChatGPT-style real-time audio.
- Preserve child ownership, conversation context per player/project, safety, limits, design notes, learning checkpoints, versions, and truthful local fallback. The product is *asynchronous conversational AI with push-to-talk input*.

## What is implemented now vs. missing

- Merged #27/#35 provide Studio conversation, play/build separation, bounded context, local reflection fallback and a privacy-first on-device SpeechRecognition adapter.
- This #36 branch now stages recognized speech into the text composer and requires explicit Send. A second tap finishes transcription; Cancel/navigation/profile changes abort without sending. Hear reply stays opt-in.
- The model-backed **text** coach in #36 uses a dedicated private Cloud Run service, authenticated gateway, family ledger and separate scoped OpenAI key *only when all required approvals are verified*. It is still an inactive draft; a green build is not a live conversation.
- The existing browser-only on-device `SpeechRecognition.processLocally` requirement is **not dependable across iOS Safari and Android Chrome tablets**. The current fallback is OS keyboard dictation or typing, which does not guarantee the Jems Speak button on those browsers.
- #31 contains an unmerged draft private `MediaRecorder -> authenticated gateway -> private speech recognition` path. Reuse only reviewed, compatible speech transport/tests; **do not merge #31's alternative model/provider architecture** into #36.

## Dependable transcription architecture (implementation required)

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

## Development, merge and release ordering

1. **#42 first:** trusted-device session code integration after exact-head checks; deploy compatible gateway before frontend. Independently test browser cookies and first-party/same-site solution, export/import across origin changes, renew/revoke on real devices.
2. **#43 second:** finish O3–O9 functional generation/repair/preview objectives; reconcile onto main after #42; exact-head tests and real private-worker pin/production integration approval. Do not prematurely merge the research foundation as complete functioning generation.
3. **#36 next, as ONE chosen coach implementation:** land this push-to-talk-to-draft behavior; implement and test approved private speech fallback if needed for tablet Speak acceptance; reconcile session/auth changes from #42 and any generation interaction with #43. Use #36's dedicated private OpenAI text-inference architecture; cherry-pick only speech-related pieces from #31 after review. Align #29 production safety policy so the owner-pilot coach is an explicit, separately gated capability, not a hard-disabled path.
4. Close or explicitly supersede #31 *only after* any approved speech components are ported and acceptance is tracked. Do not merge two competing model services.
5. Deploy text-coach private runtime inactive behind approved gateway/network; verify identity, scoped secrets, ZDR, guardian consent, moderation, spend, erasure and provider eligibility; then authorize a narrow funded synthetic smoke and a private-family pilot. No child AI data before approval.
6. Stage frontend and private worker, run integrated production smoke, then supervised UAT of game build/edit/learning, session renew, turn-based chat and push-to-talk on actual tablets. Track functional defects, child outcomes, rollback and version preservation. Public release requires separate readiness review.

**Merge is not deployment; deploy is not acceptance.** Every final declaration must identify the merged SHA, deployed frontend/gateway/preview/worker/coach revisions, exact approved configuration, and verified real-device evidence.
