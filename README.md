# Family Arcade 0.3

Open `index.html` in a browser, or serve it with any static web server. No build or backend is needed.

- **Play:** all three original games, with touch and keyboard controls.
- **Create:** Dream → Choose → Save, a guided game idea notebook. Saved concepts need a grown-up to develop them into playable games.
- **Remix:** choose a game and challenge. Gentle highlights matching builder pieces, reveals the safe bucket, or adds dragon hearts and slows breath. Extra challenge adds builder decoys, a fourth bucket, or fewer dragon hearts and faster breath. Classic preserves original behavior. Choices are saved per profile and also apply when launching from Play.
- **My Creations:** family ideas, including existing ideas and improvements, with supervised sharing tools.
- **My Powers:** the original adaptive math practice and progress dashboard.

Grown-ups can reach all original learning settings and JSON backup/restore tools from the footer. The original `family-game-factory-state-v1` local storage key and v1 backup format are preserved. Optional per-profile `remixes` fields are included in backups; old backups work without them. Data stays in the current browser; export backups before changing devices. A failed idea save leaves the draft visible.

## Browser tests

Use Node 22 or newer:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Tests use system Chromium when installed, otherwise Playwright's Chromium. Set `CHROMIUM_PATH` to override. They cover the creation wizard, idea persistence, safe text rendering, all games and difficulty launches, bucket round completion, math feedback, parent settings, backup restore, profile isolation, storage failure, and mobile navigation/layout. GitHub Actions runs them for pushes and pull requests. No automatic merge or deployment is configured.
