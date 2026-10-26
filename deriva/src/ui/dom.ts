/** Utilidades mínimas de DOM (sin frameworks). */
import type { CommandEvent } from '../input/input';
import { t } from '../i18n';

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function img(src: string, cls = ''): HTMLImageElement {
  const i = document.createElement('img');
  i.src = src;
  i.alt = '';
  if (cls) i.className = cls;
  return i;
}

/** Panel genérico de la pila de interfaz. */
export interface Panel {
  el: HTMLElement;
  onCommand?(e: CommandEvent): boolean | void;
  refresh?(): void;
  onClose?(): void;
  /** Si es true, los comandos no consumidos pasan al juego (p. ej. HUD de diálogo no modal). */
  passthrough?: boolean;
  id?: string;
}

/** Desplazamiento de pestaña pedido por el comando: Tab/Mayús+Tab o Q/E. 0 si no es un cambio de pestaña. */
export function tabDelta(e: CommandEvent): number {
  if (e.cmd === 'next' || e.code === 'KeyE') return 1;
  if (e.cmd === 'prev' || e.code === 'KeyQ') return -1;
  return 0;
}

const isField = (el: HTMLElement | undefined): el is HTMLInputElement =>
  !!el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text';

/**
 * Lista navegable con teclado: mantiene la selección y la marca con `.sel`.
 * - `cols`: número de columnas fijo o `'auto'` (se deducen de la posición en pantalla, para rejillas de tarjetas).
 * - `setRows`: formularios por filas (↑↓ cambian de fila, ←→ se mueven dentro de la fila).
 * - Inicio/Fin y RePág/AvPág saltan; con `numbered` las teclas 1–9 eligen y activan.
 * - Los campos de texto reciben el foco al seleccionarlos, así se puede escribir sin ratón.
 */
export class Nav {
  i = 0;
  items: HTMLElement[] = [];
  onSelect: ((i: number) => void) | null = null;
  cols: number | 'auto' = 1;
  numbered = false;
  private rowOf: number[] | null = null;

  set(items: HTMLElement[], keep = true): void {
    this.rowOf = null;
    this.setItems(items, keep);
  }

  /** Filas de un formulario: cada fila es un grupo horizontal. */
  setRows(rows: HTMLElement[][], keep = true): void {
    const flat: HTMLElement[] = [];
    const rowOf: number[] = [];
    rows.filter((r) => r.length).forEach((r, k) => { for (const el of r) { flat.push(el); rowOf.push(k); } });
    this.setItems(flat, keep);
    this.rowOf = rowOf;
  }

  private setItems(items: HTMLElement[], keep: boolean): void {
    this.items = items;
    if (!keep) this.i = 0;
    this.i = Math.max(0, Math.min(this.i, items.length - 1));
    if (this.disabled(this.i)) {
      const first = items.findIndex((_, k) => !this.disabled(k));
      if (first >= 0) this.i = first;
    }
    items.forEach((el, k) => {
      el.addEventListener('mouseenter', () => { this.i = k; this.mark(); this.onSelect?.(k); });
      if (this.numbered && k < 9 && !el.querySelector(':scope > .kn')) el.prepend(h('span', { class: 'kn', 'aria-hidden': 'true' }, String(k + 1)));
    });
    this.mark();
  }

  private disabled(k: number): boolean {
    return !!(this.items[k] as HTMLButtonElement | undefined)?.disabled;
  }

  mark(): void {
    this.items.forEach((el, k) => el.classList.toggle('sel', k === this.i));
    const el = this.items[this.i];
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    const act = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null;
    if (isField(el)) {
      const focus = (): void => { if (this.items[this.i] === el && document.activeElement !== el) { el.focus({ preventScroll: true }); el.select(); } };
      // el panel aún puede no estar en el documento (se construye antes de mostrarse)
      if (el.isConnected) focus(); else setTimeout(focus, 0);
    } else if (act && isField(act) && this.items.includes(act)) act.blur();
  }

  private go(k: number): void {
    this.i = k;
    this.mark();
    this.onSelect?.(this.i);
  }

  move(d: number): void {
    if (!this.items.length) return;
    let k = 0;
    let i = this.i;
    do {
      i = (i + d + this.items.length) % this.items.length;
    } while (this.disabled(i) && ++k < this.items.length);
    this.go(i);
  }

  /** Salto sin dar la vuelta (RePág/AvPág, Inicio/Fin). */
  jump(d: number): void {
    if (!this.items.length) return;
    let i = Math.max(0, Math.min(this.items.length - 1, this.i + d));
    const step = d > 0 ? -1 : 1;
    while (this.disabled(i) && i !== this.i) i += step;
    this.go(i);
  }

  private moveRow(d: number): void {
    const rows = this.rowOf!;
    const nRows = rows[rows.length - 1] + 1;
    const r = rows[this.i];
    const col = this.i - rows.indexOf(r);
    for (let s = 1; s <= nRows; s++) {
      const tr = (r + d * s + nRows * s) % nRows;
      const idx = rows.map((x, k) => (x === tr ? k : -1)).filter((k) => k >= 0 && !this.disabled(k));
      if (idx.length) { this.go(idx[Math.min(col, idx.length - 1)]); return; }
    }
  }

  /** Movimiento vertical por geometría (rejillas cuyo número de columnas depende del ancho). */
  private moveGeo(d: number): void {
    const cur = this.items[this.i]?.getBoundingClientRect();
    if (!cur || (cur.width === 0 && cur.height === 0)) { this.move(d); return; }
    const cx = cur.left + cur.width / 2;
    let best = -1; let bestScore = Infinity;
    this.items.forEach((el, k) => {
      if (k === this.i || this.disabled(k)) return;
      const r = el.getBoundingClientRect();
      const dy = d > 0 ? r.top - cur.bottom : cur.top - r.bottom;
      if (dy < -2) return;
      const score = dy * 4 + Math.abs(r.left + r.width / 2 - cx);
      if (score < bestScore) { bestScore = score; best = k; }
    });
    if (best >= 0) { this.go(best); return; }
    // dar la vuelta: fila opuesta, columna más cercana
    let edge = d > 0 ? Infinity : -Infinity;
    this.items.forEach((el) => { const tp = el.getBoundingClientRect().top; edge = d > 0 ? Math.min(edge, tp) : Math.max(edge, tp); });
    this.items.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.top - edge) > 2 || this.disabled(k)) return;
      const score = Math.abs(r.left + r.width / 2 - cx);
      if (score < bestScore) { bestScore = score; best = k; }
    });
    if (best >= 0) this.go(best);
  }

  private multiCol(): boolean {
    if (this.cols !== 'auto') return this.cols > 1;
    const tops = new Set(this.items.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().top)));
    return tops.size < Math.min(4, this.items.length);
  }

  /** Gestiona flechas, saltos, números y confirmación; devuelve true si consumió el comando. */
  handle(e: CommandEvent): boolean {
    if (!this.items.length) return false;
    switch (e.code) {
      case 'Home': this.jump(-this.items.length); return true;
      case 'End': this.jump(this.items.length); return true;
      case 'PageUp': this.jump(-6); return true;
      case 'PageDown': this.jump(6); return true;
    }
    switch (e.cmd) {
      case 'num': {
        if (!this.numbered || e.num === undefined || e.num < 1 || e.num > Math.min(9, this.items.length)) return false;
        const k = e.num - 1;
        if (this.disabled(k)) return true;
        this.go(k);
        this.items[k].click();
        return true;
      }
      case 'up': case 'down': {
        const d = e.cmd === 'up' ? -1 : 1;
        if (this.rowOf) this.moveRow(d);
        else if (this.cols === 'auto') this.moveGeo(d);
        else this.move(d * this.cols);
        return true;
      }
      case 'left': case 'right': {
        const d = e.cmd === 'left' ? -1 : 1;
        if (this.rowOf) {
          const r = this.rowOf[this.i];
          const same = this.rowOf.map((x, k) => (x === r ? k : -1)).filter((k) => k >= 0);
          if (same.length < 2) return false;
          const pos = same.indexOf(this.i);
          this.go(same[(pos + d + same.length) % same.length]);
          return true;
        }
        if (this.multiCol()) { this.move(d); return true; }
        return false;
      }
      case 'confirm': case 'interact': {
        const el = this.items[this.i];
        if (isField(el)) {
          // Intro dentro de un campo: pasar a lo siguiente (como en un formulario)
          if (e.fromField) { if (this.rowOf) this.moveRow(1); else this.move(1); } else el.focus();
          return true;
        }
        if (el && !this.disabled(this.i)) el.click();
        return true;
      }
      default: return false;
    }
  }

  get current(): HTMLElement | undefined {
    return this.items[this.i];
  }
}

/** Desplaza el cuerpo de un panel de solo lectura con flechas, RePág/AvPág e Inicio/Fin. */
export function scrollBody(el: HTMLElement, e: CommandEvent): void {
  const page = el.clientHeight * 0.85;
  if (e.code === 'Home') el.scrollTop = 0;
  else if (e.code === 'End') el.scrollTop = el.scrollHeight;
  else if (e.code === 'PageUp') el.scrollTop -= page;
  else if (e.code === 'PageDown') el.scrollTop += page;
  else if (e.cmd === 'up') el.scrollTop -= 60;
  else if (e.cmd === 'down') el.scrollTop += 60;
}

/** Nombres de teclas fijas de la interfaz (no reasignables). */
export const KEY = {
  enter: (): string => t('ui.key.enter'),
  esc: (): string => t('ui.key.esc'),
  space: (): string => t('ui.key.space'),
  arrows: '↑↓',
  lr: '←→',
  tabs: 'Q / E',
};

/** Fila de ayuda de teclas para el pie de los paneles. `@cmd` usa la tecla asignada a ese comando. */
export function keyHints(label: (cmd: string) => string, pairs: [string | string[], string][]): HTMLElement {
  const cap = (k: string): HTMLElement => h('kbd', {}, k.startsWith('@') ? label(k.slice(1)) : k);
  return h('div', { class: 'keyhints' }, ...pairs.map(([keys, text]) =>
    h('span', { class: 'kh' }, ...(Array.isArray(keys) ? keys : [keys]).map(cap), h('span', {}, text))));
}

export function panelShell(title: string, opts: { cls?: string; tabs?: HTMLElement; footer?: Child[]; onClose?: () => void } = {}): { root: HTMLElement; body: HTMLElement; header: HTMLElement; footer: HTMLElement } {
  const body = h('div', { class: 'body' });
  const footer = h('footer', {}, ...(opts.footer ?? []));
  const header = h('header', {}, h('h2', {}, title), opts.tabs ?? null,
    opts.onClose ? h('button', { class: 'btn', onclick: () => opts.onClose!(), 'aria-label': 'close' }, '✕') : null);
  const panel = h('div', { class: `panel ${opts.cls ?? ''}`, role: 'dialog', 'aria-label': title }, header, body, footer);
  const root = h('div', { class: 'overlay' }, panel);
  return { root, body, header, footer };
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
