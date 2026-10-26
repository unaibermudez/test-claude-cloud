import type { RunState, Actor, Faction } from './state';
import type { EventSink } from './events';
import { enemyDef } from '../data/enemies';
import { BAL } from '../data/balance';
import { chance, pick, int } from './rng';
import { passable } from './map';
import { DIRS, chebyshev } from './geom';

export function uid(st: RunState): number {
  return st.nextId++;
}

export function actorAt(st: RunState, x: number, y: number): Actor | undefined {
  for (const a of st.actors) if (!a.dead && a.x === x && a.y === y) return a;
  return undefined;
}

export function getPlayer(st: RunState): Actor {
  return st.actors.find((a) => a.id === st.pid)!;
}

export function hostile(a: Actor, b: Actor): boolean {
  if (a.faction === 'npc' || b.faction === 'npc') return false;
  const sideA = a.faction === 'enemy' ? 'e' : 'p';
  const sideB = b.faction === 'enemy' ? 'e' : 'p';
  return sideA !== sideB;
}

export function hpMult(st: RunState): number {
  let m = 1 + BAL.enemyScaleHp * (st.map.floor - 1);
  if (st.opts.mode === 'dificil') m *= BAL.hardHp;
  if (st.opts.mode === 'pesadilla') m *= BAL.nightmareHp;
  return m;
}

export function dmgMult(st: RunState, a: Actor): number {
  let m = 1;
  if (a.faction === 'enemy') {
    m *= BAL.enemyDmg;
    if (st.opts.mode === 'dificil') m *= BAL.hardDmg;
    if (st.opts.mode === 'pesadilla') m *= BAL.nightmareDmg;
    if (a.elite === 'resonante' || a.elite === 'voraz') m *= 1.15;
    const rank = enemyDef(a.def).rank;
    if (rank === 'boss') m *= BAL.bossDmg;
    else if (rank === 'mini') m *= BAL.miniDmg;
  }
  return m;
}

export interface SpawnOpts {
  faction?: Faction;
  elite?: string;
  phantom?: boolean;
  summoned?: boolean;
  mode?: Actor['ai']['mode'];
  hpScale?: number;
  ttl?: number;
}

export function spawnActor(st: RunState, def: string, x: number, y: number, o: SpawnOpts = {}): Actor {
  const d = enemyDef(def);
  let hp = d.hp;
  if ((o.faction ?? 'enemy') === 'enemy' && !d.rank) hp = Math.round(hp * hpMult(st));
  if (d.rank === 'boss') hp = Math.round(hp * BAL.bossHp);
  if (d.rank === 'mini') hp = Math.round(hp * BAL.miniHp);
  if (d.rank && st.opts.mode === 'dificil') hp = Math.round(hp * 1.15);
  if (d.rank && st.opts.mode === 'pesadilla') hp = Math.round(hp * 1.25);
  if (o.elite === 'resonante') hp = Math.round(hp * 1.5);
  if (o.elite === 'blindado' || o.elite === 'voraz') hp = Math.round(hp * 1.2);
  if (o.hpScale) hp = Math.max(1, Math.round(hp * o.hpScale));
  const a: Actor = {
    id: uid(st), def, x, y, hp, maxHp: hp, ap: int(st.rng, 0, 60), faction: o.faction ?? 'enemy',
    ai: { mode: o.mode ?? (d.behavior === 'ambush' ? 'dormant' : chance(st.rng, 0.45) ? 'patrol' : 'idle'), tx: x, ty: y, timer: 0, cd: {}, homeX: x, homeY: y },
    status: {}, facing: 4,
  };
  if (o.elite) a.elite = o.elite;
  if (o.phantom) a.phantom = true;
  if (o.summoned) a.summoned = true;
  if (o.ttl) a.ttl = o.ttl;
  if (d.rank) a.boss = { phase: 0, turn: 0, cds: [], shield: false, enraged: false };
  st.actors.push(a);
  return a;
}

export function actorSpeed(st: RunState, a: Actor): number {
  const d = enemyDef(a.def);
  let s = d.speed;
  if (a.elite === 'veloz') s += 40;
  if (a.status.slow) s *= 0.5;
  if (a.status.haste) s *= 1.5;
  if (a.boss) {
    const ph = d.boss?.phases[a.boss.phase];
    if (ph?.speedBonus) s += ph.speedBonus;
  }
  if (st.opts.mode === 'pesadilla' && a.faction === 'enemy') s += 10;
  return s;
}

export function actorArmor(a: Actor): number {
  const d = enemyDef(a.def);
  return d.armor + (a.elite === 'blindado' ? 2 : 0) + (a.status.shielded ? 3 : 0);
}

/** Busca una casilla libre cercana. */
export function freeSpotNear(st: RunState, x: number, y: number, maxR = 3, flying = false): { x: number; y: number } | null {
  for (let r = 1; r <= maxR; r++) {
    const cands: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx; const ny = y + dy;
        if (!passable(st.map, nx, ny, { flying })) continue;
        if (actorAt(st, nx, ny)) continue;
        cands.push({ x: nx, y: ny });
      }
    }
    if (cands.length) return pick(st.rng, cands);
  }
  return null;
}

export function adjacentActors(st: RunState, x: number, y: number): Actor[] {
  const out: Actor[] = [];
  for (const d of DIRS) {
    const a = actorAt(st, x + d.x, y + d.y);
    if (a) out.push(a);
  }
  return out;
}

export function enemiesNear(st: RunState, x: number, y: number, r: number): Actor[] {
  return st.actors.filter((a) => !a.dead && a.faction === 'enemy' && chebyshev(a.x, a.y, x, y) <= r);
}

export function seeBestiary(st: RunState, ev: EventSink, a: Actor): void {
  if (a.phantom) return;
  const key = `seen_${a.def}`;
  if (!st.narrative.flags[key]) {
    st.narrative.flags[key] = 1;
    ev.push({ t: 'bestiary', id: a.def });
  }
}
