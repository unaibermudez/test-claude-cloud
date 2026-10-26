/**
 * Objetivo actual de la partida, para orientar al jugador: qué hacer ahora y hacia dónde.
 * Solo usa información que el jugador ya puede conocer (casillas vistas).
 */
import type { RunState } from '../core/state';
import { getPlayer } from '../core/actors';
import { getStats } from '../core/rules';
import { enemyDef } from '../data/enemies';

export interface Objective { key: string; params?: Record<string, string | number>; x?: number; y?: number; urgent?: boolean }

export function objective(st: RunState): Objective {
  const m = st.map;
  const p = getPlayer(st);
  const seen = (x: number, y: number): boolean => !!m.seen[y * m.w + x];
  const at = (q: { x: number; y: number }): { x?: number; y?: number } => (seen(q.x, q.y) ? { x: q.x, y: q.y } : {});

  // oxígeno bajo: lo primero es sobrevivir
  const s = getStats(st);
  if (st.player.o2 / Math.max(1, s.maxO2) < 0.3) {
    let best: { x: number; y: number } | null = null; let bd = Infinity;
    for (const q of m.props) {
      if (q.kind !== 'o2station' || q.used || !seen(q.x, q.y)) continue;
      const d = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y));
      if (d < bd) { bd = d; best = q; }
    }
    return best ? { key: 'ui.obj.o2', x: best.x, y: best.y, urgent: true } : { key: 'ui.obj.o2_find', urgent: true };
  }
  const boss = st.actors.find((a) => !a.dead && a.boss && enemyDef(a.def).rank === 'boss');
  if (boss) return { key: 'ui.obj.boss', params: { name: `@enemy.${boss.def}.name` }, ...at(boss) };
  const core = m.props.find((q) => q.kind === 'core');
  if (core) return { key: 'ui.obj.core', ...at(core) };
  const needAmber = Object.values(m.doors).some((d) => d.lock === 'amber') && !st.player.keys.includes('amber');
  if (needAmber) {
    const card = m.props.find((q) => q.kind === 'keycard' && q.key === 'amber');
    if (card && seen(card.x, card.y)) return { key: 'ui.obj.card_get', x: card.x, y: card.y };
    return { key: 'ui.obj.card_find' };
  }
  const ex = m.props.find((q) => q.kind === 'exit') ?? m.exit;
  return seen(ex.x, ex.y) ? { key: 'ui.obj.exit', x: ex.x, y: ex.y } : { key: 'ui.obj.exit_find' };
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** Flecha y distancia (en casillas) desde el jugador hasta el objetivo; vacío si no hay destino conocido. */
export function bearing(st: RunState, o: Objective): string {
  if (o.x === undefined || o.y === undefined) return '';
  const p = getPlayer(st);
  const dx = o.x - p.x; const dy = o.y - p.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  if (d <= 1) return '•';
  const k = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return `${ARROWS[k]} ${d}`;
}
