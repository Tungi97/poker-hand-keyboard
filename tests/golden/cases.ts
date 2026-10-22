// Golden cases: `keys` is typed through the real editor (`|` = next street key).
// Expected output lives in tests/golden/<name>.golden.txt — review diffs by hand.
import type { Setup } from '../../src/engine';

const s55: Setup = { sb: 5, bb: 5, eff: 500, labels: ['fish', 'reg'] };
const s25: Setup = { sb: 2, bb: 5, eff: 1000, labels: ['fish'] };

export interface GoldenCase {
  name: string;
  setup: Setup;
  keys: string;
}

export const cases: GoldenCase[] = [
  {
    name: 'brief-worked-example',
    setup: s55,
    keys: 'hero btn r 20 sb r 90 hero c | Ad 7d 6s x b 60 c | 3s x x | Qs b 200 f',
  },
  { name: 'limp-and-check-option', setup: s55, keys: 'utg c hero co c bb x | Kh 8c 2d x x x' },
  { name: 'walk-fold-to-raise', setup: s55, keys: 'hero co r 15 btn f sb f bb f' },
  {
    name: 'folded-label-is-dropped',
    setup: s55,
    keys: 'fish utg c reg hj r 30 hero btn c fish f | Ts 9s 2c reg b 40 hero c',
  },
  {
    name: 'allin-fill-and-call',
    setup: s55,
    keys: 'hero btn r 20 sb r 90 hero c | Ad 7d 6s sb allin hero c | 3s | Qs',
  },
  { name: 'preflop-allin-uncalled', setup: s25, keys: 'hero sb r 20 bb allin hero f' },
  { name: '3way-postflop-implicit-order', setup: s25, keys: 'co r 15 hero btn c bb c | Jh Jd 4c x b 30 hero c bb f' },
  { name: 'multiway-raise-postflop', setup: s25, keys: 'hj r 20 hero co c bb c | 8h 7h 2s bb b 40 hj r 120 hero f bb c | Ac x x' },
  { name: 'odd-blinds-sb-complete', setup: s25, keys: 'sb c bb x | 5c 5d 9h b 10 c' },
  { name: 'error-check-facing-bet', setup: s55, keys: 'hero btn r 20 sb x' },

  // v2: auto-advance, showdown, eff overwrite
  {
    name: 'v2-auto-advance-brief-example',
    setup: s55,
    keys: 'hero lj r 20 co c btn r 100 lj f c Kd 9d 4h',
  },
  {
    name: 'v2-showdown-shows-and-mucks',
    setup: s55,
    keys: 'hero btn r 20 sb r 90 hero c Ad 7d 6s x b 60 c 3s x x Qs b 200 c shows AhKs mucks',
  },
  { name: 'v2-allin-runout-two-show', setup: s55, keys: 'hero btn r 20 sb allin hero c Ad7d6s 3s Qs shows KhKd shows AsAc' },
  { name: 'v2-label-before-suggested-seat', setup: s55, keys: 'hero btn r 20 fish r 90 hero c Jc Tc 2h fish b 60 c' },
  { name: 'v2-eff-overwrite-and-short-allin', setup: s55, keys: '800 eff 600 hero btn r 20 sb allin 450 hero c' },
  {
    name: 'v2-river-checked-through-showdown',
    setup: s55,
    keys: 'hero lj r 20 co c btn r 100 lj f c Kd9d4h x x Ah x b 50 c 2c x x shows AsAd mucks',
  },
  { name: 'v2-voluntary-show-after-fold', setup: s55, keys: 'hero co r 15 btn f sb f bb f hero shows QhQd' },
];
