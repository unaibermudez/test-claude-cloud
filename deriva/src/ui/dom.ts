/** Utilidades mínimas de DOM (sin frameworks). */
import type { CommandEvent } from '../input/input';

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

/** Lista navegable con teclado: mantiene la selección y la marca con `.sel`. */
export class Nav {
  i = 0;
  items: HTMLElement[] = [];
  onSelect: ((i: number) => void) | null = null;
  cols = 1;

  set(items: HTMLElement[], keep = true): void {
    this.items = items;
    if (!keep) this.i = 0;
    this.i = Math.max(0, Math.min(this.i, items.length - 1));
    if ((items[this.i] as HTMLButtonElement | undefined)?.disabled) {
      const first = items.findIndex((el) => !(el as HTMLButtonElement).disabled);
      if (first >= 0) this.i = first;
    }
    items.forEach((el, k) => {
      el.addEventListener('mouseenter', () => { this.i = k; this.mark(); this.onSelect?.(k); });
    });
    this.mark();
  }

  mark(): void {
    this.items.forEach((el, k) => el.classList.toggle('sel', k === this.i));
    const el = this.items[this.i];
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }

  move(d: number): void {
    if (!this.items.length) return;
    let k = 0;
    do {
      this.i = (this.i + d + this.items.length) % this.items.length;
    } while ((this.items[this.i] as HTMLButtonElement).disabled && ++k < this.items.length);
    this.mark();
    this.onSelect?.(this.i);
  }

  /** Gestiona flechas y confirmación; devuelve true si consumió el comando. */
  handle(e: CommandEvent): boolean {
    switch (e.cmd) {
      case 'up': this.move(-this.cols); return true;
      case 'down': this.move(this.cols); return true;
      case 'left': if (this.cols > 1) { this.move(-1); return true; } return false;
      case 'right': if (this.cols > 1) { this.move(1); return true; } return false;
      case 'confirm': case 'interact': {
        const el = this.items[this.i];
        if (el && !(el as HTMLButtonElement).disabled) el.click();
        return true;
      }
      default: return false;
    }
  }

  get current(): HTMLElement | undefined {
    return this.items[this.i];
  }
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
