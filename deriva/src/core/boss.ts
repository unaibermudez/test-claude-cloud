import type { RunState, Actor, Telegraph } from './state';
import { TILE } from './state';
import type { EventSink } from './events';
import type { BossPattern } from './content';
import { enemyDef } from '../data/enemies';
import { int, pick, chance } from './rng';
import { getPlayer, spawnActor, freeSpotNear, actorAt } from './actors';
import { damagePlayer, damageActor, ignite, breakWindow, addNoise, killActor } from './combat';
import { passable, inBounds, tileAt } from './map';
import { DIRS, chebyshev, dirIndex } from './geom';
import { getStats } from './rules';

function arenaOf(st: RunState): { x: number; y: number; w: number; h: number } {
  const r = st.map.rooms.find((q) => q.kind === 'boss');
  if (r) return r;
  return { x: 0, y: 0, w: st.map.w, h: st.map.h };
}

export function bossPhaseFor(a: Actor): number {
  const d = enemyDef(a.def);
  const phases = d.boss!.phases;
  const pct = a.hp / a.maxHp;
  let ph = 0;
  for (let i = 0; i < phases.length; i++) if (pct <= phases[i].hpPct) ph = i;
  return ph;
}

export function bossDamageGate(st: RunState, ev: EventSink, a: Actor, amount: number): number {
  if (!a.boss) return amount;
  if (a.boss.shield) {
    ev.msg('msg.boss_shielded', { name: `@enemy.${a.def}.name` }, 'warn');
    ev.fx('shield', a.x, a.y);
    return 0;
  }
  const d = enemyDef(a.def);
  const mech = d.boss?.phases[a.boss.phase]?.mechanic;
  if (mech === 'roots') {
    const brotes = st.actors.filter((x) => !x.dead && x.def === 'brote' && x.summoned).length;
    if (brotes > 0) return Math.max(1, Math.round(amount * 0.5));
  }
  if (a.status.shielded) return Math.max(1, Math.round(amount * 0.5));
  return amount;
}

/** Turno de un jefe o mini-jefe. Devuelve true si actuó. */
export function bossAct(st: RunState, ev: EventSink, a: Actor): boolean {
  const d = enemyDef(a.def);
  const B = d.boss!;
  const bs = a.boss!;
  bs.turn++;
  const ph = bossPhaseFor(a);
  if (ph !== bs.phase) {
    bs.phase = ph;
    bs.cds = [];
    ev.msg(B.phases[ph].msg, {}, 'danger');
    ev.push({ t: 'shake', power: 6 });
    ev.sfx('boss_phase', a.x, a.y);
    ev.fx('phase', a.x, a.y);
    setupMechanic(st, ev, a, B.phases[ph].mechanic);
  }
  const phase = B.phases[bs.phase];
  for (let i = 0; i < phase.patterns.length; i++) bs.cds[i] = Math.max(0, (bs.cds[i] ?? int(st.rng, 0, 2)) - 1);
  const p = getPlayer(st);
  const dist = chebyshev(a.x, a.y, p.x, p.y);
  // ayuda de ÁGORA contra el Coro Pleno
  if (a.def === 'coro_pleno' && bs.turn % 7 === 0) {
    ev.msg('msg.agora_strikes', {}, 'agora');
    ev.fx('arc', a.x, a.y, { color: '#ebc76c' });
    a.hp = Math.max(1, a.hp - Math.round(a.maxHp * 0.04));
  }
  if (a.status.stun) return true;
  const order = phase.patterns.map((_, i) => i);
  const start = bs.turn % order.length;
  for (let k = 0; k < order.length; k++) {
    const i = order[(start + k) % order.length];
    if ((bs.cds[i] ?? 0) > 0) continue;
    const pat = phase.patterns[i];
    if (!applicable(st, a, pat, dist)) continue;
    runPattern(st, ev, a, pat);
    bs.cds[i] = pat.cooldown;
    return true;
  }
  return false; // la IA genérica hará el movimiento/ataque básico
}

function applicable(st: RunState, a: Actor, pat: BossPattern, dist: number): boolean {
  switch (pat.kind) {
    case 'slam': return dist <= 2;
    case 'summon': return st.actors.filter((x) => !x.dead && x.summoned && x.faction === 'enemy').length < 6;
    case 'heal': return a.hp < a.maxHp * 0.9;
    case 'shield': return !a.boss!.shield && !a.status.shielded;
    case 'pull': return dist >= 3;
    case 'charge': case 'line': case 'beam': return dist <= 12;
    case 'teleport': return dist <= 3 || chance(st.rng, 0.3);
    default: return true;
  }
}

function telegraph(st: RunState, a: Actor, tiles: number[], pat: BossPattern, effect?: string): void {
  const uniq = Array.from(new Set(tiles)).filter((i) => {
    const x = i % st.map.w; const y = Math.floor(i / st.map.w);
    return inBounds(st.map, x, y) && passable(st.map, x, y, { flying: true, allowVoid: true, ignoreDoors: true });
  });
  const t: Telegraph = { tiles: uniq, dmg: pat.dmg ?? [3, 5], effect, delay: pat.delay ?? 1, source: a.id, kind: pat.kind };
  st.telegraphs.push(t);
}

function rayTiles(st: RunState, x: number, y: number, dx: number, dy: number, len: number): number[] {
  const out: number[] = [];
  let cx = x; let cy = y;
  for (let k = 0; k < len; k++) {
    cx += dx; cy += dy;
    if (!inBounds(st.map, cx, cy)) break;
    const t = tileAt(st.map, cx, cy);
    if (t === TILE.WALL || t === TILE.PILLAR || t === TILE.CRACKED) break;
    out.push(cy * st.map.w + cx);
  }
  return out;
}

function runPattern(st: RunState, ev: EventSink, a: Actor, pat: BossPattern): void {
  const m = st.map;
  const p = getPlayer(st);
  const W = m.w;
  const dirTo = dirIndex(p.x - a.x, p.y - a.y);
  const dir = DIRS[dirTo < 0 ? 4 : dirTo];
  ev.sfx(`boss_${pat.kind}`, a.x, a.y);
  switch (pat.kind) {
    case 'slam': {
      const tiles: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) tiles.push((a.y + dy) * W + a.x + dx);
      telegraph(st, a, tiles, pat);
      break;
    }
    case 'line': case 'beam': case 'charge': {
      const tiles = rayTiles(st, a.x, a.y, dir.x, dir.y, pat.kind === 'beam' ? 14 : 10);
      // el haz también cubre las casillas adyacentes al eje
      if (pat.kind === 'beam') {
        const perp = DIRS[(dirTo + 2) % 8];
        const extra = tiles.flatMap((i) => [i + perp.y * W + perp.x, i - perp.y * W - perp.x]);
        tiles.push(...extra.filter((_, k) => k % 3 === 0));
      }
      telegraph(st, a, tiles, pat, pat.kind === 'charge' ? 'charge' : undefined);
      ev.msg(`msg.boss_${pat.kind}`, { name: `@enemy.${a.def}.name` }, 'warn');
      break;
    }
    case 'cross': {
      const tiles: number[] = [];
      for (const di of [0, 2, 4, 6]) tiles.push(...rayTiles(st, a.x, a.y, DIRS[di].x, DIRS[di].y, 9));
      telegraph(st, a, tiles, pat);
      break;
    }
    case 'firewave': {
      const tiles: number[] = [];
      for (const di of [1, 3, 5, 7]) tiles.push(...rayTiles(st, a.x, a.y, DIRS[di].x, DIRS[di].y, 9));
      tiles.push(...rayTiles(st, a.x, a.y, dir.x, dir.y, 10));
      telegraph(st, a, tiles, pat, 'fire');
      break;
    }
    case 'ring': {
      const r = pat.radius ?? 3;
      const tiles: number[] = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const c = Math.max(Math.abs(dx), Math.abs(dy));
        if (c >= r - 1 && c <= r) tiles.push((a.y + dy) * W + a.x + dx);
      }
      telegraph(st, a, tiles, pat);
      break;
    }
    case 'rain': case 'quake': {
      const tiles: number[] = [p.y * W + p.x];
      const n = pat.count ?? 8;
      for (let k = 0; k < n * 2 && tiles.length < n; k++) {
        const x = p.x + int(st.rng, -4, 4); const y = p.y + int(st.rng, -4, 4);
        tiles.push(y * W + x);
      }
      telegraph(st, a, tiles, pat);
      if (pat.kind === 'quake') ev.push({ t: 'shake', power: 5 });
      break;
    }
    case 'roots': {
      const tiles: number[] = [p.y * W + p.x];
      const n = pat.count ?? 8;
      for (let k = 0; k < n; k++) tiles.push((p.y + int(st.rng, -2, 2)) * W + p.x + int(st.rng, -2, 2));
      telegraph(st, a, tiles, pat, 'root');
      break;
    }
    case 'cold': case 'gas': {
      const r = pat.radius ?? 3;
      const tiles: number[] = [];
      const cx = chance(st.rng, 0.5) ? p.x : a.x; const cy = cx === p.x ? p.y : a.y;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) tiles.push((cy + dy) * W + cx + dx);
      telegraph(st, a, tiles, { ...pat, dmg: pat.dmg ?? [1, 2] }, 'cold');
      break;
    }
    case 'summon': {
      const n = pat.count ?? 1;
      for (let k = 0; k < n; k++) {
        const s = freeSpotNear(st, a.x, a.y, 4, true);
        if (!s || !pat.summon) break;
        const add = spawnActor(st, pat.summon, s.x, s.y, { summoned: true, mode: 'hunt' });
        add.ai.tx = p.x; add.ai.ty = p.y; add.ai.timer = 20;
        ev.fx('summon', s.x, s.y);
      }
      if (a.def === 'hipnos') {
        const pod = m.props.find((q) => q.kind === 'cryopod' && q.variant === 1 && !q.used);
        if (pod) pod.used = true;
      }
      ev.msg('msg.boss_summon', { name: `@enemy.${a.def}.name` }, 'warn');
      break;
    }
    case 'phantoms': {
      const n = pat.count ?? 3;
      const pool = ['sujeto', 'reflejo', 'eco_errante', 'sin_rostro', 'coro_menor'];
      for (let k = 0; k < n; k++) {
        const s = freeSpotNear(st, p.x, p.y, 4, true);
        if (!s) break;
        spawnActor(st, pick(st.rng, pool), s.x, s.y, { phantom: true, summoned: true, mode: 'hunt', ttl: 25 });
      }
      addNoise(st, ev, 4);
      ev.msg('msg.boss_phantoms', {}, 'hallu');
      break;
    }
    case 'teleport': {
      const ar = arenaOf(st);
      for (let k = 0; k < 20; k++) {
        const x = ar.x + int(st.rng, 1, ar.w - 2); const y = ar.y + int(st.rng, 1, ar.h - 2);
        if (chebyshev(x, y, p.x, p.y) >= 5 && passable(m, x, y, { flying: true, allowVoid: true }) && !actorAt(st, x, y)) {
          ev.fx('teleport', a.x, a.y);
          a.x = x; a.y = y;
          ev.fx('teleport', x, y);
          break;
        }
      }
      break;
    }
    case 'shield': {
      a.status.shielded = 5;
      ev.msg('msg.boss_shield_up', { name: `@enemy.${a.def}.name` }, 'warn');
      ev.fx('shield', a.x, a.y);
      break;
    }
    case 'heal': {
      const adds = st.actors.filter((x) => !x.dead && x.summoned && x.faction === 'enemy' && !x.phantom).length;
      const amount = Math.round(a.maxHp * (0.04 + 0.02 * adds));
      a.hp = Math.min(a.maxHp, a.hp + amount);
      ev.push({ t: 'dmg', x: a.x, y: a.y, amount, kind: 'heal' });
      ev.msg('msg.boss_heal', { name: `@enemy.${a.def}.name` }, 'warn');
      break;
    }
    case 'mirror': {
      // repite la última clase de ataque del jugador
      const ranged = !!st.player.ranged;
      const tiles = ranged ? rayTiles(st, a.x, a.y, dir.x, dir.y, 10) : (() => {
        const t: number[] = [];
        for (const d of DIRS) t.push((a.y + d.y) * W + a.x + d.x);
        return t;
      })();
      telegraph(st, a, tiles, { ...pat, dmg: pat.dmg ?? [5, 8] });
      ev.msg('msg.boss_mirror', {}, 'hallu');
      break;
    }
    case 'darkness': {
      const s = m.sec[a.y * W + a.x];
      if (s >= 0) {
        m.sections[s].dark = true;
        st.narrative.flags.darkTimer = 8;
        st.narrative.flags.darkSec = s;
      }
      ev.msg('msg.boss_darkness', {}, 'warn');
      ev.sfx('blackout');
      break;
    }
    case 'drain': {
      if (chebyshev(a.x, a.y, p.x, p.y) <= 7) {
        st.player.o2 = Math.max(0, st.player.o2 - 8);
        st.player.energy = Math.max(0, st.player.energy - 8);
        ev.msg('msg.boss_drain', { name: `@enemy.${a.def}.name` }, 'danger');
        ev.fx('drain', p.x, p.y, { tx: a.x, ty: a.y });
      }
      break;
    }
    case 'spores': {
      const r = pat.radius ?? 3;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = p.x + dx; const y = p.y + dy;
        if (inBounds(m, x, y) && m.sec[y * W + x] >= 0) m.gas[y * W + x] = Math.max(m.gas[y * W + x], 7);
      }
      ev.msg('msg.boss_spores', {}, 'warn');
      break;
    }
    case 'pull': {
      if (getStats(st).magboots) { ev.msg('msg.pull_resist', {}, 'good'); break; }
      for (let k = 0; k < 2; k++) {
        const nx = p.x + Math.sign(a.x - p.x); const ny = p.y + Math.sign(a.y - p.y);
        if (!passable(m, nx, ny, { allowVoid: true }) || actorAt(st, nx, ny)) break;
        p.x = nx; p.y = ny;
      }
      ev.msg('msg.boss_pull', { name: `@enemy.${a.def}.name` }, 'danger');
      ev.fx('pull', p.x, p.y, { tx: a.x, ty: a.y });
      break;
    }
    case 'emp': {
      st.player.energy = Math.max(0, st.player.energy - 20);
      st.player.flashlight = false;
      for (const x of st.actors) if (x.faction === 'ally' && enemyDef(x.def).robot) x.status.stun = 3;
      ev.fx('emp', a.x, a.y, { n: 6 });
      ev.msg('msg.boss_emp', {}, 'danger');
      break;
    }
    case 'vent': {
      let broken = 0;
      for (let i = 0; i < m.tiles.length && broken < 2; i++) {
        if (m.tiles[i] === TILE.WINDOW && chance(st.rng, 0.5)) { breakWindow(st, ev, i % W, Math.floor(i / W)); broken++; }
      }
      if (broken === 0) ev.msg('msg.boss_vent_fail', {}, 'info');
      break;
    }
    case 'scream': {
      const r = pat.radius ?? 4;
      ev.fx('scream', a.x, a.y, { n: r });
      if (chebyshev(a.x, a.y, p.x, p.y) <= r) {
        addNoise(st, ev, 6);
        p.status.stun = Math.max(p.status.stun ?? 0, 1);
        damagePlayer(st, ev, int(st.rng, (pat.dmg ?? [1, 2])[0], (pat.dmg ?? [1, 2])[1]), a.def, a);
        ev.msg('msg.boss_scream', { name: `@enemy.${a.def}.name` }, 'danger');
      }
      break;
    }
  }
}

function setupMechanic(st: RunState, ev: EventSink, a: Actor, mech: string | undefined): void {
  if (!mech) return;
  const m = st.map;
  if (mech === 'shieldTerminals' || mech === 'coolant') {
    a.boss!.shield = true;
    for (const p of m.props) if (p.kind === 'terminal' && p.label === 'boss') { p.hacked = false; p.lockout = 0; }
    ev.msg(mech === 'coolant' ? 'msg.mech_coolant' : 'msg.mech_shield', {}, 'warn');
  } else if (mech === 'darkArena') {
    const s = m.sec[a.y * m.w + a.x];
    if (s >= 0) m.sections[s].dark = true;
    ev.msg('msg.mech_dark', {}, 'warn');
  } else if (mech === 'vacuum') {
    ev.msg('msg.mech_vacuum', {}, 'warn');
  } else if (mech === 'roots') {
    ev.msg('msg.mech_roots', {}, 'warn');
  } else if (mech === 'mirror') {
    ev.msg('msg.mech_mirror', {}, 'hallu');
  } else if (mech === 'pods') {
    ev.msg('msg.mech_pods', {}, 'warn');
  }
}

/** Al hackear un terminal de la arena: cae el escudo del jefe durante unos turnos. */
export function bossTerminalHacked(st: RunState, ev: EventSink): void {
  const b = st.actors.find((x) => !x.dead && x.boss && x.boss.shield);
  if (!b) return;
  b.boss!.shield = false;
  b.status.vulnerable = 10;
  ev.msg('msg.boss_shield_down', { name: `@enemy.${b.def}.name` }, 'good');
  ev.sfx('shield_down', b.x, b.y);
}

/** Avance de avisos: resuelve los que llegan a cero. Se llama una vez por turno de entorno. */
export function tickTelegraphs(st: RunState, ev: EventSink): void {
  const m = st.map;
  const keep: Telegraph[] = [];
  for (const t of st.telegraphs) {
    if (t.delay > 0) { t.delay--; keep.push(t); continue; }
    const src = st.actors.find((x) => x.id === t.source && !x.dead);
    if (!src) continue;
    if (t.effect === 'charge') {
      // el jefe recorre la línea
      let last = { x: src.x, y: src.y };
      for (const i of t.tiles) {
        const x = i % m.w; const y = Math.floor(i / m.w);
        const occ = actorAt(st, x, y);
        if (occ && occ !== src) break;
        if (!passable(m, x, y, { flying: true, allowVoid: true })) break;
        last = { x, y };
      }
      src.x = last.x; src.y = last.y;
      ev.push({ t: 'shake', power: 4 });
    }
    for (const i of t.tiles) {
      const x = i % m.w; const y = Math.floor(i / m.w);
      ev.fx(t.effect === 'fire' ? 'firehit' : t.effect === 'cold' ? 'cold' : t.effect === 'root' ? 'roots' : 'impact', x, y);
      if (t.effect === 'fire') ignite(st, ev, x, y);
      const victim = actorAt(st, x, y);
      if (!victim || victim === src || victim.faction === 'enemy') continue;
      const dmg = int(st.rng, t.dmg[0], t.dmg[1]);
      if (victim.id === st.pid) {
        damagePlayer(st, ev, dmg, src.def, src);
        if (t.effect === 'root') victim.status.rooted = 2;
        if (t.effect === 'cold') victim.status.slow = 3;
      } else {
        damageActor(st, ev, victim, dmg, src, 'hit');
      }
    }
  }
  st.telegraphs = keep;
}

export function onBossDeath(st: RunState, ev: EventSink, a: Actor): void {
  const d = enemyDef(a.def);
  const B = d.boss!;
  ev.msg(B.death, {}, 'lore');
  ev.push({ t: 'shake', power: 8 });
  ev.push({ t: 'bossbar', actor: null });
  st.telegraphs = st.telegraphs.filter((t) => t.source !== a.id);
  for (const x of st.actors) {
    if (!x.dead && x.summoned && x.faction === 'enemy') killActor(st, ev, x, null, 'hit');
  }
  if (d.rank === 'boss') {
    st.stats.bosses++;
    st.bossesDefeated.push(a.def);
    for (const k of Object.keys(st.map.doors)) {
      const door = st.map.doors[Number(k)];
      if (door.lock === 'boss') { door.lock = null; door.open = true; }
    }
    ev.msg('msg.boss_door_open', {}, 'good');
  } else {
    st.stats.minis++;
  }
  if (B.flag) st.narrative.flags[B.flag] = 1;
  st.narrative.flags[`killed_${a.def}`] = 1;
  for (const id of B.drop ?? []) st.items.push({ id: st.nextId++, x: a.x, y: a.y, item: { id, n: 1 } });
  if (a.def === 'cocito') st.narrative.flags.truth_known = 1;
}
