/**
 * Renderizador del mundo: capa estática del piso, objetos, actores animados, luz y niebla,
 * partículas y efectos de pantalla. Lee el estado sin modificarlo.
 */
import { TILE, type RunState, type Actor, type FloorMap } from '../core/state';
import type { GameEvent } from '../core/events';
import { getVision } from '../core/vision';
import { getStats } from '../core/rules';
import { enemyDef, hasEnemy } from '../data/enemies';
import { CLASSES } from '../data/classes';
import { zoneDef } from '../data/zones';
import { BAL } from '../data/balance';
import { TS, drawTile, tileSignature } from './tiles';
import { drawProp } from './props';
import { spriteFor, personSprite, playerSprite, NPC_LOOK, type SpriteSet } from './sprites';
import { iconCanvas } from './icons';
import { FxSystem } from './fx';
import { makeCanvas, ctx2d, shadeHex } from './pixel';
import type { ZonePalette } from '../core/content';
import { t } from '../i18n';

export interface ViewOpts {
  shake: number; // 0..1
  flicker: boolean;
  glitch: boolean;
  highContrast: boolean;
  zoom: number; // 0 = automático
  particles: number; // 0..1
  tweenMs: number; // duración del desplazamiento entre casillas
  softLight: boolean;
}

export interface Overlay {
  cursor?: { x: number; y: number } | null;
  path?: { x: number; y: number }[];
  aoe?: number;
  mode?: 'target' | 'throw' | 'look' | null;
  valid?: boolean;
  /** Posición continua del jugador (tiempo real), en casillas. */
  playerPos?: { x: number; y: number } | null;
  /** Punto de mira libre (tiempo real), en casillas. */
  crosshair?: { x: number; y: number } | null;
}

interface Anim {
  dx: number; dy: number; // posición dibujada (píxeles del mundo)
  fx: number; fy: number; t0: number; // origen del desplazamiento
  lunge?: { dx: number; dy: number; t0: number };
  hurt?: number;
  def: string; elite?: string; npc?: string; faction: string; boss: boolean;
}

interface Ghost { key: string; set: SpriteSet; x: number; y: number; t0: number; scale: number }

const ELITE_COLORS: Record<string, string> = {
  resonante: '#c48cff', blindado: '#b8c0cc', veloz: '#7af0ff', voraz: '#ff4b4b', inestable: '#ffb347',
};

const LIGHT_RGB: Record<string, [number, number, number]> = {
  amb: [170, 190, 220], emer: [255, 70, 50], fire: [255, 140, 40], term: [90, 200, 255], flash: [255, 240, 200],
  flare: [255, 110, 60], glow: [190, 120, 255], boss: [255, 60, 90], planet: [255, 170, 100],
};

const DMG_COLORS: Record<string, string> = {
  hp: '#ff5a5a', heal: '#7dff9a', o2: '#7fc4e0', energy: '#f2d45c', miss: '#b8c0cc', crit: '#ffd166', phantom: '#c48cff', scrap: '#e8c46a',
};

export class WorldRenderer {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  scale = 3;
  camX = 0;
  camY = 0;
  private layer: HTMLCanvasElement | null = null;
  private layerCtx: CanvasRenderingContext2D | null = null;
  private sig: Int32Array | null = null;
  private fullRedraw = false;
  private map: FloorMap | null = null;
  private mask: HTMLCanvasElement = makeCanvas(1, 1);
  private maskCtx = ctx2d(this.mask);
  private maskData: ImageData | null = null;
  private maskHi: HTMLCanvasElement = makeCanvas(1, 1);
  private maskHiCtx = ctx2d(this.maskHi);
  private anims = new Map<number, Anim>();
  private ghosts: Ghost[] = [];
  fx = new FxSystem();
  private shakeT = 0;
  private shakePow = 0;
  private hurtFlash = 0;
  private lastNow = 0;
  private glitchUntil = 0;
  opts: ViewOpts = { shake: 1, flicker: true, glitch: true, highContrast: false, zoom: 0, particles: 1, tweenMs: 110, softLight: true };
  private lastTurn = -1;
  bossFocus: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.c = ctx2d(canvas);
    this.resize();
  }

  resize(): void {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(240, window.innerHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    this.c.imageSmoothingEnabled = false;
    const auto = Math.max(1, Math.floor(Math.min(w / (22 * TS), h / (14 * TS))));
    this.scale = this.opts.zoom > 0 ? this.opts.zoom : Math.min(5, auto);
  }

  /** Fuerza a repintar la capa estática (cambio de paleta). */
  invalidateLayer(): void {
    this.fullRedraw = true;
  }

  setOpts(o: Partial<ViewOpts>): void {
    this.opts = { ...this.opts, ...o };
    this.fx.intensity = this.opts.particles;
    this.resize();
  }

  /** Tamaño de la vista en casillas. */
  viewTiles(): { w: number; h: number } {
    return { w: this.canvas.width / (TS * this.scale), h: this.canvas.height / (TS * this.scale) };
  }

  /** Punto de la pantalla (CSS px) de una coordenada del mundo en casillas. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const k = r.width / this.canvas.width;
    return { x: r.left + (x * TS - this.camX) * this.scale * k, y: r.top + (y * TS - this.camY) * this.scale * k };
  }

  /** Coordenadas continuas del mundo (en casillas) bajo un punto de la pantalla. */
  screenToWorld(px: number, py: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = (px - r.left) * (this.canvas.width / r.width);
    const sy = (py - r.top) * (this.canvas.height / r.height);
    return { x: (sx / this.scale + this.camX) / TS, y: (sy / this.scale + this.camY) / TS };
  }

  screenToTile(px: number, py: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = (px - r.left) * (this.canvas.width / r.width);
    const sy = (py - r.top) * (this.canvas.height / r.height);
    return { x: Math.floor((sx / this.scale + this.camX) / TS), y: Math.floor((sy / this.scale + this.camY) / TS) };
  }

  private palette(st: RunState): ZonePalette {
    return zoneDef(st.map.zone).palette;
  }

  private ensureLayer(st: RunState): void {
    const m = st.map;
    if (this.map === m && this.layer) return;
    this.map = m;
    this.layer = makeCanvas(m.w * TS, m.h * TS);
    this.layerCtx = ctx2d(this.layer);
    this.sig = new Int32Array(m.w * m.h).fill(-1);
    this.fullRedraw = true;
    this.mask = makeCanvas(m.w, m.h);
    this.maskCtx = ctx2d(this.mask);
    this.maskData = this.maskCtx.createImageData(m.w, m.h);
    this.anims.clear();
    this.ghosts = [];
    this.fx.clear();
    const p = st.actors.find((a) => a.id === st.pid);
    if (p) this.centerOn(p.x, p.y, true);
  }

  private refreshLayer(st: RunState): void {
    const m = st.map;
    const pal = this.palette(st);
    const c = this.layerCtx!;
    const sig = this.sig!;
    if (this.fullRedraw) {
      this.fullRedraw = false;
      for (let i = 0; i < m.w * m.h; i++) { sig[i] = tileSignature(m, i); drawTile(c, m, i % m.w, Math.floor(i / m.w), pal); }
      return;
    }
    for (let i = 0; i < m.w * m.h; i++) {
      const s = tileSignature(m, i);
      if (s === sig[i]) continue;
      const x = i % m.w; const y = Math.floor(i / m.w);
      sig[i] = s;
      // la casilla y sus vecinas (caras de muro, bordes y sombras dependen de los vecinos)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h) drawTile(c, m, xx, yy, pal);
      }
    }
  }

  private centerOn(x: number, y: number, snap: boolean, dt = 16): void {
    const v = this.viewTiles();
    const tx = (x + 0.5) * TS - (v.w * TS) / 2;
    const ty = (y + 0.5) * TS - (v.h * TS) / 2;
    if (snap) { this.camX = tx; this.camY = ty; return; }
    const k = 1 - Math.pow(0.86, dt / 16);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  // ------------------------------------------------------------------ eventos

  handleEvents(st: RunState, evs: GameEvent[], now: number): void {
    for (const e of evs) {
      switch (e.t) {
        case 'fx': if (this.opts.particles > 0 || e.id === 'shot' || e.id === 'throw') this.fx.spawn(e.id, e.x, e.y, now, e.tx, e.ty, e.n, e.color); break;
        case 'shake': this.addShake(e.power); break;
        case 'dmg': {
          const txt = e.kind === 'miss' ? t('ui.miss') : e.kind === 'heal' ? `+${e.amount}` : e.kind === 'scrap' ? `+${e.amount}⚙` : e.kind === 'o2' ? `${e.amount > 0 ? '+' : ''}${e.amount}` : String(e.amount);
          this.fx.number(e.x, e.y, txt, DMG_COLORS[e.kind ?? 'hp'], now, e.kind === 'crit');
          break;
        }
        case 'anim': {
          const a = st.actors.find((q) => q.id === e.actor);
          const an = this.anims.get(e.actor);
          if (e.anim === 'attack' && an) an.lunge = { dx: e.dx ?? 0, dy: e.dy ?? 0, t0: now };
          else if (e.anim === 'hurt') {
            if (an) an.hurt = now;
            if (e.actor === st.pid) this.hurtFlash = now;
          } else if (e.anim === 'death') {
            const def = a?.def ?? an?.def;
            if (def && hasEnemy(def)) {
              const set = this.spriteOf(st, a ?? ({ def, elite: an?.elite, npc: an?.npc, faction: an?.faction ?? 'enemy' } as Actor));
              const d = enemyDef(def);
              this.ghosts.push({ key: def, set, x: an ? an.dx : (a!.x * TS), y: an ? an.dy : (a!.y * TS), t0: now, scale: d.sprite.scale ?? 1 });
            }
            this.anims.delete(e.actor);
          }
          break;
        }
        case 'floor': this.map = null; break;
        case 'bossbar': this.bossFocus = e.actor; break;
        default: break;
      }
    }
  }

  addShake(p: number): void {
    if (this.opts.shake <= 0) return;
    this.shakePow = Math.min(8, Math.max(this.shakePow, p * this.opts.shake));
    this.shakeT = 0;
  }

  glitch(ms: number, now: number): void {
    if (this.opts.glitch) this.glitchUntil = Math.max(this.glitchUntil, now + ms);
  }

  // ------------------------------------------------------------------ sprites

  spriteOf(st: RunState, a: Pick<Actor, 'def' | 'elite' | 'npc' | 'faction'> & { id?: number }): SpriteSet {
    if (a.id === st.pid || a.def === 'player') {
      const cls = CLASSES.find((k) => k.id === st.player.classId) ?? CLASSES[0];
      return playerSprite(cls);
    }
    if (a.npc && NPC_LOOK[a.npc]) return personSprite(`npc_${a.npc}`, NPC_LOOK[a.npc]);
    const d = enemyDef(a.def);
    return spriteFor(d.id, d.sprite);
  }

  // ------------------------------------------------------------------ dibujo

  render(st: RunState, now: number, ov: Overlay = {}): void {
    const dt = Math.min(100, now - (this.lastNow || now));
    this.lastNow = now;
    this.ensureLayer(st);
    this.refreshLayer(st);
    const m = st.map;
    const pal = this.palette(st);
    const vis = getVision(st);
    const stats = getStats(st);
    const pl = st.actors.find((a) => a.id === st.pid);
    const c = this.c;
    const S = this.scale;

    // animaciones de actores
    for (const a of st.actors) {
      if (a.dead) continue;
      let an = this.anims.get(a.id);
      const tx = a.x * TS; const ty = a.y * TS;
      if (!an) {
        an = { dx: tx, dy: ty, fx: tx, fy: ty, t0: now - 1000, def: a.def, elite: a.elite, npc: a.npc, faction: a.faction, boss: !!a.boss };
        this.anims.set(a.id, an);
      }
      const dist = Math.abs(an.fx - tx) + Math.abs(an.fy - ty);
      if (an.dx !== tx || an.dy !== ty) {
        if (Math.abs(an.dx - tx) > TS * 3 || Math.abs(an.dy - ty) > TS * 3) { an.dx = tx; an.dy = ty; an.fx = tx; an.fy = ty; }
        else if (dist === 0 || now - an.t0 > this.opts.tweenMs + 10) { an.fx = an.dx; an.fy = an.dy; an.t0 = now; }
      }
      const k = Math.min(1, (now - an.t0) / this.opts.tweenMs);
      const e = this.opts.tweenMs > 150 ? k : 1 - (1 - k) * (1 - k);
      an.dx = k >= 1 ? tx : Math.round(an.fx + (tx - an.fx) * e);
      an.dy = k >= 1 ? ty : Math.round(an.fy + (ty - an.fy) * e);
      if (k >= 1) { an.fx = tx; an.fy = ty; }
    }
    for (const id of [...this.anims.keys()]) if (!st.actors.some((a) => a.id === id && !a.dead)) this.anims.delete(id);

    if (pl && ov.playerPos) {
      const an = this.anims.get(pl.id);
      if (an) { an.dx = (ov.playerPos.x - 0.5) * TS; an.dy = (ov.playerPos.y - 0.5) * TS; an.fx = an.dx; an.fy = an.dy; an.t0 = now - 10000; }
    }
    if (pl) {
      const an = this.anims.get(pl.id);
      this.centerOn((an ? an.dx / TS : pl.x), (an ? an.dy / TS : pl.y), false, dt);
    }

    // temblor
    let sx = 0; let sy = 0;
    if (this.shakePow > 0.05) {
      this.shakeT += dt;
      sx = (Math.random() - 0.5) * this.shakePow * 2;
      sy = (Math.random() - 0.5) * this.shakePow * 2;
      this.shakePow *= Math.pow(0.9, dt / 16);
    }

    const camX = Math.round((this.camX + sx) * S) / S;
    const camY = Math.round((this.camY + sy) * S) / S;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = m.zone === 6 ? '#000000' : pal.fog;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    c.imageSmoothingEnabled = false;

    const v = this.viewTiles();
    const x0 = Math.max(0, Math.floor(camX / TS) - 1);
    const y0 = Math.max(0, Math.floor(camY / TS) - 1);
    const x1 = Math.min(m.w - 1, Math.ceil(camX / TS + v.w) + 1);
    const y1 = Math.min(m.h - 1, Math.ceil(camY / TS + v.h) + 1);

    // exterior: planeta Tártaro
    if (m.zone === 6) this.drawPlanet(c, camX, camY, v, now);

    // capa estática
    c.drawImage(this.layer!, x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS, x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);

    // estados de sala y peligros
    this.drawHazards(st, c, x0, y0, x1, y1, vis.visible, now);

    // objetos del escenario
    for (const p of m.props) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const i = p.y * m.w + p.x;
      if (!m.seen[i] && !vis.visible[i]) continue;
      drawProp(c, p, p.x * TS, p.y * TS, pal, vis.visible[i] ? now : 0);
    }

    // objetos en el suelo
    for (const it of st.items) {
      const i = it.y * m.w + it.x;
      if (!vis.visible[i] && !m.seen[i]) continue;
      const bob = vis.visible[i] ? Math.round(Math.sin(now / 300 + it.id) * 0.8) : 0;
      c.fillStyle = 'rgba(0,0,0,0.38)';
      c.fillRect(it.x * TS + 3, it.y * TS + 13, 10, 2);
      c.fillRect(it.x * TS + 4, it.y * TS + 12, 8, 1);
      c.drawImage(iconCanvas(it.item.id, st.appear[it.item.id], !st.known[it.item.id]), it.x * TS, it.y * TS - 1 + bob);
    }

    // avisos de ataque
    for (const tg of st.telegraphs) {
      const pulse = 0.35 + 0.25 * Math.sin(now / 90);
      for (const ti of tg.tiles) {
        const tx = ti % m.w; const ty = Math.floor(ti / m.w);
        if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
        if (!vis.visible[ti] && !m.seen[ti]) continue;
        c.fillStyle = `rgba(255,50,50,${pulse})`;
        c.fillRect(tx * TS, ty * TS, TS, TS);
        c.fillStyle = 'rgba(255,220,220,0.7)';
        for (let k = 0; k < TS; k += 4) c.fillRect(tx * TS + k, ty * TS + ((k + Math.floor(now / 60)) % TS), 1, 1);
        c.strokeStyle = '#ff3030';
        c.lineWidth = 1;
        c.strokeRect(tx * TS + 0.5, ty * TS + 0.5, TS - 1, TS - 1);
      }
    }

    // fantasmas de muerte
    this.ghosts = this.ghosts.filter((g) => now - g.t0 < 450);
    for (const g of this.ghosts) {
      const k = (now - g.t0) / 450;
      c.globalAlpha = 1 - k;
      const s = g.scale;
      const w = 16 * s;
      c.drawImage(k < 0.25 ? g.set.flash : g.set.frames[0], g.x + (TS - w) / 2, g.y + (TS - w) + k * 4, w, w * (1 - k * 0.5));
      c.globalAlpha = 1;
    }

    // actores
    const order = st.actors.filter((a) => !a.dead).sort((a, b) => a.y - b.y);
    for (const a of order) {
      const isP = a.id === st.pid;
      if (!isP && !vis.seenActors.has(a.id)) {
        if (vis.sensed.has(a.id)) this.drawSensed(c, a, now);
        continue;
      }
      this.drawActor(st, c, a, now, isP);
    }

    // partículas y trazadores
    this.fx.update(dt);
    this.fx.drawParticles(c);
    this.fx.drawTracers(c, now);

    // luz de color (aditiva)
    this.drawGlow(st, c, vis.lights, vis.visible, x0, y0, x1, y1, now);

    // niebla y oscuridad
    this.drawMask(st, c, vis.visible, vis.light, stats.nightVision, pl);

    // indicadores sobre la niebla
    for (const a of order) {
      if (a.id === st.pid || !vis.seenActors.has(a.id)) continue;
      this.drawActorHud(st, c, a, now);
    }
    this.drawOverlay(st, c, ov, now);
    this.fx.drawFloaters(c, now, 'bold 7px monospace');

    // efectos de pantalla
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawScreenFx(st, now);
    if (st.turn !== this.lastTurn) this.lastTurn = st.turn;
  }

  private drawPlanet(c: CanvasRenderingContext2D, camX: number, camY: number, v: { w: number; h: number }, now: number): void {
    // Tártaro: gigante naranja que ocupa el fondo, con paralaje lento
    const cx = camX + v.w * TS * 0.75 - camX * 0.05;
    const cy = camY + v.h * TS * 1.15 - camY * 0.05;
    const r = v.h * TS * 0.75;
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffcf8a');
    g.addColorStop(0.5, '#d8703a');
    g.addColorStop(0.9, '#5a2414');
    g.addColorStop(1, 'rgba(40,10,5,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.25;
    c.fillStyle = '#ffe2b0';
    for (let i = 0; i < 5; i++) {
      const yy = cy - r * 0.6 + i * r * 0.22;
      c.fillRect(cx - r, yy + Math.sin(now / 4000 + i) * 2, r * 2, 3);
    }
    c.globalAlpha = 1;
  }

  private drawHazards(st: RunState, c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, visible: Uint8Array, now: number): void {
    const m = st.map;
    const fr = Math.floor(now / 90);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * m.w + x;
        if (!visible[i] && !m.seen[i]) continue;
        const t = m.tiles[i];
        const s = m.sec[i];
        const sec = s >= 0 ? m.sections[s] : null;
        const px = x * TS; const py = y * TS;
        if (sec && t !== TILE.WALL) {
          if (sec.pressure < 30 && m.zone !== 6) {
            c.fillStyle = 'rgba(40,70,140,0.18)';
            c.fillRect(px, py, TS, TS);
            if (visible[i] && ((x * 7 + y * 13 + fr) % 23) === 0) { c.fillStyle = 'rgba(220,235,255,0.6)'; c.fillRect(px + ((fr * 3 + x) % 16), py + ((y * 5) % 16), 1, 1); }
          } else if (sec.pressure < 70 && m.zone !== 6) {
            c.fillStyle = 'rgba(60,90,160,0.08)';
            c.fillRect(px, py, TS, TS);
          }
          if (sec.radiation > 0) {
            c.fillStyle = `rgba(140,255,90,${Math.min(0.16, sec.radiation * 0.05)})`;
            c.fillRect(px, py, TS, TS);
            if (visible[i] && ((x * 11 + y * 3 + fr) % 17) === 0) { c.fillStyle = '#b8ff8a'; c.fillRect(px + ((x * 5 + fr) % 15), py + ((y * 9 + fr) % 15), 1, 1); }
          }
          if (sec.coolant && (t === TILE.FLOOR || t === TILE.GRATE)) {
            c.fillStyle = 'rgba(150,220,255,0.16)';
            c.fillRect(px, py, TS, TS);
            c.fillStyle = 'rgba(230,250,255,0.35)';
            c.fillRect(px + ((x * 3) % 10), py + ((y * 7) % 12), 4, 1);
          }
        }
        const g = m.gas[i];
        if (g > 0) {
          const a = Math.min(0.55, g / 12);
          c.fillStyle = `rgba(150,210,90,${a})`;
          const wob = visible[i] ? Math.sin(now / 500 + x + y) * 2 : 0;
          c.fillRect(px - 1 + wob, py - 1, TS + 2, TS + 2);
        }
        const f = m.fire[i];
        if (f > 0) {
          const flick = visible[i] ? fr + x * 3 + y * 5 : x + y;
          c.fillStyle = 'rgba(255,90,20,0.35)';
          c.fillRect(px, py, TS, TS);
          for (let k = 0; k < 4; k++) {
            const h = 4 + ((flick * (k + 3)) % 7);
            const fx = px + 1 + k * 4;
            c.fillStyle = k % 2 ? '#ff7a1a' : '#ffb347';
            c.fillRect(fx, py + TS - h, 3, h);
            c.fillStyle = '#fff2b0';
            c.fillRect(fx + 1, py + TS - Math.floor(h / 2), 1, Math.floor(h / 2));
          }
        }
      }
    }
  }

  private drawActor(st: RunState, c: CanvasRenderingContext2D, a: Actor, now: number, isP: boolean): void {
    const an = this.anims.get(a.id);
    if (!an) return;
    const d = hasEnemy(a.def) ? enemyDef(a.def) : null;
    const set = this.spriteOf(st, a);
    const s = isP || a.npc ? 1 : (d?.sprite.scale ?? 1);
    const w = 16 * s;
    let x = an.dx + (TS - w) / 2;
    let y = an.dy + (TS - w);
    if (an.lunge) {
      const k = (now - an.lunge.t0) / 160;
      if (k >= 1) an.lunge = undefined;
      else { const o = Math.sin(k * Math.PI) * 4; x += an.lunge.dx * o; y += an.lunge.dy * o; }
    }
    // flotar (voladores) y deriva
    if (d?.flying || (isP && st.player.drifting)) y += Math.round(Math.sin(now / 260 + a.id) * 1.5) - 1;
    const frame = Math.floor((now + a.id * 137) / 520) % 2;
    // sombra
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(an.dx + 3, an.dy + 13, 10, 2);
    if (s > 1) { c.fillRect(an.dx + 8 - w / 2 + 4, an.dy + 13, w - 8, 3); }
    const hurt = an.hurt && now - an.hurt < 110;
    if (a.phantom) c.globalAlpha = 0.85 + Math.sin(now / 70) * 0.1;
    if (a.status.cloak > 0) c.globalAlpha = 0.3;
    if (isP && st.player.cloak > 0) c.globalAlpha = 0.35;
    // aura de élite
    if (a.elite) {
      c.fillStyle = ELITE_COLORS[a.elite] ?? '#ffffff';
      c.globalAlpha = 0.35 + 0.2 * Math.sin(now / 200);
      c.fillRect(x - 1, y + w - 3, w + 2, 2);
      c.globalAlpha = 1;
    }
    // facing: espejo si mira al oeste
    const flip = a.facing === 5 || a.facing === 6 || a.facing === 7;
    const img = hurt ? set.flash : set.frames[frame];
    if (flip) {
      c.save();
      c.translate(Math.round(x + w), Math.round(y));
      c.scale(-1, 1);
      c.drawImage(img, 0, 0, w, w);
      c.restore();
    } else {
      c.drawImage(img, Math.round(x), Math.round(y), w, w);
    }
    c.globalAlpha = 1;
    if (a.status.stun > 0 || a.status.slow > 0 || a.status.rooted > 0) {
      c.fillStyle = a.status.stun > 0 ? '#ffd166' : a.status.rooted > 0 ? '#a6d96a' : '#bfe8ff';
      const k = Math.floor(now / 120) % 4;
      c.fillRect(an.dx + 4 + k * 2, an.dy - 1, 1, 1);
      c.fillRect(an.dx + 11 - k * 2, an.dy, 1, 1);
    }
    if (st.map.fire[a.y * st.map.w + a.x] > 0) {
      c.fillStyle = Math.floor(now / 80) % 2 ? '#ff7a1a' : '#ffd166';
      c.fillRect(an.dx + 5, an.dy + 2, 2, 3); c.fillRect(an.dx + 10, an.dy + 4, 2, 2);
    }
    if (isP && st.player.flashlight) {
      // pequeña lente
      c.fillStyle = '#fff6c0';
      c.fillRect(an.dx + 8 + (DIRX[a.facing] ?? 0) * 5, an.dy + 7 + (DIRY[a.facing] ?? 0) * 3, 1, 1);
    }
  }

  private drawSensed(c: CanvasRenderingContext2D, a: Actor, now: number): void {
    const k = (Math.sin(now / 200 + a.id) + 1) / 2;
    c.strokeStyle = `rgba(255,90,90,${0.3 + 0.4 * k})`;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(a.x * TS + 8, a.y * TS + 8, 4 + k * 2, 0, Math.PI * 2);
    c.stroke();
  }

  private drawActorHud(st: RunState, c: CanvasRenderingContext2D, a: Actor, now: number): void {
    const an = this.anims.get(a.id);
    if (!an) return;
    if (a.faction === 'enemy' && a.maxHp > 0 && a.hp < a.maxHp && !a.boss) {
      const w = 12;
      c.fillStyle = '#000';
      c.fillRect(an.dx + 2, an.dy - 3, w, 2);
      c.fillStyle = a.hp / a.maxHp > 0.5 ? '#ff7a5a' : '#ff3030';
      c.fillRect(an.dx + 2, an.dy - 3, Math.max(1, Math.round(w * a.hp / a.maxHp)), 2);
    }
    if (a.faction === 'enemy') {
      const mode = a.ai.mode;
      if (mode === 'hunt' || mode === 'alert') {
        const bob = Math.round(Math.sin(now / 150) * 1);
        c.font = 'bold 8px monospace';
        c.textAlign = 'center';
        c.fillStyle = '#000';
        c.fillText(mode === 'hunt' ? '!' : '?', an.dx + 9, an.dy - 4 + bob);
        c.fillStyle = mode === 'hunt' ? '#ff4b4b' : '#ffd166';
        c.fillText(mode === 'hunt' ? '!' : '?', an.dx + 8, an.dy - 5 + bob);
      }
    } else if (a.faction === 'ally') {
      c.fillStyle = '#7dff9a';
      c.fillRect(an.dx + 7, an.dy - 2, 2, 2);
    }
    void st;
  }

  private drawGlow(st: RunState, c: CanvasRenderingContext2D, lights: { x: number; y: number; r: number; color: string; k: number }[], visible: Uint8Array, x0: number, y0: number, x1: number, y1: number, now: number): void {
    const m = st.map;
    c.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      if (L.x < x0 - L.r || L.x > x1 + L.r || L.y < y0 - L.r || L.y > y1 + L.r) continue;
      const i = L.y * m.w + L.x;
      if (!visible[i] && L.color !== 'flash') continue;
      if (L.color === 'amb' || L.color === 'flash') continue;
      const rgb = LIGHT_RGB[L.color] ?? LIGHT_RGB.amb;
      let k = L.k * 0.22;
      if (this.opts.flicker && (L.color === 'fire' || L.color === 'emer' || L.color === 'flare')) k *= 0.8 + 0.2 * Math.sin(now / (L.color === 'emer' ? 400 : 60) + L.x * 3 + L.y);
      const cx = L.x * TS + 8; const cy = L.y * TS + 8; const r = (L.r + 0.5) * TS;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${k})`);
      g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      c.fillStyle = g;
      c.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    c.globalCompositeOperation = 'source-over';
  }

  private drawMask(st: RunState, c: CanvasRenderingContext2D, visible: Uint8Array, light: Float32Array, night: boolean, pl: Actor | undefined): void {
    const m = st.map;
    const data = this.maskData!;
    const d = data.data;
    const pal = this.palette(st);
    const fogRgb = hexRgb(shadeHex(pal.fog, 0.05));
    const hc = this.opts.highContrast;
    const memA = hc ? 150 : 185;
    for (let i = 0; i < m.w * m.h; i++) {
      const o = i * 4;
      if (visible[i]) {
        const x = i % m.w; const y = (i / m.w) | 0;
        const close = pl ? Math.max(Math.abs(x - pl.x), Math.abs(y - pl.y)) <= BAL.closeSight : false;
        let b = light[i] * 1.25 + (night ? 0.4 : 0) + (close ? 0.28 : 0);
        if (light[i] < BAL.litThreshold && !night && !close) b = Math.min(b, 0.16);
        b = Math.max(0.08, Math.min(0.92, b + (hc ? 0.12 : 0)));
        d[o] = 0; d[o + 1] = 0; d[o + 2] = 4;
        d[o + 3] = Math.round((1 - b) * 255);
      } else if (m.seen[i]) {
        d[o] = fogRgb[0]; d[o + 1] = fogRgb[1]; d[o + 2] = fogRgb[2];
        d[o + 3] = memA;
      } else {
        d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 255;
      }
    }
    // en el exterior, el vacío desconocido deja ver las estrellas
    if (m.zone === 6) {
      for (let i = 0; i < m.w * m.h; i++) {
        if (m.tiles[i] === TILE.VOID && !visible[i]) d[i * 4 + 3] = Math.min(d[i * 4 + 3], 140);
      }
    }
    this.maskCtx.putImageData(data, 0, 0);
    c.imageSmoothingEnabled = true;
    // desenfoque suave sobre una copia pequeña (4 px por casilla): barato y sin bordes de cuadrícula
    if (this.opts.softLight) {
      const k = 4;
      if (this.maskHi.width !== m.w * k || this.maskHi.height !== m.h * k) { this.maskHi.width = m.w * k; this.maskHi.height = m.h * k; }
      const hc2 = this.maskHiCtx;
      hc2.clearRect(0, 0, m.w * k, m.h * k);
      hc2.imageSmoothingEnabled = true;
      hc2.filter = 'blur(2px)';
      hc2.drawImage(this.mask, 0, 0, m.w * k, m.h * k);
      hc2.filter = 'none';
      c.drawImage(this.maskHi, 0, 0, m.w * TS, m.h * TS);
    } else c.drawImage(this.mask, 0, 0, m.w * TS, m.h * TS);
    c.imageSmoothingEnabled = false;
    // bordes del mapa: negro duro
    c.fillStyle = '#000';
    c.fillRect(-TS * 40, -TS * 40, TS * 40, m.h * TS + TS * 80);
    c.fillRect(m.w * TS, -TS * 40, TS * 40, m.h * TS + TS * 80);
    c.fillRect(0, -TS * 40, m.w * TS, TS * 40);
    c.fillRect(0, m.h * TS, m.w * TS, TS * 40);
  }

  private drawOverlay(st: RunState, c: CanvasRenderingContext2D, ov: Overlay, now: number): void {
    if (ov.crosshair) {
      const x = ov.crosshair.x * TS; const y = ov.crosshair.y * TS;
      const r = 4 + Math.sin(now / 200) * 0.6;
      c.strokeStyle = 'rgba(255,230,160,0.85)';
      c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,230,160,0.9)';
      c.fillRect(x - 0.5, y - r - 3, 1, 3); c.fillRect(x - 0.5, y + r, 1, 3);
      c.fillRect(x - r - 3, y - 0.5, 3, 1); c.fillRect(x + r, y - 0.5, 3, 1);
    }
    if (ov.path && ov.path.length) {
      for (const p of ov.path) {
        c.fillStyle = ov.valid === false ? 'rgba(255,80,80,0.35)' : 'rgba(255,230,140,0.3)';
        c.fillRect(p.x * TS + 6, p.y * TS + 6, 4, 4);
      }
    }
    if (ov.cursor) {
      const { x, y } = ov.cursor;
      if (ov.aoe && ov.aoe > 0) {
        c.fillStyle = 'rgba(255,150,60,0.18)';
        c.fillRect((x - ov.aoe) * TS, (y - ov.aoe) * TS, (ov.aoe * 2 + 1) * TS, (ov.aoe * 2 + 1) * TS);
      }
      const k = Math.floor(now / 250) % 2;
      const col = ov.mode === 'target' || ov.mode === 'throw' ? (ov.valid === false ? '#ff5252' : '#ffd166') : '#9fe8ff';
      c.fillStyle = col;
      const px = x * TS; const py = y * TS; const L = 4 + k;
      c.fillRect(px - 1, py - 1, L, 1); c.fillRect(px - 1, py - 1, 1, L);
      c.fillRect(px + TS + 1 - L, py - 1, L, 1); c.fillRect(px + TS, py - 1, 1, L);
      c.fillRect(px - 1, py + TS, L, 1); c.fillRect(px - 1, py + TS + 1 - L, 1, L);
      c.fillRect(px + TS + 1 - L, py + TS, L, 1); c.fillRect(px + TS, py + TS + 1 - L, 1, L);
    }
    void st;
  }

  private drawScreenFx(st: RunState, now: number): void {
    const c = this.c;
    const W = this.canvas.width; const H = this.canvas.height;
    const pl = st.actors.find((a) => a.id === st.pid);
    // viñeta por daño y por poco oxígeno
    const hpk = pl ? pl.hp / Math.max(1, pl.maxHp) : 1;
    const stats = getStats(st);
    const o2k = st.player.o2 / Math.max(1, stats.maxO2);
    const flash = this.hurtFlash && now - this.hurtFlash < 250 ? 1 - (now - this.hurtFlash) / 250 : 0;
    const danger = Math.max(flash * 0.5, hpk < 0.3 ? (0.3 - hpk) * 1.2 : 0);
    if (danger > 0.01) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,0,0)');
      g.addColorStop(1, `rgba(180,0,0,${Math.min(0.55, danger)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    if (o2k < 0.25) {
      const pulse = this.opts.flicker ? 0.5 + 0.5 * Math.sin(now / 300) : 0.6;
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(0,30,80,0)');
      g.addColorStop(1, `rgba(0,20,60,${(0.25 - o2k) * 2.4 * pulse})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    // interferencia por ruido mental
    const noise = st.player.noise;
    if (this.opts.glitch && (noise >= 70 || now < this.glitchUntil)) {
      const amt = now < this.glitchUntil ? 1 : (noise - 70) / 30;
      if (Math.random() < 0.08 + amt * 0.25) {
        const n = 1 + Math.floor(Math.random() * 3 * amt + 1);
        for (let i = 0; i < n; i++) {
          const y = Math.floor(Math.random() * H);
          const h = 4 + Math.floor(Math.random() * 30);
          const off = Math.floor((Math.random() - 0.5) * 30 * amt);
          c.drawImage(this.canvas, 0, y, W, h, off, y, W, h);
        }
        c.fillStyle = `rgba(196,140,255,${0.04 + amt * 0.06})`;
        c.fillRect(0, 0, W, H);
      }
    }
  }
}

const DIRX = [0, 1, 1, 1, 0, -1, -1, -1];
const DIRY = [-1, -1, 0, 1, 1, 1, 0, -1];

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
