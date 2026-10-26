/** Meta-progresión persistente entre partidas: Memorias, árbol, archivo, bestiario, logros, estadísticas. */
import type { RunState, MetaSnapshot, Pronoun, GameMode } from './state';
import type { NpcId } from './content';
import { UPGRADES, upgradeDef } from '../data/upgrades';
import { CLASSES } from '../data/classes';
import { ACHIEVEMENTS } from '../data/achievements';
import { ENDINGS, MAIN_ENDINGS } from '../data/endings';
import { LOG_IDS } from '../data/logs';
import { BESTIARY_IDS } from '../data/enemies';
import { BAL } from '../data/balance';
import { IMPLANT_SLOTS } from './content';

export const META_VERSION = 2;

export interface RunSummary {
  run: number;
  classId: string;
  mode: GameMode;
  seed: string;
  zone: number;
  floor: number;
  floors: number;
  turns: number;
  kills: number;
  cause: string;
  ending: string | null;
  victory: boolean;
  memorias: number;
  newLogs: number;
  score: number;
  name: string;
  date: string;
}

export interface MetaState {
  version: number;
  memorias: number;
  memoriasTotal: number;
  upgrades: string[];
  logs: string[];
  bestiary: Record<string, { seen: number; kills: number }>;
  endings: string[];
  achievements: Record<string, number>;
  arcs: Record<NpcId, number>;
  fates: Record<string, string>;
  flags: Record<string, number>;
  stats: {
    runs: number; deaths: number; victories: number; kills: number; turns: number; floors: number;
    bestFloor: number; bosses: number; hacks: number; vented: number; deepestZone: number; playMs: number;
    stealthKills: number; scrap: number;
  };
  daily: Record<string, { score: number; floor: number; ending: string | null }>;
  profile: { name: string; pronoun: Pronoun; lastClass: string; lastMode: GameMode };
  introSeen: boolean;
  history: RunSummary[];
  classesPlayed: string[];
}

export function newMeta(): MetaState {
  return {
    version: META_VERSION, memorias: 0, memoriasTotal: 0, upgrades: [], logs: [], bestiary: {}, endings: [], achievements: {},
    arcs: { celia: 0, tomas: 0, bruno: 0, solis: 0, lenz: 0, faro: 0 }, fates: {}, flags: {},
    stats: { runs: 0, deaths: 0, victories: 0, kills: 0, turns: 0, floors: 0, bestFloor: 0, bosses: 0, hacks: 0, vented: 0, deepestZone: 0, playMs: 0, stealthKills: 0, scrap: 0 },
    daily: {}, profile: { name: '', pronoun: 'elle', lastClass: 'tecnico', lastMode: 'historia' }, introSeen: false, history: [], classesPlayed: [],
  };
}

export function snapshotFor(meta: MetaState): MetaSnapshot {
  return {
    deaths: meta.stats.deaths, arcs: { ...meta.arcs }, flags: { ...meta.flags }, logs: meta.logs.slice(), endings: meta.endings.slice(),
    runs: meta.stats.runs, fates: { ...meta.fates },
  };
}

function reqOk(meta: MetaState, r: string): boolean {
  if (r.startsWith('flag:')) return !!meta.flags[r.slice(5)];
  if (r.startsWith('arc:')) {
    const [, npc, n] = r.split(':');
    return (meta.arcs[npc as NpcId] ?? 0) >= Number(n);
  }
  return meta.upgrades.includes(r);
}

export function upgradeState(meta: MetaState, id: string): 'owned' | 'available' | 'locked' | 'expensive' {
  const u = upgradeDef(id);
  if (!u) return 'locked';
  if (meta.upgrades.includes(id)) return 'owned';
  if (!u.req.every((r) => reqOk(meta, r))) return 'locked';
  if (meta.memorias < u.cost) return 'expensive';
  return 'available';
}

export function missingReqs(meta: MetaState, id: string): string[] {
  const u = upgradeDef(id);
  if (!u) return [];
  return u.req.filter((r) => !reqOk(meta, r));
}

export function buyUpgrade(meta: MetaState, id: string): boolean {
  if (upgradeState(meta, id) !== 'available') return false;
  const u = upgradeDef(id)!;
  meta.memorias -= u.cost;
  meta.upgrades.push(id);
  return true;
}

export function classUnlocked(meta: MetaState, classId: string): boolean {
  const c = CLASSES.find((x) => x.id === classId);
  if (!c) return false;
  if (!c.unlock) return true;
  if (c.unlock.startsWith('flag:')) return !!meta.flags[c.unlock.slice(5)];
  return meta.upgrades.includes(c.unlock);
}

export function startZones(meta: MetaState): number[] {
  const z = [1];
  for (const id of meta.upgrades) {
    const u = upgradeDef(id);
    if (u?.startZone) z.push(u.startZone);
  }
  return Array.from(new Set(z)).sort();
}

export function modeUnlocked(meta: MetaState, mode: GameMode): boolean {
  if (mode === 'pesadilla') return meta.endings.some((e) => MAIN_ENDINGS.includes(e));
  return true;
}

export function runScore(run: RunState): number {
  return run.stats.floors * 100 + run.stats.kills * 5 + run.stats.bosses * 250 + run.stats.minis * 80 + (run.over?.victory ? 1500 : 0) + run.narrative.logsFound.length * 10;
}

export function memoriasFor(run: RunState): number {
  const s = run.stats;
  let m = BAL.memoriasPerFloor * s.floors + BAL.memoriasMini * s.minis + BAL.memoriasBoss * s.bosses + BAL.memoriasLog * s.logsNew + Math.floor(s.kills / BAL.memoriasPerKills);
  m += run.narrative.flags.memoriasBonus ?? 0;
  const end = run.over?.ending ? ENDINGS.find((e) => e.id === run.over!.ending) : null;
  if (end) m += end.memorias;
  if (run.opts.mode === 'dificil') m = Math.round(m * 1.25);
  if (run.opts.mode === 'pesadilla') m = Math.round(m * 1.5);
  return Math.max(1, m);
}

/** Integra el resultado de una partida terminada (muerte o final) en la meta. */
export function finishRun(meta: MetaState, run: RunState, playMs = 0): { summary: RunSummary; achievements: string[] } {
  const snap = run.metaSnapshot;
  const mem = memoriasFor(run);
  meta.memorias += mem;
  meta.memoriasTotal += mem;
  const newLogs = run.narrative.logsFound.filter((l) => !meta.logs.includes(l));
  for (const l of newLogs) meta.logs.push(l);
  // bestiario
  for (const [k, v] of Object.entries(run.narrative.flags)) {
    if (!k.startsWith('seen_') || !v) continue;
    const id = k.slice(5);
    const e = meta.bestiary[id] ?? { seen: 0, kills: 0 };
    e.seen++;
    meta.bestiary[id] = e;
  }
  for (const [id, n] of Object.entries(run.stats.killsByDef)) {
    const e = meta.bestiary[id] ?? { seen: 1, kills: 0 };
    e.kills += n;
    meta.bestiary[id] = e;
  }
  // narrativa persistente
  for (const k of Object.keys(snap.arcs) as NpcId[]) meta.arcs[k] = Math.max(meta.arcs[k] ?? 0, snap.arcs[k] ?? 0);
  Object.assign(meta.fates, snap.fates);
  for (const [k, v] of Object.entries(snap.flags)) meta.flags[k] = v;
  const persistentRunFlags = ['boss_hipnos', 'boss_demeter', 'boss_flegetonte', 'boss_cocito', 'boss_final', 'boss_aqueronte', 'hull_done'];
  for (const f of persistentRunFlags) if (run.narrative.flags[f]) meta.flags[f] = 1;
  if (run.narrative.flags.truth_known) meta.flags.truth_seen = 1;
  // finales
  const ending = run.over?.ending ?? null;
  if (ending && !meta.endings.includes(ending)) meta.endings.push(ending);
  if (ending) meta.flags[`ending_${ending}`] = 1;
  if (ending === 'olvido') meta.flags.olvido_seen = 1;
  // estadísticas
  const s = meta.stats;
  s.runs++;
  if (!run.over?.victory) s.deaths++;
  else s.victories++;
  s.kills += run.stats.kills;
  s.turns += run.stats.turns;
  s.floors += run.stats.floors;
  s.bestFloor = Math.max(s.bestFloor, run.floorNo);
  s.bosses += run.stats.bosses;
  s.hacks += run.stats.hacks;
  s.vented += run.stats.vented;
  s.deepestZone = Math.max(s.deepestZone, ...run.visitedZones);
  s.playMs += playMs;
  s.stealthKills += run.stats.stealthKills;
  s.scrap += run.stats.scrapEarned;
  if (!meta.classesPlayed.includes(run.player.classId)) meta.classesPlayed.push(run.player.classId);
  meta.profile.lastClass = run.player.classId;
  meta.profile.lastMode = run.opts.mode;
  const score = runScore(run);
  const summary: RunSummary = {
    run: s.runs, classId: run.player.classId, mode: run.opts.mode, seed: run.seed, zone: run.zone, floor: run.map.floor,
    floors: run.stats.floors, turns: run.stats.turns, kills: run.stats.kills, cause: run.over?.cause ?? 'abandon', ending,
    victory: !!run.over?.victory, memorias: mem, newLogs: newLogs.length, score, name: run.player.name, date: run.narrative.flags.dateKey ? String(run.narrative.flags.dateKey) : '',
  };
  meta.history.unshift(summary);
  meta.history = meta.history.slice(0, 25);
  if (run.opts.mode === 'diario') {
    const key = run.seed;
    const prev = meta.daily[key];
    if (!prev || prev.score < score) meta.daily[key] = { score, floor: run.floorNo, ending };
  }
  const achievements = checkAchievements(meta, run);
  return { summary, achievements };
}

function unlock(meta: MetaState, id: string, out: string[]): void {
  if (meta.achievements[id]) return;
  if (!ACHIEVEMENTS.some((a) => a.id === id)) return;
  meta.achievements[id] = meta.stats.runs || 1;
  out.push(id);
}

/** Comprueba logros. Si se pasa la partida, también los de la partida en curso. */
export function checkAchievements(meta: MetaState, run?: RunState): string[] {
  const out: string[] = [];
  const f = meta.flags;
  if (meta.stats.floors >= 1 || (run && run.stats.floors >= 1)) unlock(meta, 'first_steps', out);
  if (f.boss_hipnos) unlock(meta, 'zone1', out);
  if (f.boss_demeter) unlock(meta, 'zone2', out);
  if (f.boss_flegetonte) unlock(meta, 'zone3', out);
  if (f.boss_cocito) unlock(meta, 'zone4', out);
  if (f.boss_final) unlock(meta, 'zone5', out);
  if (f.hull_done) unlock(meta, 'hull', out);
  for (const e of meta.endings) unlock(meta, MAIN_ENDINGS.includes(e) ? `end_${e}` : `death_${e}`, out);
  if (meta.stats.deaths >= 1) unlock(meta, 'first_death', out);
  if (meta.stats.deaths >= 10) unlock(meta, 'deaths10', out);
  if (meta.logs.length >= 10) unlock(meta, 'logs10', out);
  if (meta.logs.length >= 33) unlock(meta, 'logs33', out);
  if (meta.logs.length >= LOG_IDS.length) unlock(meta, 'logs66', out);
  const known = Object.keys(meta.bestiary).filter((k) => BESTIARY_IDS.includes(k)).length;
  if (known >= 20) unlock(meta, 'bestiary20', out);
  if (known >= BESTIARY_IDS.length) unlock(meta, 'bestiary_all', out);
  if (meta.stats.vented >= 1) unlock(meta, 'vent_kill', out);
  if (meta.stats.vented >= 5) unlock(meta, 'vent5', out);
  if (meta.stats.stealthKills >= 10) unlock(meta, 'stealth10', out);
  if (meta.stats.hacks >= 10) unlock(meta, 'hacker10', out);
  if (CLASSES.every((c) => meta.classesPlayed.includes(c.id))) unlock(meta, 'all_classes', out);
  if (meta.upgrades.length >= 25) unlock(meta, 'upgrades25', out);
  if (meta.upgrades.length >= UPGRADES.length) unlock(meta, 'upgrades_all', out);
  if (meta.flags.celia_saved) unlock(meta, 'celia_saved', out);
  if (meta.flags.tomas_pods) unlock(meta, 'tomas_pods', out);
  if (meta.flags.bruno_voice) unlock(meta, 'bruno_voice', out);
  if (meta.flags.solis_ally) unlock(meta, 'solis_ally', out);
  if (meta.flags.lenz_key) unlock(meta, 'lenz_key', out);
  if (meta.flags.faro_met) unlock(meta, 'faro_meet', out);
  if (Object.keys(meta.daily).length > 0) unlock(meta, 'daily', out);
  if (meta.stats.scrap >= 500) unlock(meta, 'rich', out);
  if (run) {
    const rf = run.narrative.flags;
    if (rf.pacifistFloor) unlock(meta, 'pacifist', out);
    if (rf.pushKill) unlock(meta, 'push_kill', out);
    if (rf.fireKill) unlock(meta, 'fire_kill', out);
    if (run.stats.phantomsHit > 0) unlock(meta, 'phantom', out);
    if (rf.collapsed) unlock(meta, 'collapse', out);
    if ((rf.maxTrust ?? run.narrative.trust) >= 80) unlock(meta, 'trust80', out);
    if ((rf.minTrust ?? run.narrative.trust) <= 10) unlock(meta, 'trust10', out);
    if (run.opts.mode === 'pesadilla' && run.stats.floors >= 1) unlock(meta, 'nightmare', out);
    if (IMPLANT_SLOTS.every((k) => run.player.implants[k]) || rf.implantsFull) unlock(meta, 'implants_full', out);
    if ((rf.crafted ?? 0) >= 5) unlock(meta, 'craft5', out);
    if (rf.closeCall && (run.over?.victory || run.stats.floors > 0)) unlock(meta, 'close_call', out);
  }
  return out;
}

export { ENDINGS };
