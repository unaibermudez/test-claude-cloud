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

function drawFloor(c: CanvasRenderingContext2D, px: number, py: number, pal: ZonePalette, zone: number, x: number, y: number): void {
  const r = cellRand(x, y, zone);
  const [base, alt, dark] = pal.floor;
  c.fillStyle = (x + y) % 2 === 0 ? base : mixHex(base, alt, 0.35);
  c.fillRect(px, py, TS, TS);
  c.fillStyle = dark;
  if (zone === 1 || zone === 4) {
    // baldosas
    c.fillRect(px, py + TS - 1, TS, 1);
    c.fillRect(px + TS - 1, py, 1, TS);
    c.fillStyle = shadeHex(base, 0.08);
    c.fillRect(px, py, TS - 1, 1);
  } else if (zone === 2) {
    c.fillRect(px, py + TS - 1, TS, 1);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = r() < 0.5 ? shadeHex(pal.accent, -0.55) : shadeHex(pal.accent, -0.7);
      c.fillRect(px + Math.floor(r() * 15), py + Math.floor(r() * 15), 1, 1 + Math.floor(r() * 2));
    }
  } else if (zone === 3) {
    for (let i = 2; i < TS; i += 4) c.fillRect(px + 1, py + i, TS - 2, 1);
    c.fillStyle = shadeHex(base, 0.1);
    c.fillRect(px, py, 1, TS);
  } else if (zone === 5) {
    c.fillRect(px, py + 7, TS, 1);
    c.fillStyle = shadeHex(alt, 0.05);
    c.fillRect(px + 7, py, 1, TS);
  } else {
    // casco: planchas remachadas
    c.fillRect(px, py + TS - 1, TS, 1);
    c.fillRect(px + TS - 1, py, 1, TS);
    c.fillStyle = shadeHex(alt, 0.2);
    c.fillRect(px + 2, py + 2, 1, 1); c.fillRect(px + 13, py + 2, 1, 1);
    c.fillRect(px + 2, py + 13, 1, 1); c.fillRect(px + 13, py + 13, 1, 1);
  }
  // suciedad
  if (r() < 0.35) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
  }
}

function drawWall(c: CanvasRenderingContext2D, px: number, py: number, pal: ZonePalette, face: boolean, x: number, y: number): void {
  const [base, light, dark] = pal.wall;
  const r = cellRand(x, y, 7);
  c.fillStyle = dark;
  c.fillRect(px, py, TS, TS);
  c.fillStyle = base;
  c.fillRect(px, py, TS, face ? 9 : TS);
  c.fillStyle = light;
  c.fillRect(px, py, TS, 1);
  if (face) {
    // cara frontal con paneles
    c.fillStyle = shadeHex(base, -0.25);
    c.fillRect(px, py + 9, TS, 7);
    c.fillStyle = shadeHex(base, -0.45);
    c.fillRect(px, py + 15, TS, 1);
    c.fillRect(px + 7, py + 10, 1, 5);
    c.fillStyle = shadeHex(light, -0.1);
    c.fillRect(px, py + 9, TS, 1);
    if (r() < 0.25) {
      c.fillStyle = pal.accent;
      c.fillRect(px + 3 + Math.floor(r() * 9), py + 11, 2, 1);
    }
  } else if (r() < 0.2) {
    c.fillStyle = shadeHex(base, -0.12);
    c.fillRect(px + 2 + Math.floor(r() * 10), py + 3 + Math.floor(r() * 10), 3, 1);
  }
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
  const ext = m.zone === 6;
  switch (t) {
    case TILE.VOID:
      drawVoid(c, px, py, x, y, true);
      return;
    case TILE.WALL:
      drawWall(c, px, py, pal, face, x, y);
      return;
    case TILE.CRACKED:
      drawWall(c, px, py, pal, face, x, y);
      c.fillStyle = shadeHex(pal.wall[2], -0.4);
      c.fillRect(px + 5, py + 2, 1, 4); c.fillRect(px + 6, py + 5, 1, 3); c.fillRect(px + 7, py + 8, 2, 1); c.fillRect(px + 9, py + 9, 1, 3);
      return;
    case TILE.WINDOW: {
      drawWall(c, px, py, pal, face, x, y);
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
      drawWall(c, px, py, pal, face, x, y);
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
