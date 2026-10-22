import { describe, expect, it } from 'vitest';
import { applyKey, exportText, newHandText, typeKeys, typeScript, type EditorState, type Key } from '../src/editor';
import type { Setup } from '../src/engine';

const setup: Setup = { sb: 5, bb: 5, eff: 500, labels: [] };
const press = (text: string, ...keys: Key[]) =>
  keys.reduce<EditorState>((st, k) => applyKey(st, k, setup), { text, pendingRank: null }).text;

describe('editor keys', () => {
  it('starts a hand with the eff line', () => {
    expect(newHandText(setup)).toBe('eff 500 (100bb)\n');
    expect(newHandText({ ...setup, eff: 1234, bb: 10 })).toBe('eff 1234 (123.4bb)\n');
  });

  it('backspace removes a digit, then a whole word, never the eff line', () => {
    const t = typeScript('hero btn r 20', setup);
    expect(press(t, { t: 'back' })).toBe('eff 500 (100bb)\nhero btn r 2');
    expect(press(t, { t: 'back' }, { t: 'back' }, { t: 'back' })).toBe('eff 500 (100bb)\nhero btn');
    expect(press(newHandText(setup), { t: 'back' }, { t: 'back' })).toBe('eff 500 (100bb)\n');
  });

  it('backspace removes a street header in one press', () => {
    const t = typeScript('hero btn r 20 sb r 90 hero c |', setup);
    expect(press(t, { t: 'back' })).toBe('eff 500 (100bb)\nhero btn r 20 sb r 90 hero c');
  });

  it('allin fills the remaining stack as the total bet', () => {
    expect(typeScript('hero btn r 20 sb allin', setup)).toBe('eff 500 (100bb)\nhero btn r 20 sb allin 500');
  });

  it('refuses a card already used', () => {
    const t = typeScript('hero btn r 20 sb r 90 hero c | Ad 7d 6s', setup);
    expect(press(t, { t: 'rank', r: 'A' }, { t: 'suit', s: 'd' })).toBe(t);
  });

  it('next street is a no-op once the hand is over', () => {
    const t = typeScript('hero co r 15 btn f sb f bb f', setup);
    expect(press(t, { t: 'next' })).toBe(t);
  });

  it('first digit on a fresh hand overwrites the eff stack, later digits build it', () => {
    expect(typeScript('3', setup)).toBe('eff 3 (0.6bb)');
    expect(typeScript('300', setup)).toBe('eff 300 (60bb)');
  });

  it('tapping eff mid-hand overwrites the value instead of appending', () => {
    const st = typeKeys('hero btn r 20 eff 750', setup);
    expect(st.text.split('\n')[0]).toBe('eff 750 (150bb)');
    expect(st.text).toContain('hero btn r 20');
  });

  it('first digit after an allin fill-in replaces the amount', () => {
    expect(typeScript('hero btn r 20 sb allin 3', setup)).toBe('eff 500 (100bb)\nhero btn r 20 sb allin 3');
  });

  it('auto-inserts the next live player after an action, and a tapped seat replaces it', () => {
    const st = typeKeys('hero lj r 20 co c btn r 100 lj f', setup);
    expect(st.autoActor).toBe(true);
    expect(st.text.endsWith('lj f co')).toBe(true);
    expect(exportText(st).endsWith('lj f')).toBe(true); // copy never includes the suggestion
    const overridden = typeKeys('hero lj r 20 co c btn r 100 lj f btn', setup).text;
    expect(overridden.endsWith('lj f btn')).toBe(true); // replaced, not `lj f co btn`
  });

  it('closing the action starts the next street with the pot', () => {
    expect(typeScript('hero btn r 20 sb r 90 hero c', setup)).toBe('eff 500 (100bb)\nhero btn r 20 sb r 90 hero c\n185 flop');
  });
});
