/**
 * Música adaptativa generativa. Cada tema define escala, progresión, patrones y timbre;
 * las capas (dron, colchón, bajo, arpegio, percusión, motivo) entran y salen según la tensión.
 */
import type { AudioEngine } from './audio';

type Step = number | null;
interface Theme {
  bpm: number;
  root: number; // nota MIDI
  scale: number[];
  prog: number[][]; // grados por compás
  pad: OscillatorType;
  padCut: number;
  bass: Step[];
  arp: Step[];
  kick: string;
  snare: string;
  hat: string;
  motif?: Step[];
  lead?: OscillatorType;
  drone: number[];
  choir?: boolean;
  swing?: number;
}

const MIN = [0, 2, 3, 5, 7, 8, 10];
const DOR = [0, 2, 3, 5, 7, 9, 10];
const PHR = [0, 1, 3, 5, 7, 8, 10];
const LYD = [0, 2, 4, 6, 7, 9, 11];
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const HMIN = [0, 2, 3, 5, 7, 8, 11];
const WHOLE = [0, 2, 4, 6, 8, 10];
const LOC = [0, 1, 3, 5, 6, 8, 10];

const _ = null;

export const THEMES: Record<string, Theme> = {
  title: { bpm: 60, root: 45, scale: MIN, prog: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'sawtooth', padCut: 900, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 7], motif: [7, _, _, _, 9, _, 8, _, 7, _, _, _, 4, _, _, _, 5, _, _, _, 4, _, 2, _, 4, _, _, _, _, _, _, _], lead: 'triangle', choir: true },
  hub: { bpm: 66, root: 48, scale: DOR, prog: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [4, 6, 8]], pad: 'triangle', padCut: 1400, bass: [0, _, _, _, _, _, 4, _, _, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 12], motif: [4, _, _, 5, 4, _, 2, _, 0, _, _, _, _, _, _, _, 2, _, _, 4, 2, _, 1, _, 0, _, _, _, _, _, _, _], lead: 'sine' },
  zone1: { bpm: 72, root: 43, scale: MIN, prog: [[0, 2, 4], [5, 7, 9], [0, 2, 4], [6, 8, 10]], pad: 'triangle', padCut: 1100, bass: [0, _, _, _, 0, _, _, _, _, _, 0, _, _, _, _, _], arp: [7, _, 9, _, 11, _, 9, _, 7, _, 4, _, 7, _, _, _], kick: 'x.......x.......', snare: '........x.......', hat: '..x...x...x...x.', drone: [0, 7], motif: [11, _, _, _, 10, _, _, _, 9, _, _, _, 7, _, _, _], lead: 'sine' },
  zone2: { bpm: 80, root: 45, scale: DOR, prog: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [2, 4, 6]], pad: 'sine', padCut: 1800, bass: [0, _, _, 0, _, _, 4, _, 0, _, _, 0, _, _, 3, _], arp: [7, 9, 11, 9, 8, 9, 11, 13, 7, 9, 11, 9, 8, 6, 4, 6], kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', drone: [0, 7, 14], motif: [14, _, 13, _, 11, _, _, _, 9, _, 11, _, 7, _, _, _], lead: 'triangle', swing: 0.12 },
  zone3: { bpm: 96, root: 38, scale: PHR, prog: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]], pad: 'sawtooth', padCut: 700, bass: [0, _, 0, _, 0, _, 1, _, 0, _, 0, _, 0, 1, 0, _], arp: [7, _, 8, _, 7, _, 5, _, 7, _, 8, _, 10, _, 8, _], kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxx.xxx.xxx.xxx.', drone: [0, 1], motif: [7, _, _, 8, 7, _, _, _, 5, _, _, 4, 3, _, _, _], lead: 'square' },
  zone4: { bpm: 54, root: 41, scale: WHOLE, prog: [[0, 2, 4], [1, 3, 5], [2, 4, 0], [3, 5, 1]], pad: 'sine', padCut: 2400, bass: [0, _, _, _, _, _, _, _, 3, _, _, _, _, _, _, _], arp: [6, _, _, 8, _, _, 10, _, _, 7, _, _, 9, _, _, _], kick: '', snare: '', hat: '......x........x', drone: [0, 6], choir: true, motif: [12, _, _, _, _, _, 11, _, _, _, _, _, 13, _, _, _], lead: 'sine' },
  zone5: { bpm: 84, root: 40, scale: HMIN, prog: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'sawtooth', padCut: 1300, bass: [0, _, _, 0, 0, _, _, _, 4, _, _, 4, 4, _, _, _], arp: [7, 9, 11, 14, 11, 9, 7, 9, 7, 9, 11, 14, 13, 11, 9, 8], kick: 'x.......x.x.....', snare: '....x.......x...', hat: '..x...x...x...x.', drone: [0, 7, 12], choir: true, motif: [14, _, _, _, 13, _, 11, _, 12, _, _, _, 9, _, _, _], lead: 'triangle' },
  zone6: { bpm: 50, root: 36, scale: LYD, prog: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4]], pad: 'sine', padCut: 3000, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [11, _, _, _, 13, _, _, _, 16, _, _, _, 14, _, _, _], kick: '', snare: '', hat: '', drone: [0, 7, 19], motif: [16, _, _, _, _, _, _, _, 18, _, _, _, 14, _, _, _], lead: 'sine' },
  boss: { bpm: 120, root: 38, scale: LOC, prog: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]], pad: 'sawtooth', padCut: 1000, bass: [0, 0, _, 0, 0, _, 1, _, 0, 0, _, 0, 4, _, 3, _], arp: [7, 8, 7, 10, 7, 8, 7, 12, 7, 8, 7, 10, 11, 10, 8, 7], kick: 'x..x..x.x..x..x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', drone: [0, 6], motif: [7, _, 8, _, 10, _, 8, _, 7, _, _, _, 5, _, 4, _], lead: 'square' },
  core: { bpm: 60, root: 40, scale: MAJ, prog: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'triangle', padCut: 1600, bass: [0, _, _, _, _, _, _, _, 4, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 12], choir: true, motif: [4, _, _, _, 5, _, 4, _, 2, _, _, _, 0, _, _, _], lead: 'sine' },
  end_redencion: { bpm: 52, root: 41, scale: MIN, prog: [[0, 2, 4], [5, 7, 9], [6, 8, 10], [4, 6, 8]], pad: 'triangle', padCut: 1200, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 7], choir: true, motif: [4, _, _, _, 3, _, _, _, 2, _, _, _, 0, _, _, _], lead: 'sine' },
  end_custodia: { bpm: 58, root: 45, scale: LYD, prog: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]], pad: 'sine', padCut: 2400, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [7, _, _, 9, _, _, 11, _, _, 9, _, _, 7, _, _, _], kick: '', snare: '', hat: '', drone: [0, 7, 12], choir: true, lead: 'triangle', motif: [11, _, _, _, 12, _, _, _, 14, _, _, _, 11, _, _, _] },
  end_evacuacion: { bpm: 76, root: 43, scale: MAJ, prog: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]], pad: 'triangle', padCut: 2000, bass: [0, _, _, _, 4, _, _, _, 5, _, _, _, 3, _, _, _], arp: [7, 9, 11, 9, 7, 9, 11, 9, 7, 9, 11, 9, 7, 9, 11, 9], kick: 'x.......x.......', snare: '', hat: '..x...x...x...x.', drone: [0, 7], lead: 'triangle', motif: [9, _, _, 11, 12, _, _, _, 11, _, 9, _, 7, _, _, _] },
  end_liberacion: { bpm: 56, root: 48, scale: MAJ, prog: [[0, 2, 4], [3, 5, 7], [5, 7, 9], [4, 6, 8]], pad: 'sine', padCut: 2600, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 12], choir: true, lead: 'sine', motif: [4, _, _, 5, 4, _, 2, _, 0, _, _, _, _, _, _, _] },
  end_olvido: { bpm: 50, root: 45, scale: MIN, prog: [[0, 2, 4], [0, 2, 4], [5, 7, 9], [4, 6, 8]], pad: 'sine', padCut: 900, bass: [], arp: [], kick: '', snare: '', hat: '', drone: [0], lead: 'sine', motif: [4, _, _, _, _, _, _, _, 2, _, _, _, _, _, _, _] },
  end_verdadero: { bpm: 64, root: 43, scale: MAJ, prog: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8], [0, 2, 4], [1, 3, 5], [3, 5, 7], [4, 6, 8]], pad: 'triangle', padCut: 2200, bass: [0, _, _, _, _, _, _, _, 4, _, _, _, _, _, _, _], arp: [7, _, 9, _, 11, _, 9, _, 7, _, 9, _, 11, _, 14, _], kick: '', snare: '', hat: '', drone: [0, 7, 12], choir: true, lead: 'triangle', motif: [4, _, _, 5, 4, _, 2, _, 0, _, _, _, 2, _, 4, _] },
  end_death: { bpm: 48, root: 38, scale: PHR, prog: [[0, 2, 4], [1, 3, 5]], pad: 'sawtooth', padCut: 600, bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], arp: [], kick: '', snare: '', hat: '', drone: [0, 1], lead: 'sine' },
  credits: { bpm: 70, root: 45, scale: DOR, prog: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [4, 6, 8]], pad: 'triangle', padCut: 1800, bass: [0, _, _, _, 0, _, _, _, 3, _, _, _, 4, _, _, _], arp: [7, _, 9, _, 11, _, 9, _, 7, _, 9, _, 11, _, 14, _], kick: 'x.......x.......', snare: '', hat: '..x...x...x...x.', drone: [0, 7], lead: 'triangle', motif: [4, _, _, 5, 4, _, 2, _, 0, _, _, _, _, _, _, _] },
};

function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class MusicEngine {
  private a: AudioEngine;
  private theme: Theme | null = null;
  private themeId = '';
  private pendingId: string | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private layers: Record<string, GainNode> = {};
  private droneOscs: OscillatorNode[] = [];
  tension = 0;
  o2Low = false;
  narrative = false;
  private lowpass!: BiquadFilterNode;

  constructor(a: AudioEngine) {
    this.a = a;
    const ctx = a.ctx!;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 6000;
    this.lowpass.connect(a.musicBus);
    for (const k of ['drone', 'pad', 'bass', 'arp', 'drums', 'motif', 'choir']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.lowpass);
      if (k === 'pad' || k === 'motif' || k === 'choir' || k === 'arp') {
        const send = ctx.createGain();
        send.gain.value = 0.5;
        g.connect(send);
        send.connect(a.reverbSend);
      }
      this.layers[k] = g;
    }
  }

  setTheme(id: string): void {
    if (id === this.themeId && this.theme) return;
    if (!THEMES[id]) return;
    if (!this.theme) {
      this.applyTheme(id);
      this.start();
    } else this.pendingId = id;
  }

  private applyTheme(id: string): void {
    this.themeId = id;
    this.theme = THEMES[id];
    this.step = 0;
    const ctx = this.a.ctx!;
    for (const o of this.droneOscs) { try { o.stop(ctx.currentTime + 1.5); } catch { /* ya parado */ } }
    this.droneOscs = [];
    const t = ctx.currentTime;
    for (const iv of this.theme.drone) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = noteFreq(this.theme.root - 12 + iv);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 280;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 3);
        o.connect(f); f.connect(g); g.connect(this.layers.drone);
        o.start(t);
        this.droneOscs.push(o);
      }
    }
  }

  private start(): void {
    if (this.timer) return;
    this.nextTime = this.a.ctx!.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 30);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private mix(): void {
    const ctx = this.a.ctx!;
    const t = ctx.currentTime;
    const ten = this.tension;
    const set = (k: string, v: number): void => { this.layers[k].gain.setTargetAtTime(v, t, 0.8); };
    set('drone', 0.9);
    set('pad', 0.5);
    set('bass', 0.25 + ten * 0.5);
    set('arp', Math.max(0, (ten - 0.25) * 0.9));
    set('drums', ten > 0.55 ? 0.8 : ten > 0.35 ? 0.25 : 0);
    set('motif', ten < 0.4 || this.narrative ? 0.5 : 0.15);
    set('choir', this.theme?.choir ? 0.35 : 0);
    this.lowpass.frequency.setTargetAtTime(this.o2Low ? 900 : 6000, t, 1.2);
  }

  private tick(): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.theme) return;
    this.mix();
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.scheduleStep(this.nextTime);
      const spb = 60 / this.theme.bpm / 4;
      const swing = this.theme.swing && this.step % 2 === 1 ? spb * this.theme.swing : 0;
      this.nextTime += spb + swing;
      this.step++;
      if (this.step % 16 === 0 && this.pendingId) {
        const id = this.pendingId;
        this.pendingId = null;
        this.applyTheme(id);
      }
    }
  }

  private deg(d: number): number {
    const sc = this.theme!.scale;
    const n = sc.length;
    const oct = Math.floor(d / n);
    return this.theme!.root + sc[((d % n) + n) % n] + 12 * oct;
  }

  private scheduleStep(t: number): void {
    const th = this.theme!;
    const s = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const chord = th.prog[bar % th.prog.length];
    const spb = 60 / th.bpm / 4;
    if (s === 0) {
      // colchón
      for (const d of chord) this.note(t, this.deg(d) + 12, spb * 16, th.pad, 0.07, 'pad', th.padCut, 0.6);
      if (th.choir) for (const d of chord) this.choir(t, this.deg(d) + 24, spb * 16);
      if (this.o2Low) { this.a.play('heartbeat', 0, 0.7); }
    }
    if (s === 8 && this.o2Low) this.a.play('heartbeat', 0, 0.5);
    const b = th.bass[s];
    if (b !== null && b !== undefined) this.note(t, this.deg(chord[0] + b) - 12, spb * 3, 'triangle', 0.22, 'bass', 600, 0.01);
    const ar = th.arp[s];
    if (ar !== null && ar !== undefined) this.note(t, this.deg(chord[0] + ar), spb * 1.5, 'square', 0.05, 'arp', 2200, 0.005);
    if (th.motif) {
      const m = th.motif[(this.step % th.motif.length)];
      if (m !== null && m !== undefined) this.note(t, this.deg(m) + 12, spb * 6, th.lead ?? 'sine', 0.08, 'motif', 3000, 0.04);
    }
    if (th.kick[s] === 'x') this.kick(t);
    if (th.snare[s] === 'x') this.snare(t);
    if (th.hat[s] === 'x') this.hat(t);
  }

  private note(t: number, midi: number, dur: number, type: OscillatorType, vol: number, layer: string, cut: number, attack: number): void {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = noteFreq(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.layers[layer]);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private choir(t: number, midi: number, dur: number): void {
    const ctx = this.a.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // formantes de "aa"
    const formants = [800, 1150, 2900];
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.value = noteFreq(midi);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 4;
    vib.connect(vg); vg.connect(src.detune);
    for (const fq of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = 8;
      src.connect(bp); bp.connect(g);
    }
    g.connect(this.layers.choir);
    src.start(t); vib.start(t);
    src.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  private kick(t: number): void {
    const ctx = this.a.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.layers.drums);
    o.start(t); o.stop(t + 0.3);
  }

  private snare(t: number): void {
    this.a.burst(t, this.layers.drums, { dur: 0.18, vol: 0.18, f: 1800, type: 'bandpass', q: 0.8 });
  }

  private hat(t: number): void {
    this.a.burst(t, this.layers.drums, { dur: 0.04, vol: 0.06, f: 8000, type: 'highpass' });
  }
}

// Variantes de jefe por zona: misma pulsión, tonalidad y timbre de cada zona.
for (let z = 1; z <= 6; z++) {
  const base = THEMES[`zone${z}`];
  THEMES[`boss${z}`] = { ...THEMES.boss, root: base.root, scale: z === 4 ? WHOLE : z === 6 ? LYD : THEMES.boss.scale, pad: base.pad, drone: base.drone, choir: base.choir, bpm: 112 + z * 4 };
}
