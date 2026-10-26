/**
 * API principal de la lógica: crear partida, avanzar un turno con una acción, cambiar de piso.
 * Puro (sin DOM) y determinista.
 */
import type { RunState, RunOptions, MetaSnapshot, PlayerState, Actor } from './state';
import { TILE } from './state';
import type { ZoneId } from './content';
import { IMPLANT_SLOTS } from './content';
import { EventSink, type GameEvent } from './events';
import { createRng, int, chance, pick, shuffle, fork } from './rng';
import { generateFloor } from './mapgen';
import { populateFloor } from './populate';
import { playerAction, type Action } from './player';
import { monsterAct, beginMonsterPhase, noteSeen } from './ai';
import { actorSpeed, getPlayer, spawnActor, freeSpotNear } from './actors';
import { environmentTurn } from './atmos';
import { computeVision, getVision } from './vision';
import { getStats, addItem } from './rules';
import { classDef } from '../data/classes';
import { itemDef, ALL_ITEMS, INJECTOR_LOOKS, MODULE_LOOKS } from '../data/items';
import { upgradeDef } from '../data/upgrades';
import { enemyDef } from '../data/enemies';
import { BAL } from '../data/balance';
import { chebyshev } from './geom';
import { emitNoise } from './noise';
import { startScene } from './narrative';
import { invalidateProps, passable } from './map';
import { hasLos } from './fov';
import { blocksSight } from './vision';

export const RUN_VERSION = 1;

export function defaultOptions(partial: Partial<RunOptions> = {}): RunOptions {
  return {
    mode: 'historia', seed: 'perséfone', classId: 'tecnico', name: 'Tripulante 114', pronoun: 'elle',
    generousO2: false, assistHack: false, skipHack: false, dullEnemies: false, longOrbit: false, startZone: 1,
    ...partial,
  };
}

export function emptyMeta(): MetaSnapshot {
  return {
    deaths: 0, arcs: { celia: 0, tomas: 0, bruno: 0, solis: 0, lenz: 0, faro: 0 }, flags: {}, logs: [], endings: [], runs: 0, fates: {},
  };
}

function startTrust(meta: MetaSnapshot, perks: string[]): number {
  let t = BAL.trustStart;
  for (const p of perks) t += upgradeDef(p)?.trust ?? 0;
  const f = meta.flags;
  if (f.agora_read) t += 4;
  if (f.lucia_asked) t += 4;
  t -= 3 * Math.min(3, f.killed_sleeper ?? 0);
  if (f.truth_sent) t -= 8;
  if (f.vented_mess) t += 2;
  return Math.max(10, Math.min(80, t));
}

export function createRun(opts: RunOptions, meta: MetaSnapshot, perks: string[]): RunState {
  const rng = createRng(`${opts.seed}|${opts.mode}`);
  const cls = classDef(opts.classId);
  const player: PlayerState = {
    name: opts.name, pronoun: opts.pronoun, classId: cls.id, o2: 0, energy: 0, noise: 0, scrap: 0, inv: [],
    melee: null, ranged: null, implants: { brain: null, eyes: null, torso: null, arms: null, legs: null }, keys: [],
    flashlight: false, sneak: false, ammo: { balas: 0, cartuchos: 0, clavos: 0, virotes: 0 }, suit: false, regenAcc: 0,
    lastHitBy: '', drifting: false, activeCd: 0, cloak: 0,
  };
  const st: RunState = {
    version: RUN_VERSION, seed: opts.seed, rng, vrng: fork(rng, 'v'), opts, perks: perks.slice(),
    turn: 0, floorTurn: 0, orbit: 0, timeAcc: 0, zone: opts.startZone, floorNo: 0,
    map: null as unknown as RunState['map'], actors: [], items: [], telegraphs: [], nextId: 1, player, pid: 0,
    narrative: { trust: startTrust(meta, perks), flags: {}, scenesDone: [], logsFound: [], survivors: 0, agoraHelp: { identify: 0, door: 0, recharge: 0, map: 0 } },
    stats: {
      kills: 0, killsByDef: {}, damageDealt: 0, damageTaken: 0, turns: 0, floors: 0, bosses: 0, minis: 0, hacks: 0, hacksFailed: 0,
      vented: 0, stealthKills: 0, itemsUsed: 0, scrapEarned: 0, o2Used: 0, maxNoise: 0, doorsSealed: 0, ejected: 0, pushes: 0,
      envKills: 0, phantomsHit: 0, closeCalls: 0, combatTurns: 0, logsNew: 0, eventsResolved: 0,
    },
    known: {}, appear: {}, modal: null, over: null, hullRoute: false, visitedZones: [], bossesDefeated: [],
    metaSnapshot: JSON.parse(JSON.stringify(meta)) as MetaSnapshot, lastNoise: null, hallucinationTimer: 20, floorDecay: 0,
  };
  // apariencias de objetos desconocidos
  const inj = ALL_ITEMS.filter((d) => d.unknown === 'injector').map((d) => d.id);
  const looks = shuffle(rng, INJECTOR_LOOKS.map((_, i) => i));
  inj.forEach((id, k) => { st.appear[id] = looks[k % looks.length]; });
  const mods = ALL_ITEMS.filter((d) => d.unknown === 'module').map((d) => d.id);
  mods.forEach((id) => { st.appear[id] = int(rng, 0, MODULE_LOOKS.length - 1); });
  // reloj orbital
  let orbit = BAL.orbitTurns;
  for (const p of perks) orbit += upgradeDef(p)?.orbit ?? 0;
  if (opts.longOrbit) orbit = Math.round(orbit * 1.5);
  st.orbit = orbit;
  // actor del jugador
  const pa: Actor = {
    id: st.nextId++, def: 'player', x: 0, y: 0, hp: 1, maxHp: 1, ap: 0, faction: 'player',
    ai: { mode: 'idle', tx: 0, ty: 0, timer: 0, cd: {}, homeX: 0, homeY: 0 }, status: {}, facing: 4,
  };
  st.pid = pa.id;
  st.actors.push(pa);
  // equipo inicial
  const give = (id: string, n = 1): void => {
    const d = itemDef(id);
    if (d.type === 'weapon' && d.weapon) {
      const which = d.weapon.kind === 'melee' ? 'melee' : 'ranged';
      if (!st.player[which]) { st.player[which] = { id, n: 1 }; return; }
    }
    addItem(st, { id, n });
    st.known[id] = true;
  };
  for (const s of cls.start) give(s.item, s.n ?? 1);
  for (const [k, v] of Object.entries(cls.ammo)) st.player.ammo[k as keyof PlayerState['ammo']] += v ?? 0;
  for (const id of cls.implants ?? []) { const d = itemDef(id); if (d.implant) st.player.implants[d.implant.slot] = { id }; st.known[id] = true; }
  for (const p of perks) {
    const u = upgradeDef(p);
    for (const s of u?.start ?? []) give(s.item, s.n ?? 1);
    if (u?.scrap) st.player.scrap += u.scrap;
  }
  if (perks.some((p) => upgradeDef(p)?.flag === 'start_implant')) {
    const pool = ALL_ITEMS.filter((d) => d.type === 'implant' && d.implant?.rarity === 1 && !st.player.implants[d.implant.slot]);
    if (pool.length) { const d = pick(rng, pool); st.player.implants[d.implant!.slot] = { id: d.id }; st.known[d.id] = true; }
  }
  if (perks.some((p) => upgradeDef(p)?.flag === 'pre_identify')) {
    for (const id of shuffle(rng, inj.slice()).slice(0, 3)) st.known[id] = true;
  }
  for (const id of ['vendas', 'botiquin', 'bombona', 'bateria', 'sedante']) st.known[id] = true;
  // compensación por atajo de zona
  if (opts.startZone > 1) {
    const z = opts.startZone;
    st.player.scrap += 40 * (z - 1);
    give('botiquin', 1 + Math.floor(z / 2));
    give('bombona');
    give('bateria');
    const wpool = ALL_ITEMS.filter((d) => d.type === 'weapon' && d.tier === Math.min(4, z) && d.weapon?.kind === 'ranged' && d.weapon.ammo === 'energy');
    if (wpool.length) { const w = pick(rng, wpool); if (st.player.ranged) addItem(st, st.player.ranged); st.player.ranged = { id: w.id, n: 1 }; }
    st.player.ammo.balas += 10;
  }
  const stats = getStats(st);
  pa.hp = stats.maxHp; pa.maxHp = stats.maxHp;
  st.player.o2 = stats.maxO2;
  st.player.energy = stats.maxEnergy;
  enterFloor(st, new EventSink(), opts.startZone, 1);
  st.narrative.flags.minTrust = st.narrative.trust;
  st.narrative.flags.maxTrust = st.narrative.trust;
  return st;
}

function floorEventFor(st: RunState, zone: number): string | null {
  if (!chance(st.rng, BAL.floorEventChance)) return null;
  const opts = ['gravedad', 'apagon', 'fuego', 'brecha', 'radiacion', 'ruido'];
  const w: Record<string, number> = { gravedad: 1, apagon: 1.2, fuego: zone === 3 ? 2 : 0.8, brecha: zone >= 3 ? 1.2 : 0.6, radiacion: zone === 3 ? 2 : 0.5, ruido: zone === 4 ? 2.5 : 0.6 };
  const total = opts.reduce((a, k) => a + w[k], 0);
  let r = (int(st.rng, 0, 9999) / 10000) * total;
  for (const k of opts) { r -= w[k]; if (r <= 0) return k; }
  return 'apagon';
}

export function enterFloor(st: RunState, ev: EventSink, zone: ZoneId, floor: number, fromHull = false): void {
  const prevZone = st.map ? st.map.zone : 0;
  const tutorial = zone === 1 && floor === 1;
  const hullExit = zone === 4 && floor === 3 && !!st.metaSnapshot.flags.hull_code && !fromHull;
  const map = generateFloor({ zone, floor, seed: `${st.seed}|${st.opts.mode}|${st.floorNo}`, tutorial, hullExit });
  st.map = map;
  st.zone = zone;
  st.floorNo++;
  st.floorTurn = 0;
  st.floorDecay = 0;
  st.telegraphs = [];
  st.items = [];
  st.player.keys = [];
  st.player.drifting = false;
  st.narrative.agoraHelp = { identify: 0, door: 0, recharge: 0, map: 0 };
  const p = getPlayer(st);
  const allies = st.actors.filter((a) => !a.dead && a.faction === 'ally' && a.def !== 'senuelo' && a.def !== 'npc_solis');
  st.actors = [p];
  p.x = map.entry.x; p.y = map.entry.y;
  p.vx = 0; p.vy = 0;
  for (const s of Object.keys(p.status)) if (s !== 'regen' && s !== 'radshield') delete p.status[s];
  for (const a of allies) {
    const s = freeSpotNear(st, p.x, p.y, 3, true);
    if (s) { a.x = s.x; a.y = s.y; st.actors.push(a); }
  }
  // evento de piso
  map.event = tutorial || map.boss ? null : floorEventFor(st, zone);
  if (map.event === 'fuego') {
    for (let k = 0; k < 3; k++) {
      const r = pick(st.rng, map.rooms.filter((q) => q.kind !== 'start'));
      const i = (r.y + int(st.rng, 0, r.h - 1)) * map.w + r.x + int(st.rng, 0, r.w - 1);
      if (map.tiles[i] === TILE.FLOOR) map.fire[i] = 8;
    }
  }
  if (map.event === 'brecha') {
    for (let k = 0; k < 200; k++) {
      const i = int(st.rng, 0, map.tiles.length - 1);
      if (map.tiles[i] !== TILE.WALL) continue;
      const x = i % map.w; const y = Math.floor(i / map.w);
      const outward = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.tiles[(y + dy) * map.w + x + dx] === TILE.VOID);
      const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => map.sec[(y + dy) * map.w + x + dx]).find((s) => s >= 0);
      if (!outward || inner === undefined) continue;
      if (map.rooms.some((r) => r.kind === 'start' && x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h)) continue;
      map.tiles[i] = TILE.BREACH;
      map.sections[inner].pressure = 0;
      break;
    }
  }
  if (map.event === 'apagon') for (const s of map.sections) if (s.vent < 99999) s.dark = true;
  populateFloor(st, tutorial);
  // jefe final: el ascensor de salida es el Núcleo
  if (zone === 5 && floor === 4) {
    const ex = map.props.find((q) => q.kind === 'exit');
    if (ex) ex.kind = 'core';
    invalidateProps(map);
  }
  if (map.boss) {
    const boss = st.actors.find((a) => a.boss && enemyDef(a.def).rank === 'boss');
    if (boss) st.narrative.flags.bossId = boss.id;
  }
  if (zone !== prevZone) {
    if (!st.visitedZones.includes(zone)) st.visitedZones.push(zone);
    const tier = st.narrative.trust < 20 ? 'hostile' : st.narrative.trust < 40 ? 'wary' : st.narrative.trust < 60 ? 'neutral' : st.narrative.trust < 80 ? 'warm' : 'close';
    ev.msg(`agora.zone${zone}.${tier}`, {}, 'agora');
  }
  if (tutorial && st.metaSnapshot.runs === 0) ev.push({ t: 'tutorial', key: 'tut.start' });
  if (map.event) ev.msg(`event.${map.event}`, {}, 'warn');
  ev.push({ t: 'floor', zone, floor });
  ev.push({ t: 'music', mood: map.boss ? 'boss' : `zone${zone}` });
  if (st.player.flashlight === false && map.sections[map.sec[p.y * map.w + p.x]]?.dark) ev.push({ t: 'tutorial', key: 'tut.dark' });
  computeVision(st);
}

function nextFloor(st: RunState, ev: EventSink, hull: boolean): void {
  st.stats.floors++;
  const z = st.zone;
  const f = st.map.floor;
  if (hull) {
    st.hullRoute = true;
    ev.msg('msg.hull_exit', {}, 'lore');
    enterFloor(st, ev, 6, 1);
    return;
  }
  if (f < 4) { enterFloor(st, ev, z, f + 1); return; }
  if (z === 6) {
    st.metaSnapshot.flags.hull_done = 1;
    st.narrative.flags.hull_done = 1;
    enterFloor(st, ev, 5, 1, true);
    return;
  }
  const nz = (z === 4 ? 5 : z + 1) as ZoneId;
  enterFloor(st, ev, nz, 1);
}

/** Avanza el mundo tras una acción del jugador que consume `cost` unidades de tiempo. */
function advance(st: RunState, ev: EventSink, cost: number, exertion: boolean): void {
  const p = getPlayer(st);
  st.timeAcc += cost;
  beginMonsterPhase();
  for (const a of st.actors.slice()) {
    if (a.dead || a.id === st.pid) continue;
    a.ap += actorSpeed(st, a) * (cost / 100);
    let guard = 0;
    while (a.ap >= 100 && !a.dead && guard++ < 4) {
      a.ap -= 100;
      monsterAct(st, ev, a);
      if (p.hp <= 0) return;
    }
  }
  while (st.timeAcc >= 100) {
    st.timeAcc -= 100;
    environmentTurn(st, ev, { exertion });
    exertion = false;
    if (p.hp <= 0) return;
  }
  cameras(st, ev);
}

function cameras(st: RunState, ev: EventSink): void {
  const p = getPlayer(st);
  if (p.status.cloak) return;
  const v = getVision(st);
  for (const c of st.map.props) {
    if (c.kind !== 'camera' || c.off) continue;
    if ((c.lockout ?? 0) > 0) continue;
    if (chebyshev(c.x, c.y, p.x, p.y) > 6) continue;
    if (v.light[p.y * st.map.w + p.x] < BAL.litThreshold && !st.player.flashlight) continue;
    if (!hasLos(c.x, c.y, p.x, p.y, (x, y) => blocksSight(st, x, y))) continue;
    c.lockout = 20;
    ev.msg('msg.camera_alarm', {}, 'danger');
    ev.sfx('alarm', c.x, c.y);
    for (const a of st.actors) {
      if (a.dead || a.faction !== 'enemy' || chebyshev(a.x, a.y, p.x, p.y) > 14 || a.ai.mode === 'hunt') continue;
      a.ai.mode = 'alert'; a.ai.tx = p.x; a.ai.ty = p.y; a.ai.timer = 15;
    }
  }
}

export function deathCause(st: RunState): { cause: string; ending: string | null } {
  const c = st.player.lastHitBy || 'unknown';
  const p = getPlayer(st);
  const m = st.map;
  if (c === 'orbit') return { cause: 'orbit', ending: 'caida' };
  if (c === 'dissolution') return { cause: 'dissolution', ending: 'disolucion' };
  if (c === 'eject') return { cause: 'eject', ending: 'deriva' };
  if (c === 'npc_solis') return { cause: 'npc_solis', ending: 'sentencia' };
  if (c === 'o2') {
    const s = m.sec[p.y * m.w + p.x];
    if (s >= 0 && m.sections[s].ventedByPlayer) return { cause: 'o2', ending: 'respiracion' };
    return { cause: 'o2', ending: null };
  }
  return { cause: c, ending: null };
}

/** Ejecuta una acción y devuelve los eventos producidos. */
export function step(st: RunState, action: Action): GameEvent[] {
  const ev = new EventSink();
  if (st.over) return [];
  const res = playerAction(st, ev, action);
  if (res.cost > 0 && !st.over) advance(st, ev, res.cost, !!res.exertion);
  const p = getPlayer(st);
  if (!st.over && p.hp <= 0) {
    const d = deathCause(st);
    st.over = { cause: d.cause, ending: d.ending, victory: false };
    ev.msg('msg.death', {}, 'danger');
    ev.sfx('death');
  }
  if (!st.over) {
    if (st.narrative.flags.wantDescend) { st.narrative.flags.wantDescend = 0; nextFloor(st, ev, false); }
    else if (st.narrative.flags.wantHull) { st.narrative.flags.wantHull = 0; nextFloor(st, ev, true); }
  }
  if (st.over) { ev.push({ t: 'over' }); return ev.list; }
  // presentación del jefe
  const v = computeVision(st);
  noteSeen(st, ev);
  if (st.map.boss && !st.narrative.flags[`intro_${st.floorNo}`]) {
    const boss = st.actors.find((a) => !a.dead && a.boss && enemyDef(a.def).rank === 'boss');
    if (boss && v.seenActors.has(boss.id)) {
      st.narrative.flags[`intro_${st.floorNo}`] = 1;
      ev.msg(enemyDef(boss.def).boss!.intro, {}, 'lore');
      ev.push({ t: 'bossbar', actor: boss.id });
      ev.push({ t: 'music', mood: `boss${st.zone}` });
      boss.ai.mode = 'hunt';
      if (boss.def === 'cocito' && !st.modal) startScene(st, ev, 'cocito_reveal');
    }
  }
  for (const a of st.actors) {
    if (!a.dead && a.boss && enemyDef(a.def).rank === 'mini' && v.seenActors.has(a.id) && !st.narrative.flags[`mintro_${a.id}`]) {
      st.narrative.flags[`mintro_${a.id}`] = 1;
      ev.msg(enemyDef(a.def).boss!.intro, {}, 'lore');
      ev.push({ t: 'bossbar', actor: a.id });
    }
  }
  if (st.narrative.flags.boss_final && !st.narrative.flags.coreOpen) {
    st.narrative.flags.coreOpen = 1;
    ev.msg('msg.core_open', {}, 'agora');
    ev.push({ t: 'music', mood: 'core' });
  }
  return ev.list;
}

/** Utilidad para pruebas y modo e2e: teletransporta al jugador a una zona y piso. */
export function debugWarp(st: RunState, zone: ZoneId, floor: number): GameEvent[] {
  const ev = new EventSink();
  enterFloor(st, ev, zone, floor);
  return ev.list;
}

export function livingEnemies(st: RunState): Actor[] {
  return st.actors.filter((a) => !a.dead && a.faction === 'enemy' && !a.phantom);
}

export function implantsList(st: RunState): string[] {
  return IMPLANT_SLOTS.map((s) => st.player.implants[s]?.id).filter((x): x is string => !!x);
}

export { emitNoise, spawnActor, passable };
