import type { RunState, Actor } from './state';
import { TILE } from './state';
import type { EventSink } from './events';
import { enemyDef } from '../data/enemies';
import { BAL } from '../data/balance';
import { int, chance, pick } from './rng';
import { getPlayer, actorAt, hostile, spawnActor, freeSpotNear, seeBestiary } from './actors';
import { attack, enemySpec, weaponSpec, damagePlayer, addNoise, killActor, ignite, explode, type AttackSpec } from './combat';
import { passable, inBounds } from './map';
import { DIRS, chebyshev, dirIndex } from './geom';
import { distanceMap, findPath, UNREACHABLE } from './path';
import { hasLos } from './fov';
import { canSeePlayer, blocksSight, getVision } from './vision';
import { bossAct } from './boss';
import { emitNoise } from './noise';
import { removeItem } from './rules';

interface PhaseCache { toPlayer?: Int32Array; toPlayerFly?: Int32Array }
let phase: PhaseCache = {};

export function beginMonsterPhase(): void {
  phase = {};
}

function enemyCost(st: RunState, a: Actor, flying: boolean) {
  const m = st.map;
  const d = enemyDef(a.def);
  return (x: number, y: number): number => {
    const i = y * m.w + x;
    const t = m.tiles[i];
    if (t === TILE.DOOR) {
      const door = m.doors[i];
      if (!door) return -1;
      if (door.broken || door.open) return 1;
      if (door.lock && door.lock !== 'circuit') return -1;
      if (door.sealed) return d.doorBreaker ? 8 : -1;
      if (door.lock === 'circuit') return d.doorBreaker ? 6 : -1;
      return 2;
    }
    if (!passable(m, x, y, { flying, ignoreDoors: false })) return -1;
    if (m.fire[i] > 0 && !d.fireImmune) return 6;
    return 1;
  };
}

function mapToPlayer(st: RunState, a: Actor): Int32Array {
  const flying = !!enemyDef(a.def).flying;
  const key = flying ? 'toPlayerFly' : 'toPlayer';
  if (!phase[key]) {
    const p = getPlayer(st);
    phase[key] = distanceMap(st.map.w, st.map.h, [{ x: p.x, y: p.y }], enemyCost(st, a, flying), 60);
  }
  return phase[key]!;
}

/** Elige un paso hacia el objetivo (usa el mapa al jugador si el objetivo es el jugador). */
function stepToward(st: RunState, a: Actor, tx: number, ty: number): { x: number; y: number } | null {
  const p = getPlayer(st);
  const d = enemyDef(a.def);
  if (tx === p.x && ty === p.y) {
    const dm = mapToPlayer(st, a);
    const cur = dm[a.y * st.map.w + a.x];
    let best: { x: number; y: number } | null = null;
    let bestD = cur >= UNREACHABLE ? UNREACHABLE : cur;
    for (const dir of DIRS) {
      const nx = a.x + dir.x; const ny = a.y + dir.y;
      if (!inBounds(st.map, nx, ny)) continue;
      const v = dm[ny * st.map.w + nx];
      if (v >= bestD) continue;
      const occ = actorAt(st, nx, ny);
      if (occ && !(occ.id === st.pid)) continue;
      best = { x: nx, y: ny }; bestD = v;
    }
    if (best) return best;
  }
  const path = findPath(st.map.w, st.map.h, a.x, a.y, tx, ty, enemyCost(st, a, !!d.flying), 900);
  if (!path || path.length === 0) return null;
  const nxt = path[0];
  const occ = actorAt(st, nxt.x, nxt.y);
  if (occ && occ.id !== st.pid) return null;
  return nxt;
}

function moveTo(st: RunState, ev: EventSink, a: Actor, x: number, y: number): boolean {
  const m = st.map;
  const i = y * m.w + x;
  if (m.tiles[i] === TILE.DOOR) {
    const door = m.doors[i];
    if (door && !door.open && !door.broken) {
      const d = enemyDef(a.def);
      if (door.sealed || door.lock === 'circuit') {
        if (!d.doorBreaker) return false;
        a.ai.cd.bash = (a.ai.cd.bash ?? 0) + 1;
        ev.sfx('bash', x, y);
        if (a.ai.cd.bash >= 3) {
          door.broken = true; door.sealed = false; door.lock = null; door.open = true;
          ev.msg('msg.door_broken', { name: `@enemy.${a.def}.name` }, 'danger');
          a.ai.cd.bash = 0;
        }
        return true;
      }
      if (door.lock) return false;
      door.open = true;
      ev.sfx('door_open', x, y);
      return true;
    }
  }
  if (actorAt(st, x, y)) return false;
  const dx = x - a.x; const dy = y - a.y;
  a.x = x; a.y = y;
  const di = dirIndex(dx, dy);
  if (di >= 0) a.facing = di;
  ev.push({ t: 'anim', actor: a.id, anim: 'move', dx, dy });
  const d = enemyDef(a.def);
  if (d.abilities.includes('fireTrail') && chance(st.rng, 0.25)) ignite(st, ev, x, y);
  return true;
}

function fleeStep(st: RunState, a: Actor): { x: number; y: number } | null {
  const dm = mapToPlayer(st, a);
  const w = st.map.w;
  let best: { x: number; y: number } | null = null;
  let bestD = dm[a.y * w + a.x];
  for (const dir of DIRS) {
    const nx = a.x + dir.x; const ny = a.y + dir.y;
    if (!inBounds(st.map, nx, ny) || actorAt(st, nx, ny)) continue;
    const v = dm[ny * w + nx];
    if (v >= UNREACHABLE) continue;
    if (v > bestD) { best = { x: nx, y: ny }; bestD = v; }
  }
  return best;
}

function wander(st: RunState, a: Actor): void {
  const m = st.map;
  for (let k = 0; k < 8; k++) {
    const x = a.ai.homeX + int(st.rng, -6, 6); const y = a.ai.homeY + int(st.rng, -6, 6);
    if (passable(m, x, y, { flying: !!enemyDef(a.def).flying })) { a.ai.tx = x; a.ai.ty = y; a.ai.timer = 20; return; }
  }
}

function los(st: RunState, a: Actor, b: { x: number; y: number }): boolean {
  return hasLos(a.x, a.y, b.x, b.y, (x, y) => blocksSight(st, x, y));
}

/** Objetivo: el jugador o un aliado/señuelo más cercano y visible. */
function pickTarget(st: RunState, a: Actor): Actor | null {
  const p = getPlayer(st);
  let best: Actor | null = null;
  let bestD = 99;
  const d = enemyDef(a.def);
  if (canSeePlayer(st, a)) { best = p; bestD = chebyshev(a.x, a.y, p.x, p.y); }
  for (const o of st.actors) {
    if (o.dead || o === a || o.faction !== 'ally') continue;
    const dist = chebyshev(a.x, a.y, o.x, o.y);
    const decoyBias = o.def === 'senuelo' ? 3 : 0;
    if (dist - decoyBias < bestD && dist <= d.sight && los(st, a, o)) { best = o; bestD = dist - decoyBias; }
  }
  return best;
}

export function monsterAct(st: RunState, ev: EventSink, a: Actor): void {
  if (a.dead) return;
  if (a.status.stun) return;
  const d = enemyDef(a.def);
  if (a.faction === 'npc') return;
  if (a.faction === 'ally') { allyAct(st, ev, a); return; }
  const p = getPlayer(st);
  if (a.boss && a.ai.mode === 'hunt' && chebyshev(a.x, a.y, p.x, p.y) <= 14) {
    if (bossAct(st, ev, a)) return;
  }
  // percepción
  const target = pickTarget(st, a);
  const seesPlayer = target?.id === st.pid;
  if (target) {
    if (a.ai.mode !== 'hunt' && seesPlayer) {
      if (a.ai.mode === 'dormant') ev.msg('msg.ambush', { name: `@enemy.${a.def}.name` }, 'danger');
      else if (!a.phantom) ev.sfx('alert', a.x, a.y);
      if (d.abilities.includes('callAllies') && !(a.ai.cd.call > 0)) {
        a.ai.cd.call = 25;
        for (const o of st.actors) if (!o.dead && o.faction === 'enemy' && o !== a && chebyshev(o.x, o.y, a.x, a.y) <= 10 && o.ai.mode !== 'hunt') {
          o.ai.mode = 'alert'; o.ai.tx = p.x; o.ai.ty = p.y; o.ai.timer = 15;
        }
        ev.msg('msg.call_allies', { name: `@enemy.${a.def}.name` }, 'warn');
        emitNoise(st, a.x, a.y, 8, false);
      }
    }
    a.ai.mode = 'hunt';
    a.ai.tx = target.x; a.ai.ty = target.y; a.ai.timer = BAL.alertTurns;
  }
  for (const k of Object.keys(a.ai.cd)) if (k !== 'bash' && a.ai.cd[k] > 0) a.ai.cd[k]--;
  if (a.ai.mode === 'dormant') return;
  // huida de cobardes
  if (d.coward && a.hp < a.maxHp * 0.35 && a.ai.mode === 'hunt') a.ai.mode = 'flee';
  if (a.ai.mode === 'flee') {
    const s = fleeStep(st, a);
    if (s) moveTo(st, ev, a, s.x, s.y);
    a.ai.timer--;
    if (a.ai.timer <= -10) { a.ai.mode = 'patrol'; a.ai.timer = 0; }
    return;
  }
  // habilidades pasivas
  passiveAbilities(st, ev, a, target);
  if (a.dead) return;
  const behavior = d.behavior;
  const dist = target ? chebyshev(a.x, a.y, target.x, target.y) : 99;
  if (target) {
    // ¿atacar?
    const range = d.range ?? 1;
    const spec: AttackSpec = behavior === 'mimic' ? mimicSpec(st, a) : enemySpec(st, a);
    if (behavior === 'exploder') {
      if (dist <= 1) {
        ev.msg('msg.exploder', { name: `@enemy.${a.def}.name` }, 'danger');
        killActor(st, ev, a, null, 'self');
        return;
      }
    } else if (behavior === 'thief' && dist <= 1 && !(a.ai.cd.steal > 0)) {
      steal(st, ev, a);
      return;
    } else if (dist <= 1 || (range > 1 && dist <= range && los(st, a, target))) {
      if (behavior === 'stalker' && d.id === 'espantapajaros' && getVision(st).seenActors.has(a.id) && dist > 1) {
        return; // se queda quieto si lo miras
      }
      const ranged = dist > 1 && range > 1;
      const s2 = { ...spec, ranged };
      const hit = attack(st, ev, a, target, s2);
      if (hit && target.id === st.pid) onHitAbilities(st, ev, a);
      if (ranged) emitNoise(st, a.x, a.y, 6, false);
      return;
    }
    if (behavior === 'turret' || behavior === 'stationary') return;
    if (behavior === 'stalker' && d.id === 'espantapajaros' && getVision(st).seenActors.has(a.id)) return;
    if (behavior === 'charger') { chargeMove(st, ev, a, target); return; }
    // moverse
    if ((behavior === 'ranged' || behavior === 'support') && dist <= Math.max(2, (d.range ?? 2) - 1) && los(st, a, target)) {
      const s = fleeStep(st, a);
      if (s && chance(st.rng, 0.6)) { moveTo(st, ev, a, s.x, s.y); return; }
    }
    if (d.abilities.includes('teleport') && dist > 3 && !(a.ai.cd.tp > 0) && chance(st.rng, 0.5)) {
      const s = freeSpotNear(st, target.x, target.y, 1, true);
      if (s) {
        ev.fx('teleport', a.x, a.y);
        a.x = s.x; a.y = s.y; a.ai.cd.tp = 6;
        ev.fx('teleport', s.x, s.y);
        return;
      }
    }
    const step = stepToward(st, a, target.x, target.y);
    if (step) moveTo(st, ev, a, step.x, step.y);
    return;
  }
  // sin objetivo visible
  if (behavior === 'turret' || behavior === 'stationary') return;
  if (a.ai.mode === 'hunt' || a.ai.mode === 'alert') {
    if (a.x === a.ai.tx && a.y === a.ai.ty) {
      a.ai.timer -= 2;
    } else {
      const step = stepToward(st, a, a.ai.tx, a.ai.ty);
      if (step) moveTo(st, ev, a, step.x, step.y);
      else a.ai.timer -= 2;
    }
    a.ai.timer--;
    if (a.ai.timer <= 0) {
      a.ai.mode = a.ai.mode === 'hunt' ? 'alert' : 'patrol';
      a.ai.timer = 8;
      if (a.ai.mode === 'patrol') wander(st, a);
    }
    return;
  }
  if (a.ai.mode === 'patrol') {
    if ((a.x === a.ai.tx && a.y === a.ai.ty) || a.ai.timer <= 0) wander(st, a);
    a.ai.timer--;
    if (chance(st.rng, 0.7)) {
      const step = stepToward(st, a, a.ai.tx, a.ai.ty);
      if (step) moveTo(st, ev, a, step.x, step.y);
      else wander(st, a);
    }
    return;
  }
  if (a.ai.mode === 'idle' && chance(st.rng, 0.05)) { a.ai.mode = 'patrol'; wander(st, a); }
}

function mimicSpec(st: RunState, a: Actor): AttackSpec {
  const base = enemySpec(st, a);
  const pw = st.player.ranged ? weaponSpec(st, 'ranged') : weaponSpec(st, 'melee');
  void a;
  return { ...base, dmg: [Math.max(base.dmg[0], pw.dmg[0]), Math.max(base.dmg[1], pw.dmg[1])], traits: pw.traits.filter((t) => t !== 'mental'), ranged: pw.ranged };
}

function chargeMove(st: RunState, ev: EventSink, a: Actor, target: Actor): void {
  let vx = a.vx ?? 0; let vy = a.vy ?? 0;
  if (vx === 0 && vy === 0) { vx = Math.sign(target.x - a.x); vy = Math.sign(target.y - a.y); }
  for (let k = 0; k < 2; k++) {
    const nx = a.x + vx; const ny = a.y + vy;
    const occ = actorAt(st, nx, ny);
    if (occ && hostile(a, occ)) {
      attack(st, ev, a, occ, enemySpec(st, a));
      vx = 0; vy = 0;
      break;
    }
    if (!passable(st.map, nx, ny, { flying: true }) || occ) { vx = 0; vy = 0; ev.sfx('thud', a.x, a.y); break; }
    a.x = nx; a.y = ny;
    ev.push({ t: 'anim', actor: a.id, anim: 'move', dx: vx, dy: vy });
  }
  a.vx = vx; a.vy = vy;
}

function steal(st: RunState, ev: EventSink, a: Actor): void {
  a.ai.cd.steal = 30;
  const taken = Math.min(st.player.scrap, int(st.rng, 8, 20));
  if (taken > 0) {
    st.player.scrap -= taken;
    ev.msg('msg.stolen_scrap', { n: taken, name: `@enemy.${a.def}.name` }, 'danger');
  } else {
    const cands = st.player.inv.filter((s) => s.id !== 'traje_eva');
    if (cands.length) {
      const s = pick(st.rng, cands);
      removeItem(st, s.id, 1);
      ev.msg('msg.stolen_item', { item: `@item.${s.id}.name`, name: `@enemy.${a.def}.name` }, 'danger');
      a.status.loot = 1;
      a.carry = s.id;
    }
  }
  a.ai.mode = 'flee';
  a.ai.timer = 10;
}

function onHitAbilities(st: RunState, ev: EventSink, a: Actor): void {
  const d = enemyDef(a.def);
  const p = getPlayer(st);
  if (d.abilities.includes('grab') && chance(st.rng, 0.5)) { p.status.rooted = 2; ev.msg('msg.grabbed', { name: `@enemy.${a.def}.name` }, 'danger'); }
  if (d.abilities.includes('drainO2')) st.player.o2 = Math.max(0, st.player.o2 - 6);
  if (d.abilities.includes('drainEnergy')) { st.player.energy = Math.max(0, st.player.energy - 6); ev.push({ t: 'dmg', x: p.x, y: p.y, amount: 6, kind: 'energy' }); }
  if (d.abilities.includes('blind') && chance(st.rng, 0.5)) { p.status.blind = 2; ev.msg('msg.blinded', {}, 'danger'); }
  if (d.abilities.includes('mental')) addNoise(st, ev, 1);
}

function passiveAbilities(st: RunState, ev: EventSink, a: Actor, target: Actor | null): void {
  const d = enemyDef(a.def);
  const m = st.map;
  const p = getPlayer(st);
  const dist = chebyshev(a.x, a.y, p.x, p.y);
  if (d.abilities.includes('spores') && !(a.ai.cd.spores > 0) && (target || chance(st.rng, 0.2))) {
    a.ai.cd.spores = 4;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = a.x + dx; const y = a.y + dy;
      if (inBounds(m, x, y) && m.sec[y * m.w + x] >= 0) m.gas[y * m.w + x] = Math.max(m.gas[y * m.w + x], 5 + int(st.rng, 0, 2));
    }
    if (dist <= 6) ev.sfx('spores', a.x, a.y);
  }
  if (d.abilities.includes('heal') && !(a.ai.cd.heal > 0)) {
    const ally = st.actors.find((o) => !o.dead && o.faction === 'enemy' && o !== a && o.hp < o.maxHp && chebyshev(o.x, o.y, a.x, a.y) <= 4);
    if (ally) {
      a.ai.cd.heal = 4;
      const amt = Math.max(2, Math.round(ally.maxHp * 0.25));
      ally.hp = Math.min(ally.maxHp, ally.hp + amt);
      ev.push({ t: 'dmg', x: ally.x, y: ally.y, amount: amt, kind: 'heal' });
      ev.fx('heal', ally.x, ally.y, { tx: a.x, ty: a.y });
    }
  }
  if (d.abilities.includes('shieldAllies') && !(a.ai.cd.shield > 0)) {
    const ally = st.actors.find((o) => !o.dead && o.faction === 'enemy' && o !== a && !o.status.shielded && chebyshev(o.x, o.y, a.x, a.y) <= 4);
    if (ally) { a.ai.cd.shield = 6; ally.status.shielded = 4; ev.fx('shield', ally.x, ally.y); }
  }
  if (d.abilities.includes('radiate') && dist <= 2 && st.turn % 2 === 0) {
    damagePlayer(st, ev, 1, 'radiation');
  }
  if (d.abilities.includes('mental') && d.behavior === 'stalker' && dist <= 4) addNoise(st, ev, 0.5);
  if (d.abilities.includes('scream') && target && dist <= 3 && !(a.ai.cd.scream > 0)) {
    a.ai.cd.scream = 6;
    ev.fx('scream', a.x, a.y, { n: 3 });
    ev.msg('msg.scream', { name: `@enemy.${a.def}.name` }, 'danger');
    addNoise(st, ev, 5);
    if (chance(st.rng, 0.5)) p.status.stun = Math.max(p.status.stun ?? 0, 1);
  }
  if (d.abilities.includes('darken') && !(a.ai.cd.darken > 0) && target) {
    a.ai.cd.darken = 99;
    const s = m.sec[a.y * m.w + a.x];
    if (s >= 0 && !m.sections[s].dark) { m.sections[s].dark = true; ev.msg('msg.lights_die', {}, 'warn'); ev.sfx('blackout'); }
  }
  if (d.abilities.includes('pull') && target?.id === st.pid && dist <= (d.range ?? 4) && dist > 1 && !(a.ai.cd.pull > 0)) {
    a.ai.cd.pull = 3;
    const nx = p.x + Math.sign(a.x - p.x); const ny = p.y + Math.sign(a.y - p.y);
    if (passable(m, nx, ny, { allowVoid: true }) && !actorAt(st, nx, ny)) {
      p.x = nx; p.y = ny;
      ev.msg('msg.pulled', { name: `@enemy.${a.def}.name` }, 'danger');
    }
  }
  if (d.behavior === 'summoner' && target && !(a.ai.cd.summon > 0)) {
    a.ai.cd.summon = 10;
    const s = freeSpotNear(st, a.x, a.y, 3, true);
    if (s && st.actors.filter((o) => !o.dead && o.summoned).length < 8) {
      spawnActor(st, a.zoneSummon ?? 'eco_deriva', s.x, s.y, { summoned: true, mode: 'hunt' });
      ev.fx('summon', s.x, s.y);
    }
  }
  if (d.behavior === 'stalker' && d.id !== 'espantapajaros' && target?.id === st.pid && dist > 2 && getVision(st).seenActors.has(a.id) && chance(st.rng, 0.3)) {
    // los acechadores retroceden a la sombra
    const s = fleeStep(st, a);
    if (s) moveTo(st, ev, a, s.x, s.y);
  }
  void explode;
}

function allyAct(st: RunState, ev: EventSink, a: Actor): void {
  const d = enemyDef(a.def);
  if (a.def === 'senuelo') return;
  const p = getPlayer(st);
  let best: Actor | null = null; let bestD = 99;
  for (const o of st.actors) {
    if (o.dead || o.faction !== 'enemy' || o.phantom) continue;
    const dist = chebyshev(a.x, a.y, o.x, o.y);
    if (dist < bestD && dist <= 8 && los(st, a, o)) { best = o; bestD = dist; }
  }
  if (best) {
    const range = d.range ?? 1;
    if (bestD <= 1 || (range > 1 && bestD <= range)) {
      attack(st, ev, a, best, { ...enemySpec(st, a), ranged: bestD > 1 });
      return;
    }
    const path = findPath(st.map.w, st.map.h, a.x, a.y, best.x, best.y, enemyCost(st, a, !!d.flying), 600);
    if (path && path[0] && !actorAt(st, path[0].x, path[0].y)) moveTo(st, ev, a, path[0].x, path[0].y);
    return;
  }
  if (chebyshev(a.x, a.y, p.x, p.y) > 2) {
    const path = findPath(st.map.w, st.map.h, a.x, a.y, p.x, p.y, enemyCost(st, a, !!d.flying), 600);
    if (path && path[0] && !actorAt(st, path[0].x, path[0].y)) moveTo(st, ev, a, path[0].x, path[0].y);
  }
}

/** Marca en el bestiario los enemigos que el jugador ve. */
export function noteSeen(st: RunState, ev: EventSink): void {
  const v = getVision(st);
  for (const a of st.actors) if (!a.dead && v.seenActors.has(a.id) && a.faction === 'enemy') seeBestiary(st, ev, a);
}
