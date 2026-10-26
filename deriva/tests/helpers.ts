/** Utilidades de prueba: partidas con mapas dibujados en ASCII para escenarios controlados. */
import { createRun, defaultOptions, emptyMeta, step } from '../src/core/game';
import { TILE, type RunState, type FloorMap, type Section, type DoorState, type RunOptions } from '../src/core/state';
import { invalidateProps } from '../src/core/map';
import { invalidateVision } from '../src/core/vision';
import { getPlayer, spawnActor } from '../src/core/actors';
import type { Action } from '../src/core/player';
import type { GameEvent } from '../src/core/events';

/**
 * Leyenda: `#` pared · `.` suelo · `+` puerta cerrada · `/` puerta abierta · `A` esclusa · `W` ventana
 * `=` cobertura · ` ` vacío · `@` jugador · `e` enemigo (def indicada) · `B` brecha.
 */
export function arena(rows: string[], o: { enemy?: string; opts?: Partial<RunOptions>; zone?: 1 | 2 | 3 | 4 | 5 | 6; perks?: string[] } = {}): RunState {
  const st = createRun(defaultOptions({ seed: 'test', ...(o.opts ?? {}) }), emptyMeta(), o.perks ?? []);
  const h = rows.length; const w = Math.max(...rows.map((r) => r.length));
  const tiles: number[] = []; const doors: Record<number, DoorState> = {};
  const enemies: { x: number; y: number }[] = [];
  let px = 1; let py = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] ?? ' ';
      const i = y * w + x;
      let t: number = TILE.FLOOR;
      switch (c) {
        case '#': t = TILE.WALL; break;
        case ' ': t = TILE.VOID; break;
        case '+': t = TILE.DOOR; doors[i] = { open: false, lock: null, sealed: false, broken: false }; break;
        case '/': t = TILE.DOOR; doors[i] = { open: true, lock: null, sealed: false, broken: false }; break;
        case 'A': t = TILE.AIRLOCK; break;
        case 'W': t = TILE.WINDOW; break;
        case 'B': t = TILE.BREACH; break;
        case '=': t = TILE.COVER; break;
        case '@': px = x; py = y; break;
        case 'e': enemies.push({ x, y }); break;
        default: break;
      }
      tiles.push(t);
    }
  }
  // secciones: regiones de suelo separadas por puertas y paredes
  const sec = new Array<number>(w * h).fill(-1);
  const sections: Section[] = [];
  const walk = (t: number): boolean => t !== TILE.WALL && t !== TILE.VOID && t !== TILE.DOOR && t !== TILE.AIRLOCK && t !== TILE.WINDOW && t !== TILE.BREACH;
  for (let i = 0; i < w * h; i++) {
    if (sec[i] >= 0 || !walk(tiles[i])) continue;
    const id = sections.length;
    const q = [i]; sec[i] = id; let size = 0;
    while (q.length) {
      const c = q.pop()!; size++;
      const x = c % w; const y = Math.floor(c / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (sec[n] < 0 && walk(tiles[n])) { sec[n] = id; q.push(n); }
      }
    }
    sections.push({ id, pressure: 100, radiation: 0, coolant: false, dark: false, lifeSupport: true, vent: 0, size, ventedByPlayer: false });
  }
  const m: FloorMap = {
    w, h, zone: o.zone ?? 1, floor: 2, boss: false, tiles, sec, sections, rooms: [{ id: 0, x: 1, y: 1, w: w - 2, h: h - 2, kind: 'normal' }],
    doors, props: [], seen: new Array(w * h).fill(0), fire: new Array(w * h).fill(0), gas: new Array(w * h).fill(0),
    entry: { x: px, y: py }, exit: { x: px, y: py }, event: null, eventTurn: 0, genSeed: 'arena', attempts: 1,
  };
  st.map = m;
  const p = getPlayer(st);
  st.actors = [p];
  st.items = [];
  st.telegraphs = [];
  p.x = px; p.y = py;
  for (const e of enemies) spawnActor(st, o.enemy ?? 'eco_errante', e.x, e.y, { mode: 'idle' });
  invalidateProps(m);
  invalidateVision(st);
  st.hallucinationTimer = 99999;
  return st;
}

export function run(st: RunState, a: Action, n = 1): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(st, a));
  return out;
}

export function msgs(evs: GameEvent[]): string[] {
  return evs.filter((e): e is Extract<GameEvent, { t: 'msg' }> => e.t === 'msg').map((e) => e.key);
}

export const ROOM = [
  '##########',
  '#........#',
  '#........#',
  '#...@....#',
  '#........#',
  '#........#',
  '##########',
];
