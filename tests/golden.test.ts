import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activePlayers, parseHand, type Setup } from '../src/engine';
import { typeScript } from '../src/editor';
import { cases } from './golden/cases';

const dir = join(__dirname, 'golden');
const update = !!process.env.UPDATE_GOLDEN;

function render(text: string, setup: Setup): string {
  const s = parseHand(text, setup);
  const players = activePlayers(s)
    .map((p) => `${p.label ? `${p.label}=` : ''}${p.seat}:${p.stack}${p.allIn ? ' (allin)' : ''}`)
    .join(', ');
  return [
    `setup: ${setup.sb}/${setup.bb} eff ${setup.eff}`,
    '== note ==',
    text,
    '== state ==',
    `street: ${s.street}  board: ${s.board.join(' ') || '-'}`,
    `pot: ${s.pot}  live: ${s.live}  if-closed: ${s.potIfClosed}`,
    `in hand: ${players}`,
    `to act: ${s.toAct ?? '-'}  hand over: ${s.handOver}`,
    `errors: ${s.errors.length ? s.errors.join('; ') : 'none'}`,
    '',
  ].join('\n');
}

describe('golden hands', () => {
  for (const c of cases) {
    it(c.name, () => {
      const actual = render(typeScript(c.keys, c.setup), c.setup);
      const file = join(dir, `${c.name}.golden.txt`);
      if (update || !existsSync(file)) {
        writeFileSync(file, actual);
        if (!update) throw new Error(`wrote new golden ${file}; review it and re-run`);
      }
      expect(actual).toBe(readFileSync(file, 'utf8'));
    });
  }
});

describe('brief worked example (hand-written expectations)', () => {
  const setup: Setup = { sb: 5, bb: 5, eff: 500, labels: [] };

  it('5/5: hero btn r 20 sb r 90 hero c -> 185 flop', () => {
    const text = typeScript('hero btn r 20 sb r 90 hero c |', setup);
    expect(text).toBe('eff 500 (100bb)\nhero btn r 20 sb r 90 hero c\n185 flop');
  });

  it('produces the full PBT note from the brief', () => {
    const text = typeScript('hero btn r 20 sb r 90 hero c | Ad 7d 6s x b 60 c | 3s x x | Qs b 200 f', setup);
    expect(text).toBe(
      [
        'eff 500 (100bb)',
        'hero btn r 20 sb r 90 hero c',
        '185 flop Ad 7d 6s. x b 60 c',
        '305 turn 3s. x x',
        '305 river Qs. b 200 f',
      ].join('\n'),
    );
  });

  it('parses the brief text as written (river without the period)', () => {
    const s = parseHand(
      'eff 500 (100bb)\nhero btn r 20 sb r 90 hero c\n185 flop Ad 7d 6s. x b 60 c\n305 turn 3s. x x\n305 river Qs b 200 f',
      setup,
    );
    expect(s.errors).toEqual([]);
    expect(s.potIfClosed).toBe(305);
    expect(s.handOver).toBe(true);
    expect(s.players.sb.inHand).toBe(true);
    expect(s.players.btn.inHand).toBe(false);
  });
});
