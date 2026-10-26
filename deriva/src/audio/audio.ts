/**
 * Motor de audio procedural (Web Audio). Sin muestras externas: todo se sintetiza.
 * Buses: maestro → (música, efectos). Reverb por convolución con impulso generado.
 */
import { MusicEngine } from './music';

type SfxFn = (a: AudioEngine, t: number, out: AudioNode, v: number) => void;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  music: MusicEngine | null = null;
  private vols = { master: 0.8, music: 0.6, sfx: 0.8, muted: false };
  private lastPlayed = new Map<string, number>();
  onSubtitle: ((key: string) => void) | null = null;

  /** Debe llamarse tras un gesto del usuario. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    // ruido blanco
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
    this.applyVolumes();
    this.music = new MusicEngine(this);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 42;
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        ch[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  setVolumes(v: { master: number; music: number; sfx: number; muted: boolean }): void {
    this.vols = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.muted ? 0 : this.vols.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vols.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, t, 0.05);
  }

  // ---------------------------------------------------------------- primitivas

  tone(t: number, out: AudioNode, o: { type?: OscillatorType; f: number; f2?: number; dur: number; vol: number; attack?: number; detune?: number }): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  burst(t: number, out: AudioNode, o: { dur: number; vol: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; attack?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type ?? 'lowpass';
    filt.frequency.setValueAtTime(o.f, t);
    if (o.f2 !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    filt.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  /** Reproduce un efecto. `pan` en [-1,1], `vol` multiplicador. */
  play(id: string, pan = 0, vol = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(id) ?? -1;
    if (now - last < 0.04) return; // evita saturación
    this.lastPlayed.set(id, now);
    const fn = SFX[id] ?? (id.startsWith('fire_') ? SFX.fire_generic : id.startsWith('boss_') ? SFX.boss_generic : id.startsWith('step') ? SFX.step : null);
    if (!fn) return;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.25;
    p.connect(send);
    send.connect(this.reverbSend);
    fn(this, now, p, vol);
    const sub = SUBTITLES[id];
    if (sub && this.onSubtitle) this.onSubtitle(sub);
  }
}

const SUBTITLES: Record<string, string> = {
  alarm: 'sub.alarm', explosion: 'sub.explosion', scream: 'sub.scream', radio: 'sub.radio', wind: 'sub.wind',
  fire_generic: 'sub.shot', boss_phase: 'sub.boss', alert: 'sub.steps', tremor: 'sub.tremor', vacuum: 'sub.wind',
};

const SFX: Record<string, SfxFn> = {
  step: (a, t, o, v) => a.burst(t, o, { dur: 0.06, vol: 0.12 * v, f: 900, f2: 300, type: 'bandpass', q: 2 }),
  step_grate: (a, t, o, v) => { a.burst(t, o, { dur: 0.05, vol: 0.12 * v, f: 2500, type: 'bandpass', q: 5 }); a.tone(t, o, { type: 'square', f: 180, dur: 0.04, vol: 0.03 * v }); },
  step_plant: (a, t, o, v) => a.burst(t, o, { dur: 0.12, vol: 0.08 * v, f: 3000, f2: 1200, type: 'highpass' }),
  step_water: (a, t, o, v) => { a.burst(t, o, { dur: 0.15, vol: 0.1 * v, f: 600, f2: 1500, type: 'bandpass', q: 3 }); },
  door_open: (a, t, o) => { a.burst(t, o, { dur: 0.35, vol: 0.18, f: 400, f2: 1800, type: 'bandpass', q: 1.5 }); a.tone(t, o, { type: 'sawtooth', f: 90, f2: 60, dur: 0.3, vol: 0.05 }); },
  door_close: (a, t, o) => { a.burst(t, o, { dur: 0.3, vol: 0.18, f: 1600, f2: 300, type: 'bandpass', q: 1.5 }); a.tone(t + 0.25, o, { type: 'square', f: 70, dur: 0.12, vol: 0.12 }); },
  door_unlock: (a, t, o) => { a.tone(t, o, { type: 'square', f: 880, dur: 0.06, vol: 0.08 }); a.tone(t + 0.08, o, { type: 'square', f: 1320, dur: 0.08, vol: 0.08 }); SFX.door_open(a, t + 0.15, o, 1); },
  door_power: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 120, f2: 600, dur: 0.3, vol: 0.08 }); SFX.door_open(a, t + 0.2, o, 1); },
  seal: (a, t, o) => { a.burst(t, o, { dur: 0.6, vol: 0.2, f: 3000, f2: 400, type: 'lowpass' }); a.tone(t + 0.5, o, { type: 'square', f: 55, dur: 0.2, vol: 0.15 }); },
  hit_melee: (a, t, o) => { a.burst(t, o, { dur: 0.09, vol: 0.35, f: 1200, f2: 200 }); a.tone(t, o, { type: 'triangle', f: 160, f2: 60, dur: 0.12, vol: 0.2 }); },
  hit_shot: (a, t, o) => a.burst(t, o, { dur: 0.08, vol: 0.25, f: 2500, f2: 600, type: 'bandpass' }),
  miss_shot: (a, t, o) => a.burst(t, o, { dur: 0.12, vol: 0.1, f: 4000, f2: 1500, type: 'highpass' }),
  whoosh: (a, t, o) => a.burst(t, o, { dur: 0.15, vol: 0.12, f: 400, f2: 2000, type: 'bandpass', q: 3 }),
  hurt: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 220, f2: 90, dur: 0.18, vol: 0.18 }); a.burst(t, o, { dur: 0.1, vol: 0.2, f: 800 }); },
  death: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 330, f2: 40, dur: 2.2, vol: 0.3, attack: 0.05 }); a.tone(t, o, { type: 'sine', f: 333, f2: 42, dur: 2.2, vol: 0.2, attack: 0.05 }); a.burst(t, o, { dur: 1.5, vol: 0.15, f: 2000, f2: 100 }); },
  robot_death: (a, t, o) => { a.tone(t, o, { type: 'square', f: 600, f2: 50, dur: 0.5, vol: 0.12 }); a.burst(t, o, { dur: 0.4, vol: 0.25, f: 3000, f2: 200 }); },
  eco_death: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 520, f2: 180, dur: 0.6, vol: 0.12, attack: 0.02 }); a.tone(t, o, { type: 'sine', f: 780, f2: 270, dur: 0.6, vol: 0.06, attack: 0.02 }); },
  explosion: (a, t, o) => { a.burst(t, o, { dur: 1.2, vol: 0.7, f: 1800, f2: 60, attack: 0.002 }); a.tone(t, o, { type: 'sine', f: 90, f2: 30, dur: 0.9, vol: 0.5 }); },
  emp: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 2000, f2: 40, dur: 0.6, vol: 0.2 }); a.burst(t, o, { dur: 0.5, vol: 0.2, f: 6000, f2: 500, type: 'highpass' }); },
  glass: (a, t, o) => { for (let i = 0; i < 6; i++) a.tone(t + i * 0.03, o, { type: 'triangle', f: 2000 + i * 700, dur: 0.15, vol: 0.06 }); a.burst(t, o, { dur: 0.3, vol: 0.25, f: 5000, type: 'highpass' }); },
  ignite: (a, t, o) => a.burst(t, o, { dur: 0.5, vol: 0.18, f: 300, f2: 2000, type: 'bandpass', attack: 0.05 }),
  vacuum: (a, t, o) => { a.burst(t, o, { dur: 1.4, vol: 0.4, f: 4000, f2: 200, attack: 0.01 }); },
  wind: (a, t, o) => a.burst(t, o, { dur: 0.9, vol: 0.14, f: 900, f2: 1600, type: 'bandpass', q: 0.7, attack: 0.2 }),
  alarm: (a, t, o) => { for (let i = 0; i < 3; i++) { a.tone(t + i * 0.4, o, { type: 'square', f: 660, dur: 0.18, vol: 0.08 }); a.tone(t + i * 0.4 + 0.2, o, { type: 'square', f: 494, dur: 0.18, vol: 0.08 }); } },
  tremor: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 38, dur: 1.6, vol: 0.45, attack: 0.3 }); a.burst(t, o, { dur: 1.4, vol: 0.12, f: 200, attack: 0.3 }); },
  breach: (a, t, o) => { SFX.glass(a, t, o, 1); SFX.vacuum(a, t + 0.1, o, 1); },
  thud: (a, t, o) => a.tone(t, o, { type: 'triangle', f: 110, f2: 45, dur: 0.18, vol: 0.25 }),
  shove: (a, t, o) => { a.burst(t, o, { dur: 0.1, vol: 0.15, f: 600 }); a.tone(t, o, { type: 'triangle', f: 140, f2: 70, dur: 0.15, vol: 0.15 }); },
  pickup: (a, t, o) => { a.tone(t, o, { type: 'triangle', f: 660, dur: 0.06, vol: 0.08 }); a.tone(t + 0.06, o, { type: 'triangle', f: 990, dur: 0.08, vol: 0.07 }); },
  use: (a, t, o) => a.tone(t, o, { type: 'triangle', f: 520, f2: 780, dur: 0.12, vol: 0.08 }),
  inject: (a, t, o) => { a.burst(t, o, { dur: 0.15, vol: 0.12, f: 5000, type: 'highpass' }); a.tone(t + 0.1, o, { type: 'sine', f: 400, f2: 900, dur: 0.3, vol: 0.06 }); },
  o2: (a, t, o) => a.burst(t, o, { dur: 0.7, vol: 0.18, f: 3000, f2: 1200, type: 'highpass', attack: 0.05 }),
  power: (a, t, o) => a.tone(t, o, { type: 'sawtooth', f: 80, f2: 400, dur: 0.6, vol: 0.08, attack: 0.05 }),
  equip: (a, t, o) => { a.burst(t, o, { dur: 0.05, vol: 0.15, f: 3000, type: 'bandpass', q: 6 }); a.burst(t + 0.08, o, { dur: 0.05, vol: 0.15, f: 2000, type: 'bandpass', q: 6 }); },
  implant: (a, t, o) => { a.tone(t, o, { type: 'square', f: 200, f2: 1200, dur: 0.4, vol: 0.06 }); a.burst(t, o, { dur: 0.3, vol: 0.1, f: 1500, type: 'bandpass', q: 8 }); },
  terminal: (a, t, o) => { a.tone(t, o, { type: 'square', f: 1200, dur: 0.04, vol: 0.05 }); a.tone(t + 0.05, o, { type: 'square', f: 1600, dur: 0.05, vol: 0.05 }); },
  terminal_op: (a, t, o) => { for (let i = 0; i < 4; i++) a.tone(t + i * 0.04, o, { type: 'square', f: 800 + i * 200, dur: 0.03, vol: 0.04 }); },
  hack_start: (a, t, o) => a.tone(t, o, { type: 'sawtooth', f: 300, f2: 1500, dur: 0.25, vol: 0.05 }),
  hack_pick: (a, t, o) => a.tone(t, o, { type: 'square', f: 1400 + Math.random() * 400, dur: 0.05, vol: 0.05 }),
  hack_ok: (a, t, o) => { [523, 659, 784, 1047].forEach((f, i) => a.tone(t + i * 0.06, o, { type: 'square', f, dur: 0.1, vol: 0.05 })); },
  hack_fail: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 300, f2: 80, dur: 0.5, vol: 0.12 }); SFX.alarm(a, t + 0.3, o, 1); },
  container: (a, t, o) => { a.burst(t, o, { dur: 0.25, vol: 0.12, f: 1200, f2: 400, type: 'bandpass' }); a.tone(t + 0.2, o, { type: 'triangle', f: 160, dur: 0.1, vol: 0.12 }); },
  log: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 880, dur: 0.3, vol: 0.08 }); a.tone(t + 0.15, o, { type: 'sine', f: 1320, dur: 0.5, vol: 0.06 }); },
  dialog: (a, t, o) => a.tone(t, o, { type: 'sine', f: 440, f2: 660, dur: 0.2, vol: 0.05 }),
  radio: (a, t, o) => { a.burst(t, o, { dur: 0.6, vol: 0.12, f: 2500, type: 'bandpass', q: 2 }); a.tone(t + 0.5, o, { type: 'square', f: 1000, dur: 0.05, vol: 0.04 }); },
  buy: (a, t, o) => { a.tone(t, o, { type: 'triangle', f: 1047, dur: 0.06, vol: 0.06 }); a.tone(t + 0.07, o, { type: 'triangle', f: 1568, dur: 0.1, vol: 0.06 }); },
  craft: (a, t, o) => { for (let i = 0; i < 3; i++) SFX.hit_melee(a, t + i * 0.12, o, 0.4); },
  rest: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 330, dur: 1.4, vol: 0.06, attack: 0.4 }); a.tone(t, o, { type: 'sine', f: 415, dur: 1.4, vol: 0.05, attack: 0.4 }); },
  click: (a, t, o) => a.tone(t, o, { type: 'square', f: 2200, dur: 0.02, vol: 0.05 }),
  thruster: (a, t, o) => a.burst(t, o, { dur: 0.35, vol: 0.18, f: 600, f2: 200, type: 'lowpass', attack: 0.02 }),
  land: (a, t, o) => a.tone(t, o, { type: 'square', f: 90, f2: 60, dur: 0.12, vol: 0.12 }),
  fire_generic: (a, t, o) => { a.burst(t, o, { dur: 0.22, vol: 0.45, f: 3500, f2: 300, attack: 0.001 }); a.tone(t, o, { type: 'square', f: 140, f2: 50, dur: 0.12, vol: 0.18 }); },
  fire_energy: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 1800, f2: 200, dur: 0.2, vol: 0.12 }); a.tone(t, o, { type: 'sine', f: 900, f2: 100, dur: 0.25, vol: 0.1 }); },
  fire_pistola_dardos: (a, t, o) => a.burst(t, o, { dur: 0.08, vol: 0.12, f: 3000, type: 'highpass' }),
  fire_clavadora: (a, t, o) => { a.burst(t, o, { dur: 0.06, vol: 0.25, f: 2000, type: 'bandpass', q: 3 }); a.tone(t, o, { type: 'square', f: 300, dur: 0.04, vol: 0.08 }); },
  fire_escopeta: (a, t, o) => { a.burst(t, o, { dur: 0.45, vol: 0.6, f: 2500, f2: 150, attack: 0.001 }); a.tone(t, o, { type: 'sine', f: 80, f2: 40, dur: 0.3, vol: 0.35 }); },
  jam: (a, t, o) => { a.tone(t, o, { type: 'square', f: 400, dur: 0.03, vol: 0.1 }); a.tone(t + 0.06, o, { type: 'square', f: 350, dur: 0.03, vol: 0.1 }); },
  beacon: (a, t, o) => { for (let i = 0; i < 4; i++) a.tone(t + i * 0.2, o, { type: 'square', f: 1600, dur: 0.06, vol: 0.06 }); },
  drone: (a, t, o) => a.tone(t, o, { type: 'sawtooth', f: 220, f2: 330, dur: 0.6, vol: 0.05, attack: 0.1 }),
  flare: (a, t, o) => a.burst(t, o, { dur: 0.8, vol: 0.15, f: 1500, f2: 3000, type: 'bandpass', attack: 0.05 }),
  spores: (a, t, o) => a.burst(t, o, { dur: 0.6, vol: 0.06, f: 5000, type: 'highpass', attack: 0.2 }),
  phantom: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 1200, f2: 300, dur: 0.6, vol: 0.06, attack: 0.05 }); },
  alert: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 180, f2: 260, dur: 0.25, vol: 0.08 }); },
  bash: (a, t, o) => { a.tone(t, o, { type: 'square', f: 80, dur: 0.12, vol: 0.2 }); a.burst(t, o, { dur: 0.15, vol: 0.25, f: 700 }); },
  boss_phase: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 55, dur: 1.5, vol: 0.25, attack: 0.1 }); a.tone(t, o, { type: 'sawtooth', f: 82, dur: 1.5, vol: 0.18, attack: 0.1 }); a.burst(t, o, { dur: 1.2, vol: 0.2, f: 400, f2: 4000 }); },
  boss_generic: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 110, f2: 220, dur: 0.4, vol: 0.12 }); a.burst(t, o, { dur: 0.3, vol: 0.12, f: 800 }); },
  scream: (a, t, o) => { for (let i = 0; i < 5; i++) a.tone(t, o, { type: 'sawtooth', f: 300 + i * 113, f2: 200 + i * 90, dur: 0.9, vol: 0.05, attack: 0.05 }); },
  shield_down: (a, t, o) => a.tone(t, o, { type: 'sine', f: 1500, f2: 100, dur: 0.8, vol: 0.12 }),
  active: (a, t, o) => a.tone(t, o, { type: 'sine', f: 300, f2: 1200, dur: 0.3, vol: 0.08 }),
  vent: (a, t, o) => a.burst(t, o, { dur: 0.8, vol: 0.12, f: 400, f2: 900, type: 'bandpass', attack: 0.1 }),
  blackout: (a, t, o) => { a.tone(t, o, { type: 'sawtooth', f: 120, f2: 30, dur: 0.8, vol: 0.15 }); },
  menu_move: (a, t, o) => a.tone(t, o, { type: 'triangle', f: 880, dur: 0.03, vol: 0.04 }),
  menu_select: (a, t, o) => { a.tone(t, o, { type: 'triangle', f: 660, dur: 0.05, vol: 0.06 }); a.tone(t + 0.05, o, { type: 'triangle', f: 990, dur: 0.07, vol: 0.06 }); },
  achievement: (a, t, o) => { [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(t + i * 0.08, o, { type: 'triangle', f, dur: 0.3, vol: 0.06 })); },
  heartbeat: (a, t, o) => { a.tone(t, o, { type: 'sine', f: 55, dur: 0.15, vol: 0.3 }); a.tone(t + 0.22, o, { type: 'sine', f: 50, dur: 0.15, vol: 0.22 }); },
};
