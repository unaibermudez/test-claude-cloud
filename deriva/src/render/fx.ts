/**
 * Partículas, trazadores y números flotantes. Puramente visual: usa su propio RNG y el reloj real.
 */
import { TS } from './tiles';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number;
  grav: number; drag: number; glow?: boolean;
}

export interface Tracer { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; color: string; kind: 'line' | 'arc' | 'throw' | 'ring' | 'flash'; r?: number }

export interface Floater { x: number; y: number; text: string; color: string; t0: number; big?: boolean }

let seed = 12345;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const C = (x: number): number => x * TS + TS / 2;

export class FxSystem {
  parts: Particle[] = [];
  tracers: Tracer[] = [];
  floaters: Floater[] = [];
  intensity = 1;

  burst(x: number, y: number, n: number, colors: string[], speed: number, o: Partial<Particle> = {}): void {
    n = Math.max(1, Math.round(n * this.intensity));
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const s = speed * (0.3 + rnd() * 0.9);
      const max = (o.max ?? 500) * (0.6 + rnd() * 0.6);
      this.parts.push({
        x: x + (rnd() - 0.5) * 4, y: y + (rnd() - 0.5) * 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: max, max, color: colors[Math.floor(rnd() * colors.length)], size: o.size ?? 1 + Math.floor(rnd() * 2),
        grav: o.grav ?? 0, drag: o.drag ?? 0.92, glow: o.glow,
      });
    }
  }

  stream(x: number, y: number, tx: number, ty: number, n: number, colors: string[], speed: number): void {
    const a0 = Math.atan2(ty - y, tx - x);
    n = Math.max(1, Math.round(n * this.intensity));
    for (let i = 0; i < n; i++) {
      const a = a0 + (rnd() - 0.5) * 0.7;
      const s = speed * (0.5 + rnd());
      const max = 300 + rnd() * 300;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color: colors[Math.floor(rnd() * colors.length)], size: 1, grav: 0, drag: 0.97 });
    }
  }

  /** Traduce un evento `fx` de la lógica (coordenadas de casilla) en efectos. */
  spawn(id: string, x: number, y: number, now: number, tx?: number, ty?: number, n?: number, color?: string): void {
    const px = C(x); const py = C(y);
    const tpx = tx !== undefined ? C(tx) : px; const tpy = ty !== undefined ? C(ty) : py;
    switch (id) {
      case 'blood': this.burst(px, py, 7, ['#8a1a1a', '#c02a2a', '#5a0f0f'], 0.09, { grav: 0.0004, max: 600 }); break;
      case 'sparks': this.burst(px, py, 9, ['#fff6c0', '#ffd166', '#ff9d40'], 0.14, { grav: 0.0005, max: 400, glow: true }); break;
      case 'impact': this.burst(px, py, 5, ['#b8c0cc', '#6a6f78'], 0.06, { max: 350 }); break;
      case 'shot':
        this.tracers.push({ x0: px, y0: py, x1: tpx, y1: tpy, t0: now, dur: 110, color: color ?? '#fff2b0', kind: 'line' });
        this.burst(px, py, 3, ['#fff6c0', '#ffb347'], 0.05, { max: 160, glow: true });
        break;
      case 'arc':
        this.tracers.push({ x0: px, y0: py, x1: tpx, y1: tpy, t0: now, dur: 180, color: '#9ff6ff', kind: 'arc' });
        this.burst(tpx, tpy, 6, ['#bff6ff', '#7af0ff'], 0.1, { max: 300, glow: true });
        break;
      case 'cone': this.stream(px, py, tpx, tpy, 22, [color ?? '#ffb347', '#ff7a3c', '#fff2b0'], 0.18); break;
      case 'throw': this.tracers.push({ x0: px, y0: py, x1: tpx, y1: tpy, t0: now, dur: 260, color: color ?? '#d8dde4', kind: 'throw' }); break;
      case 'explosion': {
        const r = (n ?? 1) + 0.5;
        this.tracers.push({ x0: px, y0: py, x1: px, y1: py, t0: now, dur: 380, color: '#ffd166', kind: 'ring', r: r * TS });
        this.tracers.push({ x0: px, y0: py, x1: px, y1: py, t0: now, dur: 140, color: '#fff6e0', kind: 'flash', r: r * TS });
        this.burst(px, py, 26, ['#ffd166', '#ff7a3c', '#ff4b2b', '#fff6c0'], 0.2, { max: 600, glow: true });
        this.burst(px, py, 14, ['#3a3a3a', '#555', '#222'], 0.05, { max: 1200, size: 2, drag: 0.96 });
        break;
      }
      case 'emp': {
        const r = (n ?? 1) + 0.5;
        this.tracers.push({ x0: px, y0: py, x1: px, y1: py, t0: now, dur: 420, color: '#7af0ff', kind: 'ring', r: r * TS });
        this.burst(px, py, 18, ['#bff6ff', '#7af0ff', '#ffffff'], 0.16, { max: 450, glow: true });
        break;
      }
      case 'death': this.burst(px, py, 12, ['#5a0f0f', '#8a1a1a', '#3a3a3a'], 0.07, { grav: 0.0003, max: 800, size: 2 }); break;
      case 'explode_small': this.burst(px, py, 14, ['#fff6c0', '#ffd166', '#555'], 0.12, { max: 600, glow: true }); break;
      case 'decompress': case 'ejected': case 'pull': case 'thrust':
        this.stream(px, py, tpx !== px || tpy !== py ? tpx : px + 1, tpy, 18, ['#e8f4ff', '#a9c2da', '#ffffff'], 0.22);
        break;
      case 'teleport': case 'phase': case 'phantom':
        this.burst(px, py, 14, ['#c48cff', '#ff3f8e', '#e8d8ff'], 0.08, { max: 500, size: 2, glow: true });
        break;
      case 'heal': this.burst(px, py, 10, ['#7dff9a', '#c8ffd0'], 0.03, { grav: -0.0002, max: 800, glow: true }); break;
      case 'shield':
        this.tracers.push({ x0: px, y0: py, x1: px, y1: py, t0: now, dur: 300, color: '#7ab6ff', kind: 'ring', r: TS * 0.9 });
        break;
      case 'scream':
        this.tracers.push({ x0: px, y0: py, x1: px, y1: py, t0: now, dur: 600, color: '#ff3f8e', kind: 'ring', r: TS * 5 });
        break;
      case 'summon': this.burst(px, py, 16, ['#c48cff', '#5a2a8a', '#ffffff'], 0.06, { max: 700, glow: true }); break;
      case 'foam': this.burst(px, py, 16, ['#e0f0f0', '#ffffff', '#b8c8c8'], 0.06, { max: 900, size: 2, drag: 0.9 }); break;
      case 'glass': this.burst(px, py, 14, ['#bfe8ff', '#ffffff', '#7f93c9'], 0.13, { max: 700, grav: 0.0003 }); break;
      case 'drain': this.stream(px, py, tpx, tpy, 10, ['#7fc4e0', '#bfe8ff'], 0.1); break;
      case 'spores': this.burst(px, py, 14, ['#a6d96a', '#c2dca0', '#6a9a4a'], 0.04, { max: 1400, drag: 0.98 }); break;
      case 'fire': this.burst(px, py, 10, ['#ffd166', '#ff7a3c', '#ff4b2b'], 0.06, { grav: -0.0003, max: 500, glow: true }); break;
      default: this.burst(px, py, 6, [color ?? '#d8dde4', '#8a8f99'], 0.05, { max: 400 }); break;
    }
  }

  number(x: number, y: number, text: string, color: string, now: number, big = false): void {
    // apila números en la misma casilla
    let off = 0;
    for (const f of this.floaters) if (Math.abs(f.x - C(x)) < 4 && now - f.t0 < 300) off += 7;
    this.floaters.push({ x: C(x) + (rnd() - 0.5) * 4, y: C(y) - 6 - off, text, color, t0: now, big });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt / 16);
      p.vx *= k; p.vy *= k;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.parts.length > 1500) this.parts.splice(0, this.parts.length - 1500);
  }

  drawParticles(c: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    c.globalAlpha = 1;
  }

  drawTracers(c: CanvasRenderingContext2D, now: number): void {
    this.tracers = this.tracers.filter((t) => now - t.t0 < t.dur);
    for (const t of this.tracers) {
      const k = (now - t.t0) / t.dur;
      c.globalAlpha = 1 - k;
      c.strokeStyle = t.color;
      c.fillStyle = t.color;
      c.lineWidth = 1;
      if (t.kind === 'line') {
        c.beginPath(); c.moveTo(t.x0, t.y0); c.lineTo(t.x1, t.y1); c.stroke();
      } else if (t.kind === 'arc') {
        c.beginPath(); c.moveTo(t.x0, t.y0);
        const n = 6;
        for (let i = 1; i < n; i++) {
          const f = i / n;
          c.lineTo(t.x0 + (t.x1 - t.x0) * f + (rnd() - 0.5) * 8, t.y0 + (t.y1 - t.y0) * f + (rnd() - 0.5) * 8);
        }
        c.lineTo(t.x1, t.y1); c.stroke();
      } else if (t.kind === 'throw') {
        c.globalAlpha = 1;
        const x = t.x0 + (t.x1 - t.x0) * k;
        const y = t.y0 + (t.y1 - t.y0) * k - Math.sin(k * Math.PI) * 14;
        c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      } else if (t.kind === 'ring') {
        c.beginPath(); c.arc(t.x0, t.y0, Math.max(1, (t.r ?? 16) * (0.3 + 0.7 * k)), 0, Math.PI * 2); c.lineWidth = 2; c.stroke();
      } else if (t.kind === 'flash') {
        c.globalAlpha = 0.6 * (1 - k);
        c.beginPath(); c.arc(t.x0, t.y0, t.r ?? 16, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  drawFloaters(c: CanvasRenderingContext2D, now: number, font: string): void {
    this.floaters = this.floaters.filter((f) => now - f.t0 < 900);
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const f of this.floaters) {
      const k = (now - f.t0) / 900;
      const y = f.y - k * 12;
      c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      c.fillStyle = '#000';
      c.fillText(f.text, f.x + 1, y + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, y);
    }
    c.globalAlpha = 1;
  }

  clear(): void {
    this.parts = []; this.tracers = []; this.floaters = [];
  }
}
