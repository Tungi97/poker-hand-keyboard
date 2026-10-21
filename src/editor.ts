// Pure key -> text transformations. The UI keeps only `text` and `pendingRank`.
import { parseHand, allinTotal, nextStreet, type Setup, type HandState } from './engine';

export type Key =
  | { t: 'digit'; d: string }
  | { t: 'word'; w: string } // position, hero, label, or action other than allin
  | { t: 'allin' }
  | { t: 'rank'; r: string }
  | { t: 'suit'; s: string }
  | { t: 'space' }
  | { t: 'back' }
  | { t: 'clear' }
  | { t: 'next' };

export interface EditorState {
  text: string;
  pendingRank: string | null;
}

export function fmtBB(eff: number, bb: number): string {
  const n = eff / bb;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function newHandText(setup: Setup): string {
  return `eff ${setup.eff} (${fmtBB(setup.eff, setup.bb)}bb)\n`;
}

const sep = (text: string) => (text === '' || /\s$/.test(text) ? '' : ' ');
const appendWord = (text: string, w: string) => text + sep(text) + w;

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

function backspace(text: string): string {
  // Never delete into the eff header line.
  const header = text.slice(0, text.indexOf('\n') + 1) || text;
  if (text.length <= header.length) return text;
  const t = text.replace(/[ \t]+$/, '');
  let out: string;
  if (t.endsWith('\n')) out = t.slice(0, -1);
  else if (/\n\d*\s*(flop|turn|river)$/.test(t)) out = t.replace(/\n[^\n]*$/, ''); // whole street header
  else if (/\d$/.test(t)) out = t.slice(0, -1);
  else out = t.replace(/\S+$/, '').replace(/[ \t]+$/, '');
  return out.length < header.length ? header : out;
}

export function applyKey(st: EditorState, key: Key, setup: Setup): EditorState {
  const { text } = st;
  switch (key.t) {
    case 'digit':
      return { text: /\d$/.test(text) ? text + key.d : appendWord(text, key.d), pendingRank: null };
    case 'word':
      return { text: appendWord(text, key.w), pendingRank: null };
    case 'allin': {
      const s = parseHand(text, setup);
      const seat = s.pendingActor ?? s.toAct;
      const w = seat ? `allin ${allinTotal(s, seat)}` : 'allin';
      return { text: appendWord(text, w), pendingRank: null };
    }
    case 'rank':
      return { text, pendingRank: key.r };
    case 'suit': {
      if (!st.pendingRank) return st;
      const card = st.pendingRank + key.s;
      const before = parseHand(text, setup);
      if (before.usedCards.has(card)) return { text, pendingRank: null };
      let out = appendWord(text, card);
      if (before.street !== 'preflop' && before.boardNeeded === 1) out += '.';
      return { text: out, pendingRank: null };
    }
    case 'space':
      return { text: text + ' ', pendingRank: null };
    case 'back':
      if (st.pendingRank) return { text, pendingRank: null };
      return { text: backspace(text), pendingRank: null };
    case 'clear':
      return { text: newHandText(setup), pendingRank: null };
    case 'next': {
      const s = parseHand(text, setup);
      const ns = nextStreet(s.street);
      if (!ns || s.handOver) return { ...st, pendingRank: null };
      const base = (s.street === 'preflop' ? dropFoldedLabels(text, s) : text).replace(/\s+$/, '');
      return { text: `${base}\n${s.potIfClosed} ${ns}`, pendingRank: null };
    }
  }
}

/** Feed a whitespace-separated shorthand script through the editor, as if typed on the keyboard.
 *  `|` = next street, `allin` = allin key, cards like `Ad` = rank + suit keys. */
export function typeScript(script: string, setup: Setup, start = newHandText(setup)): string {
  let st: EditorState = { text: start, pendingRank: null };
  for (const tok of script.split(/\s+/).filter(Boolean)) {
    const keys: Key[] = [];
    if (tok === '|') keys.push({ t: 'next' });
    else if (tok === 'allin') keys.push({ t: 'allin' });
    else if (/^[2-9TJQKA][shdc]$/.test(tok)) keys.push({ t: 'rank', r: tok[0] }, { t: 'suit', s: tok[1] });
    else if (/^\d+$/.test(tok)) {
      if (/\d$/.test(st.text)) keys.push({ t: 'space' });
      for (const d of tok) keys.push({ t: 'digit', d });
    } else keys.push({ t: 'word', w: tok });
    for (const k of keys) st = applyKey(st, k, setup);
  }
  return st.text.replace(/\s+$/, '');
}
