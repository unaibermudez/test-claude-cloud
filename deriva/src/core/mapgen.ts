/**
 * Generador procedural de pisos + validador de completabilidad.
 * Puro y determinista: misma semilla ⇒ mismo piso.
 */
import { createRng, int, chance, pick, shuffle, next, type RngState } from './rng';
import { rectsOverlap, rectCenter, DIRS, CARDINALS, type Rect } from './geom';
import { findPath, distanceMap, UNREACHABLE } from './path';
import { TILE, type FloorMap, type Room, type RoomKind, type Prop, type Section, type LockKind, type DoorState, type PropKind } from './state';
import type { ZoneDef, ZoneId } from './content';
import { zoneDef } from '../data/zones';

export interface GenOptions {
  zone: ZoneId;
  floor: number; // 1..4
  seed: string;
  tutorial?: boolean;
  hullExit?: boolean; // añadir esclusa exterior (ruta a la zona secreta)
}

interface Builder {
  z: ZoneDef;
  rng: RngState;
  w: number;
  h: number;
  tiles: number[];
  roomMask: Int16Array; // -1 libre; >=0 interior de sala; <= -2 perímetro
  rooms: (Rect & { id: number; kind: RoomKind; doors: number[] })[];
  doors: Record<number, DoorState>;
  props: Prop[];
  nextProp: number;
  blocked: Uint8Array; // ocupado por obstáculo
  corridor: Uint8Array;
  gaps: Set<number>;
  exterior: boolean;
  propCells: Set<number>;
  jitter: Uint8Array;
}

const PASSABLE_GEN = new Set<number>([TILE.FLOOR, TILE.DOOR, TILE.GRATE, TILE.PLANTS, TILE.PLATE, TILE.RUBBLE]);

export function generateFloor(opts: GenOptions): FloorMap {
  const z = zoneDef(opts.zone);
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = createRng(`${opts.seed}|z${opts.zone}|f${opts.floor}|a${attempt}`);
    const b = opts.floor === 4 ? buildBoss(z, rng) : buildNormal(z, rng, opts);
    if (!b) continue;
    const map = finalize(b, opts, attempt);
    const v = validateFloor(map);
    if (v.ok) return map;
  }
  throw new Error(`No se pudo generar un piso válido (zona ${opts.zone}, piso ${opts.floor}, semilla ${opts.seed})`);
}

// ------------------------------------------------------------------ construcción normal

function newBuilder(z: ZoneDef, rng: RngState, w: number, h: number): Builder {
  return {
    z, rng, w, h,
    tiles: new Array(w * h).fill(TILE.VOID),
    roomMask: new Int16Array(w * h).fill(-1),
    rooms: [], doors: {}, props: [], nextProp: 1,
    blocked: new Uint8Array(w * h), corridor: new Uint8Array(w * h), gaps: new Set(),
    exterior: !!z.exterior,
    propCells: new Set(),
    jitter: (() => { const j = new Uint8Array(w * h); for (let i = 0; i < j.length; i++) j[i] = next(rng) < 0.15 ? 2 : 0; return j; })(),
  };
}

function addRoom(b: Builder, r: Rect, kind: RoomKind = 'normal'): number {
  const id = b.rooms.length;
  b.rooms.push({ ...r, id, kind, doors: [] });
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const i = y * b.w + x;
      const interior = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (interior) {
        b.roomMask[i] = id;
        b.tiles[i] = TILE.FLOOR;
      } else if (b.roomMask[i] === -1) {
        b.roomMask[i] = -2 - id;
      }
    }
  }
  return id;
}

function buildNormal(z: ZoneDef, rng: RngState, opts: GenOptions): Builder | null {
  const b = newBuilder(z, rng, z.w, z.h);
  const target = opts.tutorial ? 7 : int(rng, z.rooms[0], z.rooms[1]);
  for (let attempt = 0; attempt < 500 && b.rooms.length < target; attempt++) {
    const w = int(rng, z.roomW[0], z.roomW[1]);
    const h = int(rng, z.roomH[0], z.roomH[1]);
    const r = { x: int(rng, 3, b.w - w - 4), y: int(rng, 3, b.h - h - 4), w, h };
    if (b.rooms.some((o) => rectsOverlap(o, r, 3))) continue;
    addRoom(b, r);
  }
  if (b.rooms.length < 6) return null;

  // Grafo: MST (Prim) + bucles
  const n = b.rooms.length;
  const centers = b.rooms.map(rectCenter);
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  const edges: [number, number][] = [];
  for (let k = 1; k < n; k++) {
    let best = -1; let bi = -1; let bj = -1;
    for (let i = 0; i < n; i++) {
      if (!inTree[i]) continue;
      for (let j = 0; j < n; j++) {
        if (inTree[j]) continue;
        const d = Math.abs(centers[i].x - centers[j].x) + Math.abs(centers[i].y - centers[j].y);
        if (best < 0 || d < best) { best = d; bi = i; bj = j; }
      }
    }
    inTree[bj] = true;
    edges.push([bi, bj]);
  }
  let extras = 0;
  for (let i = 0; i < n && extras < 3; i++) {
    for (let j = i + 1; j < n && extras < 3; j++) {
      if (edges.some(([a, c]) => (a === i && c === j) || (a === j && c === i))) continue;
      const d = Math.abs(centers[i].x - centers[j].x) + Math.abs(centers[i].y - centers[j].y);
      if (d < 26 && chance(rng, 0.2)) { edges.push([i, j]); extras++; }
    }
  }

  for (const [a, c] of edges) connectRooms(b, a, c);
  buildWalls(b);
  if (!allRoomsConnected(b)) return null;
  decorate(b, opts);
  return b;
}

function sideToward(r: Rect, tx: number, ty: number): number {
  const c = rectCenter(r);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (Math.abs(dx) * (r.h + 2) >= Math.abs(dy) * (r.w + 2)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/** Devuelve [puertaX, puertaY, fueraX, fueraY] para una sala hacia un punto. */
function chooseDoor(b: Builder, roomId: number, tx: number, ty: number): [number, number, number, number] | null {
  const r = b.rooms[roomId];
  const pref = sideToward(r, tx, ty);
  const sides = [pref, (pref + 1) % 4, (pref + 3) % 4, (pref + 2) % 4];
  for (const side of sides) {
    // reutilizar una puerta existente de ese lado
    const existing = r.doors.filter((di) => doorSide(b, r, di) === side);
    if (existing.length > 0 && chance(b.rng, 0.55)) {
      const di = existing[0];
      const dx = di % b.w; const dy = Math.floor(di / b.w);
      const out = outward(side);
      return [dx, dy, dx + out[0], dy + out[1]];
    }
    const cands: [number, number][] = [];
    if (side === 0 || side === 2) {
      const y = side === 0 ? r.y - 1 : r.y + r.h;
      for (let x = r.x; x < r.x + r.w; x++) cands.push([x, y]);
    } else {
      const x = side === 1 ? r.x + r.w : r.x - 1;
      for (let y = r.y; y < r.y + r.h; y++) cands.push([x, y]);
    }
    shuffle(b.rng, cands);
    // preferir posiciones cercanas al objetivo
    cands.sort((p, q) => Math.abs(p[0] - tx) + Math.abs(p[1] - ty) - (Math.abs(q[0] - tx) + Math.abs(q[1] - ty)));
    const top = cands.slice(0, Math.max(2, Math.ceil(cands.length / 2)));
    shuffle(b.rng, top);
    for (const [x, y] of top) {
      const out = outward(side);
      const ox = x + out[0]; const oy = y + out[1];
      if (ox < 2 || oy < 2 || ox >= b.w - 2 || oy >= b.h - 2) continue;
      if (b.roomMask[oy * b.w + ox] !== -1) continue;
      // evitar puertas contiguas
      const along = side === 0 || side === 2 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      if (along.some(([ax, ay]) => b.tiles[(y + ay) * b.w + x + ax] === TILE.DOOR)) continue;
      return [x, y, ox, oy];
    }
  }
  return null;
}

function outward(side: number): [number, number] {
  return side === 0 ? [0, -1] : side === 1 ? [1, 0] : side === 2 ? [0, 1] : [-1, 0];
}

function doorSide(b: Builder, r: Rect, di: number): number {
  const x = di % b.w; const y = Math.floor(di / b.w);
  if (y === r.y - 1) return 0;
  if (y === r.y + r.h) return 2;
  if (x === r.x + r.w) return 1;
  return 3;
}

function connectRooms(b: Builder, a: number, c: number): boolean {
  const ca = rectCenter(b.rooms[c]);
  const cc = rectCenter(b.rooms[a]);
  const da = chooseDoor(b, a, ca.x, ca.y);
  const dc = chooseDoor(b, c, cc.x, cc.y);
  if (!da || !dc) return false;
  const jitter = b.jitter;
  const cost = (x: number, y: number): number => {
    if (x < 1 || y < 1 || x >= b.w - 1 || y >= b.h - 1) return -1;
    const i = y * b.w + x;
    if (b.roomMask[i] !== -1) return -1;
    if (b.corridor[i]) return 1;
    return 3 + jitter[i];
  };
  const p = findPath(b.w, b.h, da[2], da[3], dc[2], dc[3], cost, 8000, false);
  if (!p) return false;
  const cells = [{ x: da[2], y: da[3] }, ...p];
  for (const q of cells) {
    const i = q.y * b.w + q.x;
    b.tiles[i] = b.exterior ? TILE.PLATE : TILE.FLOOR;
    b.corridor[i] = 1;
  }
  for (const [d, rid] of [[da, a], [dc, c]] as const) {
    const i = d[1] * b.w + d[0];
    if (b.tiles[i] !== TILE.DOOR) {
      b.tiles[i] = TILE.DOOR;
      b.doors[i] = { open: false, lock: null, sealed: false, broken: false };
      b.rooms[rid].doors.push(i);
    }
  }
  if (b.exterior) makeGaps(b, cells);
  return true;
}

/** Zona exterior: huecos de vacío en tramos rectos de pasarela. */
function makeGaps(b: Builder, cells: { x: number; y: number }[]): void {
  if (cells.length < 9 || !chance(b.rng, 0.45)) return;
  let runStart = 0;
  for (let k = 1; k <= cells.length; k++) {
    const sameDir = k < cells.length && k >= 2 &&
      cells[k].x - cells[k - 1].x === cells[k - 1].x - cells[k - 2].x &&
      cells[k].y - cells[k - 1].y === cells[k - 1].y - cells[k - 2].y &&
      (cells[k].x === cells[k - 1].x || cells[k].y === cells[k - 1].y);
    if (!sameDir) {
      const len = k - runStart;
      if (len >= 8) {
        const glen = int(b.rng, 2, Math.min(4, len - 5));
        const s = runStart + int(b.rng, 2, len - glen - 2);
        for (let g = s; g < s + glen; g++) {
          const i = cells[g].y * b.w + cells[g].x;
          b.tiles[i] = TILE.VOID;
          b.gaps.add(i);
        }
        return;
      }
      runStart = k - 1;
    }
  }
}

function buildWalls(b: Builder): void {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      if (b.tiles[i] !== TILE.VOID || b.gaps.has(i)) continue;
      if (b.exterior && b.roomMask[i] === -1) continue; // las pasarelas exteriores no tienen paredes
      let near = false;
      for (const d of DIRS) {
        const nx = x + d.x; const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
        const t = b.tiles[ny * b.w + nx];
        if (t === TILE.FLOOR || t === TILE.DOOR || (!b.exterior && t === TILE.PLATE)) { near = true; break; }
      }
      if (near) b.tiles[i] = TILE.WALL;
    }
  }
}

function passGen(b: Builder, i: number): boolean {
  return PASSABLE_GEN.has(b.tiles[i]) || b.gaps.has(i);
}

function bfsFrom(b: Builder, start: number, blockedDoor?: (i: number) => boolean): Int32Array {
  const dist = new Int32Array(b.w * b.h).fill(-1);
  const q = [start];
  dist[start] = 0;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % b.w; const y = (i - x) / b.w;
    for (const d of CARDINALS) {
      const nx = x + d.x; const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
      const ni = ny * b.w + nx;
      if (dist[ni] >= 0 || !passGen(b, ni) || b.blocked[ni]) continue;
      if (b.tiles[ni] === TILE.DOOR && blockedDoor && blockedDoor(ni)) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

function allRoomsConnected(b: Builder): boolean {
  const c0 = rectCenter(b.rooms[0]);
  const dist = bfsFrom(b, c0.y * b.w + c0.x);
  return b.rooms.every((r) => {
    const c = rectCenter(r);
    return dist[c.y * b.w + c.x] >= 0;
  });
}

// ------------------------------------------------------------------ decoración y salas especiales

function roomCells(b: Builder, r: Rect): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(y * b.w + x);
  return out;
}

function nearDoor(b: Builder, i: number): boolean {
  const x = i % b.w; const y = Math.floor(i / b.w);
  for (const d of DIRS) {
    const ni = (y + d.y) * b.w + x + d.x;
    if (b.tiles[ni] === TILE.DOOR || b.tiles[ni] === TILE.CRACKED) return true;
  }
  return false;
}

function againstWall(b: Builder, i: number): boolean {
  const x = i % b.w; const y = Math.floor(i / b.w);
  return CARDINALS.some((d) => b.tiles[(y + d.y) * b.w + x + d.x] === TILE.WALL);
}

/** Comprueba que bloquear la casilla no desconecta el interior de la sala. */
function canBlock(b: Builder, r: Rect, i: number): boolean {
  if (b.blocked[i] || b.tiles[i] !== TILE.FLOOR && b.tiles[i] !== TILE.GRATE) return false;
  if (nearDoor(b, i)) return false;
  if (b.propCells.has(i)) return false;
  b.blocked[i] = 1;
  const cells = roomCells(b, r).filter((c) => !b.blocked[c] && passGen(b, c));
  let ok = true;
  if (cells.length > 0) {
    const seen = new Set<number>([cells[0]]);
    const q = [cells[0]];
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % b.w; const y = Math.floor(c / b.w);
      for (const d of CARDINALS) {
        const nx = x + d.x; const ny = y + d.y;
        if (nx < r.x || ny < r.y || nx >= r.x + r.w || ny >= r.y + r.h) continue;
        const ni = ny * b.w + nx;
        if (seen.has(ni) || b.blocked[ni] || !passGen(b, ni)) continue;
        seen.add(ni);
        q.push(ni);
      }
    }
    ok = seen.size === cells.length;
  }
  b.blocked[i] = 0;
  return ok;
}

function freeCell(b: Builder, r: Rect, opts: { wall?: boolean; block?: boolean; center?: boolean } = {}): number | null {
  let cells = roomCells(b, r).filter((i) => !b.blocked[i] && (b.tiles[i] === TILE.FLOOR || b.tiles[i] === TILE.GRATE) &&
    !b.propCells.has(i));
  if (opts.wall) cells = cells.filter((i) => againstWall(b, i));
  if (!opts.block) cells = cells.filter((i) => !nearDoor(b, i) || cells.length < 4);
  if (cells.length === 0) return null;
  if (opts.center) {
    const c = rectCenter(r);
    cells.sort((p, q) => Math.abs(p % b.w - c.x) + Math.abs(Math.floor(p / b.w) - c.y) - (Math.abs(q % b.w - c.x) + Math.abs(Math.floor(q / b.w) - c.y)));
  } else {
    shuffle(b.rng, cells);
  }
  if (!opts.block) return cells[0];
  for (let k = 0; k < cells.length && k < 24; k++) if (canBlock(b, r, cells[k])) return cells[k];
  return null;
}

function pickRoom(b: Builder, f: (r: Builder['rooms'][number]) => boolean): Builder['rooms'][number] {
  const list = b.rooms.filter(f);
  return list.length ? pick(b.rng, list) : pick(b.rng, b.rooms.filter((r) => r.kind !== 'secret'));
}

function addProp(b: Builder, kind: PropKind, i: number, extra: Partial<Prop> = {}, block = true): Prop {
  const p: Prop = { id: b.nextProp++, kind, x: i % b.w, y: Math.floor(i / b.w), ...extra };
  b.props.push(p);
  b.propCells.add(i);
  if (block) b.blocked[i] = 1;
  return p;
}

function placeProp(b: Builder, r: Rect, kind: PropKind, extra: Partial<Prop> = {}, opts: { wall?: boolean; block?: boolean; center?: boolean } = { wall: true, block: true }): Prop | null {
  const i = freeCell(b, r, opts);
  if (i === null) return null;
  return addProp(b, kind, i, extra, opts.block !== false);
}

function decorate(b: Builder, opts: GenOptions): void {
  const { rng, z } = b;
  // salas de inicio y salida
  const startId = int(rng, 0, b.rooms.length - 1);
  const sc = rectCenter(b.rooms[startId]);
  const dist = bfsFrom(b, sc.y * b.w + sc.x);
  let exitId = startId; let best = -1;
  for (const r of b.rooms) {
    const c = rectCenter(r);
    const d = dist[c.y * b.w + c.x];
    if (r.id !== startId && d > best) { best = d; exitId = r.id; }
  }
  b.rooms[startId].kind = 'start';
  b.rooms[exitId].kind = 'exit';

  // salas especiales
  const others = shuffle(rng, b.rooms.filter((r) => r.kind === 'normal'));
  const specials: RoomKind[] = ['event'];
  if (opts.tutorial) specials.push('rest');
  else {
    if (chance(rng, 0.55)) specials.push('shop');
    if (chance(rng, 0.42)) specials.push('rest');
    if (chance(rng, 0.35)) specials.push('lab');
    if (chance(rng, 0.4)) specials.push('workshop');
    while (specials.length < 3) specials.push(pick(rng, ['shop', 'rest', 'workshop', 'lab'] as RoomKind[]));
  }
  for (const k of specials) {
    const r = others.pop();
    if (!r) break;
    r.kind = k;
  }

  // ventanas y esclusas en paredes exteriores
  const outerCells = (r: Rect): { i: number; side: number }[] => {
    const res: { i: number; side: number }[] = [];
    const sides: [number, number, number, number, number][] = [];
    for (let x = r.x; x < r.x + r.w; x++) { sides.push([x, r.y - 1, 0, -1, 0]); sides.push([x, r.y + r.h, 0, 1, 2]); }
    for (let y = r.y; y < r.y + r.h; y++) { sides.push([r.x - 1, y, -1, 0, 3]); sides.push([r.x + r.w, y, 1, 0, 1]); }
    for (const [x, y, ox, oy, side] of sides) {
      const i = y * b.w + x;
      if (b.tiles[i] !== TILE.WALL) continue;
      const oi = (y + oy) * b.w + x + ox;
      if (y + oy < 0 || y + oy >= b.h || x + ox < 0 || x + ox >= b.w) continue;
      if (b.tiles[oi] === TILE.VOID && !b.gaps.has(oi)) res.push({ i, side });
    }
    return res;
  };
  if (!b.exterior) {
    for (const r of b.rooms) {
      if (r.kind === 'start') continue;
      if (chance(rng, z.windows)) {
        const oc = outerCells(r);
        if (oc.length > 0) {
          const k = int(rng, 1, Math.min(3, oc.length));
          shuffle(rng, oc);
          for (let j = 0; j < k; j++) b.tiles[oc[j].i] = TILE.WINDOW;
        }
      }
    }
    // esclusa (sala con salida al vacío controlada)
    const airCands = shuffle(rng, b.rooms.filter((r) => r.kind === 'normal' && outerCells(r).length > 0));
    const nAir = opts.tutorial ? 1 : int(rng, 1, 2);
    for (let k = 0; k < nAir && k < airCands.length; k++) {
      const r = airCands[k];
      const oc = outerCells(r);
      const c = pick(rng, oc);
      b.tiles[c.i] = TILE.AIRLOCK;
      r.kind = 'airlock';
      const cx = c.i % b.w; const cy = Math.floor(c.i / b.w);
      const inward = outward((c.side + 2) % 4);
      // panel junto a la esclusa, dentro de la sala
      const pi = (cy + inward[1]) * b.w + cx + inward[0];
      const alt = [pi + (c.side % 2 === 0 ? 1 : b.w), pi - (c.side % 2 === 0 ? 1 : b.w)];
      const spot = alt.find((a) => roomCells(b, r).includes(a) && canBlock(b, r, a));
      if (spot !== undefined) addProp(b, 'airlockPanel', spot);
    }
    // brechas preexistentes (secciones en vacío)
    for (const r of b.rooms) {
      if (r.kind !== 'normal' || opts.tutorial) continue;
      if (chance(rng, z.vacuumChance)) {
        const oc = outerCells(r);
        if (oc.length > 0) b.tiles[pick(rng, oc).i] = TILE.BREACH;
      }
    }
  }

  // sala secreta
  if (!opts.tutorial && chance(rng, 0.42)) makeSecretRoom(b);

  // accesos
  const start = b.rooms[startId];
  const exit = b.rooms[exitId];
  placeProp(b, start, 'entry', {}, { wall: true, block: true }) ?? placeProp(b, start, 'entry', {}, { block: true });
  placeProp(b, exit, 'exit', {}, { center: true, block: true }) ?? placeProp(b, exit, 'exit', {}, { block: true });
  if (opts.hullExit) {
    const cand = b.rooms.filter((r) => r.kind === 'normal' || r.kind === 'airlock');
    const r = cand.length ? pick(rng, cand) : exit;
    placeProp(b, r, 'hullExit', {}, { wall: true, block: true });
  }

  // salas especiales: contenido fijo
  for (const r of b.rooms) {
    switch (r.kind) {
      case 'shop':
        placeProp(b, r, 'vending');
        if (chance(rng, 0.5)) placeProp(b, r, 'merchant', {}, { block: true });
        break;
      case 'rest':
        placeProp(b, r, 'bed');
        placeProp(b, r, 'o2station');
        break;
      case 'lab':
        placeProp(b, r, 'autosurgeon');
        break;
      case 'workshop':
        placeProp(b, r, 'workbench');
        break;
      default:
        break;
    }
  }

  // estaciones de O₂ y nodos de energía
  const normals = b.rooms.filter((r) => r.kind === 'normal' || r.kind === 'airlock' || r.kind === 'event');
  const nO2 = (opts.tutorial ? 1 : 1) + (z.id >= 3 ? 1 : 0);
  for (let k = 0; k < nO2 && normals.length; k++) placeProp(b, pick(rng, normals), 'o2station', { charges: 1 });
  const nPow = 1 + (chance(rng, 0.5) ? 1 : 0);
  for (let k = 0; k < nPow && normals.length; k++) placeProp(b, pick(rng, normals), 'powernode', { charges: 1 });

  // terminales
  const nTerm = opts.tutorial ? 1 : int(rng, 2, 4);
  for (let k = 0; k < nTerm; k++) {
    const r = pickRoom(b, (q) => q.kind !== 'secret');
    placeProp(b, r, 'terminal', { hack: Math.min(5, Math.max(1, z.id + int(rng, -1, 0))) });
  }

  // contenedores
  const nCont = opts.tutorial ? 3 : int(rng, 3, 6);
  for (let k = 0; k < nCont; k++) {
    const r = pickRoom(b, (q) => q.kind !== 'start');
    placeProp(b, r, 'container', { variant: int(rng, 0, 2), loot: [] });
  }

  // barriles y cables
  const nBar = int(rng, opts.tutorial ? 1 : 1, 3 + (z.id === 3 ? 2 : 0));
  for (let k = 0; k < nBar; k++) placeProp(b, pickRoom(b, (q) => q.kind === 'normal' || q.kind === 'airlock'), 'barrel', { hp: 3 }, { block: true });
  const nCab = z.id === 3 ? int(rng, 1, 4) : int(rng, 0, 1);
  for (let k = 0; k < nCab; k++) {
    const r = pickRoom(b, (q) => q.kind === 'normal');
    placeProp(b, r, 'cable', {}, { block: false });
  }

  // cámaras
  if (z.id >= 2 && !b.exterior) {
    const nCam = int(rng, 1, 3);
    for (let k = 0; k < nCam; k++) {
      const r = pickRoom(b, (q) => q.kind === 'normal' || q.kind === 'exit');
      placeProp(b, r, 'camera', {}, { wall: true, block: false });
    }
  }

  // atajo de mantenimiento
  if (!opts.tutorial && chance(rng, 0.5)) {
    const cands = b.rooms.filter((r) => r.kind !== 'secret');
    let pairA: Rect | null = null; let pairB: Rect | null = null; let far = 0;
    for (let t = 0; t < 12; t++) {
      const ra = pick(rng, cands); const rb = pick(rng, cands);
      if (ra === rb) continue;
      const ca = rectCenter(ra); const cb = rectCenter(rb);
      const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
      if (d > far) { far = d; pairA = ra; pairB = rb; }
    }
    if (pairA && pairB && far > 20) {
      const pa = placeProp(b, pairA, 'vent', {}, { wall: true, block: false });
      const pb = pa ? placeProp(b, pairB, 'vent', {}, { wall: true, block: false }) : null;
      if (pa && pb) { pa.link = pb.id; pb.link = pa.id; } else if (pa) { b.props.splice(b.props.indexOf(pa), 1); b.propCells.delete(pa.y * b.w + pa.x); }
    }
  }

  // obstáculos y vegetación
  for (const r of b.rooms) {
    if (r.kind === 'secret') continue;
    const area = r.w * r.h;
    if (z.plants > 0 && chance(rng, z.plants) && r.kind !== 'start') {
      const k = int(rng, 2, Math.max(3, Math.floor(area / 6)));
      for (let j = 0; j < k; j++) {
        const i = freeCell(b, r, {});
        if (i !== null && !nearDoor(b, i)) b.tiles[i] = TILE.PLANTS;
      }
    }
    if (chance(rng, z.cover)) {
      const k = int(rng, 1, Math.max(1, Math.floor(area / 14)));
      for (let j = 0; j < k; j++) {
        const i = freeCell(b, r, { block: true });
        if (i !== null && !againstWall(b, i)) { b.tiles[i] = TILE.COVER; b.blocked[i] = 1; }
      }
    }
    if (chance(rng, z.pillars) && r.w >= 7 && r.h >= 5) {
      for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
        const i = py * b.w + px;
        if (canBlock(b, r, i) && !againstWall(b, i)) { b.tiles[i] = TILE.PILLAR; b.blocked[i] = 1; }
      }
    }
    if (z.id === 3 && chance(rng, 0.4)) {
      for (const i of roomCells(b, r)) if (b.tiles[i] === TILE.FLOOR && chance(rng, 0.35)) b.tiles[i] = TILE.GRATE;
    }
    if (chance(rng, 0.25) && r.kind === 'normal') {
      const i = freeCell(b, r, {});
      if (i !== null) b.tiles[i] = TILE.RUBBLE;
    }
    // mobiliario
    const nDecor = r.kind === 'start' ? 1 : int(rng, 1, Math.min(4, 1 + Math.floor(area / 12)));
    for (let j = 0; j < nDecor; j++) {
      const name = pick(rng, z.decor);
      const blocking = !['toy', 'plant_pot', 'chair', 'roots', 'fungus', 'pipes', 'crystal', 'flag'].includes(name);
      const i = freeCell(b, r, blocking ? { wall: true, block: true } : {});
      if (i !== null) addProp(b, 'decor', i, { label: name, variant: int(rng, 0, 3) }, blocking);
    }
  }
  // cápsulas de criogenia (zona 1)
  if (z.id === 1) {
    for (const r of b.rooms) {
      if (r.kind === 'normal' && chance(rng, 0.35)) {
        const k = int(rng, 1, 3);
        for (let j = 0; j < k; j++) placeProp(b, r, 'cryopod', { variant: 0 });
      }
    }
  }
}

function makeSecretRoom(b: Builder): void {
  for (let attempt = 0; attempt < 40; attempt++) {
    const i = int(b.rng, 0, b.w * b.h - 1);
    if (b.tiles[i] !== TILE.WALL) continue;
    const x = i % b.w; const y = Math.floor(i / b.w);
    for (const d of CARDINALS) {
      const fi = (y - d.y) * b.w + x - d.x;
      if (b.tiles[fi] !== TILE.FLOOR || !b.corridor[fi]) continue;
      // la sala secreta empieza al otro lado
      const w = int(b.rng, 3, 5); const h = int(b.rng, 3, 4);
      let rx: number; let ry: number;
      if (d.x !== 0) { rx = d.x > 0 ? x + 1 : x - w; ry = y - int(b.rng, 0, h - 1); }
      else { ry = d.y > 0 ? y + 1 : y - h; rx = x - int(b.rng, 0, w - 1); }
      if (rx < 2 || ry < 2 || rx + w > b.w - 2 || ry + h > b.h - 2) continue;
      let ok = true;
      for (let yy = ry - 1; yy <= ry + h && ok; yy++) {
        for (let xx = rx - 1; xx <= rx + w && ok; xx++) {
          const ci = yy * b.w + xx;
          if (ci === i) continue;
          if (b.tiles[ci] !== TILE.VOID || b.roomMask[ci] !== -1) ok = false;
        }
      }
      if (!ok) continue;
      const id = addRoom(b, { x: rx, y: ry, w, h }, 'secret');
      b.tiles[i] = TILE.CRACKED;
      for (let yy = ry - 1; yy <= ry + h; yy++) {
        for (let xx = rx - 1; xx <= rx + w; xx++) {
          const ci = yy * b.w + xx;
          if (b.tiles[ci] === TILE.VOID) b.tiles[ci] = TILE.WALL;
        }
      }
      const r = b.rooms[id];
      placeProp(b, r, 'container', { variant: 3, loot: [] });
      return;
    }
  }
}

// ------------------------------------------------------------------ pisos de jefe

function buildBoss(z: ZoneDef, rng: RngState): Builder {
  const b = newBuilder(z, rng, 52, 30);
  const start = addRoom(b, { x: 3, y: 12, w: 5, h: 5 }, 'start');
  const ante = addRoom(b, { x: 12, y: 11, w: 6, h: 7 }, 'ante');
  const arena = addRoom(b, { x: 22, y: 4, w: 21, h: 21 }, 'boss');
  const exit = addRoom(b, { x: 46, y: 12, w: 4, h: 5 }, 'exit');
  const carve = (x0: number, x1: number, y: number): void => {
    for (let x = x0; x <= x1; x++) {
      const i = y * b.w + x;
      b.tiles[i] = b.exterior ? TILE.PLATE : TILE.FLOOR;
      b.corridor[i] = 1;
    }
  };
  const door = (x: number, y: number, room: number, lock: LockKind | null = null): void => {
    const i = y * b.w + x;
    b.tiles[i] = TILE.DOOR;
    b.doors[i] = { open: false, lock, sealed: false, broken: false };
    b.rooms[room].doors.push(i);
  };
  door(8, 14, start); carve(9, 10, 14); door(11, 14, ante);
  door(18, 14, ante); carve(19, 20, 14); door(21, 14, arena);
  door(43, 14, arena); carve(44, 44, 14); door(45, 14, exit, 'boss');
  buildWalls(b);
  if (b.exterior) {
    // la arena exterior es una plataforma abierta al vacío
    const A = b.rooms[arena];
    for (let y = A.y - 1; y <= A.y + A.h; y++) {
      for (let x = A.x - 1; x <= A.x + A.w; x++) {
        const i = y * b.w + x;
        const interior = x >= A.x && x < A.x + A.w && y >= A.y && y < A.y + A.h;
        if (interior) b.tiles[i] = TILE.PLATE;
        else if (b.tiles[i] === TILE.WALL || b.tiles[i] === TILE.DOOR) {
          if (y === 14 && (x === A.x - 1 || x === A.x + A.w)) { b.tiles[i] = TILE.PLATE; delete b.doors[i]; }
          else b.tiles[i] = TILE.VOID;
        }
      }
    }
    for (const i of roomCells(b, A)) if (chance(rng, 0.05) && Math.abs((i % b.w) - (A.x + 10)) > 1) { b.tiles[i] = TILE.VOID; b.gaps.add(i); }
    for (const x of [19, 20, 44]) b.tiles[14 * b.w + x] = TILE.PLATE;
  }
  const startR = b.rooms[start];
  const anteR = b.rooms[ante];
  const arenaR = b.rooms[arena];
  const exitR = b.rooms[exit];
  placeProp(b, startR, 'entry', {}, { wall: true, block: true });
  placeProp(b, anteR, 'o2station', { charges: 1 });
  placeProp(b, anteR, 'powernode', { charges: 1 });
  placeProp(b, anteR, 'bed');
  placeProp(b, exitR, 'exit', {}, { center: true, block: true });
  // pilares simétricos
  const cx = arenaR.x + 10; const cy = arenaR.y + 10;
  const pillarSpots = [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -8], [0, 8]];
  for (const [dx, dy] of pillarSpots) {
    const i = (cy + dy) * b.w + cx + dx;
    if (b.tiles[i] === TILE.FLOOR) { b.tiles[i] = z.id === 2 ? TILE.PLANTS : TILE.PILLAR; if (z.id !== 2) b.blocked[i] = 1; }
  }
  for (const [dx, dy] of [[-3, -3], [3, 3], [-3, 3], [3, -3]]) {
    const i = (cy + dy) * b.w + cx + dx;
    if (b.tiles[i] === TILE.FLOOR && chance(rng, 0.7)) { b.tiles[i] = TILE.COVER; b.blocked[i] = 1; }
  }
  // terminales de mecánica en las esquinas de la arena
  const corners = [[arenaR.x, arenaR.y], [arenaR.x + arenaR.w - 1, arenaR.y], [arenaR.x, arenaR.y + arenaR.h - 1], [arenaR.x + arenaR.w - 1, arenaR.y + arenaR.h - 1]];
  for (const [x, y] of corners) addProp(b, 'terminal', y * b.w + x, { hack: Math.min(5, z.id), label: 'boss' });
  // ventanas en el muro superior (mecánica de vacío)
  if (!b.exterior) {
    for (let x = arenaR.x + 4; x < arenaR.x + arenaR.w - 4; x += 4) {
      const i = (arenaR.y - 1) * b.w + x;
      if (b.tiles[i] === TILE.WALL) b.tiles[i] = TILE.WINDOW;
    }
  }
  if (z.id === 1) {
    for (const [dx, dy] of [[-8, -3], [-8, 3], [8, -3], [8, 3], [-4, -9], [4, 9]]) {
      const i = (cy + dy) * b.w + cx + dx;
      if (b.tiles[i] === TILE.FLOOR && !b.blocked[i]) addProp(b, 'cryopod', i, { variant: 1 });
    }
  }
  return b;
}

// ------------------------------------------------------------------ finalización

function finalize(b: Builder, opts: GenOptions, attempt: number): FloorMap {
  const { w, h } = b;
  // secciones por relleno
  const sec = new Array<number>(w * h).fill(-1);
  const sections: Section[] = [];
  const isSecCell = (i: number): boolean => {
    const t = b.tiles[i];
    return t === TILE.FLOOR || t === TILE.GRATE || t === TILE.PLANTS || t === TILE.RUBBLE || t === TILE.PLATE ||
      t === TILE.COVER || t === TILE.PILLAR || (b.gaps.has(i));
  };
  for (let i = 0; i < w * h; i++) {
    if (sec[i] >= 0 || !isSecCell(i)) continue;
    const id = sections.length;
    const exteriorSec = b.tiles[i] === TILE.PLATE || b.gaps.has(i);
    const q = [i];
    sec[i] = id;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % w; const y = (c - x) / w;
      for (const d of CARDINALS) {
        const nx = x + d.x; const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (sec[ni] >= 0 || !isSecCell(ni)) continue;
        const nExt = b.tiles[ni] === TILE.PLATE || b.gaps.has(ni);
        if (nExt !== exteriorSec) continue;
        sec[ni] = id;
        q.push(ni);
      }
    }
    sections.push({
      id, pressure: exteriorSec ? 0 : 100, radiation: 0, coolant: false, dark: false,
      lifeSupport: !exteriorSec, vent: exteriorSec ? 99999 : 0, size: q.length, ventedByPlayer: false,
    });
  }
  const rooms: Room[] = b.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, kind: r.kind }));
  const roomSec = (r: Room): number => sec[(r.y + Math.floor(r.h / 2)) * w + r.x + Math.floor(r.w / 2)];
  // estado ambiental por sala
  const z = b.z;
  for (const r of rooms) {
    const s = roomSec(r);
    if (s < 0) continue;
    const S = sections[s];
    if (r.kind === 'start' || r.kind === 'boss' || r.kind === 'ante' || r.kind === 'exit') continue;
    if (opts.tutorial) continue;
    if (chance(b.rng, z.darkChance)) S.dark = true;
    if (chance(b.rng, z.radiationChance)) S.radiation = int(b.rng, 1, 2);
    if (chance(b.rng, z.coolantChance)) S.coolant = true;
  }
  // brechas: secciones a 0
  for (let i = 0; i < w * h; i++) {
    if (b.tiles[i] !== TILE.BREACH) continue;
    const x = i % w; const y = (i - x) / w;
    for (const d of CARDINALS) {
      const s = sec[(y + d.y) * w + x + d.x];
      if (s >= 0) sections[s].pressure = 0;
    }
  }
  // llaves y bloqueos (no en pisos de jefe)
  const props = b.props;
  if (opts.floor !== 4) assignLocks(b, rooms, sec, opts);
  // luces de emergencia en secciones oscuras
  for (const r of rooms) {
    const s = roomSec(r);
    if (s >= 0 && sections[s].dark && chance(b.rng, 0.6)) placeProp(b, b.rooms[r.id], 'emlight', {}, { wall: true, block: false });
  }
  // esporas iniciales
  const gas = new Array<number>(w * h).fill(0);
  if (z.sporeChance > 0 && !opts.tutorial) {
    for (const r of rooms) {
      if (r.kind !== 'normal' || !chance(b.rng, z.sporeChance)) continue;
      for (const i of roomCells(b, r)) if (passGen(b, i)) gas[i] = int(b.rng, 3, 6);
    }
  }
  const startRoom = rooms.find((r) => r.kind === 'start')!;
  const exitRoom = rooms.find((r) => r.kind === 'exit')!;
  const entryProp = props.find((p) => p.kind === 'entry');
  const exitProp = props.find((p) => p.kind === 'exit');
  // posición de entrada = casilla libre adyacente al ascensor
  const adjFree = (p: Prop | undefined, r: Room): { x: number; y: number } => {
    if (p) {
      for (const d of DIRS) {
        const i = (p.y + d.y) * w + p.x + d.x;
        if (passGen(b, i) && !b.blocked[i] && b.tiles[i] !== TILE.DOOR && !props.some((q) => q.x === p.x + d.x && q.y === p.y + d.y)) return { x: p.x + d.x, y: p.y + d.y };
      }
    }
    return rectCenter(r);
  };
  for (const p of props) p.sec = sec[p.y * w + p.x];
  return {
    w, h, zone: opts.zone, floor: opts.floor, boss: opts.floor === 4,
    tiles: b.tiles.slice(), sec, sections, rooms, doors: b.doors, props,
    seen: new Array(w * h).fill(0), fire: new Array(w * h).fill(0), gas,
    entry: adjFree(entryProp, startRoom),
    exit: exitProp ? { x: exitProp.x, y: exitProp.y } : rectCenter(exitRoom),
    event: null, eventTurn: 0, genSeed: opts.seed, attempts: attempt + 1,
    exteriorExit: (() => { const hp = props.find((p) => p.kind === 'hullExit'); return hp ? { x: hp.x, y: hp.y } : undefined; })(),
  };
}

function assignLocks(b: Builder, rooms: Room[], _sec: number[], opts: GenOptions): void {
  const { rng } = b;
  const exitR = b.rooms.find((r) => r.kind === 'exit')!;
  const startR = b.rooms.find((r) => r.kind === 'start')!;
  for (const di of exitR.doors) b.doors[di].lock = 'amber';
  // bóveda cian
  let vault: Builder['rooms'][number] | undefined;
  if (b.z.id >= 2 && !opts.tutorial && chance(rng, 0.5)) {
    const leafs = b.rooms.filter((r) => r.kind === 'normal' && r.doors.length === 1 && !r.doors.some((d) => exitR.doors.includes(d)));
    if (leafs.length) {
      vault = pick(rng, leafs);
      vault.kind = 'vault';
      rooms[vault.id].kind = 'vault';
      for (const di of vault.doors) b.doors[di].lock = 'cyan';
    }
  }
  const sc = rectCenter(startR);
  const locked = (i: number): boolean => b.doors[i]?.lock === 'amber' || b.doors[i]?.lock === 'cyan';
  const dist = bfsFrom(b, sc.y * b.w + sc.x, locked);
  const reachable = b.rooms.filter((r) => {
    const c = rectCenter(r);
    return r.kind !== 'exit' && r.kind !== 'vault' && r.kind !== 'secret' && dist[c.y * b.w + c.x] >= 0;
  });
  const farthest = (list: typeof reachable): Builder['rooms'][number] => {
    const sorted = list.slice().sort((p, q) => {
      const cp = rectCenter(p); const cq = rectCenter(q);
      return dist[cq.y * b.w + cq.x] - dist[cp.y * b.w + cp.x];
    });
    const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
    return opts.tutorial ? sorted[Math.min(1, sorted.length - 1)] : pick(rng, top);
  };
  const keyRoomCands = reachable.filter((r) => r.kind !== 'start') .length ? reachable.filter((r) => r.kind !== 'start') : reachable;
  if (vault) {
    const cyanRoom = farthest(keyRoomCands);
    placeProp(b, cyanRoom, 'keycard', { key: 'cyan' }, { block: false });
    if (chance(rng, 0.35)) {
      placeProp(b, vault, 'keycard', { key: 'amber' }, { block: false });
    } else {
      placeProp(b, farthest(keyRoomCands), 'keycard', { key: 'amber' }, { block: false });
    }
    placeProp(b, vault, 'container', { variant: 2, loot: [] });
  } else {
    placeProp(b, farthest(keyRoomCands), 'keycard', { key: 'amber' }, { block: false });
  }
  // puertas de circuito
  if (!opts.tutorial) {
    const cands = Object.keys(b.doors).map(Number).filter((i) => b.doors[i].lock === null);
    shuffle(rng, cands);
    const nC = int(rng, 0, 2 + (b.z.id >= 3 ? 1 : 0));
    for (let k = 0; k < nC && k < cands.length; k++) b.doors[cands[k]].lock = 'circuit';
  }
  // puertas abiertas al azar
  for (const i of Object.keys(b.doors).map(Number)) {
    if (b.doors[i].lock === null && chance(rng, 0.3)) b.doors[i].open = true;
  }
}

// ------------------------------------------------------------------ validador

export interface ValidationResult { ok: boolean; reason?: string }

/**
 * Comprueba que el piso es completable: salida alcanzable con recogida iterativa de llaves,
 * puertas de circuito con fuente de energía previa, tramos de vacío sobrevivibles.
 */
export function validateFloor(m: FloorMap): ValidationResult {
  const { w, h } = m;
  if (m.rooms.length < 4) return { ok: false, reason: 'pocas salas' };
  const startI = m.entry.y * w + m.entry.x;
  const isGap = (i: number): boolean => m.zone === 6 && m.tiles[i] === TILE.VOID && m.sec[i] >= 0;
  const blockingProp = new Set<number>();
  for (const p of m.props) {
    if (['terminal', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'cryopod', 'barrel', 'entry', 'exit', 'airlockPanel', 'container', 'bed', 'hullExit', 'npc', 'core', 'radio'].includes(p.kind) ||
      (p.kind === 'decor' && p.label && DECOR_BLOCK.has(p.label))) blockingProp.add(p.y * w + p.x);
  }
  const walk = (i: number): boolean => {
    const t = m.tiles[i];
    if (blockingProp.has(i)) return false;
    return t === TILE.FLOOR || t === TILE.GRATE || t === TILE.PLANTS || t === TILE.PLATE || t === TILE.RUBBLE || t === TILE.DOOR || isGap(i);
  };
  if (!walk(startI)) return { ok: false, reason: 'entrada bloqueada' };
  const keys = new Set<string>();
  let power = false;
  const keyProps = m.props.filter((p) => p.kind === 'keycard');
  const powerProps = m.props.filter((p) => p.kind === 'powernode');
  const exitP = m.props.find((p) => p.kind === 'exit');
  if (!exitP) return { ok: false, reason: 'sin salida' };
  const adjReach = (dist: Int32Array, x: number, y: number): boolean => {
    for (const d of DIRS) {
      const nx = x + d.x; const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (dist[ny * w + nx] >= 0) return true;
    }
    return false;
  };
  let dist = new Int32Array(0);
  for (let iter = 0; iter < 8; iter++) {
    dist = new Int32Array(w * h).fill(-1);
    const q = [startI];
    dist[startI] = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % w; const y = (i - x) / w;
      for (const d of CARDINALS) {
        const nx = x + d.x; const ny = y + d.y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (dist[ni] >= 0 || !walk(ni)) continue;
        if (m.tiles[ni] === TILE.DOOR) {
          const door = m.doors[ni];
          if (door && door.lock) {
            if (door.lock === 'circuit' && !power) continue;
            if ((door.lock === 'amber' || door.lock === 'cyan' || door.lock === 'violet') && !keys.has(door.lock)) continue;
          }
        }
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
    let changed = false;
    for (const kp of keyProps) if (!keys.has(kp.key!) && dist[kp.y * w + kp.x] >= 0) { keys.add(kp.key!); changed = true; }
    if (!power && powerProps.some((p) => adjReach(dist, p.x, p.y))) { power = true; changed = true; }
    if (!changed) break;
  }
  // los jefes abren su puerta al morir: se supone abierta para validar
  if (m.boss) {
    const arenaR = m.rooms.find((r) => r.kind === 'boss');
    if (!arenaR) return { ok: false, reason: 'sin arena' };
    const c = { x: arenaR.x + Math.floor(arenaR.w / 2), y: arenaR.y + Math.floor(arenaR.h / 2) };
    if (dist[c.y * w + c.x] < 0) return { ok: false, reason: 'arena inalcanzable' };
    return { ok: true };
  }
  if (!adjReach(dist, exitP.x, exitP.y)) return { ok: false, reason: 'salida inalcanzable' };
  // cada llave alcanzable antes que su puerta: implícito en la iteración; comprobar que las llaves usadas existen
  for (const di of Object.keys(m.doors).map(Number)) {
    const d = m.doors[di];
    if ((d.lock === 'amber' || d.lock === 'cyan') && !keyProps.some((k) => k.key === d.lock)) return { ok: false, reason: `falta llave ${d.lock}` };
  }
  // tramo de vacío obligatorio
  const vacuumCost = (x: number, y: number): number => {
    const i = y * w + x;
    if (!walk(i)) return -1;
    const s = m.sec[i];
    const vac = s >= 0 ? m.sections[s].pressure < 30 && m.zone !== 6 : false;
    return vac ? 1 : 0;
  };
  // ruta de mínimo vacío desde el inicio hasta la salida
  const vd = distanceMap(w, h, [m.entry], (x, y) => {
    const c = vacuumCost(x, y);
    return c < 0 ? -1 : c * 10 + 1;
  }, Infinity, false);
  let bestExit = UNREACHABLE;
  for (const d of DIRS) {
    const nx = exitP.x + d.x; const ny = exitP.y + d.y;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) bestExit = Math.min(bestExit, vd[ny * w + nx]);
  }
  const vacuumSteps = Math.floor(bestExit / 11);
  if (bestExit < UNREACHABLE && vacuumSteps > 12 && !m.props.some((p) => p.kind === 'o2station')) return { ok: false, reason: 'demasiado vacío' };
  if (!m.props.some((p) => p.kind === 'o2station') && m.zone >= 3) return { ok: false, reason: 'sin O2' };
  return { ok: true };
}

const DECOR_BLOCK = new Set([
  'bed', 'table', 'locker', 'shelf', 'cryopod_off', 'planter', 'hydro_tank', 'generator', 'crate',
  'toolrack', 'tank', 'console', 'tank_lab', 'gurney', 'monitor', 'map_table', 'server', 'antenna', 'valve',
]);

export const _internal = { buildNormal, buildBoss };
