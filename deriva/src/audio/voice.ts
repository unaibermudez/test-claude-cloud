/**
 * Voces: lectura en voz alta con la síntesis de voz del navegador (Web Speech API).
 * No hay archivos de audio: cada personaje tiene un «perfil» (voz del sistema elegida de forma estable,
 * tono y velocidad). Si el navegador no tiene voces, todo sigue funcionando en silencio.
 */
import type { Lang } from '../i18n';

export interface VoiceProfile { pitch: number; rate: number; slot: number; prefer?: 'f' | 'm' }

/** Perfiles por hablante. `slot` elige entre las voces disponibles del idioma de forma estable. */
const PROFILES: Record<string, VoiceProfile> = {
  agora: { pitch: 0.82, rate: 0.92, slot: 0, prefer: 'f' },
  narrator: { pitch: 0.95, rate: 0.98, slot: 1, prefer: 'm' },
  player: { pitch: 1.0, rate: 1.0, slot: 2 },
  celia: { pitch: 0.9, rate: 1.06, slot: 0, prefer: 'f' },
  tomas: { pitch: 0.7, rate: 0.9, slot: 1, prefer: 'm' },
  bruno: { pitch: 1.75, rate: 1.05, slot: 2, prefer: 'f' },
  tuerca: { pitch: 0.4, rate: 1.25, slot: 3, prefer: 'm' },
  solis: { pitch: 0.85, rate: 1.1, slot: 3, prefer: 'f' },
  lenz: { pitch: 0.6, rate: 0.85, slot: 4, prefer: 'm' },
  faro: { pitch: 0.75, rate: 0.95, slot: 5, prefer: 'm' },
  ferran: { pitch: 0.95, rate: 0.9, slot: 2 },
  lucia: { pitch: 1.2, rate: 1.0, slot: 1, prefer: 'f' },
  coro: { pitch: 0.3, rate: 0.75, slot: 0 },
  radio: { pitch: 0.8, rate: 0.95, slot: 5, prefer: 'm' },
  unknown: { pitch: 0.65, rate: 0.85, slot: 4 },
  log: { pitch: 0.95, rate: 0.98, slot: 1 },
};

// heurística de género a partir del nombre de la voz del sistema (solo para variar el reparto)
const FEMALE = /(female|mujer|woman|monica|mónica|paulina|helena|laura|lucia|lucía|elena|sabina|conchita|marisol|carmen|sara|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|serena|google uk english female|amélie)/i;
const MALE = /(male|hombre|jorge|diego|pablo|enrique|juan|carlos|raul|raúl|alvaro|álvaro|david|mark|george|daniel|alex|fred|tom|james|rishi|google uk english male)/i;

export class VoiceEngine {
  enabled = true;
  volume = 0.9;
  rate = 1;
  lang: Lang = 'es';
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private voices: SpeechSynthesisVoice[] = [];
  speaking = false;
  onState: ((speaking: boolean) => void) | null = null;

  constructor() {
    if (!this.synth) return;
    const load = (): void => { this.voices = this.synth?.getVoices() ?? []; };
    load();
    try { this.synth.addEventListener('voiceschanged', load); } catch { /* navegadores antiguos */ }
  }

  get available(): boolean {
    return !!this.synth;
  }

  private pick(profile: VoiceProfile): SpeechSynthesisVoice | null {
    const want = this.lang === 'es' ? 'es' : 'en';
    let pool = this.voices.filter((v) => v.lang.toLowerCase().startsWith(want));
    // preferir español de España / inglés británico, pero aceptar cualquier variante
    const regional = pool.filter((v) => /es-es|en-gb/i.test(v.lang));
    if (regional.length >= 2) pool = regional;
    if (!pool.length) return null;
    const gendered = profile.prefer === 'f' ? pool.filter((v) => FEMALE.test(v.name)) : profile.prefer === 'm' ? pool.filter((v) => MALE.test(v.name)) : [];
    const list = gendered.length ? gendered : pool;
    return list[profile.slot % list.length];
  }

  /** Limpia marcas tipográficas que no deben leerse. */
  private clean(text: string): string {
    return text.replace(/[«»“”"]/g, '').replace(/\s*\n+\s*/g, '. ').replace(/[*_#]/g, '').replace(/…/g, '...').trim();
  }

  speak(text: string, speaker = 'narrator', interrupt = true): void {
    if (!this.synth || !this.enabled || !text.trim()) return;
    try {
      if (interrupt) this.synth.cancel();
      const u = new SpeechSynthesisUtterance(this.clean(text));
      const prof = PROFILES[speaker] ?? PROFILES.narrator;
      const v = this.pick(prof);
      if (v) u.voice = v;
      u.lang = v?.lang ?? (this.lang === 'es' ? 'es-ES' : 'en-GB');
      u.pitch = Math.max(0, Math.min(2, prof.pitch));
      u.rate = Math.max(0.5, Math.min(2, prof.rate * this.rate));
      u.volume = Math.max(0, Math.min(1, this.volume));
      u.onstart = () => { this.speaking = true; this.onState?.(true); };
      u.onend = () => { this.speaking = false; this.onState?.(false); };
      u.onerror = () => { this.speaking = false; this.onState?.(false); };
      this.synth.speak(u);
    } catch {
      // la síntesis puede no estar disponible (modo privado, navegador sin voces)
    }
  }

  stop(): void {
    try { this.synth?.cancel(); } catch { /* nada */ }
    this.speaking = false;
    this.onState?.(false);
  }

  /** Número de voces del idioma actual (para mostrar en Opciones). */
  count(): number {
    const want = this.lang === 'es' ? 'es' : 'en';
    return this.voices.filter((v) => v.lang.toLowerCase().startsWith(want)).length;
  }
}
