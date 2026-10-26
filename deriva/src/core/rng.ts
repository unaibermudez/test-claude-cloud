/**
 * RNG determinista sfc32. Todo el azar de la lógica del juego pasa por aquí.
 * El estado es un array de 4 enteros de 32 bits, serializable en el guardado.
 */
export type RngState = [number, number, number, number];

/** Convierte una cadena o número en una semilla de 32 bits (xmur3). */
export function hashSeed(input: string | number): number {
  const str = String(input);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createRng(seed: string | number): RngState {
  const a = hashSeed(seed);
  const b = hashSeed(`${seed}:b`);
  const c = hashSeed(`${seed}:c`);
  const d = hashSeed(`${seed}:d`);
  const s: RngState = [a, b, c, d];
  for (let i = 0; i < 15; i++) next(s);
  return s;
}

/** Devuelve un float en [0,1) y avanza el estado. */
export function next(s: RngState): number {
  let [a, b, c, d] = s;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c >>> 0; s[3] = d >>> 0;
  return (t >>> 0) / 4294967296;
}

/** Entero en [min, max] (ambos incluidos). */
export function int(s: RngState, min: number, max: number): number {
  return min + Math.floor(next(s) * (max - min + 1));
}

export function chance(s: RngState, p: number): boolean {
  return next(s) < p;
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: array vacío');
  return arr[Math.floor(next(s) * arr.length)];
}

export function shuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(s) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function weighted<T>(s: RngState, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return pick(s, items);
  let r = next(s) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** Deriva un RNG hijo independiente sin consumir demasiado del padre. */
export function fork(s: RngState, label: string | number): RngState {
  const base = int(s, 0, 0x7fffffff);
  return createRng(`${base}:${label}`);
}

export function cloneRng(s: RngState): RngState {
  return [s[0], s[1], s[2], s[3]];
}

/** Semilla diaria compartida (UTC) para el modo Diario. */
export function dailySeed(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `DERIVA-${y}${m}${d}`;
}
