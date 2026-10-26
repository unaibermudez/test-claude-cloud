/** Serialización versionada con migraciones para la meta y la partida en curso. */
import type { RunState } from './state';
import { RUN_VERSION } from './game';
import { META_VERSION, newMeta, type MetaState } from './meta';

export interface Envelope<T> { game: 'deriva'; kind: 'meta' | 'run' | 'export'; v: number; data: T }

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;

/** Migraciones de la meta: índice i convierte de la versión i+1 a la i+2. */
export const META_MIGRATIONS: Migration[] = [
  // v1 → v2: se añade el registro de clases jugadas y el historial
  (d) => ({ ...d, classesPlayed: (d.classesPlayed as string[] | undefined) ?? [], history: (d.history as unknown[] | undefined) ?? [], version: 2 }),
];

export const RUN_MIGRATIONS: Migration[] = [];

export function migrate(data: Record<string, unknown>, from: number, to: number, list: Migration[]): Record<string, unknown> {
  let d = data;
  for (let v = from; v < to; v++) {
    const fn = list[v - 1];
    if (!fn) throw new Error(`Falta la migración ${v}→${v + 1}`);
    d = fn(d);
  }
  return d;
}

export function serializeMeta(meta: MetaState): string {
  const env: Envelope<MetaState> = { game: 'deriva', kind: 'meta', v: META_VERSION, data: meta };
  return JSON.stringify(env);
}

export function deserializeMeta(raw: string | null | undefined): MetaState {
  if (!raw) return newMeta();
  const env = JSON.parse(raw) as Envelope<Record<string, unknown>>;
  if (env.game !== 'deriva' || (env.kind !== 'meta' && env.kind !== 'export')) throw new Error('Formato de guardado no válido');
  if (env.v > META_VERSION) throw new Error('Guardado de una versión más reciente');
  const data = migrate(env.data, env.v, META_VERSION, META_MIGRATIONS);
  // completar campos ausentes con valores por defecto
  const base = newMeta() as unknown as Record<string, unknown>;
  const merged = { ...base, ...data } as unknown as MetaState;
  merged.stats = { ...newMeta().stats, ...(merged.stats ?? {}) };
  merged.arcs = { ...newMeta().arcs, ...(merged.arcs ?? {}) };
  merged.profile = { ...newMeta().profile, ...(merged.profile ?? {}) };
  merged.version = META_VERSION;
  return merged;
}

export function serializeRun(run: RunState): string {
  const env: Envelope<RunState> = { game: 'deriva', kind: 'run', v: RUN_VERSION, data: run };
  return JSON.stringify(env);
}

export function deserializeRun(raw: string | null | undefined): RunState | null {
  if (!raw) return null;
  const env = JSON.parse(raw) as Envelope<Record<string, unknown>>;
  if (env.game !== 'deriva' || env.kind !== 'run') return null;
  if (env.v > RUN_VERSION) return null;
  const data = migrate(env.data, env.v, RUN_VERSION, RUN_MIGRATIONS) as unknown as RunState;
  if (!data.map || !Array.isArray(data.actors)) return null;
  return data;
}

/** Exportación completa (meta + partida opcional) para copiar o descargar. */
export function exportAll(meta: MetaState, run: RunState | null): string {
  return JSON.stringify({ game: 'deriva', kind: 'export', v: META_VERSION, data: meta, run: run ? JSON.parse(serializeRun(run)) : null }, null, 0);
}

export function importAll(raw: string): { meta: MetaState; run: RunState | null } {
  const obj = JSON.parse(raw) as Envelope<Record<string, unknown>> & { run?: Envelope<Record<string, unknown>> | null };
  if (obj.game !== 'deriva') throw new Error('No es un archivo de DERIVA');
  const meta = deserializeMeta(JSON.stringify({ ...obj, kind: 'meta' }));
  const run = obj.run ? deserializeRun(JSON.stringify(obj.run)) : null;
  return { meta, run };
}
