/**
 * La Cápsula: sala explorable entre partidas. Las estaciones abren paneles de meta-progresión.
 * La sala cambia con el progreso (luces reparadas, plantas de Tomás, la radio de Bruno, marcas…).
 * También dibuja el fondo animado del título (Tártaro y la estación a la deriva).
 */
import { TILE, type FloorMap } from '../core/state';
import { zoneDef } from '../data/zones';
import { CLASSES } from '../data/classes';
import { drawTile, TS } from './tiles';
import { drawProp } from './props';
import { personSprite } from './sprites';
import type { WorldRenderer } from './world';
import type { MetaState } from '../core/meta';
import type { App } from '../app/app';

export interface Station { id: string; x: number; y: number; panel: string; visible: (m: MetaState) => boolean }

const W = 24; const H = 13;

export const STATIONS: Station[] = [
  { id: 'door', x: 12, y: 1, panel: 'newrun', visible: () => true },
  { id: 'pod', x: 3, y: 2, panel: 'identity', visible: () => true },
  { id: 'printer', x: 6, y: 1, panel: 'printer', visible: () => true },
  { id: 'tree', x: 18, y: 1, panel: 'tree', visible: () => true },
  { id: 'wardrobe', x: 21, y: 3, panel: 'wardrobe', visible: () => true },
  { id: 'archive', x: 2, y: 7, panel: 'archive', visible: () => true },
  { id: 'bestiary', x: 2, y: 10, panel: 'bestiary', visible: (m) => Object.keys(m.bestiary).length > 0 || m.stats.runs > 0 },
  { id: 'endings', x: 21, y: 7, panel: 'endings', visible: (m) => m.stats.runs > 0 },
  { id: 'stats', x: 21, y: 10, panel: 'stats', visible: () => true },
  { id: 'achievements', x: 12, y: 11, panel: 'achievements', visible: () => true },
  { id: 'radio', x: 8, y: 11, panel: 'radio', visible: (m) => (m.arcs.bruno ?? 0) >= 2 },
];

function buildMap(): FloorMap {
  const tiles: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? TILE.WALL : TILE.FLOOR);
  tiles[0 * W + 12] = TILE.DOOR;
  tiles[0 * W + 9] = TILE.WINDOW; tiles[0 * W + 15] = TILE.WINDOW;
  const n = W * H;
  return {
    w: W, h: H, zone: 1, floor: 1, boss: false, tiles, sec: new Array(n).fill(0), sections: [], rooms: [], doors: { 12: { open: false, lock: null, sealed: false, broken: false } },
    props: [], seen: new Array(n).fill(1), fire: new Array(n).fill(0), gas: new Array(n).fill(0), entry: { x: 12, y: 6 }, exit: { x: 12, y: 1 },
    event: null, eventTurn: 0, genSeed: 'hub', attempts: 1,
  };
}

export class HubScene {
  private world: WorldRenderer;
  private map = buildMap();
  private layer: HTMLCanvasElement | null = null;
  px = 12;
  py = 6;
  facing = 4;
  private drawX = 12 * TS;
  private drawY = 6 * TS;
  fx = 12.5;
  fy = 6.5;
  meta: MetaState | null = null;
  stars: { x: number; y: number; b: number; s: number }[] = [];

  constructor(world: WorldRenderer) {
    this.world = world;
    let seed = 7;
    const r = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 260; i++) this.stars.push({ x: r(), y: r(), b: 0.3 + r() * 0.7, s: r() < 0.08 ? 2 : 1 });
  }

  enter(app: App): void {
    this.meta = app.meta;
    this.px = 12; this.py = 6; this.facing = 0;
    this.fx = 12.5; this.fy = 6.5;
    this.drawX = this.px * TS; this.drawY = this.py * TS;
    this.layer = null;
  }

  visibleStations(): Station[] {
    const m = this.meta;
    return m ? STATIONS.filter((s) => s.visible(m)) : [];
  }

  private blocked(x: number, y: number): boolean {
    if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return true;
    return this.visibleStations().some((s) => s.x === x && s.y === y) || DECOR.some((d) => d.x === x && d.y === y && d.block && (!d.when || (this.meta && d.when(this.meta))));
  }

  /** Movimiento continuo con las teclas mantenidas o el stick. */
  update(app: App, dt: number): void {
    const v = app.input.moveVector();
    if (v.x === 0 && v.y === 0) return;
    const step = Math.min(0.4, (4.2 * dt) / 1000);
    const R = 0.3;
    const free = (x: number, y: number): boolean => {
      for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) {
        for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
          if (!this.blocked(tx, ty)) continue;
          const cx = Math.max(tx, Math.min(x, tx + 1)); const cy = Math.max(ty, Math.min(y, ty + 1));
          if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) return false;
        }
      }
      return true;
    };
    if (free(this.fx + v.x * step, this.fy)) this.fx += v.x * step;
    if (free(this.fx, this.fy + v.y * step)) this.fy += v.y * step;
    this.px = Math.floor(this.fx); this.py = Math.floor(this.fy);
    const a = Math.atan2(v.y, v.x);
    this.facing = ((Math.round(a / (Math.PI / 4)) + 2) % 8 + 8) % 8;
  }

  move(dir: number): void {
    const D = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][dir];
    this.facing = dir;
    const nx = this.px + D[0]; const ny = this.py + D[1];
    if (!this.blocked(nx, ny)) { this.px = nx; this.py = ny; this.fx = nx + 0.5; this.fy = ny + 0.5; }
  }

  adjacent(): Station | null {
    for (const s of this.visibleStations()) if (Math.max(Math.abs(s.x - this.px), Math.abs(s.y - this.py)) <= 1) return s;
    return null;
  }

  click(app: App, cx: number, cy: number): void {
    const tl = this.toTile(cx, cy);
    const st = this.visibleStations().find((s) => s.x === tl.x && s.y === tl.y);
    if (st) {
      app.open(st.panel);
      return;
    }
    if (!this.blocked(tl.x, tl.y)) { this.px = tl.x; this.py = tl.y; this.fx = tl.x + 0.5; this.fy = tl.y + 0.5; }
  }

  private toTile(cx: number, cy: number): { x: number; y: number } {
    const c = this.world.canvas;
    const r = c.getBoundingClientRect();
    const S = this.hubScale();
    const ox = (c.width - W * TS * S) / 2; const oy = (c.height - H * TS * S) / 2;
    const sx = (cx - r.left) * (c.width / r.width); const sy = (cy - r.top) * (c.height / r.height);
    return { x: Math.floor((sx - ox) / (TS * S)), y: Math.floor((sy - oy) / (TS * S)) };
  }

  private hubScale(): number {
    const c = this.world.canvas;
    return Math.max(1, Math.min(5, Math.floor(Math.min(c.width / (W * TS + 32), (c.height - 120) / (H * TS)))));
  }

  render(now: number, title: boolean): void {
    const c = this.world.c;
    const cv = this.world.canvas;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#020306';
    c.fillRect(0, 0, cv.width, cv.height);
    if (title) { this.renderTitle(now); return; }
    const S = this.hubScale();
    const ox = Math.floor((cv.width - W * TS * S) / 2); const oy = Math.floor((cv.height - H * TS * S) / 2);
    // fondo de estrellas (por las ventanas se ve el espacio)
    this.drawStars(now, 0.4);
    c.setTransform(S, 0, 0, S, ox, oy);
    const pal = zoneDef(1).palette;
    if (!this.layer) {
      this.layer = document.createElement('canvas');
      this.layer.width = W * TS; this.layer.height = H * TS;
      const lc = this.layer.getContext('2d')!;
      lc.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) drawTile(lc, this.map, x, y, pal);
    }
    c.drawImage(this.layer, 0, 0);
    const m = this.meta;
    // decorado que evoluciona
    for (const d of DECOR) {
      if (d.when && (!m || !d.when(m))) continue;
      drawProp(c, { id: d.x * 31 + d.y, kind: d.kind, x: d.x, y: d.y, label: d.label, variant: d.variant, used: d.used }, d.x * TS, d.y * TS, pal, now);
    }
    // estaciones
    for (const s of this.visibleStations()) this.drawStation(c, s, now, pal);
    // marcas de logros en la pared inferior
    const marks = m ? Object.keys(m.achievements).length : 0;
    c.fillStyle = 'rgba(232,196,106,0.55)';
    for (let i = 0; i < marks; i++) c.fillRect(TS * 14 + (i % 26) * 3, (H - 1) * TS + 4 + Math.floor(i / 26) * 4, 1, 3);
    // jugador
    this.drawX = (this.fx - 0.5) * TS; this.drawY = (this.fy - 0.5) * TS;
    const cls = CLASSES.find((k) => k.id === (m?.profile.lastClass ?? 'tecnico')) ?? CLASSES[0];
    const spr = personSprite(`player_${cls.id}`, { suit: cls.suit, visor: '#9fe8ff', accessory: cls.id === 'hacker' ? 'antenna' : cls.id === 'medico' ? 'cross' : cls.id === 'soldador' ? 'mask' : cls.id === 'infiltrado' ? 'hood' : cls.id === 'eco' ? 'halo' : 'belt' });
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(Math.round(this.drawX) + 3, Math.round(this.drawY) + 13, 10, 2);
    c.drawImage(spr.frames[Math.floor(now / 520) % 2], Math.round(this.drawX), Math.round(this.drawY));
    // luz: más reparaciones = más claridad
    const lit = m ? Math.min(1, 0.35 + m.upgrades.length * 0.03) : 0.35;
    const g = c.createRadialGradient(this.drawX + 8, this.drawY + 8, TS * 2, this.drawX + 8, this.drawY + 8, TS * (6 + lit * 10));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,3,6,${0.85 - lit * 0.5})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W * TS, H * TS);
    // resalte de estación adyacente
    const adj = this.adjacent();
    if (adj) {
      c.strokeStyle = Math.floor(now / 300) % 2 ? '#e8c46a' : '#a88a40';
      c.lineWidth = 1;
      c.strokeRect(adj.x * TS - 0.5, adj.y * TS - 0.5, TS + 1, TS + 1);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawStation(c: CanvasRenderingContext2D, s: Station, now: number, pal: ReturnType<typeof zoneDef>['palette']): void {
    const x = s.x * TS; const y = s.y * TS;
    const kindMap: Record<string, Parameters<typeof drawProp>[1]['kind']> = {
      door: 'exit', pod: 'cryopod', printer: 'autosurgeon', tree: 'terminal', wardrobe: 'container', archive: 'terminal',
      bestiary: 'terminal', endings: 'terminal', stats: 'terminal', achievements: 'decor', radio: 'radio',
    };
    if (s.id === 'achievements') {
      c.fillStyle = '#3a2f20'; c.fillRect(x + 2, y + 2, 12, 12);
      c.fillStyle = '#e8c46a'; c.fillRect(x + 4, y + 4, 8, 1); c.fillRect(x + 4, y + 7, 6, 1); c.fillRect(x + 4, y + 10, 7, 1);
      return;
    }
    if (s.id === 'door') {
      c.fillStyle = '#1a1f28'; c.fillRect(x, y, TS, TS);
      drawProp(c, { id: 1, kind: 'exit', x: s.x, y: s.y }, x, y, pal, now);
      return;
    }
    drawProp(c, { id: s.x * 7 + s.y, kind: kindMap[s.id] ?? 'terminal', x: s.x, y: s.y, variant: s.id === 'pod' ? 1 : 0, label: s.id === 'tree' ? 'boss' : undefined }, x, y, { ...pal, accent: STATION_COLOR[s.id] ?? pal.accent }, now);
  }

  private drawStars(now: number, k: number): void {
    const c = this.world.c;
    const cv = this.world.canvas;
    for (const s of this.stars) {
      const tw = 0.6 + 0.4 * Math.sin(now / 900 + s.x * 50);
      c.fillStyle = `rgba(220,230,255,${s.b * tw * k})`;
      c.fillRect(Math.floor(((s.x * cv.width) + now * 0.004 * s.s) % cv.width), Math.floor(s.y * cv.height), s.s, s.s);
    }
  }

  private renderTitle(now: number): void {
    const c = this.world.c;
    const cv = this.world.canvas;
    this.drawStars(now, 1);
    // Tártaro
    const r = Math.min(cv.width, cv.height) * 0.62;
    const cx = cv.width * 0.72; const cy = cv.height * 1.05;
    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r);
    g.addColorStop(0, '#ffcf8a'); g.addColorStop(0.45, '#c8602e'); g.addColorStop(0.85, '#4a1a0e'); g.addColorStop(1, 'rgba(20,5,3,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.save();
    c.beginPath(); c.arc(cx, cy, r * 0.97, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(255,220,170,${0.05 + (i % 3) * 0.03})`;
      const yy = cy - r + i * r * 0.16 + Math.sin(now / 5000 + i) * 4;
      c.fillRect(cx - r, yy, r * 2, r * 0.05);
    }
    c.restore();
    // la estación: anillo y eje, girando despacio
    const sx = cv.width * 0.3; const sy = cv.height * 0.42;
    const S = Math.max(2, Math.floor(Math.min(cv.width, cv.height) / 180));
    const a = now / 9000;
    c.save();
    c.translate(sx, sy);
    c.rotate(Math.sin(a) * 0.08);
    c.fillStyle = '#2a2f38';
    c.fillRect(-2 * S, -40 * S, 4 * S, 80 * S);
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2 + a;
      const px = Math.cos(ang) * 34 * S; const py = Math.sin(ang) * 10 * S;
      const front = Math.sin(ang) > 0;
      c.fillStyle = front ? '#5a616e' : '#2a2f38';
      c.fillRect(px - 2 * S, py - S, 4 * S, 3 * S);
      if (front && i % 6 === 0) { c.fillStyle = Math.floor(now / 700 + i) % 5 === 0 ? '#ff5252' : '#e8c46a'; c.fillRect(px, py, S, S); }
    }
    c.fillStyle = '#4c5363';
    c.fillRect(-8 * S, -8 * S, 16 * S, 16 * S);
    c.fillStyle = '#c9a2ff';
    c.globalAlpha = 0.5 + 0.5 * Math.sin(now / 600);
    c.fillRect(-2 * S, -2 * S, 4 * S, 4 * S);
    c.globalAlpha = 1;
    c.restore();
    // viñeta
    const v = c.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.3, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
    c.fillStyle = v;
    c.fillRect(0, 0, cv.width, cv.height);
  }
}

const STATION_COLOR: Record<string, string> = {
  tree: '#e8c46a', archive: '#f0e0b8', bestiary: '#ff8a8a', endings: '#c9a2ff', stats: '#9fe8ff',
};

interface Decor { x: number; y: number; kind: Parameters<typeof drawProp>[1]['kind']; label?: string; variant?: number; used?: boolean; block?: boolean; when?: (m: MetaState) => boolean }

const DECOR: Decor[] = [
  { x: 1, y: 1, kind: 'emlight' },
  { x: 22, y: 1, kind: 'emlight', when: (m) => m.upgrades.length >= 3 },
  { x: 1, y: 11, kind: 'emlight', when: (m) => m.upgrades.length >= 8 },
  { x: 22, y: 11, kind: 'emlight', when: (m) => m.upgrades.length >= 15 },
  { x: 5, y: 2, kind: 'cryopod', variant: 0, used: true, block: true },
  { x: 4, y: 2, kind: 'cryopod', variant: 0, used: true, block: true },
  { x: 9, y: 5, kind: 'decor', label: 'table', block: true },
  { x: 10, y: 5, kind: 'decor', label: 'chair' },
  { x: 15, y: 5, kind: 'decor', label: 'plant_pot', block: true, when: (m) => (m.arcs.tomas ?? 0) >= 2 },
  { x: 16, y: 5, kind: 'decor', label: 'planter', block: true, when: (m) => (m.arcs.tomas ?? 0) >= 3 },
  { x: 14, y: 9, kind: 'decor', label: 'toy', when: (m) => (m.arcs.bruno ?? 0) >= 1 },
  { x: 7, y: 9, kind: 'decor', label: 'gurney', block: true, when: (m) => (m.arcs.celia ?? 0) >= 2 },
  { x: 17, y: 9, kind: 'decor', label: 'flag', block: true, when: (m) => (m.arcs.solis ?? 0) >= 3 },
  { x: 18, y: 11, kind: 'decor', label: 'crystal', block: true, when: (m) => (m.arcs.lenz ?? 0) >= 2 },
  { x: 5, y: 11, kind: 'decor', label: 'antenna', block: true, when: (m) => (m.arcs.faro ?? 0) >= 2 },
  { x: 10, y: 8, kind: 'corpse', when: (m) => m.stats.deaths >= 5 },
  { x: 20, y: 5, kind: 'decor', label: 'locker', block: true },
  { x: 3, y: 5, kind: 'decor', label: 'shelf', block: true },
];
