import { computeFov } from './fov';
import { opaque, inBounds } from './map';
import { TILE, type RunState, type Actor } from './state';
import { DIRS, chebyshev } from './geom';
import { getStats } from './rules';
import { enemyDef } from '../data/enemies';
import { BAL } from '../data/balance';

export type LightColor = 'amb' | 'emer' | 'fire' | 'term' | 'flash' | 'flare' | 'glow' | 'boss' | 'planet';
export interface LightSource { x: number; y: number; r: number; color: LightColor; k: number }

export interface Vision {
  visible: Uint8Array;
  light: Float32Array;
  lights: LightSource[];
  seenActors: Set<number>;
  sensed: Set<number>;
  turn: number;
}

const cache = new WeakMap<RunState, Vision>();

export function getVision(st: RunState): Vision {
  const v = cache.get(st);
  if (v && v.turn === st.turn && v.visible.length === st.map.w * st.map.h) return v;
  return computeVision(st);
}

export function invalidateVision(st: RunState): void {
  cache.delete(st);
}

export function blocksSight(st: RunState, x: number, y: number): boolean {
  if (opaque(st.map, x, y)) return true;
  const i = y * st.map.w + x;
  return st.map.gas[i] >= 6;
}

export function player(st: RunState): Actor {
  return st.actors.find((a) => a.id === st.pid)!;
}

export function computeVision(st: RunState): Vision {
  const m = st.map;
  const n = m.w * m.h;
  const light = new Float32Array(n);
  const visible = new Uint8Array(n);
  const lights: LightSource[] = [];
  const ext = m.zone === 6;
  const blackout = m.event === 'apagon';
  // luz ambiente por sección
  for (let i = 0; i < n; i++) {
    const s = m.sec[i];
    if (ext && (m.tiles[i] === TILE.VOID || m.tiles[i] === TILE.PLATE)) { light[i] = 0.42; continue; }
    if (s >= 0 && !m.sections[s].dark && !blackout) light[i] = 0.55;
  }
  // puertas y paredes toman la luz de sus vecinos
  const pl = player(st);
  const stats = getStats(st);
  // fuentes
  for (const p of m.props) {
    if (p.kind === 'emlight') {
      if (p.variant === 1) lights.push({ x: p.x, y: p.y, r: 5, color: 'flare', k: 0.85 });
      else lights.push({ x: p.x, y: p.y, r: 4, color: 'emer', k: 0.5 });
    } else if ((p.kind === 'terminal' || p.kind === 'vending' || p.kind === 'o2station' || p.kind === 'powernode' || p.kind === 'autosurgeon' || p.kind === 'workbench' || p.kind === 'core') && !p.off) {
      lights.push({ x: p.x, y: p.y, r: p.kind === 'core' ? 5 : 2, color: p.kind === 'core' ? 'boss' : 'term', k: 0.4 });
    } else if (p.kind === 'exit' || p.kind === 'entry' || p.kind === 'hullExit') {
      lights.push({ x: p.x, y: p.y, r: 3, color: 'term', k: 0.45 });
    }
  }
  for (let i = 0; i < n; i++) {
    if (m.fire[i] > 0) lights.push({ x: i % m.w, y: Math.floor(i / m.w), r: 3, color: 'fire', k: 0.7 });
  }
  for (const a of st.actors) {
    if (a.dead || a.id === st.pid) continue;
    const d = enemyDef(a.def);
    if (d.rank === 'boss') lights.push({ x: a.x, y: a.y, r: 3, color: 'boss', k: 0.45 });
    else if (d.sprite.overlay === 'glow' || d.fireImmune) lights.push({ x: a.x, y: a.y, r: 2, color: 'glow', k: 0.45 });
  }
  if (st.player.flashlight) {
    lights.push({ x: pl.x, y: pl.y, r: 4 + stats.light, color: 'flash', k: 0.85 });
  }
  for (const L of lights) {
    computeFov(L.x, L.y, L.r, (x, y) => blocksSight(st, x, y) && !(x === L.x && y === L.y), (x, y) => {
      if (!inBounds(m, x, y)) return;
      const d = Math.hypot(x - L.x, y - L.y);
      const v = L.k * Math.max(0, 1 - d / (L.r + 1));
      const i = y * m.w + x;
      if (v > light[i]) light[i] = v;
    });
  }
  // cono de la linterna
  if (st.player.flashlight) {
    const f = DIRS[pl.facing] ?? DIRS[2];
    const R = 8 + stats.light;
    computeFov(pl.x, pl.y, R, (x, y) => blocksSight(st, x, y), (x, y) => {
      const dx = x - pl.x; const dy = y - pl.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const cos = (dx * f.x + dy * f.y) / (len * Math.hypot(f.x, f.y));
      if (cos < 0.72) return;
      const v = 0.8 * Math.max(0, 1 - len / (R + 1)) * (0.6 + 0.4 * cos);
      const i = y * m.w + x;
      if (v > light[i]) light[i] = v;
    });
  }
  // paredes: luz de vecinos
  for (let i = 0; i < n; i++) {
    const t = m.tiles[i];
    if (t === TILE.WALL || t === TILE.DOOR || t === TILE.WINDOW || t === TILE.CRACKED || t === TILE.AIRLOCK || t === TILE.BREACH || t === TILE.PILLAR) {
      const x = i % m.w; const y = Math.floor(i / m.w);
      let best = light[i];
      for (const d of DIRS) {
        const nx = x + d.x; const ny = y + d.y;
        if (!inBounds(m, nx, ny)) continue;
        const nt = m.tiles[ny * m.w + nx];
        if (nt === TILE.WALL) continue;
        best = Math.max(best, light[ny * m.w + nx] * 0.9);
      }
      light[i] = best;
    }
  }
  // campo de visión del jugador
  const sight = stats.sight + (m.event === 'apagon' ? -2 : 0);
  computeFov(pl.x, pl.y, Math.max(3, sight), (x, y) => blocksSight(st, x, y) && !(x === pl.x && y === pl.y), (x, y) => {
    if (!inBounds(m, x, y)) return;
    visible[y * m.w + x] = 1;
  });
  // memoria del mapa
  for (let i = 0; i < n; i++) {
    if (!visible[i]) continue;
    const x = i % m.w; const y = Math.floor(i / m.w);
    if (light[i] >= BAL.litThreshold || stats.nightVision || chebyshev(x, y, pl.x, pl.y) <= BAL.closeSight) m.seen[i] = 1;
  }
  // entidades visibles
  const seenActors = new Set<number>();
  const sensed = new Set<number>();
  for (const a of st.actors) {
    if (a.dead || a.id === st.pid) continue;
    const i = a.y * m.w + a.x;
    const dist = chebyshev(a.x, a.y, pl.x, pl.y);
    const d = enemyDef(a.def);
    if (visible[i] && (light[i] >= BAL.litThreshold || stats.nightVision || dist <= 1 || d.sprite.overlay === 'glow' || d.rank)) {
      if (!(a.status.cloak > 0)) seenActors.add(a.id);
    }
    if (!seenActors.has(a.id)) {
      if (stats.sense > 0 && dist <= stats.sense && !a.phantom) sensed.add(a.id);
      else if (stats.thermal && d.organic && dist <= stats.sight + 2 && !a.phantom) sensed.add(a.id);
    }
  }
  const v: Vision = { visible, light, lights, seenActors, sensed, turn: st.turn };
  cache.set(st, v);
  return v;
}

/** ¿Ve el actor `a` al jugador? */
export function canSeePlayer(st: RunState, a: Actor): boolean {
  const v = getVision(st);
  const pl = player(st);
  const m = st.map;
  if (pl.status.cloak > 0) return false;
  const d = enemyDef(a.def);
  let sight = d.sight + (st.opts.dullEnemies ? -2 : 0);
  if (st.opts.mode === 'pesadilla') sight += 1;
  if (a.status.blind) sight = 1;
  const dist = chebyshev(a.x, a.y, pl.x, pl.y);
  if (dist > sight) return false;
  if (!v.visible[a.y * m.w + a.x]) return false;
  const li = v.light[pl.y * m.w + pl.x];
  if (d.darkvision || dist <= BAL.closeSight || li >= BAL.litThreshold + 0.04 || st.player.flashlight) {
    if (st.player.sneak && li < 0.35 && !st.player.flashlight && dist > 2 && !d.darkvision) return false;
    return true;
  }
  return false;
}
