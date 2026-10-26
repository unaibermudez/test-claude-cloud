import type { RunState, Room, Prop, ItemStack } from './state';
import { TILE } from './state';
import { int, chance, pick, weighted, shuffle } from './rng';
import { zoneDef } from '../data/zones';
import { REGULAR_ENEMIES, ELITES, enemyDef } from '../data/enemies';
import { ALL_ITEMS, itemDef } from '../data/items';
import { LOCKED_IMPLANTS, upgradeDef } from '../data/upgrades';
import { LOGS } from '../data/logs';
import { spawnActor, actorAt } from './actors';
import { passable, invalidateProps, propsAt } from './map';
import { chebyshev } from './geom';
import { evalCond, pickFloorScene, allLogsKnown } from './narrative';
import { setLootPool } from './combat';
import { hasPerkFlag } from './rules';
import { BAL } from '../data/balance';

function roomCellsFree(st: RunState, r: Room): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!passable(st.map, x, y)) continue;
      if (propsAt(st.map, x, y).length) continue;
      if (actorAt(st, x, y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function unlockedImplant(st: RunState, id: string): boolean {
  if (!LOCKED_IMPLANTS.has(id)) return true;
  return st.perks.some((p) => upgradeDef(p)?.unlockImplants?.includes(id));
}

/** Generador de botín ponderado por zona. */
export function lootRoll(st: RunState, opts: { types?: string[]; minTier?: number } = {}): string | null {
  const z = st.zone;
  const pool = ALL_ITEMS.filter((d) => d.tier > 0 && d.tier <= Math.min(4, z + 1) && (d.tier >= (opts.minTier ?? 0)) &&
    (!opts.types || opts.types.includes(d.type)) && (d.type !== 'implant' || unlockedImplant(st, d.id)) && d.type !== 'quest' && d.type !== 'suit');
  if (pool.length === 0) return null;
  const it = weighted(st.rng, pool, (d) => {
    let w = d.weight ?? 1;
    if (d.type === 'weapon') w *= 0.35;
    if (d.type === 'implant') w *= 0.35;
    if (d.type === 'gadget') w *= 0.6;
    if (d.tier > z) w *= 0.35;
    if (d.tier < z - 1) w *= 0.6;
    return w;
  });
  return it.id;
}

setLootPool((st) => () => lootRoll(st));

function stackFor(st: RunState, id: string): ItemStack {
  const d = itemDef(id);
  const s: ItemStack = { id, n: 1 };
  if ((d.type === 'implant' || d.type === 'weapon') && d.unknown && chance(st.rng, 0.22)) s.cursed = true;
  if (d.type === 'weapon' && chance(st.rng, 0.06)) s.cursed = true;
  return s;
}

export function populateFloor(st: RunState, tutorial: boolean): void {
  const m = st.map;
  const rng = st.rng;
  const entry = m.entry;
  const rooms = m.rooms;
  const startRoom = rooms.find((r) => r.kind === 'start')!;
  // ---- contenedores y botín
  for (const p of m.props) {
    if (p.kind !== 'container') continue;
    const loot: ItemStack[] = [];
    const n = p.variant === 3 ? 3 : p.variant === 2 ? 3 : int(rng, 0, 2);
    for (let k = 0; k < n; k++) {
      const id = lootRoll(st, p.variant && p.variant >= 2 ? { minTier: Math.max(1, st.zone - 1) } : {});
      if (id) loot.push(stackFor(st, id));
    }
    p.loot = loot;
    p.charges = int(rng, 2, 8) + (p.variant === 3 ? 15 : 0);
  }
  // suministros en el suelo
  const nItems = tutorial ? 3 : int(rng, 2, 4);
  const lootRooms = rooms.filter((r) => r.kind !== 'boss' && r.kind !== 'secret');
  for (let k = 0; k < nItems; k++) {
    const r = pick(rng, lootRooms);
    const cells = roomCellsFree(st, r);
    if (!cells.length) continue;
    const c = pick(rng, cells);
    const id = tutorial ? pick(rng, ['vendas', 'bombona', 'mun_clavos']) : lootRoll(st, { types: ['consumable', 'ammo', 'gadget', 'part'] });
    if (id) st.items.push({ id: st.nextId++, x: c.x, y: c.y, item: stackFor(st, id) });
  }
  // traje EVA en 4-3 si se conoce el código del casco
  if (m.zone === 4 && m.floor === 3 && st.metaSnapshot.flags.hull_code && !st.player.suit) {
    const cont = m.props.find((p) => p.kind === 'container');
    if (cont) cont.loot = [...(cont.loot ?? []), { id: 'traje_eva', n: 1 }];
  }
  // alijo de zona (mejora)
  if (m.floor === 1 && hasPerkFlag(st, 'zone_cache') && !tutorial) {
    const cells = roomCellsFree(st, startRoom);
    if (cells.length) {
      const c = pick(rng, cells);
      for (const id of ['botiquin', 'bombona', 'bateria']) st.items.push({ id: st.nextId++, x: c.x, y: c.y, item: { id, n: 1 } });
    }
  }
  // ---- tiendas
  for (const p of m.props) {
    if (p.kind === 'vending') {
      p.stock = [];
      const ids = shuffle(rng, ['botiquin', 'vendas', 'bombona', 'bateria', 'sedante', 'mun_balas', 'mun_clavos', 'mun_cartuchos', 'mun_virotes', 'raciones', 'antirad', 'bombona_g', 'medigel', 'bateria_g', 'sellador', 'bengala']);
      for (const id of ids.slice(0, 6)) {
        const d = itemDef(id);
        if (d.tier > st.zone + 1) continue;
        p.stock.push({ item: id, price: Math.round(d.price * (1 + 0.08 * st.zone)), n: int(rng, 1, 3) });
      }
    } else if (p.kind === 'merchant') {
      p.stock = [];
      const picks = [lootRoll(st, { types: ['weapon'] }), lootRoll(st, { types: ['weapon'] }), lootRoll(st, { types: ['implant'] }), lootRoll(st, { types: ['implant'] }), lootRoll(st, { types: ['gadget'] }), 'kit_implante'];
      for (const id of picks) {
        if (!id) continue;
        const d = itemDef(id);
        p.stock.push({ item: id, price: Math.round(d.price * (1 + 0.1 * st.zone)), n: 1 });
      }
    }
  }
  // ---- registros
  placeLogs(st, tutorial);
  // ---- escenas narrativas
  placeScenes(st, tutorial);
  // ---- enemigos
  if (m.boss) placeBoss(st);
  else placeEnemies(st, tutorial, entry);
  invalidateProps(m);
}

function placeLogs(st: RunState, tutorial: boolean): void {
  const m = st.map;
  if (m.boss) return;
  const known = allLogsKnown(st);
  const zoneLogs = LOGS.filter((l) => l.zone === m.zone && evalCond(st, l.cond) && !st.narrative.flags[`placed_${l.id}`]);
  const fixed = zoneLogs.filter((l) => l.fixedFloor === m.floor);
  const unknown = zoneLogs.filter((l) => !l.fixedFloor && !known.has(l.id));
  const knownOnes = zoneLogs.filter((l) => !l.fixedFloor && known.has(l.id));
  const n = tutorial ? 1 : 2 + (m.zone >= 4 ? 1 : 0) + (m.zone === 6 ? 0 : 0);
  const chosen = [...fixed];
  shuffle(st.rng, unknown);
  while (chosen.length < n + fixed.length && unknown.length) chosen.push(unknown.pop()!);
  if (chosen.length < n && knownOnes.length && chance(st.rng, 0.5)) chosen.push(pick(st.rng, knownOnes));
  for (const l of chosen) {
    const rooms = l.fixedFloor ? m.rooms.filter((r) => r.kind === 'start') : m.rooms.filter((r) => r.kind !== 'start' || chance(st.rng, 0.2));
    const r = pick(st.rng, rooms.length ? rooms : m.rooms);
    const cells = roomCellsFree(st, r);
    if (!cells.length) continue;
    const c = pick(st.rng, cells);
    m.props.push({ id: nextPropId(st), kind: 'log', x: c.x, y: c.y, log: l.id, variant: logVariant(l.kind) });
    st.narrative.flags[`placed_${l.id}`] = 1;
  }
}

function logVariant(kind: string): number {
  if (kind === 'pintada' || kind === 'nota' || kind === 'placa') return 1;
  if (kind === 'grabacion' || kind === 'transcripcion' || kind === 'bitacora') return 2;
  return 0;
}

export function nextPropId(st: RunState): number {
  let max = 0;
  for (const p of st.map.props) max = Math.max(max, p.id);
  return max + 1;
}

function placeScenes(st: RunState, tutorial: boolean): void {
  const m = st.map;
  const placeIn = (r: Room, sceneId: string, isNpc: boolean, npcId?: string): Prop | null => {
    const cells = roomCellsFree(st, r).filter((c) => chebyshev(c.x, c.y, m.entry.x, m.entry.y) > 2);
    if (!cells.length) return null;
    const c = pick(st.rng, cells);
    const p: Prop = { id: nextPropId(st), kind: isNpc ? 'npc' : 'event', x: c.x, y: c.y, scene: sceneId };
    if (npcId) p.npc = npcId as Prop['npc'];
    m.props.push(p);
    return p;
  };
  if (m.boss) {
    if (m.zone === 6) {
      const s = pickFloorScene(st, 6, 4, ['npc']);
      const exitR = m.rooms.find((r) => r.kind === 'exit');
      if (s && exitR) placeIn(exitR, s.id, true, s.npc);
    }
    return;
  }
  const eventRoom = m.rooms.find((r) => r.kind === 'event') ?? m.rooms.find((r) => r.kind === 'normal');
  if (eventRoom && !(tutorial && st.metaSnapshot.runs === 0)) {
    const s = pickFloorScene(st, m.zone, m.floor, ['npc']) ?? pickFloorScene(st, m.zone, m.floor, ['event']);
    if (s) {
      placeIn(eventRoom, s.id, s.kind === 'npc', s.npc);
      st.narrative.flags[`reserved_${s.id}`] = 1;
      if (!s.repeat) st.narrative.scenesDone.push(s.id);
    }
  }
  if (!tutorial && chance(st.rng, 0.5)) {
    const s = pickFloorScene(st, m.zone, m.floor, ['event']);
    const rooms = m.rooms.filter((r) => r.kind === 'normal' || r.kind === 'airlock');
    if (s && rooms.length) {
      placeIn(pick(st.rng, rooms), s.id, false);
      st.narrative.scenesDone.push(s.id);
    }
  }
  // radio: se dispara tras unos turnos
  const radio = pickFloorScene(st, m.zone, m.floor, ['radio']);
  if (radio && (chance(st.rng, 0.75) || radio.npc === 'faro' || radio.npc === 'tomas')) {
    st.narrative.flags.radioTurn = 6 + int(st.rng, 0, 20);
    st.narrative.flags[`radio_${radio.id}`] = 1;
    st.map.radio = radio.id;
    st.narrative.scenesDone.push(radio.id);
  } else {
    st.map.radio = null;
  }
}

function placeEnemies(st: RunState, tutorial: boolean, entry: { x: number; y: number }): void {
  const m = st.map;
  const z = zoneDef(m.zone);
  const rng = st.rng;
  let budget = tutorial ? 4 : z.enemyBudget[0] + z.enemyBudget[1] * (m.floor - 1);
  if (st.opts.mode === 'pesadilla') budget = Math.round(budget * 1.3);
  if (st.opts.mode === 'dificil') budget = Math.round(budget * 1.15);
  if (m.zone === 2 && st.narrative.flags.spores_reduced) budget -= 1;
  const pool = REGULAR_ENEMIES.filter((e) => e.zone === m.zone && (e.minFloor ?? 1) <= m.floor && (!tutorial || (e.threat <= 2 && e.behavior !== 'turret')));
  const rooms = m.rooms.filter((r) => r.kind !== 'start' && r.kind !== 'secret' && r.kind !== 'shop' && r.kind !== 'rest');
  const farCells = (r: Room) => roomCellsFree(st, r).filter((c) => chebyshev(c.x, c.y, entry.x, entry.y) >= 8);
  let guard = 0;
  while (budget > 0 && guard++ < 80) {
    const d = weighted(rng, pool, (e) => 1 / Math.sqrt(e.threat));
    if (d.threat > budget + 1) continue;
    const r = pick(rng, rooms);
    let cells = farCells(r);
    if (d.behavior === 'ambush' && d.id === 'durmiente') {
      const pods = m.props.filter((p) => p.kind === 'cryopod');
      if (pods.length) {
        const pod = pick(rng, pods);
        cells = [{ x: pod.x, y: pod.y }].flatMap((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))).filter((c) => passable(m, c.x, c.y) && !actorAt(st, c.x, c.y) && chebyshev(c.x, c.y, entry.x, entry.y) >= 6);
      }
    }
    if (d.behavior === 'ambush' && d.id === 'raiz') {
      const plant = roomCellsFree(st, r).filter((c) => m.tiles[c.y * m.w + c.x] === TILE.PLANTS);
      if (plant.length) cells = plant.filter((c) => chebyshev(c.x, c.y, entry.x, entry.y) >= 6);
    }
    if (!cells.length) continue;
    const pack = d.behavior === 'swarm' ? int(rng, 2, m.zone >= 3 ? 3 : 2) : 1;
    for (let k = 0; k < pack && cells.length; k++) {
      const c = cells.splice(int(rng, 0, cells.length - 1), 1)[0];
      const elite = !tutorial && chance(rng, z.eliteChance + (st.opts.mode === 'pesadilla' ? 0.1 : 0)) ? pick(rng, ELITES) : undefined;
      const a = spawnActor(st, d.id, c.x, c.y, { elite });
      if (d.behavior === 'summoner') a.zoneSummon = m.zone === 6 ? 'eco_deriva' : 'sujeto';
    }
    budget -= d.threat * (pack > 1 ? 1.2 : 1);
  }
  // mini-jefes en los pisos 2 y 3
  if (!tutorial && (m.floor === 2 || m.floor === 3)) {
    const id = z.minis[m.floor - 2];
    const big = m.rooms.filter((r) => r.kind === 'normal' || r.kind === 'airlock' || r.kind === 'exit').sort((a, b) => b.w * b.h - a.w * a.h);
    const r = big.find((q) => q.kind !== 'exit') ?? big[0];
    if (r) {
      const cells = farCells(r);
      const c = cells.length ? pick(rng, cells) : null;
      if (c) {
        const a = spawnActor(st, id, c.x, c.y, { mode: 'idle' });
        a.ai.homeX = c.x; a.ai.homeY = c.y;
        r.kind = 'mini';
      }
    }
  }
}

function placeBoss(st: RunState): void {
  const m = st.map;
  const z = zoneDef(m.zone);
  const arena = m.rooms.find((r) => r.kind === 'boss')!;
  let id = z.boss;
  if (m.zone === 5 && st.narrative.trust >= 50) id = 'coro_pleno';
  const cx = arena.x + Math.floor(arena.w / 2);
  const cy = arena.y + Math.floor(arena.h / 2);
  const a = spawnActor(st, id, cx, cy, { mode: 'idle' });
  a.ai.homeX = cx; a.ai.homeY = cy;
  void enemyDef;
  if (m.zone === 5 && st.narrative.flags.solis_cover) {
    const ante = m.rooms.find((r) => r.kind === 'ante');
    if (ante) {
      const cells = roomCellsFree(st, ante);
      if (cells.length) {
        const c = pick(st.rng, cells);
        const s = spawnActor(st, 'npc_solis', c.x, c.y, { faction: 'ally' });
        s.npc = 'solis';
      }
    }
  }
  void BAL;
}
