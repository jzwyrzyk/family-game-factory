# Standalone UI review

The review build packages the selected Jems source into one downloadable `jems-ui-review.html`. Open it in current Chrome or Edge, including with the computer disconnected. No server, extension, account, real family data or AI service is needed.

The toolbar selects an experience, supported learning grade, effective iframe viewport, page/journey state and synthetic scenario. Fit display scales the live frame; the frame's CSS viewport still matches the selected dimensions and uses the product's responsive rules. Choose 100% to inspect physical text size, or hide the toolbar. Flag concerns after clicking an affected control, edit/delete findings, mark pages reviewed, and export Markdown or JSON. Findings use a separate browser-local key with an in-memory fallback. Export before closing if persistence is unavailable.

## Regenerate

From a clean checkout with Node 24+, Python 3 and Pillow:

```sh
npm ci
python3 -m pip install Pillow==11.3.0
npm run review:build
npm run review:test
```

The file is written to `dist-review/jems-ui-review.html`. `UI_REVIEW_OUT` changes the output directory. `UI_REVIEW_BASE_SHA` records a specific represented source; the build rejects a source mismatch in application files. The workflow pins the checked-out HEAD: the exact PR candidate for a PR run, or the merged commit for a main run. It never substitutes the merge base for candidate source. Download and evidence names use that same SHA. The artifact includes the full SHA, build timestamp, route manifest, limits and dated PR inventory. PR review builds must not be described as merged application changes.

`UI_REVIEW_EXACT_ASSETS=1 npm run review:build` retains original asset bytes (approximately 303 MiB at the initial baseline). The default uses maximum-768px, quality-90 WebP derivatives of the original Gem Pal images, preserving aspect ratio and transparency. Other artwork and fonts are exact. This makes the initial artifact approximately 55 MiB. No generated/replacement art is used and `public/` is never edited. Full-resolution art approval is outside the compact artifact.

## Implementation boundary

`tools/ui-review/entry.ts` installs synthetic profiles, reporting records and optional saved creations, rewards and companions before dynamically importing the real `src/main.ts`. The ordinary application, including its CSS, native game engines, educational presentations, coding, drawing and parent reporting, is bundled with esbuild. The production build never imports these review files.

`bootstrap.js` replaces service transports before application initialization. It uses reserved `.invalid` fixture origins, deterministic scripted coaching and queued/building/testing/ready/error job transitions. Generated gameplay is a labelled embedded transport fixture with the real host learning protocol. Native games retain the represented source engines. Authentication, passphrases, invitations and consent states are illustrative responses only. Never enter real credentials.

The build-only service-worker substitution, inline SVG symbol references, URL-to-embedded-blob mapping, isolated synthetic localStorage/IndexedDB names and review navigation adapter are explicit deviations. Source UI files are not edited. A restrictive CSP independently denies external connections, images, scripts, frames and native form submissions. WebSocket, EventSource, XHR, beacons, microphone and external navigation are unavailable. Browser-local synthetic saves are allowed. No cloud configuration, production deployment or paid generation is part of this tool.

All six grade values are available through the `early-preview` compile mode. The ordinary application build still excludes Pre-K/Kindergarten selection. The sandbox does not promote that preview capability into production.

## Inventory and maintenance

`coverage.json` contains 16 discovered page containers, 32 selectable intermediate states, 14 journey families and 9 scenario choices at the initial baseline. Counts describe available review entrances; they are not proof of every possible combination or human acceptance. Retained legacy screens are explicitly labelled. `review:coverage` scans source page IDs and fails for new unlisted pages. New journeys and conditional dialogs still need human source review. Update the manifest, fixtures and tests together when main changes.

`excluded-prs.json` preserves significant open work checked on November 25, 2026 against the initial `0f459f5` baseline. It is not a live PR-status service or a list of source excluded from a later candidate. Family-beta server welcome, account recovery and administrator routes are outside this standalone frontend harness even when their source is present; their separate beta acceptance remains required. Existing trusted-device and adult-session controls remain available.

Scenario scope is explicit: first-time/empty clear records, populated adds sample saved creations and receipts, long-content adds a longer library, unlocked seeds synthetic Pal/reward activity, locked denies simulated service availability, loading holds service work, and error fails coach/build responses. The toolbar can release pending work or restore normal responses before the product retry action. This does not manufacture a generic error overlay on every page.

## Tests and CI

`review:test` opens the HTML using `file://` in Chromium with no server. It checks route reachability, four live iframe viewport sizes, representative creation/build/play/learning, welcome, grades, adult profile, feedback downloads, toolbar visibility, broken images and unexpected network requests. It records overflow observations separately because the review must preserve product UI defects. Existing product tests are not replaced or reduced.

A managed local browser can prohibit `file://` by administrator policy. `UI_REVIEW_INLINE_HARNESS=1 npm run review:test` is an explicit development fallback that serves the single downloaded HTML file from a temporary loopback address. That result is only DOM/interaction evidence, not proof that file navigation succeeded. GitHub Actions runs the actual `file://` check on stock Chromium and uploads the HTML, manifest and test evidence without deployment credentials.

The workflow is additive, read-only, and independent of production releases. It runs on relevant main changes and application/sandbox-tool PRs. Review findings never upload automatically. Real-device, Edge-specific, speech/audio, accessibility and owner acceptance remain separate evidence. The HTML's coverage dialog is the authoritative per-artifact list of known deviations.

The artifact workflow pins Ubuntu 24.04 because the repository’s Playwright 1.56.1 cannot install on Ubuntu 26.04. Initial workflow attempts encountered this runner incompatibility before building. The corrected job builds the HTML before browser setup, so a browser-install failure still leaves a downloadable artifact with explicitly incomplete validation.

Additional integration checks add a Jump block and run the real scene engine, upload a synthetic local PNG into the art library, issue a simulated device invitation, and decode every embedded image. [Initial acceptance observations](ACCEPTANCE.md) record existing product UI concerns separately.

Review navigation waits for the real Parent page event before selecting a tab or submitting the synthetic unlock form. The application still saves pending work asynchronously and rejects a form submission from the previous view; the harness does not bypass that guard.

Open the **Standalone UI review** run and expand **Open the interactive review while browser qualification runs**. Its notice links directly to the immutable download and names the represented SHA. The job summary links to the PR changes. Extract the archive and open `jems-ui-review.html`. Browser status at upload is pending. Record owner feedback against that SHA and check the final hosted statuses before integration.

The primary download uploads immediately after the build, separately from browser evidence. Download availability does not by itself imply passing tests: check the run’s test step or the acceptance notes. Screenshot names use portable characters for Windows extraction.

## Child experience candidate, November 25

The modernization candidate includes the consolidated My Journey sections, Make/Rebuild/experiment landing, optional live movement introduction, My Art, the revised Home/menu, and saved-concept Build states. The toolbar labels the represented source as **candidate branch** or **merged main**; downloads use the exact represented SHA. PR builds check out and package the PR head rather than its merge base. The workflow also runs the production-bundle four-viewport modernization journey and uploads complete screenshots under `child-modernization/`. The offline review remains synthetic and separate from DEV deployment or owner acceptance. See the [decision](../decisions/2026-11-25-child-experience-modernization.md) and [acceptance record](../evidence/child-modernization/README.md).

Choose **My Journey** in the destination selector to inspect the three dashboard cards. Check **Empty** for starter selection and **Unlocked** for an equipped companion and earned gems. Follow each card into the corresponding live section, then return through My Journey.

The Journey, Pals, rewards and Powers destinations render the shared production header and cards. Use the empty scenario to review the two starter choices. Compare the same application viewport on each page and use Shift+Tab from the announced heading to check the back action’s visible keyboard focus.

For a smaller offline review of My Art, run `node tools/ui-review/build.mjs --drawing` and open `dist-review/jems-drawing-review.html`. It opens the production My Art workspace in a synthetic single-profile host and packages the exact drawing-page art, stamp images, icon sheet and fonts. Choose **Draw here**, keep a sketch, select **Keep drawing** and save a second version. This focused file retains its synthetic art library across reopening the same file in the same browser where local storage is available. Resetting demo data starts a new synthetic library. Other destinations belong in the full review file.

The notebook flight review drives the original game with keyboard events and waits for processed simulation ticks. It checks the point awarded for the collectible, collision with the obstacle, the win and the kept notebook version. The full download decodes exact source assets using native base64 decoding where available and a byte-preserving fallback.

In the mixed-grade family, the first learner uses the toolbar grade. The sibling uses Grade 4, or Grade 1 when the first learner uses Grade 4. Both profiles retain distinct, supported curriculum settings for the review.
