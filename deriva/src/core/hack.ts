/**
 * Minijuego de hackeo "ruta de datos" (por turnos, sin reflejos).
 * Se empieza en la fila 0; cada elección fija la columna, la siguiente la fila, y así sucesivamente.
 * La secuencia principal se deriva de una ruta válida: siempre es resoluble.
 */
import { int, pick, shuffle, type RngState } from './rng';
import type { HackState } from './state';

const CODES = ['1C', '55', '7A', 'BD', 'E9', 'FF'];

export function hackParams(diff: number, bonus: number): { n: number; mainLen: number; buffer: number } {
  const d = Math.max(1, Math.min(5, diff));
  const n = 4 + (d >= 3 ? 1 : 0) + (d >= 5 ? 1 : 0);
  const mainLen = 2 + (d >= 2 ? 1 : 0) + (d >= 4 ? 1 : 0);
  const buffer = Math.max(mainLen + 1, mainLen + 2 + bonus - (d >= 5 ? 1 : 0));
  return { n, mainLen, buffer };
}

export function createHack(rng: RngState, diff: number, bonus: number, extras = 1): HackState {
  const { n, mainLen, buffer } = hackParams(diff, bonus);
  const codes = CODES.slice(0, Math.min(CODES.length, n));
  const grid: string[] = [];
  for (let i = 0; i < n * n; i++) grid.push(pick(rng, codes));
  // ruta válida de longitud mainLen + prefijo
  const prefix = buffer - mainLen >= 2 ? int(rng, 0, 1) : 0;
  const total = mainLen + prefix;
  let path: number[] = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    path = [];
    let axis: 'row' | 'col' = 'row';
    let lineIdx = 0;
    let ok = true;
    for (let k = 0; k < total; k++) {
      const cands: number[] = [];
      for (let j = 0; j < n; j++) {
        const cell = axis === 'row' ? lineIdx * n + j : j * n + lineIdx;
        if (!path.includes(cell)) cands.push(cell);
      }
      if (cands.length === 0) { ok = false; break; }
      const cell = pick(rng, cands);
      path.push(cell);
      if (axis === 'row') { lineIdx = cell % n; axis = 'col'; } else { lineIdx = Math.floor(cell / n); axis = 'row'; }
    }
    if (ok) break;
  }
  const mainSeq = path.slice(prefix).map((c) => grid[c]);
  const targets: HackState['targets'] = [{ seq: mainSeq, reward: 'main', done: false }];
  const rewards = shuffle(rng, ['energy', 'map', 'scrap']);
  for (let e = 0; e < extras; e++) {
    const len = 2 + (diff >= 4 ? 1 : 0);
    const seq: string[] = [];
    for (let k = 0; k < len; k++) seq.push(pick(rng, codes));
    targets.push({ seq, reward: rewards[e % rewards.length], done: false });
  }
  const h: HackState = { n, grid, buffer, picks: [], targets, axis: 'row', line: 0, finished: false, success: false, solution: path };
  return h;
}

export function validPicks(h: HackState): number[] {
  if (h.finished) return [];
  const out: number[] = [];
  for (let j = 0; j < h.n; j++) {
    const cell = h.axis === 'row' ? h.line * h.n + j : j * h.n + h.line;
    if (!h.picks.includes(cell)) out.push(cell);
  }
  return out;
}

function contains(buf: string[], seq: string[]): boolean {
  outer: for (let i = 0; i + seq.length <= buf.length; i++) {
    for (let k = 0; k < seq.length; k++) if (buf[i + k] !== seq[k]) continue outer;
    return true;
  }
  return false;
}

export function bufferCodes(h: HackState): string[] {
  return h.picks.map((c) => h.grid[c]);
}

/** Aplica una elección. Devuelve false si no es válida. */
export function hackPick(h: HackState, cell: number): boolean {
  if (!validPicks(h).includes(cell)) return false;
  h.picks.push(cell);
  if (h.axis === 'row') { h.line = cell % h.n; h.axis = 'col'; } else { h.line = Math.floor(cell / h.n); h.axis = 'row'; }
  const buf = bufferCodes(h);
  for (const t of h.targets) if (!t.done && contains(buf, t.seq)) t.done = true;
  if (h.targets[0].done) h.success = true;
  if (h.picks.length >= h.buffer || h.targets.every((t) => t.done) || validPicks(h).length === 0) h.finished = true;
  // terminar si ya es imposible completar la principal
  if (!h.success && !h.finished && solveNext(h) < 0) h.finished = true;
  return true;
}

/** Siguiente casilla de alguna ruta que complete la secuencia principal, o -1. */
export function solveNext(h: HackState): number {
  if (h.targets[0].done) return -1;
  const res = search(h, h.picks.slice(), h.axis, h.line);
  return res ?? -1;
}

function search(h: HackState, picks: number[], axis: 'row' | 'col', lineIdx: number): number | null {
  const remaining = h.buffer - picks.length;
  const seq = h.targets[0].seq;
  const buf = picks.map((c) => h.grid[c]);
  if (contains(buf, seq)) return -2; // marcador: ya completo
  if (remaining <= 0) return null;
  // poda: el sufijo más largo del búfer que es prefijo de la secuencia
  let best = 0;
  for (let k = Math.min(seq.length - 1, buf.length); k > 0; k--) {
    let ok = true;
    for (let j = 0; j < k; j++) if (buf[buf.length - k + j] !== seq[j]) { ok = false; break; }
    if (ok) { best = k; break; }
  }
  if (seq.length - best > remaining) return null;
  for (let j = 0; j < h.n; j++) {
    const cell = axis === 'row' ? lineIdx * h.n + j : j * h.n + lineIdx;
    if (picks.includes(cell)) continue;
    picks.push(cell);
    const nAxis = axis === 'row' ? 'col' : 'row';
    const nLine = axis === 'row' ? cell % h.n : Math.floor(cell / h.n);
    const r = search(h, picks, nAxis, nLine);
    picks.pop();
    if (r !== null) return cell;
  }
  return null;
}
