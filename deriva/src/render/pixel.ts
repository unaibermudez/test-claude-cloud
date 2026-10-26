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

// ---------------------------------------------------------------- pintor con luz (1.2)

export interface PaintOpts {
  /** Color base de cada valor de la rejilla (null = vacío). */
  color: (v: number) => string | null;
  /** Valores que emiten luz: no se sombrean y tiñen un poco a sus vecinos. */
  emissive?: (v: number) => boolean;
  /** Valores brillantes (metal, cristal): reciben un destello en la esquina iluminada. */
  shiny?: (v: number) => boolean;
  /** Luz de contorno fría en el lado derecho (criaturas). */
  rim?: string;
  /** Degradado vertical: oscurece la parte baja del sprite (0..1). */
  gradient?: number;
  /** Escala de salida (píxeles de lienzo por celda). */
  scale?: number;
}

const WARM = '#fff4dc';
const COOL_SHADOW = '#1b1430';
const INK = '#06070a';

/** Tono de un color según su exposición a la luz (de -2, en sombra, a 2, iluminado). */
export function tone(base: string, e: number): string {
  if (e > 0) return mixHex(shadeHex(base, 0.1 * e), WARM, 0.12 * e);
  if (e < 0) return mixHex(shadeHex(base, 0.2 * e), COOL_SHADOW, 0.1 * -e);
  return base;
}

/**
 * Pinta una rejilla con luz desde arriba a la izquierda: varios tonos por material, contorno
 * de color («sel-out»: el borde toma el color oscurecido de lo que rodea), destellos en metal,
 * luz de contorno fría y halo de los emisores. Sustituye al sombreado plano de `shade/outline`.
 */
export function paint(g: Grid, o: PaintOpts): HTMLCanvasElement {
  const { w, h: hh } = g;
  const sc = o.scale ?? 1;
  const em = o.emissive ?? ((): boolean => false);
  const shiny = o.shiny ?? ((): boolean => false);
  const get = (x: number, y: number): number => g.get(x, y);
  const c = makeCanvas(w * sc, hh * sc);
  const x2 = ctx2d(c);
  // extensión vertical del dibujo, para el degradado
  let top = hh; let bot = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (get(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const span = Math.max(1, bot - top);
  const px = (x: number, y: number, col: string): void => { x2.fillStyle = col; x2.fillRect(x * sc, y * sc, sc, sc); };
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const v = get(x, y);
      if (!v) {
        // contorno: hueco junto a algo dibujado
        const n = [get(x, y - 1), get(x - 1, y), get(x + 1, y), get(x, y + 1)];
        const k = n.findIndex((q) => q !== 0);
        if (k < 0) continue;
        const nb = n[k];
        const base = o.color(nb);
        if (!base) continue;
        if (em(nb)) { px(x, y, mixHex(base, INK, 0.45)); continue; }
        // el lado inferior/derecho del dibujo (vecino arriba o a la izquierda) va más oscuro
        const lower = get(x, y - 1) !== 0 || get(x - 1, y) !== 0;
        px(x, y, mixHex(tone(base, -2), INK, lower ? 0.72 : 0.55));
        continue;
      }
      const base = o.color(v);
      if (!base) continue;
      if (em(v)) {
        const core = get(x, y - 1) === v && get(x, y + 1) === v && get(x - 1, y) === v && get(x + 1, y) === v;
        px(x, y, core ? mixHex(base, '#ffffff', 0.45) : mixHex(base, '#ffffff', 0.15));
        continue;
      }
      const up = get(x, y - 1); const lf = get(x - 1, y); const dn = get(x, y + 1); const rt = get(x + 1, y);
      let e = 0;
      if (!up || !lf) e += 1.5; else if (!get(x - 1, y - 1) || !get(x, y - 2) || !get(x - 2, y)) e += 0.6;
      if (!dn || !rt) e -= 1.3; else if (!get(x + 1, y + 1) || !get(x, y + 2)) e -= 0.5;
      // frontera entre materiales: el de abajo recibe luz, el de arriba hace sombra
      if (up && up !== v && !em(up)) e += 0.4;
      if (dn && dn !== v && !em(dn)) e -= 0.4;
      if (o.gradient) e -= o.gradient * Math.max(0, (y - top) / span - 0.45) * 2.2;
      let col = tone(base, Math.max(-2, Math.min(2, e)));
      if (shiny(v) && !up && !lf) col = mixHex(col, '#ffffff', 0.55);
      if (o.rim && !rt && (dn || y < bot)) col = mixHex(col, o.rim, 0.28);
      // resplandor de los emisores sobre lo que tienen al lado
      for (const q of [up, lf, dn, rt]) if (q && em(q)) { const ec = o.color(q); if (ec) col = mixHex(col, ec, 0.22); break; }
      px(x, y, col);
    }
  }
  return c;
}
