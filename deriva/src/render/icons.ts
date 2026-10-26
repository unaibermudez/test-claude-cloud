/**
 * Iconos de objetos (16×16) dibujados por código a partir de mapas de materiales (`iconart.ts`)
 * y pintados con luz (`paint`). Se usan en el mundo (objetos en el suelo) y en la interfaz DOM
 * (como data URL, a escala entera). Los implantes reciben marcas propias según su id.
 */
import { Grid, paint, shadeHex, mixHex, hashStr } from './pixel';
import { ICON_ART, MATERIALS } from './iconart';
import { itemDef, hasItemDef, INJECTOR_COLORS } from '../data/items';

export const ICON_SIZE = 16;

const FIXED: Record<string, string> = {
  S: '#aab4c0', D: '#4c5462', G: '#3a302b', W: '#8d5b34', H: '#e9edf2', R: '#d8434a', Q: '#8fd8f0',
  A: '#d6a54c', N: '#262a33', P: '#e8dcc0', Y: '#f2c94c', O: '#ef8a3a', g: '#5cbf6a', c: '#7af0ff', r: '#ff5050',
};
const EMISSIVE = new Set(['L', 'c', 'r']);
const SHINY = new Set(['S', 'D', 'Q', 'A']);

/** Convierte un mapa de caracteres en rejilla centrada (valor = índice del material + 1). */
export function artGrid(art: string[], size = ICON_SIZE): Grid {
  const g = new Grid(size, size);
  const h = art.length;
  const w = Math.max(...art.map((r) => r.length));
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = MATERIALS.indexOf(row[x]);
      if (k >= 0) g.set(ox + x, oy + y, k + 1);
    }
  });
  return g;
}

/** Marcas de luz propias de cada implante, para distinguir los de la misma ranura. */
function implantMarks(g: Grid, itemId: string): void {
  const body = 1;
  const glow = MATERIALS.indexOf('L') + 1;
  const cells: number[] = [];
  for (let i = 0; i < g.d.length; i++) if (g.d[i] === body) cells.push(i);
  if (!cells.length) return;
  const h = hashStr(itemId);
  const n = 1 + (h % 3);
  for (let k = 0; k < n; k++) g.d[cells[(h >>> (k * 7)) % cells.length]] = glow;
}

const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

/** Color efectivo: los inyectores desconocidos usan su apariencia de la partida. */
export function iconCanvas(itemId: string, appear?: number, unknown = false): HTMLCanvasElement {
  const key = `${itemId}:${appear ?? -1}:${unknown ? 1 : 0}`;
  const c = cache.get(key);
  if (c) return c;
  const d = hasItemDef(itemId) ? itemDef(itemId) : null;
  const icon = d?.icon ?? 'parts';
  let color = d?.color ?? '#999999';
  if (d?.unknown === 'injector' && appear !== undefined) color = INJECTOR_COLORS[appear % INJECTOR_COLORS.length];
  if (d?.unknown === 'module' && unknown) color = '#8a8f99';
  const g = artGrid(ICON_ART[icon] ?? ICON_ART.parts);
  if (d?.type === 'implant' && !unknown) implantMarks(g, itemId);
  const mat = (v: number): string => MATERIALS[v - 1] ?? 'B';
  const out = paint(g, {
    color: (v) => {
      const m = mat(v);
      if (m === 'B') return color;
      if (m === 'b') return shadeHex(color, -0.35);
      if (m === 'L') return unknown ? '#ffffff' : mixHex(color, '#ffffff', 0.45);
      return FIXED[m] ?? color;
    },
    emissive: (v) => EMISSIVE.has(mat(v)),
    shiny: (v) => SHINY.has(mat(v)),
  });
  cache.set(key, out);
  return out;
}

export function iconURL(itemId: string, appear?: number, unknown = false): string {
  const key = `${itemId}:${appear ?? -1}:${unknown ? 1 : 0}`;
  let u = urlCache.get(key);
  if (!u) {
    u = iconCanvas(itemId, appear, unknown).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

export const ICON_NAMES = Object.keys(ICON_ART);
