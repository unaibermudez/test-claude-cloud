/** Paneles de partida: inventario, implantes, mapa, archivo, ayuda, pausa, ÁGORA, puertas. */
import { App, PANELS } from '../app/app';
import { h, clear, img, Nav, panelShell, type Panel } from './dom';
import { t } from '../i18n';
import { itemDetail, itemName, isKnownItem, modsView } from './itemview';
import { itemDef } from '../data/items';
import { LOGS } from '../data/logs';
import { IMPLANT_SLOTS, type ImplantSlot } from '../core/content';
import { TILE, type RunState } from '../core/state';
import { iconURL } from '../render/icons';
import { lockColor } from '../render/tiles';
import { drawAgora } from '../render/portraits';
import { getPlayer } from '../core/actors';
import { getStats, countItem } from '../core/rules';
import { getVision } from '../core/vision';
import { trustTier } from './hud';
import type { CommandEvent } from '../input/input';

function closeOn(e: CommandEvent, ids: string[] = []): boolean {
  return e.cmd === 'cancel' || e.cmd === 'pause' || ids.includes(e.cmd);
}

// ------------------------------------------------------------------ inventario

PANELS.inventory = (app: App, arg?: unknown): Panel => {
  const st = app.run!;
  const filter = (arg as { filter?: string } | undefined)?.filter;
  const close = (): void => app.pop(p);
  const shell = panelShell(t(filter === 'gadget' ? 'ui.inv.throw_title' : 'ui.inv.title'), { cls: 'wide', onClose: close });
  const list = h('div', { class: 'list' });
  const detail = h('div');
  const nav = new Nav();
  type Entry = { kind: 'inv'; slot: number } | { kind: 'eq'; which: 'melee' | 'ranged' };
  let entries: Entry[] = [];
  const render = (): void => {
    clear(list);
    entries = [];
    const btns: HTMLElement[] = [];
    if (!filter) {
      for (const which of ['melee', 'ranged'] as const) {
        const s = st.player[which];
        if (!s) continue;
        entries.push({ kind: 'eq', which });
        btns.push(h('button', { class: `item${s.cursed ? ' cursed' : ''}` }, img(iconURL(s.id, st.appear[s.id])), h('span', { class: 'grow' }, itemName(st, s.id)), h('span', { class: 'r' }, t(`ui.${which}`))));
      }
    }
    st.player.inv.forEach((s, slot) => {
      const d = itemDef(s.id);
      if (filter && d.type !== filter) return;
      entries.push({ kind: 'inv', slot });
      const known = isKnownItem(st, s.id);
      btns.push(h('button', { class: `item${known ? '' : ' known-no'}` }, img(iconURL(s.id, st.appear[s.id], !known)),
        h('span', { class: 'grow' }, itemName(st, s.id)), h('span', { class: 'r' }, `${s.n > 1 ? `×${s.n} ` : ''}${slot < 10 ? `[${(slot + 1) % 10}]` : ''}`)));
    });
    if (!btns.length) list.append(h('p', { class: 'dim' }, t('ui.inv.empty')));
    btns.forEach((b, i) => { b.addEventListener('click', () => { nav.i = i; nav.mark(); show(); primary(); }); list.append(b); });
    nav.set(btns);
    show();
  };
  const actionsFor = (en: Entry): { label: string; fn: () => void; key?: string }[] => {
    const out: { label: string; fn: () => void; key?: string }[] = [];
    if (en.kind === 'eq') {
      out.push({ label: t('ui.act.unequip'), fn: () => app.act({ t: 'unequip', which: en.which }) });
      return out;
    }
    const s = st.player.inv[en.slot];
    if (!s) return out;
    const d = itemDef(s.id);
    if (d.type === 'weapon') out.push({ label: t('ui.act.equip'), fn: () => app.act({ t: 'equip', slot: en.slot }) });
    else if (d.type === 'gadget') out.push({ label: t('ui.act.throw'), fn: () => { app.pop(p); app.startTargeting('throw', en.slot); }, key: 'throw' });
    else if (d.type === 'implant') out.push({ label: t('ui.act.install', { n: countItem(st, 'kit_implante') }), fn: () => app.act({ t: 'install', slot: en.slot }) });
    else if (d.type === 'consumable' || d.type === 'kit' || d.type === 'suit') out.push({ label: t('ui.act.use'), fn: () => app.act({ t: 'use', slot: en.slot }) });
    if (d.type !== 'quest') out.push({ label: t('ui.act.drop'), fn: () => app.act({ t: 'drop', slot: en.slot }), key: 'drop' });
    return out;
  };
  const show = (): void => {
    clear(detail);
    const en = entries[nav.i];
    if (!en) return;
    const s = en.kind === 'eq' ? st.player[en.which]! : st.player.inv[en.slot];
    if (!s) return;
    const acts = h('div', { class: 'actions' }, ...actionsFor(en).map((a) => h('button', { class: 'btn', onclick: () => { a.fn(); afterAct(); } }, a.label)));
    detail.append(itemDetail(st, s, acts));
  };
  const afterAct = (): void => { if (app.top() === p) render(); };
  const primary = (): void => {
    const en = entries[nav.i];
    if (!en) return;
    const a = actionsFor(en)[0];
    if (a) { a.fn(); afterAct(); }
  };
  nav.onSelect = () => show();
  const s = getStats(st);
  const ammo = st.player.ammo;
  shell.body.append(h('div', { class: 'cols' }, h('div', {}, h('div', { class: 'dim', style: 'margin-bottom:6px;font-size:0.85em' },
    `${t('ui.inv.slots', { n: st.player.inv.length, max: 14 })} · ⚙ ${st.player.scrap} · ${t('ui.ammo.balas')} ${ammo.balas} · ${t('ui.ammo.cartuchos')} ${ammo.cartuchos} · ${t('ui.ammo.clavos')} ${ammo.clavos} · ${t('ui.ammo.virotes')} ${ammo.virotes}`), list), detail));
  shell.footer.append(h('span', {}, t('ui.inv.footer')));
  void s;
  render();
  const p: Panel = {
    el: shell.root,
    refresh: render,
    onCommand: (e) => {
      if (closeOn(e, filter ? ['throw'] : ['inventory'])) { close(); return true; }
      if (e.cmd === 'confirm' || e.cmd === 'interact') { primary(); return true; }
      if (e.cmd === 'drop') { const en = entries[nav.i]; if (en?.kind === 'inv') { app.act({ t: 'drop', slot: en.slot }); afterAct(); } return true; }
      if (e.cmd === 'throw') { const en = entries[nav.i]; if (en?.kind === 'inv' && itemDef(st.player.inv[en.slot].id).type === 'gadget') { app.pop(p); app.startTargeting('throw', en.slot); } return true; }
      if (e.cmd === 'num' && e.num !== undefined) { const slot = e.num === 0 ? 9 : e.num - 1; const k = entries.findIndex((x) => x.kind === 'inv' && x.slot === slot); if (k >= 0) { nav.i = k; nav.mark(); show(); } return true; }
      return nav.handle(e) || true;
    },
  };
  return p;
};

// ------------------------------------------------------------------ implantes

PANELS.implants = (app: App): Panel => {
  const st = app.run!;
  const close = (): void => app.pop(p);
  const shell = panelShell(t('ui.imp.title'), { cls: 'wide', onClose: close });
  const nav = new Nav();
  const render = (): void => {
    clear(shell.body);
    const left = h('div', { class: 'list' });
    const right = h('div');
    const btns: HTMLElement[] = [];
    const slots: ImplantSlot[] = [...IMPLANT_SLOTS];
    slots.forEach((slot) => {
      const cur = st.player.implants[slot];
      const b = h('button', { class: `item${cur?.cursed ? ' cursed' : ''}` }, cur ? img(iconURL(cur.id)) : h('span', { style: 'width:24px' }, '·'),
        h('span', { class: 'grow' }, `${t(`slot.${slot}`)}: ${cur ? t(`item.${cur.id}.name`) : t('ui.empty')}`));
      btns.push(b);
      left.append(b);
    });
    const kits = countItem(st, 'kit_implante');
    const inInv = st.player.inv.map((s, slot) => ({ s, slot })).filter(({ s }) => itemDef(s.id).type === 'implant');
    left.append(h('h3', { style: 'margin-top:10px' }, t('ui.imp.inventory', { n: kits })));
    if (!inInv.length) left.append(h('p', { class: 'dim' }, t('ui.imp.none')));
    for (const { s, slot } of inInv) {
      const b = h('button', { class: 'item', onclick: () => { app.act({ t: 'install', slot }); render(); } }, img(iconURL(s.id, st.appear[s.id], !isKnownItem(st, s.id))),
        h('span', { class: 'grow' }, itemName(st, s.id)), h('span', { class: 'r' }, t(`slot.${itemDef(s.id).implant!.slot}`)));
      btns.push(b);
      left.append(b);
    }
    const show = (): void => {
      clear(right);
      const i = nav.i;
      if (i < 5) {
        const cur = st.player.implants[slots[i]];
        if (cur) right.append(itemDetail(st, { id: cur.id, cursed: cur.cursed }));
        else right.append(h('div', { class: 'detail' }, h('p', { class: 'dim' }, t('ui.imp.empty_slot', { slot: t(`slot.${slots[i]}`) }))));
      } else {
        const it = inInv[i - 5];
        if (it) right.append(itemDetail(st, it.s, h('p', { class: 'dim' }, t('ui.imp.install_hint', { n: kits }))));
      }
      const tot = getStats(st);
      right.append(h('div', { class: 'detail', style: 'margin-top:8px;min-height:0' }, h('div', { class: 'title' }, t('ui.imp.totals')),
        h('div', { class: 'stats' },
          h('span', { class: 'k' }, t('ui.hp')), h('span', {}, String(tot.maxHp)),
          h('span', { class: 'k' }, t('ui.o2')), h('span', {}, String(tot.maxO2)),
          h('span', { class: 'k' }, t('ui.energy')), h('span', {}, String(tot.maxEnergy)),
          h('span', { class: 'k' }, t('ui.mod.armor')), h('span', {}, String(tot.armor)),
          h('span', { class: 'k' }, t('ui.mod.evasion')), h('span', {}, `${tot.evasion}%`),
          h('span', { class: 'k' }, t('ui.mod.sight')), h('span', {}, String(tot.sight)),
          h('span', { class: 'k' }, t('ui.mod.hack')), h('span', {}, String(tot.hack)),
        )));
    };
    nav.onSelect = show;
    nav.set(btns);
    show();
    shell.body.append(h('div', { class: 'cols' }, left, right));
  };
  shell.footer.append(h('span', {}, t('ui.imp.footer')));
  render();
  void modsView;
  const p: Panel = { el: shell.root, refresh: render, onCommand: (e) => { if (closeOn(e, ['implants'])) { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ mapa

export function drawMinimap(st: RunState, cv: HTMLCanvasElement, cell: number): void {
  const m = st.map;
  cv.width = m.w * cell; cv.height = m.h * cell;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, cv.width, cv.height);
  const v = getVision(st);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!m.seen[i]) continue;
      const tt = m.tiles[i];
      let col = '';
      switch (tt) {
        case TILE.WALL: case TILE.CRACKED: col = '#4c5363'; break;
        case TILE.WINDOW: col = '#3a5a8a'; break;
        case TILE.DOOR: { const d = m.doors[i]; col = d?.sealed ? '#e8e2c8' : d?.lock ? lockColor(d.lock) : '#9aa3ad'; break; }
        case TILE.AIRLOCK: col = '#ffb347'; break;
        case TILE.BREACH: col = '#ff4b2b'; break;
        case TILE.VOID: col = ''; break;
        case TILE.GIRDER: col = '#3a3d44'; break;
        default: {
          const s = m.sections[m.sec[i]];
          col = s && s.pressure < 30 && m.zone !== 6 ? '#1a2a4a' : s?.radiation ? '#24341c' : '#22272f';
        }
      }
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x * cell, y * cell, cell, cell);
      if (m.fire[i] > 0) { c.fillStyle = '#ff7a1a'; c.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2); }
    }
  }
  const dot = (x: number, y: number, col: string, big = false): void => {
    c.fillStyle = col;
    const s = big ? cell : Math.max(2, cell - 2);
    c.fillRect(x * cell + (cell - s) / 2, y * cell + (cell - s) / 2, s, s);
  };
  for (const p of m.props) {
    if (!m.seen[p.y * m.w + p.x]) continue;
    const col = p.kind === 'exit' || p.kind === 'core' ? '#7dff9a' : p.kind === 'hullExit' ? '#ffb46e' : p.kind === 'o2station' && !p.used ? '#5fb8e8' : p.kind === 'powernode' && !p.used ? '#f2d45c'
      : p.kind === 'terminal' ? '#9fe8ff' : p.kind === 'vending' || p.kind === 'merchant' ? '#ffd166' : p.kind === 'workbench' || p.kind === 'autosurgeon' ? '#c9a2ff'
        : p.kind === 'keycard' && !p.used ? lockColor(p.key) : p.kind === 'log' && !p.used ? '#f0e0b8' : (p.kind === 'npc' || p.kind === 'event') && !p.used ? '#ffd166' : '';
    if (col) dot(p.x, p.y, col, p.kind === 'exit' || p.kind === 'core');
  }
  for (const a of st.actors) {
    if (a.dead || a.id === st.pid || !v.seenActors.has(a.id)) continue;
    dot(a.x, a.y, a.faction === 'enemy' ? '#ff5a5a' : '#7dff9a');
  }
  const pl = getPlayer(st);
  dot(pl.x, pl.y, '#ffffff', true);
}

PANELS.map = (app: App): Panel => {
  const st = app.run!;
  const close = (): void => app.pop(p);
  const shell = panelShell(`${t('ui.map.title')} · ${t(`zone.${st.map.zone}`)} · ${st.map.boss ? t('zone.boss') : t('zone.floor', { f: st.map.floor })}`, { cls: 'wide', onClose: close });
  const cv = h('canvas');
  const cell = Math.max(4, Math.min(12, Math.floor(Math.min((window.innerWidth * 0.9) / st.map.w, (window.innerHeight * 0.62) / st.map.h))));
  drawMinimap(st, cv, cell);
  const L = (col: string, k: string): HTMLElement => h('span', {}, h('i', { style: `background:${col}` }), t(k));
  shell.body.append(h('div', { class: 'mapwrap' }, cv), h('div', { class: 'legend' },
    L('#ffffff', 'ui.map.you'), L('#7dff9a', 'ui.map.exit'), L('#5fb8e8', 'ui.prop.o2station'), L('#f2d45c', 'ui.prop.powernode'), L('#9fe8ff', 'ui.prop.terminal'),
    L('#ffd166', 'ui.map.people'), L('#f0e0b8', 'ui.prop.log'), L('#ff5a5a', 'ui.map.enemy'), L('#1a2a4a', 'ui.room.vacuum'), L('#ffb347', 'ui.tile.11'),
    L(lockColor('amber'), 'ui.map.amber'), L(lockColor('cyan'), 'ui.map.cyan'), L(lockColor('circuit'), 'ui.map.circuit')));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (closeOn(e, ['map'])) { close(); return true; } return true; } };
  return p;
};

// ------------------------------------------------------------------ archivo (partida y Cápsula)

PANELS.archive = (app: App): Panel => {
  const st = app.run;
  const known = new Set<string>([...app.meta.logs, ...(st?.narrative.logsFound ?? [])]);
  const close = (): void => app.pop(p);
  const shell = panelShell(`${t('ui.archive.title')} · ${known.size}/${LOGS.length}`, { cls: 'wide', onClose: close });
  const list = h('div', { class: 'list' });
  const read = h('div', { class: 'detail readlog' });
  const nav = new Nav();
  const btns: HTMLElement[] = [];
  const ids: string[] = [];
  let zone = 0;
  for (const l of LOGS) {
    if (l.zone !== zone) { zone = l.zone; list.append(h('h3', { style: 'margin:8px 0 2px' }, t(`zone.${zone}`))); }
    const has = known.has(l.id);
    const b = h('button', { class: `item${has ? '' : ' off'}` }, h('span', { class: 'grow' }, has ? t(`log.${l.id}.title`) : '— — —'), h('span', { class: 'r' }, l.id));
    list.append(b);
    btns.push(b); ids.push(l.id);
  }
  const show = (): void => {
    clear(read);
    const id = ids[nav.i];
    const l = LOGS.find((x) => x.id === id)!;
    if (!known.has(id)) { read.append(h('p', { class: 'dim' }, t('ui.archive.missing'))); return; }
    read.append(h('div', { class: 'title' }, t(`log.${id}.title`)),
      h('div', { class: 'meta' }, `${t(`log.kind.${l.kind}`)} · ${t(`log.${id}.author`)} · ${t(`zone.${l.zone}`)}${l.truth ? ` · ${t('ui.archive.truth')}` : ''}`),
      h('div', {}, t(`log.${id}.body`)));
  };
  nav.onSelect = show;
  nav.set(btns);
  const firstKnown = ids.findIndex((id) => known.has(id));
  if (firstKnown >= 0) { nav.i = firstKnown; nav.mark(); }
  show();
  shell.body.append(h('div', { class: 'cols' }, h('div', { style: 'max-height:66vh;overflow:auto' }, list), read));
  const p: Panel = { el: shell.root, onCommand: (e) => { if (closeOn(e, ['archive'])) { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ ayuda

PANELS.help = (app: App): Panel => {
  const close = (): void => app.pop(p);
  const tabs = ['controls', 'rules', 'legend'];
  let tab = 0;
  const tabBar = h('div', { class: 'tabs' });
  const shell = panelShell(t('ui.help.title'), { cls: 'wide', tabs: tabBar, onClose: close });
  const k = (c: string): HTMLElement => h('kbd', {}, app.input.label(c));
  const render = (): void => {
    clear(tabBar);
    tabs.forEach((x, i) => tabBar.append(h('button', { class: `tab${i === tab ? ' on' : ''}`, onclick: () => { tab = i; render(); } }, t(`ui.help.${x}`))));
    clear(shell.body);
    if (tabs[tab] === 'controls') {
      const rows: [string, HTMLElement | string][] = [
        ['ui.help.move', h('span', {}, k('up'), ' ', k('left'), ' ', k('down'), ' ', k('right'), ' · ', k('upleft'), k('upright'), k('downleft'), k('downright'))],
        ['ui.help.attack', t('ui.help.attack_how')], ['ui.help.shove', t('ui.help.shove_how')],
        ['ui.help.wait', k('wait')], ['ui.help.interact', k('interact')], ['ui.help.fire', k('fire')], ['ui.help.throw', k('throw')],
        ['ui.help.pickup', k('pickup')], ['ui.help.sneak', k('sneak')], ['ui.help.light', k('light')], ['ui.help.inventory', k('inventory')],
        ['ui.help.implants', k('implants')], ['ui.help.map', k('map')], ['ui.help.archive', k('archive')], ['ui.help.agora', k('agora')],
        ['ui.help.active', k('active')], ['ui.help.rest', k('rest')], ['ui.help.look', k('look')], ['ui.help.quick', '1–0'],
        ['ui.help.mouse', t('ui.help.mouse_how')], ['ui.help.pad', t('ui.help.pad_how')], ['ui.help.pause', k('pause')],
      ];
      shell.body.append(h('div', { class: 'binds' }, ...rows.flatMap(([a, b]) => [h('span', {}, t(a)), h('span', {}, b)])));
    } else if (tabs[tab] === 'rules') {
      for (let i = 1; i <= 12; i++) shell.body.append(h('p', {}, t(`ui.rules.${i}`)));
    } else {
      const L = (col: string, key: string): HTMLElement => h('p', {}, h('span', { style: `display:inline-block;width:12px;height:12px;background:${col};margin-right:8px;vertical-align:middle` }), t(key));
      shell.body.append(L(lockColor('amber'), 'ui.legend.amber'), L(lockColor('cyan'), 'ui.legend.cyan'), L(lockColor('violet'), 'ui.legend.violet'), L(lockColor('circuit'), 'ui.legend.circuit'),
        L('#ff3030', 'ui.legend.telegraph'), L('#1a2a4a', 'ui.legend.vacuum'), L('#8cff5a', 'ui.legend.radiation'), L('#96dcff', 'ui.legend.coolant'), L('#96d25a', 'ui.legend.gas'),
        L('#ff7a1a', 'ui.legend.fire'), L('#ffd166', 'ui.legend.alert'), L('#ff4b4b', 'ui.legend.hunt'), L('#ff5a5a', 'ui.legend.sensed'));
    }
  };
  render();
  const p: Panel = {
    el: shell.root,
    onCommand: (e) => {
      if (closeOn(e, ['help'])) { close(); return true; }
      if (e.cmd === 'right' || e.cmd === 'next') { tab = (tab + 1) % tabs.length; render(); }
      if (e.cmd === 'left' || e.cmd === 'prev') { tab = (tab + tabs.length - 1) % tabs.length; render(); }
      return true;
    },
  };
  return p;
};

// ------------------------------------------------------------------ pausa

PANELS.pause = (app: App): Panel => {
  const close = (): void => app.pop(p);
  let confirm = false;
  const menu = h('div', { class: 'menu' });
  const nav = new Nav();
  const render = (): void => {
    clear(menu);
    const items = confirm
      ? [h('button', { class: 'mi', onclick: () => { app.pop(p); app.abandon(); } }, t('ui.pause.abandon_yes')), h('button', { class: 'mi', onclick: () => { confirm = false; render(); } }, t('ui.cancel'))]
      : [
        h('button', { class: 'mi', onclick: close }, t('ui.resume')),
        h('button', { class: 'mi', onclick: () => app.open('help') }, t('ui.help')),
        h('button', { class: 'mi', onclick: () => app.open('options') }, t('ui.title.options')),
        h('button', { class: 'mi', onclick: () => { app.pop(p); app.saveAndQuit(); } }, t('ui.pause.save_quit')),
        h('button', { class: 'mi', onclick: () => { confirm = true; render(); } }, t('ui.pause.abandon')),
      ];
    menu.append(...items);
    if (confirm) menu.prepend(h('p', { class: 'warn' }, t('ui.pause.abandon_warn')));
    nav.set(items, false);
  };
  render();
  const st = app.run!;
  const el = h('div', { class: 'overlay' }, h('div', { class: 'panel narrow' }, h('header', {}, h('h2', {}, t('ui.pause.title')), h('span', { class: 'dim' }, `${t(`mode.${st.opts.mode}.name`)} · ${st.seed}`)),
    h('div', { class: 'body' }, menu, h('p', { class: 'faint', style: 'margin-top:10px;font-size:0.85em' }, t('ui.pause.note')))));
  const p: Panel = { el, onCommand: (e) => { if (closeOn(e)) { if (confirm) { confirm = false; render(); } else close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ ÁGORA

PANELS.agora = (app: App): Panel => {
  const st = app.run!;
  const close = (): void => app.pop(p);
  const shell = panelShell('ÁGORA', { cls: 'narrow', onClose: close });
  const cv = h('canvas', { width: 160, height: 160, style: 'width:160px;height:160px;display:block;margin:0 auto 8px;border:1px solid var(--line)' }) as HTMLCanvasElement;
  const tier = trustTier(st.narrative.trust);
  const menu = h('div', { class: 'menu' });
  const nav = new Nav();
  const ask = (what: 'identify' | 'door' | 'map'): void => { app.act({ t: 'askAgora', what }); close(); };
  const help = st.narrative.agoraHelp;
  const items = [
    h('button', { class: 'mi', onclick: () => ask('identify'), disabled: help.identify > 0 }, `${t('ui.agora.identify')} ${st.narrative.trust < 40 ? `(${t('ui.agora.needs', { n: 40 })})` : ''}`),
    h('button', { class: 'mi', onclick: () => ask('door'), disabled: help.door > 0 }, `${t('ui.agora.door')} ${st.narrative.trust < 60 ? `(${t('ui.agora.needs', { n: 60 })})` : ''}`),
    h('button', { class: 'mi', onclick: () => ask('map'), disabled: help.map > 0 }, `${t('ui.agora.map')} ${st.narrative.trust < 60 ? `(${t('ui.agora.needs', { n: 60 })})` : ''}`),
    h('button', { class: 'mi', onclick: close }, t('ui.back')),
  ];
  menu.append(...items);
  nav.set(items);
  shell.body.append(cv, h('p', { class: 'agora', style: 'text-align:center' }, `${t('ui.agora.trust')}: ${st.narrative.trust} · ${t(`agora.trust.${tier}`)}`),
    h('p', { class: 'dim', style: 'text-align:center' }, t(`ui.agora.tier.${tier}`)), menu);
  if (st.opts.mode === 'pesadilla') shell.body.append(h('p', { class: 'warn' }, t('agora.silent')));
  const p = {
    el: shell.root,
    onCommand: (e: CommandEvent) => { if (closeOn(e, ['agora'])) { close(); return true; } return nav.handle(e) || true; },
    tick: (now: number) => { const c = cv.getContext('2d'); if (c) drawAgora(c, 160, st.narrative.trust, now, app.settings.reduceFlicker); },
  };
  return p;
};

// ------------------------------------------------------------------ puertas

PANELS.doorMenu = (app: App, arg?: unknown): Panel => {
  const st = app.run!;
  const doors = (arg as { x: number; y: number }[]) ?? [];
  const close = (): void => app.pop(p);
  const menu = h('div', { class: 'menu' });
  const nav = new Nav();
  const items: HTMLElement[] = [];
  const pl = getPlayer(st);
  const dirName = (x: number, y: number): string => {
    const dx = Math.sign(x - pl.x); const dy = Math.sign(y - pl.y);
    return t(`ui.dir.${dy < 0 ? 'n' : dy > 0 ? 's' : ''}${dx < 0 ? 'w' : dx > 0 ? 'e' : ''}`);
  };
  for (const d of doors) {
    const door = st.map.doors[d.y * st.map.w + d.x];
    if (!door) continue;
    const add = (op: 'open' | 'close' | 'seal' | 'unseal', label: string): void => {
      const b = h('button', { class: 'mi', onclick: () => { close(); app.act({ t: 'door', x: d.x, y: d.y, op }); } }, `${label} · ${dirName(d.x, d.y)}`);
      items.push(b);
    };
    if (door.broken) continue;
    if (door.sealed) add('unseal', t('ui.door.op.unseal'));
    else {
      if (door.open) add('close', t('ui.door.op.close'));
      else add('open', door.lock ? t('ui.door.op.open_locked', { k: t(`key.${door.lock}`) }) : t('ui.door.op.open'));
      if (!door.open) add('seal', t('ui.door.op.seal'));
    }
  }
  items.push(h('button', { class: 'mi', onclick: close }, t('ui.cancel')));
  menu.append(...items);
  nav.set(items);
  const el = h('div', { class: 'overlay clear' }, h('div', { class: 'panel narrow' }, h('header', {}, h('h2', {}, t('ui.door.title'))), h('div', { class: 'body' }, menu, h('p', { class: 'faint', style: 'font-size:0.85em' }, t('ui.door.note')))));
  const p: Panel = { el, onCommand: (e) => { if (closeOn(e)) { close(); return true; } return nav.handle(e) || true; } };
  return p;
};

// ------------------------------------------------------------------ elegir con qué interactuar

PANELS.interactMenu = (app: App, arg?: unknown): Panel => {
  const st = app.run!;
  const cands = (arg as { prop: { id: number; kind: string; npc?: string; label?: string }; dir: number }[]) ?? [];
  const close = (): void => app.pop(p);
  const menu = h('div', { class: 'menu' });
  const nav = new Nav();
  const DN = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const items: HTMLElement[] = cands.map((c) => {
    const nm = c.prop.kind === 'npc' && c.prop.npc ? t(`npc.${c.prop.npc}.name`) : c.prop.kind === 'decor' ? t(`ui.decor.${c.prop.label}`) : t(`ui.prop.${c.prop.kind}`);
    const where = c.dir >= 0 ? t(`ui.dir.${DN[c.dir]}`) : t('ui.here');
    return h('button', { class: 'mi', onclick: () => { close(); app.act(c.dir >= 0 ? { t: 'interact', dir: c.dir } : { t: 'interact' }); } }, `${nm} · ${where}`);
  });
  items.push(h('button', { class: 'mi', onclick: close }, t('ui.cancel')));
  menu.append(...items);
  nav.set(items);
  void st;
  const el = h('div', { class: 'overlay clear' }, h('div', { class: 'panel narrow' }, h('header', {}, h('h2', {}, t('ui.interact.title'))), h('div', { class: 'body' }, menu)));
  const p: Panel = {
    el,
    onCommand: (e) => {
      if (closeOn(e)) { close(); return true; }
      if (e.cmd === 'num' && e.num !== undefined && e.num >= 1 && e.num <= items.length) { items[e.num - 1].click(); return true; }
      return nav.handle(e) || true;
    },
  };
  return p;
};
