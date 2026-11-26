# Connected Creative Universe browser evidence

These captures follow a synthetic drawing called Pebble through My Art, movement authoring and Creative Studio. A fresh local Chromium profile created the drawing with the visible crayon tools. Six additional synthetic sketches and a landscape exercise the upload path. All fixtures belong to the local test profile. The results record the frontend bundle digests, browser version, tested viewports and assertions. [Results](results.json)

| Workstream | Observed behavior | Capture |
| --- | --- | --- |
| A · Drawing | Draw on clear paper, Keep, reopen the editable strokes, add a gem and save a revision. The calculated hash of the original stays the same. | [Crayon workspace](a-draw-pebble.png) |
| B · Illustrated worlds | Select the illustrated Moon world and place the bundled rocket behind Pebble. The recorded image shows the actual scene canvas and play controls. | [Moon stage](b-moon-stage.png) |
| C · Draw-to-animation | The first Bounce version plays in the saved scene after a later Spin version is kept. The video records the real stage canvas through one playback. | [Pebble playback](c-pebble-scene.webm) · [Paused frame](c-motion-frame-paused.png) · [Rest frame](c-motion-frame-rest.png) |
| D · Library and picker | Search “Moon rock” across the source and its revision, filter the collection, then choose the exact saved image. | [Selected art](d-asset-details.png) · [Scene picker](d-picker.png) |
| E · Host-owned artwork | Change an existing actor's picture, keep its identity and program, and play the same actions with the chosen revision. The separately qualified local generated-game fixture has its own evidence. | [Host scene after replacement](e-host-actor.png) |
| F · Custom environments | Fit the synthetic Paper hills image to the stage, keep the rocket decoration, export the selected revisions, and reuse the kept world in a second scene with different actors. | [Custom stage](f-private-backdrop.png) |

## Movement and touch checks

For each whole-image test, the runner independently decodes the original stored PNG at the displayed sprite resolution, compares all pixels with the preview canvas, observes the changing pose, pauses and resumes, saves the movement, then recalculates the original-byte digest. The seven captures show these different choices.

| Fixture | Motion | Fixture | Motion |
| --- | --- | --- | --- |
| Pebble | [Bounce](c-bounce-preview.png) | Dragon | [Float](c-float-preview.png) |
| Car | [Right](c-right-preview.png) | Rocket | [Jump](c-jump-preview.png) |
| Robot | [Dance](c-dance-preview.png) | Butterfly | [Spin](c-spin-preview.png) |
| Imaginary creature | [Shake](c-shake-preview.png) | | |

On emulated touch screens the test tapped a three-spot path, undid its last spot, selected a replacement, slowed playback, paused and kept it. It canceled a later change and recovered the kept path and pace after reload. Desktop checks also switched to a second profile and confirmed its art shelf was empty. [Phone, 390 × 844](c-path-phone.png) · [Tablet, 820 × 1180](c-path-tablet.png)

The advanced parts fixture uses a separate butterfly drawing. Its moving wing can be inspected in the stage recording and the tablet and phone editors. [Articulated butterfly playback](c-articulated-butterfly.webm) · [Tablet](c-articulated-butterfly.png) · [Phone](c-articulated-butterfly-phone.png)

The 768 × 1024 portrait beginner scene retains a 415 × 233 CSS-pixel stage. The existing learner journey also passed small phone, landscape and native 150% browser zoom. In a Moon world learning checkpoint, the white question heading measured at least 11.38:1 against the pixels behind it. [Rendered checkpoint](b-moon-learning.png)

The scene actor inspector can reopen an exact articulated rig from the shared picker. **Try the saved parts** runs its joints and **Back to scene** returns to the actor and its existing code. The scene itself plays the actor's blocks on a single composited sprite. The second recording shows the independently selected wing on a synthetic Plum bird. [Scene inspector](c-scene-saved-parts.png) · [Saved joint playback](c-scene-saved-parts.webm)

## Library interoperability

The #208 library at `0e58853773` and this candidate exchanged a synthetic editable PNG through their respective browser import and export controls. The return trip preserved the original record, the optional semantic label and the editable child revision. Both readers verified replayed pixels. Separate storage tests cover conflicting labels, independently retained roles and earlier 1/32-coordinate crayon records.

## Reproduction and qualification

Run `npm run build` followed by `node scripts/connected-universe-browser.cjs`. The runner starts a static loopback server and accepts only local GET requests. It uses a disconnected factory configuration and fresh browser contexts. `CHROMIUM_PATH` selects an installed Chromium. `UNIVERSE_BUILD` selects the built frontend, and `UNIVERSE_EVIDENCE` selects the output directory. The defaults are `dist` and `test-results/connected-universe`.

The desktop playback uses the repository's synthetic learning-pacing fixture so a randomly timed practice question cannot obscure the recording. Hosted isolation, real pen and finger input, owner visual review and family activation require separate evidence.
