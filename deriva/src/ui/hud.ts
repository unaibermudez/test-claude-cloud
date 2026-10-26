/**
 * HUD diegético: constantes vitales con iconos, minimapa en vivo con reloj orbital, barra de acceso rápido,
 * registro de mensajes que se desvanece y aviso de interacción junto al personaje.
 */
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
import { drawMinimap } from '../render/minimap';
import { IMPLANT_SLOTS } from '../core/content';
import { knownItemName } from '../core/narrative';
import type { Tone } from '../core/events';

export interface LogLine { text: string; tone: Tone; turn: number; n: number; at: number }

export function trustTier(trust: number): string {
  return trust < 20 ? 'hostile' : trust < 40 ? 'wary' : trust < 60 ? 'neutral' : trust < 80 ? 'warm' : 'close';
}

export function orbitClock(turns: number): string {
  const s = Math.max(0, turns) * 2; // un turno = dos segundos de ficción (D19)
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

const STATUS_ICON: Record<string, string> = {
  stun: '✷', slow: '❄', rooted: '⌘', bleed: '✚', poison: '☣', blind: '◌', vulnerable: '⚠', shielded: '⛨', cloak: '◐',
  haste: '»', regen: '♻', radshield: '☢', rage: '✦', scan: '◎',
};

export interface HudHandlers { onQuick: (slot: number) => void; onSlot: (which: 'melee' | 'ranged' | 'active') => void }

export class Hud {
  el: HTMLElement;
  private vitals = h('div', { class: 'vitals' });
  private nav = h('div', { class: 'navcard' });
  private mini = h('canvas', { class: 'minimap', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  private agoraCv = h('canvas', { width: 40, height: 40, 'aria-hidden': 'true', class: 'agora-mini' }) as HTMLCanvasElement;
  private navText = h('div', { class: 'navtext' });
  private boss = h('div', { class: 'bossbar', style: 'display:none' });
  private hotbar = h('div', { class: 'hotbar' });
  private log = h('div', { class: 'log', 'aria-live': 'off' });
  private hint = h('div', { class: 'hint', style: 'display:none' });
  private prompt = h('div', { class: 'prompt', style: 'display:none' });
  subs = h('div', { class: 'subtitles' });
  private tut = h('div', { class: 'tutorial', style: 'display:none' });
  private speaking = h('div', { class: 'speaking', style: 'display:none' }, '🔊');
  lines: LogLine[] = [];
  bossId: number | null = null;
  glitch = true;
  handlers: HudHandlers | null = null;
  private miniKey = '';

  constructor() {
    this.nav.append(h('div', { class: 'minimap-wrap' }, this.mini), this.navText);
    this.el = h('div', { class: 'hud' }, this.vitals, this.nav, this.boss, this.hotbar, this.log, this.hint, this.prompt, this.subs, this.tut, this.speaking);
  }

  push(text: string, tone: Tone, turn: number): void {
    const last = this.lines[this.lines.length - 1];
    const at = performance.now();
    if (last && last.text === text && last.turn >= turn - 1) { last.n++; last.turn = turn; last.at = at; }
    else this.lines.push({ text, tone, turn, n: 1, at });
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
  }

  setHint(s: string | null): void {
    if (!s) { this.hint.style.display = 'none'; return; }
    this.hint.style.display = '';
    this.hint.textContent = s;
  }

  /** Aviso de interacción flotando sobre el personaje (coordenadas de pantalla en CSS px). */
  setPrompt(text: string | null, x = 0, y = 0): void {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = '';
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.style.left = `${Math.round(x)}px`;
    this.prompt.style.top = `${Math.round(y)}px`;
  }

  setSpeaking(on: boolean): void {
    this.speaking.style.display = on ? '' : 'none';
  }

  showTutorial(title: string, body: string): void {
    clear(this.tut);
    this.tut.append(h('div', { class: 'tt' }, `ⓘ ${title}`), h('div', {}, body), h('div', { class: 'faint', style: 'margin-top:4px;font-size:0.85em' }, t('ui.tut.dismiss')));
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

  /** Animación del patrón de ÁGORA y desvanecido del registro (cada fotograma). */
  drawAgora(st: RunState, now: number): void {
    const c = this.agoraCv.getContext('2d');
    if (c) drawAgora(c, 40, st.narrative.trust, now, !this.glitch);
    for (const el of Array.from(this.log.children) as HTMLElement[]) {
      const at = Number(el.dataset.at ?? now);
      const age = now - at;
      el.style.opacity = age < 9000 ? '1' : age < 12000 ? String(1 - (age - 9000) / 3000 * 0.75) : '0.25';
    }
  }

  private bar(cls: string, icon: string, label: string, v: number, max: number, low: boolean): HTMLElement {
    const pct = Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
    return h('div', { class: `bar ${cls}${low ? ' low' : ''}`, title: label, role: 'meter', 'aria-label': label, 'aria-valuenow': Math.ceil(v), 'aria-valuemax': max },
      h('span', { class: 'ico' }, icon),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('span', { class: 'num' }, `${Math.ceil(v)} / ${max}`)));
  }

  update(st: RunState): void {
    const p = getPlayer(st);
    const s = getStats(st);
    const pl = st.player;
    const m = st.map;
    const noiseAmt = this.glitch && pl.noise >= 60 ? (pl.noise - 60) / 400 : 0;

    // ---------------------------------------------------------- vitales
    clear(this.vitals);
    this.vitals.append(
      h('div', { class: 'name' }, h('span', {}, pl.name), h('span', { class: 'cls' }, t(`class.${pl.classId}.name`))),
      this.bar('hp', '♥', t('ui.hp'), p.hp, p.maxHp, p.hp / p.maxHp < 0.3),
      this.bar('o2', 'O₂', t('ui.o2'), pl.o2, s.maxO2, pl.o2 / s.maxO2 < 0.25),
      this.bar('en', '⚡', t('ui.energy'), pl.energy, s.maxEnergy, pl.energy < 8),
      this.bar('noise', '◉', t('ui.noise'), pl.noise, 100, pl.noise >= 70),
    );
    const chips: HTMLElement[] = [];
    if (pl.flashlight) chips.push(h('span', { class: 'chip on' }, `☀ ${t('ui.chip.light')}`));
    if (pl.sneak) chips.push(h('span', { class: 'chip on' }, `◍ ${t('ui.chip.sneak')}`));
    if (pl.suit) chips.push(h('span', { class: 'chip on' }, `⛑ ${t('ui.chip.suit')}`));
    for (const k of pl.keys) chips.push(h('span', { class: `chip key-${k}` }, `⚿ ${t(`key.${k}`)}`));
    for (const [k, v] of Object.entries(p.status)) {
      if (!v || v <= 0) continue;
      const bad = ['stun', 'slow', 'rooted', 'bleed', 'poison', 'blind', 'vulnerable'].includes(k);
      chips.push(h('span', { class: `chip${bad ? ' bad' : ' on'}` }, `${STATUS_ICON[k] ?? '•'} ${t(`ui.status.${k}`)} ${v}`));
    }
    const sec = m.sections[m.sec[p.y * m.w + p.x]];
    if (sec) {
      if (sec.pressure < 30 && m.zone !== 6) chips.push(h('span', { class: 'chip bad' }, `◌ ${t('ui.room.vacuum')}`));
      else if (sec.pressure < 70 && m.zone !== 6) chips.push(h('span', { class: 'chip bad' }, `◔ ${t('ui.room.lowpressure')}`));
      if (sec.radiation > 0) chips.push(h('span', { class: 'chip bad' }, `☢ ${t('ui.room.radiation')}`));
      if (sec.coolant) chips.push(h('span', { class: 'chip bad' }, `❄ ${t('ui.room.coolant')}`));
      if (sec.dark) chips.push(h('span', { class: 'chip' }, `◑ ${t('ui.room.dark')}`));
    }
    if (m.fire[p.y * m.w + p.x] > 0) chips.push(h('span', { class: 'chip bad' }, `🔥 ${t('ui.room.fire')}`));
    if (m.event) chips.push(h('span', { class: 'chip bad' }, `⚠ ${t(`ui.event.${m.event}`)}`));
    if (chips.length) this.vitals.append(h('div', { class: 'statusline' }, ...chips));

    // ---------------------------------------------------------- navegación: minimapa y reloj
    const cell = Math.max(2, Math.min(4, Math.floor(200 / m.w)));
    const key = `${st.turn}|${st.floorNo}|${p.x},${p.y}`;
    if (key !== this.miniKey) { this.miniKey = key; drawMinimap(st, this.mini, cell, true); }
    clear(this.navText);
    const decay = st.floorDecay;
    const stab = decay >= BAL.decay3 ? 3 : decay >= BAL.decay2 ? 2 : decay >= BAL.decay1 ? 1 : 0;
    const pips = h('span', { class: 'pips', title: `${t('ui.stability')}: ${t(`ui.stab.${stab}`)}` }, ...[0, 1, 2].map((i) => h('i', { class: i < stab ? 'bad' : '' })));
    this.navText.append(
      h('div', { class: 'zone' }, t(`zone.${m.zone}`), h('span', { class: 'floor' }, ` · ${m.boss ? t('zone.boss') : t('zone.floor', { f: m.floor })}`)),
      h('div', { class: 'row' },
        h('span', { class: `orbit${st.orbit < 1800 ? ' crit' : ''}`, title: t('ui.orbit.tip') }, `⟟ ${orbitClock(st.orbit)}`),
        pips),
      h('div', { class: 'row' }, this.agoraCv, h('span', { class: 'agora' }, `ÁGORA · ${t(`agora.trust.${trustTier(st.narrative.trust)}`)}`), h('span', { class: 'scrap' }, `⚙ ${pl.scrap}`)),
    );

    // ---------------------------------------------------------- jefe
    const boss = this.bossId !== null ? st.actors.find((a) => a.id === this.bossId && !a.dead) : null;
    if (boss) {
      clear(this.boss);
      const d = enemyDef(boss.def);
      const nPh = d.boss?.phases.length ?? 1;
      this.boss.append(
        h('div', { class: 'bname' }, t(`enemy.${boss.def}.name`)),
        h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(boss.hp / boss.maxHp) * 100}%` }),
          ...Array.from({ length: nPh - 1 }, (_, i) => h('i', { class: 'phase-mark', style: `left:${(d.boss!.phases[i + 1].hpPct) * 100}%` }))),
        h('div', { class: 'phase' }, `${t('ui.phase')} ${(boss.boss?.phase ?? 0) + 1}/${nPh}${boss.boss?.shield ? ` · ⛨ ${t('ui.shielded')}` : ''}`),
      );
      this.boss.style.display = '';
    } else { this.boss.style.display = 'none'; this.bossId = null; }

    // ---------------------------------------------------------- barra rápida
    clear(this.hotbar);
    const wslot = (which: 'melee' | 'ranged' | 'active', label: string, stack: { id: string } | null, extra: string, ready = true): HTMLElement =>
      h('button', { class: `hslot weapon clickable${ready ? '' : ' cd'}`, title: `${label}: ${stack ? name(st, stack.id) : t('ui.empty')}`, onclick: () => this.handlers?.onSlot(which) },
        stack ? img(iconURL(stack.id, st.appear[stack.id])) : h('span', { class: 'faint' }, '—'),
        h('span', { class: 'lbl' }, which === 'melee' ? '⚔' : which === 'ranged' ? '➶' : '◆'),
        extra ? h('span', { class: 'cnt' }, extra) : null);
    const ranged = pl.ranged ? itemDef(pl.ranged.id).weapon : null;
    let ammo = '';
    if (ranged?.ammo === 'energy') ammo = `⚡${ranged.ammoPer ?? 1}`;
    else if (ranged?.ammo) ammo = String(pl.ammo[ranged.ammo]);
    this.hotbar.append(wslot('melee', t('ui.melee'), pl.melee, ''), wslot('ranged', t('ui.ranged'), pl.ranged, ammo));
    const act = IMPLANT_SLOTS.map((k) => pl.implants[k]).find((i) => i && itemDef(i.id).implant?.active);
    if (act) this.hotbar.append(wslot('active', t('ui.active'), act, pl.activeCd > 0 ? String(pl.activeCd) : '✓', pl.activeCd <= 0));
    this.hotbar.append(h('span', { class: 'sep' }));
    for (let i = 0; i < 6; i++) {
      const it = pl.inv[i];
      const known = it ? (!itemDef(it.id).unknown || !!st.known[it.id]) : true;
      this.hotbar.append(h('button', { class: `hslot clickable${it ? '' : ' empty'}`, title: it ? name(st, it.id) : '', onclick: () => it && this.handlers?.onQuick(i) },
        h('span', { class: 'key' }, String(i + 1)),
        it ? img(iconURL(it.id, st.appear[it.id], !known)) : null,
        it && it.n > 1 ? h('span', { class: 'cnt' }, `×${it.n}`) : null));
    }

    // ---------------------------------------------------------- registro
    clear(this.log);
    const show = this.lines.slice(-6);
    show.forEach((l, i) => {
      const txt = (i >= show.length - 2 ? glitchText(l.text, noiseAmt) : l.text) + (l.n > 1 ? ` ×${l.n}` : '');
      const el = h('div', { class: `m tone-${l.tone}` }, txt);
      el.dataset.at = String(l.at);
      this.log.append(el);
    });
  }
}
