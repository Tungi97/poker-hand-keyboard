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
];
