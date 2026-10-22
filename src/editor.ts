// Pure key -> text transformations. The UI keeps only the EditorState below.
import { POSITIONS, isLabel, parseHand, allinTotal, nextStreet, type Setup, type HandState, type Seat } from './engine';

export type Key =
  | { t: 'digit'; d: string }
  | { t: 'word'; w: string } // position, hero, label, action other than allin, shows/mucks
  | { t: 'allin' }
  | { t: 'rank'; r: string }
  | { t: 'suit'; s: string }
  | { t: 'eff' } // start overwriting the eff stack
  | { t: 'space' }
  | { t: 'back' }
  | { t: 'clear' }
  | { t: 'next' };

export interface EditorState {
  text: string;
  pendingRank: string | null;
  /** The trailing actor was inserted by auto-advance; tapping another seat replaces it. */
  autoActor?: boolean;
  /** Editing the eff stack: 'fresh' = next digit replaces the old value. */
  effEdit?: 'fresh' | 'typing' | null;
  /** The trailing number was filled in by the app (allin); the next digit replaces it. */
  tailFresh?: boolean;
  /** A bet/raise/allin is waiting for its amount; advance to the next player on the next non-digit key. */
  needsAdvance?: boolean;
}

export const initialState = (text: string): EditorState => ({ text, pendingRank: null });

export function fmtBB(eff: number, bb: number): string {
  const n = eff / bb;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export const effLine = (eff: number, bb: number) => `eff ${eff} (${fmtBB(eff, bb)}bb)`;

export function newHandText(setup: Setup): string {
  return `${effLine(setup.eff, setup.bb)}\n`;
}

const sep = (text: string) => (text === '' || /\s$/.test(text) ? '' : ' ');
const appendWord = (text: string, w: string) => text + sep(text) + w;
const dropLastWord = (text: string) => text.replace(/[ \t]*\S+$/, '');
const hasActions = (text: string) => text.split('\n').slice(1).some((l) => l.trim() !== '');
const isActorWord = (w: string) => (POSITIONS as readonly string[]).includes(w) || w === 'hero' || isLabel(w);
const BETTING = new Set(['r', 'b', 'c', 'x', 'f']);

/** Name players by label when they have one (hero, villain labels), else by seat. */
const nameOf = (s: HandState, seat: Seat) => s.players[seat].label ?? seat;

/** Names are written preflop and in multiway pots; heads-up postflop stays `x b 60 c`. */
function shouldName(s: HandState): boolean {
  if (s.street === 'preflop') return true;
  return POSITIONS.filter((p) => s.players[p].inHand && !s.players[p].allIn).length >= 3;
}

/** Players who fold preflop are written by position only (names kept for players who continue). */
export function dropFoldedLabels(text: string, s: HandState): string {
  if (!s.foldedLabelEdits.length) return text;
  const edits = new Map(s.foldedLabelEdits.map((e) => [`${e.line}:${e.word}`, e.replace]));
  return text
    .split('\n')
    .map((line, li) => {
      const words = line.split(/\s+/).filter(Boolean);
      if (!words.some((_, wi) => edits.has(`${li}:${wi}`))) return line;
      return words
        .map((w, wi) => edits.get(`${li}:${wi}`) ?? w)
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

/** Note text to copy/archive: no dangling auto-inserted actor, no trailing whitespace. */
export function exportText(st: EditorState): string {
  return (st.autoActor ? dropLastWord(st.text) : st.text).trim();
}

function streetHeader(text: string, s: HandState): string | null {
  const ns = nextStreet(s.street);
  if (!ns || s.phase !== 'betting') return null;
  const base = (s.street === 'preflop' ? dropFoldedLabels(text, s) : text).replace(/\s+$/, '');
  return `${base}\n${s.potIfClosed} ${ns}`;
}

/** After an action completes: name the next player, close the street, or move into showdown. */
function advance(st: EditorState, setup: Setup): EditorState {
  const base: EditorState = { ...st, needsAdvance: false, tailFresh: false };
  const s = parseHand(st.text, setup);
  if (s.pendingActor || s.pendingBind) return base;

  if (s.phase === 'showdown') {
    const next = s.showdownQueue[0];
    if (s.showCardsNeeded > 0 || !next) return base;
    return { ...base, text: `${st.text.replace(/\s+$/, '')}\n${nameOf(s, next)}`, autoActor: true };
  }
  if (s.phase === 'over') return base;
  if (s.street !== 'preflop' && s.boardNeeded > 0) return base;
  if (s.toAct) return shouldName(s) ? { ...base, text: appendWord(st.text, nameOf(s, s.toAct)), autoActor: true } : base;

  const header = streetHeader(st.text, s);
  return header ? { ...base, text: header, autoActor: false } : base;
}

function backspace(text: string): string {
  // Never delete into the eff header line.
  const header = text.slice(0, text.indexOf('\n') + 1) || text;
  if (text.length <= header.length) return text;
  const t = text.replace(/[ \t]+$/, '');
  let out: string;
  if (t.endsWith('\n')) out = t.slice(0, -1);
  else if (/\n\d*\s*(flop|turn|river)$/.test(t)) out = t.replace(/\n[^\n]*$/, ''); // whole street header
  else if (/\d$/.test(t)) out = t.slice(0, -1);
  else if (/(?:[2-9TJQKA][shdc]){2}$/.test(t)) out = t.slice(0, -2); // one card of a shown hand
  else out = t.replace(/\S+$/, '').replace(/[ \t]+$/, '');
  return out.length < header.length ? header : out;
}

function effDigit(st: EditorState, d: string, setup: Setup): EditorState {
  const cur = st.text.match(/^eff (\d+)/)?.[1] ?? '';
  const v = ((st.effEdit === 'typing' ? cur : '') + d).replace(/^0+/, '');
  if (!v) return { ...st, effEdit: 'fresh' };
  const line = effLine(Number(v), setup.bb);
  const text = /^eff\b/.test(st.text) ? st.text.replace(/^[^\n]*/, line) : `${line}\n${st.text}`;
  return { ...st, text, effEdit: 'typing', pendingRank: null };
}

function effBackspace(st: EditorState, setup: Setup): EditorState {
  const cur = st.text.match(/^eff (\d+)/)?.[1] ?? '';
  if (cur.length <= 1) return st;
  return { ...st, text: st.text.replace(/^[^\n]*/, effLine(Number(cur.slice(0, -1)), setup.bb)) };
}

export function applyKey(st0: EditorState, key: Key, setup: Setup): EditorState {
  // Number-entry modes only survive digits (and backspace while editing eff).
  if (key.t === 'digit') {
    if (st0.effEdit || !hasActions(st0.text)) return effDigit(st0, key.d, setup);
    const { text } = st0;
    if (st0.tailFresh) return { ...st0, text: text.replace(/\d+$/, '') + key.d, tailFresh: false, pendingRank: null };
    return { ...st0, text: /\d$/.test(text) ? text + key.d : appendWord(text, key.d), autoActor: false, pendingRank: null };
  }
  if (key.t === 'back') {
    if (st0.pendingRank) return { ...st0, pendingRank: null };
    if (st0.effEdit) return effBackspace(st0, setup);
    return { text: backspace(st0.text), pendingRank: null };
  }
  if (key.t === 'eff') return { ...st0, effEdit: 'fresh', pendingRank: null };

  let st: EditorState = { ...st0, effEdit: null, tailFresh: false };
  // A finished bet/raise/allin amount: advance before handling the next key.
  if (st.needsAdvance && key.t !== 'clear' && key.t !== 'space') st = advance(st, setup);

  switch (key.t) {
    case 'word':
      return wordKey(st, key.w, setup);
    case 'allin': {
      const named = nameIfNeeded(st, setup);
      const s = parseHand(named.text, setup);
      const seat = s.pendingActor ?? s.toAct;
      const w = seat ? `allin ${allinTotal(s, seat)}` : 'allin';
      return { text: appendWord(named.text, w), pendingRank: null, tailFresh: !!seat, needsAdvance: true };
    }
    case 'rank':
      return { ...st, pendingRank: key.r };
    case 'suit':
      return suitKey(st, key.s, setup);
    case 'space':
      return { text: st.text + ' ', pendingRank: null };
    case 'clear':
      return initialState(newHandText(setup));
    case 'next': {
      // Advancing past a bet already closed the street: don't skip another one.
      if (st0.needsAdvance && parseHand(st.text, setup).street !== parseHand(st0.text, setup).street) return st;
      const text = st.autoActor ? dropLastWord(st.text) : st.text;
      const s = parseHand(text, setup);
      if (s.street !== 'preflop' && s.boardNeeded > 0) return { ...st, pendingRank: null };
      const header = streetHeader(text, s);
      return header ? { text: header, pendingRank: null } : { ...st, pendingRank: null };
    }
  }
}

/** Before an action with no actor named, write in who is acting (preflop / multiway). */
function nameIfNeeded(st: EditorState, setup: Setup): EditorState {
  const s = parseHand(st.text, setup);
  if (s.pendingActor || s.pendingBind || !s.toAct || s.phase !== 'betting' || !shouldName(s)) return st;
  return { ...st, text: appendWord(st.text, nameOf(s, s.toAct)) };
}

function wordKey(st: EditorState, w: string, setup: Setup): EditorState {
  const done = (text: string, extra: Partial<EditorState> = {}): EditorState => ({ text, pendingRank: null, ...extra });

  if (BETTING.has(w)) {
    const named = nameIfNeeded(st, setup);
    const text = appendWord(named.text, w);
    return w === 'r' || w === 'b' ? done(text, { needsAdvance: true }) : advance(done(text), setup);
  }

  if (w === 'shows' || w === 'mucks') {
    let text = st.text;
    const s = parseHand(text, setup);
    if (!s.pendingActor && s.showdownQueue[0]) text = `${text.replace(/\s+$/, '')}\n${nameOf(s, s.showdownQueue[0])}`;
    text = appendWord(text, w);
    return w === 'mucks' ? advance(done(text), setup) : done(text);
  }

  if (isActorWord(w)) {
    const s = parseHand(st.text, setup);
    const bound = (POSITIONS as readonly string[]).includes(w) || POSITIONS.some((p) => s.players[p].label === w);
    if (st.autoActor) {
      const rest = dropLastWord(st.text);
      // Unbound label/hero: write it in front of the suggested seat (`fish sb`); tap a seat to change it.
      if (!bound) return done(`${rest}${sep(rest)}${w} ${st.text.match(/\S+$/)![0]}`, { autoActor: true });
      return done(appendWord(rest, w));
    }
    // After the betting is over, each shows/mucks entry starts its own line.
    if (s.phase !== 'betting' && !s.pendingActor && !s.pendingBind && !st.text.endsWith('\n'))
      return done(`${st.text.replace(/\s+$/, '')}\n${w}`);
    return done(appendWord(st.text, w));
  }

  return done(appendWord(st.text, w));
}

function suitKey(st: EditorState, suit: string, setup: Setup): EditorState {
  if (!st.pendingRank) return st;
  const card = st.pendingRank + suit;
  const s = parseHand(st.text, setup);
  if (s.usedCards.has(card)) return { ...st, pendingRank: null };

  if (s.showCardsNeeded > 0) {
    // Shown hands are written together: `bb shows AhKs`.
    const text = s.showCardsNeeded === 1 ? st.text.replace(/\s+$/, '') + card : appendWord(st.text, card);
    const out: EditorState = { text, pendingRank: null };
    return s.showCardsNeeded === 1 ? advance(out, setup) : out;
  }

  let text = appendWord(st.text, card);
  const completesBoard = s.street !== 'preflop' && s.boardNeeded === 1;
  if (completesBoard) text += '.';
  const out: EditorState = { text, pendingRank: null };
  return completesBoard ? advance(out, setup) : out;
}

/** Feed a whitespace-separated shorthand script through the editor, as if typed on the keyboard.
 *  `|` = next street, `allin` = allin key, `eff` = tap the eff line, `<` = backspace,
 *  cards like `Ad` or `AhKs` = rank + suit keys. */
export function typeScript(script: string, setup: Setup, start = newHandText(setup)): string {
  return exportText(typeKeys(script, setup, start));
}

export function typeKeys(script: string, setup: Setup, start = newHandText(setup)): EditorState {
  let st = initialState(start);
  for (const tok of script.split(/\s+/).filter(Boolean)) {
    const keys: Key[] = [];
    if (tok === '|') keys.push({ t: 'next' });
    else if (tok === 'allin') keys.push({ t: 'allin' });
    else if (tok === 'eff') keys.push({ t: 'eff' });
    else if (tok === '<') keys.push({ t: 'back' });
    else if (/^(?:[2-9TJQKA][shdc])+$/.test(tok))
      for (const c of tok.match(/../g)!) keys.push({ t: 'rank', r: c[0] }, { t: 'suit', s: c[1] });
    else if (/^\d+$/.test(tok)) {
      if (/\d$/.test(st.text) && !st.tailFresh && !st.effEdit) keys.push({ t: 'space' });
      for (const d of tok) keys.push({ t: 'digit', d });
    } else keys.push({ t: 'word', w: tok });
    for (const k of keys) st = applyKey(st, k, setup);
  }
  return st;
}
