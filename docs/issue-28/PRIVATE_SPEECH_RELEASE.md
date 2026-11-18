# PR #36 — private, turn-based conversation + tablet dictation release
**State: implementation branch only; not merged or activated.**

## Product contract
The child **presses Speak**, records one short thought, **finishes**, checks or edits the transcription, then **presses Send to jems**. A normal text AI reply appears; **Hear reply** is an optional explicit click. A different **Build / Try a change** action is required before generation. There is no live two-way microphone, automatic listening, automatic speech playback, automatic Send, or auto-build. A typed message uses the same chat and privacy policy.

## Source components
- `src/studio/voice.ts`: verified on-device SpeechRecognition for devices that support it; transcript becomes editable draft, never a sent message.
- `src/studio/private-speech.ts`: when the private family STT route is actually authorized and responsive, offers the same visible Speak action using explicit MediaRecorder capture. Maximum 12 seconds/320,000 bytes, codec determined by browser; audio never enters localStorage or any saved game.
- `src/studio/ui.ts`: one visible Speak action; `GET /v1/coach/audio/status` controls remote availability. A recording uploads to `POST /v1/coach/audio` with a unique request ID and authenticated family session, then fills the existing draft.
- `server/coach/audio-http.ts`: authenticated gateway, Origin/CSRF, short binary request limits, no-store responses.
- `server/coach/speech.ts`: validated audio signature, separate model/audio consent, monthly family budget reservation, bounded concurrency/rate and non-content receipts; no audio/transcripts persisted.
- `server/coach/private-bridge.ts`: ID-token-authenticated server-to-server request to the exact pinned private coach service. No child/browser direct access to the private endpoint.
- `server/coach/private-executor.ts`: audio-only, separately approved endpoint inside `factory-coach-private`; Google-signed gateway identity independently validated. No audio given to the OpenAI text model.
- `server/coach/private-speech-provider.ts`: Google Speech-to-Text V2 synchronous `us` endpoint with auto decoding for browser WebM/Opus, Ogg/Opus or MP4/AAC. Uses the private Cloud Run service identity OAuth token, never a key in browser or gateway.
- `server/coach/consent.ts` and `owner-consent.ts`: family-specific model/audio scope receipts, expiry and revocation. Owner-provided receipt means **verified externally**—the CLI does not itself verify an adult.
- `server/coach/service.ts`: model-backed chat now also requires verified family-specific model permission before spending or returning a reply.

## Non-negotiable production approvals (no activation by code merge)
1. Verify the real family/guardian's applicable child-data permissions, privacy notice, consent withdrawal, deletion and identity, including any legal review needed for the private pilot. Under-13 OpenAI model personal-data processing requires separately approved ZDR; `store:false` is not proof.
2. Verify the dedicated private Cloud Run service's IAM-only ingress, exact gateway caller, reviewed network routing path, session authorization, image digest and separate scoped OpenAI key/Secret Manager version. Never move or reuse the existing generation worker's key or alter its WIF trust as a workaround.
3. Enable Google Cloud Speech-to-Text V2 only in the owner-approved project `FACTORY_COACH_AUDIO_PROJECT`; give the dedicated private coach service account **Cloud Speech Client** (`roles/speech.client`) or a reviewed narrower recognition role. Do not grant Speech permissions to the public gateway, browser or generation worker.
4. Verify Speech API project location, current pricing, data logging **disabled**, cloud logging redaction and provider data-processing terms. Confirm support and actual output of Safari MP4/AAC and Chrome WebM/Opus; there is no automatic unapproved transcription vendor fallback.
5. Review `FACTORY_COACH_AUDIO_APPROVED`, `FACTORY_COACH_AUDIO_PRIVACY_APPROVED`, `FACTORY_COACH_AUDIO_PROVIDER_VERIFIED`, `FACTORY_COACH_AUDIO_PARENT_CONSENT_APPROVED`, `FACTORY_COACH_AUDIO_PROJECT`, `FACTORY_COACH_AUDIO_MAX_MICRO_USD` and `FACTORY_COACH_AUDIO_PRICES_REVIEWED` on **both** gateway and private service. They default denied. Audio/model approval gates are independent.
6. Before real child use, owner must record an externally verified family receipt using `npm run setup:coach-consent -- --confirm-external-verification --allow-model --allow-audio` with `FACTORY_EXTERNAL_GUARDIAN_RECEIPT` (opaque reference) and `FACTORY_CONSENT_DAYS` on a trusted ADC machine. That command is *not* an age verification mechanism. `--revoke --confirm-external-verification` removes family authorization without deleting games.
7. Review actual allowance, its hard application cap, speech per-request reserved maximum, monthly reset and infrastructure charges separately. A `$5` model allowance does not cover total Cloud costs.
8. Verify the first-party/same-site route for iOS Safari and compatible session renewal in PR #42; test real app and API origins and export/import of existing device-local progress. #36's HTTP endpoint alone does not fix Safari cookies.
9. Reconcile PR #29's default-deny cloud-coach policy and all device-revocation checks from #42 before activation. Do not merge competing PR #31 model-provider code; port only the speech components required for this release.

## Minimum test evidence
- Required tests: `npm run build`, `npm run test:coach` (includes synthetic private speech unit/browser/backend), `npm test`, exact-head PR CI, and the dedicated private Docker image test. Test stdout must contain no child text/audio.
- Exercise denial: 401/403, unconsented family, denied/stale microphone permission, invalid speech format/signature, over-limit request, duplicated request, revoked consent, expired session, over-budget state, forged IAM token, interrupted upload, timeout and cross-child profile switch.
- Real authorized synthetic smoke: gateway -> IAM private service -> Google STT -> editable transcript -> explicit Send -> moderated private OpenAI model -> text reply; zero build until explicit Build.
- UAT: actual family iPadOS Safari and Android Chrome (not emulator-only), plus PC Chrome/Edge, network restart and background/foreground, at least five repeated turns, transcript correction, learning interruption and restore.
- Measure turnaround, errors, timeouts, real account charges, model reply quality and whether children understand the Send/Build distinction. Do not infer enjoyment from fixture tests.

## Production rollout and rollback
1. Merge #42 and finish #43 functional acceptance first, then reconcile #36 against current main, including #29 if enabled. Run full exact-head checks after integration. Keep #31 unmerged until its compatible speech work is accounted for.
2. Deploy compatible gateway and private service images *inactive* first. Confirm identity/network/auth and disable switches. Never enable AI or speech just by setting a public static URL.
3. With recorded approvals, permit a narrowly funded synthetic parent/operator smoke, check real browser cookies and rollback, then explicitly authorize supervised family pilot. Deploy frontend after backend and inspect real runtime configuration.
4. To stop: disable model/audio flags at private service and gateway, revoke family consent, remove the private service origin from private gateway config, and restore known-good Cloud Run/Pages revisions as necessary. Preserve game/version and learning data; note historical provider invoicing/metadata cannot always be erased immediately.

## Current operational blockers
**No live GCP inspection, authorized child-data consent evidence, API ZDR proof, real model/STT calls, actual iOS/Android test, private network service deployment, or final merge-main integration has been verified from this GitHub session.** No one should call PR #36 ready for live child production until those gates pass.
