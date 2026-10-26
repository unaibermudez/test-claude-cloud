import type { RunState, Prop, Actor, ItemStack } from './state';
import { TILE } from './state';
import type { EventSink } from './events';
import type { ImplantSlot } from './content';
import { IMPLANT_SLOTS } from './content';
import { BAL } from '../data/balance';
import { itemDef } from '../data/items';
import { enemyDef } from '../data/enemies';
import { int, chance } from './rng';
import { getPlayer, actorAt, hostile, spawnActor, freeSpotNear } from './actors';
import { attack, weaponSpec, explode, damageActor, breakWindow, ignite, addNoise, projectilePath, isUnaware, isOuterWall, push, type AttackSpec } from './combat';
import { getStats, addItem, removeItem, countItem, isKnown, hasPerkFlag } from './rules';
import { passable, inBounds, tileAt, doorAt, invalidateProps, propsAt } from './map';
import { DIRS, chebyshev, dirIndex, line } from './geom';
import { hasLos } from './fov';
import { blocksSight } from './vision';
import { emitNoise } from './noise';
import { foundLog, startScene, setTrust, knownItemName, chooseOption } from './narrative';
import { nextPropId } from './populate';
import { createHack, hackPick, solveNext } from './hack';
import { bossTerminalHacked } from './boss';

export type Action =
  | { t: 'move'; dir: number }
  | { t: 'shove'; dir: number }
  | { t: 'wait' }
  | { t: 'rest' }
  | { t: 'interact'; dir?: number }
  | { t: 'fire'; x: number; y: number }
  | { t: 'throw'; slot: number; x: number; y: number }
  | { t: 'use'; slot: number }
  | { t: 'equip'; slot: number }
  | { t: 'unequip'; which: 'melee' | 'ranged' }
  | { t: 'drop'; slot: number }
  | { t: 'pickup' }
  | { t: 'toggleLight' }
  | { t: 'toggleSneak' }
  | { t: 'active' }
  | { t: 'door'; x: number; y: number; op: 'open' | 'close' | 'seal' | 'unseal' }
  | { t: 'choice'; index: number }
  | { t: 'hack'; cell: number }
  | { t: 'hackSkip' }
  | { t: 'hackAbort' }
  | { t: 'buy'; index: number }
  | { t: 'sell'; slot: number }
  | { t: 'craft'; recipe: string }
  | { t: 'termOp'; op: string }
  | { t: 'install'; slot: number }
  | { t: 'uninstall'; implant: ImplantSlot }
  | { t: 'identifyLab' }
  | { t: 'closeModal' }
  | { t: 'askAgora'; what: 'identify' | 'door' | 'map' }
  | { t: 'vent' };

export interface ActionResult { cost: number; exertion?: boolean }
const FREE: ActionResult = { cost: 0 };

// ------------------------------------------------------------------ recetas
export interface Recipe { id: string; out: string; n: number; needs: [string, number][]; adv?: boolean }
export const RECIPES: Recipe[] = [
  { id: 'r_granada', out: 'granada', n: 1, needs: [['piezas', 3]] },
  { id: 'r_pem', out: 'granada_pem', n: 1, needs: [['piezas', 2], ['bateria', 1]] },
  { id: 'r_sellador', out: 'sellador', n: 1, needs: [['piezas', 2]] },
  { id: 'r_clavos', out: 'mun_clavos', n: 1, needs: [['piezas', 1]] },
  { id: 'r_balas', out: 'mun_balas', n: 1, needs: [['piezas', 2]] },
  { id: 'r_reparacion', out: 'kit_reparacion', n: 1, needs: [['piezas', 3]] },
  { id: 'r_bengala', out: 'bengala', n: 2, needs: [['piezas', 1]] },
  { id: 'r_dron', out: 'dron', n: 1, needs: [['piezas', 4], ['bateria', 1]], adv: true },
  { id: 'r_mina', out: 'mina', n: 1, needs: [['piezas', 3], ['granada', 1]], adv: true },
  { id: 'r_medigel', out: 'medigel', n: 1, needs: [['botiquin', 1], ['vendas', 2]], adv: true },
  { id: 'r_espuma', out: 'espuma', n: 1, needs: [['piezas', 2], ['sellador', 1]], adv: true },
];

export function recipeAvailable(st: RunState, r: Recipe): boolean {
  return !r.adv || hasPerkFlag(st, 'recipes_adv');
}

export function canCraft(st: RunState, r: Recipe): boolean {
  return recipeAvailable(st, r) && r.needs.every(([id, n]) => countItem(st, id) >= n);
}

// ------------------------------------------------------------------ utilidades

function adjacentProps(st: RunState, x: number, y: number): Prop[] {
  const out: Prop[] = [];
  for (const p of propsAt(st.map, x, y)) out.push(p);
  for (const d of DIRS) for (const p of propsAt(st.map, x + d.x, y + d.y)) out.push(p);
  return out;
}

const INTERACTIVE = new Set(['terminal', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'bed', 'container', 'exit', 'airlockPanel', 'vent', 'log', 'npc', 'event', 'hullExit', 'core', 'cryopod', 'entry', 'camera']);

export function interactTarget(st: RunState, dir?: number): Prop | null {
  const p = getPlayer(st);
  if (dir !== undefined && dir >= 0) {
    const d = DIRS[dir];
    const list = propsAt(st.map, p.x + d.x, p.y + d.y).filter((q) => INTERACTIVE.has(q.kind) && !(q.used && q.kind !== 'exit' && q.kind !== 'terminal'));
    if (list.length) return list[0];
  }
  const cands = adjacentProps(st, p.x, p.y).filter((q) => INTERACTIVE.has(q.kind) && !(q.used && (q.kind === 'o2station' || q.kind === 'powernode' || q.kind === 'container' || q.kind === 'bed' || q.kind === 'event' || q.kind === 'npc')));
  const prio = ['npc', 'event', 'log', 'core', 'exit', 'hullExit', 'terminal', 'container', 'o2station', 'powernode', 'vending', 'merchant', 'workbench', 'autosurgeon', 'bed', 'airlockPanel', 'vent', 'camera', 'cryopod', 'entry'];
  cands.sort((a, b) => prio.indexOf(a.kind) - prio.indexOf(b.kind));
  return cands[0] ?? null;
}

function facingTo(st: RunState, dx: number, dy: number): void {
  const di = dirIndex(dx, dy);
  if (di >= 0) getPlayer(st).facing = di;
}

export function sneakCost(st: RunState): number {
  return getStats(st).moveCost + (st.player.sneak ? 50 : 0);
}

// ------------------------------------------------------------------ movimiento

function pickupAuto(st: RunState, ev: EventSink): void {
  const p = getPlayer(st);
  const m = st.map;
  for (const pr of propsAt(m, p.x, p.y).slice()) {
    if (pr.kind === 'keycard' && pr.key) {
      st.player.keys.push(pr.key);
      m.props.splice(m.props.indexOf(pr), 1);
      invalidateProps(m);
      ev.msg('msg.keycard', { key: `@key.${pr.key}` }, 'good');
      ev.sfx('pickup');
    } else if (pr.kind === 'log' && pr.log) {
      foundLog(st, ev, pr.log);
      m.props.splice(m.props.indexOf(pr), 1);
      invalidateProps(m);
    } else if (pr.kind === 'decor' && pr.label === 'mine') {
      // las minas propias no se activan al pisarlas
    }
  }
  const here = st.items.filter((it) => it.x === p.x && it.y === p.y);
  if (here.length) {
    const names = here.slice(0, 3).map((it) => knownItemName(st, it.item.id));
    ev.msg(here.length > 1 ? 'msg.items_here' : 'msg.item_here', { item: names[0], n: here.length }, 'info');
  }
}

function tryOpenDoor(st: RunState, ev: EventSink, x: number, y: number): ActionResult | null {
  const m = st.map;
  const d = doorAt(m, x, y);
  if (!d || d.open || d.broken) return null;
  if (d.sealed) { ev.msg('msg.door_sealed', {}, 'warn'); return FREE; }
  if (d.lock === 'boss') { ev.msg('msg.door_boss', {}, 'warn'); return FREE; }
  if (d.lock === 'circuit') {
    const cost = BAL.circuitCost;
    if (st.player.energy < cost) { ev.msg('msg.door_circuit_no', { n: cost }, 'warn'); return FREE; }
    st.player.energy -= cost;
    d.lock = null;
    d.open = true;
    ev.msg('msg.door_circuit', { n: cost }, 'info');
    ev.sfx('door_power', x, y);
    emitNoise(st, x, y, BAL.noiseDoor);
    return { cost: 100 };
  }
  if (d.lock) {
    if (st.player.keys.includes(d.lock)) {
      d.lock = null;
      d.open = true;
      ev.msg('msg.door_unlocked', { key: `@key.${st.player.keys.includes('amber') ? 'amber' : 'cyan'}` }, 'good');
      ev.sfx('door_unlock', x, y);
      return { cost: 100 };
    }
    if (hasPerkFlag(st, 'service_key') && !st.narrative.flags.serviceKeyUsed) {
      st.narrative.flags.serviceKeyUsed = 1;
      d.lock = null; d.open = true;
      ev.msg('msg.service_key', {}, 'good');
      return { cost: 100 };
    }
    ev.msg('msg.door_locked', { key: `@key.${d.lock}` }, 'warn');
    return FREE;
  }
  d.open = true;
  ev.sfx('door_open', x, y);
  if (!hasPerkFlag(st, 'silent_doors')) emitNoise(st, x, y, BAL.noiseDoor);
  return { cost: 100 };
}

function playerMove(st: RunState, ev: EventSink, dir: number): ActionResult {
  const m = st.map;
  const p = getPlayer(st);
  const d = DIRS[dir];
  if (!d) return FREE;
  facingTo(st, d.x, d.y);
  // deriva en gravedad cero
  if (m.zone === 6 && st.player.drifting) return driftMove(st, ev, dir);
  const nx = p.x + d.x; const ny = p.y + d.y;
  const occ = actorAt(st, nx, ny);
  if (occ) {
    if (hostile(p, occ) || occ.phantom) {
      const spec = weaponSpec(st, 'melee');
      const sneak = isUnaware(occ);
      const cost = st.player.melee ? itemDef(st.player.melee.id).weapon!.cost ?? 100 : 100;
      if (st.player.melee && itemDef(st.player.melee.id).weapon!.ammo === 'energy') {
        const per = itemDef(st.player.melee.id).weapon!.ammoPer ?? 1;
        if (st.player.energy >= per) st.player.energy -= per;
        else spec.traits = spec.traits.filter((t) => t !== 'stun' && t !== 'fire' && t !== 'knockback');
      }
      attack(st, ev, p, occ, spec, { sneak });
      emitNoise(st, p.x, p.y, spec.traits.includes('silent') ? 1 : BAL.noiseMelee);
      if (st.player.melee?.cursed && chance(st.rng, 0.08)) { ev.msg('msg.weapon_jam', {}, 'warn'); }
      return { cost, exertion: true };
    }
    if (occ.faction === 'ally' && passable(m, nx, ny)) {
      occ.x = p.x; occ.y = p.y; p.x = nx; p.y = ny;
      return { cost: sneakCost(st) };
    }
    return FREE;
  }
  const t = tileAt(m, nx, ny);
  if (t === TILE.DOOR) {
    const r = tryOpenDoor(st, ev, nx, ny);
    if (r) return r;
  }
  if (t === TILE.CRACKED) {
    st.narrative.flags.crackHits = (st.narrative.flags.crackHits ?? 0) + 1;
    const heavy = st.player.melee && (itemDef(st.player.melee.id).weapon!.traits.includes('heavy') || itemDef(st.player.melee.id).weapon!.traits.includes('breach'));
    ev.sfx('thud', nx, ny);
    if (heavy || st.narrative.flags.crackHits >= 4) {
      m.tiles[ny * m.w + nx] = TILE.RUBBLE;
      st.narrative.flags.crackHits = 0;
      ev.msg('msg.wall_breaks', {}, 'good');
      emitNoise(st, nx, ny, 6);
    } else ev.msg('msg.wall_hollow', {}, 'info');
    return { cost: 100, exertion: true };
  }
  if (m.zone === 6 && t === TILE.VOID) {
    // saltar al vacío
    st.player.drifting = true;
    p.vx = d.x; p.vy = d.y;
    p.x = nx; p.y = ny;
    ev.msg('msg.drift_start', {}, 'warn');
    ev.sfx('thruster');
    return { cost: 100 };
  }
  if (!passable(m, nx, ny)) {
    if (t === TILE.BREACH) ev.msg('msg.breach_here', {}, 'danger');
    return FREE;
  }
  if (p.status.rooted) { ev.msg('msg.rooted', {}, 'warn'); return { cost: 100 }; }
  // no atravesar esquinas de pared en diagonal
  if (d.x !== 0 && d.y !== 0) {
    if (!passable(m, p.x + d.x, p.y, { ignoreDoors: false }) && !passable(m, p.x, p.y + d.y, { ignoreDoors: false })) return FREE;
  }
  p.x = nx; p.y = ny;
  ev.push({ t: 'anim', actor: p.id, anim: 'move', dx: d.x, dy: d.y });
  const floorT = tileAt(m, nx, ny);
  ev.sfx(floorT === TILE.GRATE ? 'step_grate' : floorT === TILE.PLANTS ? 'step_plant' : st.map.sec[ny * m.w + nx] >= 0 && st.map.sections[st.map.sec[ny * m.w + nx]].coolant ? 'step_water' : 'step', nx, ny, st.player.sneak ? 0.4 : 1);
  emitNoise(st, nx, ny, st.player.sneak ? BAL.noiseSneak : (floorT === TILE.GRATE ? BAL.noiseMove + 1 : BAL.noiseMove));
  // resbalar
  const sec = m.sec[ny * m.w + nx];
  const slide = (sec >= 0 && m.sections[sec].coolant && chance(st.rng, 0.25)) || (m.event === 'gravedad' && !getStats(st).magboots && chance(st.rng, 0.3));
  if (slide) {
    const sx = nx + d.x; const sy = ny + d.y;
    if (passable(m, sx, sy) && !actorAt(st, sx, sy)) {
      p.x = sx; p.y = sy;
      ev.msg(m.event === 'gravedad' ? 'msg.float' : 'msg.slip', {}, 'warn');
    }
  }
  pickupAuto(st, ev);
  return { cost: sneakCost(st) };
}

function driftMove(st: RunState, ev: EventSink, dir: number): ActionResult {
  const p = getPlayer(st);
  const d = DIRS[dir];
  if ((p.vx !== d.x || p.vy !== d.y) && st.player.energy >= BAL.thrustCost) {
    st.player.energy -= BAL.thrustCost;
    p.vx = d.x; p.vy = d.y;
    ev.sfx('thruster');
    ev.fx('thrust', p.x, p.y);
  }
  return driftStep(st, ev);
}

export function driftStep(st: RunState, ev: EventSink): ActionResult {
  const m = st.map;
  const p = getPlayer(st);
  const vx = p.vx ?? 0; const vy = p.vy ?? 0;
  const nx = p.x + vx; const ny = p.y + vy;
  if (!inBounds(m, nx, ny) || nx <= 0 || ny <= 0 || nx >= m.w - 1 || ny >= m.h - 1) {
    p.hp = 0;
    st.player.lastHitBy = 'eject';
    ev.msg('msg.drift_lost', {}, 'danger');
    return { cost: 100 };
  }
  const occ = actorAt(st, nx, ny);
  const t = tileAt(m, nx, ny);
  if (occ || (t !== TILE.VOID && !passable(m, nx, ny))) {
    st.player.drifting = false; p.vx = 0; p.vy = 0;
    ev.msg('msg.drift_stop', {}, 'info');
    ev.sfx('thud');
    return { cost: 100 };
  }
  p.x = nx; p.y = ny;
  ev.push({ t: 'anim', actor: p.id, anim: 'move', dx: vx, dy: vy });
  if (t !== TILE.VOID) {
    st.player.drifting = false; p.vx = 0; p.vy = 0;
    ev.msg('msg.drift_land', {}, 'good');
    ev.sfx('land');
  }
  return { cost: 100 };
}

// ------------------------------------------------------------------ disparo

export function rangedInfo(st: RunState): { ok: boolean; reason?: string; range: number } {
  const r = st.player.ranged;
  const melee = st.player.melee;
  if (!r) {
    if (melee && itemDef(melee.id).weapon!.range > 1) return { ok: true, range: itemDef(melee.id).weapon!.range };
    return { ok: false, reason: 'msg.no_ranged', range: 0 };
  }
  const w = itemDef(r.id).weapon!;
  const per = w.ammoPer ?? 1;
  if (w.ammo === 'energy') {
    if (st.player.energy < per * getStats(st).energyMult) return { ok: false, reason: 'msg.no_energy', range: w.range };
  } else if (w.ammo && st.player.ammo[w.ammo] < per) return { ok: false, reason: 'msg.no_ammo', range: w.range };
  return { ok: true, range: w.range + 3 };
}

function playerFire(st: RunState, ev: EventSink, tx: number, ty: number): ActionResult {
  const p = getPlayer(st);
  const m = st.map;
  if (tx === p.x && ty === p.y) return FREE;
  facingTo(st, tx - p.x, ty - p.y);
  // arma de alcance cuerpo a cuerpo
  if (!st.player.ranged && st.player.melee && itemDef(st.player.melee.id).weapon!.range > 1) {
    if (chebyshev(p.x, p.y, tx, ty) > 2) { ev.msg('msg.out_of_reach', {}, 'warn'); return FREE; }
    const tgt = actorAt(st, tx, ty);
    if (!tgt || !hasLos(p.x, p.y, tx, ty, (x, y) => blocksSight(st, x, y))) return FREE;
    attack(st, ev, p, tgt, weaponSpec(st, 'melee'), { sneak: true });
    emitNoise(st, p.x, p.y, BAL.noiseMelee);
    return { cost: 100, exertion: true };
  }
  const info = rangedInfo(st);
  if (!info.ok) { ev.msg(info.reason!, {}, 'warn'); return FREE; }
  const stack = st.player.ranged!;
  const w = itemDef(stack.id).weapon!;
  const per = w.ammoPer ?? 1;
  if (stack.cursed && chance(st.rng, 0.15)) {
    ev.msg('msg.weapon_jam', {}, 'warn');
    ev.sfx('jam');
    return { cost: 100 };
  }
  if (w.ammo === 'energy') st.player.energy -= per * getStats(st).energyMult;
  else if (w.ammo) st.player.ammo[w.ammo] -= per;
  const spec: AttackSpec = weaponSpec(st, 'ranged');
  ev.sfx(`fire_${w.ammo === 'energy' ? 'energy' : stack.id}`, p.x, p.y);
  emitNoise(st, p.x, p.y, w.noise);
  if (spec.traits.includes('mental')) addNoise(st, ev, 3);
  const hits: Actor[] = [];
  if (spec.traits.includes('cone')) {
    const ang = Math.atan2(ty - p.y, tx - p.x);
    for (const a of st.actors) {
      if (a.dead || a.id === p.id || !hostile(p, a) && !a.phantom) continue;
      const dist = chebyshev(a.x, a.y, p.x, p.y);
      if (dist > w.range) continue;
      let da = Math.atan2(a.y - p.y, a.x - p.x) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.55) continue;
      if (!hasLos(p.x, p.y, a.x, a.y, (x, y) => blocksSight(st, x, y))) continue;
      hits.push(a);
    }
    ev.fx('cone', p.x, p.y, { tx, ty, color: spec.traits.includes('fire') ? '#ff8f4a' : spec.traits.includes('freeze') ? '#bff' : '#ffe6a0', n: w.range });
    if (spec.traits.includes('fire')) {
      for (const pt of line(p.x, p.y, tx, ty).slice(1, w.range + 1)) if (!blocksSight(st, pt.x, pt.y)) ignite(st, ev, pt.x, pt.y);
    }
  } else {
    const path = projectilePath(st, p.x, p.y, tx, ty);
    let pierced = 0;
    for (const pt of path) {
      const t = tileAt(m, pt.x, pt.y);
      if (t === TILE.WINDOW) { breakWindow(st, ev, pt.x, pt.y); break; }
      for (const pr of propsAt(m, pt.x, pt.y)) {
        if (pr.kind === 'barrel' && !pr.used) { pr.used = true; invalidateProps(m); explode(st, ev, pt.x, pt.y, 2, [6, 10], null); return { cost: w.cost ?? 100 }; }
        if (pr.kind === 'camera' && !pr.off) { pr.off = true; ev.msg('msg.camera_destroyed', {}, 'good'); ev.fx('sparks', pt.x, pt.y); }
      }
      const a = actorAt(st, pt.x, pt.y);
      if (a && a.id !== p.id) {
        hits.push(a);
        if (spec.traits.includes('pierce') && pierced < 1) { pierced++; continue; }
        break;
      }
      if (t === TILE.WALL || t === TILE.DOOR || t === TILE.PILLAR || t === TILE.CRACKED) {
        if (t === TILE.CRACKED && spec.traits.includes('pierce')) { m.tiles[pt.y * m.w + pt.x] = TILE.RUBBLE; ev.msg('msg.wall_breaks', {}, 'good'); }
        break;
      }
    }
    if (hits.length === 0) {
      const last = path[path.length - 1] ?? { x: tx, y: ty };
      ev.fx('shot', p.x, p.y, { tx: last.x, ty: last.y, color: spec.traits.includes('fire') ? '#ff8f4a' : '#ffe6a0' });
      ev.fx('impact', last.x, last.y);
      if (spec.traits.includes('fire')) ignite(st, ev, last.x, last.y);
    }
  }
  for (const a of hits) {
    if (a.dead) continue;
    attack(st, ev, p, a, spec, { sneak: true });
    if (spec.traits.includes('aoe')) {
      for (const o of st.actors) if (!o.dead && o !== a && hostile(p, o) && chebyshev(o.x, o.y, a.x, a.y) <= (w.aoe ?? 1)) attack(st, ev, p, o, { ...spec, traits: spec.traits.filter((t) => t !== 'aoe') });
    }
  }
  if (spec.traits.includes('light')) {
    m.props.push({ id: nextPropId(st), kind: 'emlight', x: tx, y: ty, variant: 1, charges: 12 });
    invalidateProps(m);
  }
  return { cost: w.cost ?? 100, exertion: true };
}

// ------------------------------------------------------------------ gadgets

function playerThrow(st: RunState, ev: EventSink, slot: number, tx: number, ty: number): ActionResult {
  const p = getPlayer(st);
  const m = st.map;
  const stack = st.player.inv[slot];
  if (!stack) return FREE;
  const d = itemDef(stack.id);
  if (d.type !== 'gadget' || !d.gadget) return FREE;
  const g = d.gadget;
  const dist = chebyshev(p.x, p.y, tx, ty);
  if (dist > g.range) { ev.msg('msg.out_of_range', {}, 'warn'); return FREE; }
  if (g.range > 1 && !hasLos(p.x, p.y, tx, ty, (x, y) => blocksSight(st, x, y) && !(x === tx && y === ty))) { ev.msg('msg.no_los', {}, 'warn'); return FREE; }
  // trayectoria: se detiene en obstáculos
  let land = { x: tx, y: ty };
  if (g.range > 1) {
    const path = projectilePath(st, p.x, p.y, tx, ty);
    const last = path[path.length - 1];
    if (last) {
      const t = tileAt(m, last.x, last.y);
      land = (t === TILE.WALL || t === TILE.DOOR && !doorAt(m, last.x, last.y)?.open || t === TILE.WINDOW) && path.length > 1 ? path[path.length - 2] : last;
    }
  }
  const consume = (): void => { removeItem(st, stack.id, 1); st.stats.itemsUsed++; };
  switch (g.kind) {
    case 'grenade':
      consume();
      ev.fx('throw', p.x, p.y, { tx: land.x, ty: land.y });
      explode(st, ev, land.x, land.y, g.radius ?? 1, g.dmg ?? [5, 8], p, false, g.traits ?? []);
      if (g.traits?.includes('fire')) for (const dd of DIRS) ignite(st, ev, land.x + dd.x, land.y + dd.y);
      return { cost: 100, exertion: true };
    case 'emp':
      consume();
      ev.fx('throw', p.x, p.y, { tx: land.x, ty: land.y });
      explode(st, ev, land.x, land.y, g.radius ?? 2, g.dmg ?? [4, 6], p, false, ['emp']);
      for (const pr of m.props) if (pr.kind === 'camera' && chebyshev(pr.x, pr.y, land.x, land.y) <= (g.radius ?? 2)) pr.off = true;
      return { cost: 100 };
    case 'sealer': case 'foam': {
      const r = g.kind === 'foam' ? 1 : 1;
      const cx = g.kind === 'foam' ? land.x : p.x; const cy = g.kind === 'foam' ? land.y : p.y;
      let sealed = 0;
      for (let dy = -r - (g.kind === 'sealer' ? 0 : 0); dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx; const y = cy + dy;
        if (!inBounds(m, x, y)) continue;
        const i = y * m.w + x;
        if (m.tiles[i] === TILE.BREACH) { m.tiles[i] = TILE.WALL; sealed++; ev.fx('foam', x, y); }
        if (g.kind === 'foam') {
          m.fire[i] = 0;
          const a = actorAt(st, x, y);
          if (a && a.id !== p.id && a.faction === 'enemy') a.status.rooted = 3;
          ev.fx('foam', x, y);
        }
      }
      if (g.kind === 'sealer' && sealed === 0) { ev.msg('msg.no_breach', {}, 'warn'); return FREE; }
      consume();
      if (sealed) { ev.msg('msg.breach_sealed', {}, 'good'); ev.sfx('seal'); }
      return { cost: 100 };
    }
    case 'beacon':
      consume();
      ev.fx('throw', p.x, p.y, { tx: land.x, ty: land.y });
      m.props.push({ id: nextPropId(st), kind: 'decor', x: land.x, y: land.y, label: 'beacon', charges: 8 });
      invalidateProps(m);
      emitNoise(st, land.x, land.y, 14, false);
      ev.sfx('beacon', land.x, land.y);
      ev.msg('msg.beacon', {}, 'info');
      return { cost: 100 };
    case 'drone': {
      const s = freeSpotNear(st, p.x, p.y, 2, true);
      if (!s) return FREE;
      consume();
      spawnActor(st, 'dron_aliado', s.x, s.y, { faction: 'ally', ttl: 90 });
      ev.msg('msg.drone_deployed', {}, 'good');
      ev.sfx('drone');
      return { cost: 100 };
    }
    case 'flare':
      consume();
      ev.fx('throw', p.x, p.y, { tx: land.x, ty: land.y, color: '#ff5a5a' });
      m.props.push({ id: nextPropId(st), kind: 'emlight', x: land.x, y: land.y, variant: 1, charges: 35 });
      invalidateProps(m);
      ev.sfx('flare', land.x, land.y);
      return { cost: 100 };
    case 'mine': {
      const s = DIRS.map((dd) => ({ x: p.x + dd.x, y: p.y + dd.y })).find((c) => passable(m, c.x, c.y) && !actorAt(st, c.x, c.y));
      const spot = dist === 1 && passable(m, tx, ty) ? { x: tx, y: ty } : s;
      if (!spot) return FREE;
      consume();
      m.props.push({ id: nextPropId(st), kind: 'decor', x: spot.x, y: spot.y, label: 'mine' });
      invalidateProps(m);
      ev.msg('msg.mine_set', {}, 'info');
      return { cost: 100 };
    }
    case 'charge': {
      if (dist > 1) { ev.msg('msg.out_of_range', {}, 'warn'); return FREE; }
      const t = tileAt(m, tx, ty);
      if (t !== TILE.CRACKED && t !== TILE.DOOR && t !== TILE.WALL) { ev.msg('msg.charge_nothing', {}, 'warn'); return FREE; }
      consume();
      const i = ty * m.w + tx;
      if (t === TILE.DOOR) { const dd = m.doors[i]; dd.broken = true; dd.open = true; dd.lock = dd.lock === 'boss' ? 'boss' : null; dd.sealed = false; }
      else if (t === TILE.CRACKED) m.tiles[i] = TILE.RUBBLE;
      else if (isOuterWall(st, tx, ty) && m.zone !== 6) m.tiles[i] = TILE.BREACH;
      else m.tiles[i] = TILE.RUBBLE;
      explode(st, ev, tx, ty, 1, g.dmg ?? [8, 12], p);
      return { cost: 100 };
    }
    case 'decoy': {
      if (!passable(m, land.x, land.y) || actorAt(st, land.x, land.y)) return FREE;
      consume();
      spawnActor(st, 'senuelo', land.x, land.y, { faction: 'ally', ttl: 12 });
      ev.msg('msg.decoy', {}, 'info');
      return { cost: 100 };
    }
  }
  return FREE;
}

// ------------------------------------------------------------------ objetos

function useItem(st: RunState, ev: EventSink, slot: number): ActionResult {
  const stack = st.player.inv[slot];
  if (!stack) return FREE;
  const d = itemDef(stack.id);
  const p = getPlayer(st);
  const stats = getStats(st);
  if (d.type === 'weapon') return equipItem(st, ev, slot);
  if (d.type === 'implant') return installImplant(st, ev, slot, false);
  if (d.type === 'gadget') { ev.msg('msg.gadget_throw_hint', {}, 'info'); return FREE; }
  if (d.type === 'kit' && stack.id === 'kit_reparacion') {
    const target = [st.player.melee, st.player.ranged].find((s) => s?.cursed) ?? IMPLANT_SLOTS.map((k) => st.player.implants[k]).find((i) => i?.cursed);
    if (!target) { ev.msg('msg.nothing_to_repair', {}, 'info'); return FREE; }
    target.cursed = false;
    removeItem(st, stack.id, 1);
    ev.msg('msg.repaired', {}, 'good');
    return { cost: 100 };
  }
  if (d.type === 'quest' || d.type === 'part' || d.type === 'kit') { ev.msg(`item.${stack.id}.desc`, {}, 'lore'); return FREE; }
  if (d.type !== 'consumable' || !d.consumable) return FREE;
  const c = d.consumable;
  const wasKnown = isKnown(st, stack.id);
  removeItem(st, stack.id, 1);
  st.stats.itemsUsed++;
  if (c.heal) { const amt = Math.round(c.heal * stats.healMult); p.hp = Math.min(stats.maxHp, p.hp + amt); ev.push({ t: 'dmg', x: p.x, y: p.y, amount: amt, kind: 'heal' }); }
  if (c.o2) { st.player.o2 = Math.min(stats.maxO2, st.player.o2 + c.o2); ev.push({ t: 'dmg', x: p.x, y: p.y, amount: c.o2, kind: 'o2' }); }
  if (c.energy) { st.player.energy = Math.min(stats.maxEnergy, st.player.energy + c.energy); ev.push({ t: 'dmg', x: p.x, y: p.y, amount: c.energy, kind: 'energy' }); }
  if (c.noise) addNoise(st, ev, c.noise);
  if (c.cleanse) { delete p.status.bleed; delete p.status.poison; }
  if (c.status) p.status[c.status.id] = Math.max(p.status[c.status.id] ?? 0, c.status.turns);
  if (c.reveal) { st.map.seen.fill(1); ev.msg('msg.map_revealed', {}, 'good'); }
  if (c.identifyAll) for (const s of st.player.inv) st.known[s.id] = true;
  if (c.damage) { p.hp -= c.damage; ev.push({ t: 'dmg', x: p.x, y: p.y, amount: c.damage, kind: 'hp' }); st.player.lastHitBy = 'poison'; if (p.hp < 1) p.hp = 1; }
  if (c.maxHp) st.narrative.flags.bonusMaxHp = (st.narrative.flags.bonusMaxHp ?? 0) + c.maxHp;
  ev.sfx(d.unknown ? 'inject' : stack.id === 'bombona' || stack.id === 'bombona_g' ? 'o2' : 'use');
  if (!wasKnown) {
    st.known[stack.id] = true;
    ev.msg('msg.identified', { item: `@item.${stack.id}.name` }, 'info');
  } else ev.msg('msg.used', { item: `@item.${stack.id}.name` }, 'info');
  return { cost: 100 };
}

function equipItem(st: RunState, ev: EventSink, slot: number): ActionResult {
  const stack = st.player.inv[slot];
  if (!stack) return FREE;
  const d = itemDef(stack.id);
  if (d.type !== 'weapon' || !d.weapon) return FREE;
  const which = d.weapon.kind === 'melee' ? 'melee' : 'ranged';
  const cur = st.player[which];
  if (cur?.cursed) { ev.msg('msg.cursed_stuck', { item: `@item.${cur.id}.name` }, 'warn'); return FREE; }
  st.player.inv.splice(slot, 1);
  if (cur) st.player.inv.push(cur);
  st.player[which] = stack;
  ev.msg(stack.cursed ? 'msg.equip_cursed' : 'msg.equip', { item: `@item.${stack.id}.name` }, stack.cursed ? 'warn' : 'info');
  ev.sfx('equip');
  return { cost: 50 };
}

export function installImplant(st: RunState, ev: EventSink, slot: number, atSurgeon: boolean): ActionResult {
  const stack = st.player.inv[slot];
  if (!stack) return FREE;
  const d = itemDef(stack.id);
  if (d.type !== 'implant' || !d.implant) return FREE;
  const free = atSurgeon && hasPerkFlag(st, 'surgeon_free');
  if (!atSurgeon) {
    if (countItem(st, 'kit_implante') < 1) { ev.msg('msg.need_surgeon', {}, 'warn'); return FREE; }
  } else if (!free && st.player.scrap < 10) { ev.msg('msg.need_scrap', { n: 10 }, 'warn'); return FREE; }
  const s = d.implant.slot;
  const cur = st.player.implants[s];
  if (cur?.cursed && !atSurgeon) { ev.msg('msg.implant_cursed_stuck', {}, 'warn'); return FREE; }
  if (!atSurgeon) removeItem(st, 'kit_implante', 1);
  else if (!free) st.player.scrap -= 10;
  const idx = st.player.inv.indexOf(stack);
  st.player.inv.splice(idx, 1);
  st.player.implants[s] = { id: stack.id, cursed: stack.cursed };
  st.known[stack.id] = true;
  const p = getPlayer(st);
  if (!atSurgeon) { p.hp = Math.max(1, p.hp - 2); }
  ev.msg(stack.cursed ? 'msg.implant_cursed' : 'msg.implant_installed', { item: `@item.${stack.id}.name`, slot: `@slot.${s}` }, stack.cursed ? 'danger' : 'good');
  ev.sfx('implant');
  if (IMPLANT_SLOTS.every((k) => st.player.implants[k])) st.narrative.flags.implantsFull = 1;
  return { cost: atSurgeon ? 0 : 300 };
}

// ------------------------------------------------------------------ interacción

function interact(st: RunState, ev: EventSink, dir?: number): ActionResult {
  const p = getPlayer(st);
  const m = st.map;
  // puertas en la dirección indicada
  if (dir !== undefined && dir >= 0) {
    const d = DIRS[dir];
    const x = p.x + d.x; const y = p.y + d.y;
    const door = doorAt(m, x, y);
    if (door) {
      if (door.open && !door.broken) {
        if (actorAt(st, x, y) || st.items.some((it) => it.x === x && it.y === y)) { ev.msg('msg.door_blocked', {}, 'warn'); return FREE; }
        door.open = false; ev.sfx('door_close', x, y); return { cost: 100 };
      }
      const r = tryOpenDoor(st, ev, x, y);
      if (r) return r;
    }
  }
  const pr = interactTarget(st, dir);
  if (!pr) {
    // recoger del suelo
    if (st.items.some((it) => it.x === p.x && it.y === p.y)) return pickup(st, ev);
    ev.msg('msg.nothing_here', {}, 'info');
    return FREE;
  }
  facingTo(st, pr.x - p.x, pr.y - p.y);
  switch (pr.kind) {
    case 'terminal':
      if (pr.lockout && pr.lockout > 0) { ev.msg('msg.terminal_locked', { n: pr.lockout }, 'warn'); return FREE; }
      st.modal = { kind: 'terminal', propId: pr.id };
      ev.sfx('terminal');
      return FREE;
    case 'o2station': {
      if (pr.used) { ev.msg('msg.station_empty', {}, 'info'); return FREE; }
      const max = getStats(st).maxO2;
      const before = st.player.o2;
      st.player.o2 = max;
      pr.used = true;
      ev.push({ t: 'dmg', x: p.x, y: p.y, amount: Math.round(max - before), kind: 'o2' });
      ev.msg('msg.o2_refill', {}, 'good');
      ev.sfx('o2');
      return { cost: 100 };
    }
    case 'powernode': {
      if (pr.used) { ev.msg('msg.station_empty', {}, 'info'); return FREE; }
      st.player.energy = Math.min(getStats(st).maxEnergy, st.player.energy + 40);
      pr.used = true;
      ev.msg('msg.energy_refill', {}, 'good');
      ev.sfx('power');
      return { cost: 100 };
    }
    case 'vending': case 'merchant':
      st.modal = { kind: 'shop', propId: pr.id };
      ev.sfx('terminal');
      return FREE;
    case 'workbench':
      st.modal = { kind: 'workbench', propId: pr.id };
      return FREE;
    case 'autosurgeon':
      st.modal = { kind: 'surgeon', propId: pr.id };
      ev.sfx('terminal');
      return FREE;
    case 'bed': return rest(st, ev, pr);
    case 'container': {
      if (pr.used) { ev.msg('msg.container_empty', {}, 'info'); return FREE; }
      pr.used = true;
      const scrap = Math.round((pr.charges ?? 0) * getStats(st).scrapMult);
      if (scrap > 0) { st.player.scrap += scrap; st.stats.scrapEarned += scrap; }
      const got: string[] = [];
      for (const s of pr.loot ?? []) {
        if (!addItem(st, s)) st.items.push({ id: st.nextId++, x: p.x, y: p.y, item: s });
        got.push(knownItemName(st, s.id));
      }
      pr.loot = [];
      ev.sfx('container');
      emitNoise(st, pr.x, pr.y, 2);
      if (got.length) ev.msg('msg.container_loot', { items: got.join('|'), n: scrap }, 'good');
      else ev.msg('msg.container_scrap', { n: scrap }, 'info');
      return { cost: 100 };
    }
    case 'exit':
      if (m.boss && st.actors.some((a) => !a.dead && a.boss && enemyDef(a.def).rank === 'boss')) { ev.msg('msg.exit_boss', {}, 'warn'); return FREE; }
      st.narrative.flags.wantDescend = 1;
      return FREE;
    case 'hullExit':
      if (!st.player.suit) { ev.msg('msg.need_suit', {}, 'warn'); return FREE; }
      if (!st.metaSnapshot.flags.hull_code) { ev.msg('msg.need_code', {}, 'warn'); return FREE; }
      st.narrative.flags.wantHull = 1;
      return FREE;
    case 'core':
      startScene(st, ev, 'core', pr.id);
      return FREE;
    case 'entry':
      ev.msg('msg.entry', {}, 'info');
      return FREE;
    case 'cryopod':
      ev.msg(pr.used ? 'msg.cryopod_open' : 'msg.cryopod', {}, 'lore');
      return FREE;
    case 'airlockPanel': return ventSection(st, ev, m.sec[pr.y * m.w + pr.x]);
    case 'vent': {
      const other = m.props.find((q) => q.id === pr.link);
      if (!other) return FREE;
      const s = freeSpotNear(st, other.x, other.y, 2);
      const dest = s ?? { x: other.x, y: other.y };
      if (!passable(m, dest.x, dest.y) || actorAt(st, dest.x, dest.y)) return FREE;
      p.x = dest.x; p.y = dest.y;
      ev.msg('msg.vent_travel', {}, 'info');
      ev.sfx('vent');
      emitNoise(st, p.x, p.y, 1);
      return { cost: 300 };
    }
    case 'log':
      if (pr.log) foundLog(st, ev, pr.log);
      m.props.splice(m.props.indexOf(pr), 1);
      invalidateProps(m);
      return { cost: 100 };
    case 'npc': case 'event':
      if (!pr.scene) return FREE;
      startScene(st, ev, pr.scene, pr.id);
      if (pr.kind === 'event') pr.used = true;
      return FREE;
    case 'camera':
      if (!pr.off) { pr.off = true; ev.msg('msg.camera_destroyed', {}, 'good'); ev.sfx('glass'); return { cost: 100, exertion: true }; }
      return FREE;
  }
  return FREE;
}

function pickup(st: RunState, ev: EventSink): ActionResult {
  const p = getPlayer(st);
  const here = st.items.filter((it) => it.x === p.x && it.y === p.y);
  if (!here.length) { ev.msg('msg.nothing_here', {}, 'info'); return FREE; }
  let any = false;
  for (const it of here) {
    if (addItem(st, it.item)) {
      st.items.splice(st.items.indexOf(it), 1);
      ev.msg('msg.picked', { item: knownItemName(st, it.item.id), n: it.item.n }, 'info');
      any = true;
    } else { ev.msg('msg.inv_full', {}, 'warn'); break; }
  }
  if (any) ev.sfx('pickup');
  return any ? { cost: 100 } : FREE;
}

function rest(st: RunState, ev: EventSink, pr: Prop): ActionResult {
  if (pr.used) { ev.msg('msg.bed_used', {}, 'info'); return FREE; }
  const p = getPlayer(st);
  if (st.actors.some((a) => !a.dead && a.faction === 'enemy' && a.ai.mode === 'hunt' && !a.phantom)) { ev.msg('msg.cant_rest', {}, 'warn'); return FREE; }
  pr.used = true;
  const stats = getStats(st);
  p.hp = Math.min(stats.maxHp, p.hp + Math.round(stats.maxHp * 0.5));
  st.player.noise = Math.max(0, st.player.noise - 30);
  ev.msg('msg.rested', {}, 'good');
  ev.sfx('rest');
  return { cost: 1500 };
}

export function ventSection(st: RunState, ev: EventSink, sec: number): ActionResult {
  const m = st.map;
  if (sec < 0) return FREE;
  if (st.player.energy < BAL.ventCost) { ev.msg('msg.no_energy_n', { n: BAL.ventCost }, 'warn'); return FREE; }
  st.player.energy -= BAL.ventCost;
  const S = m.sections[sec];
  S.vent = 8;
  S.ventedByPlayer = true;
  st.stats.vented += 0;
  st.narrative.flags.ventsUsed = (st.narrative.flags.ventsUsed ?? 0) + 1;
  ev.msg('msg.venting', {}, 'danger');
  ev.sfx('alarm');
  ev.push({ t: 'subtitle', key: 'sub.vent' });
  return { cost: 100 };
}

// ------------------------------------------------------------------ terminales

export interface TermOp { id: string; cost: number; needsHack: boolean }

export function terminalOps(st: RunState, pr: Prop): TermOp[] {
  const m = st.map;
  if (!pr.hacked) return [{ id: 'hack', cost: 0, needsHack: false }, ...(st.opts.skipHack ? [{ id: 'skip', cost: BAL.skipHackCost, needsHack: false }] : [{ id: 'skip', cost: BAL.skipHackCost, needsHack: false }])];
  const ops: TermOp[] = [];
  if (pr.label === 'boss') ops.push({ id: 'boss_shield', cost: 0, needsHack: true });
  if (Object.values(m.doors).some((d) => d.lock === 'circuit')) ops.push({ id: 'open_circuits', cost: 0, needsHack: true });
  ops.push({ id: 'map', cost: 0, needsHack: true });
  ops.push({ id: 'seal_near', cost: BAL.sealCost, needsHack: true });
  const ventables = ventableSections(st);
  for (const s of ventables.slice(0, 4)) ops.push({ id: `vent:${s}`, cost: BAL.ventCost, needsHack: true });
  if (st.actors.some((a) => !a.dead && a.faction === 'enemy' && enemyDef(a.def).behavior === 'turret')) ops.push({ id: 'turrets', cost: 5, needsHack: true });
  if (st.actors.some((a) => !a.dead && a.faction === 'enemy' && enemyDef(a.def).robot && enemyDef(a.def).flying && !a.boss)) ops.push({ id: 'drones', cost: 8, needsHack: true });
  if (m.props.some((q) => q.kind === 'camera' && !q.off)) ops.push({ id: 'cameras', cost: 0, needsHack: true });
  if (m.gas.some((g) => g > 0)) ops.push({ id: 'ventilation', cost: 4, needsHack: true });
  if (m.props.some((q) => q.kind === 'cable' && !q.off)) ops.push({ id: 'cables', cost: 0, needsHack: true });
  ops.push({ id: 'lights', cost: 2, needsHack: true });
  return ops;
}

export function ventableSections(st: RunState): number[] {
  const m = st.map;
  const out = new Set<number>();
  for (let i = 0; i < m.tiles.length; i++) {
    if (m.tiles[i] !== TILE.AIRLOCK && m.tiles[i] !== TILE.WINDOW) continue;
    for (const d of [1, -1, m.w, -m.w]) {
      const s = m.sec[i + d];
      if (s !== undefined && s >= 0 && m.sections[s].vent < 99999) out.add(s);
    }
  }
  return Array.from(out);
}

function termOp(st: RunState, ev: EventSink, op: string): ActionResult {
  const modal = st.modal;
  if (!modal || modal.kind !== 'terminal') return FREE;
  const pr = st.map.props.find((q) => q.id === modal.propId);
  if (!pr) return FREE;
  const m = st.map;
  const p = getPlayer(st);
  const stats = getStats(st);
  if (op === 'hack') {
    const diff = Math.max(1, (pr.hack ?? 2) - (pr.label === 'boss' && st.narrative.flags.valve_code ? 2 : 0));
    st.modal = { kind: 'hack', propId: pr.id, hack: createHack(st.rng, diff, stats.hack + (st.opts.assistHack ? 1 : 0)), purpose: 'terminal' };
    ev.sfx('hack_start');
    return FREE;
  }
  if (op === 'skip') {
    if (st.player.energy < BAL.skipHackCost) { ev.msg('msg.no_energy_n', { n: BAL.skipHackCost }, 'warn'); return FREE; }
    st.player.energy -= BAL.skipHackCost;
    pr.hacked = true;
    st.stats.hacks++;
    ev.msg('msg.hack_skipped', {}, 'good');
    if (pr.label === 'boss') bossTerminalHacked(st, ev);
    return { cost: 100 };
  }
  const ops = terminalOps(st, pr);
  const o = ops.find((x) => x.id === op);
  if (!o) return FREE;
  if (st.player.energy < o.cost) { ev.msg('msg.no_energy_n', { n: o.cost }, 'warn'); return FREE; }
  st.player.energy -= o.cost;
  ev.sfx('terminal_op');
  if (op === 'boss_shield') bossTerminalHacked(st, ev);
  else if (op === 'open_circuits') { for (const d of Object.values(m.doors)) if (d.lock === 'circuit') { d.lock = null; d.open = true; } ev.msg('msg.circuits_open', {}, 'good'); }
  else if (op === 'map') { m.seen.fill(1); ev.msg('msg.map_revealed', {}, 'good'); }
  else if (op === 'seal_near') {
    let n = 0;
    for (const k of Object.keys(m.doors)) {
      const i = Number(k); const d = m.doors[i];
      const x = i % m.w; const y = Math.floor(i / m.w);
      if (chebyshev(x, y, p.x, p.y) > 10 || d.broken || actorAt(st, x, y)) continue;
      d.open = false; d.sealed = true; n++;
    }
    st.stats.doorsSealed += n;
    ev.msg('msg.sealed_n', { n }, 'good');
    ev.sfx('seal');
  } else if (op.startsWith('vent:')) { st.modal = null; return ventSection(st, ev, Number(op.slice(5))); }
  else if (op === 'turrets') { for (const a of st.actors) if (!a.dead && a.faction === 'enemy' && enemyDef(a.def).behavior === 'turret') a.faction = 'ally'; ev.msg('msg.turrets_hacked', {}, 'good'); }
  else if (op === 'drones') { for (const a of st.actors) if (!a.dead && a.faction === 'enemy' && enemyDef(a.def).robot && enemyDef(a.def).flying && !a.boss && chebyshev(a.x, a.y, p.x, p.y) <= 15) a.faction = 'ally'; ev.msg('msg.drones_hacked', {}, 'good'); }
  else if (op === 'cameras') { for (const q of m.props) if (q.kind === 'camera') q.off = true; ev.msg('msg.cameras_off', {}, 'good'); }
  else if (op === 'ventilation') { m.gas.fill(0); ev.msg('msg.ventilation', {}, 'good'); ev.sfx('wind'); }
  else if (op === 'cables') { for (const q of m.props) if (q.kind === 'cable') q.off = true; ev.msg('msg.cables_off', {}, 'good'); }
  else if (op === 'lights') {
    const s = m.sec[p.y * m.w + p.x];
    const target = s >= 0 ? s : -1;
    if (target >= 0) { m.sections[target].dark = !m.sections[target].dark; ev.msg(m.sections[target].dark ? 'msg.lights_off' : 'msg.lights_on', {}, 'info'); }
  }
  return { cost: 100 };
}

function hackAct(st: RunState, ev: EventSink, cell: number | 'skip' | 'abort'): ActionResult {
  const modal = st.modal;
  if (!modal || modal.kind !== 'hack') return FREE;
  const pr = st.map.props.find((q) => q.id === modal.propId);
  const h = modal.hack;
  if (cell === 'abort') {
    st.modal = { kind: 'terminal', propId: modal.propId };
    if (h.picks.length > 0) failHack(st, ev, pr);
    return FREE;
  }
  if (cell === 'skip') {
    if (st.player.energy < BAL.skipHackCost) { ev.msg('msg.no_energy_n', { n: BAL.skipHackCost }, 'warn'); return FREE; }
    st.player.energy -= BAL.skipHackCost;
    h.finished = true; h.success = true; h.targets[0].done = true;
  } else {
    if (!hackPick(h, cell)) return FREE;
    ev.sfx('hack_pick');
  }
  if (h.finished) {
    if (h.success && pr) {
      pr.hacked = true;
      st.stats.hacks++;
      ev.msg('msg.hack_ok', {}, 'good');
      ev.sfx('hack_ok');
      for (const t of h.targets.slice(1)) {
        if (!t.done) continue;
        if (t.reward === 'energy') { st.player.energy = Math.min(getStats(st).maxEnergy, st.player.energy + 15); ev.msg('msg.hack_bonus_energy', {}, 'good'); }
        if (t.reward === 'map') { st.map.seen.fill(1); ev.msg('msg.hack_bonus_map', {}, 'good'); }
        if (t.reward === 'scrap') { st.player.scrap += 12; ev.msg('msg.hack_bonus_scrap', {}, 'good'); }
      }
      if (pr.label === 'boss') bossTerminalHacked(st, ev);
      st.modal = { kind: 'terminal', propId: pr.id };
    } else {
      failHack(st, ev, pr);
      st.modal = null;
    }
    return { cost: 100 };
  }
  return FREE;
}

function failHack(st: RunState, ev: EventSink, pr: Prop | undefined): void {
  st.stats.hacksFailed++;
  ev.msg('msg.hack_fail', {}, 'danger');
  ev.sfx('hack_fail');
  if (pr) { pr.lockout = 20; emitNoise(st, pr.x, pr.y, 10, false); }
}

export function hackHint(st: RunState): number {
  const modal = st.modal;
  if (!modal || modal.kind !== 'hack') return -1;
  return solveNext(modal.hack);
}

// ------------------------------------------------------------------ tienda y taller

function buy(st: RunState, ev: EventSink, index: number): ActionResult {
  const modal = st.modal;
  if (!modal || modal.kind !== 'shop') return FREE;
  const pr = st.map.props.find((q) => q.id === modal.propId);
  const e = pr?.stock?.[index];
  if (!pr || !e || e.n <= 0) return FREE;
  if (st.player.scrap < e.price) { ev.msg('msg.need_scrap', { n: e.price }, 'warn'); return FREE; }
  const stack: ItemStack = { id: e.item, n: 1 };
  if (!addItem(st, stack)) { ev.msg('msg.inv_full', {}, 'warn'); return FREE; }
  st.player.scrap -= e.price;
  e.n--;
  if (itemDef(e.item).unknown) st.known[e.item] = true;
  ev.msg('msg.bought', { item: `@item.${e.item}.name`, n: e.price }, 'good');
  ev.sfx('buy');
  return FREE;
}

function sell(st: RunState, ev: EventSink, slot: number): ActionResult {
  const modal = st.modal;
  if (!modal || modal.kind !== 'shop') return FREE;
  const pr = st.map.props.find((q) => q.id === modal.propId);
  if (!pr || pr.kind !== 'merchant') return FREE;
  const s = st.player.inv[slot];
  if (!s) return FREE;
  const d = itemDef(s.id);
  if (d.type === 'quest') { ev.msg('msg.cant_sell', {}, 'warn'); return FREE; }
  const price = Math.max(1, Math.round(d.price * 0.4));
  removeItem(st, s.id, 1);
  st.player.scrap += price;
  ev.msg('msg.sold', { item: knownItemName(st, s.id), n: price }, 'info');
  ev.sfx('buy');
  return FREE;
}

function craft(st: RunState, ev: EventSink, id: string): ActionResult {
  const r = RECIPES.find((x) => x.id === id);
  if (!r || !canCraft(st, r)) return FREE;
  const modal = st.modal;
  if (!(modal && modal.kind === 'workbench') && !hasPerkFlag(st, 'craft_anywhere')) return FREE;
  for (const [nid, n] of r.needs) removeItem(st, nid, n);
  if (!addItem(st, { id: r.out, n: r.n })) st.items.push({ id: st.nextId++, x: getPlayer(st).x, y: getPlayer(st).y, item: { id: r.out, n: r.n } });
  st.narrative.flags.crafted = (st.narrative.flags.crafted ?? 0) + 1;
  ev.msg('msg.crafted', { item: `@item.${r.out}.name` }, 'good');
  ev.sfx('craft');
  return { cost: 100 };
}

function surgeonAct(st: RunState, ev: EventSink, a: Action): ActionResult {
  const modal = st.modal;
  if (!modal || modal.kind !== 'surgeon') return FREE;
  if (a.t === 'install') return installImplant(st, ev, a.slot, true);
  if (a.t === 'uninstall') {
    const cur = st.player.implants[a.implant];
    if (!cur) return FREE;
    st.player.implants[a.implant] = null;
    if (!cur.cursed) {
      if (!addItem(st, { id: cur.id, n: 1 })) st.items.push({ id: st.nextId++, x: getPlayer(st).x, y: getPlayer(st).y, item: { id: cur.id, n: 1 } });
    }
    ev.msg(cur.cursed ? 'msg.implant_removed_broken' : 'msg.implant_removed', { item: `@item.${cur.id}.name` }, 'info');
    ev.sfx('implant');
    return FREE;
  }
  if (a.t === 'identifyLab') {
    if (st.player.scrap < 15) { ev.msg('msg.need_scrap', { n: 15 }, 'warn'); return FREE; }
    const unk = st.player.inv.filter((s) => !isKnown(st, s.id));
    if (!unk.length) { ev.msg('msg.nothing_unknown', {}, 'info'); return FREE; }
    st.player.scrap -= 15;
    for (const s of unk) st.known[s.id] = true;
    ev.msg('msg.identified_all', {}, 'good');
    return FREE;
  }
  return FREE;
}

// ------------------------------------------------------------------ ÁGORA

function askAgora(st: RunState, ev: EventSink, what: 'identify' | 'door' | 'map'): ActionResult {
  const t = st.narrative.trust;
  const help = st.narrative.agoraHelp;
  const m = st.map;
  const p = getPlayer(st);
  if (st.opts.mode === 'pesadilla') { ev.msg('agora.silent', {}, 'agora'); return FREE; }
  if (what === 'identify') {
    if (t < 40) { ev.msg('agora.refuse_identify', {}, 'agora'); return FREE; }
    if (help.identify > 0) { ev.msg('agora.already', {}, 'agora'); return FREE; }
    const unk = st.player.inv.filter((s) => !isKnown(st, s.id));
    if (!unk.length) { ev.msg('agora.nothing_identify', {}, 'agora'); return FREE; }
    help.identify = 1;
    for (const s of unk) st.known[s.id] = true;
    ev.msg('agora.identify', { n: unk.length }, 'agora');
    return FREE;
  }
  if (t < 60) { ev.msg('agora.refuse_help', {}, 'agora'); return FREE; }
  if (what === 'map') {
    if (help.map > 0) { ev.msg('agora.already', {}, 'agora'); return FREE; }
    help.map = 1;
    for (let i = 0; i < m.seen.length; i++) if (m.tiles[i] !== TILE.VOID) m.seen[i] = 1;
    ev.msg('agora.map', {}, 'agora');
    return FREE;
  }
  if (help.door > 0) { ev.msg('agora.already', {}, 'agora'); return FREE; }
  let best = -1; let bd = 99;
  for (const k of Object.keys(m.doors)) {
    const i = Number(k); const d = m.doors[i];
    if (!(d.lock === 'amber' || d.lock === 'cyan' || d.lock === 'circuit')) continue;
    const dd = chebyshev(i % m.w, Math.floor(i / m.w), p.x, p.y);
    if (dd < bd) { bd = dd; best = i; }
  }
  if (best < 0 || bd > 12) { ev.msg('agora.no_door', {}, 'agora'); return FREE; }
  help.door = 1;
  m.doors[best].lock = null;
  m.doors[best].open = true;
  ev.msg('agora.door', {}, 'agora');
  setTrust(st, ev, 0);
  return FREE;
}

// ------------------------------------------------------------------ implantes activos

function activeImplant(st: RunState, ev: EventSink): ActionResult {
  const p = getPlayer(st);
  const imp = IMPLANT_SLOTS.map((s) => st.player.implants[s]).find((i) => i && itemDef(i.id).implant?.active);
  if (!imp) { ev.msg('msg.no_active', {}, 'info'); return FREE; }
  const def = itemDef(imp.id).implant!;
  const cost = Math.round((def.activeCost ?? 10) * getStats(st).energyMult);
  if (st.player.activeCd > 0) { ev.msg('msg.active_cd', { n: st.player.activeCd }, 'warn'); return FREE; }
  if (st.player.energy < cost) { ev.msg('msg.no_energy_n', { n: cost }, 'warn'); return FREE; }
  st.player.energy -= cost;
  st.player.activeCd = 20;
  ev.sfx('active');
  switch (def.active) {
    case 'cloak': p.status.cloak = 8; ev.msg('msg.cloak', {}, 'good'); break;
    case 'overclock': p.status.haste = 6; ev.msg('msg.overclock', {}, 'good'); break;
    case 'shield': p.status.shielded = 6; ev.msg('msg.shield_up', {}, 'good'); break;
    case 'heal': p.hp = Math.min(getStats(st).maxHp, p.hp + 8); ev.push({ t: 'dmg', x: p.x, y: p.y, amount: 8, kind: 'heal' }); break;
    case 'scan': {
      const m = st.map;
      for (let y = p.y - 15; y <= p.y + 15; y++) for (let x = p.x - 15; x <= p.x + 15; x++) if (inBounds(m, x, y)) m.seen[y * m.w + x] = 1;
      p.status.scan = 10;
      ev.msg('msg.scan', {}, 'good');
      break;
    }
    case 'pulse': {
      ev.fx('scream', p.x, p.y, { n: 3 });
      addNoise(st, ev, 5);
      for (const a of st.actors.slice()) {
        if (a.dead || a.faction !== 'enemy' || chebyshev(a.x, a.y, p.x, p.y) > 3) continue;
        const ed = enemyDef(a.def);
        damageActor(st, ev, a, int(st.rng, 6, 9) * (ed.eco ? 1 : 0.5), p, 'hit');
      }
      break;
    }
    case 'blink': {
      const d = DIRS[p.facing];
      for (let k = 3; k >= 1; k--) {
        const nx = p.x + d.x * k; const ny = p.y + d.y * k;
        if (passable(st.map, nx, ny) && !actorAt(st, nx, ny)) { ev.fx('teleport', p.x, p.y); p.x = nx; p.y = ny; ev.fx('teleport', nx, ny); break; }
      }
      break;
    }
  }
  return { cost: 50 };
}

// ------------------------------------------------------------------ despacho

export function playerAction(st: RunState, ev: EventSink, a: Action): ActionResult {
  const modal = st.modal;
  if (modal) {
    switch (a.t) {
      case 'closeModal':
        if (modal.kind === 'dialog' || modal.kind === 'ending') return FREE;
        if (modal.kind === 'hack') return hackAct(st, ev, 'abort');
        st.modal = null; return FREE;
      case 'choice': {
        const { chooseOption } = narrativeApi;
        chooseOption(st, ev, a.index);
        return FREE;
      }
      case 'hack': return hackAct(st, ev, a.cell);
      case 'hackSkip': return hackAct(st, ev, 'skip');
      case 'hackAbort': return hackAct(st, ev, 'abort');
      case 'termOp': return termOp(st, ev, a.op);
      case 'buy': return buy(st, ev, a.index);
      case 'sell': return sell(st, ev, a.slot);
      case 'craft': return craft(st, ev, a.recipe);
      case 'install': case 'uninstall': case 'identifyLab': return surgeonAct(st, ev, a);
      case 'use': case 'equip': case 'drop': break;
      default: return FREE;
    }
  }
  const p = getPlayer(st);
  if (p.status.stun && a.t !== 'toggleLight') { ev.msg('msg.stunned', {}, 'warn'); return { cost: 100 }; }
  switch (a.t) {
    case 'move': return playerMove(st, ev, a.dir);
    case 'shove': {
      const d = DIRS[a.dir];
      const occ = actorAt(st, p.x + d.x, p.y + d.y);
      if (!occ || occ.id === p.id) return playerMove(st, ev, a.dir);
      facingTo(st, d.x, d.y);
      ev.push({ t: 'anim', actor: p.id, anim: 'attack', dx: d.x, dy: d.y });
      ev.sfx('shove', occ.x, occ.y);
      st.stats.pushes++;
      pushApi.push(st, ev, occ, d.x, d.y, 1 + getStats(st).pushPower, p);
      if (occ.faction === 'enemy' && !occ.dead && occ.ai.mode !== 'hunt') { occ.ai.mode = 'hunt'; occ.ai.tx = p.x; occ.ai.ty = p.y; occ.ai.timer = 12; }
      emitNoise(st, p.x, p.y, 3);
      return { cost: 100, exertion: true };
    }
    case 'wait':
      if (m6Drifting(st)) return driftStep(st, ev);
      return { cost: 100 };
    case 'rest': return { cost: 100 };
    case 'interact': return interact(st, ev, a.dir);
    case 'fire': return playerFire(st, ev, a.x, a.y);
    case 'throw': return playerThrow(st, ev, a.slot, a.x, a.y);
    case 'use': if (modal) st.modal = modal; return useItem(st, ev, a.slot);
    case 'equip': return equipItem(st, ev, a.slot);
    case 'unequip': {
      const cur = st.player[a.which];
      if (!cur) return FREE;
      if (cur.cursed) { ev.msg('msg.cursed_stuck', { item: `@item.${cur.id}.name` }, 'warn'); return FREE; }
      if (st.player.inv.length >= BAL.invSize) { ev.msg('msg.inv_full', {}, 'warn'); return FREE; }
      st.player.inv.push(cur);
      st.player[a.which] = null;
      return { cost: 50 };
    }
    case 'drop': {
      const s = st.player.inv[a.slot];
      if (!s) return FREE;
      st.player.inv.splice(a.slot, 1);
      st.items.push({ id: st.nextId++, x: p.x, y: p.y, item: s });
      ev.msg('msg.dropped', { item: knownItemName(st, s.id) }, 'info');
      return { cost: 50 };
    }
    case 'pickup': return pickup(st, ev);
    case 'toggleLight':
      if (!st.player.flashlight && st.player.energy <= 0) { ev.msg('msg.flashlight_dead', {}, 'warn'); return FREE; }
      st.player.flashlight = !st.player.flashlight;
      ev.sfx('click');
      return FREE;
    case 'toggleSneak':
      st.player.sneak = !st.player.sneak;
      ev.msg(st.player.sneak ? 'msg.sneak_on' : 'msg.sneak_off', {}, 'info');
      return FREE;
    case 'active': return activeImplant(st, ev);
    case 'door': {
      const door = doorAt(st.map, a.x, a.y);
      if (!door || chebyshev(a.x, a.y, p.x, p.y) > 1) return FREE;
      if (a.op === 'seal') {
        if (door.broken) return FREE;
        if (st.player.energy < BAL.sealCost) { ev.msg('msg.no_energy_n', { n: BAL.sealCost }, 'warn'); return FREE; }
        if (actorAt(st, a.x, a.y)) { ev.msg('msg.door_blocked', {}, 'warn'); return FREE; }
        st.player.energy -= BAL.sealCost;
        door.open = false; door.sealed = true;
        st.stats.doorsSealed++;
        ev.msg('msg.door_seal', {}, 'good');
        ev.sfx('seal', a.x, a.y);
        return { cost: 100 };
      }
      if (a.op === 'unseal') {
        if (!door.sealed) return FREE;
        if (st.player.energy < BAL.unsealCost) { ev.msg('msg.no_energy_n', { n: BAL.unsealCost }, 'warn'); return FREE; }
        st.player.energy -= BAL.unsealCost;
        door.sealed = false;
        ev.msg('msg.door_unseal', {}, 'info');
        return { cost: 100 };
      }
      if (a.op === 'close') {
        if (!door.open || door.broken || actorAt(st, a.x, a.y)) return FREE;
        door.open = false; ev.sfx('door_close', a.x, a.y); return { cost: 100 };
      }
      return tryOpenDoor(st, ev, a.x, a.y) ?? FREE;
    }
    case 'askAgora': return askAgora(st, ev, a.what);
    case 'craft': return craft(st, ev, a.recipe);
    case 'vent': {
      const s = st.map.sec[p.y * st.map.w + p.x];
      return ventSection(st, ev, s);
    }
    default: return FREE;
  }
}

function m6Drifting(st: RunState): boolean {
  return st.map.zone === 6 && st.player.drifting;
}

const narrativeApi = { chooseOption };
const pushApi = { push };
