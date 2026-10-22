// Pure hand parser + betting state machine. The note text is the single source
// of truth: every call re-parses the whole hand from scratch.

export const POSITIONS = ['utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn', 'sb', 'bb'] as const;
export type Seat = (typeof POSITIONS)[number];

const PREFLOP_ORDER: readonly Seat[] = POSITIONS;
const POSTFLOP_ORDER: readonly Seat[] = ['sb', 'bb', 'utg', 'utg1', 'mp', 'lj', 'hj', 'co', 'btn'];

export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export type Street = (typeof STREETS)[number];
const BOARD_SIZE: Record<Street, number> = { preflop: 0, flop: 3, turn: 1, river: 1 };

export const ACTIONS = ['r', 'b', 'c', 'x', 'f', 'allin'] as const;
export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export const SUITS = ['s', 'h', 'd', 'c'] as const;

const RESERVED = new Set<string>([...POSITIONS, ...ACTIONS, 'hero', 'eff', 'flop', 'turn', 'river', 'shows', 'mucks']);
const CARD_RE = /^[2-9TJQKA][shdc]$/;
const CARDS_RE = /^(?:[2-9TJQKA][shdc])+$/; // e.g. AhKs in a showdown line
const splitCards = (t: string) => t.match(/[2-9TJQKA][shdc]/g) ?? [];
export const HOLE_CARDS = 2;
const NUM_RE = /^\d+$/;

export interface Setup {
  sb: number;
  bb: number;
  eff: number;
  labels: string[];
}

export interface Player {
  seat: Seat;
  label?: string; // 'hero' or a villain label
  stack: number;
  streetBet: number;
  inHand: boolean;
  allIn: boolean;
  acted: boolean;
  foldedOn?: Street;
}

export interface TokenRef {
  line: number;
  word: number;
}

/** A label token to rewrite: dropped when followed by its position, else replaced by the seat. */
export interface LabelEdit extends TokenRef {
  replace: string;
}

export interface HandState {
  eff: number;
  street: Street;
  /** Pot from completed streets. */
  pot: number;
  /** Pot including chips bet on the current street. */
  live: number;
  /** Pot if the current street closed now (uncalled excess returned). */
  potIfClosed: number;
  players: Record<Seat, Player>;
  /** Next player to act on the current street, or null when betting is closed. */
  toAct: Seat | null;
  /** A seat named explicitly that hasn't acted yet (e.g. trailing `sb`). */
  pendingActor: Seat | null;
  /** Trailing hero/label waiting for its position (e.g. `fish` before `sb`). */
  pendingBind: string | null;
  board: string[];
  boardNeeded: number;
  usedCards: Set<string>;
  handOver: boolean;
  /** Label rewrites for players who folded preflop (positions only, no names). */
  foldedLabelEdits: LabelEdit[];
  /** betting, showdown (river closed with 2+ players, or any shows/mucks), or over (everyone else folded). */
  phase: 'betting' | 'showdown' | 'over';
  /** Players still to show or muck, in showdown order (last aggressor first). */
  showdownQueue: Seat[];
  /** Hole cards still to enter on the trailing `X shows` line. */
  showCardsNeeded: number;
  shown: Partial<Record<Seat, string[] | 'muck'>>;
  errors: string[];
}

interface Token extends TokenRef {
  text: string;
}

export function isLabel(t: string): boolean {
  return /^[a-z][\w'-]*$/i.test(t) && !RESERVED.has(t) && !CARD_RE.test(t) && t !== 'hero';
}

export function sanitizeLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, '_').replace(/[^\w'-]/g, '');
  if (!t) return '';
  return isLabel(t) ? t : `${t}_`;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  text.split('\n').forEach((lineText, line) => {
    lineText
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw, word) => {
        const t = raw.replace(/\.+$/, '');
        if (t) out.push({ text: t, line, word });
      });
  });
  return out;
}

function newPlayers(eff: number): Record<Seat, Player> {
  const ps = {} as Record<Seat, Player>;
  for (const seat of POSITIONS) {
    ps[seat] = { seat, stack: eff, streetBet: 0, inHand: true, allIn: false, acted: false };
  }
  return ps;
}

export function parseHand(text: string, setup: Setup): HandState {
  const tokens = tokenize(text);
  const errors: string[] = [];
  const err = (t: Token, msg: string) => errors.push(`"${t.text}": ${msg}`);

  let eff = setup.eff;
  const effIdx = tokens.findIndex((t) => t.text === 'eff');
  if (effIdx >= 0 && NUM_RE.test(tokens[effIdx + 1]?.text ?? '')) eff = Number(tokens[effIdx + 1].text);

  const players = newPlayers(eff);
  let street: Street = 'preflop';
  let order: readonly Seat[] = PREFLOP_ORDER;
  let pointer = 0;
  let maxBet = 0;
  let pot = 0;
  let board: string[] = [];
  const allBoard: string[] = [];
  const usedCards = new Set<string>();
  const labelSeat = new Map<string, Seat>();
  const labelTokens: { tok: Token; seat: Seat; replace: string }[] = [];
  const shown: Partial<Record<Seat, string[] | 'muck'>> = {};
  let showing: Seat | null = null; // seat whose `shows` line is collecting cards
  let lastAggressor: Seat | null = null;
  let aggressedThisStreet = false;

  const put = (p: Player, amount: number) => {
    const a = Math.max(0, Math.min(amount, p.stack));
    p.stack -= a;
    p.streetBet += a;
    if (p.stack === 0) p.allIn = true;
  };

  // Blinds
  put(players.sb, setup.sb);
  put(players.bb, setup.bb);
  maxBet = Math.max(players.sb.streetBet, players.bb.streetBet);

  const needsToAct = (p: Player) => p.inHand && !p.allIn && (!p.acted || p.streetBet < maxBet);
  const inHandCount = () => POSITIONS.filter((s) => players[s].inHand).length;
  const canBetCount = () => POSITIONS.filter((s) => players[s].inHand && !players[s].allIn).length;

  const nextToAct = (): Seat | null => {
    if (inHandCount() <= 1) return null;
    for (let i = 0; i < order.length; i++) {
      const seat = order[(pointer + i) % order.length];
      const p = players[seat];
      if (!needsToAct(p)) continue;
      // Lone player left with chips, nothing to call: no more betting.
      if (canBetCount() <= 1 && p.streetBet >= maxBet) return null;
      return seat;
    }
    return null;
  };

  const closeStreet = (): number => {
    const bets = POSITIONS.map((s) => players[s].streetBet).sort((a, b) => b - a);
    const total = bets.reduce((a, b) => a + b, 0);
    return pot + total - (bets[0] - (bets[1] ?? 0));
  };

  const commitStreet = () => {
    const bets = POSITIONS.map((s) => players[s].streetBet).sort((a, b) => b - a);
    const excess = bets[0] - (bets[1] ?? 0);
    if (excess > 0) {
      const top = players[POSITIONS.find((s) => players[s].streetBet === bets[0])!];
      top.streetBet -= excess;
      top.stack += excess;
      if (top.stack > 0) top.allIn = false;
    }
    pot = closeStreet();
    for (const s of POSITIONS) {
      players[s].streetBet = 0;
      players[s].acted = false;
    }
    maxBet = 0;
  };

  // Advance to `seat`, folding/checking everyone skipped on the way.
  const walkTo = (seat: Seat) => {
    const target = order.indexOf(seat);
    for (let i = 0; i < order.length; i++) {
      const idx = (pointer + i) % order.length;
      if (idx === target) break;
      const p = players[order[idx]];
      if (!needsToAct(p)) continue;
      if (p.streetBet < maxBet) {
        p.inHand = false;
        p.foldedOn = street;
      } else {
        p.acted = true;
      }
    }
    pointer = target;
  };

  let pendingActor: Seat | null = null;
  let pendingBind: string | null = null; // hero/label waiting for a position

  const resolveActor = (t: Token): Player | null => {
    const seat = pendingActor ?? nextToAct();
    pendingActor = null;
    if (!seat) {
      err(t, 'nobody left to act');
      return null;
    }
    const p = players[seat];
    if (!p.inHand) {
      err(t, `${seat} already folded`);
      return null;
    }
    if (p.allIn) {
      err(t, `${seat} is all-in`);
      return null;
    }
    walkTo(seat);
    return p;
  };

  const finishAction = (p: Player, prevMax: number) => {
    p.acted = true;
    if (p.streetBet > prevMax) {
      maxBet = p.streetBet;
      lastAggressor = p.seat;
      aggressedThisStreet = true;
      for (const s of POSITIONS) if (s !== p.seat) players[s].acted = false;
    }
    pointer = (order.indexOf(p.seat) + 1) % order.length;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const w = t.text;
    const next = tokens[i + 1]?.text;

    if (w === 'eff') {
      if (next && NUM_RE.test(next)) i++;
      continue;
    }
    if (w.startsWith('(')) continue;

    if (NUM_RE.test(w) && next && (STREETS as readonly string[]).includes(next) && next !== 'preflop') {
      continue; // pot figure in a street header
    }

    if (w === 'flop' || w === 'turn' || w === 'river') {
      const target = w as Street;
      if (STREETS.indexOf(target) !== STREETS.indexOf(street) + 1) err(t, `unexpected after ${street}`);
      commitStreet();
      street = target;
      order = POSTFLOP_ORDER;
      pointer = 0;
      board = [];
      aggressedThisStreet = false;
      pendingActor = null;
      pendingBind = null;
      continue;
    }

    if (CARDS_RE.test(w)) {
      for (const card of splitCards(w)) {
        if (usedCards.has(card)) err(t, `${card} already used`);
        usedCards.add(card);
        const hand = showing ? shown[showing] : undefined;
        if (showing && Array.isArray(hand) && hand.length < HOLE_CARDS) hand.push(card);
        else if (!showing && street !== 'preflop' && board.length < BOARD_SIZE[street]) {
          board.push(card);
          allBoard.push(card);
        }
      }
      continue;
    }

    if (w === 'shows' || w === 'mucks') {
      const seat = pendingActor;
      pendingActor = null;
      if (!seat) {
        err(t, 'who? tap a position first');
        continue;
      }
      if (shown[seat]) err(t, `${seat} already ${shown[seat] === 'muck' ? 'mucked' : 'showed'}`);
      shown[seat] = w === 'shows' ? [] : 'muck';
      showing = w === 'shows' ? seat : null;
      continue;
    }

    if ((POSITIONS as readonly string[]).includes(w)) {
      const seat = w as Seat;
      if (pendingBind) {
        const prev = labelSeat.get(pendingBind);
        if (prev && prev !== seat) err(t, `${pendingBind} is already ${prev}`);
        labelSeat.set(pendingBind, seat);
        players[seat].label = pendingBind;
        if (pendingBind !== 'hero') labelTokens.push({ tok: tokens[i - 1], seat, replace: '' });
        pendingBind = null;
      }
      pendingActor = seat;
      showing = null;
      continue;
    }

    if (w === 'hero' || isLabel(w)) {
      const seat = labelSeat.get(w);
      if (seat) {
        pendingActor = seat;
        showing = null;
        if (w !== 'hero' && street === 'preflop') labelTokens.push({ tok: t, seat, replace: seat });
      } else {
        pendingBind = w;
      }
      continue;
    }

    if ((ACTIONS as readonly string[]).includes(w)) {
      const amountTok = tokens[i + 1] && NUM_RE.test(tokens[i + 1].text) ? tokens[i + 1] : null;
      if ((w === 'r' || w === 'b') && !amountTok) {
        if (i + 1 < tokens.length) err(t, 'needs an amount');
        continue;
      }
      if (amountTok && (w === 'r' || w === 'b' || w === 'allin')) i++;

      const p = resolveActor(t);
      if (!p) continue;
      const prevMax = maxBet;
      switch (w) {
        case 'f':
          p.inHand = false;
          p.foldedOn = street;
          break;
        case 'x':
          if (p.streetBet < maxBet) err(t, `${p.seat} faces ${maxBet}, can't check`);
          break;
        case 'c':
          put(p, maxBet - p.streetBet);
          break;
        case 'r':
        case 'b': {
          const total = Number(amountTok!.text);
          if (total <= maxBet) err(t, `${total} is not more than ${maxBet}`);
          put(p, total - p.streetBet);
          break;
        }
        case 'allin':
          // A typed amount overrides the fill-in (e.g. villain shorter than eff); either way they're all-in.
          put(p, amountTok ? Number(amountTok.text) - p.streetBet : p.stack);
          p.allIn = true;
          break;
      }
      finishAction(p, prevMax);
      continue;
    }

    if (NUM_RE.test(w)) {
      err(t, 'unexpected number');
      continue;
    }
    err(t, 'unknown');
  }

  const toAct = pendingActor ? null : nextToAct();
  let live = pot;
  for (const s of POSITIONS) live += players[s].streetBet;

  const inHand = POSTFLOP_ORDER.filter((seat) => players[seat].inHand);
  // A name written on the showdown line doesn't reopen the betting.
  const riverClosed = street === 'river' && board.length === BOARD_SIZE.river && !nextToAct();
  const anyShown = Object.keys(shown).length > 0;
  const phase = anyShown || (riverClosed && inHand.length >= 2) ? 'showdown' : inHand.length <= 1 ? 'over' : 'betting';
  // Last aggressor shows first, unless the river was checked through with players able to bet.
  const riverCheckedThrough = street === 'river' && !aggressedThisStreet;
  const agg = lastAggressor as Seat | null; // assigned inside closures, so TS narrows it to null
  const first = agg && players[agg].inHand && (!riverCheckedThrough || canBetCount() < 2) ? agg : null;
  const showdownQueue =
    phase === 'showdown' && inHand.length >= 2 ? [...(first ? [first] : []), ...inHand.filter((s) => s !== first)].filter((s) => !shown[s]) : [];
  const trailing = showing ? shown[showing] : undefined;
  const showCardsNeeded = Array.isArray(trailing) ? HOLE_CARDS - trailing.length : 0;

  const foldedLabelEdits = labelTokens
    .filter(({ seat }) => players[seat].foldedOn === 'preflop')
    .map(({ tok, replace }) => ({ line: tok.line, word: tok.word, replace }));

  return {
    eff,
    street,
    pot,
    live,
    potIfClosed: closeStreet(),
    players,
    toAct,
    pendingActor,
    pendingBind,
    board,
    boardNeeded: BOARD_SIZE[street] - board.length,
    usedCards,
    handOver: inHandCount() <= 1,
    foldedLabelEdits,
    phase,
    showdownQueue,
    showCardsNeeded,
    shown,
    errors,
  };
}

/** Seats still in the hand, in postflop order (labels attached). */
export function activePlayers(s: HandState): Player[] {
  return POSTFLOP_ORDER.map((seat) => s.players[seat]).filter((p) => p.inHand);
}

/** Total street bet if the given seat shoves now. */
export function allinTotal(s: HandState, seat: Seat): number {
  const p = s.players[seat];
  return p.streetBet + p.stack;
}

export function nextStreet(s: Street): Street | null {
  return STREETS[STREETS.indexOf(s) + 1] ?? null;
}
