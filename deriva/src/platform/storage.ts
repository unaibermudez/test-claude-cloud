/** Acceso seguro a localStorage (puede fallar en modo privado). */
const PREFIX = 'deriva.';

export const KEYS = {
  meta: 'meta.v2',
  run: 'run.v1',
  settings: 'settings.v1',
  backup: 'meta.backup',
} as const;

const mem = new Map<string, string>();

export function load(key: string): string | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    // almacenamiento no disponible
  }
  return mem.get(key) ?? null;
}

export function save(key: string, value: string): boolean {
  mem.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  mem.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // nada
  }
}
