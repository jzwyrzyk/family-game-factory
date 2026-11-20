# Jems adult profile and guardian consent — integration review

**Separate product analytics:** the [PostHog pilot](../analytics/README.md) has its own notice/choice and defaults off. The permissions in this document do not authorize analytics. Family analytics remains pending until independent guardian verification; Adult analytics expires with the exact current unlock session. Stop reporting and downstream history deletion are different operations.

This candidate integrates PR #52's parent choices with PR #53's adult pilot on **one existing Jems site**. The temporary adult profile directly activates AI for development. The same frontend keeps ordinary child profiles; privileged requests are authorized by the backend rather than by a hostname or local profile name.

## Runtime policies

| Active rollout | Authorization for paid work | Effect on the current site |
| --- | --- | --- |
| Temporary adult development pilot | Live trusted device, operator-issued permit and recent passphrase-backed adult session with cookie plus tab-specific proof; normal provider/spend approvals | Selecting Adult (development) unlocks the AI workspace. Child profiles continue locally without adult AI access. |
| Future child/family AI | Current notice-bound guardian receipt, separate generation/conversation/remote-speech scopes, applicable verified provider ZDR and privacy/provider/spend approvals | Adult pilot is disabled. Paid child capabilities remain unavailable until their independent requirements are met. |

The gateway selects these policies with `FACTORY_ADULT_PILOT_MODE`. Adult mode also requires `FACTORY_ADULT_PILOT_OWNER_APPROVED` and `FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED`. There is no separate frontend and no `github.io` ban. The obsolete private-host flag cannot substitute for the new profile-access review.

## Profile switching and session isolation

The ordinary profile menu contains Adult (development) when the server exposes the pilot. Choosing it prompts for the passphrase when locked, validates eligibility and opens the adult workspace. AI activates through that switch; it has no separate user activation toggle. The UI distinguishes adult authorization from actual model, speech and build availability.

An adult session lasts at most 60 minutes and is bounded by permit/device authorization. Trusted-device refresh cannot extend or recreate it. An HttpOnly cookie alone is insufficient: requests require a proof in the current tab's memory matched to the live server grant. A child tab sharing cookies has no proof. Switching to a child or locking clears local adult authority and requests server revocation. A lost connection may prevent server confirmation; the discarded proof cannot activate new requests in that tab, and the server grant retains its absolute expiry. Reload/new tab starts locked. Device and operator-permit revocation are independent controls.

The adult local profile, notebook and games use their own device-bound owner. Child drafts/history are not forwarded into adult conversations. Profile switches cancel recording and detach outstanding UI work. Server checks prevent an expired/revoked grant from admitting additional paid work or publishing newly completed games. Local storage separation is a product boundary, not encryption against someone controlling the browser's storage.

## Guardian-consent contract

- The parent form creates **pending** choices only. Acknowledgments do not verify guardianship or activate providers.
- A trusted operator records an independently verified receipt for the exact current choice, notice, family and still-active trusted device. The parent-only status exposes the choice's UUID for that handoff. Only the SHA-256 receipt digest is stored; it cannot be reused.
- Authorization requires the newest choice, exact boolean scopes, current notice, complete receipt evidence, chronological timestamps, an unexpired maximum 90-day lifetime and live originating device. A timestamp alone cannot grant access.
- Changing scopes revokes the old choice immediately and creates a pending request. Withdrawal clears family coach/audio consent. Expired, revoked, stale-notice and incomplete records fail closed, including the status shown to a parent.
- Production generation checks permission before submission, worker execution and Ready publication. Conversation and speech check their scopes before provider admission and before returning results. Legacy owner coach consent alone is insufficient in the production child path.

These records do not grant provider ZDR or certify external guardian-verification methods. Jems' local notebooks, saved games, learning records, server metadata and backups retain their separate disclosure and deletion responsibilities.

## Merge preparation and release acceptance

1. Validate the exact integrated commit with TypeScript, unit/security, parent privacy HTTP, adult-session/profile-switch browser tests and existing Studio/learning/gameplay regressions.
2. Exercise both policies. Include bare profile claims, mismatched proof/device, wrong/throttled passphrase, expiry, lock, permit replacement, device revocation, child tab and in-flight revocation. Denied requests must not reserve new paid work.
3. Preserve source/image pins, IAM/WIF identities, private execution, preview separation, idempotency and sandbox isolation. Preparing this PR does not change the worker's live source pin or deploy resources.
4. Keep the deployed acceptance checklist in [VOICE_RELEASE_AND_UAT.md](../adult-pilot/VOICE_RELEASE_AND_UAT.md) separate from fixture tests. Real provider configuration/routing, funded smoke and physical-device microphone tests are deployment evidence.

## Remove the temporary feature

Disable `FACTORY_ADULT_PILOT_MODE` across gateway and private service, refresh the site, verify that the adult entry disappears and new unlocks/paid adult calls are denied, and stop outstanding development jobs. Parent choices keep their own pending/verified state; no child approval changes as a side effect. Remove the dedicated adult module and permit branches after development, retaining normal profiles, guardian workflow and generic trusted-device controls.

Related work: [#52 guardian permissions](https://github.com/jzwyrzyk/family-game-factory/pull/52), [#53 adult pilot](https://github.com/jzwyrzyk/family-game-factory/pull/53), [private worker #13](https://github.com/family-game-factory-lab/family-game-factory-worker/pull/13), [release issue #46](https://github.com/jzwyrzyk/family-game-factory/issues/46).
