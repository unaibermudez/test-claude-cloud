/**
 * Modo de tiempo real: el jugador se mueve libremente (posición continua con colisiones circulares
 * contra el escenario) y el mundo avanza solo con un reloj fijo. Por debajo, la lógica sigue siendo
 * la misma simulación determinista: cada cambio de casilla es un paso libre (`move` con `free`),
 * cada golpe o acción consume su tiempo y el reloj emite `wait` a intervalos regulares.
 */
import type { App } from './app';
import type { RunState } from '../core/state';
import { TILE } from '../core/state';
import { getPlayer, actorAt, hostile } from '../core/actors';
import { passable, doorAt, tileAt } from '../core/map';
import { sneakCost, rangedInfo } from '../core/player';
import { getVision } from '../core/vision';
import { DIRS, chebyshev } from '../core/geom';
import { itemDef } from '../data/items';

const R = 0.3; // radio del jugador en casillas

export const TICK_MS: Record<string, number> = { slow: 400, normal: 300, fast: 230 };

function octant(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx); // 0 = este
  const o = Math.round(a / (Math.PI / 4));
  // DIRS: 0 N, 1 NE, 2 E, 3 SE, 4 S, 5 SW, 6 W, 7 NW
  return ((o + 2) % 8 + 8) % 8;
}

export class RealTime {
  px = 0;
  py = 0;
  private tickAcc = 0;
  private actCd = 0;
  private lastFacing = -1;
  aim: { x: number; y: number } | null = null; // en casillas (coordenadas continuas)
  private lastRun: RunState | null = null;
  private lastFloor = -1;
  moving = false;

  constructor(private app: App) {}

  tickMs(): number {
    return TICK_MS[this.app.settings.rtSpeed] ?? 300;
  }

  /** Coloca la posición continua en el centro de la casilla lógica del jugador. */
  sync(st: RunState): void {
    const p = getPlayer(st);
    this.px = p.x + 0.5;
    this.py = p.y + 0.5;
    this.lastRun = st;
    this.lastFloor = st.floorNo;
  }

  private solid(st: RunState, tx: number, ty: number): boolean {
    const m = st.map;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
    const p = getPlayer(st);
    if (tx === p.x && ty === p.y) return false;
    const a = actorAt(st, tx, ty);
    if (a && a.id !== st.pid && !a.dead) return true;
    if (m.zone === 6 && tileAt(m, tx, ty) === TILE.VOID) return false;
    return !passable(m, tx, ty);
  }

  /** ¿Choca un círculo de radio R centrado en (x, y) con algo sólido? Devuelve la casilla sólida. */
  private hit(st: RunState, x: number, y: number): { x: number; y: number } | null {
    for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) {
      for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
        if (!this.solid(st, tx, ty)) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) ** 2 + (y - cy) ** 2 < R * R) return { x: tx, y: ty };
      }
    }
    return null;
  }

  private canAct(): boolean {
    return this.actCd <= 0;
  }

  /** Ejecuta una acción con coste: reinicia el reloj (la acción ya ha hecho avanzar el mundo). */
  act(cost = 100): void {
    this.actCd = (this.tickMs() * cost) / 100;
    this.tickAcc = 0;
  }

  /** Choque contra algo sólido en la dirección de avance: golpear, abrir puertas, romper paredes. */
  private bump(st: RunState, tile: { x: number; y: number }): void {
    if (!this.canAct()) return;
    const p = getPlayer(st);
    const dx = Math.sign(tile.x - p.x); const dy = Math.sign(tile.y - p.y);
    if (dx === 0 && dy === 0) return;
    if (Math.abs(tile.x - p.x) > 1 || Math.abs(tile.y - p.y) > 1) return;
    const dir = DIRS.findIndex((d) => d.x === dx && d.y === dy);
    const occ = actorAt(st, tile.x, tile.y);
    const door = doorAt(st.map, tile.x, tile.y);
    const t = tileAt(st.map, tile.x, tile.y);
    if ((occ && (hostile(p, occ) || occ.phantom)) || (door && !door.open) || t === TILE.CRACKED) {
      const w = st.player.melee ? itemDef(st.player.melee.id).weapon : null;
      this.app.act({ t: 'move', dir });
      this.act(occ ? (w?.cost ?? 100) : 100);
    }
  }

  update(dt: number): void {
    const app = this.app;
    const st = app.run;
    if (!st || st.over) return;
    if (st !== this.lastRun || st.floorNo !== this.lastFloor) this.sync(st);
    const paused = app.stack.length > 0 || !!st.modal || !!app.targeting || app.screen !== 'run';
    if (paused) return;
    if (this.actCd > 0) this.actCd -= dt;
    const p = getPlayer(st);
    // la lógica movió al jugador (empujón, deslizamiento, salto, teletransporte): reajustar
    if (Math.floor(this.px) !== p.x || Math.floor(this.py) !== p.y) this.sync(st);
    // orientación hacia el ratón
    if (this.aim) {
      const o = octant(this.aim.x - this.px, this.aim.y - this.py);
      if (o !== p.facing && o !== this.lastFacing) { this.lastFacing = o; app.act({ t: 'face', dir: o }); }
    }
    // movimiento continuo
    const v = app.input.moveVector();
    const blocked = !!(p.status.stun || p.status.rooted || st.player.drifting);
    this.moving = false;
    if (!blocked && (v.x !== 0 || v.y !== 0)) {
      const speed = (100 / Math.max(50, sneakCost(st))) / (this.tickMs() / 1000);
      const step = Math.min(0.45, (speed * dt) / 1000);
      if (!this.aim) {
        const o = octant(v.x, v.y);
        if (o !== p.facing && o !== this.lastFacing) { this.lastFacing = o; app.act({ t: 'face', dir: o }); }
      }
      this.moveAxis(st, v.x * step, 0);
      if (!app.run || app.run.over) return;
      this.moveAxis(st, 0, v.y * step);
      this.moving = true;
    }
    // reloj del mundo
    this.tickAcc += dt;
    if (this.tickAcc >= this.tickMs() && this.canAct()) {
      this.tickAcc -= this.tickMs();
      if (this.tickAcc > this.tickMs()) this.tickAcc = 0;
      app.act({ t: 'wait' });
    }
  }

  private moveAxis(st: RunState, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const nx = this.px + dx; const ny = this.py + dy;
    const h = this.hit(st, nx, ny);
    if (h) {
      // deslizar pegado a la pared
      if (dx !== 0) this.px = dx > 0 ? Math.min(nx, h.x - R - 0.001) : Math.max(nx, h.x + 1 + R + 0.001);
      if (dy !== 0) this.py = dy > 0 ? Math.min(ny, h.y - R - 0.001) : Math.max(ny, h.y + 1 + R + 0.001);
      if (this.hit(st, this.px, this.py)) { this.px -= dx === 0 ? 0 : 0; }
      this.bump(st, h);
      this.clampToTile(st);
      return;
    }
    const p = getPlayer(st);
    const tx = Math.floor(nx); const ty = Math.floor(ny);
    if (tx !== p.x || ty !== p.y) {
      const ddx = Math.sign(tx - p.x); const ddy = Math.sign(ty - p.y);
      const dir = DIRS.findIndex((d) => d.x === ddx && d.y === ddy);
      this.app.act({ t: 'move', dir, free: true });
      const s2 = this.app.run;
      if (!s2) return;
      const p2 = getPlayer(s2);
      if (p2.x === tx && p2.y === ty) { this.px = nx; this.py = ny; }
      else if (Math.abs(p2.x - p.x) > 1 || Math.abs(p2.y - p.y) > 1 || (p2.x !== p.x || p2.y !== p.y)) this.sync(s2);
      return;
    }
    this.px = nx; this.py = ny;
  }

  /** Garantiza que la posición continua siga dentro de la casilla lógica. */
  private clampToTile(st: RunState): void {
    const p = getPlayer(st);
    this.px = Math.max(p.x + 0.001, Math.min(p.x + 0.999, this.px));
    this.py = Math.max(p.y + 0.001, Math.min(p.y + 0.999, this.py));
  }

  /** Ataque con el botón principal hacia el punto apuntado. */
  attackToward(x: number, y: number): void {
    const app = this.app;
    const st = app.run;
    if (!st || st.over || !this.canAct()) return;
    const p = getPlayer(st);
    const tx = Math.floor(x); const ty = Math.floor(y);
    const dir = octant(x - this.px, y - this.py);
    const d = DIRS[dir];
    const adj = actorAt(st, p.x + d.x, p.y + d.y);
    if (adj && (hostile(p, adj) || adj.phantom)) {
      const w = st.player.melee ? itemDef(st.player.melee.id).weapon : null;
      app.act({ t: 'move', dir });
      this.act(w?.cost ?? 100);
      return;
    }
    const info = rangedInfo(st);
    if (info.ok) {
      // objetivo: el enemigo visible más cercano al punto apuntado
      const v = getVision(st);
      let best: { x: number; y: number } | null = null; let bd = 1.6;
      for (const a of st.actors) {
        if (a.dead || a.id === st.pid || a.faction !== 'enemy' || !v.seenActors.has(a.id)) continue;
        const dd = Math.hypot(a.x + 0.5 - x, a.y + 0.5 - y);
        if (dd < bd) { bd = dd; best = { x: a.x, y: a.y }; }
      }
      const target = best ?? { x: tx, y: ty };
      if (target.x === p.x && target.y === p.y) return;
      app.act({ t: 'fire', x: target.x, y: target.y });
      const w = st.player.ranged ? itemDef(st.player.ranged.id).weapon : null;
      this.act(w?.cost ?? 100);
      return;
    }
    // sin arma a distancia: golpe al aire en esa dirección (solo orienta)
    app.act({ t: 'face', dir });
  }

  /** Disparo automático al enemigo visible más cercano (teclado y mando). */
  fireNearest(): boolean {
    const st = this.app.run;
    if (!st || !this.canAct()) return false;
    const p = getPlayer(st);
    const info = rangedInfo(st);
    if (!info.ok) return false;
    const v = getVision(st);
    const cands = st.actors.filter((a) => !a.dead && a.faction === 'enemy' && v.seenActors.has(a.id) && chebyshev(a.x, a.y, p.x, p.y) <= info.range + 2)
      .sort((a, b) => chebyshev(a.x, a.y, p.x, p.y) - chebyshev(b.x, b.y, p.x, p.y));
    const tg = cands[0];
    if (!tg) return false;
    this.app.act({ t: 'fire', x: tg.x, y: tg.y });
    const w = st.player.ranged ? itemDef(st.player.ranged.id).weapon : null;
    this.act(w?.cost ?? 100);
    return true;
  }
}
