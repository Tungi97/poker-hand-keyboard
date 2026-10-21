# Poker Hand Keyboard

A tiny offline PWA for logging live poker hands in shorthand with a custom on-screen keyboard. The output is plain text you paste into a Poker Bankroll Tracker session note.

```
eff 500 (100bb)
hero btn r 20 sb r 90 hero c
185 flop Ad 7d 6s. x b 60 c
305 turn 3s. x x
305 river Qs. b 200 f
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5180 (also on your LAN IP, so you can open it on your phone)
npm test           # golden tests for the parser + pot math
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (with service worker) on :5181
```

## How it works

- **Typing:** tap keys exactly as you'd write the note: `hero btn r 20 sb r 90 hero c`.
  - Players you skip over are treated as folding (if they face a bet) or checking.
  - Postflop you can omit names (`x b 60 c`); actions go to whoever is next in order.
- **Amounts:** `r`/`b` N is the **total** bet on that street, including blinds already posted. Dead blinds stay in the pot, and uncalled bets are returned.
- **next street:** works out the pot and starts a line like `185 flop`. Then enter 3 board cards (1 on the turn and river); a `.` is added after the last one.
- **Cards:** tap a rank, then a suit. Cards already used are greyed out.
- **allin:** fills in the player's remaining stack as their total bet, e.g. `allin 410`.
- **Labels:** villain labels (Setup) bind to a seat with `fish sb`. After that, `fish` alone works as the actor.
  - If a labelled player folds preflop, their name is removed when the flop starts (positions only).
- **Stacks:** every player starts with the effective stack from Setup. The `eff` line at the top of the note is what the parser uses.
- **Saving:** the current hand and the session history are kept in `localStorage`.
  - **new hand** saves the current hand to History.
  - History has copy one / copy all / delete.
- **Hints:** the status bar shows the live pot and who's still in. The line under the note shows who acts next, or a warning if the shorthand doesn't make sense (e.g. a check while facing a bet).

## Tests

`tests/golden/cases.ts` lists key sequences. Each one is typed through the real editor (`|` = next street), and the result is compared with `tests/golden/<name>.golden.txt`, which holds the note and the parsed state (pot, who's in, stacks).

`tests/golden.test.ts` also checks the worked example from the brief against hand-written expectations.

After an intended change, run `npm run test:update` and review the golden diffs.

## Deploy (free)

**Vercel:** import the repo at vercel.com/new. The framework preset is Vite, the build command is `npm run build` and the output folder is `dist`. That's all.

**GitHub Pages:**
1. Push to a GitHub repo on the `main` branch.
2. In Settings → Pages → Source, choose **GitHub Actions**.
3. `.github/workflows/pages.yml` then tests, builds and deploys on every push.

The build uses relative paths, so it works under `/<repo>/` as-is.

## Install on iPhone

1. Open the deployed URL in Safari.
2. Tap Share → **Add to Home Screen**.
3. Open it once while online. After that it works fully offline.
