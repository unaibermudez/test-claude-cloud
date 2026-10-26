/** HUD diegético de la partida: constantes vitales, ubicación, reloj orbital, equipo, registro de mensajes. */
import { h, clear, img } from './dom';
import { t } from '../i18n';
import type { RunState } from '../core/state';
import { getStats } from '../core/rules';
import { getPlayer } from '../core/actors';
import { itemDef } from '../data/items';
import { enemyDef } from '../data/enemies';
import { BAL } from '../data/balance';
import { iconURL } from '../render/icons';
import { drawAgora } from '../render/portraits';
import { IMPLANT_SLOTS } from '../core/content';
import { knownItemName } from '../core/narrative';
import type { Tone } from '../core/events';

export interface LogLine { text: string; tone: Tone; turn: number; n: number }

export function trustTier(trust: number): string {
  return trust < 20 ? 'hostile' : trust < 40 ? 'wary' : trust < 60 ? 'neutral' : trust < 80 ? 'warm' : 'close';
}

export function orbitClock(turns: number): string {
  const s = Math.max(0, turns);
  const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const GLITCH = '▓▒░#%&@¤§';

function glitchText(s: string, amount: number): string {
  if (amount <= 0) return s;
  let out = '';
  for (const ch of s) out += ch !== ' ' && Math.random() < amount ? GLITCH[Math.floor(Math.random() * GLITCH.length)] : ch;
  return out;
}

function name(st: RunState, id: string): string {
  const k = knownItemName(st, id);
  return k.startsWith('@') ? t(k.slice(1)) : k;
}

export class Hud {
  el: HTMLElement;
  private vitals = h('div', { class: 'vitals' });
  private loc = h('div', { class: 'location' });
  private agoraCv = h('canvas', { width: 44, height: 44, 'aria-hidden': 'true' });
  private locText = h('div');
  private boss = h('div', { class: 'bossbar', style: 'display:none' });
  private loadout = h('div', { class: 'loadout' });
  private log = h('div', { class: 'log', 'aria-live': 'off' });
  private hint = h('div', { class: 'hint', style: 'display:none' });
  subs = h('div', { class: 'subtitles' });
  private tut = h('div', { class: 'tutorial', style: 'display:none' });
  lines: LogLine[] = [];
  bossId: number | null = null;
  glitch = true;
  private lastTrust = -1;

  constructor() {
    this.loc.append(this.locText, this.agoraCv);
    this.el = h('div', { class: 'hud' }, this.vitals, this.loc, this.boss, this.loadout, this.log, this.hint, this.subs, this.tut);
  }

  push(text: string, tone: Tone, turn: number): void {
    const last = this.lines[this.lines.length - 1];
    if (last && last.text === text && last.turn >= turn - 1) { last.n++; last.turn = turn; }
    else this.lines.push({ text, tone, turn, n: 1 });
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
  }

  setHint(s: string | null): void {
    if (!s) { this.hint.style.display = 'none'; return; }
    this.hint.style.display = '';
    this.hint.textContent = s;
  }

  showTutorial(title: string, body: string): void {
    clear(this.tut);
    this.tut.append(h('div', { class: 'tt' }, title), h('div', {}, body), h('div', { class: 'faint', style: 'margin-top:4px;font-size:0.85em' }, t('ui.tut.dismiss')));
    this.tut.style.display = '';
  }

  hideTutorial(): boolean {
    if (this.tut.style.display === 'none') return false;
    this.tut.style.display = 'none';
    return true;
  }

  subtitle(text: string): void {
    const d = h('div', {}, `[${text}]`);
    this.subs.append(d);
    while (this.subs.children.length > 3) this.subs.firstChild!.remove();
    setTimeout(() => d.remove(), 2600);
  }

  drawAgora(st: RunState, now: number): void {
    const c = this.agoraCv.getContext('2d');
    if (!c) return;
    drawAgora(c, 44, st.narrative.trust, now, !this.glitch);
  }

  update(st: RunState): void {
    const p = getPlayer(st);
    const s = getStats(st);
    const pl = st.player;
    const noiseAmt = this.glitch && pl.noise >= 60 ? (pl.noise - 60) / 400 : 0;
    // constantes vitales
    clear(this.vitals);
    const bar = (cls: string, label: string, v: number, max: number, low: boolean): HTMLElement =>
      h('div', { class: `bar ${cls}${low ? ' low' : ''}`, title: label },
        h('span', {}, label),
        h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%` })),
        h('span', { class: 'num' }, `${Math.ceil(v)}/${max}`));
    this.vitals.append(
      h('div', { class: 'name' }, h('span', {}, pl.name), h('span', { class: 'dim' }, t(`class.${pl.classId}.name`))),
      bar('hp', t('ui.hp'), p.hp, p.maxHp, p.hp / p.maxHp < 0.3),
      bar('o2', t('ui.o2'), pl.o2, s.maxO2, pl.o2 / s.maxO2 < 0.25),
      bar('en', t('ui.energy'), pl.energy, s.maxEnergy, pl.energy < 8),
      bar('noise', t('ui.noise'), pl.noise, 100, pl.noise >= 70),
    );
    const chips: HTMLElement[] = [];
    chips.push(h('span', { class: `chip${pl.flashlight ? ' on' : ''}` }, t('ui.chip.light')));
    chips.push(h('span', { class: `chip${pl.sneak ? ' on' : ''}` }, t('ui.chip.sneak')));
    if (pl.suit) chips.push(h('span', { class: 'chip on' }, t('ui.chip.suit')));
    for (const k of pl.keys) chips.push(h('span', { class: `chip key-${k}` }, `⚿ ${t(`key.${k}`)}`));
    for (const [k, v] of Object.entries(p.status)) {
      if (!v || v <= 0) continue;
      const bad = ['stun', 'slow', 'rooted', 'bleed', 'poison', 'blind', 'vulnerable'].includes(k);
      chips.push(h('span', { class: `chip${bad ? ' bad' : ' on'}` }, `${t(`ui.status.${k}`)} ${v}`));
    }
    const m = st.map;
    const sec = m.sections[m.sec[p.y * m.w + p.x]];
    if (sec) {
      if (sec.pressure < 30 && m.zone !== 6) chips.push(h('span', { class: 'chip bad' }, t('ui.room.vacuum')));
      else if (sec.pressure < 70 && m.zone !== 6) chips.push(h('span', { class: 'chip bad' }, t('ui.room.lowpressure')));
      if (sec.radiation > 0) chips.push(h('span', { class: 'chip bad' }, t('ui.room.radiation')));
      if (sec.coolant) chips.push(h('span', { class: 'chip bad' }, t('ui.room.coolant')));
      if (sec.dark) chips.push(h('span', { class: 'chip' }, t('ui.room.dark')));
    }
    if (m.fire[p.y * m.w + p.x] > 0) chips.push(h('span', { class: 'chip bad' }, t('ui.room.fire')));
    if (m.event) chips.push(h('span', { class: 'chip bad' }, t(`ui.event.${m.event}`)));
    this.vitals.append(h('div', { class: 'statusline' }, ...chips));

    // ubicación y reloj orbital
    clear(this.locText);
    const zoneName = t(`zone.${m.zone}`);
    const floorTxt = m.boss ? t('zone.boss') : t('zone.floor', { f: m.floor });
    const decay = st.floorDecay;
    const stab = decay >= BAL.decay3 ? 3 : decay >= BAL.decay2 ? 2 : decay >= BAL.decay1 ? 1 : 0;
    this.locText.append(
      h('div', { class: 'zone' }, zoneName),
      h('div', { class: 'small' }, `${floorTxt} · ${t('ui.depth', { n: st.floorNo })}`),
      h('div', { class: `orbit${st.orbit < 1800 ? ' crit' : ''}`, title: t('ui.orbit.tip') }, `⟟ ${orbitClock(st.orbit)}`),
      h('div', { class: 'small' }, `${t('ui.stability')}: ${t(`ui.stab.${stab}`)}`),
      h('div', { class: 'small agora' }, `ÁGORA · ${t(`agora.trust.${trustTier(st.narrative.trust)}`)}`),
      h('div', { class: 'small' }, `⚙ ${pl.scrap}`),
    );

    // jefe
    const boss = this.bossId !== null ? st.actors.find((a) => a.id === this.bossId && !a.dead) : null;
    if (boss) {
      clear(this.boss);
      const d = enemyDef(boss.def);
      const nPh = d.boss?.phases.length ?? 1;
      this.boss.append(
        h('div', { class: 'bname' }, t(`enemy.${boss.def}.name`)),
        h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(boss.hp / boss.maxHp) * 100}%` })),
        h('div', { class: 'phase' }, `${t('ui.phase')} ${(boss.boss?.phase ?? 0) + 1}/${nPh}${boss.boss?.shield ? ` · ${t('ui.shielded')}` : ''}`),
      );
      this.boss.style.display = '';
    } else { this.boss.style.display = 'none'; this.bossId = null; }

    // equipo
    clear(this.loadout);
    const slot = (label: string, stack: { id: string } | null, extra: string): HTMLElement =>
      h('div', { class: 'slot' }, stack ? img(iconURL(stack.id, st.appear[stack.id])) : h('span', { class: 'faint' }, '—'),
        h('div', {}, h('div', { class: 'k' }, label), h('div', {}, stack ? name(st, stack.id) : t('ui.empty')), extra ? h('div', { class: 'k' }, extra) : null));
    const ranged = pl.ranged ? itemDef(pl.ranged.id).weapon : null;
    let ammo = '';
    if (ranged?.ammo === 'energy') ammo = `${t('ui.energy')} ${ranged.ammoPer ?? 1}/${t('ui.shot')}`;
    else if (ranged?.ammo) ammo = `${t(`ui.ammo.${ranged.ammo}`)}: ${pl.ammo[ranged.ammo]}`;
    this.loadout.append(slot(t('ui.melee'), pl.melee, ''), slot(t('ui.ranged'), pl.ranged, ammo));
    const act = IMPLANT_SLOTS.map((k) => pl.implants[k]).find((i) => i && itemDef(i.id).implant?.active);
    if (act) this.loadout.append(slot(t('ui.active'), act, pl.activeCd > 0 ? t('ui.cooldown', { n: pl.activeCd }) : t('ui.ready')));

    // registro
    clear(this.log);
    const show = this.lines.slice(-7);
    show.forEach((l, i) => {
      const txt = (i >= show.length - 2 ? glitchText(l.text, noiseAmt) : l.text) + (l.n > 1 ? ` ×${l.n}` : '');
      this.log.append(h('div', { class: `m tone-${l.tone}${l.turn < st.turn - 3 ? ' old' : ''}` }, txt));
    });
    if (this.lastTrust !== st.narrative.trust) this.lastTrust = st.narrative.trust;
  }
}
