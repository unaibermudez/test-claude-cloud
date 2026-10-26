import { TILE, type FloorMap, type Prop, type DoorState } from './state';

export function idx(m: { w: number }, x: number, y: number): number {
  return y * m.w + x;
}

export function inBounds(m: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w && y < m.h;
}

export function tileAt(m: FloorMap, x: number, y: number): number {
  if (!inBounds(m, x, y)) return TILE.VOID;
  return m.tiles[y * m.w + x];
}

export function doorAt(m: FloorMap, x: number, y: number): DoorState | undefined {
  return m.doors[y * m.w + x];
}

/** Casillas por las que se puede caminar (sin contar puertas ni objetos). */
export function walkableTile(t: number, exterior: boolean): boolean {
  return (
    t === TILE.FLOOR || t === TILE.GRATE || t === TILE.PLANTS || t === TILE.PLATE ||
    t === TILE.RUBBLE || (exterior && t === TILE.VOID)
  );
}

export function isOpaqueTile(t: number): boolean {
  return t === TILE.WALL || t === TILE.CRACKED || t === TILE.PILLAR || t === TILE.PLANTS || t === TILE.AIRLOCK;
}

/** ¿Bloquea la vista la casilla (teniendo en cuenta puertas)? */
export function opaque(m: FloorMap, x: number, y: number): boolean {
  if (!inBounds(m, x, y)) return true;
  const i = y * m.w + x;
  const t = m.tiles[i];
  if (t === TILE.DOOR) {
    const d = m.doors[i];
    return !(d && (d.open || d.broken));
  }
  return isOpaqueTile(t);
}

export function doorPassable(d: DoorState | undefined): boolean {
  if (!d) return false;
  if (d.broken) return true;
  return !d.sealed && d.lock === null;
}

// --------- Índice de objetos (no serializado) ---------

const propIndex = new WeakMap<FloorMap, { count: number; byCell: Map<number, Prop[]> }>();

export function invalidateProps(m: FloorMap): void {
  propIndex.delete(m);
}

export function propsAt(m: FloorMap, x: number, y: number): Prop[] {
  let ix = propIndex.get(m);
  if (!ix || ix.count !== m.props.length) {
    const byCell = new Map<number, Prop[]>();
    for (const p of m.props) {
      const k = p.y * m.w + p.x;
      const arr = byCell.get(k);
      if (arr) arr.push(p);
      else byCell.set(k, [p]);
    }
    ix = { count: m.props.length, byCell };
    propIndex.set(m, ix);
  }
  return ix.byCell.get(y * m.w + x) ?? [];
}

const BLOCKING_PROPS = new Set([
  'terminal', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'cryopod',
  'barrel', 'exit', 'entry', 'airlockPanel', 'npc', 'core', 'radio', 'hullExit', 'bed',
]);
const BLOCKING_DECOR = new Set([
  'bed', 'table', 'locker', 'shelf', 'cryopod_off', 'planter', 'hydro_tank', 'generator', 'crate',
  'toolrack', 'tank', 'console', 'tank_lab', 'gurney', 'monitor', 'map_table', 'server', 'antenna', 'valve',
]);
export const DECOR_KINDS = BLOCKING_DECOR;

export function propBlocks(p: Prop, decorName?: string): boolean {
  if (p.kind === 'decor') return decorName ? BLOCKING_DECOR.has(decorName) : (p.label ? BLOCKING_DECOR.has(p.label) : false);
  if (p.kind === 'container') return true;
  return BLOCKING_PROPS.has(p.kind);
}

export function blockedByProp(m: FloorMap, x: number, y: number): boolean {
  for (const p of propsAt(m, x, y)) if (propBlocks(p)) return true;
  return false;
}

/** ¿Puede una entidad terrestre ocupar la casilla? (sin considerar otras entidades) */
export function passable(
  m: FloorMap, x: number, y: number,
  opts: { flying?: boolean; ignoreDoors?: boolean; allowVoid?: boolean } = {},
): boolean {
  if (!inBounds(m, x, y)) return false;
  const i = y * m.w + x;
  const t = m.tiles[i];
  if (t === TILE.DOOR) {
    if (opts.ignoreDoors) return true;
    return doorPassable(m.doors[i]);
  }
  if (t === TILE.VOID) {
    if (m.zone !== 6 || !(opts.flying || opts.allowVoid)) return false;
    return true;
  }
  if (!walkableTile(t, false)) return false;
  return !blockedByProp(m, x, y);
}

export function sectionAt(m: FloorMap, x: number, y: number): number {
  if (!inBounds(m, x, y)) return -1;
  return m.sec[y * m.w + x];
}

export function pressureAt(m: FloorMap, x: number, y: number): number {
  const s = sectionAt(m, x, y);
  if (s < 0) {
    // puertas: media de secciones vecinas; vacío exterior = 0
    if (tileAt(m, x, y) === TILE.DOOR) {
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const s2 = sectionAt(m, x + dx, y + dy);
        if (s2 >= 0) best = Math.max(best, m.sections[s2].pressure);
      }
      return best;
    }
    return 0;
  }
  return m.sections[s].pressure;
}

export function isExteriorCell(m: FloorMap, x: number, y: number): boolean {
  const t = tileAt(m, x, y);
  return t === TILE.VOID || t === TILE.PLATE;
}
