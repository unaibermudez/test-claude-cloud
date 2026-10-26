import type { Mods } from './content';
import { IMPLANT_SLOTS } from './content';
import type { RunState, ItemStack } from './state';
import { classDef } from '../data/classes';
import { itemDef } from '../data/items';
import { upgradeDef } from '../data/upgrades';
import { BAL } from '../data/balance';

export interface Stats {
  maxHp: number; maxO2: number; maxEnergy: number; o2Mult: number; energyMult: number; sight: number;
  nightVision: boolean; armor: number; evasion: number; acc: number; melee: number; ranged: number;
  moveCost: number; noiseMult: number; hack: number; radResist: number; fireResist: number; mentalMult: number;
  magboots: boolean; regen: number; energyRegen: number; crit: number; healMult: number; light: number;
  scrapMult: number; seeHidden: boolean; noisePerTurn: number; migraine: number; stealthKill: number;
  vacuum: number; pushPower: number; shield: number; thermal: boolean; sense: number; truesight: boolean;
}

function baseStats(): Stats {
  return {
    maxHp: 30, maxO2: 100, maxEnergy: 60, o2Mult: 1, energyMult: 1, sight: BAL.playerSight, nightVision: false,
    armor: 0, evasion: 5, acc: 0, melee: 0, ranged: 0, moveCost: 100, noiseMult: 1, hack: 0, radResist: 0,
    fireResist: 0, mentalMult: 1, magboots: false, regen: 0, energyRegen: 0, crit: BAL.critChance, healMult: 1,
    light: 0, scrapMult: 1, seeHidden: false, noisePerTurn: 0, migraine: 0, stealthKill: 1, vacuum: 0,
    pushPower: 0, shield: 0, thermal: false, sense: 0, truesight: false,
  };
}

export function applyMods(s: Stats, m: Mods): void {
  if (m.maxHp) s.maxHp += m.maxHp;
  if (m.maxO2) s.maxO2 += m.maxO2;
  if (m.maxEnergy) s.maxEnergy += m.maxEnergy;
  if (m.o2Mult) s.o2Mult *= m.o2Mult;
  if (m.energyMult) s.energyMult *= m.energyMult;
  if (m.sight) s.sight += m.sight;
  if (m.nightVision) s.nightVision = true;
  if (m.armor) s.armor += m.armor;
  if (m.evasion) s.evasion += m.evasion;
  if (m.acc) s.acc += m.acc;
  if (m.melee) s.melee += m.melee;
  if (m.ranged) s.ranged += m.ranged;
  if (m.moveCost) s.moveCost += m.moveCost;
  if (m.noiseMult) s.noiseMult *= m.noiseMult;
  if (m.hack) s.hack += m.hack;
  if (m.radResist) s.radResist = 1 - (1 - s.radResist) * (1 - m.radResist);
  if (m.fireResist) s.fireResist = 1 - (1 - s.fireResist) * (1 - m.fireResist);
  if (m.mentalMult) s.mentalMult *= m.mentalMult;
  if (m.magboots) s.magboots = true;
  if (m.regen) s.regen = s.regen === 0 ? m.regen : Math.min(s.regen, m.regen);
  if (m.energyRegen) s.energyRegen += m.energyRegen;
  if (m.crit) s.crit += m.crit / 100;
  if (m.healMult) s.healMult *= m.healMult;
  if (m.light) s.light += m.light;
  if (m.scrapMult) s.scrapMult *= m.scrapMult;
  if (m.seeHidden) s.seeHidden = true;
  if (m.noisePerTurn) s.noisePerTurn += m.noisePerTurn;
  if (m.migraine) s.migraine += m.migraine;
  if (m.stealthKill) s.stealthKill *= m.stealthKill;
  if (m.vacuum) s.vacuum = 1 - (1 - s.vacuum) * (1 - m.vacuum);
  if (m.pushPower) s.pushPower += m.pushPower;
  if (m.shield) s.shield += m.shield;
  if (m.thermal) s.thermal = true;
  if (m.sense) s.sense = Math.max(s.sense, m.sense);
}

export function getStats(st: RunState): Stats {
  const s = baseStats();
  const cls = classDef(st.player.classId);
  s.maxHp = cls.hp;
  s.maxO2 = cls.o2;
  s.maxEnergy = cls.energy;
  applyMods(s, cls.mods);
  for (const id of st.perks) {
    const u = upgradeDef(id);
    if (u?.mods) applyMods(s, u.mods);
  }
  for (const slot of IMPLANT_SLOTS) {
    const imp = st.player.implants[slot];
    if (!imp) continue;
    const d = itemDef(imp.id);
    if (d.implant) applyMods(s, d.implant.mods);
    if (imp.id === 'o_espectro') s.truesight = true;
    if (imp.cursed) { s.migraine += 0.01; s.noisePerTurn += 0.02; }
  }
  const status = st.actors.find((a) => a.id === st.pid)?.status ?? {};
  if (status.rage) { s.melee += 3; s.evasion -= 10; }
  if (status.haste) s.moveCost -= 40;
  if (status.radshield) s.radResist = 1 - (1 - s.radResist) * 0.2;
  if (st.player.suit) s.vacuum = 1 - (1 - s.vacuum) * (1 - BAL.suitVacuum);
  if (st.player.suit) s.magboots = true;
  if (st.opts.generousO2) s.o2Mult *= BAL.generousO2;
  if (st.opts.mode === 'pesadilla') { s.o2Mult *= 1.25; s.maxHp -= 4; }
  if (st.opts.mode === 'dificil') { s.o2Mult *= 1.1; }
  s.moveCost = Math.max(50, s.moveCost);
  s.maxHp = Math.max(8, Math.round(s.maxHp + (st.narrative.flags.bonusMaxHp ?? 0)));
  s.evasion = Math.max(0, s.evasion);
  return s;
}

export function hasPerkFlag(st: RunState, flag: string): boolean {
  return st.perks.some((id) => upgradeDef(id)?.flag === flag);
}

export function stackName(s: ItemStack): string {
  return s.id;
}

/** Cuenta objetos del inventario. */
export function countItem(st: RunState, id: string): number {
  let n = 0;
  for (const s of st.player.inv) if (s.id === id) n += s.n;
  if (st.player.melee?.id === id) n += 1;
  if (st.player.ranged?.id === id) n += 1;
  return n;
}

export function hasItem(st: RunState, id: string): boolean {
  return countItem(st, id) > 0;
}

/** Añade al inventario; devuelve false si no cabe. */
export function addItem(st: RunState, stack: ItemStack): boolean {
  const d = itemDef(stack.id);
  if (d.type === 'ammo' && d.ammo) {
    st.player.ammo[d.ammo.type] += d.ammo.amount * stack.n;
    return true;
  }
  if (d.type === 'suit') {
    st.player.suit = true;
    return true;
  }
  const max = d.stack ?? 1;
  if (max > 1) {
    for (const s of st.player.inv) {
      if (s.id === stack.id && s.n < max && !s.cursed && !stack.cursed) {
        const add = Math.min(max - s.n, stack.n);
        s.n += add;
        stack = { ...stack, n: stack.n - add };
        if (stack.n <= 0) return true;
      }
    }
  }
  if (st.player.inv.length >= BAL.invSize) return false;
  st.player.inv.push({ ...stack });
  return true;
}

export function removeItem(st: RunState, id: string, n = 1): boolean {
  let left = n;
  for (let i = st.player.inv.length - 1; i >= 0 && left > 0; i--) {
    const s = st.player.inv[i];
    if (s.id !== id) continue;
    const take = Math.min(s.n, left);
    s.n -= take;
    left -= take;
    if (s.n <= 0) st.player.inv.splice(i, 1);
  }
  return left === 0;
}

export function isKnown(st: RunState, id: string): boolean {
  const d = itemDef(id);
  return !d.unknown || !!st.known[id];
}
