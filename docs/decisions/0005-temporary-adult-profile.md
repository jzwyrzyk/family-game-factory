# 0005 — Temporary adult AI profile on the existing site

**Status:** Accepted for temporary development; implementation and deployment are separate.
**Recorded:** November 18, 2026 (America/New_York development session).
**Decision source/date:** The owner's explicit November 18 development request: keep the existing site, activate AI by switching to the adult profile, and remove this temporary development capability in the future. [PR55](https://github.com/jzwyrzyk/family-game-factory/pull/55) is the implementation and public handoff for that request; the original request was in the development conversation, not a public issue.

## Context

The earlier adult pilot branch assumed a separate private frontend and rejected the existing public GitHub Pages origin. The owner explicitly rejected creating another site and clarified that switching to the adult profile must activate the AI capabilities. The existing site also has children's profiles and stored work, so a local label or shared device cookie cannot determine paid authorization.

## Decision

- Keep one existing Jems frontend. Add **Adult (development)** to its profile selector when the server enables the temporary pilot.
- Make the profile switch the activation interaction. When locked, the existing parent passphrase is entered within that switch; successful server authorization opens the adult workspace and makes configured AI tools available. Do not add another activation button or site.
- Keep trusted-device eligibility, an operator-reviewed adult permit and a short, revocable server session. Require both the HttpOnly cookie and a proof held in the selected tab's memory; never derive paid access from local profile data.
- Separate adult local notebooks, games, remote jobs, revisions and response handling from child work. Switching away removes this tab's authority and requests server revocation; expired or revoked grants cannot admit or publish additional paid work.
- Treat this as a removable development feature. Disable its backend mode and remove the isolated selector/session/permit branches when development no longer needs it. Preserve normal profiles, trusted-device security and the separate guardian-consent workflow.

The temporary backend mode restricts remote AI to authenticated adult development requests while child profiles keep local behavior. It does not verify guardianship, assert provider ZDR, authorize child processing or silently enable paid providers. Provider readiness and available allowance still determine which tools can actually respond.

## Consequences and limits

The separate adult website and an independent user-facing AI activation step were explicitly rejected. Server authentication and isolated workspaces retain the necessary distinction between adult development and children's use on a shared site. The private generation worker, coach executor, key separation, sandbox and preview boundaries in [ADR0004](0004-separated-private-execution.md) remain intact.

The switch enables tools; it does not record automatically, send a conversation, build a game or Keep a version. [ADR0003](0003-explicit-voice-and-build.md) and [ADR0001](0001-child-led-creation.md) retain those explicit actions. Ordinary family renewal does not extend the adult grant. A connection failure during logout may leave the server grant until expiry, but local proof is discarded and outstanding adult work cannot enter the child's workspace.

This decision should be revisited when the temporary development need ends or when a separately authorized child AI release changes the audience policy. It is not a permanent replacement for guardian verification or a legal compliance finding. Source/fixture tests, deployed configuration and real provider/device acceptance remain distinct evidence.

### Discoverability refinement — November 20, 2026

[The owner-approved navigation refinement](2026-11-20-character-first-navigation.md) adds a permanent **Private parent session** entry under Menu → Grown-ups and Parent Settings. It explains disconnected, disabled, permit and service readiness states instead of vanishing. The original gated Adult profile choice and same passphrase-backed session remain. This is an entry to the existing switch, not another activation toggle or a server authorization change.

## Evidence and related documents

- [Adult profile operation, release acceptance and removal](../adult-pilot/VOICE_RELEASE_AND_UAT.md).
- [Guardian consent and adult integration contract](../privacy/ADULT_CHILD_RELEASE_INTEGRATION.md).
- [Architecture](../../ARCHITECTURE-CURRENT.md): executable session, storage, worker and preview contracts.
- [Delivery state](../../DELIVERY-STATE.md): current branch/merge/deployment/activation evidence.
