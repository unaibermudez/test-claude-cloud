import { DIRS } from './geom';

/** Mapa de distancias (Dijkstra con costes enteros por casilla) desde varios orígenes. */
export function distanceMap(
  w: number,
  h: number,
  sources: { x: number; y: number }[],
  cost: (x: number, y: number) => number, // <0 = intransitable
  maxDist = Infinity,
  diagonal = true,
): Int32Array {
  const INF = 0x3fffffff;
  const dist = new Int32Array(w * h).fill(INF);
  // Cola de prioridad por cubos (costes pequeños)
  const buckets: number[][] = [];
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue;
    const i = s.y * w + s.x;
    dist[i] = 0;
    (buckets[0] ??= []).push(i);
  }
  const ndirs = diagonal ? 8 : 4;
  const step = diagonal ? 1 : 2;
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    if (d > maxDist) break;
    for (let k = 0; k < b.length; k++) {
      const i = b[k];
      if (dist[i] !== d) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (let n = 0; n < ndirs; n++) {
        const dir = DIRS[n * step];
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = cost(nx, ny);
        if (c < 0) continue;
        const nd = d + c;
        const ni = ny * w + nx;
        if (nd < dist[ni] && nd <= maxDist) {
          dist[ni] = nd;
          (buckets[nd] ??= []).push(ni);
        }
      }
    }
  }
  return dist;
}

export const UNREACHABLE = 0x3fffffff;

/** A* en 8 direcciones. Devuelve la ruta sin incluir el origen, o null. */
export function findPath(
  w: number,
  h: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  cost: (x: number, y: number) => number,
  maxNodes = 4000,
  diagonal = true,
): { x: number; y: number }[] | null {
  if (sx === tx && sy === ty) return [];
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open: { i: number; f: number }[] = [{ i: start, f: 0 }];
  g.set(start, 0);
  const closed = new Set<number>();
  let expanded = 0;
  while (open.length > 0) {
    // extracción del mínimo (heap binario simple)
    const cur = heapPop(open);
    if (cur.i === goal) {
      const pathOut: { x: number; y: number }[] = [];
      let c = goal;
      while (c !== start) {
        pathOut.push({ x: c % w, y: Math.floor(c / w) });
        const p = came.get(c);
        if (p === undefined) break;
        c = p;
      }
      return pathOut.reverse();
    }
    if (closed.has(cur.i)) continue;
    closed.add(cur.i);
    if (++expanded > maxNodes) return null;
    const x = cur.i % w;
    const y = Math.floor(cur.i / w);
    const gc = g.get(cur.i) ?? 0;
    for (let di = 0; di < 8; di += diagonal ? 1 : 2) {
      const d = DIRS[di];
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      const goalCell = ni === goal;
      const c = goalCell ? Math.max(1, cost(nx, ny)) : cost(nx, ny);
      if (c < 0 && !goalCell) continue;
      const ng = gc + Math.max(1, c);
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, cur.i);
        const hdist = diagonal ? Math.max(Math.abs(nx - tx), Math.abs(ny - ty)) : Math.abs(nx - tx) + Math.abs(ny - ty);
        heapPush(open, { i: ni, f: ng + hdist });
      }
    }
  }
  return null;
}

function heapPush(h: { i: number; f: number }[], v: { i: number; f: number }): void {
  h.push(v);
  let k = h.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (h[p].f <= h[k].f) break;
    const t = h[p]; h[p] = h[k]; h[k] = t;
    k = p;
  }
}

function heapPop(h: { i: number; f: number }[]): { i: number; f: number } {
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < h.length && h[l].f < h[m].f) m = l;
      if (r < h.length && h[r].f < h[m].f) m = r;
      if (m === k) break;
      const t = h[m]; h[m] = h[k]; h[k] = t;
      k = m;
    }
  }
  return top;
}
