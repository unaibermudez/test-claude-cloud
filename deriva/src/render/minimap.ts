/** Minimapa: casillas vistas, puertas con su bloqueo, objetos clave, enemigos visibles y el jugador. */
import { TILE, type RunState } from '../core/state';
import { lockColor } from './tiles';
import { getVision } from '../core/vision';
import { getPlayer } from '../core/actors';

export function drawMinimap(st: RunState, cv: HTMLCanvasElement, cell: number, transparent = false): void {
  const m = st.map;
  cv.width = m.w * cell; cv.height = m.h * cell;
  const c = cv.getContext('2d')!;
  if (transparent) c.clearRect(0, 0, cv.width, cv.height);
  else { c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); }
  const v = getVision(st);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!m.seen[i]) continue;
      const tt = m.tiles[i];
      let col = '';
      switch (tt) {
        case TILE.WALL: case TILE.CRACKED: col = '#4c5363'; break;
        case TILE.WINDOW: col = '#3a5a8a'; break;
        case TILE.DOOR: { const d = m.doors[i]; col = d?.sealed ? '#e8e2c8' : d?.lock ? lockColor(d.lock) : '#9aa3ad'; break; }
        case TILE.AIRLOCK: col = '#ffb347'; break;
        case TILE.BREACH: col = '#ff4b2b'; break;
        case TILE.VOID: col = ''; break;
        case TILE.GIRDER: col = '#3a3d44'; break;
        default: {
          const s = m.sections[m.sec[i]];
          col = s && s.pressure < 30 && m.zone !== 6 ? '#1a2a4a' : s?.radiation ? '#24341c' : '#22272f';
        }
      }
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x * cell, y * cell, cell, cell);
      if (m.fire[i] > 0) { c.fillStyle = '#ff7a1a'; c.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2); }
    }
  }
  const dot = (x: number, y: number, col: string, big = false): void => {
    c.fillStyle = col;
    const s = big ? cell : Math.max(2, cell - 2);
    c.fillRect(x * cell + (cell - s) / 2, y * cell + (cell - s) / 2, s, s);
  };
  for (const p of m.props) {
    if (!m.seen[p.y * m.w + p.x]) continue;
    const col = p.kind === 'exit' || p.kind === 'core' ? '#7dff9a' : p.kind === 'hullExit' ? '#ffb46e' : p.kind === 'o2station' && !p.used ? '#5fb8e8' : p.kind === 'powernode' && !p.used ? '#f2d45c'
      : p.kind === 'terminal' ? '#9fe8ff' : p.kind === 'vending' || p.kind === 'merchant' ? '#ffd166' : p.kind === 'workbench' || p.kind === 'autosurgeon' ? '#c9a2ff'
        : p.kind === 'keycard' && !p.used ? lockColor(p.key) : p.kind === 'log' && !p.used ? '#f0e0b8' : (p.kind === 'npc' || p.kind === 'event') && !p.used ? '#ffd166' : '';
    if (col) dot(p.x, p.y, col, p.kind === 'exit' || p.kind === 'core');
  }
  for (const a of st.actors) {
    if (a.dead || a.id === st.pid || !v.seenActors.has(a.id)) continue;
    dot(a.x, a.y, a.faction === 'enemy' ? '#ff5a5a' : '#7dff9a');
  }
  const pl = getPlayer(st);
  dot(pl.x, pl.y, '#ffffff', true);
}
