/** Utilidades de píxel: rejillas con contorno y sombreado automáticos, y RNG visual con semilla. */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d');
  if (!x) throw new Error('Canvas 2D no disponible');
  x.imageSmoothingEnabled = false;
  return x;
}

/** RNG visual (mulberry32), separado de la lógica. */
export function vrand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rejilla de índices: 0 vacío, 1 base, 2 sombra, 3 brillo, 4 ojo, 5 acento, 6 contorno. */
export class Grid {
  w: number;
  h: number;
  d: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h);
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }
  set(x: number, y: number, v: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = v;
  }
  rect(x: number, y: number, w: number, h: number, v = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, v = 1): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / (rx + 0.01);
        const dy = (y + 0.5 - cy) / (ry + 0.01);
        if (dx * dx + dy * dy <= 1) this.set(x, y, v);
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, v = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, v);
  }
  /** Sombra abajo-derecha y brillo arriba-izquierda sobre los píxeles base. */
  shade(): void {
    const copy = this.d.slice();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x] !== 1) continue;
        const up = y > 0 ? copy[(y - 1) * this.w + x] : 0;
        const left = x > 0 ? copy[y * this.w + x - 1] : 0;
        const down = y < this.h - 1 ? copy[(y + 1) * this.w + x] : 0;
        const right = x < this.w - 1 ? copy[y * this.w + x + 1] : 0;
        if (up === 0 || left === 0) this.d[y * this.w + x] = 3;
        else if (down === 0 || right === 0) this.d[y * this.w + x] = 2;
      }
    }
  }
  outline(): void {
    const copy = this.d.slice();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x] !== 0) continue;
        let n = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && copy[yy * this.w + xx] !== 0 && copy[yy * this.w + xx] !== 6) { n = true; break; }
        }
        if (n) this.d[y * this.w + x] = 6;
      }
    }
  }
  toCanvas(colors: string[], scale = 1): HTMLCanvasElement {
    const c = makeCanvas(this.w * scale, this.h * scale);
    const x = ctx2d(c);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const v = this.d[j * this.w + i];
        if (!v) continue;
        x.fillStyle = colors[v];
        x.fillRect(i * scale, j * scale, scale, scale);
      }
    }
    return c;
  }
}

export function shadeHex(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255; let g = (n >> 8) & 255; let b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16); const nb = parseInt(b.slice(1), 16);
  const r = ((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t;
  const g = ((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t;
  const bl = (na & 255) * (1 - t) + (nb & 255) * t;
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)).toString(16).slice(1)}`;
}
