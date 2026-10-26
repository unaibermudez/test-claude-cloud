import type { RunState } from './state';
import type { EventSink } from './events';
import type { Cond, Effect, SceneDef, DialogOption, DialogNode, NpcId } from './content';
import { SCENES, sceneDef } from '../data/scenes';
import { ENDINGS } from '../data/endings';
import { LOGS } from '../data/logs';
import { hasItem, addItem, removeItem, getStats, isKnown } from './rules';
import { getPlayer, spawnActor, freeSpotNear } from './actors';
import { killActor, addNoise } from './combat';
import { itemDef } from '../data/items';
import { weighted } from './rng';
import { invalidateProps } from './map';

export function allLogsKnown(st: RunState): Set<string> {
  return new Set([...st.metaSnapshot.logs, ...st.narrative.logsFound]);
}

export function evalCond(st: RunState, c: Cond | undefined): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => evalCond(st, x));
  if ('any' in c) return c.any.some((x) => evalCond(st, x));
  if ('not' in c) return !evalCond(st, c.not);
  if ('flag' in c) {
    const v = st.narrative.flags[c.flag] ?? 0;
    if (c.eq !== undefined) return v === c.eq;
    return v >= (c.gte ?? 1);
  }
  if ('meta' in c) {
    const v = st.metaSnapshot.flags[c.meta] ?? 0;
    if (c.eq !== undefined) return v === c.eq;
    return v >= (c.gte ?? 1);
  }
  if ('trustGte' in c) return st.narrative.trust >= c.trustGte;
  if ('trustLt' in c) return st.narrative.trust < c.trustLt;
  if ('arcGte' in c) return (st.metaSnapshot.arcs[c.arcGte[0]] ?? 0) >= c.arcGte[1];
  if ('arcEq' in c) return (st.metaSnapshot.arcs[c.arcEq[0]] ?? 0) === c.arcEq[1];
  if ('has' in c) return hasItem(st, c.has);
  if ('deathsGte' in c) return st.metaSnapshot.deaths >= c.deathsGte;
  if ('logsGte' in c) return allLogsKnown(st).size >= c.logsGte;
  if ('logs' in c) { const k = allLogsKnown(st); return c.logs.every((l) => k.has(l)); }
  if ('ending' in c) return st.metaSnapshot.endings.includes(c.ending);
  if ('zone' in c) return st.zone === c.zone;
  if ('noiseGte' in c) return st.player.noise >= c.noiseGte;
  if ('energyGte' in c) return st.player.energy >= c.energyGte;
  return true;
}

export function setTrust(st: RunState, ev: EventSink, delta: number): void {
  const before = st.narrative.trust;
  st.narrative.trust = Math.max(0, Math.min(100, before + delta));
  if (delta > 0) ev.msg('msg.trust_up', { n: delta }, 'agora');
  else if (delta < 0) ev.msg('msg.trust_down', { n: -delta }, 'agora');
  st.narrative.flags.minTrust = Math.min(st.narrative.flags.minTrust ?? 100, st.narrative.trust);
  st.narrative.flags.maxTrust = Math.max(st.narrative.flags.maxTrust ?? 0, st.narrative.trust);
}

export function foundLog(st: RunState, ev: EventSink, id: string): void {
  if (st.narrative.logsFound.includes(id)) return;
  st.narrative.logsFound.push(id);
  if (!st.metaSnapshot.logs.includes(id)) st.stats.logsNew++;
  ev.push({ t: 'log', id });
  ev.msg('msg.log_found', { title: `@log.${id}.title` }, 'lore');
  ev.sfx('log');
  const def = LOGS.find((l) => l.id === id);
  if (def?.truth && (id === 'R42' || id === 'R54')) st.narrative.flags.truth_known = 1;
}

export function applyEffects(st: RunState, ev: EventSink, effects: Effect[] | undefined, propId?: number): void {
  if (!effects) return;
  const p = getPlayer(st);
  for (const e of effects) {
    if ('trust' in e) setTrust(st, ev, e.trust);
    else if ('flag' in e) st.narrative.flags[e.flag] = e.add !== undefined ? (st.narrative.flags[e.flag] ?? 0) + e.add : (e.v ?? 1);
    else if ('meta' in e) st.metaSnapshot.flags[e.meta] = e.add !== undefined ? (st.metaSnapshot.flags[e.meta] ?? 0) + e.add : (e.v ?? 1);
    else if ('arc' in e) {
      const cur = st.metaSnapshot.arcs[e.arc] ?? 0;
      if (e.stage > cur) {
        st.metaSnapshot.arcs[e.arc] = e.stage;
        ev.msg('msg.arc_advance', { name: `@npc.${e.arc}.name` }, 'lore');
      }
    } else if ('fate' in e) st.metaSnapshot.fates[e.fate] = e.v;
    else if ('give' in e) {
      const n = e.n ?? 1;
      if (!addItem(st, { id: e.give, n })) st.items.push({ id: st.nextId++, x: p.x, y: p.y, item: { id: e.give, n } });
      ev.msg('msg.received', { item: `@item.${e.give}.name`, n }, 'good');
    } else if ('take' in e) removeItem(st, e.take, e.n ?? 1);
    else if ('hp' in e) { const s = getStats(st); p.hp = Math.max(1, Math.min(s.maxHp, p.hp + e.hp)); }
    else if ('heal' in e) { const s = getStats(st); p.hp = Math.min(s.maxHp, p.hp + e.heal); }
    else if ('o2' in e) { const s = getStats(st); st.player.o2 = Math.max(0, Math.min(s.maxO2, st.player.o2 + e.o2)); }
    else if ('energy' in e) { const s = getStats(st); st.player.energy = Math.max(0, Math.min(s.maxEnergy, st.player.energy + e.energy)); }
    else if ('noise' in e) addNoise(st, ev, e.noise);
    else if ('scrap' in e) st.player.scrap = Math.max(0, st.player.scrap + e.scrap);
    else if ('maxHp' in e) st.narrative.flags.bonusMaxHp = (st.narrative.flags.bonusMaxHp ?? 0) + e.maxHp;
    else if ('memorias' in e) st.narrative.flags.memoriasBonus = (st.narrative.flags.memoriasBonus ?? 0) + e.memorias;
    else if ('log' in e) foundLog(st, ev, e.log);
    else if ('reveal' in e) st.map.seen.fill(1);
    else if ('spawn' in e) {
      for (let k = 0; k < (e.n ?? 1); k++) {
        const s = freeSpotNear(st, p.x, p.y, 4);
        if (s) spawnActor(st, e.spawn, s.x, s.y, { mode: 'hunt' });
      }
    } else if ('hostileNpc' in e) {
      const prop = st.map.props.find((q) => q.id === propId);
      if (prop) {
        const s = freeSpotNear(st, prop.x, prop.y, 2) ?? { x: prop.x, y: prop.y };
        const def = prop.npc === 'celia' ? 'npc_celia_eco' : 'npc_solis';
        const a = spawnActor(st, def, s.x, s.y, { mode: 'hunt' });
        a.npc = prop.npc;
        st.map.props.splice(st.map.props.indexOf(prop), 1);
        invalidateProps(st.map);
      }
    } else if ('removeNpc' in e) {
      const prop = st.map.props.find((q) => q.id === propId);
      if (prop) { st.map.props.splice(st.map.props.indexOf(prop), 1); invalidateProps(st.map); }
    } else if ('ending' in e) {
      st.narrative.flags[`chosen_${e.ending}`] = 1;
      st.over = { cause: 'ending', ending: e.ending, victory: true };
    } else if ('identify' in e) {
      for (const s of st.player.inv) if (!isKnown(st, s.id)) st.known[s.id] = true;
      ev.msg('msg.identified_all', {}, 'agora');
    } else if ('survivors' in e) st.narrative.survivors = Math.max(0, st.narrative.survivors + e.survivors);
    else if ('vent' in e || 'killNear' in e) {
      const prop = st.map.props.find((q) => q.id === propId);
      const sec = prop ? st.map.sec[prop.y * st.map.w + prop.x] : -1;
      for (const a of st.actors) {
        if (a.dead || a.faction !== 'enemy') continue;
        const near = prop ? Math.max(Math.abs(a.x - prop.x), Math.abs(a.y - prop.y)) <= 12 : true;
        if (near && (sec < 0 || st.map.sec[a.y * st.map.w + a.x] === sec || near)) killActor(st, ev, a, null, 'vent');
      }
    } else if ('msg' in e) ev.msg(e.msg, {}, 'lore');
    else if ('allies' in e) {
      for (let k = 0; k < e.allies; k++) {
        const s = freeSpotNear(st, p.x, p.y, 3);
        if (s) spawnActor(st, 'robot_aliado', s.x, s.y, { faction: 'ally' });
      }
    } else if ('implant' in e) {
      if (!addItem(st, { id: e.implant, n: 1 })) st.items.push({ id: st.nextId++, x: p.x, y: p.y, item: { id: e.implant, n: 1 } });
      st.known[e.implant] = true;
      ev.msg('msg.received', { item: `@item.${e.implant}.name`, n: 1 }, 'good');
    } else if ('status' in e) p.status[e.status] = Math.max(p.status[e.status] ?? 0, e.turns);
    else if ('sfx' in e) ev.sfx(e.sfx);
  }
}

// ------------------------------------------------------------------ diálogos

export function currentNode(st: RunState): { scene: SceneDef; node: DialogNode } | null {
  const m = st.modal;
  if (!m || m.kind !== 'dialog') return null;
  const scene = sceneDef(m.scene);
  if (!scene) return null;
  const node = scene.nodes[m.node];
  if (!node) return null;
  return { scene, node };
}

export interface ShownOption { index: number; opt: DialogOption; enabled: boolean }

export function visibleOptions(st: RunState): ShownOption[] {
  const cur = currentNode(st);
  if (!cur) return [];
  const opts = cur.node.options ?? [];
  const out: ShownOption[] = [];
  opts.forEach((opt, index) => {
    const ok = evalCond(st, opt.cond);
    if (!ok && opt.hideIfLocked !== false && opt.cond) return;
    out.push({ index, opt, enabled: ok });
  });
  return out;
}

export function startScene(st: RunState, ev: EventSink, id: string, propId?: number): void {
  const scene = sceneDef(id);
  if (!scene) return;
  st.modal = { kind: 'dialog', scene: id, node: scene.start, propId };
  if (!scene.repeat && !st.narrative.scenesDone.includes(id)) st.narrative.scenesDone.push(id);
  if (scene.once === 'meta') st.metaSnapshot.flags[`scene_${id}`] = 1;
  if (scene.setsStage && scene.npc) applyEffects(st, ev, [{ arc: scene.npc, stage: scene.setsStage }]);
  applyEffects(st, ev, scene.nodes[scene.start].effects, propId);
  ev.sfx(scene.kind === 'radio' ? 'radio' : 'dialog');
}

function gotoNode(st: RunState, ev: EventSink, next: string | null | undefined, propId?: number): void {
  const m = st.modal;
  if (!m || m.kind !== 'dialog') return;
  if (!next || st.over) { st.modal = null; return; }
  const scene = sceneDef(m.scene)!;
  const node = scene.nodes[next];
  if (!node) { st.modal = null; return; }
  m.node = next;
  applyEffects(st, ev, node.effects, propId);
}

export function chooseOption(st: RunState, ev: EventSink, index: number): boolean {
  const cur = currentNode(st);
  const m = st.modal;
  if (!cur || !m || m.kind !== 'dialog') return false;
  const opts = cur.node.options ?? [];
  if (opts.length === 0) {
    gotoNode(st, ev, cur.node.next, m.propId);
    return true;
  }
  const opt = opts[index];
  if (!opt || !evalCond(st, opt.cond)) return false;
  const propId = m.propId;
  applyEffects(st, ev, opt.effects, propId);
  if (st.modal && st.modal.kind === 'dialog') gotoNode(st, ev, opt.next, propId);
  if (!st.modal && propId !== undefined) {
    const prop = st.map.props.find((q) => q.id === propId);
    if (prop && prop.kind === 'event') prop.used = true;
    if (prop && prop.kind === 'npc') prop.used = true;
  }
  return true;
}

// ------------------------------------------------------------------ director narrativo

export function sceneEligible(st: RunState, s: SceneDef, zone: number, floor: number): boolean {
  if (!s.zones.includes(zone)) return false;
  if (s.floors && !s.floors.includes(floor)) return false;
  if (s.kind === 'ending') return false;
  if (s.npc && s.stage !== undefined && (st.metaSnapshot.arcs[s.npc] ?? 0) !== s.stage) return false;
  if (st.narrative.scenesDone.includes(s.id)) return false;
  if (s.once === 'meta' && st.metaSnapshot.flags[`scene_${s.id}`]) return false;
  if (s.npc && st.narrative.flags[`dead_${s.npc}`]) return false;
  return evalCond(st, s.cond);
}

/** Elige la escena para la sala de evento del piso (PNJ prioritarios). */
export function pickFloorScene(st: RunState, zone: number, floor: number, kinds: SceneDef['kind'][]): SceneDef | null {
  const cands = SCENES.filter((s) => kinds.includes(s.kind) && sceneEligible(st, s, zone, floor));
  if (cands.length === 0) return null;
  return weighted(st.rng, cands, (s) => (s.weight ?? 1) * (s.kind === 'npc' ? 3 : 1));
}

/** Opciones de final disponibles en el Núcleo. */
export function availableEndings(st: RunState): string[] {
  return ENDINGS.filter((e) => e.kind !== 'death' && evalCond(st, e.cond)).map((e) => e.id);
}

export function npcName(id: NpcId): string {
  return `@npc.${id}.name`;
}

export function knownItemName(st: RunState, id: string): string {
  const d = itemDef(id);
  if (!d.unknown || st.known[id]) return `@item.${id}.name`;
  return d.unknown === 'injector' ? `@unknown.injector.${st.appear[id] ?? 0}` : `@unknown.module.${st.appear[id] ?? 0}`;
}
