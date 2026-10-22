# poker-hand-keyboard v2 brief (staging only, do NOT deploy)

Repo: ~/poker-hand-keyboard (github.com/Tungi97/poker-hand-keyboard, live on GitHub Pages).
Rule: do all v2 work on a new branch `staging`. Do NOT merge to main and do NOT touch the GitHub Pages deploy. Run it locally (dev server) and, if easy, a separate staging preview (e.g. a `/staging/` build or a preview URL) that doesn't replace the live app. Tung will test before anything ships.

## Changes

1. **Effective stack overwrite.** When the user starts typing the eff stack number, replace the old value instead of appending to it. The first digit clears the field, and later digits build the new number. Same idea anywhere a number field has a previous value (e.g. bet size).

2. **Auto-advance to next active player.** Track who is still in the hand and whose turn it is. After any action (fold, call, raise, check, allin), automatically insert the next player who still has to act.
   - Example at 5/5: `hero lj r 20 co c btn r 100` → user enters `lj f` → app auto-fills `co` (the next live player facing the raise), then the next one, and so on.
   - Skip folded and all-in players. Wrap around the table correctly, and close the street when action is complete (then move on to the next street with the pot calc).
   - The user can still override by tapping a different position.

3. **4-color deck on the keyboard.** Suit keys and rendered cards use vibrant 4-color deck colors: spades black or white (match the theme), hearts red, diamonds blue, clubs green. Keep the charcoal/gold UI theme (no green backgrounds). Make them clearly more saturated than now.

4. **Showdown line.** At the end of the hand, add a showdown step: pick a position and cards → output line like `bb shows AhKs`. Support several players showing, and a "mucks" option.

5. **Fix copy button.** The copy button currently does nothing. Copy the full hand text to the clipboard with `navigator.clipboard.writeText`, and fall back to a hidden textarea + `document.execCommand('copy')` (needed on iOS Safari / non-https). Show a short "copied" confirmation. Test on iPhone Safari as a PWA.

## Keep
- PBT note format: first line `eff X (Ybb)`, one line per street with the pot at the start, preflop folders by position only, conventional sizes.
- Offline PWA, charcoal/gold theme.

## Done when
- All 5 changes work on the `staging` branch, tested locally on desktop and phone.
- Live main/Pages is unchanged.
- Short summary of what changed and how to preview staging.
