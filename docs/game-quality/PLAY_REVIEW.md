# Game Quality — device and play review

Use this guide after the reviewed branch has passed its automated checks. It gathers the two kinds of evidence that CI cannot supply: how the games behave on the family's actual devices, and what a child can understand and choose to do while playing.

This is a blank review guide, not a report of completed child or device testing. Keep completed observations separate from the repository and CI artifacts; names, profiles, drawings, prompts and recordings are unnecessary for these checks.

## Open the reviewed build

Check out `feature/game-quality-v1`, then run:

```sh
npm ci
npm run build
npm exec -- vite preview --host 127.0.0.1
```

Use the printed URL. Add `?studio=1` for the integrated play/design route.

For a phone or tablet on the same trusted Wi-Fi network, stop that preview and run `npm exec -- vite preview --host 0.0.0.0`, then open its printed **Network** URL on the device. This serves the built app on the local network; it does not publish the arcade or enable a generation service. Stop the preview with Ctrl+C when finished. If the device cannot reach the computer, use the computer first and record the device check as not run.

Record the exact source with `git rev-parse HEAD`. Keep browser zoom at its usual setting, and record any accessibility or sound settings that affect the experience. The generated-game screenshots in the engineering report are authored fixtures; the native workshop and Rally can be reviewed locally without a model account.

| Review context | Record |
| --- | --- |
| Source commit | |
| Device model, OS and browser version | |
| Portrait or landscape | |
| Touch, mouse or keyboard | |
| Music/effects on or off | |
| Relevant zoom, motion or accessibility settings | |

## Adult device check

Run this once before inviting a child to try the build. Record **passed**, **problem observed**, or **not run**, with the exact action that produced a problem.

| Check | Action and expected observation |
| --- | --- |
| First load | Open the arcade, then each native game. Artwork and controls appear; the page fits without horizontal scrolling. Record a visibly slow load rather than guessing a cause. |
| Sustained driving | Drive, brake and retry on each trail. Watch for repeated stutters, missed releases, or an uncomfortable increase in device warmth. |
| Construction | Select adjacent parts, move and rotate one, connect gum, test, and return to editing. Check the smaller phone layout as well as a larger display if available. |
| Pause and resize | Pause, rotate the device or resize the window, and resume. The paused scene remains visible, controls fit, and the game resumes without a large movement jump. |
| Background and return | Leave the browser with a pedal or action held, return, and resume. The old input must be released; hidden time must not rush through the simulation. |
| Sound | Start music and effects through an ordinary interaction. Pause and leave the game. Sound should stop appropriately and restart only with the supported flow. |
| Saving | Change a build or ride, navigate away, and reload. Check that the intended version and setup return. |
| Switching | Switch games and profiles. The previous game's motion, sound and controls must not continue in the new view. |

Frame-interval statistics exposed by the native snapshots describe browser scheduling over a short window. They are not GPU time, CPU time, touch-to-display latency, or a device-wide frame-rate certification. The [engineering validation](VALIDATION.md) records the different scope of the headless CPU benchmark.

## Observe a short play session

Start with one game and allow switching or stopping. Ask the child what they want to try. For each action, record **independent**, **after a hint**, **needed help**, or **not attempted**. Note the hint if one was needed; that distinguishes what the interface explained from what the adult supplied.

| Task | What to observe |
| --- | --- |
| Start | Finds the first useful action and begins playing. |
| Drive | Uses Go and Brake, recovers from a failed attempt, and finds retry. |
| Build | Selects the intended component among neighboring parts and finds Test machine. |
| Recover | Returns to the intact design and makes one change. |
| Predict and compare | Describes what they think a change might do, then notices what happened. An unexpected result is useful evidence. |
| Make an experiment | Uses a supported request such as bigger wheels, softer springs or a stronger fan, and finds Compare/Keep. |
| Continue or stop | Chooses another attempt, changes games, or stops without needing the adult to find the controls. |

Useful neutral prompts are “What do you want to try?”, “What happened?”, and “What would you change?”. Give help when needed; record it rather than treating the session as a test the child must pass. The design coach's learning decisions remain owned by its separate branch.

Pay particular attention to whether a phone user can select the intended wheel, fan, box or passenger in an assembled machine. Existing screenshots show small adjacent components, but only observation can tell us whether the current selection tolerance is adequate. Do not treat that hypothesis as an observed failure.

## Turn an observation into the next change

Record the device, source commit, starting state, action, observed result and the smallest reproducible example. Separate an observed problem from a proposed explanation.

- A lost input, missing scene, broken save, or sound continuing after exit is a correctness issue to reproduce and fix.
- Repeated missed selections or requests for the same hint justify a focused interface change, followed by the same task again.
- A preference for a trail, sound or visual style is feedback to compare across sessions; it does not establish a universal preference.
- Voluntary retry and an explanation of cause and effect are useful observations. Session length alone does not establish enjoyment or learning.

Continue with the [implementation standard](../GAME-QUALITY.md) and the [validation report](VALIDATION.md). Drawing recognition and live generated-game rollout remain separate work.
