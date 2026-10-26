/**
 * Pintado de casillas por zona: suelos, paredes con cara frontal, puertas, ventanas, brechas…
 * Todo se dibuja con rectángulos sobre la capa estática del piso (16 px por casilla).
 */
import { TILE, type FloorMap, type DoorState } from '../core/state';
import type { ZonePalette } from '../core/content';
import { shadeHex, mixHex, vrand } from './pixel';

export const TS = 16;

const LOCK_SETS: Record<string, Record<string, string>> = {
  none: { amber: '#ffb347', cyan: '#5fe3ff', violet: '#c48cff', circuit: '#7dff9a', boss: '#ff4b4b' },
  // paletas de alto contraste por luminancia para daltonismo
  deuter: { amber: '#ffd000', cyan: '#4aa0ff', violet: '#ffffff', circuit: '#00e0ff', boss: '#ff6a00' },
  protan: { amber: '#ffd000', cyan: '#4aa0ff', violet: '#ffffff', circuit: '#00e0ff', boss: '#ff6a00' },
  tritan: { amber: '#ff6a9a', cyan: '#00d0b0', violet: '#ffffff', circuit: '#a0ff00', boss: '#ff2020' },
};
let LOCK_COLORS = LOCK_SETS.none;
export function setLockPalette(mode: string): void {
  LOCK_COLORS = LOCK_SETS[mode] ?? LOCK_SETS.none;
}
export function lockColor(k: string | null | undefined): string {
  return k ? LOCK_COLORS[k] ?? '#ffffff' : '#9aa3ad';
}

function isWallish(t: number): boolean {
  return t === TILE.WALL || t === TILE.CRACKED || t === TILE.WINDOW || t === TILE.AIRLOCK || t === TILE.BREACH;
}

function cellRand(x: number, y: number, salt = 0): () => number {
  return vrand((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791));
}

/** Ruido de valor suave en coordenadas de píxel del mundo (no alineado con las casillas). */
function hash2(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothNoise(wx: number, wy: number, cell: number, salt: number): number {
  const gx = wx / cell; const gy = wy / cell;
  const x0 = Math.floor(gx); const y0 = Math.floor(gy);
  const fx = gx - x0; const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, salt); const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt); const d = hash2(x0 + 1, y0 + 1, salt);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/** Suelo continuo: textura por bloques de 4 px con ruido suave y juntas cada varios metros. */
function drawFloor(c: CanvasRenderingContext2D, px: number, py: number, pal: ZonePalette, zone: number, x: number, y: number): void {
  const [base, alt, dark] = pal.floor;
  for (let by = 0; by < TS; by += 4) {
    for (let bx = 0; bx < TS; bx += 4) {
      const wx = px + bx; const wy = py + by;
      const n = smoothNoise(wx, wy, 40, zone) * 0.7 + smoothNoise(wx, wy, 11, zone + 9) * 0.3;
      c.fillStyle = n < 0.33 ? mixHex(base, dark, 0.35) : n < 0.66 ? base : mixHex(base, alt, 0.6);
      c.fillRect(wx, wy, 4, 4);
    }
  }
  // juntas en coordenadas del mundo (no coinciden con las casillas)
  const seam = (period: number, off: number, horiz: boolean, col: string): void => {
    c.fillStyle = col;
    for (let k = 0; k < TS; k++) {
      const w = (horiz ? py : px) + k;
      if ((w + off) % period === 0) {
        if (horiz) c.fillRect(px, py + k, TS, 1); else c.fillRect(px + k, py, 1, TS);
      }
    }
  };
  if (zone === 1 || zone === 4) {
    // losas grandes y escalonadas, con juntas apenas marcadas
    const row = Math.floor((py + 5) / 34);
    seam(34, 5, true, mixHex(base, dark, 0.7));
    c.fillStyle = mixHex(base, dark, 0.7);
    for (let k = 0; k < TS; k++) if ((px + k + row * 27) % 54 === 0) c.fillRect(px + k, py, 1, TS);
  } else if (zone === 2) {
    for (let by = 0; by < TS; by += 2) for (let bx = 0; bx < TS; bx += 2) {
      const n = smoothNoise(px + bx, py + by, 18, 77);
      if (n > 0.62) { c.fillStyle = n > 0.75 ? shadeHex(pal.accent, -0.55) : shadeHex(pal.accent, -0.7); c.fillRect(px + bx, py + by, 2, 2); }
    }
  } else if (zone === 3) {
    c.fillStyle = shadeHex(base, 0.12);
    for (let by = 0; by < TS; by++) for (let bx = 0; bx < TS; bx++) if ((px + bx + (py + by) * 3) % 7 === 0 && (py + by) % 3 === 0) c.fillRect(px + bx, py + by, 1, 1);
    seam(53, 5, false, mixHex(base, dark, 0.75));
  } else if (zone === 5) {
    seam(46, 7, true, mixHex(base, alt, 0.5));
    seam(46, 30, true, mixHex(base, dark, 0.6));
  } else {
    seam(36, 2, true, mixHex(base, dark, 0.8));
    seam(52, 9, false, mixHex(base, dark, 0.8));
    c.fillStyle = shadeHex(alt, 0.25);
    for (let by = 0; by < TS; by++) for (let bx = 0; bx < TS; bx++) {
      const wx = px + bx; const wy = py + by;
      if ((wx + 9) % 40 === 4 && (wy + 2) % 28 === 4) c.fillRect(wx, wy, 1, 1);
    }
  }
  // manchas sueltas
  const r = cellRand(x, y, zone);
  if (r() < 0.25) {
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fillRect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 2 + Math.floor(r() * 4), 1 + Math.floor(r() * 2));
  }
}

interface WallNb { up: boolean; down: boolean; left: boolean; right: boolean }

/** Pared continua: el brillo y la sombra solo aparecen en los bordes reales del muro. */
function drawWall(c: CanvasRenderingContext2D, px: number, py: number, pal: ZonePalette, face: boolean, x: number, y: number, nb: WallNb = { up: true, down: true, left: true, right: true }): void {
  const [base, light, dark] = pal.wall;
  const topH = face ? 9 : TS;
  for (let by = 0; by < topH; by += 4) {
    for (let bx = 0; bx < TS; bx += 4) {
      const n = smoothNoise(px + bx, py + by, 30, 31);
      c.fillStyle = n < 0.4 ? shadeHex(base, -0.06) : n > 0.7 ? shadeHex(base, 0.04) : base;
      c.fillRect(px + bx, py + by, 4, Math.min(4, topH - by));
    }
  }
  // juntas de los paneles del techo del muro, en coordenadas del mundo
  c.fillStyle = shadeHex(base, -0.14);
  for (let k = 0; k < TS; k++) if ((px + k) % 29 === 0) c.fillRect(px + k, py, 1, topH);
  if (!nb.up) { c.fillStyle = light; c.fillRect(px, py, TS, 1); }
  if (!nb.left) { c.fillStyle = shadeHex(light, -0.1); c.fillRect(px, py, 1, topH); }
  if (!nb.right) { c.fillStyle = dark; c.fillRect(px + TS - 1, py, 1, topH); }
  if (face) {
    // cara frontal continua
    c.fillStyle = shadeHex(base, -0.25);
    c.fillRect(px, py + 9, TS, 7);
    c.fillStyle = shadeHex(light, -0.1);
    c.fillRect(px, py + 9, TS, 1);
    c.fillStyle = shadeHex(base, -0.45);
    c.fillRect(px, py + 15, TS, 1);
    for (let k = 0; k < TS; k++) if ((px + k) % 23 === 0) c.fillRect(px + k, py + 10, 1, 5);
    const r = cellRand(x, y, 7);
    if (r() < 0.2) {
      c.fillStyle = pal.accent;
      c.fillRect(px + 3 + Math.floor(r() * 9), py + 12, 2, 1);
    }
  } else if (!nb.down) {
    c.fillStyle = dark;
    c.fillRect(px, py + TS - 1, TS, 1);
  }
}

/** Sombra suave del muro sobre el suelo (oclusión ambiental). */
function wallShadow(c: CanvasRenderingContext2D, px: number, py: number, nb: WallNb): void {
  if (nb.up) { const g = c.createLinearGradient(px, py, px, py + 6); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, TS, 6); }
  if (nb.left) { const g = c.createLinearGradient(px, py, px + 5, py); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, 5, TS); }
  if (nb.right) { const g = c.createLinearGradient(px + TS, py, px + TS - 5, py); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px + TS - 5, py, 5, TS); }
}

function drawVoid(c: CanvasRenderingContext2D, px: number, py: number, x: number, y: number, exterior: boolean): void {
  c.fillStyle = '#020306';
  c.fillRect(px, py, TS, TS);
  if (!exterior) return;
  const r = cellRand(x, y, 99);
  for (let i = 0; i < 2; i++) {
    if (r() < 0.45) {
      const b = 120 + Math.floor(r() * 135);
      c.fillStyle = `rgb(${b},${b},${Math.min(255, b + 30)})`;
      c.fillRect(px + Math.floor(r() * 16), py + Math.floor(r() * 16), 1, 1);
    }
  }
}

export function drawDoor(c: CanvasRenderingContext2D, px: number, py: number, pal: ZonePalette, d: DoorState | undefined, horiz: boolean): void {
  const open = d?.open || d?.broken;
  const col = lockColor(d?.lock ?? null);
  c.fillStyle = shadeHex(pal.wall[2], -0.2);
  c.fillRect(px, py, TS, TS);
  if (horiz) {
    // puerta en pared horizontal: hojas se separan en X
    if (open) {
      c.fillStyle = pal.wall[0];
      c.fillRect(px, py + 4, 3, 9); c.fillRect(px + 13, py + 4, 3, 9);
      c.fillStyle = shadeHex(pal.floor[0], -0.1);
      c.fillRect(px + 3, py, 10, TS);
    } else {
      c.fillStyle = shadeHex(pal.wall[0], 0.08);
      c.fillRect(px + 1, py + 3, 14, 11);
      c.fillStyle = shadeHex(pal.wall[0], -0.3);
      c.fillRect(px + 7, py + 3, 2, 11);
      c.fillStyle = col;
      c.fillRect(px + 5, py + 7, 1, 3); c.fillRect(px + 10, py + 7, 1, 3);
    }
  } else if (open) {
    c.fillStyle = pal.wall[0];
    c.fillRect(px + 4, py, 8, 3); c.fillRect(px + 4, py + 13, 8, 3);
    c.fillStyle = shadeHex(pal.floor[0], -0.1);
    c.fillRect(px, py + 3, TS, 10);
  } else {
    c.fillStyle = shadeHex(pal.wall[0], 0.08);
    c.fillRect(px + 4, py + 1, 8, 14);
    c.fillStyle = shadeHex(pal.wall[0], -0.3);
    c.fillRect(px + 4, py + 7, 8, 2);
    c.fillStyle = col;
    c.fillRect(px + 7, py + 4, 2, 1); c.fillRect(px + 7, py + 11, 2, 1);
  }
  if (d?.sealed) {
    c.fillStyle = '#e8e2c8';
    c.fillRect(px + 1, py + 1, 14, 2); c.fillRect(px + 1, py + 13, 14, 2);
    c.fillStyle = '#b9b29a';
    for (let i = 2; i < 14; i += 3) c.fillRect(px + i, py + 1, 1, 2);
  }
  if (d?.broken) {
    c.fillStyle = '#ff7a3c';
    c.fillRect(px + 2, py + 2, 2, 1); c.fillRect(px + 12, py + 13, 2, 1);
  }
}

/** Dibuja una casilla en la capa estática. */
export function drawTile(c: CanvasRenderingContext2D, m: FloorMap, x: number, y: number, pal: ZonePalette): void {
  const px = x * TS; const py = y * TS;
  const i = y * m.w + x;
  const t = m.tiles[i];
  const below = y + 1 < m.h ? m.tiles[i + m.w] : TILE.VOID;
  const face = !isWallish(below) && below !== TILE.VOID;
  const W = (xx: number, yy: number): boolean => xx < 0 || yy < 0 || xx >= m.w || yy >= m.h || isWallish(m.tiles[yy * m.w + xx]) || m.tiles[yy * m.w + xx] === TILE.VOID;
  const nb: WallNb = { up: W(x, y - 1), down: W(x, y + 1), left: W(x - 1, y), right: W(x + 1, y) };
  const solid = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && isWallish(m.tiles[yy * m.w + xx]);
  const shadowNb: WallNb = { up: solid(x, y - 1), down: false, left: solid(x - 1, y), right: solid(x + 1, y) };
  const ext = m.zone === 6;
  switch (t) {
    case TILE.VOID:
      drawVoid(c, px, py, x, y, true);
      return;
    case TILE.WALL:
      drawWall(c, px, py, pal, face, x, y, nb);
      return;
    case TILE.CRACKED:
      drawWall(c, px, py, pal, face, x, y, nb);
      c.fillStyle = shadeHex(pal.wall[2], -0.4);
      c.fillRect(px + 5, py + 2, 1, 4); c.fillRect(px + 6, py + 5, 1, 3); c.fillRect(px + 7, py + 8, 2, 1); c.fillRect(px + 9, py + 9, 1, 3);
      return;
    case TILE.WINDOW: {
      drawWall(c, px, py, pal, face, x, y, nb);
      c.fillStyle = '#0b1830';
      c.fillRect(px + 2, py + 2, 12, face ? 12 : 12);
      const r = cellRand(x, y, 3);
      for (let k = 0; k < 3; k++) {
        c.fillStyle = r() < 0.5 ? '#c9d6ff' : '#7f93c9';
        c.fillRect(px + 3 + Math.floor(r() * 10), py + 3 + Math.floor(r() * 10), 1, 1);
      }
      c.fillStyle = 'rgba(160,200,255,0.25)';
      c.fillRect(px + 3, py + 3, 4, 1);
      c.fillStyle = pal.wall[1];
      c.fillRect(px + 7, py + 2, 1, 12);
      return;
    }
    case TILE.BREACH: {
      drawVoid(c, px, py, x, y, true);
      c.fillStyle = pal.wall[2];
      c.fillRect(px, py, 3, TS); c.fillRect(px + 13, py, 3, TS); c.fillRect(px, py, TS, 3); c.fillRect(px, py + 13, TS, 3);
      c.fillStyle = '#ff9d40';
      c.fillRect(px + 3, py + 3, 1, 2); c.fillRect(px + 12, py + 10, 1, 2); c.fillRect(px + 8, py + 3, 2, 1);
      return;
    }
    case TILE.AIRLOCK:
      drawWall(c, px, py, pal, face, x, y, nb);
      c.fillStyle = '#2a2f38';
      c.fillRect(px + 2, py + 2, 12, 12);
      c.fillStyle = '#ffb347';
      for (let k = 0; k < 12; k += 4) { c.fillRect(px + 2 + k, py + 2, 2, 2); c.fillRect(px + 4 + k, py + 12, 2, 2); }
      c.fillStyle = '#5a616e';
      c.fillRect(px + 7, py + 4, 2, 8);
      return;
    case TILE.DOOR: {
      const left = x > 0 ? m.tiles[i - 1] : TILE.WALL;
      const right = x + 1 < m.w ? m.tiles[i + 1] : TILE.WALL;
      const horiz = isWallish(left) || isWallish(right);
      drawDoor(c, px, py, pal, m.doors[i], horiz);
      return;
    }
    case TILE.PLATE:
      drawVoid(c, px, py, x, y, ext);
      c.fillStyle = shadeHex(pal.floor[1], -0.05);
      c.fillRect(px + 1, py + 1, 14, 14);
      c.fillStyle = shadeHex(pal.floor[1], 0.15);
      c.fillRect(px + 1, py + 1, 14, 1);
      c.fillStyle = '#ffb347';
      c.fillRect(px + 1, py + 14, 3, 1); c.fillRect(px + 7, py + 14, 3, 1); c.fillRect(px + 13, py + 14, 2, 1);
      return;
    case TILE.GIRDER:
      drawVoid(c, px, py, x, y, true);
      c.fillStyle = '#5b5f68';
      c.fillRect(px, py + 6, TS, 4);
      c.fillStyle = '#7b808b';
      c.fillRect(px, py + 6, TS, 1);
      c.fillStyle = '#3a3d44';
      for (let k = 1; k < TS; k += 5) c.fillRect(px + k, py + 7, 2, 2);
      return;
    default:
      break;
  }
  // suelos y variantes caminables
  drawFloor(c, px, py, pal, m.zone, x, y);
  wallShadow(c, px, py, shadowNb);
  const r = cellRand(x, y, 11);
  switch (t) {
    case TILE.COVER:
      c.fillStyle = shadeHex(pal.wall[0], -0.1);
      c.fillRect(px + 2, py + 6, 12, 8);
      c.fillStyle = pal.wall[1];
      c.fillRect(px + 2, py + 6, 12, 2);
      c.fillStyle = '#ffb347';
      c.fillRect(px + 4, py + 10, 2, 2); c.fillRect(px + 10, py + 10, 2, 2);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(px + 2, py + 14, 12, 1);
      break;
    case TILE.PLANTS: {
      const g = m.zone === 2 ? pal.accent : '#6a9a4a';
      for (let k = 0; k < 7; k++) {
        const bx = px + 1 + Math.floor(r() * 13); const by = py + 4 + Math.floor(r() * 10);
        c.fillStyle = r() < 0.5 ? g : shadeHex(g, -0.35);
        c.fillRect(bx, by, 1, 3); c.fillRect(bx + 1, by - 1, 1, 2);
      }
      break;
    }
    case TILE.GRATE:
      c.fillStyle = '#0a0b0e';
      c.fillRect(px + 2, py + 2, 12, 12);
      c.fillStyle = shadeHex(pal.wall[1], -0.1);
      for (let k = 2; k < 14; k += 3) c.fillRect(px + k, py + 2, 1, 12);
      c.fillRect(px + 2, py + 2, 12, 1); c.fillRect(px + 2, py + 13, 12, 1);
      break;
    case TILE.PILLAR:
      c.fillStyle = pal.wall[2];
      c.fillRect(px + 3, py + 1, 10, 15);
      c.fillStyle = pal.wall[0];
      c.fillRect(px + 3, py + 1, 10, 11);
      c.fillStyle = pal.wall[1];
      c.fillRect(px + 3, py + 1, 2, 11);
      c.fillStyle = pal.accent;
      c.fillRect(px + 7, py + 5, 2, 1);
      break;
    case TILE.RUBBLE:
      for (let k = 0; k < 6; k++) {
        c.fillStyle = r() < 0.5 ? pal.wall[0] : pal.wall[2];
        c.fillRect(px + Math.floor(r() * 13), py + 3 + Math.floor(r() * 11), 2 + Math.floor(r() * 2), 2);
      }
      break;
    default:
      break;
  }
}

/** Coste de dibujar todo el piso: se hace una vez y luego solo se repintan casillas cambiadas. */
export function tileSignature(m: FloorMap, i: number): number {
  const d = m.doors[i];
  let s = m.tiles[i] * 16;
  if (d) s += (d.open ? 1 : 0) + (d.sealed ? 2 : 0) + (d.broken ? 4 : 0) + (d.lock ? 8 : 0);
  return s;
}
