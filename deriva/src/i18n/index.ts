/**
 * Sistema de textos. Los diccionarios se fusionan por idioma desde varios JSON.
 * Marcas: `{param}` sustituye parámetros; `{forma0|forma1|forma2}` elige según los pronombres
 * del jugador (es: él/ella/elle · en: he/she/they). Un parámetro que empieza por `@` es otra clave.
 */
import esUi from './es/ui.json';
import esMsg from './es/msg.json';
import esItems from './es/items.json';
import esEnemies from './es/enemies.json';
import esLogs from './es/logs.json';
import esScenes from './es/scenes.json';
import esMeta from './es/meta.json';
import esStory from './es/story.json';
import enUi from './en/ui.json';
import enMsg from './en/msg.json';
import enItems from './en/items.json';
import enEnemies from './en/enemies.json';
import enLogs from './en/logs.json';
import enScenes from './en/scenes.json';
import enMeta from './en/meta.json';
import enStory from './en/story.json';
import type { Pronoun } from '../core/state';

export type Lang = 'es' | 'en';
export type Dict = Record<string, string>;

export const DICTS: Record<Lang, Dict> = {
  es: { ...esUi, ...esMsg, ...esItems, ...esEnemies, ...esLogs, ...esScenes, ...esMeta, ...esStory },
  en: { ...enUi, ...enMsg, ...enItems, ...enEnemies, ...enLogs, ...enScenes, ...enMeta, ...enStory },
};

export const LANGS: Lang[] = ['es', 'en'];

interface Ctx { lang: Lang; pronoun: Pronoun; globals: Record<string, string | number> }
const ctx: Ctx = { lang: 'es', pronoun: 'elle', globals: { name: 'Tripulante 114', deaths: 0 } };

export function setLang(l: Lang): void { ctx.lang = l; }
export function getLang(): Lang { return ctx.lang; }
export function setPronoun(p: Pronoun): void { ctx.pronoun = p; }
export function setGlobal(k: string, v: string | number): void { ctx.globals[k] = v; }

export function has(key: string, lang: Lang = ctx.lang): boolean {
  return key in DICTS[lang];
}

const GENDER_RE = /\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}/g;
const PARAM_RE = /\{([a-zA-Z0-9_]+)\}/g;

export function format(raw: string, params: Record<string, string | number> = {}, pronoun: Pronoun = ctx.pronoun): string {
  const gi = pronoun === 'el' ? 0 : pronoun === 'ella' ? 1 : 2;
  let s = raw.replace(GENDER_RE, (_m, a: string, b: string, c: string) => [a, b, c][gi]);
  s = s.replace(PARAM_RE, (m, k: string) => {
    const v = k in params ? params[k] : ctx.globals[k];
    if (v === undefined) return m;
    if (typeof v === 'string' && v.startsWith('@')) return t(v.slice(1));
    if (typeof v === 'string' && k === 'items') return v.split('|').map((x) => (x.startsWith('@') ? t(x.slice(1)) : x)).join(', ');
    return String(v);
  });
  return s;
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  const raw = DICTS[ctx.lang][key] ?? DICTS.es[key];
  if (raw === undefined) return key;
  return format(raw, params);
}

/** Igual que t() pero devuelve '' si no existe la clave. */
export function tOpt(key: string, params: Record<string, string | number> = {}): string {
  const raw = DICTS[ctx.lang][key] ?? DICTS.es[key];
  return raw === undefined ? '' : format(raw, params);
}
