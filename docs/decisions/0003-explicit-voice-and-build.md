# 0003 — Editable dictation, explicit Send and separate Build

**Status:** Accepted existing product decision, recorded retrospectively.
**Recorded:** November 18, 2026 (America/New_York).
**Decision source/date:** [Push-to-talk MVP contract](../issue-28/PUSH_TO_TALK_MVP.md), November 18, 2026; [PR #36 scope update](https://github.com/jzwyrzyk/family-game-factory/pull/36). Source reviewed at application `493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7`.

## Context

Conversation, speech entry and game generation have different purposes, permissions and consequences. Treating a recording as an instruction to send or build removes the player's opportunity to correct recognition and can create unintended model calls or game changes. Tablet speech capabilities also vary by browser and provider availability.

## Decision

The MVP uses one explicit turn at a time:

1. Type, or tap **Speak** and finish the recording/recognition turn.
2. Put transcription into the existing **editable draft**.
3. Submit only through **Send to jems** for a normal contextual text reply.
4. Initiate a game change through the separate **Build/Try a change** action.

**Hear reply** is an optional user action. There is no continuous listening, automatic send, automatic microphone restart, streaming turn-taking or voice-triggered build. A second microphone tap finishes; Cancel or a player/project change aborts without sending.

## Consequences and limits

- Both supported local recognition and an approved private transcription route return editable text; neither can send a conversation turn or generate a game automatically.
- Check actual availability and permissions. Failure must preserve prior work and offer an honest typed/keyboard fallback. Do not silently substitute potentially remote browser recognition for a local-only route.
- Invalidate late audio and model results after cancellation, navigation, profile/project changes or revoked access. Keep raw audio out of saved games, backups and content logs.
- Dictation, contextual model conversation and generation have separate authorization/spending boundaries. Transcription can itself use an approved remote service; “no automatic Send” is not a claim that every speech path is offline or cost-free.
- Browser fixtures do not establish real iPad/Android microphone reliability, live provider connectivity, privacy approval or child acceptance. The active pilot scope and actual service state require their own evidence.

## Evidence and related documents

- [Detailed behavior and device acceptance](../issue-28/PUSH_TO_TALK_MVP.md).
- [Private speech release runbook](../issue-28/PRIVATE_SPEECH_RELEASE.md).
- [Private inference architecture](../issue-28/CLOUD_RUN_OWNER_PLAN.md).
- [Delivery state](../../DELIVERY-STATE.md) owns current merge/deployment/activation evidence. Historical merge ordering or draft wording in feature documents cannot override that evidence.
