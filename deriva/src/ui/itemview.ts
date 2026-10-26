/** Descripción detallada de objetos e implantes (estadísticas legibles). */
import { h, img } from './dom';
import { t } from '../i18n';
import type { RunState, ItemStack } from '../core/state';
import type { Mods } from '../core/content';
import { itemDef, hasItemDef } from '../data/items';
import { knownItemName } from '../core/narrative';
import { iconURL } from '../render/icons';

export function itemName(st: RunState | null, id: string): string {
  if (!st) return t(`item.${id}.name`);
  const k = knownItemName(st, id);
  return k.startsWith('@') ? t(k.slice(1)) : k;
}

export function isKnownItem(st: RunState, id: string): boolean {
  const d = itemDef(id);
  return !d.unknown || !!st.known[id];
}

const PCT = new Set(['o2Mult', 'energyMult', 'noiseMult', 'mentalMult', 'healMult', 'scrapMult', 'stealthKill']);
const BOOL = new Set(['nightVision', 'magboots', 'seeHidden', 'thermal']);
const INVERT = new Set(['o2Mult', 'energyMult', 'noiseMult', 'mentalMult', 'moveCost', 'migraine', 'noisePerTurn']);

/** Lista de modificadores con signo y color (verde = bueno para el jugador). */
export function modsView(m: Mods): HTMLElement {
  const out = h('div', { class: 'mods' });
  for (const [k, v] of Object.entries(m) as [keyof Mods, number | boolean][]) {
    if (v === undefined || v === 0) continue;
    let txt: string; let good: boolean;
    if (BOOL.has(k)) { txt = t(`ui.mod.${k}`); good = true; }
    else if (PCT.has(k)) {
      const pct = Math.round(((v as number) - 1) * 100);
      if (pct === 0) continue;
      txt = `${t(`ui.mod.${k}`)} ${pct > 0 ? '+' : ''}${pct}%`;
      good = INVERT.has(k) ? pct < 0 : pct > 0;
    } else if (k === 'migraine') { txt = t('ui.mod.migraine'); good = false; }
    else if (k === 'noisePerTurn') { txt = t('ui.mod.noisePerTurn'); good = false; }
    else if (k === 'radResist' || k === 'fireResist' || k === 'vacuum') { txt = `${t(`ui.mod.${k}`)} ${Math.round((v as number) * 100)}%`; good = true; }
    else if (k === 'regen') { txt = t('ui.mod.regen', { n: v as number }); good = true; }
    else if (k === 'energyRegen') { txt = t('ui.mod.energyRegen'); good = true; }
    else {
      const n = v as number;
      txt = `${t(`ui.mod.${k}`)} ${n > 0 ? '+' : ''}${n}`;
      good = INVERT.has(k) ? n < 0 : n > 0;
    }
    out.append(h('div', { class: good ? 'plus' : 'minus' }, `${good ? '▲' : '▼'} ${txt}`));
  }
  return out;
}

export function itemDetail(st: RunState | null, stack: ItemStack | { id: string; n?: number; cursed?: boolean }, extra?: HTMLElement): HTMLElement {
  if (!hasItemDef(stack.id)) return h('div', { class: 'detail' });
  const d = itemDef(stack.id);
  const known = !st || isKnownItem(st, stack.id);
  const box = h('div', { class: 'detail' });
  box.append(h('div', { class: 'title' }, img(iconURL(stack.id, st?.appear[stack.id], !known)), h('span', {}, itemName(st, stack.id) + ((stack.n ?? 1) > 1 ? ` ×${stack.n}` : ''))));
  box.append(h('div', { class: 'dim', style: 'font-size:0.85em' }, t(`ui.type.${d.type}`) + (d.implant ? ` · ${t(`slot.${d.implant.slot}`)}` : '')));
  if (!known) {
    box.append(h('p', {}, t('unknown.desc')));
    if (d.unknown === 'module') box.append(h('p', { class: 'warn' }, t('ui.item.module_risk')));
    if (extra) box.append(extra);
    return box;
  }
  box.append(h('p', {}, t(`item.${stack.id}.desc`)));
  const stats = h('div', { class: 'stats' });
  const row = (k: string, v: string | number): void => { stats.append(h('span', { class: 'k' }, t(k)), h('span', {}, String(v))); };
  if (d.weapon) {
    const w = d.weapon;
    row('ui.stat.damage', `${w.dmg[0]}–${w.dmg[1]}`);
    row('ui.stat.accuracy', `${w.acc}%`);
    if (w.kind === 'ranged') row('ui.stat.range', w.range);
    else if (w.range > 1) row('ui.stat.reach', w.range);
    if (w.ammo) row('ui.stat.ammo', w.ammo === 'energy' ? `${t('ui.energy')} ×${w.ammoPer ?? 1}` : `${t(`ui.ammo.${w.ammo}`)} ×${w.ammoPer ?? 1}`);
    row('ui.stat.noise', w.noise);
    if (w.cost && w.cost !== 100) row('ui.stat.speed', w.cost < 100 ? t('ui.stat.fast') : t('ui.stat.slow'));
    if (w.traits.length) row('ui.stat.traits', w.traits.map((x) => t(`ui.trait.${x}`)).join(', '));
  }
  if (d.consumable) {
    const c = d.consumable;
    if (c.heal) row('ui.stat.heal', `+${c.heal}`);
    if (c.o2) row('ui.o2', `+${c.o2}`);
    if (c.energy) row('ui.energy', `+${c.energy}`);
    if (c.noise) row('ui.noise', `${c.noise > 0 ? '+' : ''}${c.noise}`);
    if (c.status) row('ui.stat.effect', `${t(`ui.status.${c.status.id}`)} (${c.status.turns})`);
    if (c.cleanse) row('ui.stat.effect', t('ui.stat.cleanse'));
  }
  if (d.gadget) {
    const g = d.gadget;
    if (g.dmg) row('ui.stat.damage', `${g.dmg[0]}–${g.dmg[1]}`);
    if (g.radius) row('ui.stat.radius', g.radius);
    row('ui.stat.range', g.range);
  }
  if (d.ammo) row('ui.stat.amount', `${d.ammo.amount} ${t(`ui.ammo.${d.ammo.type}`)}`);
  if (d.implant) {
    const im = d.implant;
    row('ui.stat.rarity', '★'.repeat(im.rarity));
    if (im.active) row('ui.stat.active', `${t(`ui.active.${im.active}`)} (${im.activeCost ?? 10} ${t('ui.energy')})`);
    if (im.lete) row('ui.stat.lete', t('ui.yes'));
  }
  if (stack.cursed) box.append(h('p', { class: 'danger' }, t('ui.item.cursed')));
  box.append(stats);
  if (d.implant) box.append(modsView(d.implant.mods));
  if (d.price && st) box.append(h('div', { class: 'faint', style: 'font-size:0.8em;margin-top:6px' }, `${t('ui.stat.value')}: ${d.price} ⚙`));
  if (extra) box.append(extra);
  return box;
}
