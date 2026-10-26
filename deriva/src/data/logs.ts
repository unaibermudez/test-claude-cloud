import type { LogDef, ZoneId } from '../core/content';

type K = LogDef['kind'];
const L = (n: number, zone: ZoneId, kind: K, extra: Partial<LogDef> = {}): LogDef => ({ id: `R${String(n).padStart(2, '0')}`, zone, kind, ...extra });

export const LOGS: LogDef[] = [
  L(1, 1, 'placa', { fixedFloor: 1 }), L(2, 1, 'correo'), L(3, 1, 'diario'), L(4, 1, 'informe'), L(5, 1, 'grabacion'),
  L(6, 1, 'nota'), L(7, 1, 'correo'), L(8, 1, 'diario'), L(9, 1, 'registro'), L(10, 1, 'grabacion'),
  L(11, 1, 'pintada', { cond: { deathsGte: 1 } }), L(12, 1, 'informe'),
  L(13, 2, 'diario'), L(14, 2, 'informe'), L(15, 2, 'correo'), L(16, 2, 'grabacion'), L(17, 2, 'pintada'),
  L(18, 2, 'informe'), L(19, 2, 'diario'), L(20, 2, 'correo'), L(21, 2, 'lista'), L(22, 2, 'grabacion'),
  L(23, 2, 'informe'), L(24, 2, 'nota'),
  L(25, 3, 'diario'), L(26, 3, 'informe'), L(27, 3, 'correo'), L(28, 3, 'informe', { truth: true }), L(29, 3, 'grabacion'),
  L(30, 3, 'pintada'), L(31, 3, 'diario'), L(32, 3, 'informe'), L(33, 3, 'correo', { cond: { deathsGte: 1 } }), L(34, 3, 'manual'),
  L(35, 3, 'grabacion'), L(36, 3, 'pintada'),
  L(37, 4, 'informe'), L(38, 4, 'acta', { truth: true }), L(39, 4, 'transcripcion'), L(40, 4, 'diario'), L(41, 4, 'informe'),
  L(42, 4, 'solicitud', { truth: true, cond: { any: [{ deathsGte: 2 }, { arcGte: ['lenz', 3] }] } }),
  L(43, 4, 'nota', { cond: { deathsGte: 3 } }), L(44, 4, 'informe'), L(45, 4, 'correo'), L(46, 4, 'transcripcion'),
  L(47, 4, 'pintada'), L(48, 4, 'grabacion'), L(49, 4, 'informe'), L(50, 4, 'diario', { cond: { deathsGte: 1 } }),
  L(51, 5, 'bitacora'), L(52, 5, 'orden'), L(53, 5, 'registro'), L(54, 5, 'informe', { truth: true }), L(55, 5, 'grabacion'),
  L(56, 5, 'correo'), L(57, 5, 'informe'), L(58, 5, 'lista'), L(59, 5, 'plan'), L(60, 5, 'grabacion', { cond: { trustGte: 40 } }),
  L(61, 6, 'bitacora'), L(62, 6, 'nota'), L(63, 6, 'grabacion'), L(64, 6, 'informe'), L(65, 6, 'grabacion'), L(66, 6, 'nota'),
];

export const LOG_IDS = LOGS.map((l) => l.id);
export function logDef(id: string): LogDef | undefined {
  return LOGS.find((l) => l.id === id);
}
