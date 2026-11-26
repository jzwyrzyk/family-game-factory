# Independent creative performance measurements

26 November 2026. The source comparator is #215 because it implements a retained original, a cross-activity picker and personalized worlds. Candidate B and the combined rehearsal exercise the same public runtime flows. The library contains 48 separately generated 768 × 512 PNG originals and 12 linked revisions. Their original bytes total 10,748,788. The collection includes shared semantic labels across a revision family. Five exact drawing pins appear in a kept Gem Forest world with a working jump program.

Linux headless Chromium 156.0.8078.79 ran at 1280 × 900 with the service worker disabled, four logical CPUs available by quota, local static assets and a synthetic unavailable service provider. The benchmark records no external requests. Each fresh run opens an empty profile once, reloads its populated shelf five times and exercises the interactive journey three times. The original and B runs were repeated in opposite order. Absolute values below are ranges of per-run medians, except startup which is a range of individual cold openings. Concurrent work on the host affects elapsed and frame times. The ranges do not support a speedup or slowdown claim.

| Measurement | Source #215 | B e61faded | B 48e9ae9 | B 3d301245 | B ebc465de | B 5a651fcc | B 3d6a6a67 | B 9e5c9e64 | B f2c2e7e9 | C ba1904fc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Empty profile startup to My Art, ms | 762.5–1,042.7 | 1,090.3–2,386.9 | 1,114.3–1,579.7 | 1,430.6–3,296.4 | 2,470.4–2,635.9 | 2,185.6–3,511.0 | 3,247.5–3,291.5 | 1,048.6–4,341.6 | 1,930.0–2,092.8 | 884.6–1,199.8 |
| Populated reload to 24 cards and a decoded thumbnail, ms | 540.1–1,438.2 | 500.0–1,197.4 | 538.2–769.1 | 589.9–1,030.1 | 1,468.1–1,573.7 | 552.8–1,234.7 | 1,876.2–2,091.9 | 1,074.8–1,506.7 | 980.3–1,182.2 | 552.7–691.2 |
| Native 24-record metadata page, ms | 8.0–27.1 | 11.3–33.6 | 11.1–25.5 | 10.3–21.8 | 41.5–60.3 | 11.4–14.8 | 38.4–60.8 | 21.5–34.6 | 25.8–28.7 | 10.4–11.8 |
| 60-choice owner catalog, ms | 12.1–48.4 | 22.1–56.2 | 19.6–24.3 | 14.9–25.2 | 53.7–68.6 | 16.9–20.6 | 45.7–69.4 | 38.5–48.6 | 21.9–23.2 | 13.4–29.2 |
| Search label to two related revisions, ms | 85.3–157.6 | 82.2–250.4 | 80.7–121.7 | 89.0–158.8 | 155.6–205.8 | 95.3–128.3 | 312.4–487.5 | 72.7–148.7 | 187.8–209.1 | 72.1–104.4 |
| Picker to first painted thumbnail, ms | 106.0–518.2 | 152.3–335.2 | 169.4–186.2 | 222.1–377.5 | 336.5–475.9 | 213.6–265.9 | 862.0–1,055.3 | 191.0–363.4 | 431.1–679.2 | 182.2–209.8 |
| Picker to all 12 painted thumbnails, ms | 109.7–634.0 | 165.3–340.1 | 200.0–209.7 | 236.0–427.0 | 379.6–587.7 | 244.2–303.0 | 885.7–1,124.3 | 200.3–380.4 | 499.6–701.1 | 195.1–223.8 |
| Open kept world to restored scene, ms | 128.6–409.4 | 153.4–822.7 | 167.7–230.7 | 162.9–310.7 | 378.8–404.5 | 190.4–553.6 | 521.1–696.6 | 154.6–156.2 | 255.0–332.4 | 80.1–204.9 |
| Open kept world to active play, ms | 190.8–549.7 | 213.8–1,199.5 | 214.7–303.0 | 232.0–432.1 | 474.0–492.3 | 300.6–878.8 | 802.9–890.5 | 223.3–259.9 | 479.8–576.3 | 192.9–288.5 |
| 95th percentile animation-frame interval, ms | 16.8–40.9 | 16.8–50.0 | 16.8 | 16.8 | 16.7–33.3 | 16.8 | 50.0–66.7 | 16.7–16.8 | 33.4 | 16.8 |
| Populated shelf JS heap, MiB | 20.9–21.1 | 17.1–18.4 | 21.4–24.5 | 15.2–22.0 | 18.7 | 19.2–25.4 | 19.3–26.5 | 17.5–26.0 | 18.8–21.6 | 15.5–15.6 |
| Origin IndexedDB, bytes | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 | 15,876,096 |
| Main JS + CSS entry bundles, bytes | 2,381,378 | 2,415,630 | 2,463,514 | 2,468,290 | 2,482,766 | 2,489,030 | 2,503,794 | 2,504,057 | 2,505,022 | 2,568,869 |

Frame intervals measure browser animation-frame scheduling during actual scene playback. The heap measurement covers the JavaScript heap after shelf and catalog access. The recorded storage estimate covers this browser origin. The bundle value covers the primary built JS and CSS entries. The complete owner HTML, browser process resident memory, physical devices, pen latency and service-backed startup each require separate measurement.

## Drawing input and undo

The desktop browser dispatches actual pointer input for 32 strokes with eight motion segments per stroke. Each run samples pointer dispatch to the next animation callback and the undo control through native canvas readback. Full RGBA hashes before drawing and after all 32 undo actions must match. These figures include the browser scheduling environment.

| Source | Median pointer move to next frame, ms | P95 pointer move to next frame, ms | Median undo through canvas readback, ms | Undo reproduced initial pixels |
| --- | --- | --- | --- | --- |
| Source #215 | 28.25 | 38.26 | 1.10 | True |
| B e61faded | 27.10 | 33.40 | 2.05 | True |
| B 48e9ae9 | 29.55 | 41.62 | 2.05 | True |
| B 3d301245 | 29.10 | 46.26 | 2.05 | True |
| B ebc465de | 29.85 | 67.52 | 2.15 | True |
| B 5a651fcc | 31.15 | 90.22 | 1.75 | True |
| B 3d6a6a67 | 32.75 | 76.55 | 2.10 | True |
| B 9e5c9e64 | 31.20 | 49.32 | 1.95 | True |
| B f2c2e7e9 | 34.30 | 86.57 | 2.00 | True |
| C ba1904fc | 29.20 | 41.35 | 1.80 | True |

## Playable game startup

The original browser journeys retained their gameplay, revision and network assertions. The timer begins when the child opens the local test and ends when the selected picture contributes visible pixels in Gem Hunt, or when the first instruction is visible after starting the picture hunt. Each figure is a single synthetic sample.

| Source / game | Layout | Startup, ms | Receipt |
| --- | --- | --- | --- |
| 48e9ae9d0 / gem | desktop | 213.8 | [Run](audit-creative/b2-gem-game-time.json) |
| 48e9ae9d0 / picture | desktop | 242.4 | [Run](audit-creative/b2-picture-game-time.json) |
| 48e9ae9d0 / picture | tablet | 288.7 | [Run](audit-creative/b2-picture-game-time.json) |
| f8d49082e / gem | desktop | 347.1 | [Run](audit-creative/source-212-game-time.json) |
| ca76b5b15 / picture | desktop | 383.2 | [Run](audit-creative/source-215-game-time.json) |
| ca76b5b15 / picture | tablet | 410.9 | [Run](audit-creative/source-215-game-time.json) |
| 563de940 / gem | desktop | 237.7 | [Run](audit-creative/c-final-gem-game-time.json) |
| 563de940 / picture | desktop | 349.2 | [Run](audit-creative/c-final-picture-game-time.json) |
| 563de940 / picture | tablet | 273.3 | [Run](audit-creative/c-final-picture-game-time.json) |

## Receipts

- [Source #215 / painted-bench](audit-creative/source-215-painted-bench.json)
- [Source #215 / painted-bench-r2](audit-creative/source-215-painted-bench-r2.json)
- [Source #215 / drawing-bench](audit-creative/source-215-drawing-bench.json)
- [B e61faded / painted-bench](audit-creative/b1-painted-bench.json)
- [B e61faded / painted-bench-r2](audit-creative/b1-painted-bench-r2.json)
- [B e61faded / drawing-bench](audit-creative/b1-drawing-bench.json)
- [B 48e9ae9 / painted-bench](audit-creative/b2-painted-bench.json)
- [B 48e9ae9 / painted-bench-r2](audit-creative/b2-painted-bench-r2.json)
- [B 48e9ae9 / drawing-bench](audit-creative/b2-drawing-bench.json)
- [B 3d301245 / painted-bench](audit-creative/b3-painted-bench.json)
- [B 3d301245 / painted-bench-r2](audit-creative/b3-painted-bench-r2.json)
- [B 3d301245 / drawing-bench](audit-creative/b3-drawing-bench.json)
- [B ebc465de / painted-bench](audit-creative/b4-painted-bench.json)
- [B ebc465de / painted-bench-r2](audit-creative/b4-painted-bench-r2.json)
- [B ebc465de / drawing-bench](audit-creative/b4-drawing-bench.json)
- [B 5a651fcc / painted-bench](audit-creative/b7-painted-bench.json)
- [B 5a651fcc / painted-bench-r2](audit-creative/b7-painted-bench-r2.json)
- [B 5a651fcc / drawing-bench](audit-creative/b7-drawing-bench.json)
- [B 3d6a6a67 / painted-bench](audit-creative/b8-painted-bench.json)
- [B 3d6a6a67 / painted-bench-r2](audit-creative/b8-painted-bench-r2.json)
- [B 3d6a6a67 / drawing-bench](audit-creative/b8-drawing-bench.json)
- [B 9e5c9e64 / painted-bench](audit-creative/b10-painted-bench.json)
- [B 9e5c9e64 / painted-bench-r2](audit-creative/b10-painted-bench-r2.json)
- [B 9e5c9e64 / drawing-bench](audit-creative/b10-drawing-bench.json)
- [B f2c2e7e9 / painted-bench](audit-creative/f2-painted-bench.json)
- [B f2c2e7e9 / painted-bench-r2](audit-creative/f2-painted-bench-r2.json)
- [B f2c2e7e9 / drawing-bench](audit-creative/f2-drawing-bench.json)
- [C ba1904fc / painted-bench](audit-creative/c-painted-bench.json)
- [C ba1904fc / painted-bench-r2](audit-creative/c-painted-bench-r2.json)
- [C ba1904fc / drawing-bench](audit-creative/c-drawing-bench.json)

[Browser library benchmark](audit-creative/library-journey-bench.cjs) · [Drawing benchmark](audit-creative/drawing-bench.cjs)

## The full per-owner creative catalog

On rehearsal `563de940`, the 80 originals, 20 linked picture revisions and 200 saved movements reached both native record-count limits and produced 300 catalog choices. Each 768 × 512 transparent synthetic PNG contains 15 painted curves. Original bytes totaled 12,063,145. The real writers rejected a 101st drawing and a 201st movement, after which My Art still had all 100 images and the catalog still had all 300 choices. Search found both related revisions, the picker painted 12 results and the kept scene played with five pinned drawings and the authored jump. [Raw measurements and capacity responses](audit-creative/c-library-ceiling.json) · [Fixture and interactions](audit-creative/library-ceiling-bench.cjs)

| Operation | Observed time or size |
| --- | --- |
| Empty startup to My Art | 921 ms |
| Populated reload to 24 shelf cards and a decoded thumbnail | 597 ms |
| Native 24-record metadata page | 10.3 ms |
| Read all 300 artwork and movement choices | 26 ms |
| Search label to both related revisions | 86 ms |
| Picker to first thumbnail and all 12 painted thumbnails | 282 ms and 297 ms |
| Reopen kept scene and reach active play | 140 ms and 238 ms |
| Playback animation-frame interval, 95th percentile | 16.8 ms |
| Shelf JavaScript heap and estimated IndexedDB footprint | 19,646,556 bytes and 18,120,704 bytes |

The synthetic Linux headless Chromium 156 run used a 1280 × 900 viewport, native IndexedDB and local assets. The receipt contains five populated reloads, three search/play/picker journeys, one cold opening and zero external requests. The times above are medians across the corresponding samples, apart from cold opening and the stated 95th percentile. The larger-count fixture fits both count limits within the separate 20 MiB artwork quota. Its drawings use fewer curves than the identical 60-picture dataset used for the source-to-candidate comparison. Absolute times reflect the shared host and browser.
