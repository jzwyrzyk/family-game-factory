# Jems — the illustrated making journey

This is the detailed feature contract for [PR #57](https://github.com/jzwyrzyk/family-game-factory/pull/57). [ADR 0005](../decisions/0005-cosmetic-making-journey.md) records the decision and threshold limits; [current architecture](../../ARCHITECTURE-CURRENT.md) maps implementation, and [delivery state](../../DELIVERY-STATE.md) owns branch, CI and operational evidence.

## Design intent

Use the **bright white reference** as the visual direction: generous white space, soft lilac accents, richly illustrated child inventors, and tactile gemstones. The art should carry the story. Keep the interface cheerful, legible, and short enough to understand without reading a reward explanation.

Each child can choose one of two equally capable characters, **Spark** or **Nova**, and change that choice later. Do not label the choices as boy/girl, infer gender, or put gender in storage. The selected character develops through four illustrated stages. Character selection is cosmetic and never changes the requirements or grants progress.

The dedicated **My journey** page is always available from navigation. The home **My jems** area provides a compact link back to it. The page shows the current earned level, the character at that stage, a short next step, and all four stages. Future artwork can be explored, but a preview must be labeled and must leave the actual earned level visible.

This extends the existing verified celebration layer from PR #33. It adds no points, spendable currency, streaks, rankings, daily pressure, child comparisons, or academic proficiency claim. **Gem Master** means the child has completed the saved making cycle in three different projects. Learning evidence and game scores stay independent.

## Four levels, three kinds of project evidence

| Earned level | Name | Evidence | Short next step |
| --- | --- | --- | --- |
| None yet | Ready to create | No qualifying saved making evidence | Save your first idea |
| 1 | Gem Maker | A saved child-authored design choice or experiment idea | Try a change. Share what you notice. |
| 2 | Gem Cutter | A real saved experiment and a nonempty child reflection linked to that experiment | Keep a tested improvement |
| 3 | Gem Polisher | A reflected experiment with a confirmed keep receipt for that exact experiment and its original base | Polish the remaining jems |
| 4 | Gem Master | Three distinct projects with qualifying polished evidence | Keep making something wonderful |

Projects still have **rough → cut → polished** gemstone states. Level 4 is the overall making milestone; it does not invent a fourth state for individual projects.

### Evidence rules

- A rough jem requires an adopted, nonempty child idea; an accepted, nondelegated child plan choice; or a saved child-origin experiment with a nonempty prompt. Arbitrary chat, helper text, opening a starter, unsent drafts, empty notes, and choosing a character do not qualify.
- A real local test has a saved candidate configuration. A remote test needs a verified real preview/build marker; mocked workers and merely queued, failed, or unseen remote candidates cannot award a cut or polished jem.
- Reflection can be a nonempty child observation explicitly linked to the test, or a nonempty note typed into that saved test's card. Automatic runtime outcomes do not stand in for the child's observation. Helper-generated test notes are not written into the child's note field.
- A polished jem requires a durable keep receipt matching the **same** reflected experiment, the test's original non-null base revision, and a new kept revision. A keep from Test A cannot polish a reflection on Test B. The existence of unrelated history, a current remote revision, or a caller-supplied boolean is insufficient.
- First remote builds with no prior base may become working games through the normal workflow. They do not claim a tested improvement solely from being built.
- Level 4 counts distinct projects, not the number of tests or keep clicks. Repeated session IDs, aliases of the same local project, copied test receipts, and reused kept revisions cannot manufacture extra polished projects.
- All calculations filter the active owner before counting. No profile sees another profile's level, character selection, or project history.

The implementation is in `src/brand/gem-progress.ts`. `builderJourney()` derives the current level, count, and next action from validated notebook evidence. There is no separate badge ledger to drift out of sync with the work.

### Save, erase, copy, and archive behavior

The notebook schema remains version 1 with optional additive fields:

- `avatars[owner]`: `spark` or `nova`, a cosmetic choice saved only after storage succeeds.
- `keptExperiments`: exact test/base/revision receipts written after the underlying local or real remote keep succeeds.
- `verifiedRemoteExperiments`: IDs of saved remote tests whose real preview/build was verified.

Old notebooks load without these fields. Historical chat or existing version history is not retroactively treated as proof of an exact reflected keep.

Putting a project away preserves its saved evidence, so an archived polished project still contributes. Bringing it back has no reward event. Making a copy begins with an empty test shelf and no keep receipts; the new project must complete a new cycle before it contributes another polished project.

**Clear chat on this device** clears the conversation, design observations, and dependent keep receipts. It retains working game versions and the existing saved test prompts/notes, matching the Studio's retention behavior. A retained child test prompt can still qualify as rough; a retained child test note can still qualify as cut. The erased keep receipts cannot leave that project polished or keep its contribution toward Gem Master alive. A character choice is independent of clearing a project's chat.

Storage failures must remain visible and retryable. Do not close the character picker, switch the visible selected character, or emit a milestone when the corresponding notebook write fails. Keep errors must preserve the existing working game and must not fabricate a receipt.

## Art and layout

The production page uses local assets in `public/jems-journey/`:

| Asset | Purpose |
| --- | --- |
| `characters-spark.webp` | Four equally spaced stages of Spark |
| `characters-nova.webp` | Four equally spaced stages of Nova |
| `gems.webp` | Four illustrated gemstone appearances for the journey |
| `background.webp` | Soft illustrated world behind the main character |

Character and gem atlases keep the same framing, scale, and stage order. The character should remain recognizably the same person as the outfit, tools, and gem details develop. Both choices need the same polish and visual importance. Stage 4 must feel like a distinct final evolution.

`src/brand/journey.ts` owns atlas placement and the accessible page/dialog. Relative assets resolve against `document.baseURI`, so deployment under a subdirectory such as `/arcade/` works. No remote image request, runtime generation, or user upload is required to show the journey. Existing Jems brand marks stay intact.

The page uses a large illustrated hero and four visual stage cards, with two columns on narrow screens. The current level label stays truthful while a future stage is previewed. Decorative artwork is hidden from screen readers; concise visible and accessible names describe the stage and its earned/preview status. Do not communicate earned status by color alone.

### Product copy

Keep the primary interface to short labels and one next step:

- Navigation and page title: **My journey**
- Character action: **Choose character** / **Change character**
- Picker heading: **Choose your maker**
- Choice names: **Spark**, **Nova**
- Main action: **Make a jem** / **Make something new**
- Preview action: **Back to my level**
- Future-stage marker: **Preview**

Long explanations of provenance, storage, remote adapters, and eligibility belong in developer documentation or a relevant error, not in the child's main journey.

## Celebration behavior

Use the existing `jems:milestone` and Delight host for short, illustrated popups after a meaningful **saved transition**. Compare the owner's evidence before and after the durable action. Prefer the new overall level when a project stage and overall level advance together, so one action has one achievement popup. The third distinct polished project receives the Gem Master celebration.

Rendering a page, choosing a character, previewing an outfit, restoring/importing already-earned data, reloading, putting a project away, or switching profiles must never replay an earned milestone. Do not persist a secondary award history solely to achieve this; emit from the successful action boundary.

The popup must:

- Stay compact and use `pointer-events: none` throughout its host.
- Announce a concise message through a polite status region.
- Keep keyboard focus where the child left it and never pause play.
- Use no automatic audio.
- Remove decorative motion under `prefers-reduced-motion` while keeping the achievement text visible.
- Clear on profile switch so another child does not inherit the prior child's celebration.

The character picker is an intentional native dialog, separate from celebrations. It has clear accessible choice names, a close button, Escape handling, focus containment, and focus return to its opener. A profile change closes it and invalidates any stale asynchronous selection.

## Verification

Run the ordinary repository gates plus the focused checks:

```sh
npm run typecheck
npm run test:gem-progress
npm run build
npm run test:gem-journey
```

`tests/gem-progress.test.ts` covers evidence and persistence boundaries, including exact-test keep matching, owner isolation, duplicate project/receipt handling, mock remote tests, copies, archive/clear behavior, old data, and failed writes.

`tests/gem-journey-browser.cjs` runs the production build from `/arcade/`. Its synthetic historical fixtures use the actual notebook API and validation; the final transition is driven through local preview, child reflection or saved test notes, and the real Keep UI. It checks:

- An empty account, honest future-stage previews, and both persisted character choices.
- Character save failure and retry, keyboard dismissal/focus, and owner isolation.
- Real rough/cut/polished progression and a single Gem Master transition.
- No milestone replay on viewing, reloading, or switching profiles.
- Archive/restore retention and erasure of dependent polished credit.
- Removing the last reflection on a kept test while another unkept test remains: immediate level/art downgrade, no cross-test credit, and no downgrade celebration.
- No mutation of learning records or paid build request from this local workflow.
- Desktop, tablet, mobile, 320-pixel width, 200% CSS zoom, and reduced motion.
- Successful local artwork loading under a non-root base path.

Screenshots are written to `test-results/jems-journey-*.png`, including the page at three viewport sizes, character choices, Gem Master, a real popup, and zoom. Visual review must check character crops, continuity between stages, text wrapping, contrast, and that the white reference's light, illustrated feeling survives the actual browser implementation.

## Independent starter games

**Mind Your Jems! (PR #56)**, Gem Factory, and GemBots are separate game work. They may share visual direction, but this journey does not require a shared balance, inventory, progression database, or cross-game economy.

Mind Your Jems uses its existing giant-head mining mechanics and its own PR gates. A future Gem Factory can use short orders with a few gem types and cutting/polishing stations. A future GemBots can use simple Move, Turn, and Repeat tiles on a deterministic grid. Each still needs its own rules, touch/keyboard checks, responsive review, and regression coverage.
