# Jem Factory: clearer sorting and gentle consequences

**Status:** Accepted for implementation; verification and release separate.
**Recorded:** November 22, 2026 (America/New_York).
**Decision source:** the owner's November 22 Factory review and explicit request
to execute the overhaul while preserving its beauty, animation and game feel.

## Context

The owner likes the illustrated workshop, animation, pattern matching,
polishing and gift wrapping. First-time play is unclear because the small
pattern, floating candidate and separate sorter panel do not make the machine's
purpose obvious. Cutting always succeeds, so hitting its center has little
meaning. The owner requested larger and longer patterns, a teeter-totter above
the hopper, machine-mounted Keep/Return controls, a forgiving failed-cut retry
and a difficulty increase after two pattern matches.

## Decision

Preserve the workshop and companion assets, distinct jem silhouettes, physical
sorting, station transitions, sound and expressive finishing steps. Make the
pattern the dominant sorting task, with six or seven examples and one missing
position. Mount the transparent sorter above the hopper and attach accessible
**Keep** and **Return** buttons to the machine. An optional lever appearance
must preserve ordinary pointer, touch and keyboard operation. Remove the opaque
detached sorter-panel presentation.

Use the broad green middle of the cutter track as the success window: 26–74%
inclusive. Its central 38.5–61.5% remains a perfect cut with a higher existing
reward. A miss recycles only the current unshipped jem, gives brief readable
feedback and returns to sorting. Preserve the current puzzle and difficulty,
completed gifts, their designs and earned coins. Recovery follows the active
game clock and freezes on pause. Idling is never a failure, and polishing and
gift wrapping retain their current interaction and expressive purpose.

Set the default day to two gifts while preserving explicit two-to-five-gift
remixes. Keep pattern difficulty separate from order length: advance after two
successfully completed pattern-to-gift cycles, carrying partial progress across
custom days. Count a cycle at shipping so repeating a missed cut cannot farm
difficulty. Correct distractor returns and wrong-route retries do not count.
Keep this progress in the existing profile-owned game state with compatibility
for older day/coin saves. This is gameplay difficulty, separate from the host's
learning difficulty, learning evidence and shared engagement rewards.

## Consequences and limits

The cutter now has a real but bounded consequence. A child repeats the current
jem instead of losing previous gifts or the day's coins. The starting green
window is deliberately broad; refine its tuning only from observed play while
preserving the requested meaningful outcome. The cycle counter prevents custom
order length from undermining the two-pattern cadence, at the cost of one
additional local progress field and explicit restart/migration tests.

The prior always-successful cutter and detached sorting panel are superseded
within Jem Factory. The owner specifically kept polishing and wrapping, so this
change adds no precision penalty to those steps. Existing host learning,
profile separation, saved creative revisions and explicit version selection
retain their authority. No new artwork, backend service, paid operation or
production deployment follows from accepting this decision.

The candidate must be played and visually inspected on the relevant layouts.
Automated tests and browser frame sizes do not prove child comprehension,
enjoyment or actual-device performance.

## Evidence and related documents

- [Jem Factory feature and acceptance contract](../brand/GEM_FACTORY.md).
- [Child interface: clear at six](../brand/CHILD_INTERFACE.md).
- [Product doctrine: actual playable experience](../../PRODUCT-DOCTRINE.md#2-deliver-the-actual-playable-experience).
- [Current architecture](../../ARCHITECTURE-CURRENT.md).
- [Delivery state](../../DELIVERY-STATE.md) for source, checks and release status.
