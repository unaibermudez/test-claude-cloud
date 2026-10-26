/**
 * Iconos de objetos (12×12) dibujados por código. Se usan en el mundo (objetos en el suelo)
 * y en la interfaz DOM (como data URL). Cada forma se elige por el nombre de icono del objeto.
 */
import { Grid, shadeHex } from './pixel';
import { itemDef, hasItemDef, INJECTOR_COLORS } from '../data/items';

const B = 1; const A = 5; const E = 4;

type Shape = (g: Grid) => void;

const blade = (g: Grid, len: number): void => { g.line(3, 9, 3 + len, 9 - len, B); g.line(4, 9, 4 + len, 9 - len, B); };
const handle = (g: Grid): void => { g.line(1, 11, 3, 9, A); };
const gunBody = (g: Grid, barrel: number, thick = 2): void => {
  g.rect(2, 4, 4 + barrel, thick, B);
  g.rect(3, 4 + thick, 2, 4, A);
};

const SHAPES: Record<string, Shape> = {
  wrench: (g) => { g.line(2, 10, 8, 4, B); g.line(3, 10, 9, 4, B); g.rect(8, 2, 3, 2, B); g.rect(9, 4, 2, 1, B); },
  pipe: (g) => { g.line(2, 10, 9, 3, B); g.line(3, 10, 10, 3, B); g.rect(8, 2, 3, 2, A); },
  knife: (g) => { blade(g, 5); handle(g); },
  scalpel: (g) => { g.line(2, 10, 9, 3, B); g.set(10, 2, E); handle(g); },
  axe: (g) => { g.line(2, 11, 8, 3, A); g.rect(6, 1, 4, 4, B); g.set(10, 2, B); g.set(10, 3, B); },
  baton: (g) => { g.line(2, 10, 9, 3, B); g.line(3, 10, 10, 3, B); g.set(10, 2, E); g.set(9, 2, E); },
  machete: (g) => { blade(g, 6); g.line(5, 9, 10, 4, B); handle(g); },
  spear: (g) => { g.line(1, 11, 9, 3, A); g.rect(9, 1, 2, 3, B); g.set(11, 1, B); },
  shears: (g) => { g.line(2, 10, 9, 3, B); g.line(2, 3, 9, 10, B); g.ellipse(2.5, 10, 1.5, 1.5, A); g.ellipse(2.5, 3, 1.5, 1.5, A); },
  hammer: (g) => { g.line(2, 11, 7, 5, A); g.rect(5, 1, 6, 4, B); },
  glove: (g) => { g.rect(3, 4, 6, 6, B); g.rect(3, 2, 1, 2, B); g.rect(5, 2, 1, 2, B); g.rect(7, 2, 1, 2, B); g.rect(9, 5, 2, 2, B); g.set(6, 7, E); },
  cutter: (g) => { g.rect(2, 6, 6, 3, B); g.rect(8, 7, 3, 1, E); g.rect(3, 9, 2, 2, A); },
  saw: (g) => { g.ellipse(7, 5, 4, 4, B); g.ellipse(7, 5, 1.2, 1.2, A); g.line(1, 11, 4, 8, A); },
  dagger: (g) => { blade(g, 6); g.rect(2, 8, 3, 1, A); handle(g); },
  pistol: (g) => gunBody(g, 4),
  dartgun: (g) => { gunBody(g, 5, 1); g.set(11, 4, E); },
  nailgun: (g) => { gunBody(g, 3, 3); g.rect(5, 7, 3, 2, A); },
  flaregun: (g) => { gunBody(g, 3, 3); g.set(9, 5, E); },
  shotgun: (g) => { g.rect(1, 4, 10, 2, B); g.rect(1, 6, 3, 3, A); g.rect(6, 6, 2, 1, A); },
  harpoon: (g) => { g.rect(1, 5, 7, 2, B); g.line(8, 6, 11, 6, A); g.set(11, 5, A); g.set(11, 7, A); g.rect(2, 7, 2, 3, A); },
  rivet: (g) => { g.rect(1, 3, 9, 3, B); g.rect(2, 6, 3, 4, A); g.set(10, 4, E); },
  smg: (g) => { g.rect(1, 4, 10, 2, B); g.rect(4, 6, 2, 4, A); g.rect(7, 6, 1, 3, B); },
  arcgun: (g) => { g.rect(1, 4, 7, 3, B); g.line(8, 5, 11, 3, E); g.line(8, 5, 11, 7, E); g.rect(2, 7, 2, 3, A); },
  welder: (g) => { g.rect(2, 4, 6, 3, B); g.rect(8, 5, 2, 1, A); g.set(10, 5, E); g.rect(3, 7, 2, 3, A); },
  cryo: (g) => { g.rect(1, 4, 8, 3, B); g.ellipse(4, 3, 2, 1.4, E); g.rect(2, 7, 2, 3, A); },
  pulse: (g) => { g.rect(1, 4, 10, 3, B); g.rect(3, 5, 5, 1, E); g.rect(2, 7, 2, 3, A); },
  sonic: (g) => { g.rect(1, 4, 6, 3, B); g.ellipse(9, 5.5, 2, 3, A); g.rect(2, 7, 2, 3, A); },
  thermal: (g) => { g.rect(0, 4, 11, 3, B); g.rect(9, 3, 3, 5, A); g.set(11, 5, E); g.rect(2, 7, 2, 3, A); },
  lete: (g) => { g.rect(1, 4, 10, 2, B); g.ellipse(6, 7, 2, 1.5, E); g.rect(2, 6, 2, 4, A); },
  medkit: (g) => { g.rect(1, 3, 10, 8, B); g.rect(5, 4, 2, 6, E); g.rect(3, 6, 6, 2, E); g.rect(4, 1, 4, 2, A); },
  bandage: (g) => { g.ellipse(6, 6, 4, 4, B); g.ellipse(6, 6, 1.5, 1.5, A); g.rect(8, 8, 3, 2, B); },
  medgel: (g) => { g.rect(4, 1, 4, 2, A); g.ellipse(6, 7, 4, 4, B); g.set(5, 6, E); },
  ration: (g) => { g.rect(1, 3, 10, 7, B); g.rect(1, 5, 10, 1, A); },
  o2: (g) => { g.rect(4, 2, 4, 9, B); g.rect(5, 0, 2, 2, A); g.rect(4, 5, 4, 1, A); },
  o2big: (g) => { g.rect(3, 2, 6, 9, B); g.rect(5, 0, 2, 2, A); g.rect(3, 5, 6, 1, A); g.rect(3, 8, 6, 1, A); },
  battery: (g) => { g.rect(2, 3, 8, 7, B); g.rect(4, 1, 4, 2, A); g.line(7, 4, 5, 7, E); g.line(5, 7, 7, 7, E); g.line(7, 7, 5, 9, E); },
  cell: (g) => { g.rect(2, 2, 8, 9, B); g.rect(3, 3, 6, 2, E); g.rect(3, 6, 6, 2, E); },
  pill: (g) => { g.ellipse(4.5, 6, 3, 2, B); g.ellipse(7.5, 6, 3, 2, A); },
  pill2: (g) => { g.ellipse(6, 6, 4, 4, B); g.rect(2, 6, 8, 1, A); },
  stim: (g) => { g.line(2, 10, 8, 4, B); g.line(3, 10, 9, 4, B); g.set(10, 2, A); g.set(9, 3, A); g.rect(1, 9, 2, 2, A); },
  injector: (g) => { g.rect(2, 4, 7, 3, B); g.rect(3, 5, 5, 1, E); g.rect(9, 5, 3, 1, A); g.rect(0, 3, 2, 5, A); },
  grenade: (g) => { g.ellipse(6, 7, 4, 4, B); g.rect(5, 1, 3, 2, A); g.set(8, 1, A); g.rect(3, 7, 6, 1, A); },
  emp: (g) => { g.ellipse(6, 7, 4, 4, B); g.rect(5, 1, 3, 2, A); g.set(6, 7, E); g.set(5, 6, E); g.set(7, 8, E); },
  fire: (g) => { g.rect(4, 3, 4, 8, B); g.rect(5, 1, 2, 2, A); g.set(6, 0, E); g.set(5, 0, E); },
  sealer: (g) => { g.rect(2, 3, 8, 6, B); g.rect(3, 5, 6, 2, A); g.rect(5, 9, 2, 2, B); },
  beacon: (g) => { g.rect(4, 4, 4, 7, B); g.ellipse(6, 3, 2, 2, E); g.line(1, 2, 3, 4, A); g.line(11, 2, 9, 4, A); },
  drone: (g) => { g.ellipse(6, 6, 3, 2, B); g.rect(0, 3, 4, 1, A); g.rect(8, 3, 4, 1, A); g.set(6, 6, E); },
  flare: (g) => { g.rect(5, 3, 2, 8, B); g.rect(4, 1, 4, 2, E); },
  mine: (g) => { g.ellipse(6, 7, 5, 3, B); g.set(6, 6, E); g.rect(2, 9, 8, 1, A); },
  charge: (g) => { g.rect(1, 4, 10, 6, B); g.rect(2, 2, 2, 2, A); g.set(9, 6, E); },
  foam: (g) => { g.rect(4, 2, 4, 9, B); g.rect(5, 0, 2, 2, A); g.ellipse(9, 2, 2, 2, E); },
  decoy: (g) => { g.ellipse(6, 3, 2, 2, B); g.rect(4, 5, 4, 5, B); g.set(6, 7, E); },
  ammo: (g) => { for (let i = 0; i < 3; i++) { g.rect(2 + i * 3, 4, 2, 7, B); g.rect(2 + i * 3, 2, 2, 2, A); } },
  shells: (g) => { for (let i = 0; i < 2; i++) { g.rect(2 + i * 5, 3, 3, 8, B); g.rect(2 + i * 5, 8, 3, 3, A); } },
  nails: (g) => { for (let i = 0; i < 4; i++) { g.rect(1 + i * 3, 2, 2, 1, A); g.rect(1 + i * 3 + 0.5, 3, 1, 7, B); } },
  bolts: (g) => { for (let i = 0; i < 3; i++) { g.line(2 + i * 3, 10, 4 + i * 3, 2, B); g.set(4 + i * 3, 1, A); } },
  parts: (g) => { g.ellipse(4, 5, 3, 3, B); g.ellipse(4, 5, 1, 1, 0); g.rect(7, 6, 4, 4, A); g.set(9, 8, 0); },
  kit: (g) => { g.rect(1, 3, 10, 7, B); g.rect(1, 3, 10, 1, A); g.ellipse(6, 7, 2, 1.5, E); },
  repair: (g) => { g.rect(1, 4, 10, 6, B); g.rect(4, 2, 4, 2, A); g.line(3, 9, 9, 5, E); },
  suit: (g) => { g.ellipse(6, 3, 3, 3, B); g.rect(5, 2, 3, 2, E); g.rect(3, 6, 6, 5, B); g.rect(1, 7, 2, 3, A); g.rect(9, 7, 2, 3, A); },
  sample: (g) => { g.rect(4, 1, 4, 10, B); g.rect(5, 5, 2, 5, E); g.rect(3, 1, 6, 1, A); },
  musicbox: (g) => { g.rect(1, 4, 10, 7, B); g.rect(1, 2, 10, 2, A); g.set(10, 6, E); g.set(11, 6, E); },
  ring: (g) => { g.ellipse(6, 7, 4, 4, B); g.ellipse(6, 7, 2, 2, 0); g.set(6, 2, E); },
  key_coro: (g) => { g.ellipse(3.5, 6, 2.5, 2.5, B); g.rect(5, 5, 6, 2, B); g.rect(9, 7, 1, 2, A); g.rect(7, 7, 1, 2, A); g.set(3, 6, E); },
  drawing: (g) => { g.rect(1, 1, 10, 10, B); g.ellipse(4, 4, 1.4, 1.4, A); g.line(2, 9, 6, 6, E); g.line(6, 6, 9, 9, E); },
  document: (g) => { g.rect(2, 1, 8, 10, B); for (let i = 0; i < 3; i++) g.rect(3, 3 + i * 2, 6, 1, A); g.line(3, 9, 6, 8, E); },
  seeds: (g) => { g.rect(3, 3, 6, 8, B); g.rect(3, 2, 6, 1, A); g.set(5, 6, E); g.set(7, 8, E); g.set(6, 5, E); },
  datapad: (g) => { g.rect(2, 1, 8, 10, A); g.rect(3, 2, 6, 7, B); g.rect(4, 3, 4, 1, E); },
  fragment: (g) => { g.line(6, 1, 10, 6, B); g.line(10, 6, 6, 11, B); g.line(6, 11, 2, 6, B); g.line(2, 6, 6, 1, B); g.ellipse(6, 6, 2, 3, E); },
  imp_brain: (g) => { g.ellipse(6, 6, 5, 4, B); g.line(6, 2, 6, 10, A); g.set(3, 5, E); g.set(9, 7, E); },
  imp_eyes: (g) => { g.ellipse(6, 6, 5, 3, B); g.ellipse(6, 6, 2, 2, E); g.set(6, 6, A); },
  imp_torso: (g) => { g.rect(2, 2, 8, 8, B); g.ellipse(6, 6, 2, 2, E); g.rect(2, 2, 8, 1, A); },
  imp_arms: (g) => { g.rect(1, 4, 9, 3, B); g.rect(9, 3, 2, 5, A); g.set(4, 5, E); g.set(7, 5, E); },
  imp_legs: (g) => { g.rect(3, 1, 3, 9, B); g.rect(3, 10, 5, 2, A); g.set(4, 4, E); g.set(4, 7, E); },
};

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
  const g = new Grid(12, 12);
  (SHAPES[icon] ?? SHAPES.parts)(g);
  g.shade();
  g.outline();
  const accent = shadeHex(color, -0.35);
  const out = g.toCanvas(['', color, shadeHex(color, -0.25), shadeHex(color, 0.35), unknown ? '#ffffff' : shadeHex(color, 0.7), accent, '#07080b']);
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

export const ICON_NAMES = Object.keys(SHAPES);
