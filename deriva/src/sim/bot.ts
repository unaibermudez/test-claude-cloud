/**
 * Bot de simulación: juega partidas completas sin interfaz para detectar bloqueos y medir el balance.
 * Solo usa lo que el jugador podría saber: casillas exploradas, entidades visibles y su inventario.
 */
import type { RunState, Prop } from '../core/state';
import { TILE } from '../core/state';
import type { Action } from '../core/player';
import { terminalOps, RECIPES, canCraft, hackHint, rangedInfo, interactTarget } from '../core/player';
import { step } from '../core/game';
import { getPlayer, actorAt } from '../core/actors';
import { getVision } from '../core/vision';
import { getStats, isKnown } from '../core/rules';
import { distanceMap, UNREACHABLE } from '../core/path';
import { DIRS, chebyshev } from '../core/geom';
import { hasLos } from '../core/fov';
import { blocksSight } from '../core/vision';
import { itemDef } from '../data/items';
import { enemyDef } from '../data/enemies';
import { visibleOptions } from '../core/narrative';
import { pressureAt, passable } from '../core/map';
import { validPicks } from '../core/hack';

export type Strategy = 'agresivo' | 'sigilo' | 'prudente';

export interface BotMemory {
  stuck: number;
  hist: number[];
  ignoreItems: Set<number>;
  exploreOnly: number;
  plan?: { key: string; dirs: number[]; at: number };
  refuge?: { x: number; y: number };
  refugeUntil: number;
  lastPos: string;
  floorTurns: number;
  visitedProps: Set<number>;
  lastFloor: number;
}

export function newBotMemory(): BotMemory {
  return { stuck: 0, lastPos: '', floorTurns: 0, visitedProps: new Set(), lastFloor: -1, hist: [], ignoreItems: new Set(), exploreOnly: 0, refugeUntil: 0 };
}

let curMem: BotMemory | null = null;

function known(st: RunState, i: number): boolean {
  return st.map.seen[i] === 1;
}

function costFn(st: RunState, strategy: Strategy) {
  const m = st.map;
  const stats = getStats(st);
  const enemies = st.actors.filter((a) => !a.dead && a.faction === 'enemy' && !a.phantom);
  const v = getVision(st);
  const danger = new Uint8Array(m.w * m.h);
  for (const e of enemies) {
    if (!v.seenActors.has(e.id)) continue;
    const r = strategy === 'sigilo' ? 3 : 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = e.x + dx; const y = e.y + dy;
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) danger[y * m.w + x] = 1;
    }
  }
  return (x: number, y: number): number => {
    const i = y * m.w + x;
    if (!known(st, i)) return -1;
    const t = m.tiles[i];
    let c = 1;
    if (t === TILE.DOOR) {
      const d = m.doors[i];
      if (!d) return -1;
      if (d.sealed) return -1;
      if (d.lock === 'boss') return -1;
      if (d.lock === 'circuit') { if (st.player.energy < 6) return -1; c += 3; }
      else if (d.lock && !st.player.keys.includes(d.lock)) return -1;
      if (!d.open) c += 1;
    } else if (t === TILE.VOID) {
      if (m.zone !== 6 || m.sec[i] < 0) return -1;
      c += 2;
    } else {
      const walk = t === TILE.FLOOR || t === TILE.GRATE || t === TILE.PLANTS || t === TILE.PLATE || t === TILE.RUBBLE;
      if (!walk) return -1;
      for (const p of m.props) if (p.x === x && p.y === y && blocks(p)) return -1;
    }
    if (m.fire[i] > 0) c += 60;
    for (const d of DIRS) if (m.fire[i + d.y * m.w + d.x] > 0) { c += 4; break; }
    if (pressureAt(m, x, y) < 30 && m.zone !== 6) c += stats.vacuum > 0.5 ? 2 : 8;
    if (m.gas[i] >= 3) c += 8;
    if (danger[i]) c += strategy === 'sigilo' ? 12 : 2;
    const s = m.sec[i];
    if (s >= 0 && m.sections[s].radiation > 0) c += 3;
    return c;
  };
}

function blocks(p: Prop): boolean {
  return ['terminal', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'cryopod', 'barrel', 'exit', 'entry', 'airlockPanel', 'npc', 'core', 'radio', 'hullExit', 'bed', 'container'].includes(p.kind) ||
    (p.kind === 'decor' && !!p.label && ['bed', 'table', 'locker', 'shelf', 'cryopod_off', 'planter', 'hydro_tank', 'generator', 'crate', 'toolrack', 'tank', 'console', 'tank_lab', 'gurney', 'monitor', 'map_table', 'server', 'antenna', 'valve'].includes(p.label));
}

/** Primer paso de un camino óptimo hacia cualquiera de los objetivos (casillas objetivo o adyacentes). */
function stepTo(st: RunState, targets: { x: number; y: number }[], strategy: Strategy, adjacentOk: boolean): number {
  if (!targets.length) return -1;
  const m = st.map;
  const p = getPlayer(st);
  const cost = costFn(st, strategy);
  const goals: { x: number; y: number }[] = [];
  for (const t of targets) {
    if (adjacentOk) {
      for (const d of DIRS) {
        const x = t.x + d.x; const y = t.y + d.y;
        if (x >= 0 && y >= 0 && x < m.w && y < m.h && cost(x, y) >= 0) goals.push({ x, y });
      }
    } else if (cost(t.x, t.y) >= 0) goals.push(t);
  }
  if (!goals.length) return -1;
  if (goals.some((g) => g.x === p.x && g.y === p.y)) return -2;
  // seguir un plan ya calculado hacia el mismo objetivo (evita oscilaciones)
  const key = `${targets[0].x},${targets[0].y},${targets.length},${adjacentOk}`;
  const plan = curMem?.plan;
  if (plan && plan.key === key && plan.dirs.length && plan.at === p.y * m.w + p.x) {
    const k = plan.dirs[0];
    const nx = p.x + DIRS[k].x; const ny = p.y + DIRS[k].y;
    const occ = actorAt(st, nx, ny);
    if (cost(nx, ny) >= 0 && !(occ && occ.faction !== 'enemy')) {
      plan.dirs.shift();
      plan.at = ny * m.w + nx;
      return k;
    }
  }
  const dm = botDist(st, goals, (x, y) => (x === p.x && y === p.y ? 1 : cost(x, y)));
  if (curMem) {
    // construir un plan de varios pasos siguiendo el gradiente
    const dirs: number[] = [];
    let cx = p.x; let cy = p.y;
    for (let s2 = 0; s2 < 10; s2++) {
      let bk = -1; let bv = dm[cy * m.w + cx];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DIRS[k].x; const ny = cy + DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const v = dm[ny * m.w + nx];
        if (v >= bv) continue;
        if (k % 2 === 1 && !passable(m, cx + DIRS[k].x, cy) && !passable(m, cx, cy + DIRS[k].y)) continue;
        bv = v; bk = k;
      }
      if (bk < 0) break;
      dirs.push(bk);
      cx += DIRS[bk].x; cy += DIRS[bk].y;
      if (bv === 0) break;
    }
    curMem.plan = { key, dirs: dirs.slice(1), at: -1 };
    if (dirs.length) curMem.plan.at = (p.y + DIRS[dirs[0]].y) * m.w + p.x + DIRS[dirs[0]].x;
  }
  let best = -1; let bd = dm[p.y * m.w + p.x];
  if (bd >= UNREACHABLE) return -1;
  for (let k = 0; k < 8; k++) {
    const d = DIRS[k];
    const x = p.x + d.x; const y = p.y + d.y;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
    const v = dm[y * m.w + x];
    if (v >= bd) continue;
    const occ = actorAt(st, x, y);
    if (occ && occ.faction !== 'enemy') continue;
    if (k % 2 === 1) {
      // sin cortar esquinas
      if (!passable(m, p.x + d.x, p.y) && !passable(m, p.x, p.y + d.y)) continue;
    }
    bd = v; best = k;
  }
  return best;
}

/** Dijkstra en 8 direcciones que respeta la regla de no cortar esquinas del juego. */
function botDist(st: RunState, sources: { x: number; y: number }[], cost: (x: number, y: number) => number): Int32Array {
  const m = st.map;
  const W = m.w; const H = m.h;
  const dist = new Int32Array(W * H).fill(UNREACHABLE);
  const buckets: number[][] = [];
  for (const s of sources) { const i = s.y * W + s.x; dist[i] = 0; (buckets[0] ??= []).push(i); }
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (const i of b) {
      if (dist[i] !== d) continue;
      const x = i % W; const y = (i - x) / W;
      for (let k = 0; k < 8; k++) {
        const nx = x + DIRS[k].x; const ny = y + DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (k % 2 === 1 && !passable(m, x + DIRS[k].x, y) && !passable(m, x, y + DIRS[k].y)) continue;
        const c = cost(nx, ny);
        if (c < 0) continue;
        const nd = d + c;
        const ni = ny * W + nx;
        if (nd < dist[ni]) { dist[ni] = nd; (buckets[nd] ??= []).push(ni); }
      }
    }
  }
  return dist;
}

function frontier(st: RunState): { x: number; y: number }[] {
  const m = st.map;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < m.tiles.length; i++) {
    if (!known(st, i)) continue;
    const t = m.tiles[i];
    if (t !== TILE.FLOOR && t !== TILE.DOOR && t !== TILE.GRATE && t !== TILE.PLANTS && t !== TILE.PLATE && t !== TILE.RUBBLE) continue;
    const x = i % m.w; const y = Math.floor(i / m.w);
    for (const d of DIRS) {
      const nx = x + d.x; const ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const ni = ny * m.w + nx;
      if (!known(st, ni) && m.tiles[ni] !== TILE.VOID) { out.push({ x, y }); break; }
    }
  }
  return out;
}

function invIndex(st: RunState, pred: (id: string) => boolean): number {
  return st.player.inv.findIndex((s) => pred(s.id));
}

function modalAction(st: RunState, strategy: Strategy, mem: BotMemory): Action {
  const md = st.modal!;
  switch (md.kind) {
    case 'dialog': {
      const opts = visibleOptions(st).filter((o) => o.enabled);
      if (!opts.length) return { t: 'choice', index: 0 };
      if (md.scene === 'core') {
        // preferir finales "interesantes" según la estrategia
        const order = strategy === 'agresivo' ? [0, 1, 2, 3, 5, 4] : strategy === 'sigilo' ? [5, 3, 2, 1, 0, 4] : [5, 2, 3, 0, 1, 4];
        for (const o of order) { const f = opts.find((x) => x.index === o); if (f) return { t: 'choice', index: f.index }; }
      }
      if (md.node.startsWith('c_')) return { t: 'choice', index: 0 };
      const pickIdx = strategy === 'agresivo' ? opts[0] : strategy === 'sigilo' ? opts[opts.length - 1] : opts[Math.min(1, opts.length - 1)];
      return { t: 'choice', index: pickIdx.index };
    }
    case 'terminal': {
      const pr = st.map.props.find((q) => q.id === md.propId)!;
      if (!pr.hacked) {
        if ((pr.lockout ?? 0) > 0 || mem.visitedProps.has(pr.id * 10 + 1)) return { t: 'closeModal' };
        mem.visitedProps.add(pr.id * 10 + 1);
        return { t: 'termOp', op: 'hack' };
      }
      const ops = terminalOps(st, pr).map((o) => o.id);
      const done = (op: string): boolean => mem.visitedProps.has(hash(pr.id, op));
      const want = ['boss_shield', 'open_circuits', 'map', 'turrets', 'cameras', 'cables', 'drones'].find((o) => ops.includes(o) && !done(o));
      if (want) { mem.visitedProps.add(hash(pr.id, want)); return { t: 'termOp', op: want }; }
      return { t: 'closeModal' };
    }
    case 'hack': {
      const h = md.hack;
      const hint = hackHint(st);
      if (hint >= 0) return { t: 'hack', cell: hint };
      const vp = validPicks(h);
      if (vp.length && !h.finished) return { t: 'hack', cell: vp[0] };
      return { t: 'hackAbort' };
    }
    case 'shop': {
      const pr = st.map.props.find((q) => q.id === md.propId)!;
      const stock = pr.stock ?? [];
      const prio = ['botiquin', 'bombona', 'medigel', 'bombona_g', 'bateria', 'vendas', 'mun_clavos', 'mun_balas', 'mun_cartuchos', 'mun_virotes', 'kit_implante'];
      const ammoNeed = st.player.ranged ? itemDef(st.player.ranged.id).weapon!.ammo : null;
      for (const id of prio) {
        const i = stock.findIndex((e) => e.item === id && e.n > 0 && e.price <= st.player.scrap);
        if (i < 0) continue;
        if (id.startsWith('mun_') && ammoNeed !== id.slice(4)) continue;
        if (st.player.inv.length >= 13) break;
        return { t: 'buy', index: i };
      }
      return { t: 'closeModal' };
    }
    case 'workbench': {
      for (const r of RECIPES) if (canCraft(st, r) && st.player.inv.length < 13) return { t: 'craft', recipe: r.id };
      return { t: 'closeModal' };
    }
    case 'surgeon': {
      const i = st.player.inv.findIndex((s) => itemDef(s.id).type === 'implant' && !st.player.implants[itemDef(s.id).implant!.slot]);
      if (i >= 0 && st.player.scrap >= 10) return { t: 'install', slot: i };
      return { t: 'closeModal' };
    }
    default:
      return { t: 'closeModal' };
  }
}

function hash(a: number, s: string): number {
  let h = a * 131;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Decide la siguiente acción del bot. */
export function botDecide(st: RunState, strategy: Strategy, mem: BotMemory): Action {
  curMem = mem;
  if (st.modal) return modalAction(st, strategy, mem);
  const p = getPlayer(st);
  const m = st.map;
  const stats = getStats(st);
  const v = getVision(st);
  if (mem.lastFloor !== st.floorNo) { mem.lastFloor = st.floorNo; mem.visitedProps = new Set(); mem.floorTurns = 0; mem.ignoreItems = new Set(); mem.hist = []; }
  mem.floorTurns++;
  // anti-oscilación: si apenas se mueve, abandona objetivos secundarios un rato
  mem.hist.push(p.y * m.w + p.x);
  if (mem.hist.length > 14) mem.hist.shift();
  if (mem.hist.length >= 14 && new Set(mem.hist).size <= 3 && mem.exploreOnly <= 0) {
    mem.exploreOnly = 40;
    for (const q of m.props) if (chebyshev(q.x, q.y, p.x, p.y) <= 3) mem.visitedProps.add(q.id);
    for (const it of st.items) if (chebyshev(it.x, it.y, p.x, p.y) <= 3) mem.ignoreItems.add(it.id);
  }
  if (mem.exploreOnly > 0) mem.exploreOnly--;
  if (st.player.drifting) return { t: 'wait' };
  // supervivencia
  const hpPct = p.hp / stats.maxHp;
  const heal = invIndex(st, (id) => ['botiquin', 'medigel', 'vendas', 'raciones', 'iny_coagulante', 'iny_regen'].includes(id) && isKnown(st, id));
  if (hpPct < 0.45 && heal >= 0) return { t: 'use', slot: heal };
  const o2 = invIndex(st, (id) => id === 'bombona' || id === 'bombona_g');
  if (st.player.o2 < 25 && o2 >= 0) return { t: 'use', slot: o2 };
  const bat = invIndex(st, (id) => id === 'bateria' || id === 'bateria_g');
  if (st.player.energy < 15 && bat >= 0) return { t: 'use', slot: bat };
  const sed = invIndex(st, (id) => id === 'sedante' || (id === 'iny_claridad' && isKnown(st, id)));
  if (st.player.noise > 60 && sed >= 0) return { t: 'use', slot: sed };
  // probar inyectores desconocidos con calma
  const unk = invIndex(st, (id) => !isKnown(st, id) && itemDef(id).type === 'consumable');
  if (unk >= 0 && hpPct < 0.25 && heal < 0) return { t: 'use', slot: unk };
  if (unk >= 0 && hpPct > 0.7 && !st.actors.some((a) => !a.dead && a.faction === 'enemy' && v.seenActors.has(a.id))) return { t: 'use', slot: unk };
  // equipar armas mejores
  for (let i = 0; i < st.player.inv.length; i++) {
    const d = itemDef(st.player.inv[i].id);
    if (d.type !== 'weapon' || !d.weapon || st.player.inv[i].cursed) continue;
    const cur = d.weapon.kind === 'melee' ? st.player.melee : st.player.ranged;
    const curAvg = cur ? (itemDef(cur.id).weapon!.dmg[0] + itemDef(cur.id).weapon!.dmg[1]) / 2 : 0;
    const avg = (d.weapon.dmg[0] + d.weapon.dmg[1]) / 2;
    if (avg > curAvg + 0.5 && !(cur?.cursed)) return { t: 'equip', slot: i };
  }
  // instalar implantes con kit
  if (st.player.inv.some((s) => s.id === 'kit_implante')) {
    const i = st.player.inv.findIndex((s) => itemDef(s.id).type === 'implant' && !st.player.implants[itemDef(s.id).implant!.slot]);
    if (i >= 0) return { t: 'install', slot: i };
  }
  // linterna en la oscuridad
  const li = v.light[p.y * m.w + p.x];
  if (!st.player.flashlight && li < 0.15 && st.player.energy > 20 && strategy !== 'sigilo' && !(m.sec[p.y * m.w + p.x] >= 0 && !m.sections[m.sec[p.y * m.w + p.x]].dark && m.event !== 'apagon')) return { t: 'toggleLight' };
  const secHere = m.sec[p.y * m.w + p.x];
  const ambientLit = secHere >= 0 && !m.sections[secHere].dark && m.event !== 'apagon';
  if (st.player.flashlight && (st.player.energy < 12 || ambientLit)) return { t: 'toggleLight' };
  const anySeen = st.actors.some((a) => !a.dead && a.faction === 'enemy' && v.seenActors.has(a.id));
  if (strategy === 'sigilo' && !st.player.sneak && anySeen) return { t: 'toggleSneak' };
  if (strategy === 'sigilo' && st.player.sneak && !anySeen) return { t: 'toggleSneak' };
  // salir del fuego
  if (m.fire[p.y * m.w + p.x] > 0) {
    for (let d = 0; d < 8; d++) {
      const x = p.x + DIRS[d].x; const y = p.y + DIRS[d].y;
      if (m.fire[y * m.w + x] === 0 && costFn(st, strategy)(x, y) >= 0 && !actorAt(st, x, y)) return { t: 'move', dir: d };
    }
  }
  // combate
  const visible = st.actors.filter((a) => !a.dead && a.faction === 'enemy' && v.seenActors.has(a.id));
  visible.sort((a, b) => chebyshev(a.x, a.y, p.x, p.y) - chebyshev(b.x, b.y, p.x, p.y));
  const threat = visible.find((a) => a.ai.mode === 'hunt' || chebyshev(a.x, a.y, p.x, p.y) <= 2 || strategy === 'agresivo' || a.boss ||
    (strategy === 'prudente' && chebyshev(a.x, a.y, p.x, p.y) <= 5 && enemyDef(a.def).behavior !== 'turret'));
  if (threat && hpPct < 0.3 && heal < 0 && !threat.boss) {
    // retirada: elegir un refugio lejano y comprometerse con él
    if (!mem.refuge || mem.refugeUntil < st.turn) {
      const dm = distanceMap(m.w, m.h, visible.map((a) => ({ x: a.x, y: a.y })), (x, y) => costFn(st, strategy)(x, y) < 0 ? -1 : 1, 40);
      let bi = -1; let bv = -1;
      for (let i = 0; i < dm.length; i++) if (dm[i] < UNREACHABLE && dm[i] > bv && m.fire[i] === 0) { bv = dm[i]; bi = i; }
      if (bi >= 0) { mem.refuge = { x: bi % m.w, y: Math.floor(bi / m.w) }; mem.refugeUntil = st.turn + 15; }
    }
    if (mem.refuge) {
      const k = stepTo(st, [mem.refuge], strategy, false);
      if (k >= 0) return { t: 'move', dir: k };
    }
  }
  if (threat) {
    const dist = chebyshev(threat.x, threat.y, p.x, p.y);
    const boss = !!threat.boss;
    // granadas contra grupos o jefes
    const gren = invIndex(st, (id) => id === 'granada' || (id === 'incendiaria' && dist >= 4) || (id === 'granada_pem' && !!enemyDef(threat.def).robot));
    if (gren >= 0 && dist >= 3 && dist <= 5 && hasLos(p.x, p.y, threat.x, threat.y, (x, y) => blocksSight(st, x, y)) && (boss || visible.filter((a) => chebyshev(a.x, a.y, threat.x, threat.y) <= 1).length >= 2)) {
      return { t: 'throw', slot: gren, x: threat.x, y: threat.y };
    }
    const ri = rangedInfo(st);
    const los = hasLos(p.x, p.y, threat.x, threat.y, (x, y) => blocksSight(st, x, y));
    if (dist === 1) {
      // en sigilo, empujar al vacío o al fuego si es posible
      const dx = threat.x - p.x; const dy = threat.y - p.y;
      const k = DIRS.findIndex((d) => d.x === dx && d.y === dy);
      const behind = m.tiles[(threat.y + dy) * m.w + threat.x + dx];
      if ((behind === TILE.BREACH) && k >= 0) return { t: 'shove', dir: k };
      if (ri.ok && st.player.ranged && strategy !== 'agresivo' && itemDef(st.player.ranged.id).weapon!.range <= 3) return { t: 'fire', x: threat.x, y: threat.y };
      return { t: 'move', dir: k };
    }
    if (ri.ok && los && dist <= ri.range) return { t: 'fire', x: threat.x, y: threat.y };
    if (strategy === 'sigilo' && !threat.boss && threat.ai.mode !== 'hunt') {
      // seguir el objetivo evitando
    } else {
      const k = stepTo(st, [{ x: threat.x, y: threat.y }], 'agresivo', true);
      if (k >= 0) return { t: 'move', dir: k };
    }
  }
  // descansar si es seguro (la regeneración natural cuesta oxígeno y tiempo)
  const hunted = st.actors.some((a) => !a.dead && a.faction === 'enemy' && !a.phantom && a.ai.mode === 'hunt' && chebyshev(a.x, a.y, p.x, p.y) <= 10);
  if (!hunted && hpPct < 0.5 && st.player.o2 > stats.maxO2 * 0.55 && st.orbit > 1500) return { t: 'wait' };
  // jefe con escudo: hackear terminales de la arena
  const shielded = st.actors.find((a) => !a.dead && a.boss && a.boss.shield);
  if (shielded) {
    const terms = m.props.filter((q) => q.kind === 'terminal' && q.label === 'boss' && !(q.lockout && q.lockout > 0));
    const target = terms.find((q) => !q.hacked) ?? terms[0];
    if (target) {
      if (chebyshev(target.x, target.y, p.x, p.y) <= 1) {
        mem.visitedProps.delete(hash(target.id, 'boss_shield'));
        mem.visitedProps.delete(target.id * 10 + 1);
        return { t: 'interact', dir: DIRS.findIndex((d) => d.x === target.x - p.x && d.y === target.y - p.y) };
      }
      const k = stepTo(st, [target], strategy, true);
      if (k >= 0) return { t: 'move', dir: k };
    }
  }
  // recoger lo que haya bajo los pies
  const here = st.items.find((it) => it.x === p.x && it.y === p.y && !mem.ignoreItems.has(it.id));
  if (here) {
    const d = itemDef(here.item.id);
    if ((d.type !== 'weapon' && st.player.inv.length < 13) || d.type === 'ammo' || d.type === 'suit') return { t: 'pickup' };
    mem.ignoreItems.add(here.id);
  }
  // interacción adyacente útil
  const adj = interactTarget(st);
  if (adj && !mem.visitedProps.has(adj.id)) {
    const useful = (adj.kind === 'o2station' && st.player.o2 < stats.maxO2 * 0.75) || (adj.kind === 'powernode' && st.player.energy < stats.maxEnergy * 0.7) ||
      adj.kind === 'container' || adj.kind === 'log' || adj.kind === 'npc' || adj.kind === 'event' || adj.kind === 'core' ||
      (adj.kind === 'terminal' && !adj.hacked) || ((adj.kind === 'vending' || adj.kind === 'merchant') && st.player.scrap >= 20) ||
      adj.kind === 'workbench' || (adj.kind === 'autosurgeon' && st.player.inv.some((s) => itemDef(s.id).type === 'implant')) ||
      (adj.kind === 'bed' && hpPct < 0.7);
    if (useful) {
      mem.visitedProps.add(adj.id);
      return { t: 'interact', dir: DIRS.findIndex((d) => d.x === adj.x - p.x && d.y === adj.y - p.y) };
    }
  }
  // objetivos conocidos
  const seenProp = (q: Prop): boolean => m.seen[q.y * m.w + q.x] === 1 && !mem.visitedProps.has(q.id);
  const wantO2 = st.player.o2 < stats.maxO2 * 0.6;
  const goals: { x: number; y: number; adj: boolean }[] = [];
  const exitP = m.props.find((q) => (q.kind === 'exit' || q.kind === 'core') && m.seen[q.y * m.w + q.x] === 1);
  const keyP = m.props.filter((q) => q.kind === 'keycard' && m.seen[q.y * m.w + q.x] === 1);
  // prioridades duras: oxígeno y llaves
  const hard: { x: number; y: number }[] = [];
  if (wantO2) for (const q of m.props) if (q.kind === 'o2station' && !q.used && m.seen[q.y * m.w + q.x]) hard.push({ x: q.x, y: q.y });
  if (hard.length) { const k = stepTo(st, hard, strategy, true); if (k >= 0) return { t: 'move', dir: k }; }
  if (keyP.length) { const k = stepTo(st, keyP, strategy, false); if (k >= 0) return { t: 'move', dir: k }; }
  // botín y narrativa cercana
  for (const q of m.props) {
    if (!seenProp(q)) continue;
    if (q.kind === 'container' && !q.used && chebyshev(q.x, q.y, p.x, p.y) < 14) goals.push({ x: q.x, y: q.y, adj: true });
    if (q.kind === 'log' || (q.kind === 'npc' && !q.used) || (q.kind === 'event' && !q.used)) goals.push({ x: q.x, y: q.y, adj: q.kind !== 'log' });
    if (q.kind === 'powernode' && !q.used && st.player.energy < stats.maxEnergy * 0.5) goals.push({ x: q.x, y: q.y, adj: true });
  }
  for (const it of st.items) if (m.seen[it.y * m.w + it.x] && !mem.ignoreItems.has(it.id) && chebyshev(it.x, it.y, p.x, p.y) < 10 && (st.player.inv.length < 12 || itemDef(it.item.id).type === 'ammo')) goals.push({ x: it.x, y: it.y, adj: false });
  if (goals.length && mem.floorTurns < 450 && mem.exploreOnly <= 0) {
    const adjGoals = goals.filter((g) => g.adj);
    const pointGoals = goals.filter((g) => !g.adj);
    let k = stepTo(st, pointGoals, strategy, false);
    if (k === -1 || k === -2) k = stepTo(st, adjGoals, strategy, true);
    if (k >= 0) return { t: 'move', dir: k };
  }
  // salida
  const exitDoorsOpen = exitP && Object.entries(m.doors).every(([, d]) => d.lock !== 'amber' || st.player.keys.includes('amber'));
  if (exitP && exitDoorsOpen) {
    if (chebyshev(exitP.x, exitP.y, p.x, p.y) <= 1) return { t: 'interact', dir: DIRS.findIndex((d) => d.x === exitP.x - p.x && d.y === exitP.y - p.y) };
    const k = stepTo(st, [exitP], strategy, true);
    if (k >= 0) return { t: 'move', dir: k };
  }
  // jefe vivo en la arena
  const boss = st.actors.find((a) => !a.dead && a.boss && enemyDef(a.def).rank === 'boss');
  if (boss && m.seen[boss.y * m.w + boss.x]) {
    const k = stepTo(st, [boss], 'agresivo', true);
    if (k >= 0) return { t: 'move', dir: k };
  }
  // explorar
  const fr = frontier(st);
  const k = stepTo(st, fr, strategy, false);
  if (k >= 0) return { t: 'move', dir: k };
  // si todo falla: abrir puertas cercanas o esperar
  for (let d = 0; d < 8; d++) {
    const x = p.x + DIRS[d].x; const y = p.y + DIRS[d].y;
    const door = m.doors[y * m.w + x];
    if (door && !door.open && !door.sealed && (door.lock === null || st.player.keys.includes(door.lock) || (door.lock === 'circuit' && st.player.energy >= 6))) return { t: 'move', dir: d };
  }
  mem.stuck++;
  if (mem.stuck % 20 === 0 && st.narrative.trust >= 60) return { t: 'askAgora', what: 'door' };
  return { t: 'move', dir: (mem.stuck * 3) % 8 };
}

export interface BotResult {
  victory: boolean;
  ending: string | null;
  cause: string;
  zone: number;
  floor: number;
  floorNo: number;
  turns: number;
  kills: number;
  steps: number;
  stuck: boolean;
  logs: number;
  scenes: number;
  hpLowest: number;
  floorTurns: number[];
  deathsByFloor: string;
  tail: string[];
}

/** Juega una partida hasta el final o el límite de pasos. */
export function playRun(st: RunState, strategy: Strategy, maxSteps = 40000): BotResult {
  const mem = newBotMemory();
  let steps = 0;
  let lastTurn = st.turn;
  let idle = 0;
  const floorTurns: number[] = [];
  let floorStart = 0;
  let curFloor = st.floorNo;
  let lowest = 999;
  let lastKey = ''; let repeats = 0;
  const tail: string[] = [];
  while (!st.over && steps < maxSteps) {
    let a = botDecide(st, strategy, mem);
    const key = JSON.stringify(a) + st.turn + JSON.stringify(st.modal);
    if (key === lastKey) repeats++; else { repeats = 0; lastKey = key; }
    if (repeats >= 3) a = st.modal ? (st.modal.kind === 'dialog' ? { t: 'choice', index: repeats % 4 } : { t: 'closeModal' }) : { t: 'wait' };
    const evs = step(st, a);
    steps++;
    tail.push(`T${st.turn} ${JSON.stringify(a)} ${JSON.stringify(st.modal)} ${evs.filter((e) => e.t === 'msg').map((e) => (e as { key: string }).key).join(',')}`);
    if (tail.length > 20) tail.shift();
    const p = getPlayer(st);
    lowest = Math.min(lowest, p.hp);
    if (st.floorNo !== curFloor) { floorTurns.push(st.turn - floorStart); floorStart = st.turn; curFloor = st.floorNo; }
    if (st.turn === lastTurn) { idle++; if (idle > 300) break; } else { idle = 0; lastTurn = st.turn; }
  }
  return {
    victory: !!st.over?.victory, ending: st.over?.ending ?? null, cause: st.over?.cause ?? (steps >= maxSteps ? 'timeout' : 'stuck'),
    zone: st.zone, floor: st.map.floor, floorNo: st.floorNo, turns: st.turn, kills: st.stats.kills, steps, stuck: !st.over,
    logs: st.narrative.logsFound.length, scenes: st.narrative.scenesDone.length, hpLowest: lowest, floorTurns,
    deathsByFloor: `${st.zone}-${st.map.floor}`, tail,
  };
}
export const _debug = { stepTo, frontier, costFn };
