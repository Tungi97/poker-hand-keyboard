# Poker Hand Keyboard

## Goal
A minimal phone app (PWA, offline, add to home screen) for logging live poker hands at the table as fast as possible. No fancy UI: just a text area showing the note and a **custom on-screen keyboard** (system keyboard never opens). Output is plain text I copy-paste into a Poker Bankroll Tracker (PBT) session note.

## Keyboard
- Numbers 0-9, backspace, space, clear.
- Actions: r b c x f allin.
- Positions: utg utg1 mp lj hj co btn sb bb, plus "hero".
- Cards: ranks 2-9 T J Q K A, then a suit key s h d c (cards already used are disabled).
- "next street" key, "copy" key, "new hand" key.
- Optional: a few saved villain labels (names) as keys, set in a tiny setup screen.

## Behaviour
- I type shorthand exactly like my notes: `hero btn r 20 sb r 90 hero c`.
- On "next street", the app parses the action so far, computes the pot and starts a new line like `185 flop ` then expects 3 cards (turn/river: 1 card).
  - Blinds come from setup (e.g. 5/5). A raise amount is the total bet, including chips already posted. Dead/folded blinds count in the pot.
  - Worked example, 5/5: `hero btn r 20 sb r 90 hero c` -> bb's 5 dead + 90 + 90 = `185 flop`.
- Tracks who is still in the hand and stack sizes (setup: effective stack), so allin amounts are filled in.
- First line of each hand states the effective stack, e.g. `eff 500 (100bb)`.
- Players who fold preflop are written by position only, no names; names/labels kept for players who continue.
- History of hands this session (local storage), copy one / copy all.

## Example output (my PBT note style)
```
eff 500 (100bb)
hero btn r 20 sb r 90 hero c
185 flop Ad 7d 6s. x b 60 c
305 turn 3s. x x
305 river Qs b 200 f
```

## Style
Neutral, classy, elegant: charcoal/graphite, off-white text, a subtle muted gold or silver accent, clean typography. No green.

## Tech
Static web app (Vite + TypeScript), no backend, deployable free (Vercel or GitHub Pages) so I can use it on my iPhone. Golden tests for the parser and pot math (include the worked example). README with run + deploy steps.
