import type { RunState, Actor } from './state';
import { TILE } from './state';
import type { EventSink } from './events';
import type { WeaponTrait } from './content';
import { enemyDef } from '../data/enemies';
import { itemDef } from '../data/items';
import { BAL } from '../data/balance';
import { int, chance, next } from './rng';
import { actorAt, getPlayer, dmgMult, actorArmor, hostile, spawnActor, freeSpotNear, seeBestiary } from './actors';
import { getStats, addItem } from './rules';
import { passable, tileAt, inBounds } from './map';
import { DIRS, chebyshev, line } from './geom';
import { emitNoise } from './noise';
import { onBossDeath, bossDamageGate } from './boss';
import { invalidateProps } from './map';

export interface AttackSpec {
  dmg: [number, number];
  acc: number;
  traits: WeaponTrait[];
  ranged: boolean;
  noise: number;
  bonus: number;
  weapon?: string;
}

export function weaponSpec(st: RunState, which: 'melee' | 'ranged'): AttackSpec {
  const stats = getStats(st);
  const stack = which === 'melee' ? st.player.melee : st.player.ranged;
  if (!stack) {
    return { dmg: [1, 2], acc: 80 + stats.acc, traits: [], ranged: false, noise: 3, bonus: stats.melee };
  }
  const w = itemDef(stack.id).weapon!;
  const traits = [...w.traits];
  if (which === 'melee' && st.player.implants.arms?.id === 'a_conducto') traits.push('emp');
  if (which === 'melee' && st.player.implants.arms?.id === 'a_lete') traits.push('lifesteal');
  return {
    dmg: w.dmg, acc: w.acc + stats.acc - (stack.cursed ? 10 : 0), traits, ranged: w.kind === 'ranged', noise: w.noise,
    bonus: w.kind === 'melee' ? stats.melee : stats.ranged, weapon: stack.id,
  };
}

export function enemySpec(st: RunState, a: Actor): AttackSpec {
  const d = enemyDef(a.def);
  const m = dmgMult(st, a);
  const traits: WeaponTrait[] = [];
  if (d.abilities.includes('fireTrail')) traits.push('fire');
  if (d.abilities.includes('shock')) traits.push('stun');
  if (d.abilities.includes('mental') || a.elite === 'resonante') traits.push('mental');
  if (a.elite === 'voraz') traits.push('lifesteal');
  return {
    dmg: [Math.max(0, Math.round(d.dmg[0] * m)), Math.max(1, Math.round(d.dmg[1] * m))], acc: d.acc, traits,
    ranged: !!d.range && d.range > 1, noise: d.range && d.range > 1 ? 6 : 2, bonus: 0,
  };
}

function hasCover(st: RunState, att: Actor, tgt: Actor): boolean {
  const sx = Math.sign(att.x - tgt.x);
  const sy = Math.sign(att.y - tgt.y);
  const t = tileAt(st.map, tgt.x + sx, tgt.y + sy);
  if (t === TILE.COVER || t === TILE.PILLAR) return true;
  if (sx !== 0 && sy !== 0) {
    const t1 = tileAt(st.map, tgt.x + sx, tgt.y);
    const t2 = tileAt(st.map, tgt.x, tgt.y + sy);
    return (t1 === TILE.COVER || t1 === TILE.PILLAR) && (t2 === TILE.COVER || t2 === TILE.PILLAR);
  }
  return false;
}

function evasionOf(st: RunState, a: Actor): number {
  if (a.id === st.pid) return getStats(st).evasion;
  const d = enemyDef(a.def);
  let e = d.evasion;
  if (a.status.stun || a.status.rooted || a.status.slow) e = 0;
  return e;
}

export function isUnaware(a: Actor): boolean {
  return a.faction === 'enemy' && a.ai.mode !== 'hunt' && !a.boss;
}

/** Resuelve un ataque. Devuelve true si impactó. */
export function attack(st: RunState, ev: EventSink, att: Actor, tgt: Actor, spec: AttackSpec, opts: { sneak?: boolean; scale?: number } = {}): boolean {
  const isPlayer = att.id === st.pid;
  const dist = chebyshev(att.x, att.y, tgt.x, tgt.y);
  ev.push({ t: 'anim', actor: att.id, anim: 'attack', dx: Math.sign(tgt.x - att.x), dy: Math.sign(tgt.y - att.y) });
  if (spec.ranged) ev.fx('shot', att.x, att.y, { tx: tgt.x, ty: tgt.y, color: spec.traits.includes('fire') ? '#ff8f4a' : spec.traits.includes('mental') ? '#c48cff' : spec.traits.includes('emp') || spec.traits.includes('chain') ? '#7af0ff' : spec.traits.includes('freeze') ? '#bff' : '#ffe6a0' });
  const sneak = !!opts.sneak && isPlayer && isUnaware(tgt);
  let hitChance = spec.acc - evasionOf(st, tgt);
  if (spec.ranged && hasCover(st, att, tgt) && dist > 1) hitChance -= BAL.coverPenalty;
  if (spec.ranged && isPlayer) {
    const w = spec.weapon ? itemDef(spec.weapon).weapon : undefined;
    if (w && dist > w.range) hitChance -= BAL.rangePenalty * (dist - w.range);
  }
  if (att.status.blind) hitChance -= 30;
  hitChance = Math.max(5, Math.min(95, hitChance));
  if (!sneak && next(st.rng) * 100 >= hitChance) {
    ev.push({ t: 'dmg', x: tgt.x, y: tgt.y, amount: 0, kind: 'miss' });
    ev.sfx(spec.ranged ? 'miss_shot' : 'whoosh', tgt.x, tgt.y);
    if (isPlayer) ev.msg('msg.miss', { target: `@enemy.${tgt.def}.name` }, 'combat');
    else if (tgt.id === st.pid) ev.msg('msg.enemy_miss', { attacker: `@enemy.${att.def}.name` }, 'combat');
    return false;
  }
  let dmg = int(st.rng, spec.dmg[0], spec.dmg[1]) + spec.bonus;
  let crit = false;
  const critChance = isPlayer ? getStats(st).crit : 0.04;
  if (chance(st.rng, critChance)) { dmg = Math.round(dmg * BAL.critMult); crit = true; }
  if (sneak) {
    dmg = Math.round(dmg * (spec.ranged ? BAL.sneakRanged : BAL.sneakMelee) * getStats(st).stealthKill);
    st.stats.stealthKills += 0; // se cuenta al matar
  }
  if (opts.scale) dmg = Math.round(dmg * opts.scale);
  const tdef = tgt.id === st.pid ? null : enemyDef(tgt.def);
  if (spec.traits.includes('mental')) {
    if (tdef && tdef.eco) dmg = Math.round(dmg * 1.5);
    else if (tdef) dmg = Math.round(dmg * 0.7);
    if (isPlayer) addNoise(st, ev, 2);
  }
  if (spec.traits.includes('emp') && tdef?.robot) dmg = Math.round(dmg * 1.5);
  if (spec.traits.includes('fire') && tdef?.fireImmune) dmg = Math.round(dmg * 0.3);
  let armor = tgt.id === st.pid ? getStats(st).armor : actorArmor(tgt);
  if (spec.traits.includes('crush')) armor = Math.floor(armor / 2);
  if (spec.traits.includes('pierce')) armor = Math.max(0, armor - 2);
  dmg = Math.max(1, dmg - armor);
  if (crit) ev.push({ t: 'dmg', x: tgt.x, y: tgt.y, amount: dmg, kind: 'crit' });
  ev.sfx(spec.ranged ? 'hit_shot' : 'hit_melee', tgt.x, tgt.y);
  if (sneak) ev.msg('msg.sneak_attack', { target: `@enemy.${tgt.def}.name` }, 'good');
  const dealt = damageActor(st, ev, tgt, dmg, att, spec.traits.includes('fire') ? 'fire' : 'hit', sneak);
  if (dealt > 0 && !tgt.dead) applyTraits(st, ev, att, tgt, spec);
  if (dealt > 0 && spec.traits.includes('lifesteal') && att.hp < att.maxHp) {
    att.hp = Math.min(att.maxHp, att.hp + 1);
  }
  if (isPlayer && spec.traits.includes('chain')) {
    const other = st.actors.find((a) => !a.dead && a.faction === 'enemy' && a.id !== tgt.id && chebyshev(a.x, a.y, tgt.x, tgt.y) <= 2);
    if (other) {
      ev.fx('arc', tgt.x, tgt.y, { tx: other.x, ty: other.y, color: '#7af0ff' });
      damageActor(st, ev, other, Math.max(1, Math.round(dmg * 0.6)), att, 'shock');
    }
  }
  return true;
}

function applyTraits(st: RunState, ev: EventSink, att: Actor, tgt: Actor, spec: AttackSpec): void {
  const tdef = tgt.id === st.pid ? null : enemyDef(tgt.def);
  const isPlayerTarget = tgt.id === st.pid;
  if (spec.traits.includes('knockback')) {
    const power = 1 + (att.id === st.pid ? getStats(st).pushPower : 0);
    push(st, ev, tgt, Math.sign(tgt.x - att.x), Math.sign(tgt.y - att.y), power, att);
  }
  if (spec.traits.includes('stun') && !tgt.dead && !(tgt.boss && chance(st.rng, 0.7))) {
    tgt.status.stun = Math.max(tgt.status.stun ?? 0, isPlayerTarget ? 1 : 2);
  }
  if (spec.traits.includes('emp') && tdef?.robot && !tgt.boss) tgt.status.stun = Math.max(tgt.status.stun ?? 0, 2);
  if (spec.traits.includes('bleed') && !(tdef?.robot)) tgt.status.bleed = Math.max(tgt.status.bleed ?? 0, 3);
  if (spec.traits.includes('freeze')) tgt.status.slow = Math.max(tgt.status.slow ?? 0, 3);
  if (spec.traits.includes('fire') && chance(st.rng, 0.4)) ignite(st, ev, tgt.x, tgt.y);
  if (spec.traits.includes('harpoon') && !tgt.dead && (tdef ? tdef.weight < 3 : true)) {
    for (let k = 0; k < 2; k++) {
      const nx = tgt.x + Math.sign(att.x - tgt.x);
      const ny = tgt.y + Math.sign(att.y - tgt.y);
      if ((nx === att.x && ny === att.y) || !passable(st.map, nx, ny) || actorAt(st, nx, ny)) break;
      tgt.x = nx; tgt.y = ny;
    }
    ev.msg('msg.harpoon', { target: `@enemy.${tgt.def}.name` }, 'combat');
  }
  if (spec.traits.includes('mental') && isPlayerTarget) addNoise(st, ev, 4);
}

export function addNoise(st: RunState, ev: EventSink, amount: number): void {
  const stats = getStats(st);
  const before = st.player.noise;
  const mult = amount > 0 ? stats.mentalMult : 1;
  st.player.noise = Math.max(0, Math.min(100, st.player.noise + amount * mult));
  st.stats.maxNoise = Math.max(st.stats.maxNoise, st.player.noise);
  for (const th of [BAL.noiseDistort, BAL.noiseHallucination, BAL.noiseHeavy]) {
    if (before < th && st.player.noise >= th) ev.msg(`msg.noise_${th}`, {}, 'hallu');
  }
}

/** Aplica daño a un actor. Devuelve el daño real. */
export function damageActor(st: RunState, ev: EventSink, tgt: Actor, amount: number, src: Actor | null, kind: string, sneak = false): number {
  if (tgt.dead) return 0;
  if (tgt.id === st.pid) return damagePlayer(st, ev, amount, src ? src.def : kind, src);
  if (tgt.phantom) {
    // las alucinaciones se desvanecen al tocarlas
    tgt.dead = true;
    st.stats.phantomsHit++;
    ev.fx('phantom', tgt.x, tgt.y);
    ev.msg('msg.phantom_gone', {}, 'hallu');
    ev.sfx('phantom', tgt.x, tgt.y);
    return 0;
  }
  if (tgt.boss) amount = bossDamageGate(st, ev, tgt, amount);
  if (amount <= 0) return 0;
  tgt.hp -= amount;
  if (src?.id === st.pid) st.stats.damageDealt += amount;
  ev.push({ t: 'dmg', x: tgt.x, y: tgt.y, amount, kind: 'hp' });
  ev.push({ t: 'anim', actor: tgt.id, anim: 'hurt' });
  ev.fx(enemyDef(tgt.def).robot ? 'sparks' : 'blood', tgt.x, tgt.y);
  if (tgt.faction === 'enemy' && tgt.ai.mode !== 'hunt' && src?.id === st.pid) {
    tgt.ai.mode = 'hunt';
    const p = getPlayer(st);
    tgt.ai.tx = p.x; tgt.ai.ty = p.y; tgt.ai.timer = BAL.alertTurns;
  }
  if (tgt.hp <= 0) killActor(st, ev, tgt, src, kind, sneak);
  return amount;
}

export function damagePlayer(st: RunState, ev: EventSink, amount: number, cause: string, src: Actor | null = null): number {
  const p = getPlayer(st);
  if (src?.phantom) {
    ev.push({ t: 'dmg', x: p.x, y: p.y, amount, kind: 'phantom' });
    ev.push({ t: 'anim', actor: p.id, anim: 'hurt' });
    ev.msg('msg.phantom_hit', { attacker: `@enemy.${src.def}.name` }, 'hallu');
    return 0;
  }
  const stats = getStats(st);
  if (stats.shield > 0 && st.player.energy >= 3 && amount > 0 && cause !== 'o2' && cause !== 'bleed') {
    const ab = Math.min(stats.shield, amount);
    amount -= ab;
    st.player.energy -= 3;
    ev.fx('shield', p.x, p.y);
  }
  if (amount <= 0) return 0;
  p.hp -= amount;
  st.stats.damageTaken += amount;
  st.player.lastHitBy = cause;
  ev.push({ t: 'dmg', x: p.x, y: p.y, amount, kind: 'hp' });
  ev.push({ t: 'anim', actor: p.id, anim: 'hurt' });
  ev.push({ t: 'shake', power: Math.min(6, 1 + amount / 3) });
  ev.sfx('hurt', p.x, p.y);
  if (src) ev.msg('msg.enemy_hit', { attacker: `@enemy.${src.def}.name`, dmg: amount }, 'danger');
  if (p.hp <= 0) {
    if (st.perks.includes('sv9') && !st.narrative.flags.lastBreathUsed) {
      st.narrative.flags.lastBreathUsed = 1;
      p.hp = 1;
      ev.msg('msg.last_breath', {}, 'good');
      return amount;
    }
    p.hp = 0;
  } else if (p.hp <= 3) {
    st.narrative.flags.closeCall = 1;
  }
  return amount;
}

export function killActor(st: RunState, ev: EventSink, a: Actor, src: Actor | null, kind: string, sneak = false): void {
  if (a.dead) return;
  a.dead = true;
  a.hp = 0;
  const d = enemyDef(a.def);
  ev.push({ t: 'anim', actor: a.id, anim: 'death' });
  ev.fx(d.robot ? 'explode_small' : 'death', a.x, a.y);
  ev.sfx(d.robot ? 'robot_death' : 'eco_death', a.x, a.y);
  if (a.faction !== 'enemy') {
    if (a.faction === 'ally') ev.msg('msg.ally_down', { name: `@enemy.${a.def}.name` }, 'warn');
    if (a.faction === 'npc' && a.npc) {
      st.narrative.flags[`dead_${a.npc}`] = 1;
      ev.msg('msg.npc_dead', { name: `@npc.${a.npc}.name` }, 'danger');
    }
    return;
  }
  const byPlayer = src?.id === st.pid || kind === 'env' || kind === 'vent' || kind === 'push' || kind === 'fire' || kind === 'explosion';
  if (byPlayer && !a.summoned) {
    st.stats.kills++;
    st.stats.killsByDef[a.def] = (st.stats.killsByDef[a.def] ?? 0) + 1;
    if (sneak) st.stats.stealthKills++;
    if (kind === 'vent' || kind === 'push' || kind === 'fire' || kind === 'explosion' || kind === 'env') st.stats.envKills++;
    if (kind === 'fire') st.narrative.flags.fireKill = 1;
    if (kind === 'push') st.narrative.flags.pushKill = 1;
    if (kind === 'explosion' && src === null) st.narrative.flags.barrelKill = 1;
  }
  if (byPlayer) ev.msg(kind === 'vent' ? 'msg.ejected' : 'msg.kill', { target: `@enemy.${a.def}.name` }, 'good');
  seeBestiary(st, ev, a);
  // botín
  if (!a.summoned) {
    const scrap = Math.round(int(st.rng, d.scrap[0], d.scrap[1]) * getStats(st).scrapMult);
    if (scrap > 0 && kind !== 'vent') {
      st.player.scrap += scrap;
      st.stats.scrapEarned += scrap;
      ev.push({ t: 'dmg', x: a.x, y: a.y, amount: scrap, kind: 'scrap' });
    }
    if (kind !== 'vent' && chance(st.rng, d.rank ? 1 : 0.08)) dropLoot(st, a.x, a.y, d.rank ? 2 : 1);
  }
  if (a.carry && kind !== 'vent') st.items.push({ id: st.nextId++, x: a.x, y: a.y, item: { id: a.carry, n: 1 } });
  if (d.abilities.includes('explode') || a.elite === 'inestable') {
    explode(st, ev, a.x, a.y, 1, [Math.round(d.dmg[0] * 0.8), d.dmg[1]], null, d.abilities.includes('breachMaker'));
  }
  if (d.abilities.includes('split') && !a.summoned) {
    for (let k = 0; k < 2; k++) {
      const s = freeSpotNear(st, a.x, a.y, 1);
      if (s) spawnActor(st, a.def, s.x, s.y, { summoned: true, hpScale: 0.4, mode: 'hunt' });
    }
  }
  if (a.boss) onBossDeath(st, ev, a);
}

export function dropLoot(st: RunState, x: number, y: number, n: number): void {
  // se importa de forma perezosa para evitar ciclos
  const pool = lootPool(st);
  for (let k = 0; k < n; k++) {
    const item = pool();
    if (item) st.items.push({ id: st.nextId++, x, y, item: { id: item, n: 1 } });
  }
}

let lootPoolFactory: ((st: RunState) => () => string | null) | null = null;
export function setLootPool(f: (st: RunState) => () => string | null): void {
  lootPoolFactory = f;
}
function lootPool(st: RunState): () => string | null {
  return lootPoolFactory ? lootPoolFactory(st) : () => null;
}

/** Empuja un actor. Puede expulsarlo al vacío, meterlo en el fuego o estamparlo contra la pared. */
export function push(st: RunState, ev: EventSink, a: Actor, dx: number, dy: number, power: number, src: Actor | null): void {
  if (dx === 0 && dy === 0) return;
  const w = a.id === st.pid ? 2 : enemyDef(a.def).weight;
  if (w >= 3 && power < 3) {
    if (a.id !== st.pid) a.status.stun = Math.max(a.status.stun ?? 0, 1);
    return;
  }
  for (let k = 0; k < power; k++) {
    const nx = a.x + dx; const ny = a.y + dy;
    const t = tileAt(st.map, nx, ny);
    if (t === TILE.BREACH || (t === TILE.AIRLOCK && airlockOpen(st, nx, ny))) {
      eject(st, ev, a, src ? 'push' : 'vent');
      return;
    }
    if (t === TILE.WINDOW && w >= 2 && chance(st.rng, 0.35)) {
      breakWindow(st, ev, nx, ny);
      return;
    }
    if (!passable(st.map, nx, ny, { allowVoid: true, flying: true }) || actorAt(st, nx, ny)) {
      a.status.stun = Math.max(a.status.stun ?? 0, BAL.shoveStun);
      if (a.id !== st.pid) damageActor(st, ev, a, 1, src, 'push');
      ev.sfx('thud', a.x, a.y);
      return;
    }
    a.x = nx; a.y = ny;
    ev.push({ t: 'anim', actor: a.id, anim: 'move', dx, dy });
    if (st.map.fire[ny * st.map.w + nx] > 0 && a.id !== st.pid && !enemyDef(a.def).fireImmune) damageActor(st, ev, a, BAL.fireDmg, src, src ? 'push' : 'fire');
    const cable = st.map.props.find((p) => p.kind === 'cable' && p.x === nx && p.y === ny && !p.off);
    if (cable && a.id !== st.pid) { damageActor(st, ev, a, 4, src, 'push'); a.status.stun = 2; ev.fx('arc', nx, ny, { color: '#7af0ff' }); }
    if (a.dead) return;
  }
}

export function airlockOpen(st: RunState, x: number, y: number): boolean {
  const i = y * st.map.w + x;
  for (const d of DIRS) {
    const s = st.map.sec[i + d.y * st.map.w + d.x];
    if (s >= 0 && st.map.sections[s].vent > 0) return true;
  }
  return false;
}

export function eject(st: RunState, ev: EventSink, a: Actor, kind: string): void {
  ev.fx('ejected', a.x, a.y);
  ev.sfx('vacuum', a.x, a.y);
  if (a.id === st.pid) {
    const p = getPlayer(st);
    p.hp = 0;
    st.player.lastHitBy = 'eject';
    st.stats.ejected++;
    return;
  }
  if (enemyDef(a.def).rank) {
    damageActor(st, ev, a, Math.round(a.maxHp * 0.25), null, kind);
    return;
  }
  st.stats.vented++;
  killActor(st, ev, a, null, kind === 'push' ? 'push' : 'vent');
}

export function breakWindow(st: RunState, ev: EventSink, x: number, y: number): void {
  const i = y * st.map.w + x;
  if (st.map.tiles[i] !== TILE.WINDOW) return;
  st.map.tiles[i] = TILE.BREACH;
  ev.sfx('glass', x, y);
  ev.fx('glass', x, y);
  ev.msg('msg.window_break', {}, 'danger');
  ev.push({ t: 'shake', power: 3 });
}

export function ignite(st: RunState, ev: EventSink, x: number, y: number): void {
  const m = st.map;
  if (!inBounds(m, x, y)) return;
  const i = y * m.w + x;
  const s = m.sec[i];
  if (s < 0 || m.sections[s].pressure < BAL.fireMinPressure) return;
  const t = m.tiles[i];
  if (t === TILE.WALL || t === TILE.VOID) return;
  if (m.fire[i] === 0) ev.sfx('ignite', x, y);
  m.fire[i] = Math.max(m.fire[i], int(st.rng, 4, 7));
}

/** Explosión con daño, empuje, fuego y posible brecha en el casco. */
export function explode(st: RunState, ev: EventSink, x: number, y: number, r: number, dmg: [number, number], src: Actor | null, breach = false, traits: WeaponTrait[] = []): void {
  ev.fx(traits.includes('emp') ? 'emp' : 'explosion', x, y, { n: r });
  ev.sfx(traits.includes('emp') ? 'emp' : 'explosion', x, y);
  ev.push({ t: 'shake', power: 4 + r * 2 });
  emitNoise(st, x, y, 14, false);
  const m = st.map;
  for (const a of st.actors.slice()) {
    if (a.dead) continue;
    const d = chebyshev(a.x, a.y, x, y);
    if (d > r) continue;
    let amount = int(st.rng, dmg[0], dmg[1]);
    if (d > 0) amount = Math.round(amount * 0.7);
    if (traits.includes('emp')) {
      if (a.id === st.pid) { st.player.energy = Math.max(0, st.player.energy - 15); continue; }
      const def = enemyDef(a.def);
      if (!def.robot) { amount = Math.round(amount * 0.3); } else if (!a.boss) a.status.stun = 4;
    }
    const kind = src?.id === st.pid ? 'explosion' : 'explosion';
    if (a.id === st.pid) damagePlayer(st, ev, amount, 'explosion');
    else damageActor(st, ev, a, amount, src, kind);
    if (!a.dead && d > 0 && !traits.includes('emp')) push(st, ev, a, Math.sign(a.x - x), Math.sign(a.y - y), 1, src);
  }
  if (!traits.includes('emp')) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx; const ny = y + dy;
        if (!inBounds(m, nx, ny)) continue;
        const t = m.tiles[ny * m.w + nx];
        if (t === TILE.WINDOW) breakWindow(st, ev, nx, ny);
        if (t === TILE.CRACKED) { m.tiles[ny * m.w + nx] = TILE.RUBBLE; ev.msg('msg.wall_breaks', {}, 'good'); }
        if (traits.includes('fire') || chance(st.rng, 0.25)) ignite(st, ev, nx, ny);
        // barriles en cadena
        for (const p of m.props) {
          if (p.kind === 'barrel' && !p.used && p.x === nx && p.y === ny && !(nx === x && ny === y)) {
            p.used = true;
            invalidateProps(m);
            explode(st, ev, nx, ny, 2, [6, 10], null);
          }
        }
      }
    }
    if (breach) {
      // la onda abre el casco si hay una pared exterior cerca
      for (const d of DIRS) {
        const nx = x + d.x; const ny = y + d.y;
        if (tileAt(m, nx, ny) === TILE.WALL && isOuterWall(st, nx, ny)) {
          m.tiles[ny * m.w + nx] = TILE.BREACH;
          ev.msg('msg.hull_breach', {}, 'danger');
          break;
        }
      }
    }
  }
}

export function isOuterWall(st: RunState, x: number, y: number): boolean {
  for (const d of DIRS) {
    const t = tileAt(st.map, x + d.x, y + d.y);
    if (t === TILE.VOID && inBounds(st.map, x + d.x, y + d.y)) return true;
  }
  return false;
}

/** Línea de fuego desde (x0,y0) hasta (x1,y1) que se detiene en obstáculos. */
export function projectilePath(st: RunState, x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const pts = line(x0, y0, x1, y1).slice(1);
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    out.push(p);
    const t = tileAt(st.map, p.x, p.y);
    if (t === TILE.WALL || t === TILE.PILLAR || t === TILE.CRACKED || t === TILE.AIRLOCK) break;
    if (t === TILE.DOOR) {
      const d = st.map.doors[p.y * st.map.w + p.x];
      if (!d || !(d.open || d.broken)) break;
    }
    if (t === TILE.WINDOW) break;
    if (actorAt(st, p.x, p.y)) break;
  }
  return out;
}

export function enemyIsHostileTo(a: Actor, b: Actor): boolean {
  return hostile(a, b);
}

export function giveScrap(st: RunState, n: number): void {
  st.player.scrap += n;
  st.stats.scrapEarned += n;
}

export function pickupStack(st: RunState, ev: EventSink, stack: { id: string; n: number; cursed?: boolean }): boolean {
  if (!addItem(st, stack)) {
    ev.msg('msg.inv_full', {}, 'warn');
    return false;
  }
  return true;
}
