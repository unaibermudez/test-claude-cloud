import type { RunState, Actor } from './state';
import { TILE } from './state';
import type { EventSink } from './events';
import { BAL } from '../data/balance';
import { enemyDef, REGULAR_ENEMIES } from '../data/enemies';
import { int, chance, pick } from './rng';
import { getPlayer, actorAt, spawnActor, freeSpotNear } from './actors';
import { damagePlayer, damageActor, killActor, eject, explode, ignite, addNoise, isOuterWall } from './combat';
import { getStats } from './rules';
import { inBounds, invalidateProps, passable, pressureAt, tileAt } from './map';
import { CARDINALS, DIRS, chebyshev } from './geom';
import { distanceMap, UNREACHABLE } from './path';
import { tickTelegraphs } from './boss';
import { startScene } from './narrative';
import { getVision } from './vision';
import { emitNoise } from './noise';

/** Casillas de fuga (brechas y esclusas abiertas) por sección. */
function leaks(st: RunState): Map<number, number[]> {
  const m = st.map;
  const out = new Map<number, number[]>();
  for (let i = 0; i < m.tiles.length; i++) {
    const t = m.tiles[i];
    if (t !== TILE.BREACH && t !== TILE.AIRLOCK) continue;
    const x = i % m.w; const y = Math.floor(i / m.w);
    for (const d of CARDINALS) {
      const s = m.sec[(y + d.y) * m.w + x + d.x];
      if (s === undefined || s < 0) continue;
      if (t === TILE.AIRLOCK && m.sections[s].vent <= 0) continue;
      const arr = out.get(s) ?? [];
      arr.push(i);
      out.set(s, arr);
    }
  }
  return out;
}

export function atmosphereTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  const L = leaks(st);
  const exterior = m.zone === 6;
  const windy = new Set<number>();
  for (const s of m.sections) {
    if (s.pressure > 0 && L.has(s.id)) windy.add(s.id);
    const leaking = L.has(s.id) || (s.vent > 0 && s.vent < 99999);
    if (s.vent >= 99999) { s.pressure = 0; continue; }
    if (leaking) s.pressure = Math.max(0, s.pressure - BAL.breachRate);
    else if (s.lifeSupport && m.event !== 'apagon') s.pressure = Math.min(100, s.pressure + BAL.lifeSupportRate);
    if (s.vent > 0) s.vent--;
  }
  // igualación por puertas abiertas
  for (const k of Object.keys(m.doors)) {
    const i = Number(k);
    const d = m.doors[i];
    if (!(d.open || d.broken)) continue;
    const x = i % m.w; const y = Math.floor(i / m.w);
    const pairs: [number, number][] = [];
    const a1 = m.sec[i - 1]; const b1 = m.sec[i + 1];
    const a2 = m.sec[i - m.w]; const b2 = m.sec[i + m.w];
    if (a1 >= 0 && b1 >= 0 && a1 !== b1) pairs.push([a1, b1]);
    if (a2 >= 0 && b2 >= 0 && a2 !== b2) pairs.push([a2, b2]);
    void x; void y;
    for (const [a, b] of pairs) {
      const A = m.sections[a]; const B = m.sections[b];
      if (A.vent >= 99999 || B.vent >= 99999) {
        const inner = A.vent >= 99999 ? B : A;
        inner.pressure = Math.max(0, inner.pressure - BAL.breachRate);
        continue;
      }
      // tamaño relativo: las secciones grandes cambian menos
      const diff = A.pressure - B.pressure;
      const flow = diff * BAL.equalizeRate;
      const tot = A.size + B.size;
      A.pressure -= flow * (B.size / tot) * 2 * 0.5;
      B.pressure += flow * (A.size / tot) * 2 * 0.5;
    }
  }
  void exterior;
  // tirón de la despresurización
  const stats = getStats(st);
  for (const [secId, tiles] of L) {
    const S = m.sections[secId];
    // el tirón dura mientras queda aire que escapa
    if (!windy.has(secId) || S.vent >= 99999) continue;
    const dm = distanceMap(m.w, m.h, tiles.map((i) => ({ x: i % m.w, y: Math.floor(i / m.w) })), (x, y) => {
      const i = y * m.w + x;
      if (m.sec[i] !== secId && !tiles.includes(i)) return -1;
      return 1;
    }, 40, false);
    ev.fx('decompress', tiles[0] % m.w, Math.floor(tiles[0] / m.w));
    if (chance(st.rng, 0.5)) ev.sfx('wind', tiles[0] % m.w, Math.floor(tiles[0] / m.w));
    const pullActor = (a: Actor): void => {
      const w = a.id === st.pid ? 2 : enemyDef(a.def).weight;
      if (a.id === st.pid && stats.magboots) return;
      if (a.id !== st.pid && enemyDef(a.def).rank) return;
      if (w >= 3) return;
      if (a.id === st.pid) {
        const handhold = DIRS.some((d) => { const t = tileAt(m, a.x + d.x, a.y + d.y); return t === TILE.WALL || t === TILE.DOOR || t === TILE.PILLAR || t === TILE.COVER; });
        if (!chance(st.rng, handhold ? 0.12 : 0.3)) return;
      } else if (w === 2 && !chance(st.rng, 0.35)) return;
      let best: { x: number; y: number } | null = null;
      let bd = dm[a.y * m.w + a.x];
      if (bd >= UNREACHABLE) return;
      for (const d of DIRS) {
        const nx = a.x + d.x; const ny = a.y + d.y;
        if (!inBounds(m, nx, ny)) continue;
        const v = dm[ny * m.w + nx];
        if (v < bd) { bd = v; best = { x: nx, y: ny }; }
      }
      if (!best) return;
      const t = tileAt(m, best.x, best.y);
      if (t === TILE.BREACH || t === TILE.AIRLOCK) {
        eject(st, ev, a, S.ventedByPlayer ? 'vent' : 'vent');
        if (a.id === st.pid) ev.msg('msg.player_ejected', {}, 'danger');
        return;
      }
      if (!passable(m, best.x, best.y) || actorAt(st, best.x, best.y)) return;
      a.x = best.x; a.y = best.y;
      ev.push({ t: 'anim', actor: a.id, anim: 'move', dx: 0, dy: 0 });
      if (a.id === st.pid) ev.msg('msg.pulled_vacuum', {}, 'danger');
    };
    for (const a of st.actors) {
      if (a.dead || m.sec[a.y * m.w + a.x] !== secId) continue;
      if (enemyDef(a.def).flying && a.id !== st.pid && enemyDef(a.def).weight > 1) continue;
      pullActor(a);
    }
    // objetos sueltos
    for (const it of st.items.slice()) {
      if (m.sec[it.y * m.w + it.x] !== secId) continue;
      let best: { x: number; y: number } | null = null;
      let bd = dm[it.y * m.w + it.x];
      for (const d of CARDINALS) {
        const nx = it.x + d.x; const ny = it.y + d.y;
        const v = dm[ny * m.w + nx];
        if (v < bd) { bd = v; best = { x: nx, y: ny }; }
      }
      if (!best) continue;
      const t = tileAt(m, best.x, best.y);
      if (t === TILE.BREACH || t === TILE.AIRLOCK) {
        st.items.splice(st.items.indexOf(it), 1);
        ev.fx('ejected', it.x, it.y);
      } else { it.x = best.x; it.y = best.y; }
    }
  }
  // asfixia de enemigos
  for (const a of st.actors) {
    if (a.dead || a.id === st.pid) continue;
    const d = enemyDef(a.def);
    if (d.vacuumImmune || exteriorCell(st, a.x, a.y)) continue;
    if (pressureAt(m, a.x, a.y) < 20) {
      const sec = m.sections[m.sec[a.y * m.w + a.x]];
      damageActor(st, ev, a, d.rank ? 1 : 2, null, sec?.ventedByPlayer ? 'vent' : 'env');
    }
  }
}

function exteriorCell(st: RunState, x: number, y: number): boolean {
  if (st.map.zone !== 6) return false;
  const t = tileAt(st.map, x, y);
  return t === TILE.VOID || t === TILE.PLATE;
}

function fireTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  const next: number[] = [];
  for (let i = 0; i < m.fire.length; i++) {
    if (m.fire[i] <= 0) continue;
    const x = i % m.w; const y = Math.floor(i / m.w);
    const s = m.sec[i];
    const S = s >= 0 ? m.sections[s] : null;
    if (!S || S.pressure < BAL.fireMinPressure || S.coolant) { m.fire[i] = 0; continue; }
    m.fire[i]--;
    const a = actorAt(st, x, y);
    if (a) {
      if (a.id === st.pid) {
        const dmg = Math.max(1, Math.round(BAL.fireDmg * (1 - getStats(st).fireResist)));
        damagePlayer(st, ev, dmg, 'fire');
      } else if (!enemyDef(a.def).fireImmune) damageActor(st, ev, a, BAL.fireDmg, null, 'fire');
    }
    for (const p of m.props) {
      if (p.kind === 'barrel' && !p.used && p.x === x && p.y === y) { p.used = true; invalidateProps(m); explode(st, ev, x, y, 2, [6, 10], null); }
    }
    for (const d of CARDINALS) {
      const nx = x + d.x; const ny = y + d.y;
      if (!inBounds(m, nx, ny)) continue;
      const ni = ny * m.w + nx;
      const t = m.tiles[ni];
      if (m.fire[ni] > 0 || (t !== TILE.FLOOR && t !== TILE.PLANTS && t !== TILE.GRATE && t !== TILE.RUBBLE)) continue;
      const pch = BAL.fireSpread * (t === TILE.PLANTS ? 2 : 1);
      if (chance(st.rng, pch)) next.push(ni);
      // barriles adyacentes
      for (const p of m.props) if (p.kind === 'barrel' && !p.used && p.x === nx && p.y === ny && chance(st.rng, 0.3)) { p.used = true; invalidateProps(m); explode(st, ev, nx, ny, 2, [6, 10], null); }
    }
  }
  for (const i of next) ignite(st, ev, i % m.w, Math.floor(i / m.w));
}

function gasTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  if (st.turn % 3 === 0) {
    for (let i = 0; i < m.gas.length; i++) {
      if (m.gas[i] <= 0) continue;
      const s = m.sec[i];
      if (s >= 0 && m.sections[s].pressure < 30) { m.gas[i] = 0; continue; }
      m.gas[i]--;
      if (m.gas[i] >= 3 && chance(st.rng, 0.3)) {
        const d = pick(st.rng, CARDINALS);
        const ni = i + d.y * m.w + d.x;
        if (m.sec[ni] >= 0 && m.gas[ni] < m.gas[i] - 1) m.gas[ni] = m.gas[i] - 1;
      }
    }
  }
  const p = getPlayer(st);
  const g = m.gas[p.y * m.w + p.x];
  if (g >= 3 && st.player.implants.eyes?.id !== 'o_lagrimal') {
    addNoise(st, ev, 0.25);
    if (st.turn % 4 === 0) { damagePlayer(st, ev, 1, 'spores'); ev.msg('msg.spores', {}, 'warn'); }
  }
}

function hazardsTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  const p = getPlayer(st);
  const stats = getStats(st);
  const s = m.sec[p.y * m.w + p.x];
  const S = s >= 0 ? m.sections[s] : null;
  if (S && S.radiation > 0) {
    const every = Math.max(1, 4 - S.radiation);
    if (st.turn % every === 0 && !chance(st.rng, stats.radResist)) {
      damagePlayer(st, ev, 1, 'radiation');
      if (st.turn % (every * 4) === 0) ev.msg('msg.radiation', {}, 'warn');
    }
  }
  // cables vivos
  for (const c of m.props) {
    if (c.kind !== 'cable' || c.off) continue;
    const sec = m.sec[c.y * m.w + c.x];
    const flooded = sec >= 0 && m.sections[sec].coolant;
    for (const a of st.actors) {
      if (a.dead) continue;
      const onCable = a.x === c.x && a.y === c.y;
      const inFlood = flooded && m.sec[a.y * m.w + a.x] === sec && st.turn % 3 === 0;
      if (!onCable && !inFlood) continue;
      if (a.id !== st.pid && enemyDef(a.def).flying) continue;
      ev.fx('arc', a.x, a.y, { color: '#7af0ff' });
      if (a.id === st.pid) { damagePlayer(st, ev, onCable ? 3 : 2, 'shock'); a.status.stun = Math.max(a.status.stun ?? 0, onCable ? 1 : 0); }
      else damageActor(st, ev, a, onCable ? 4 : 2, null, 'env');
    }
  }
}

function statusTurn(st: RunState, ev: EventSink): void {
  for (const a of st.actors) {
    if (a.dead) continue;
    for (const k of Object.keys(a.status)) {
      if (k === 'bleed' && a.status[k] > 0) {
        if (a.id === st.pid) damagePlayer(st, ev, 1, 'bleed'); else damageActor(st, ev, a, 1, null, 'hit');
      }
      if (k === 'poison' && a.status[k] > 0 && a.id === st.pid) damagePlayer(st, ev, 1, 'poison');
      if (k === 'regen' && a.status[k] > 0) a.hp = Math.min(a.id === st.pid ? getStats(st).maxHp : a.maxHp, a.hp + 1);
      if (k === 'loot') continue;
      a.status[k]--;
      if (a.status[k] <= 0) delete a.status[k];
    }
    if (a.ttl !== undefined) {
      a.ttl--;
      if (a.ttl <= 0) {
        a.dead = true;
        if (a.phantom) ev.fx('phantom', a.x, a.y);
        else if (a.faction === 'ally') ev.msg('msg.ally_expired', { name: `@enemy.${a.def}.name` }, 'info');
      }
    }
  }
  st.actors = st.actors.filter((a) => !a.dead || a.id === st.pid);
}

function playerVitals(st: RunState, ev: EventSink, exertion: boolean): void {
  const m = st.map;
  const p = getPlayer(st);
  const stats = getStats(st);
  const pr = pressureAt(m, p.x, p.y);
  let use = BAL.o2Base;
  if (pr < 30) use = BAL.o2Vacuum * (1 - stats.vacuum);
  else if (pr < 70) use = BAL.o2Low;
  if (exertion) use += BAL.o2Exertion;
  use *= stats.o2Mult;
  st.player.o2 = Math.max(0, st.player.o2 - use);
  st.stats.o2Used += use;
  if (st.player.o2 <= 0) {
    damagePlayer(st, ev, BAL.o2SuffocateDmg, 'o2');
    if (st.turn % 3 === 0) ev.msg('msg.suffocating', {}, 'danger');
  } else if (st.player.o2 < 20 && st.turn % 10 === 0) ev.msg('msg.o2_low', {}, 'warn');
  if (pr < 30 && st.turn % 12 === 0 && st.player.o2 > 0) ev.msg('msg.vacuum_here', {}, 'warn');
  // energía
  if (st.player.flashlight) {
    st.player.energy = Math.max(0, st.player.energy - BAL.flashlightCost * stats.energyMult);
    if (st.player.energy <= 0) { st.player.flashlight = false; ev.msg('msg.flashlight_dead', {}, 'warn'); }
  }
  if (stats.energyRegen) st.player.energy = Math.min(stats.maxEnergy, st.player.energy + stats.energyRegen);
  // regeneración natural lenta fuera de combate
  const calm = !st.actors.some((a) => !a.dead && a.faction === 'enemy' && !a.phantom && a.ai.mode === 'hunt' && chebyshev(a.x, a.y, p.x, p.y) <= 10);
  if (calm && st.player.o2 > 0 && st.opts.mode !== 'pesadilla') {
    st.narrative.flags.natRegen = (st.narrative.flags.natRegen ?? 0) + 1;
    if (st.narrative.flags.natRegen >= BAL.naturalRegen) { st.narrative.flags.natRegen = 0; p.hp = Math.min(stats.maxHp, p.hp + 1); }
  }
  // regeneración
  if (stats.regen > 0) {
    st.player.regenAcc++;
    if (st.player.regenAcc >= stats.regen) { st.player.regenAcc = 0; p.hp = Math.min(stats.maxHp, p.hp + 1); }
  }
  if (p.hp > stats.maxHp) p.hp = stats.maxHp;
  if (st.player.o2 > stats.maxO2) st.player.o2 = stats.maxO2;
  if (st.player.energy > stats.maxEnergy) st.player.energy = stats.maxEnergy;
  // ruido mental
  let dn = stats.noisePerTurn;
  const z = st.map.zone;
  if (z === 4) dn += 0.03;
  if (z === 5 || z === 6) dn += 0.01;
  if (st.map.event === 'ruido') dn += 0.12;
  if (st.opts.mode === 'pesadilla') dn += 0.02;
  if (dn > 0) addNoise(st, ev, dn);
  else if (st.player.noise > 0 && st.player.noise < BAL.noiseDistort) st.player.noise = Math.max(0, st.player.noise - 0.02);
  if (st.player.noise >= 100) {
    if (z === 4 && st.narrative.flags.brink) {
      p.hp = 0;
      st.player.lastHitBy = 'dissolution';
      return;
    }
    if (z === 4) { st.narrative.flags.brink = 1; ev.msg('msg.brink', {}, 'hallu'); }
    ev.msg('msg.collapse', {}, 'hallu');
    st.narrative.flags.collapsed = 1;
    p.status.stun = BAL.noiseCollapseStun;
    damagePlayer(st, ev, BAL.noiseCollapseDmg, 'collapse');
    st.player.noise = BAL.noiseAfterCollapse;
  }
  if (stats.migraine > 0 && chance(st.rng, stats.migraine)) {
    p.status.stun = Math.max(p.status.stun ?? 0, 1);
    ev.msg('msg.migraine', {}, 'warn');
  }
  if (st.player.activeCd > 0) st.player.activeCd--;
}

function hallucinations(st: RunState, ev: EventSink): void {
  const n = st.player.noise;
  if (n < BAL.noiseHallucination) return;
  st.hallucinationTimer--;
  if (st.hallucinationTimer > 0) return;
  st.hallucinationTimer = n >= BAL.noiseHeavy ? int(st.rng, 10, 18) : int(st.rng, 20, 35);
  const p = getPlayer(st);
  const pool = REGULAR_ENEMIES.filter((e) => e.zone === st.map.zone && !e.rank);
  const s = freeSpotNear(st, p.x, p.y, 6) ;
  if (s && chebyshev(s.x, s.y, p.x, p.y) >= 3) {
    spawnActor(st, pick(st.rng, pool).id, s.x, s.y, { phantom: true, summoned: true, mode: 'hunt', ttl: int(st.rng, 12, 22) });
  }
  if (n >= BAL.noiseHeavy && chance(st.rng, 0.5)) ev.msg(`hallu.msg${int(st.rng, 1, 8)}`, {}, 'hallu');
}

function decayTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  const t = st.floorTurn;
  const p = getPlayer(st);
  if (m.boss) return;
  let stage = 0;
  if (t >= BAL.decay1) stage = 1;
  if (t >= BAL.decay2) stage = 2;
  if (t >= BAL.decay3) stage = 3;
  if (stage > st.floorDecay) {
    st.floorDecay = stage;
    ev.msg(`agora.decay${stage}`, {}, 'agora');
    ev.sfx('alarm');
    ev.push({ t: 'shake', power: 3 + stage });
  }
  if (stage >= 1 && chance(st.rng, 0.03 + 0.02 * stage)) {
    ev.push({ t: 'shake', power: 2 + stage });
    ev.sfx('tremor');
    ev.push({ t: 'subtitle', key: 'sub.tremor' });
    if (stage >= 2 && chance(st.rng, 0.15)) damagePlayer(st, ev, 1, 'debris');
  }
  if (stage >= 2 && t % BAL.breachEvery === 0) {
    // brecha aleatoria en un muro exterior
    for (let k = 0; k < 60; k++) {
      const i = int(st.rng, 0, m.tiles.length - 1);
      if (m.tiles[i] !== TILE.WALL) continue;
      const x = i % m.w; const y = Math.floor(i / m.w);
      if (!isOuterWall(st, x, y) || m.zone === 6) continue;
      if (!CARDINALS.some((d) => m.sec[(y + d.y) * m.w + x + d.x] >= 0)) continue;
      m.tiles[i] = TILE.BREACH;
      ev.msg('msg.hull_breach', {}, 'danger');
      ev.sfx('breach', x, y);
      break;
    }
  }
  if (stage >= 3 && t % BAL.reinforceEvery === 0) {
    const pool = REGULAR_ENEMIES.filter((e) => e.zone === m.zone && e.behavior !== 'turret' && e.behavior !== 'stationary');
    for (let k = 0; k < 30; k++) {
      const r = pick(st.rng, m.rooms);
      const x = r.x + int(st.rng, 0, r.w - 1); const y = r.y + int(st.rng, 0, r.h - 1);
      if (chebyshev(x, y, p.x, p.y) < 10 || !passable(m, x, y) || actorAt(st, x, y)) continue;
      const a = spawnActor(st, pick(st.rng, pool).id, x, y, { mode: 'alert' });
      a.ai.tx = p.x; a.ai.ty = p.y; a.ai.timer = 25;
      ev.msg('msg.reinforcements', {}, 'danger');
      break;
    }
  }
}

function floorEventTurn(st: RunState, ev: EventSink): void {
  const m = st.map;
  if (!m.event) return;
  if (m.event === 'radiacion' && st.floorTurn % 60 === 30) {
    for (const s of m.sections) s.radiation = Math.min(3, s.radiation + 1);
    ev.msg('msg.event_radiacion_peak', {}, 'danger');
  }
  if (m.event === 'radiacion' && st.floorTurn % 60 === 50) for (const s of m.sections) s.radiation = Math.max(0, s.radiation - 1);
  if (m.event === 'fuego' && st.floorTurn % 25 === 0) {
    const r = pick(st.rng, m.rooms);
    ignite(st, ev, r.x + int(st.rng, 0, r.w - 1), r.y + int(st.rng, 0, r.h - 1));
  }
}

function agoraTurn(st: RunState, ev: EventSink): void {
  const t = st.narrative.trust;
  const m = st.map;
  const p = getPlayer(st);
  if (t < 20 && st.floorTurn % 55 === 54) {
    // ÁGORA cierra una puerta cercana o apaga la luz
    const doors = Object.keys(m.doors).map(Number).filter((i) => {
      const d = m.doors[i];
      return d.open && !d.broken && chebyshev(i % m.w, Math.floor(i / m.w), p.x, p.y) <= 8;
    });
    if (doors.length) {
      const i = pick(st.rng, doors);
      if (!actorAt(st, i % m.w, Math.floor(i / m.w))) { m.doors[i].open = false; ev.msg('agora.hostile_door', {}, 'agora'); ev.sfx('door_close'); }
    } else {
      const s = m.sec[p.y * m.w + p.x];
      if (s >= 0) { m.sections[s].dark = true; ev.msg('agora.hostile_dark', {}, 'agora'); }
    }
  }
  if (t >= 80 && st.floorTurn % 70 === 69 && st.narrative.agoraHelp.recharge === 0) {
    st.narrative.agoraHelp.recharge = 1;
    st.player.energy = Math.min(getStats(st).maxEnergy, st.player.energy + 30);
    ev.msg('agora.recharge', {}, 'agora');
  }
}

export interface TurnFlags { exertion: boolean }

/** Turno de entorno completo (una vez por cada 100 unidades de tiempo del jugador). */
export function environmentTurn(st: RunState, ev: EventSink, f: TurnFlags): void {
  st.turn++;
  st.floorTurn++;
  st.stats.turns++;
  st.orbit--;
  tickTelegraphs(st, ev);
  atmosphereTurn(st, ev);
  fireTurn(st, ev);
  gasTurn(st, ev);
  hazardsTurn(st, ev);
  statusTurn(st, ev);
  playerVitals(st, ev, f.exertion);
  hallucinations(st, ev);
  decayTurn(st, ev);
  floorEventTurn(st, ev);
  agoraTurn(st, ev);
  // minas y balizas
  for (const pr of st.map.props.slice()) {
    if (pr.kind !== 'decor') continue;
    if (pr.label === 'mine') {
      const victim = st.actors.find((a) => !a.dead && a.faction === 'enemy' && !a.phantom && chebyshev(a.x, a.y, pr.x, pr.y) <= 0);
      if (victim) {
        st.map.props.splice(st.map.props.indexOf(pr), 1);
        invalidateProps(st.map);
        explode(st, ev, pr.x, pr.y, 1, [8, 12], getPlayer(st));
      }
    } else if (pr.label === 'beacon') {
      pr.charges = (pr.charges ?? 0) - 1;
      if (st.turn % 2 === 0) emitNoise(st, pr.x, pr.y, 12, false);
      if (pr.charges <= 0) { st.map.props.splice(st.map.props.indexOf(pr), 1); invalidateProps(st.map); }
    }
  }
  // temporizadores varios
  for (const pr of st.map.props) {
    if (pr.lockout && pr.lockout > 0) pr.lockout--;
    if (pr.kind === 'emlight' && pr.variant === 1 && pr.charges !== undefined) {
      pr.charges--;
      if (pr.charges <= 0) { st.map.props.splice(st.map.props.indexOf(pr), 1); invalidateProps(st.map); break; }
    }
  }
  if (st.narrative.flags.darkTimer) {
    st.narrative.flags.darkTimer--;
    if (st.narrative.flags.darkTimer <= 0) {
      const s = st.narrative.flags.darkSec;
      if (s !== undefined && st.map.sections[s]) st.map.sections[s].dark = false;
    }
  }
  if (st.map.radio && st.floorTurn >= (st.narrative.flags.radioTurn ?? 999) && !st.modal) {
    const id = st.map.radio;
    st.map.radio = null;
    startScene(st, ev, id);
  }
  // combate: contador para estadísticas/música
  const v = getVision(st);
  if (st.actors.some((a) => !a.dead && a.faction === 'enemy' && a.ai.mode === 'hunt' && v.seenActors.has(a.id))) st.stats.combatTurns++;
  if (st.orbit <= 0) {
    const p = getPlayer(st);
    p.hp = 0;
    st.player.lastHitBy = 'orbit';
  }
  void killActor;
}
