# Reviewed owner handoffs

This directory archives executable handoff source only. Private receipt contents,
credentials, secret values and child records must stay out of the repository.

## Private Coach staging — November 23, 2026

`coach-stage-20261123.sh` is the exact, previously tested owner-run paste block.
Its SHA-256 is
`8a4d681bc18cdd764ed92e010c5f9efe74b8c9de87abeb2cfde14d79627d5dba`.
It embeds helper SHA-256
`2ea4387f7a857a0ded7928ee35651f6c1ee88604c9a75c67ceca5976df7e220c`
and validates those helper bytes before execution.

The transfer workaround changes neither executable bytes nor approved scope.
The owner fetches this file from a full immutable commit into a new private file
inside the existing activation workspace, verifies its SHA-256, and runs the
verified bytes. Use the exact commit from the handoff; never download a floating
branch and execute it without the checksum. Preserve all partial files.

The internal gates require production main R
`7932580f1af890a5e0d879fe6a8390e86134068e`, application S
`aa56b60abe152e750f9f0b5e8949bdb44be53196`, and successful R plan
`45277471765`. **Keep the handoff branch unmerged while that R pin is needed.**
This is a transport branch, not a replacement application or release source.

Execution verifies historical evidence and fresh controls/baselines/continuity,
prepares the rollback intent, creates only the release enable flag, and dispatches
one reviewed private Coach `stage`. The current baseline retains 100% traffic.
Existing intent files, unexpected flags, changed source or uncertain writes stop
the helper; do not delete receipts or retry a mutation to recover an output.

The GitHub workflow performs the Cloud Run transition. A queued dispatch is not
successful staging, and staging metadata is not functional provider acceptance.
Canary, promotion, Gateway/Pages and required retained-game/profile/Adult checks
remain separate. No IAM expansion, spending change, cleanup or worker repin is
included. See [current release sequence](../../../docs/operations/PRODUCTION_ACTIVATION.md)
and [delivery state](../../../DELIVERY-STATE.md).
