# Jems Gem Studio — small, earned progress layer

## Product intent
Use gemstone artwork and light, real-event celebrations to make Jems creation feel rewarding. Children should see their own game ideas become **rough → cut → polished** gems as they make, test, reflect, and keep improvements.

This PR **extends** the existing verified celebration layer from merged PR #33. It does not add game currency, cloud persistence, a child score, or a new learning benchmark. The words *builder level* describe participation in the creation workflow, **not academic mastery**.

## Simple evidence contract
- **No gem** for merely opening a starter, creating an empty notebook, typing an unsent draft, or receiving helper text.
- **Rough gem** when a child-authored idea/decision is durably saved.
- **Cut gem** when a saved experiment has a saved, nonempty child-authored observation linked to that experiment.
- **Polished gem** when the same project has a cut gem and a confirmed kept revision (local version history or the currently kept private remote revision).
- **Builder level 1/2/3** derives from the highest earned stage across the current player's projects. No extra points, streaks, rankings, new progression database, or child comparisons.
- The original saved notebook and revisions remain the sole data source. Clear/delete operations may remove the corresponding visual progress; no "unerasable" shadow copy.
- No celebratory claim from a queued build, a failed test, a mock worker, or a prompt that was never saved.

## UI boundaries
- A small progress panel appears within **My jems** once a real idea exists, not above the primary Create entry.
- Each saved, eligible project shows a tiny distinct rough/cut/polished gemstone label. Studio shows the same status next to its genuine version label.
- Transient verified-event popups use the existing nonblocking Delight host. No scorebars inside children's games and no blocking modal award ceremony.
- Accessible text labels, symbol/shape variation rather than color-only state, no automatic sound, and reduced-motion support.

## Starter games are independent follow-on PRs
1. **Mind Your Jems! (PR #56):** mine a giant rocky head; use the existing PR's real mechanics and separately verify its CI/merge gates.
2. **Gem Factory:** receive gems on a conveyor, route by visible type, cut and polish with a single action, finish short orders. Initial version: 2–3 inputs, three stations, deterministic 1–3 minute rounds; no economics/inventory cross-sync.
3. **GemBots:** simple top-down grid where a small robot uses gem-shaped **Move**, **Turn**, and later **Repeat** command tiles to reach a crystal objective. Start with short levels, predictable execution, clear reset/undo; no physics engine, robot anatomy crafting or text programming language.

These games may have consistent gem art and later cross-promote one another, but they **do not depend on sharing saved balances, progression or state**. They must each pass their own keyboard/touch, small-screen, game-rules and no-regression checks.

## PR gates
- Typecheck, normal tests, new unit evidence tests, browser smoke and desktop/tablet/mobile visual review.
- Verify profile switching never reveals another player's level or projects.
- Verify a child message with no test cannot claim a cut gem; no observation with an unknown experiment counts.
- Verify reflection/keep pops only for saved/verified transitions, not on reload or initial import.
- Ensure no interference with #55 adult/guardian privacy, #54 learning benchmarks, #56 arcade game, or present release gates.
- Draft and no production deployment until CI and visual review are explicitly confirmed.
