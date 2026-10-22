import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { POSITIONS, RANKS, SUITS, activePlayers, parseHand, sanitizeLabel, type HandState, type Setup } from './engine';
import { applyKey, exportText, initialState, newHandText, type EditorState, type Key } from './editor';

registerSW({ immediate: true });

// ---------- storage ----------
interface SavedHand {
  id: number;
  at: number;
  text: string;
}

const LS = { setup: 'phk.setup', current: 'phk.current', history: 'phk.history' };
const DEFAULT_SETUP: Setup = { sb: 5, bb: 5, eff: 500, labels: [] };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

let setup: Setup = { ...DEFAULT_SETUP, ...load<Partial<Setup>>(LS.setup, {}) };
let history: SavedHand[] = load<SavedHand[]>(LS.history, []);
let ed: EditorState = initialState(load<string>(LS.current, '') || newHandText(setup));
let state: HandState = parseHand(ed.text, setup);

// ---------- dom ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const note = $('note');
const kb = $('kb');
const statusEl = $('status');
const hint = $('hint');
const toastEl = $('toast');

const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

// ---------- note rendering (4-color cards) ----------
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cardSpan = (c: string) => `<span class="card s-${c[1]}">${c}</span>`;

function wordHtml(w: string): string {
  const m = w.match(/^((?:[2-9TJQKA][shdc])+)(\.?)$/);
  return m ? m[1].match(/../g)!.map(cardSpan).join('') + esc(m[2]) : esc(w);
}

function noteHtml(text: string, st?: EditorState): string {
  const lines = text.split('\n');
  const html = lines.map((line, li) => {
    if (li === 0 && /^eff \d+/.test(line)) {
      const [, v, rest] = line.match(/^eff (\d+)(.*)$/)!;
      const editing = st?.effEdit ? ' editing' : '';
      return `eff <span class="eff${editing}" data-eff>${v}</span>${esc(rest)}`;
    }
    return line.split(/(\s+)/).map((w) => (/\s/.test(w) || !w ? w : wordHtml(w))).join('');
  });
  let out = html.join('\n');
  if (st?.autoActor) out = out.replace(/(\S+)$/, '<span class="auto">$1</span>');
  if (st?.pendingRank) out += `${/\s$/.test(text) ? '' : ' '}<span class="pending">${st.pendingRank}</span>`;
  return out;
}

type KeyDef = { k: string; label: string; cls?: string };
const row = (...keys: KeyDef[]) => keys;

function layout(): KeyDef[][] {
  const labels = setup.labels.slice(0, 6);
  return [
    POSITIONS.map((p) => ({ k: `w:${p}`, label: p, cls: 'pos' })),
    row(
      { k: 'w:hero', label: 'hero', cls: 'label' },
      ...labels.map((l) => ({ k: `w:${l}`, label: l, cls: 'label' })),
      { k: 'w:shows', label: 'shows', cls: 'sd' },
      { k: 'w:mucks', label: 'mucks', cls: 'sd' },
    ),
    row(
      ...['r', 'b', 'c', 'x', 'f'].map((a) => ({ k: `w:${a}`, label: a, cls: 'act' })),
      { k: 'allin', label: 'allin', cls: 'act w2' },
      { k: 'back', label: '⌫', cls: 'ctl' },
    ),
    RANKS.slice(0, 7).map((r) => ({ k: `r:${r}`, label: r, cls: 'rank' })),
    row(
      ...RANKS.slice(7).map((r) => ({ k: `r:${r}`, label: r, cls: 'rank' })),
      ...SUITS.map((s) => ({ k: `s:${s}`, label: SUIT_GLYPH[s], cls: `suit s-${s}` })),
    ),
    '1234567890'.split('').map((d) => ({ k: `d:${d}`, label: d, cls: 'num' })),
    row(
      { k: 'clear', label: 'clear', cls: 'ctl' },
      { k: 'space', label: 'space', cls: 'ctl' },
      { k: 'next', label: 'next street', cls: 'gold w2' },
      { k: 'copy', label: 'copy', cls: 'ctl' },
      { k: 'new', label: 'new hand', cls: 'ctl w2' },
    ),
  ];
}

const keyEls = new Map<string, HTMLButtonElement>();

function buildKeyboard() {
  kb.textContent = '';
  keyEls.clear();
  for (const r of layout()) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    for (const def of r) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `k ${def.cls ?? ''}`;
      b.dataset.k = def.k;
      b.textContent = def.label;
      rowEl.appendChild(b);
      keyEls.set(def.k, b);
    }
    kb.appendChild(rowEl);
  }
}

// ---------- render ----------
function render() {
  state = parseHand(ed.text, setup);
  save(LS.current, ed.text);

  note.innerHTML = noteHtml(ed.text, ed) + '<span class="caret"></span>';
  note.scrollTop = note.scrollHeight;

  const inHand = activePlayers(state);
  const who = inHand.length <= 4 ? inHand.map((p) => (p.label ? `${p.label} ${p.seat}` : p.seat)).join(' · ') : `${inHand.length} players`;
  statusEl.innerHTML = `${state.street} &nbsp;pot <b>${state.phase === 'betting' ? state.live : state.potIfClosed}</b> &nbsp;<span>${who}</span>`;

  const lastErr = state.errors[state.errors.length - 1];
  hint.classList.toggle('err', !!lastErr);
  if (lastErr) hint.textContent = `⚠ ${lastErr}`;
  else if (ed.effEdit) hint.textContent = 'type the new effective stack';
  else if (state.showCardsNeeded > 0) hint.textContent = `enter ${state.showCardsNeeded} hole card${state.showCardsNeeded > 1 ? 's' : ''}`;
  else if (state.phase === 'showdown')
    hint.textContent = state.showdownQueue.length ? `showdown: ${state.pendingActor ?? state.showdownQueue[0]} shows or mucks` : 'showdown done · copy or start a new hand';
  else if (state.street !== 'preflop' && state.boardNeeded > 0)
    hint.textContent = `${state.street}: ${state.boardNeeded} card${state.boardNeeded > 1 ? 's' : ''} to enter`;
  else if (state.handOver) hint.textContent = 'hand over · copy or start a new hand';
  else if (state.pendingActor) hint.textContent = `${state.pendingActor} to act · ${state.players[state.pendingActor].stack} behind`;
  else if (state.toAct) hint.textContent = `to act: ${state.toAct} · ${state.players[state.toAct].stack} behind`;
  else hint.textContent = state.street === 'river' ? 'river done' : 'betting closed · next street';

  // Keyboard states
  const actor = state.pendingActor ?? state.toAct;
  for (const seat of POSITIONS) {
    const el = keyEls.get(`w:${seat}`)!;
    el.classList.toggle('toact', seat === actor);
    el.classList.toggle('out', !state.players[seat].inHand);
  }
  for (const r of RANKS) {
    const el = keyEls.get(`r:${r}`)!;
    el.disabled = SUITS.every((s) => state.usedCards.has(r + s));
    el.classList.toggle('sel', ed.pendingRank === r);
  }
  for (const s of SUITS) {
    const el = keyEls.get(`s:${s}`)!;
    const used = !!ed.pendingRank && state.usedCards.has(ed.pendingRank + s);
    el.disabled = !ed.pendingRank || used;
    el.classList.toggle('used', used);
  }
  keyEls.get('next')!.disabled =
    state.street === 'river' || state.phase !== 'betting' || (state.street !== 'preflop' && state.boardNeeded > 0);
  for (const k of ['w:shows', 'w:mucks']) keyEls.get(k)!.disabled = state.phase === 'betting';
  $('hist-count').textContent = history.length ? String(history.length) : '';
}

// ---------- actions ----------
let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1300);
}

// Hidden-textarea copy: works on iOS Safari and plain http where navigator.clipboard is missing.
function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', ''); // no iOS keyboard
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px', pointerEvents: 'none' });
  document.body.appendChild(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS ignores select()
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Must run inside a click handler: iOS only allows clipboard writes during a user activation. */
async function copyText(text: string, what = 'Copied') {
  let ok = false;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
  } else {
    ok = legacyCopy(text);
  }
  if (ok) return toast(what);
  // Last resort: select the note so the iOS "Copy" menu is one tap away.
  const range = document.createRange();
  range.selectNodeContents(note);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
  toast('Copy blocked: text selected, tap Copy');
}

const hasContent = (text: string) => text.trim().split('\n').length > 1;

function archiveCurrent() {
  const text = exportText(ed);
  if (!hasContent(text)) return;
  if (history[0]?.text === text) return;
  history.unshift({ id: Date.now(), at: Date.now(), text });
  save(LS.history, history);
}

function onKey(k: string) {
  const [kind, val] = k.includes(':') ? (k.split(':') as [string, string]) : [k, ''];
  let key: Key | null = null;
  switch (kind) {
    case 'd': key = { t: 'digit', d: val }; break;
    case 'w': key = { t: 'word', w: val }; break;
    case 'r': key = { t: 'rank', r: val }; break;
    case 's': key = { t: 'suit', s: val }; break;
    case 'allin': key = { t: 'allin' }; break;
    case 'space': key = { t: 'space' }; break;
    case 'back': key = { t: 'back' }; break;
    case 'next': key = { t: 'next' }; break;
    case 'eff': key = { t: 'eff' }; break;
    case 'clear':
      if (hasContent(ed.text) && !confirm('Clear this hand?')) return;
      key = { t: 'clear' };
      break;
    case 'copy':
      void copyText(exportText(ed));
      return;
    case 'new':
      archiveCurrent();
      ed = initialState(newHandText(setup));
      render();
      toast('New hand');
      return;
  }
  if (key) {
    ed = applyKey(ed, key, setup);
    // The eff typed on the note becomes the default for the next hand too.
    if (ed.effEdit === 'typing') {
      const eff = Number(ed.text.match(/^eff (\d+)/)?.[1]);
      if (eff > 0 && eff !== setup.eff) save(LS.setup, (setup = { ...setup, eff }));
    }
    render();
  }
}

// Fire on pointerdown for speed; hold ⌫ to repeat.
let repeat = 0;
kb.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.k');
  if (!b || b.disabled || b.dataset.k === 'copy') return;
  e.preventDefault();
  const k = b.dataset.k!;
  b.classList.add('down');
  onKey(k);
  if (k === 'back') {
    repeat = window.setTimeout(function tick() {
      onKey('back');
      repeat = window.setTimeout(tick, 70);
    }, 420);
  }
});
const release = () => {
  clearTimeout(repeat);
  kb.querySelectorAll('.down').forEach((el) => el.classList.remove('down'));
};
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => kb.addEventListener(ev, release));
kb.addEventListener('contextmenu', (e) => e.preventDefault());
// Copy fires on click, not pointerdown: a touch pointerdown is not a user activation, so iOS blocks the clipboard.
kb.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.k');
  if (b?.dataset.k === 'copy') onKey('copy');
});
// Tap the eff value to overwrite it.
note.addEventListener('pointerdown', (e) => {
  if (!(e.target as HTMLElement).closest('[data-eff]')) return;
  e.preventDefault();
  onKey('eff');
});

// Desktop convenience: Backspace on a physical keyboard.
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Backspace') {
    e.preventDefault();
    onKey('back');
  }
});

// ---------- setup sheet ----------
const sheetSetup = $('sheet-setup');
const inSb = $<HTMLInputElement>('in-sb');
const inBb = $<HTMLInputElement>('in-bb');
const inEff = $<HTMLInputElement>('in-eff');
const inLabels = $<HTMLInputElement>('in-labels');
// Select the old value on focus so the first digit replaces it.
for (const el of [inSb, inBb, inEff]) {
  el.addEventListener('focus', () => setTimeout(() => el.setSelectionRange(0, el.value.length), 0));
}

$('btn-setup').addEventListener('click', () => {
  inSb.value = String(setup.sb);
  inBb.value = String(setup.bb);
  inEff.value = String(setup.eff);
  inLabels.value = setup.labels.join(', ');
  sheetSetup.hidden = false;
});
$('setup-save').addEventListener('click', () => {
  const num = (el: HTMLInputElement, fb: number, min: number) => {
    const n = Math.round(Number(el.value));
    return Number.isFinite(n) && n >= min ? n : fb;
  };
  const labels = [...new Set(inLabels.value.split(',').map(sanitizeLabel).filter(Boolean))].slice(0, 6);
  const effChanged = num(inEff, setup.eff, 1) !== setup.eff || num(inBb, setup.bb, 1) !== setup.bb;
  setup = { sb: num(inSb, setup.sb, 0), bb: num(inBb, setup.bb, 1), eff: num(inEff, setup.eff, 1), labels };
  save(LS.setup, setup);
  // A fresh hand picks up the new eff line immediately.
  if (effChanged && !hasContent(ed.text)) ed = initialState(newHandText(setup));
  sheetSetup.hidden = true;
  buildKeyboard();
  render();
});

// ---------- history sheet ----------
const sheetHist = $('sheet-history');
const histList = $('hist-list');

function renderHistory() {
  histList.textContent = '';
  if (!history.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No hands yet this session.';
    histList.appendChild(li);
    return;
  }
  history.forEach((h, i) => {
    const li = document.createElement('li');
    const pre = document.createElement('pre');
    pre.innerHTML = noteHtml(h.text);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const when = document.createElement('span');
    when.textContent = `#${history.length - i} · ${new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const copy = document.createElement('button');
    copy.className = 'ghost';
    copy.textContent = 'Copy';
    copy.onclick = () => copyText(h.text);
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = 'Delete';
    del.onclick = () => {
      history = history.filter((x) => x.id !== h.id);
      save(LS.history, history);
      renderHistory();
      render();
    };
    meta.append(when, copy, del);
    li.append(pre, meta);
    histList.appendChild(li);
  });
}

$('btn-history').addEventListener('click', () => {
  renderHistory();
  sheetHist.hidden = false;
});
$('hist-close').addEventListener('click', () => (sheetHist.hidden = true));
$('hist-copy-all').addEventListener('click', () => {
  if (!history.length) return;
  void copyText(
    history
      .slice()
      .reverse()
      .map((h) => h.text)
      .join('\n\n'),
    `Copied ${history.length} hand${history.length > 1 ? 's' : ''}`,
  );
});
$('hist-clear').addEventListener('click', () => {
  if (!history.length || !confirm('Delete all hands from this session?')) return;
  history = [];
  save(LS.history, history);
  renderHistory();
  render();
});
for (const sh of [sheetSetup, sheetHist]) {
  sh.addEventListener('click', (e) => {
    if (e.target === sh) sh.hidden = true;
  });
}

buildKeyboard();
render();
