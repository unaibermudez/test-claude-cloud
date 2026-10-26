import type { RunState } from './state';
import { TILE } from './state';
import { distanceMap } from './path';
import { enemyDef } from '../data/enemies';
import { getStats } from './rules';

/** Emite ruido desde (x,y). Las puertas cerradas atenúan (coste ×3). Los enemigos que lo oyen investigan. */
export function emitNoise(st: RunState, x: number, y: number, radius: number, fromPlayer = true): void {
  if (radius <= 0) return;
  const m = st.map;
  let r = radius;
  if (fromPlayer) r = Math.round(radius * getStats(st).noiseMult);
  if (r <= 0) return;
  st.lastNoise = { x, y, r, turn: st.turn };
  const dist = distanceMap(m.w, m.h, [{ x, y }], (cx, cy) => {
    const t = m.tiles[cy * m.w + cx];
    if (t === TILE.DOOR) {
      const d = m.doors[cy * m.w + cx];
      return d && (d.open || d.broken) ? 1 : 3;
    }
    if (t === TILE.WALL || t === TILE.PILLAR || t === TILE.CRACKED || t === TILE.WINDOW || t === TILE.AIRLOCK || t === TILE.BREACH) return -1;
    if (m.zone !== 6 && t === TILE.VOID) return -1;
    return 1;
  }, r * 2);
  for (const a of st.actors) {
    if (a.dead || a.faction !== 'enemy' || a.phantom) continue;
    const d = enemyDef(a.def);
    const dd = dist[a.y * m.w + a.x];
    if (dd > r * d.hearing) continue;
    // en vacío el sonido no se propaga
    const s = m.sec[a.y * m.w + a.x];
    if (s >= 0 && m.sections[s].pressure < 20 && m.zone !== 6) continue;
    if (a.ai.mode === 'hunt') continue;
    if (a.ai.mode === 'dormant' && dd > 3) continue;
    a.ai.mode = 'alert';
    a.ai.tx = x;
    a.ai.ty = y;
    a.ai.timer = 14;
  }
}
