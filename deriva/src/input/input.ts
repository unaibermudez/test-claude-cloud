/**
 * Entrada: teclado (remapeable), ratón y mando básico. Traduce todo a comandos con nombre;
 * la aplicación decide qué hace cada comando según la pantalla activa.
 */
export type Command =
  | 'up' | 'down' | 'left' | 'right' | 'upleft' | 'upright' | 'downleft' | 'downright'
  | 'wait' | 'interact' | 'fire' | 'throw' | 'pickup' | 'sneak' | 'light' | 'inventory' | 'implants'
  | 'map' | 'archive' | 'agora' | 'active' | 'rest' | 'help' | 'pause'
  | 'confirm' | 'cancel' | 'next' | 'prev' | 'shove' | 'door' | 'look' | 'drop' | 'fullscreen' | 'num';

export const DIR_OF: Partial<Record<Command, number>> = {
  up: 0, upright: 1, right: 2, downright: 3, down: 4, downleft: 5, left: 6, upleft: 7,
};

export interface CommandEvent { cmd: Command; shift: boolean; ctrl: boolean; num?: number; repeat: boolean; source: 'key' | 'pad' }

export type Handler = (e: CommandEvent) => boolean | void;

export class Input {
  binds: Record<string, string[]>;
  private codeMap = new Map<string, Command>();
  handler: Handler | null = null;
  /** Si está activo, la próxima tecla se entrega aquí (para reasignar controles). */
  capture: ((code: string) => void) | null = null;
  private lastMove = 0;
  private padPrev: boolean[] = [];
  private padDirT = 0;
  private padDir = -1;
  moveRepeatMs = 85;
  enabled = true;

  constructor(binds: Record<string, string[]>) {
    this.binds = binds;
    this.rebuild();
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('gamepadconnected', () => { this.padPrev = []; });
  }

  setBinds(b: Record<string, string[]>): void {
    this.binds = b;
    this.rebuild();
  }

  private rebuild(): void {
    this.codeMap.clear();
    for (const [cmd, codes] of Object.entries(this.binds)) for (const c of codes) this.codeMap.set(c, cmd as Command);
  }

  keyName(code: string): string {
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace('Arrow', '↑').replace('↑Up', '↑').replace('↑Down', '↓').replace('↑Left', '←').replace('↑Right', '→');
  }

  /** Primera tecla asignada a un comando, para mostrar en la ayuda. */
  label(cmd: string): string {
    const c = this.binds[cmd]?.[0];
    if (!c) return '—';
    if (c === 'ArrowUp') return '↑';
    if (c === 'ArrowDown') return '↓';
    if (c === 'ArrowLeft') return '←';
    if (c === 'ArrowRight') return '→';
    if (c === 'Space') return 'Espacio';
    if (c === 'Escape') return 'Esc';
    return this.keyName(c);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) {
      if (e.code === 'Escape') { tgt.blur(); this.emit({ cmd: 'cancel', shift: false, ctrl: false, repeat: false, source: 'key' }); }
      return;
    }
    if (!this.enabled || !this.handler) return;
    if (e.ctrlKey && (e.code === 'KeyR' || e.code === 'KeyL' || e.code === 'F5')) return; // dejar recargar
    let cmd: Command | undefined = this.codeMap.get(e.code);
    let num: number | undefined;
    const digit = /^Digit([0-9])$/.exec(e.code);
    if (digit && !cmd) { cmd = 'num'; num = Number(digit[1]); }
    if (!cmd) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') cmd = 'confirm';
      else if (e.code === 'Escape') cmd = 'cancel';
      else if (e.code === 'Tab') cmd = e.shiftKey ? 'prev' : 'next';
      else if (e.code === 'Backspace') cmd = 'cancel';
    }
    if (!cmd) return;
    if (DIR_OF[cmd] !== undefined && e.repeat) {
      const now = performance.now();
      if (now - this.lastMove < this.moveRepeatMs) { e.preventDefault(); return; }
      this.lastMove = now;
    } else if (DIR_OF[cmd] !== undefined) this.lastMove = performance.now();
    const used = this.emit({ cmd, shift: e.shiftKey, ctrl: e.ctrlKey, num, repeat: e.repeat, source: 'key' });
    if (used !== false) e.preventDefault();
  }

  private emit(e: CommandEvent): boolean | void {
    return this.handler ? this.handler(e) : false;
  }

  /** Sondeo del mando; llamar una vez por fotograma. */
  pollPad(now: number): void {
    if (!this.enabled || typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (!gp) return;
    const b = gp.buttons.map((x) => x.pressed);
    const pressed = (i: number): boolean => !!b[i] && !this.padPrev[i];
    const map: [number, Command][] = [
      [0, 'interact'], [1, 'cancel'], [2, 'fire'], [3, 'inventory'], [4, 'sneak'], [5, 'throw'],
      [6, 'light'], [7, 'active'], [8, 'map'], [9, 'pause'], [10, 'wait'], [11, 'rest'],
    ];
    for (const [i, cmd] of map) if (pressed(i)) this.emit({ cmd, shift: false, ctrl: false, repeat: false, source: 'pad' });
    // dirección: cruceta o stick izquierdo (8 direcciones)
    let dx = (b[15] ? 1 : 0) - (b[14] ? 1 : 0);
    let dy = (b[13] ? 1 : 0) - (b[12] ? 1 : 0);
    const ax = gp.axes[0] ?? 0; const ay = gp.axes[1] ?? 0;
    if (Math.hypot(ax, ay) > 0.5) {
      const a = Math.atan2(ay, ax);
      const oct = Math.round(a / (Math.PI / 4));
      dx = Math.round(Math.cos(oct * Math.PI / 4));
      dy = Math.round(Math.sin(oct * Math.PI / 4));
    }
    const dirs: Record<string, Command> = { '0,-1': 'up', '1,-1': 'upright', '1,0': 'right', '1,1': 'downright', '0,1': 'down', '-1,1': 'downleft', '-1,0': 'left', '-1,-1': 'upleft' };
    const cmd = dirs[`${dx},${dy}`];
    const di = cmd ? DIR_OF[cmd]! : -1;
    if (di >= 0) {
      if (di !== this.padDir) { this.padDir = di; this.padDirT = now + 260; this.emit({ cmd: cmd!, shift: false, ctrl: false, repeat: false, source: 'pad' }); }
      else if (now >= this.padDirT) { this.padDirT = now + 140; this.emit({ cmd: cmd!, shift: false, ctrl: false, repeat: true, source: 'pad' }); }
    } else this.padDir = -1;
    this.padPrev = b;
  }
}
