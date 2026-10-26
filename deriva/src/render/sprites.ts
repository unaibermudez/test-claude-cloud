/**
 * Sprites procedurales: cada arquetipo dibuja una silueta de 16×16 sobre una rejilla,
 * con variaciones deterministas por enemigo y dos fotogramas de reposo/movimiento.
 * El contorno y el sombreado se calculan automáticamente. Los adornos se añaden encima.
 */
import type { SpriteSpec, SpriteBase } from '../core/content';
import { Grid, vrand, hashStr, shadeHex } from './pixel';

type Drawer = (g: Grid, f: number, r: () => number) => void;

const B = 1; const E = 4; const A = 5;

const DRAW: Record<SpriteBase, Drawer> = {
  humanoid: (g, f, r) => {
    const hy = 2 + (f ? 1 : 0) * 0;
    g.ellipse(8, hy + 2.5, 2.6, 2.6, B);
    g.rect(6, hy + 5, 5, 5, B);
    const sw = f ? 1 : 0;
    g.rect(4, hy + 6, 2, 4 + sw, B); g.rect(11, hy + 6, 2, 4 - sw + 1, B);
    g.rect(6, hy + 10, 2, 4 - sw, B); g.rect(9, hy + 10, 2, 3 + sw, B);
    g.set(7, hy + 2, E); g.set(9, hy + 2, E);
    if (r() < 0.5) g.rect(6, hy + 8, 5, 1, A);
  },
  hunched: (g, f, r) => {
    const o = f ? 1 : 0;
    g.ellipse(6 + o * 0.5, 5, 2.5, 2.3, B);
    g.ellipse(9, 8.5, 4, 3.5, B);
    g.rect(4, 9, 2, 5, B); g.rect(12 - o, 8, 2, 5, B);
    g.rect(7, 11, 2, 4, B); g.rect(10, 11, 2, 3 + o, B);
    g.set(5, 5, E); g.set(7, 5, E);
    if (r() < 0.6) g.line(9, 6, 12, 5 + o, A);
  },
  robot: (g, f) => {
    g.rect(5, 2, 6, 4, B);
    g.rect(4, 6, 8, 6, B);
    g.rect(3, 7, 1, 4, B); g.rect(12, 7, 1, 4, B);
    g.rect(5, 12, 2, 3 - (f ? 1 : 0), B); g.rect(9, 12, 2, 2 + (f ? 1 : 0), B);
    g.rect(6, 3, 4, 1, E);
    g.rect(6, 8, 4, 2, A);
  },
  drone: (g, f) => {
    g.ellipse(8, 8, 3.5, 2.5, B);
    const w = f ? 1 : 0;
    g.rect(1 + w, 5, 4, 1, A); g.rect(11 - w, 5, 4, 1, A);
    g.line(4, 6, 6, 7, B); g.line(12, 6, 10, 7, B);
    g.set(8, 8, E); g.set(7, 8, E);
    g.rect(7, 11, 2, 1 + w, B);
  },
  swarm: (g, f, r) => {
    for (let i = 0; i < 7; i++) {
      const x = 3 + Math.floor(r() * 10) + (f && i % 2 ? 1 : 0);
      const y = 3 + Math.floor(r() * 10) - (f && i % 3 === 0 ? 1 : 0);
      g.rect(x, y, 2, 2, B);
      if (i % 3 === 0) g.set(x, y, E);
    }
  },
  plant: (g, f, r) => {
    g.rect(7, 8, 2, 7, B);
    g.ellipse(8, 6, 3.5 + (f ? 0.5 : 0), 3, A);
    g.ellipse(8, 6, 1.5, 1.5, E);
    g.line(8, 11, 4 - (f ? 1 : 0), 9, B); g.line(8, 12, 12 + (f ? 1 : 0), 10, B);
    if (r() < 0.5) g.rect(5, 14, 6, 1, B);
  },
  orb: (g, f) => {
    g.ellipse(8, 7 + (f ? 1 : 0), 4, 4, B);
    g.ellipse(8, 7 + (f ? 1 : 0), 1.6, 1.6, E);
    g.line(4, 12, 6, 14, A); g.line(12, 12, 10, 14, A);
  },
  turret: (g, f) => {
    g.rect(4, 11, 8, 4, B);
    g.ellipse(8, 9, 3, 2.5, B);
    g.rect(f ? 9 : 10, 8, 5, 2, A);
    g.set(7, 8, E);
  },
  amalgam: (g, f, r) => {
    g.ellipse(8, 9, 6, 5, B);
    const heads = 3 + Math.floor(r() * 2);
    for (let i = 0; i < heads; i++) {
      const x = 3 + i * (10 / heads) + (f && i % 2 ? 1 : 0);
      const y = 3 + (i % 2) * 2;
      g.ellipse(x + 1, y + 1, 1.7, 1.7, B);
      g.set(x + 1, y + 1, E);
    }
    g.rect(4, 13, 2, 2, B); g.rect(10, 13, 2, 2, B);
  },
  quad: (g, f) => {
    g.ellipse(8, 8, 5, 2.5, B);
    g.ellipse(3, 6, 2, 2, B);
    g.set(2, 6, E);
    const o = f ? 1 : 0;
    g.rect(4 + o, 10, 1, 4, B); g.rect(7 - o, 10, 1, 4, B); g.rect(10 + o, 10, 1, 4, B); g.rect(12 - o, 10, 1, 4, B);
  },
  tall: (g, f) => {
    g.ellipse(8, 2.5, 2, 2, B);
    g.rect(7, 4, 3, 8, B);
    g.rect(5, 5, 1, 8 + (f ? 1 : 0), B); g.rect(11, 5, 1, 8 - (f ? 1 : 0), B);
    g.rect(7, 12, 1, 3, B); g.rect(9, 12, 1, 3, B);
    g.set(8, 2, E);
  },
  child: (g, f) => {
    g.ellipse(8, 6, 2.6, 2.6, B);
    g.rect(6, 9, 5, 3, B);
    g.rect(5, 9, 1, 3 - (f ? 1 : 0), B); g.rect(11, 9, 1, 2 + (f ? 1 : 0), B);
    g.rect(6, 12, 2, 2, B); g.rect(9, 12, 2, 2 + (f ? 0 : 0), B);
    g.set(7, 6, E); g.set(9, 6, E);
    g.rect(6, 3, 5, 1, A);
  },
  crawler: (g, f) => {
    g.ellipse(8, 10, 6, 3, B);
    g.ellipse(13, 9, 2, 2, B);
    g.set(14, 9, E);
    const o = f ? 1 : 0;
    for (let i = 0; i < 4; i++) g.line(4 + i * 3, 12, 3 + i * 3 + o, 14, B);
    g.rect(5, 8, 5, 1, A);
  },
  statue: (g, f) => {
    g.ellipse(8, 3, 2.5, 2.5, B);
    g.rect(5, 6, 7, 3, B);
    g.rect(2, 6, 3, 1, B); g.rect(12, 6, 3, 1, B);
    g.rect(7, 9, 3, 6, B);
    g.set(7, 3, E); g.set(9, 3, f ? 0 : E);
    g.rect(6, 14, 5, 1, A);
  },
  tentacle: (g, f) => {
    for (let y = 2; y < 15; y++) {
      const x = 8 + Math.round(Math.sin(y * 0.7 + (f ? 1.2 : 0)) * 2);
      g.rect(x - 1, y, 3 - (y < 5 ? 1 : 0), 1, B);
    }
    g.set(8 + Math.round(Math.sin(2 * 0.7 + (f ? 1.2 : 0)) * 2), 3, E);
    g.rect(5, 14, 7, 1, A);
  },
  mech: (g, f) => {
    g.rect(4, 3, 8, 6, B);
    g.rect(2, 4, 2, 6, B); g.rect(12, 4, 2, 6, B);
    g.rect(5, 9, 6, 2, B);
    g.rect(4, 11, 3, 4 - (f ? 1 : 0), B); g.rect(9, 11, 3, 3 + (f ? 1 : 0), B);
    g.rect(6, 5, 4, 1, E);
    g.rect(5, 7, 6, 1, A);
  },
};

function overlay(g: Grid, ov: SpriteSpec['overlay'], f: number, r: () => number): void {
  if (!ov) return;
  switch (ov) {
    case 'cables': for (let i = 0; i < 3; i++) { const x = 4 + Math.floor(r() * 8); g.line(x, 7, x + (f ? 1 : -1), 14, A); } break;
    case 'growth': for (let i = 0; i < 4; i++) { const x = 3 + Math.floor(r() * 10); const y = 3 + Math.floor(r() * 8); if (g.get(x, y)) { g.set(x, y - 1, A); g.set(x + 1, y - 2, A); } } break;
    case 'glow': for (let i = 0; i < 5; i++) { const x = 4 + Math.floor(r() * 8); const y = 4 + Math.floor(r() * 9); if (g.get(x, y) === 1) g.set(x, y, E); } break;
    case 'cracks': for (let i = 0; i < 2; i++) { const x = 5 + Math.floor(r() * 6); g.line(x, 5, x + 2, 9, 2); } break;
    case 'mask': g.rect(6, 3, 5, 2, A); break;
    case 'antenna': g.line(8, 2, 10, 0, A); g.set(10, 0, E); break;
    case 'spikes': for (let x = 3; x < 13; x += 3) g.set(x, 6 + (f ? 1 : 0), A); break;
    case 'halo': for (let x = 5; x <= 11; x++) g.set(x, 0, A); g.set(4, 1, A); g.set(12, 1, A); break;
    case 'static': for (let i = 0; i < 6; i++) { const y = 2 + Math.floor(r() * 12); const x = 3 + Math.floor(r() * 10); if (g.get(x, y)) g.set(x + (f ? 1 : -1), y, 3); } break;
    case 'wings': g.ellipse(3, 6 - (f ? 1 : 0), 2, 1.2, A); g.ellipse(13, 6 - (f ? 1 : 0), 2, 1.2, A); break;
  }
}

export interface SpriteSet { frames: HTMLCanvasElement[]; flash: HTMLCanvasElement; size: number }

const cache = new Map<string, SpriteSet>();

function colorsFor(spec: SpriteSpec, tint?: string): string[] {
  const [o, b, s, h] = spec.palette;
  const base = tint ?? b;
  return ['', base, tint ? shadeHex(tint, -0.4) : s, tint ? shadeHex(tint, 0.35) : h, spec.eye ?? '#ffffff', shadeHex(base, -0.25), o];
}

export function spriteFor(key: string, spec: SpriteSpec, tint?: string): SpriteSet {
  const ck = `${key}|${tint ?? ''}`;
  const c = cache.get(ck);
  if (c) return c;
  const seed = hashStr(key);
  const frames: HTMLCanvasElement[] = [];
  let flashSrc: Grid | null = null;
  for (let f = 0; f < 2; f++) {
    const g = new Grid(16, 16);
    const r = vrand(seed);
    DRAW[spec.base](g, f, r);
    overlay(g, spec.overlay, f, r);
    // preservar ojos y acentos antes de sombrear
    const keep = g.d.slice();
    g.shade();
    for (let i = 0; i < keep.length; i++) if (keep[i] === E || keep[i] === A) g.d[i] = keep[i];
    g.outline();
    frames.push(g.toCanvas(colorsFor(spec, tint)));
    if (f === 0) flashSrc = g;
  }
  const flash = flashSrc!.toCanvas(['', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']);
  const set: SpriteSet = { frames, flash, size: 16 };
  cache.set(ck, set);
  return set;
}

// ---------------------------------------------------------------- jugador y PNJ

export interface PersonSpec {
  suit: [string, string, string, string];
  skin?: string;
  hair?: string;
  accessory?: 'belt' | 'hood' | 'cross' | 'mask' | 'antenna' | 'halo' | 'coat' | 'beard' | 'cap' | 'robot' | 'glasses';
  small?: boolean;
  visor?: string;
}

export function personSprite(key: string, p: PersonSpec): SpriteSet {
  const c = cache.get(key);
  if (c) return c;
  const frames: HTMLCanvasElement[] = [];
  let first: Grid | null = null;
  for (let f = 0; f < 2; f++) {
    const g = new Grid(16, 16);
    const top = p.small ? 4 : 1;
    const sw = f ? 1 : 0;
    // cabeza y cuerpo
    g.ellipse(8, top + 2.5, 2.5, 2.6, 7);
    g.rect(6, top + 5, 5, p.small ? 4 : 5, B);
    g.rect(4, top + 6, 2, (p.small ? 3 : 4) + sw, B); g.rect(11, top + 6, 2, (p.small ? 3 : 4) + 1 - sw, B);
    const legY = top + (p.small ? 9 : 10);
    g.rect(6, legY, 2, 15 - legY - sw, 2); g.rect(9, legY, 2, 14 - legY + sw, 2);
    // cara / visor
    if (p.visor) { g.rect(7, top + 2, 3, 1, E); } else { g.set(7, top + 2, E); g.set(9, top + 2, E); }
    if (p.hair) { g.rect(6, top, 5, 1, 8); g.set(5, top + 1, 8); g.set(11, top + 1, 8); }
    switch (p.accessory) {
      case 'belt': g.rect(6, top + 8, 5, 1, A); g.set(10, top + 9, A); break;
      case 'hood': g.rect(5, top - 1 < 0 ? 0 : top - 1, 7, 2, 2); g.set(5, top + 2, 2); g.set(11, top + 2, 2); break;
      case 'cross': g.rect(8, top + 6, 1, 3, A); g.rect(7, top + 7, 3, 1, A); break;
      case 'mask': g.rect(6, top + 1, 5, 3, A); g.rect(7, top + 2, 3, 1, E); break;
      case 'antenna': g.line(10, top, 12, top - 2 < 0 ? 0 : top - 2, A); break;
      case 'halo': for (let x = 5; x <= 11; x++) g.set(x, 0, A); break;
      case 'coat': g.rect(5, top + 5, 7, 7, 3); g.rect(8, top + 5, 1, 7, B); break;
      case 'beard': g.rect(7, top + 3, 3, 2, 8); break;
      case 'cap': g.rect(5, top, 7, 1, A); g.rect(10, top + 1, 3, 1, A); break;
      case 'glasses': g.rect(6, top + 2, 2, 1, A); g.rect(9, top + 2, 2, 1, A); break;
      case 'robot': g.rect(11, 11, 4, 4, A); g.set(12, 12, E); break;
    }
    if (f === 0) first = g;
    const keep = g.d.slice();
    g.shade();
    for (let i = 0; i < keep.length; i++) if (keep[i] >= 4) g.d[i] = keep[i];
    g.outline();
    const [o, b, s, h] = p.suit;
    const colors = ['', b, s, h, p.visor ?? '#e8f4ff', shadeHex(b, 0.3), o, p.skin ?? '#d9a988', p.hair ?? '#3a2a20'];
    frames.push(g.toCanvas(colors));
  }
  const flash = first!.toCanvas(['', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff']);
  const set = { frames, flash, size: 16 };
  cache.set(key, set);
  return set;
}

export const NPC_LOOK: Record<string, PersonSpec> = {
  celia: { suit: ['#0b0c10', '#9aa0a8', '#5c6068', '#d8dce2'], hair: '#b8b8b8', accessory: 'glasses', skin: '#e0b090' },
  tomas: { suit: ['#0d0906', '#8a6a3a', '#4a3820', '#c8a070'], hair: '#d8d8d8', accessory: 'beard', skin: '#c89070' },
  bruno: { suit: ['#08080c', '#e8c46a', '#9a7a30', '#fff0b0'], hair: '#5a3a20', small: true, accessory: 'robot', skin: '#f0c8a0' },
  solis: { suit: ['#05070c', '#3a4a70', '#20283f', '#7a8ab0'], hair: '#141414', accessory: 'cap', skin: '#b88060' },
  lenz: { suit: ['#0c0814', '#9a7ac8', '#5a4680', '#f0e0ff'], accessory: 'glasses', visor: '#c48cff', skin: '#c0b8d0' },
  faro: { suit: ['#0c0904', '#c87a3a', '#7a4a20', '#ffc890'], hair: '#f0f0f0', accessory: 'beard', visor: '#e8e8e8', skin: '#c8a080' },
};

export function clearSpriteCache(): void {
  cache.clear();
}
