import { load, save, KEYS } from './storage';
import type { Lang } from '../i18n';

export type Colorblind = 'none' | 'deuter' | 'protan' | 'tritan';
export type TextSize = 's' | 'm' | 'l' | 'xl';

export interface Settings {
  lang: Lang;
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  subtitles: boolean;
  textSize: TextSize;
  highContrast: boolean;
  colorblind: Colorblind;
  reduceFlicker: boolean;
  reduceShake: boolean;
  reduceGlitch: boolean;
  crt: boolean;
  assistHack: boolean;
  skipHack: boolean;
  generousO2: boolean;
  dullEnemies: boolean;
  longOrbit: boolean;
  warningSeen: boolean;
  binds: Record<string, string[]>;
  pixelScale: number; // 0 = automático
  showTutorial: boolean;
}

export const DEFAULT_BINDS: Record<string, string[]> = {
  up: ['ArrowUp', 'KeyW', 'Numpad8'],
  down: ['ArrowDown', 'KeyS', 'Numpad2'],
  left: ['ArrowLeft', 'KeyA', 'Numpad4'],
  right: ['ArrowRight', 'KeyD', 'Numpad6'],
  upleft: ['KeyQ', 'Numpad7', 'Home'],
  upright: ['KeyE', 'Numpad9', 'PageUp'],
  downleft: ['KeyZ', 'Numpad1', 'End'],
  downright: ['KeyC', 'Numpad3', 'PageDown'],
  wait: ['Space', 'Numpad5', 'Period'],
  interact: ['KeyF', 'Enter', 'NumpadEnter'],
  fire: ['KeyR'],
  throw: ['KeyG'],
  pickup: ['KeyP', 'Comma'],
  sneak: ['KeyX'],
  light: ['KeyL'],
  inventory: ['KeyI'],
  implants: ['KeyU'],
  map: ['KeyM'],
  archive: ['KeyJ'],
  agora: ['KeyK'],
  active: ['KeyY'],
  rest: ['KeyV'],
  help: ['KeyH', 'Slash'],
  pause: ['Escape'],
  look: ['KeyO'],
  drop: ['Delete', 'KeyT'],
};

export function defaultSettings(): Settings {
  const lang: Lang = typeof navigator !== 'undefined' && navigator.language && !navigator.language.toLowerCase().startsWith('es') ? 'en' : 'es';
  return {
    lang, master: 0.8, music: 0.6, sfx: 0.8, muted: false, subtitles: false, textSize: 'm', highContrast: false,
    colorblind: 'none', reduceFlicker: false, reduceShake: false, reduceGlitch: false, crt: true, assistHack: false,
    skipHack: false, generousO2: false, dullEnemies: false, longOrbit: false, warningSeen: false,
    binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)) as Record<string, string[]>, pixelScale: 0, showTutorial: true,
  };
}

export function loadSettings(): Settings {
  const raw = load(KEYS.settings);
  const d = defaultSettings();
  if (!raw) return d;
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...d, ...s, binds: { ...d.binds, ...(s.binds ?? {}) } };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  save(KEYS.settings, JSON.stringify(s));
}
